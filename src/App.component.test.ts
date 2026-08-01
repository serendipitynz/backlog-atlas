/**
 * 画面横断契約 3 件 (TASK-91): 起動時の設定・workspace・監視の順序, タスク詳細・プロジェクト詳細の
 * 離脱と保存中状態, 再読込イベント後の選択・未保存・履歴の整合.
 *
 * All three are `App.svelte`'s, and none is a rule a pure function holds — they are about *when* the
 * shell calls the boundary and about what survives an unmount. `src/lib/*.test.ts` fixes the rules;
 * this fixes the sequence they are called in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";

// Every IPC call the shell makes goes through `./lib/commands`, so this one line is the whole
// boundary. `importOriginal` keeps `asCommandError`/`isCommandError` real — they interpret a
// rejection and are not calls (see `fake-boundary.ts`).
vi.mock("./lib/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/commands")>();
  const { commandFakes } = await import("./lib/fake-boundary");
  return { ...actual, ...commandFakes };
});

import App from "./App.svelte";
import { byText, cleanup, click, fill, only, render } from "./lib/render";
import {
  answers,
  deferred,
  emitReload,
  ledgerFor,
  madeTo,
  order,
  reset,
} from "./lib/fake-boundary";
import { entry, history, loaded, snapshot, taskView, unreadable } from "./lib/fixtures";
import type { ProjectLoad, UpdateResult } from "./lib/wire";

/**
 * Let the boundary calls awaited in `onMount` settle, applying what each one changed.
 *
 * A fixed number of microtask turns rather than `vi.waitFor`: the thing under test *is* the call
 * sequence, and a condition-based wait would let a missing call read as a slow one.
 */
async function settled(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await Promise.resolve();
    flushSync();
  }
}

/** Start the app over a workspace that read `loads`, with a ledger entry behind each row. */
async function startWith(loads: ProjectLoad[]): Promise<HTMLElement> {
  answers.loads = loads;
  answers.ledger = ledgerFor(
    ...loads.map((load) => entry(load.state === "loaded" ? load.project.slug : load.slug)),
  );
  const { host } = render(App, {});
  await settled();
  return host;
}

/** The 破棄前確認 band, or `null` while nothing is being asked (doc-8 §6.3). */
function confirmBand(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>('.band[data-band="confirm"]');
}

const TASK = taskView({ id: "TASK-1", title: "最初の題", references: ["https://example.test/1"] });

beforeEach(() => {
  reset();
  answers.history.set("atlas:TASK-1", history());
});
afterEach(cleanup);

// -------------------------------------------------------------------------------------------------

