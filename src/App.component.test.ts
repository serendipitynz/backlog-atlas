/**
 * 画面横断契約 4 件 (TASK-91, TASK-119): 起動時の設定・workspace・監視の順序, タスク詳細・プロジェクト
 * 詳細の離脱と保存中状態, 再読込イベント後の選択・未保存・履歴の整合, 絞り込みが列を消しても画面が
 * 更新を受け付け続けること.
 *
 * All four are `App.svelte`'s, and none is a rule a pure function holds — they are about *when* the
 * shell calls the boundary, about what survives an unmount, and about what one screen's binding may
 * do to every later update. `src/lib/*.test.ts` fixes the rules; this fixes the sequence they are
 * called in.
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
import {
  documentView,
  entry,
  history,
  loaded,
  milestoneView,
  snapshot,
  taskView,
  unreadable,
} from "./lib/fixtures";
import { SHORTCUT_HELP_LABEL } from "./lib/header";
import { CLOSE_WITHOUT_SAVING_LABEL } from "./lib/settings";
import { MAC_KEYBOARD } from "./lib/platform";
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

/** One document in the 文書区画, so a card is there to select (doc-10 §5). */
const DOCUMENT = documentView({ id: "doc-1", title: "設計の題" });

/** One milestone in the マイルストーン区画, so a card is there to select (doc-10 §6). */
const MILESTONE = milestoneView({ id: "m-1", title: "節目の題" });

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

