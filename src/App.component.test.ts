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
import { byLabel, byText, cleanup, click, fill, only, press, render } from "./lib/render";
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
import { SHORTCUT_HELP_LABEL } from "./lib/header";
import { CLOSE_WITHOUT_SAVING_LABEL } from "./lib/settings";
import { SHORTCUTS } from "./lib/shortcuts";
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

const TASK = taskView({
  id: "TASK-1",
  title: "最初の題",
  status: "In Progress",
  column: "inProgress",
  // Ordered explicitly: セル内の並び is ordinal 昇順 and a task without one sorts last (doc-7 §5), so
  // leaving these unset would put TASK at the end of the cell and disable 次のタスク.
  ordinal: 1000,
  references: ["https://example.test/1"],
});

/** A second task in the same cell as [`TASK`], so 別タスクを開く and 前後移動 have a destination. */
const NEIGHBOUR = taskView({
  id: "TASK-2",
  title: "隣の題",
  status: "In Progress",
  column: "inProgress",
  ordinal: 2000,
});

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
  /**
   * Open the first task and start an 編集セッション with an unsaved title.
   *
   * Two tasks in the same cell, so the routes that leave by *arriving* somewhere — 別タスクを開く and
   * 前後移動 — have a destination. Both carry `column: "inProgress"`, which is what makes them
   * neighbours: 前後移動 is movement within one cell (doc-8 §2.2), so two tasks in different columns
   * would leave the 次のタスク button disabled and the test asserting nothing.
   */
  async function withUnsavedTitle(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK, NEIGHBOUR])]);
    click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
    await settled();
    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");
    return host;
  }

  // doc-8 §6.3 names five routes out of an 編集セッション, and they do not share a callback: 閉じる is
  // `onclose`, キャンセル is `onconfirmDiscard`, 別タスクを開く and 前後移動 are `onselect`, and
  // 詳細配置の切替 is `onplacement`. Each is asserted separately because each is a place the shell's
  // one gate can be bypassed on its own — a single case over the close button would leave the other
  // three free to unmount the panel while every test stayed green.

  it("未保存のまま閉じると確認を経てから閉じる（onclose）", async () => {
    const host = await withUnsavedTitle();
    expect(confirmBand(host)).toBeNull();

    click(only(host, "button.close"));

    // 破棄前確認 (doc-8 §6.3): one band, one wording. The panel is still up — the shell holds the
    // exit rather than taking it.
    expect(confirmBand(host)).not.toBeNull();
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
  });

  it("キャンセルも同じ帯を通る（onconfirmDiscard）", async () => {
    const host = await withUnsavedTitle();

    // The one route the shell cannot carry out itself: ending the session belongs to the panel, so it
    // hands the shell a `proceed` instead. That makes it the route most easily given its own wording.
    click(byText(host, "button", "キャンセル"));

    expect(confirmBand(host)).not.toBeNull();
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");

    click(byText(host, ".band button", "破棄して続ける"));
    // The session ends and the panel stays open on the same task — キャンセル leaves the task, not the
    // panel, which is what tells it apart from 閉じる.
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
    expect(host.querySelector('.field input[type="text"]')).toBeNull();
  });

  it("別タスクを開く操作も同じ帯を通る（onselect）", async () => {
    const host = await withUnsavedTitle();

    click(byText(host, "button.card .title", "隣の題").closest("button.card")!);

    expect(confirmBand(host)).not.toBeNull();
    // Still on the first task: a selection change that has not been answered must not land.
    expect(host.querySelector('[aria-label="タスク詳細"] .field input[type="text"]')).not.toBeNull();

    click(byText(host, ".band button", "破棄して続ける"));
    await settled();
    expect(host.querySelector('[aria-label="タスク詳細"] h2')?.textContent).toBe("隣の題");
  });

  it("前後移動も同じ帯を通る（onselect）", async () => {
    const host = await withUnsavedTitle();

    // 前後移動 arrives at the same guard as any other selection change rather than carrying a second
    // one of its own (doc-8 §2.2) — which is only observable from here, since the button is the
    // panel's and the gate is the shell's.
    //
    // Found by label: TASK-72 made this an アイコンのみのボタン (doc-11 §2.4), so the figure carries no
    // text and `aria-label` is the only name it has.
    const next = byLabel<HTMLButtonElement>(host, "button.step", "次のタスクへ");
    expect(next.disabled).toBe(false);
    click(next);

    expect(confirmBand(host)).not.toBeNull();
  });

  it("詳細配置の切替も同じ帯を通る（onplacement）", async () => {
    const host = await withUnsavedTitle();

    // The switch is drawn beside 閉じる because both answer "この面をどうするか" (doc-8 §2.2), and the
    // 全面 case genuinely unmounts the grid's panel — so it loses input exactly like the others.
    const group = only(host, '[aria-label="詳細配置"]');
    const other = [...group.querySelectorAll<HTMLButtonElement>("button.switch")].find(
      (button) => button.getAttribute("aria-pressed") === "false",
    );
    if (other === undefined) throw new Error("every placement reads as the current one");
    click(other);

    expect(confirmBand(host)).not.toBeNull();
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

describe("モーダルの 2 つの出口が同じ閉じる要求へ集まる", () => {
  /**
   * Take one line of the menu the way the screen offers it: through the ☰, which is the header's only
   * control since TASK-66 folded the per-entry buttons away (doc-7 §2.1). Two presses rather than one,
   * and the first unmounts the line the second pressed — which is exactly the route the focus-return
   * depends on being handled.
   *
   * The ☰ is found by its `aria-label`: TASK-67 made it an アイコンのみのボタン (doc-11 §2.4), so it has no
   * text of its own to match on.
   */
  function chooseFromMenu(host: HTMLElement, label: string): void {
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', label));
  }

  async function openSettings(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(host, "設定");
    return host;
  }

  /**
   * 閉じたら開く前の操作へフォーカスを戻す (doc-7 §2.1), as the caller has to arrange it.
   *
   * `Modal.svelte` returns focus to whatever was active when it mounted, and `Modal.component.test.ts`
   * fixes that much — but what was active is the caller's doing, and on this route the control the user
   * pressed is a menu line the opening unmounts. So the shell focuses the ☰ first, and only a test that
   * runs the whole route can tell that step from its absence: without it every assertion above still
   * passes while focus lands on `body`.
   */
  function expectFocusBackOnMenu(host: HTMLElement): void {
    expect(document.activeElement).toBe(byLabel(host, "button.header-entry", "メニュー"));
  }

  it("Escape と Settings 自身の閉じるが、どちらも同じ 1 つの出口へ届く", async () => {
    // Asserted through the real caller rather than a snippet: what a snippet would prove is that the
    // layer answers Escape, and the contract is that `Modal`'s `onclose` and the child's own control
    // are the *same* request. Only the caller wires both, so only from here can one of them be
    // rewired without the test noticing.
    const byEscape = await openSettings();
    const dialog = only(byEscape, '[role="dialog"][aria-label="設定"]');
    press(dialog, "Escape");
    expect(byEscape.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byControl = await openSettings();
    expect(byControl.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
    // 変更せずに閉じる, the 下部操作行's own exit (TASK-74). Named from the constant the component prints,
    // so this test asks for the control by the same one word the screen does.
    click(byText(byControl, "footer button", CLOSE_WITHOUT_SAVING_LABEL));
    expect(byControl.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(byControl);
  });

  it("保存の発行中は、その 2 経路のどちらもモーダルを閉じない", async () => {
    // The same contract from the other side: while a 設定 save is unresolved, *neither* exit may take
    // the panel away. Leaving would drop the report of a write that is still going to land, under a
    // control named 変更せずに閉じる — and the failure branch would lose the draft it is meant to keep.
    // Both routes are held by one flag in the shell, which is why this is asserted through the caller
    // rather than in the form: only from here can Escape and the button be seen to answer to it.
    const hold = deferred<void>();
    answers.settingsSaveHold = hold;
    const host = await openSettings();

    // 変更あり: the draft has to differ from the file before 保存する will take a press at all.
    // The radios carry no `value` attribute (the form binds them by index), so the unchecked one is
    // picked off the list rather than named by a selector.
    const other = [...host.querySelectorAll<HTMLInputElement>('input[name="card-density"]')].find(
      (radio) => !radio.checked,
    );
    if (other === undefined) throw new Error("every カード情報量 is already checked");
    click(other);
    click(byText(host, "footer button", "保存する"));
    await settled();
    expect(madeTo("settings_save")).toHaveLength(1);

    click(byText(host, "footer button", CLOSE_WITHOUT_SAVING_LABEL));
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();

    press(only(host, '[role="dialog"][aria-label="設定"]'), "Escape");
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();

    // Once the write lands, 保存する's own close goes through — the modal was held, not stuck.
    hold.resolve();
    await settled();
    expect(host.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(host);
  });

  it("プロジェクト登録も同じ 2 経路で閉じる", async () => {
    const byEscape = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(byEscape, "プロジェクトを登録");
    press(only(byEscape, '[role="dialog"][aria-label="プロジェクトを登録"]'), "Escape");
    expect(byEscape.querySelector('[aria-label="プロジェクトを登録"]')).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byControl = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(byControl, "プロジェクトを登録");
    click(byText(byControl, "button", "閉じる"));
    expect(byControl.querySelector('[aria-label="プロジェクトを登録"]')).toBeNull();
    expectFocusBackOnMenu(byControl);
  });

  /**
   * The 割り当て一覧 (doc-7 §2.1) moved out of the menu and into a モーダル of its own (TASK-67), so the
   * check names where it went: it is the modal that holds the table now, and the menu that does not.
   * A test that only pressed the line and looked for a dialog would pass with the table still folded
   * into the menu underneath — which is the shape this change was made to end.
   */
  it("キーボード操作の一覧はメニューではなくモーダルが持ち、同じ 2 経路で閉じる", async () => {
    const byEscape = await startWith([loaded("atlas", [TASK])]);

    click(byLabel(byEscape, "button.header-entry", "メニュー"));
    expect(only(byEscape, '[role="dialog"][aria-label="メニュー"]').querySelector("table")).toBeNull();
    click(byLabel(byEscape, '[role="dialog"][aria-label="メニュー"] button', SHORTCUT_HELP_LABEL));

    // Printed from `SHORTCUTS` (doc-7 §2.1 の 1 箇所), so a row missing here means a row missing there.
    const list = only(byEscape, '[role="dialog"][aria-label="キーボード操作の一覧"]');
    expect(list.querySelectorAll("tbody tr")).toHaveLength(SHORTCUTS.length);

    press(list, "Escape");
    expect(byEscape.querySelector('[aria-label="キーボード操作の一覧"]')).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byControl = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(byControl, SHORTCUT_HELP_LABEL);
    click(byText(byControl, '[aria-label="キーボード操作の一覧"] button', "閉じる"));
    expect(byControl.querySelector('[aria-label="キーボード操作の一覧"]')).toBeNull();
    expectFocusBackOnMenu(byControl);
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

  it("詳細を閉じると走っている履歴読取を取り消す", async () => {
    // 履歴読取の取消 (decision-19). This is the one route the backend's 引き継ぎ cannot cover: closing
    // starts no next read of that task, so nothing supersedes the one in flight and the screen's own
    // 取消 is what ends its `gh`. The 読取識別子 it names is the read it opened with.
    // The read has to still be in flight: a 取消 for a read that already answered would name a
    // registration the backend has removed, and this loader deliberately does not send one.
    answers.historyNeverAnswers = true;
    const host = await opened();
    const reads = madeTo("task_history_read");
    expect(reads).toHaveLength(1);

    click(only(host, "button.close"));
    await settled();

    expect(host.querySelector('[aria-label="タスク詳細"]')).toBeNull();
    // The third argument of `task_history_read` and the only argument of the cancel are the same
    // 読取識別子 — a cancel naming a different read would leave the running one going.
    expect(madeTo("task_history_cancel").map((call) => call.args)).toEqual([
      [reads[0].args[2]],
    ]);
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