describe("起動時の設定・workspace・監視の順序", () => {
  it("購読と設定読取を workspace 読取より先に済ませる", async () => {
    await startWith([loaded("atlas", [TASK])]);

    const names = order();
    // Throws on an absent call rather than answering -1: every assertion below is a `<` between two
    // positions, and -1 sits before everything — so a call that was never made would satisfy the
    // ordering it is supposed to be constrained by.
    const at = (name: string): number => {
      const index = names.indexOf(name);
      if (index < 0) throw new Error(`${name} was never called; recorded: ${names.join(", ")}`);
      return index;
    };

    // Subscribed before the first read: a change landing during startup is otherwise missed, and
    // with no listener nothing but a manual re-read ever refreshes a row.
    expect(at("on_project_reloaded")).toBe(0);
    // 既定の保存区分 is the filter the first cards are drawn through, and 継続検出の可否 decides whether
    // the read starts any watch — so the settings cannot be applied after the read.
    expect(at("settings_read")).toBeLessThan(at("workspace_open"));
    // doc-8 §7 起動指定の解決順 starts at アプリ設定, so probing the editor first would report `$EDITOR`
    // as the editor in effect when a setting outranks it.
    expect(at("settings_read")).toBeLessThan(at("editor_probe"));
    // The ledger's entries are the rows; the workspace read fills them.
    expect(at("ledger_list")).toBeLessThan(at("workspace_open"));
    // 継続検出 is started per root the read reported, so it follows the read.
    expect(at("workspace_open")).toBeLessThan(at("project_watch_start"));
  });

  it("読み取れなかったルートにも監視を張る", async () => {
    await startWith([loaded("atlas", [TASK]), unreadable("gone")]);

    // Every key of the read's outcome map, the unreadable row included: its row stays in place and
    // can recover on a re-read (doc-7 §6), which the watch is what triggers.
    expect(madeTo("project_watch_start").map((call) => call.args[0])).toEqual(["atlas", "gone"]);
  });

  it("継続検出が切られていれば監視を始めない", async () => {
    answers.settings = {
      settings: { ...answers.settings.settings, watch_external_changes: false },
      status: { state: "stored" },
    };
    await startWith([loaded("atlas", [TASK])]);

    // The proof that 設定 was applied *before* the read and not after: a watch started and then
    // stopped would leave a call here.
    expect(madeTo("project_watch_start")).toEqual([]);
  });

  it("設定の読取が失敗しても既定値で起動を続ける", async () => {
    // What is fixed here is that a *rejection* is not fatal: the boundary already degrades a missing
    // or unreadable file to the defaults, so only an IPC failure reaches the shell, and leaving
    // 読み込み中 on screen over a workspace that reads perfectly well would be the worse answer.
    answers.settingsReadFails = true;
    const host = await startWith([loaded("atlas", [TASK])]);

    expect(order()).toContain("workspace_open");
    expect(host.querySelector("button.card")).not.toBeNull();
    expect(host.querySelector('.band[data-band="notice"]')?.textContent).toContain("既定値");
  });

  it("購読に失敗した行はどれも自動更新されないと帯が述べる", async () => {
    answers.subscribeFails = true;
    const host = await startWith([loaded("atlas", [TASK])]);

    // doc-9 §3.1: the state and its mark are the same however 継続検出 came to be stopped, and only
    // the reason differs — so a dead subscription has to reach every row, not just the ones whose
    // own watch failed.
    expect(host.querySelector('.band[data-band="unwatched"]')?.textContent).toContain("購読");
  });
});

// -------------------------------------------------------------------------------------------------