describe("モーダルの出口が同じ閉じる要求へ集まる", () => {
  /**
   * この層の × (doc-11 §7, TASK-76) — the one exit every モーダル has, whatever it holds. Found by its
   * announced name because it is an アイコンのみのボタン (doc-11 §2.4) with no text of its own; the
   * dialog is named so the lookup cannot drift onto some other 閉じる on the screen behind.
   */
  function closeOf(host: HTMLElement, label: string): HTMLButtonElement {
    return byLabel<HTMLButtonElement>(host, `[role="dialog"][aria-label="${label}"] button`, "閉じる");
  }

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

  it("Escape・×・変更せずに閉じる の 3 つが、どれも同じ 1 つの出口へ届く", async () => {
    // Asserted through the real caller rather than a snippet: what a snippet would prove is that the
    // layer answers Escape, and the contract is that `Modal`'s `onclose` — reached by Escape and by
    // the × the layer draws — and the child's own control are the *same* request. Only the caller
    // wires all three, so only from here can one of them be rewired without the test noticing.
    //
    // 設定 is the モーダル that has all three, which is what makes it the one to assert them on: the
    // × says only 閉じる, and the 下部操作行 says what becomes of the 下書き (doc-11 §7 の役割の別).
    const byEscape = await openSettings();
    const dialog = only(byEscape, '[role="dialog"][aria-label="設定"]');
    press(dialog, "Escape");
    expect(byEscape.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byCorner = await openSettings();
    click(closeOf(byCorner, "設定"));
    expect(byCorner.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(byCorner);

    cleanup();

    const byControl = await openSettings();
    expect(byControl.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
    // 変更せずに閉じる, the 下部操作行's own exit (TASK-74). Named from the constant the component prints,
    // so this test asks for the control by the same one word the screen does.
    click(byText(byControl, "footer button", CLOSE_WITHOUT_SAVING_LABEL));
    expect(byControl.querySelector('[aria-label="設定"]')).toBeNull();
    expectFocusBackOnMenu(byControl);
  });

  it("保存の発行中は、その 3 経路のどれもモーダルを閉じない", async () => {
    // The same contract from the other side: while a 設定 save is unresolved, *no* exit may take the
    // panel away. Leaving would drop the report of a write that is still going to land, under a
    // control named 変更せずに閉じる — and the failure branch would lose the draft it is meant to keep.
    // All three routes are held by one flag in the shell, which is why this is asserted through the
    // caller rather than in the form: only from here can Escape, the ×, and the button be seen to
    // answer to it. The × is the exit that also has to *say* why (doc-11 §5), which is fixed in
    // `Modal.component.test.ts`; what is fixed here is that the shell hands it the same one fact.
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

    const corner = closeOf(host, "設定");
    click(corner);
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
    expect(corner.getAttribute("aria-disabled")).toBe("true");

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
    // Two rather than three: 登録 writes to the ledger without leaving the layer, so this モーダル has
    // no second way out for a 下部操作行 to tell the first one from, and the × is its only pressable
    // exit (doc-11 §7). It does hold 未保存入力 all the same — what the × does with it is the block
    // below's subject (TASK-86).
    click(closeOf(byControl, "プロジェクトを登録"));
    expect(byControl.querySelector('[aria-label="プロジェクトを登録"]')).toBeNull();
    expectFocusBackOnMenu(byControl);
  });

  /**
   * The table that draws the 割り当て一覧 (doc-7 §2.1) moved out of the menu and into a モーダル of its own
   * (TASK-67) — the 一覧 itself stays in `shortcuts.ts` — so the check names where the table went: it is
   * the modal that holds it now, and the menu that does not.
   * A test that only pressed the line and looked for a dialog would pass with the table still folded
   * into the menu underneath — which is the shape this change was made to end.
   */
  it("キーボード操作一覧はメニューではなくモーダルが持ち、同じ 2 経路で閉じる", async () => {
    const byEscape = await startWith([loaded("atlas", [TASK])]);

    click(byLabel(byEscape, "button.header-entry", "メニュー"));
    expect(only(byEscape, '[role="dialog"][aria-label="メニュー"]').querySelector("table")).toBeNull();
    click(byLabel(byEscape, '[role="dialog"][aria-label="メニュー"] button', SHORTCUT_HELP_LABEL));

    // The layer is named by the same word as the line that opened it (TASK-130), so the query uses the
    // constant: a modal renamed away from its own menu line stops being findable here. What the word
    // itself is, is pinned in `header.test.ts` — it came from the user and nothing derives it.
    const list = only(byEscape, `[role="dialog"][aria-label="${SHORTCUT_HELP_LABEL}"]`);
    // Printed from `SHORTCUTS` (doc-7 §2.1 の 1 箇所), so a row missing here means a row missing there.
    expect(list.querySelectorAll("tbody tr")).toHaveLength(SHORTCUTS.length);
    expect(list.querySelector("h2")?.textContent).toBe(SHORTCUT_HELP_LABEL);

    press(list, "Escape");
    expect(byEscape.querySelector(`[aria-label="${SHORTCUT_HELP_LABEL}"]`)).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byControl = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(byControl, SHORTCUT_HELP_LABEL);
    click(closeOf(byControl, SHORTCUT_HELP_LABEL));
    expect(byControl.querySelector(`[aria-label="${SHORTCUT_HELP_LABEL}"]`)).toBeNull();
    expectFocusBackOnMenu(byControl);
  });
});

// -------------------------------------------------------------------------------------------------

describe("モーダルの閉じる要求と破棄前確認", () => {
  /**
   * この層の × と、メニューからの入り方。The same two helpers the block above uses — repeated rather
   * than hoisted because what each block fixes is a different contract, and a shared helper is how a
   * change to one silently rewrites the other's route.
   */
  function closeOf(host: HTMLElement, label: string): HTMLButtonElement {
    return byLabel<HTMLButtonElement>(host, `[role="dialog"][aria-label="${label}"] button`, "閉じる");
  }

  function chooseFromMenu(host: HTMLElement, label: string): void {
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', label));
  }

  function dialogOf(host: HTMLElement, label: string): HTMLElement {
    return only(host, `[role="dialog"][aria-label="${label}"]`);
  }

  /** The 破棄前確認 as the モーダル draws it (doc-11 §7), or `null` while none stands. */
  function confirmIn(host: HTMLElement, label: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"] .confirm`);
  }

  function answer(host: HTMLElement, label: string, text: string): void {
    const confirm = confirmIn(host, label);
    if (confirm === null) throw new Error(`no 破棄前確認 in ${label}`);
    click(byText(confirm, "button", text));
  }

  /**
   * Open 設定 and leave a 下書き in it: another カード情報量 than the one in force.
   *
   * The radios carry no `value` attribute (the form binds them by index), so the unchecked one is
   * picked off the list rather than named by a selector.
   */
  async function withSettingsDraft(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(host, "設定");
    const other = [...host.querySelectorAll<HTMLInputElement>('input[name="card-density"]')].find(
      (radio) => !radio.checked,
    );
    if (other === undefined) throw new Error("every カード情報量 is already checked");
    click(other);
    return host;
  }

  /**
   * Open プロジェクトを登録 and type a root into it — 未保存入力 with nothing issued (doc-3 §4.1).
   *
   * The field is asked for by the caption the screen prints beside it: the form draws three text
   * inputs and only one of them is the required root, so a positional query would keep passing while
   * naming a different field.
   */
  async function withRegisterInput(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(host, "プロジェクトを登録");
    const labelled = [
      ...dialogOf(host, "プロジェクトを登録").querySelectorAll<HTMLElement>("label"),
    ].find((label) => label.querySelector(".caption")?.textContent === "プロジェクトルート（必須）");
    if (labelled === undefined) throw new Error("no プロジェクトルート field");
    fill(only<HTMLInputElement>(labelled, 'input[type="text"]'), "/tmp/new");
    return host;
  }

  it("下書きの行方を語で述べていない 2 経路だけが確認を経る", async () => {
    // doc-11 §7 の役割の別, applied to the question rather than to the controls: the × says only
    // 閉じる and Escape says nothing at all, so what becomes of the 下書き is said by the 破棄前確認 —
    // while 変更せずに閉じる has already said it, and asking again would be asking what the label
    // answered. Each route is taken on its own mount, because the one that gets through leaves the
    // rest with no modal to press.
    for (const take of [
      (host: HTMLElement) => press(dialogOf(host, "設定"), "Escape"),
      (host: HTMLElement) => click(closeOf(host, "設定")),
    ]) {
      const host = await withSettingsDraft();
      take(host);

      expect(host.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
      expect(confirmIn(host, "設定")?.textContent).toContain("破棄");
      // Drawn inside the layer and *only* there: this モーダル covers the 上部帯 (doc-7 §2.1), so an ①
      // raised here would stand where it cannot be read until the thing it is asking about is gone.
      expect(confirmBand(host)).toBeNull();

      cleanup();
    }

    const byWording = await withSettingsDraft();
    click(byText(byWording, "footer button", CLOSE_WITHOUT_SAVING_LABEL));

    // Closed on one press, with the draft dropped — which is what its own label said would happen.
    expect(byWording.querySelector('[aria-label="設定"]')).toBeNull();
    expect(confirmBand(byWording)).toBeNull();
    expect(madeTo("settings_save")).toHaveLength(0);
  });

  it("破棄して閉じると閉じ、編集に戻ると下書きも残る", async () => {
    const kept = await withSettingsDraft();
    const chosen = only<HTMLInputElement>(kept, 'input[name="card-density"]:checked');
    press(dialogOf(kept, "設定"), "Escape");
    answer(kept, "設定", "編集に戻る");

    expect(confirmIn(kept, "設定")).toBeNull();
    expect(kept.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
    // The point of asking: the draft is still the one the user had, not the file's value read back.
    expect(only<HTMLInputElement>(kept, 'input[name="card-density"]:checked')).toBe(chosen);
    // Nothing was written on the way — 破棄前確認 asks about losing the draft, not about storing it.
    expect(madeTo("settings_save")).toHaveLength(0);

    cleanup();

    const discarded = await withSettingsDraft();
    press(dialogOf(discarded, "設定"), "Escape");
    answer(discarded, "設定", "破棄して閉じる");

    expect(discarded.querySelector('[aria-label="設定"]')).toBeNull();
    expect(madeTo("settings_save")).toHaveLength(0);
  });

  it("変更が無ければ確認せずに閉じ、保存が landed したときも確認を通さない", async () => {
    // The two cases that must *not* ask. The first has nothing to lose; the second wrote the draft,
    // so a question saying「このまま進むと破棄されます」would be false.
    //
    // What this fixes is the outcome, not the wiring: routing 保存する's close through the same
    // guard passes here too, because the shell's `settingsDirty` has caught up by the time the save
    // resolves (measured — the mutation fails nothing). 保存する leaves by a route of its own so that
    // the outcome does not rest on that ordering, which no test in this project can hold.
    const unchanged = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(unchanged, "設定");
    press(dialogOf(unchanged, "設定"), "Escape");
    expect(unchanged.querySelector('[aria-label="設定"]')).toBeNull();

    cleanup();

    const saved = await withSettingsDraft();
    click(byText(saved, "footer button", "保存する"));
    await settled();

    expect(madeTo("settings_save")).toHaveLength(1);
    expect(saved.querySelector('[aria-label="設定"]')).toBeNull();
  });

  it("プロジェクト登録の 2 経路も、入力があると確認を経る", async () => {
    // This モーダル has no 下部操作行 (doc-11 §7): 登録 writes without leaving the layer, so the two
    // routes that lose what has been typed are the × and Escape, and both are wired outside the form.
    for (const take of [
      (host: HTMLElement) => press(dialogOf(host, "プロジェクトを登録"), "Escape"),
      (host: HTMLElement) => click(closeOf(host, "プロジェクトを登録")),
    ]) {
      const host = await withRegisterInput();
      take(host);

      expect(host.querySelector('[role="dialog"][aria-label="プロジェクトを登録"]')).not.toBeNull();
      expect(confirmIn(host, "プロジェクトを登録")).not.toBeNull();
      expect(confirmBand(host)).toBeNull();

      answer(host, "プロジェクトを登録", "破棄して閉じる");
      expect(host.querySelector('[aria-label="プロジェクトを登録"]')).toBeNull();
      expect(madeTo("ledger_register")).toHaveLength(0);

      cleanup();
    }
  });

  it("画面が上げた確認をモーダルが引き取らない", async () => {
    // Where the question is drawn is decided by which layer is up, so a question raised by a route
    // that has nothing to do with these モーダル must not become one of theirs on the way in: its
    // 破棄して閉じる would carry out that other route *behind* the layer, and the モーダル would be left
    // standing over a screen that had changed underneath it.
    const host = await startWith([loaded("atlas", [TASK, NEIGHBOUR])]);
    click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
    await settled();
    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");
    click(byText(host, "button.card .title", "隣の題").closest("button.card")!);
    expect(confirmBand(host)).not.toBeNull();

    chooseFromMenu(host, "設定");

    // The question lapses rather than moving into the layer. Nothing was discarded by it lapsing.
    expect(confirmIn(host, "設定")).toBeNull();
    press(dialogOf(host, "設定"), "Escape");
    expect(confirmBand(host)).toBeNull();
    // And the route it was holding did not happen: the 編集セッション is still the first task's, which
    // opening the neighbour would have unmounted (`goToScreen` / `openTask` replace the panel).
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");
  });

  it("答えられなかった確認は、モーダルが閉じたあと帯として戻らない", async () => {
    // Every route that takes the layer away while a question of its own stands: the question was
    // about leaving *this* layer, so it goes with it. Left behind it would stand over the screen the
    // layer had covered — asking about input that is no longer anywhere, and offering a continuation
    // that has already happened.
    const saved = await withSettingsDraft();
    press(dialogOf(saved, "設定"), "Escape");
    expect(confirmIn(saved, "設定")).not.toBeNull();
    // 保存する is still pressable while the question stands: it is not one of the three exits the
    // question is in front of.
    click(byText(saved, "footer button", "保存する"));
    await settled();
    expect(saved.querySelector('[aria-label="設定"]')).toBeNull();
    expect(confirmBand(saved)).toBeNull();

    cleanup();

    // The other way through: the draft is put back to the file's values while the question stands, so
    // the next press passes the gate without either answer having been given.
    const reverted = await withSettingsDraft();
    const before = only<HTMLInputElement>(reverted, 'input[name="card-density"]:checked');
    press(dialogOf(reverted, "設定"), "Escape");
    expect(confirmIn(reverted, "設定")).not.toBeNull();
    const original = [...reverted.querySelectorAll<HTMLInputElement>('input[name="card-density"]')].find(
      (radio) => radio !== before,
    );
    if (original === undefined) throw new Error("no other カード情報量 to go back to");
    click(original);
    click(closeOf(reverted, "設定"));

    expect(reverted.querySelector('[aria-label="設定"]')).toBeNull();
    expect(confirmBand(reverted)).toBeNull();
  });

  it("登録の発行中は、確認より前に 2 経路とも断られる", async () => {
    // AC #3 の 登録中: the order matters. A 破棄前確認 raised while the registration is unresolved
    // would offer 破棄して閉じる for input the ledger is in the middle of taking — the request must not
    // be issued at all until the write answers, which is the same 事情 the 設定 holds one screen over
    // (doc-11 §7 の いま閉じられない).
    const hold = deferred<void>();
    answers.ledgerRegisterHold = hold;
    const host = await withRegisterInput();
    click(byText(host, ".register .row button", "登録"));
    await settled();
    expect(madeTo("ledger_register")).toHaveLength(1);

    press(dialogOf(host, "プロジェクトを登録"), "Escape");
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="プロジェクトを登録"]')).not.toBeNull();
    expect(confirmIn(host, "プロジェクトを登録")).toBeNull();

    const corner = closeOf(host, "プロジェクトを登録");
    click(corner);
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="プロジェクトを登録"]')).not.toBeNull();
    expect(confirmIn(host, "プロジェクトを登録")).toBeNull();
    // Withheld with a reason rather than quietly (doc-11 §5), as the 設定's × is.
    expect(corner.getAttribute("aria-disabled")).toBe("true");

    // Once it lands the form has emptied itself, so the same press now closes without asking: what
    // was typed is in the ledger, and there is nothing left to discard.
    hold.resolve();
    await settled();
    click(closeOf(host, "プロジェクトを登録"));
    expect(host.querySelector('[aria-label="プロジェクトを登録"]')).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------

/**
 * 画面が自分で上げる被せ層 (doc-10 §1, doc-11 §7 as TASK-117 revised it).
 *
 * Until TASK-117 every 被せ層 was one the fixed header opened, and the shell both raised it and knew
 * it was there. The 作成モーダル is the first one a *screen* raises, which splits that in two — the
 * layer belongs to プロジェクト詳細画面 (the control it hands focus back to exists only there), and the
 * two things that must still be the shell's are the ones fixed here.
 *
 * Neither is a rule a pure function holds: one is about a `window` listener staying quiet while a
 * component two levels down has a layer up, and the other is about what survives an unmount.
 */
describe("プロジェクト詳細が自分で上げる被せ層", () => {
  /**
   * The 共通修飾キー as a press carries it (doc-7 §2.1): Command on macOS, Control elsewhere, and
   * never both — `chordMatches` rejects a press holding the other platform's modifier as well. Read
   * from the same module the app reads it from, so the chord here is the one this run answers.
   */
  const MOD: KeyboardEventInit = MAC_KEYBOARD ? { metaKey: true } : { ctrlKey: true };

  /**
   * Press a control the way a pointer does, focus and all.
   *
   * jsdom's `click()` does not move focus, and what this describe fixes includes where focus goes
   * *back* to — so a press that left focus on `body` would make the layer capture `body` as its
   * opener and every assertion about the return vacuous.
   */
  function pressControl(control: HTMLElement): void {
    control.focus();
    click(control);
  }

  /** Reach the 文書区画's 作成の入口 in the 一覧見出し行 and open the layer (doc-10 §1). */
  async function openDocumentCreate(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK], undefined, [DOCUMENT])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();
    click(byText(host, "nav.sections button", "文書"));
    pressControl(byText(host, "button.create-entry", "新規文書"));
    return host;
  }

  /** The layer's own exit — the × `Modal.svelte` draws (doc-11 §7), named by what it announces. */
  function closeOfCreate(host: HTMLElement): HTMLButtonElement {
    return byLabel<HTMLButtonElement>(
      host,
      '[role="dialog"][aria-label="新規文書"] button',
      "閉じる",
    );
  }

  /** title 欄, told apart from the path 欄 beside it by the placeholder that one carries. */
  function titleField(host: HTMLElement): HTMLInputElement {
    return only<HTMLInputElement>(
      host,
      '[role="dialog"][aria-label="新規文書"] input[type="text"]:not([placeholder])',
    );
  }

  it("被せ層 は 1 枚だけ — 上がっている間はシェルの和音が届かない", async () => {
    const host = await openDocumentCreate();
    expect(host.querySelector('[role="dialog"][aria-label="新規文書"]')).not.toBeNull();

    // ⌘/Ctrl+, は 適用範囲 bothScreens なので、プロジェクト詳細でもシェルが答える和音である
    // (doc-7 §2.1)。層が上がっている間だけそれが止まる、というのがここで固定する契約で、
    // シェルは自分が上げていない層についてもそれを守らなければならない。
    press(document.body, ",", MOD);
    await settled();

    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).toBeNull();
    expect(host.querySelector('[role="dialog"][aria-label="新規文書"]')).not.toBeNull();

    // 層を閉じれば同じ和音が届く — 止めていたのが層の存在であって、画面ではないこと。
    click(closeOfCreate(host));
    await settled();
    press(document.body, ",", MOD);
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).not.toBeNull();
  });

  it("層の出口は入力を破棄し、画面の離脱確認はそれを数えない", async () => {
    const host = await openDocumentCreate();
    fill(titleField(host), "新しい設計");

    // 破棄前確認 は層の中に出る (doc-11 §7): この画面の 上部帯 は層が覆っているので、そこに置くと
    // 問いの対象が消えるまで読めない。文言は doc-8 §6.3 のもので、この 区画 が §5 に持っている
    // 2 経路 (「破棄して続行」「入力に戻る」) とは別である。
    click(closeOfCreate(host));
    const dialog = only(host, '[role="dialog"][aria-label="新規文書"]');
    click(byText(dialog, ".confirm button", "編集に戻る"));
    expect(titleField(host).value).toBe("新しい設計");

    click(closeOfCreate(host));
    click(byText(only(host, '[role="dialog"][aria-label="新規文書"]'), ".confirm button", "破棄して閉じる"));
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="新規文書"]')).toBeNull();

    // 破棄 が本当に起きている: 入口はいつも空のフォームを開く。
    pressControl(byText(host, "button.create-entry", "新規文書"));
    expect(titleField(host).value).toBe("");
    click(closeOfCreate(host));
    await settled();

    // そしてシェルの離脱確認はこれを数えない (`ProjectDetail` の `dirty`)。作成フォームの入力は
    // 層と一緒に消えるので、画面を離れられるどの瞬間にも残っていない — TASK-117 がその項を
    // `dirty` から外した根拠が、ここで観測できる形になっている。
    click(byText(host, "button", "← スイムレーン"));
    expect(confirmBand(host)).toBeNull();
    expect(host.querySelector("button.card")).not.toBeNull();
  });

  it("開いている間フォーカスは層の内側にあり、閉じたら 作成の入口 へ戻る", async () => {
    const host = await openDocumentCreate();

    // フォーカスを内側に留める (doc-7 §2.1). `Modal.svelte` puts it on its × as it mounts, and the
    // shell is told about this layer from an effect that runs afterwards — so anything the shell did
    // with focus on being told would land *outside* the layer it was just told about. That is the
    // failure this line catches, and it cannot be seen from either component alone.
    const dialog = only(host, '[role="dialog"][aria-label="新規文書"]');
    expect(dialog.contains(document.activeElement)).toBe(true);

    click(closeOfCreate(host));
    await settled();

    // 閉じたら開く前の操作へフォーカスを戻す (doc-7 §2.1). ここが `raiseModal` と分かれる一点で、
    // あちらは層を上げる前に ☰ へフォーカスを移す — 押されたメニュー行が層と一緒に消えるためで、
    // この層にその事情は無い。同じことをすると、どの 作成モーダル も ヘッダ へ閉じることになる。
    expect(document.activeElement).toBe(byText(host, "button.create-entry", "新規文書"));
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

  it("このプロジェクトのレーンへ で戻ると対象行に一時的な強調が付く", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();

    click(byText(host, "button", "このプロジェクトのレーンへ"));
    await settled();

    // 一時的な強調 (doc-7 §2.3): the return crosses two screens — the detail's exit hands the shell
    // a row, and the grid that mounts has to mark it, because a row already in view moves nothing
    // and the return would otherwise look like nothing happened. Only the mark's presence is
    // asserted: jsdom runs no animation, so the fade and its end are not observable here.
    expect(only(host, ".lane-head").classList.contains("landed")).toBe(true);
  });

  /**
   * 文書を読むだけでは、離脱の確認は立たない (doc-10 §5, TASK-116).
   *
   * The gate above is the shell's: leaving プロジェクト詳細 unmounts one component holding all four
   * 区画's input, so it asks whenever anything is unsaved. Until TASK-116 a card press opened a
   * 編集セッション, which put the 未保存 question one click away from merely reading a document.
   * This holds the other half of that change from the shell's side — 閲覧 has no input, so the exit
   * stays open — and it is the one assertion no pure function can make: 閲覧 is component state.
   */
  it("文書を選んで読むだけでは、スイムレーンへ戻る確認は立たない", async () => {
    const host = await startWith([loaded("atlas", [TASK], undefined, [DOCUMENT])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();
    click(byText(host, "nav.sections button", "文書"));

    click(only(host, "button.card"));
    await settled();

    // 閲覧 is what opened: the body is on screen, and the 編集セッション is not — its 出口
    //「編集を閉じる」 exists only while one is open.
    expect(only(host, "pre.read-body").textContent).toBe(DOCUMENT.body);
    expect(byText(host, ".view-head button", "編集")).not.toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "編集を閉じる")).toBe(
      false,
    );

    click(byText(host, "button", "← スイムレーン"));
    expect(confirmBand(host)).toBeNull();
    expect(host.querySelector("button.card")).not.toBeNull();
  });

  /**
   * マイルストーンを読むだけでは、離脱の確認は立たない (doc-10 §6, TASK-121).
   *
   * The 文書区画's half of this is above; this is the same contract on the 区画 that gained 閲覧
   * later. It is worth holding separately rather than trusting the symmetry, because the two 区画
   * reached it from opposite directions: the 文書区画's selection always opened a `DocSession`,
   * while this one opened 説明's input box with no session object at all — the 未保存入力 that used
   * to be one press away from a selection lived in `milestoneDescriptionDraft`, which no
   * `docSession !== null` test would have caught.
   *
   * Both halves assert through the shell's exit, which is the part no pure function reaches: 閲覧
   * is component state, and whether it holds input is only observable in what leaving asks.
   */
  it("マイルストーンを選んで読むだけでは、スイムレーンへ戻る確認は立たない", async () => {
    const host = await startWith([loaded("atlas", [TASK], undefined, [], [MILESTONE])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();
    click(byText(host, "nav.sections button", "マイルストーン"));

    click(only(host, "button.card"));
    await settled();

    // 閲覧 is what opened: the description is stated as text, and the 編集セッション is not open —
    // its input box and its 出口「編集を閉じる」 exist only while one is.
    expect(only(host, "pre.read-body").textContent).toBe(MILESTONE.description);
    expect(byText(host, ".view-head button", "編集")).not.toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "編集を閉じる")).toBe(
      false,
    );

    click(byText(host, "button", "← スイムレーン"));
    expect(confirmBand(host)).toBeNull();
    expect(host.querySelector("button.card")).not.toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------

/**
 * 行の表示・非表示がメニュー 1 か所から届くこと (TASK-131).
 *
 * TASK-131 left 行非表示 one control, and it is on the header rather than in the grid — so what no
 * pure function can hold is that the list survives the screen change. `header.ts` decides what the
 * lines say; the shell decides whether they are offered at all, and a row hidden here is one the grid
 * is no longer drawing on either screen.
 */
describe("行の表示・非表示はメニュー 1 か所が持つ", () => {
  /** The プロジェクト一覧's lines, in order, as the open menu draws them (doc-7 §2.1). */
  function projectLines(host: HTMLElement): { label: string; shown: boolean }[] {
    const menu = only(host, '[role="dialog"][aria-label="メニュー"]');
    return [...menu.querySelectorAll("button")]
      .filter((button) => button.getAttribute("aria-pressed") !== null)
      .map((button) => ({
        label: button.querySelector(".label")?.textContent ?? "",
        shown: button.getAttribute("aria-pressed") === "true",
      }));
  }

  function openMenu(host: HTMLElement): void {
    click(byLabel(host, "button.header-entry", "メニュー"));
  }

  /**
   * The two projects are deliberately of different kinds: one read (which has a name) and one
   * unreadable (which has none and falls back to its slug, doc-7 §6). A 読取不能行 is exactly the row
   * a user has reason to hide, so it must be listed like any other.
   */
  it("メニューのプロジェクト一覧は、画面が変わっても同じ行を同じ状態で出す", async () => {
    const host = await startWith([loaded("atlas", [TASK]), unreadable("kanri")]);

    openMenu(host);
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: true },
      { label: "kanri", shown: true },
    ]);

    // 表示切替行 を押すとその行がグリッドから消える (AC #2).
    click(byText(host, '[role="dialog"][aria-label="メニュー"] button', "Atlas"));
    await settled();
    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).toBeNull();

    // The remaining row is the way to the other screen, and the menu goes with it.
    click(only(host, '[title="kanri のプロジェクト詳細画面を開きます"]'));
    await settled();
    openMenu(host);
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: false },
      { label: "kanri", shown: true },
    ]);

    // 戻すのも同じ 1 か所から、グリッドが立っていなくてもできる。
    click(byText(host, '[role="dialog"][aria-label="メニュー"] button', "Atlas"));
    click(byText(host, "button", "← スイムレーン"));
    await settled();
    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).not.toBeNull();
  });

  /**
   * 行非表示 は画面の一時状態 (decision-13), and a reload is not the user asking for it back: the row
   * that arrives re-read is still the row they put away.
   */
  it("再読込は非表示のままの行を戻さない", async () => {
    const host = await startWith([loaded("atlas", [TASK]), unreadable("kanri")]);
    openMenu(host);
    click(byText(host, '[role="dialog"][aria-label="メニュー"] button', "Atlas"));
    await settled();

    emitReload({ slug: "atlas", load: loaded("atlas", [TASK]) });
    await settled();

    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).toBeNull();
    openMenu(host);
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: false },
      { label: "kanri", shown: true },
    ]);
  });
});

// -------------------------------------------------------------------------------------------------

/**
 * 絞り込みが列を消しても画面が更新を受け付け続けること (TASK-119).
 *
 * The bug this holds against was not a filtering bug: 未分類区画 は常設ではない (doc-7 §2.2), so a
 * value that leaves no task in it unmounts that column head, `bind:this` writes `null` into the
 * grid's keyed record, and the measuring `$effect` — re-run by that very write — threw. An exception
 * that leaves an `$effect` stops Svelte's flush, so *every later* update was lost: the window kept
 * its last paint while text entry and hover, which the browser answers by itself, went on working.
 *
 * It belongs here rather than beside the grid because that is the shape of it — the filter is the
 * shell's, the column is the grid's, and what breaks is neither of them but everything after. The
 * assertions are 「その後の操作が届くか」 for that reason, not the geometry the effect was measuring.
 */
describe("絞り込みが列を消しても画面は更新を受け付ける", () => {
  /** In a canonical column, and the only task carrying the priority the test selects. */
  const MAPPED = taskView({
    id: "TASK-1",
    title: "列に載る題",
    status: "In Progress",
    column: "inProgress",
    priority: "high",
    // A second facet to select, so the popover can be used twice over one already-missing column.
    labels: ["ui"],
    ordinal: 1000,
  });

  /**
   * 未分類区画 の 1 件 (doc-7 §2.2). Its status maps to no column and it carries no priority, so
   * selecting one empties the column and takes its head off screen — the condition the whole
   * contract turns on.
   */
  const UNMAPPED = taskView({
    id: "TASK-9",
    title: "未分類の題",
    status: "Blocked",
    column: null,
    ordinal: 2000,
  });

  /** The popover behind ＋ 絞り込み, opened. */
  async function popover(host: HTMLElement): Promise<HTMLElement> {
    click(byLabel(host, "button", "＋ 絞り込み"));
    await settled();
    return only<HTMLElement>(host, '[role="dialog"][aria-label="絞り込みを追加"]');
  }

  /** Press the popover's entry for one facet value, by the name it prints. */
  function pick(open: HTMLElement, name: string): void {
    const entries = [...open.querySelectorAll<HTMLElement>("button.value")].filter(
      (button) => button.querySelector(".name")?.textContent === name,
    );
    if (entries.length !== 1) {
      throw new Error(`expected exactly one 値 named "${name}", found ${entries.length}`);
    }
    click(entries[0]);
  }

  it("値を選んで未分類区画が消えても、Escape がポップオーバーを閉じる", async () => {
    const host = await startWith([loaded("atlas", [MAPPED, UNMAPPED])]);
    expect(host.querySelectorAll("button.card")).toHaveLength(2);
    expect(host.querySelector(".head.unmapped")).not.toBeNull();

    const open = await popover(host);
    pick(open, "high");
    await settled();

    // 1 回目の更新は通る — this is what made the report read as a freeze rather than as a crash.
    expect(host.querySelectorAll("button.card")).toHaveLength(1);
    expect(host.querySelector(".head.unmapped")).toBeNull();

    // …and so does the next one. Escape is answered by the popover, but what it takes to remove the
    // popover from the page is a flush, which is exactly what the thrown effect had stopped.
    press(open, "Escape");
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="絞り込みを追加"]')).toBeNull();
  });

  it("値を選んだ後も「閉じる」ボタンが効き、絞り込みを重ねられる", async () => {
    const host = await startWith([loaded("atlas", [MAPPED, UNMAPPED])]);

    const open = await popover(host);
    pick(open, "high");
    await settled();
    // A second selection through the same popover: the record was written once already, so this is
    // the press that would land on a screen whose flush had stopped.
    pick(open, "ui");
    await settled();
    expect(host.querySelectorAll("button.card")).toHaveLength(1);

    click(byText(open, "button.plain", "閉じる"));
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="絞り込みを追加"]')).toBeNull();
    // 絞り込みトークン (doc-7 §5.2) for both conditions, drawn after the popover went away — the
    // bar is `App.svelte`'s and the column was the grid's, so this is an update that crosses both.
    expect(host.querySelectorAll(".tokens .token:not(.baseline)")).toHaveLength(2);
  });

  it("未分類区画が戻ってくるときも同じ", async () => {
    const host = await startWith([loaded("atlas", [MAPPED, UNMAPPED])]);
    const open = await popover(host);
    pick(open, "high");
    await settled();
    expect(host.querySelector(".head.unmapped")).toBeNull();

    // Taking the condition back remounts the head, which writes the element back over the `null`.
    // The remount is the half a filter for `undefined` alone happened to survive, so a regression
    // would show only in the first two — this one is here so the pair is stated, not assumed.
    pick(open, "high");
    await settled();
    expect(host.querySelector(".head.unmapped")).not.toBeNull();
    expect(host.querySelectorAll("button.card")).toHaveLength(2);

    press(open, "Escape");
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="絞り込みを追加"]')).toBeNull();
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
    // thrown away — the バージョン不整合 is reported instead, and the user decides.
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