describe("タスク詳細の離脱と保存中状態", () => {
  /** Open the task and start an 編集セッション with an unsaved title. */
  async function withUnsavedTitle(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");
    return host;
  }

  it("未保存のまま閉じると確認を経てから閉じる", async () => {
    const host = await withUnsavedTitle();
    expect(confirmBand(host)).toBeNull();

    click(only(host, "button.close"));

    // 破棄前確認 (doc-8 §6.3): one band, one wording, for all five routes. The panel is still up —
    // the shell holds the exit rather than taking it.
    expect(confirmBand(host)).not.toBeNull();
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
  });

  it("編集に戻ると未保存入力がそのまま残る", async () => {
    const host = await withUnsavedTitle();
    click(only(host, "button.close"));
    click(byText(host, ".band button", "編集に戻る"));

    expect(confirmBand(host)).toBeNull();
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");
  });

  it("破棄して続けると詳細が閉じる", async () => {
    const host = await withUnsavedTitle();
    click(only(host, "button.close"));
    click(byText(host, ".band button", "破棄して続ける"));

    expect(confirmBand(host)).toBeNull();
    expect(host.querySelector('[aria-label="タスク詳細"]')).toBeNull();
    // The card is still there to be reopened: closing the panel drops the 編集セッション, not the row.
    expect(host.querySelector("button.card")).not.toBeNull();
  });

  it("未保存入力が無ければ確認せずに閉じる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    click(byText(host, "button.primary", "編集"));

    // A session with nothing typed in it holds no 未保存入力, and doc-8 §6.3 asks only about input
    // that would be lost.
    click(only(host, "button.close"));
    expect(confirmBand(host)).toBeNull();
    expect(host.querySelector('[aria-label="タスク詳細"]')).toBeNull();
  });

  it("保存中は保存を再発行できない", async () => {
    const host = await withUnsavedTitle();
    const pending = deferred<UpdateResult>();
    answers.update = () => pending.promise;

    const save = byText<HTMLButtonElement>(host, "button.primary", "保存");
    click(save);

    // 保存中 exists only while the call is in flight, which is why the answer is held open here. The
    // button states it and refuses a second press — a re-issue would run the CLI twice for one edit.
    const busy = only<HTMLButtonElement>(host, "button.primary");
    expect(busy.textContent?.trim()).toBe("保存中…");
    expect(busy.disabled).toBe(true);
    expect(madeTo("update_apply")).toHaveLength(1);

    pending.resolve({ state: "ran", outcome: { state: "succeeded" }, project: snapshot("atlas", [TASK]) });
    await settled();

    expect(madeTo("update_apply")).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------------------

describe("プロジェクト詳細の離脱", () => {
  /** Open プロジェクト詳細 and type into the 登録解除 confirmation, which is 未保存入力 (doc-8 §6.3). */
  async function withUnsavedProjectInput(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();
    fill(only<HTMLInputElement>(host, 'input[placeholder="atlas"]'), "atl");
    return host;
  }

  it("未保存のままスイムレーンへ戻ると確認を経る", async () => {
    const host = await withUnsavedProjectInput();

    click(byText(host, "button", "← スイムレーン"));

    // The same one gate as the task panel's: doc-8 §6.3 gives 破棄前確認 one wording, so neither
    // screen grows its own — and this screen holds all four 区画's input in one component, so
    // leaving it loses input the 区画切替 would have kept.
    expect(confirmBand(host)).not.toBeNull();
    expect(host.querySelector('input[placeholder="atlas"]')).not.toBeNull();
  });

  it("破棄して続けるとスイムレーンへ戻る", async () => {
    const host = await withUnsavedProjectInput();
    click(byText(host, "button", "← スイムレーン"));
    click(byText(host, ".band button", "破棄して続ける"));

    expect(host.querySelector('input[placeholder="atlas"]')).toBeNull();
    expect(host.querySelector("button.card")).not.toBeNull();
  });

  it("このプロジェクトのレーンへ も同じ確認を通る", async () => {
    const host = await withUnsavedProjectInput();

    // 出口 (doc-10 §2) has two doors, and both unmount the panel — so the gate cannot sit on only one.
    click(byText(host, "button", "このプロジェクトのレーンへ"));
    expect(confirmBand(host)).not.toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------

describe("再読込イベント後の選択・未保存・履歴の整合", () => {
  async function opened(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    return host;
  }

  it("再読込は開いているタスクの選択を保ち、内容を差し替える", async () => {
    const host = await opened();
    expect(host.querySelector('[aria-label="タスク詳細"] h2')?.textContent).toBe("最初の題");

    emitReload({
      slug: "atlas",
      load: loaded("atlas", [{ ...TASK, task: { ...TASK.task, title: "外から変わった題" } }]),
    });
    await settled();

    // The open task is held as (slug, source path) rather than as the `TaskView`, so a re-read
    // refreshes what is shown without dropping the selection.
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="タスク詳細"] h2')?.textContent).toBe("外から変わった題");
  });

  it("再読込は未保存入力を破棄しない", async () => {
    const host = await opened();
    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");

    emitReload({
      slug: "atlas",
      load: loaded("atlas", [{ ...TASK, task: { ...TASK.task, title: "外から変わった題" } }]),
    });
    await settled();

    // A reload is not one of doc-8 §6.3's five routes: nothing was asked for, so nothing may be
    // thrown away — the 版ずれ is reported instead, and the user decides.
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");
    expect(confirmBand(host)).toBeNull();
  });

  it("読取の入力が変わらない再読込では履歴を読み直さない", async () => {
    const host = await opened();
    expect(madeTo("task_history_read")).toHaveLength(1);

    emitReload({
      slug: "atlas",
      load: loaded("atlas", [{ ...TASK, task: { ...TASK.task, title: "題だけ変わった" } }]),
    });
    await settled();

    // 履歴読取のキーは読取の入力 (project_root・git_remote_present・references), which a title change
    // is not — so an unrelated reload must not re-fetch, and `historyKey` is the whole dependency.
    expect(madeTo("task_history_read")).toHaveLength(1);
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
  });

  it("References が変わった再読込では履歴を読み直す", async () => {
    await opened();
    expect(madeTo("task_history_read")).toHaveLength(1);

    emitReload({
      slug: "atlas",
      load: loaded("atlas", [
        { ...TASK, task: { ...TASK.task, references: ["https://example.test/2"] } },
      ]),
    });
    await settled();

    // References decide which Pull Requests are looked up, so an edit to them must not leave an
    // answer computed from the previous ones on screen.
    expect(madeTo("task_history_read")).toHaveLength(2);
  });
});
