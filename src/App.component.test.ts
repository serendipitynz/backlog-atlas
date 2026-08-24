/**
 * 画面横断契約 (TASK-91, TASK-119): 起動時の設定・workspace・監視の順序, タスク詳細・プロジェクト
 * 詳細の離脱と保存中状態, 再読込イベント後の選択・未保存・履歴の整合, 絞り込みが列を消しても画面が
 * 更新を受け付け続けること, 行の表示・非表示をメニュー 1 か所が持つこと, 並び順の 2 人の書き手.
 *
 * All of them are `App.svelte`'s, and none is a rule a pure function holds — they are about *when* the
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
import { BODY_LINK_CLASS } from "./lib/markdown";
import { CONFIRMED_CLI_VERSION } from "./lib/confirmed-version";
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
import { shortcutHelpLabel, showAllProjectsLabel } from "./lib/header";
import { closeWithoutSavingLabel, saveLabel } from "./lib/settings";
import { MAC_KEYBOARD } from "./lib/platform";
import { shortcuts } from "./lib/shortcuts";
import { msg } from "./lib/messages";
import type { ProjectLoad, UpdateResult } from "./lib/wire";

/**
 * Let the boundary calls awaited in `onMount` settle, applying what each one changed.
 *
 * A fixed number of microtask turns rather than `vi.waitFor`: the thing under test *is* the call
 * sequence, and a condition-based wait would let a missing call read as a slow one.
 *
 * **The number is a measured floor plus slack, and TASK-92 used up the slack the old one had.** Each
 * startup step that goes through a controller awaits once inside the controller and once at the call,
 * so the five splits added 3 turns: the floor was 17 before them (16 turns failed 1 test) and is 20
 * after (19 fails 1). At 20 the budget had none left, which would redden this file for the next step
 * added to `onMount` rather than for anything that step broke. Raised to 28 for that reason — the
 * margin is turns, not seconds, so a slow machine does not spend it.
 */
async function settled(): Promise<void> {
  for (let round = 0; round < 28; round += 1) {
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

/**
 * 区画ナビ の 1 項目 (doc-10 §1)。`byText` を使えないのは、一覧列を持つ区画のラベルの後ろに件数が
 * 付くためで（`文書 (1)`。TASK-118）、あちらは完全一致だからである。**前方一致にしても「ちょうど 1 つ」
 * は保つ** — 区画へ移動するためのヘルパーであって、ここは画面が刷る語を主張している場所ではない
 * （語そのものを固定しているのは `project-detail.test.ts` の `DETAIL_SECTIONS` の検査）。
 */
function sectionTab(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("nav.sections button")].filter(
    (button) => (button.textContent ?? "").trim().startsWith(label),
  );
  if (found.length !== 1) {
    throw new Error(`expected exactly one 区画ナビ item starting "${label}", found ${found.length}`);
  }
  return found[0];
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

function openSettingsPanel(host: HTMLElement): void {
  click(byLabel(host, "button.header-entry", "メニュー"));
  click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
}

/**
 * Open the settings modal, move 表示言語 to English and save — the app's only route to a language
 * change, which is why the assertions about one all go through here.
 */
async function switchToEnglish(host: HTMLElement): Promise<void> {
  openSettingsPanel(host);
  await settled();
  const languageSelect = [...host.querySelectorAll("section")]
    .find((section) => section.textContent?.includes("表示言語"))
    ?.querySelector("select");
  if (!(languageSelect instanceof HTMLSelectElement)) {
    throw new Error("表示言語 select not found");
  }
  languageSelect.value = "en";
  languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
  click(byText(host, "footer button", "保存する"));
  await settled();
}

describe("起動時の設定・workspace・監視の順序", () => {
  it("購読と設定読取を workspace 読取より先に済ませる", async () => {
    await startWith([loaded("atlas", [TASK])]);

    const names = order();
    // Throws on an absent call rather than answering -1: every assertion below is a `<` between two
    // positions, and -1 sits before everything — so a call that was never made would satisfy the
    // ordering it is supposed to be constrained by.
    const at = (name: string): number => {
      const index = names.indexOf(name);
      if (index < 0) {
        throw new Error(`${name} was never called; recorded: ${names.join(", ")}`);
      }
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

  /**
   * 版照会 は起動を待たせない (decision-44 §1). Held open for the whole of startup: the grid still
   * draws, and the read still happens. An `await` on that step would make this test hang instead — the
   * one shape a pairwise ordering assertion cannot catch, because a call that never answers has no
   * position to compare.
   */
  it("版照会 が答えなくても起動は進む", async () => {
    answers.releaseNoticeHold = deferred<void>();
    await startWith([loaded("atlas", [TASK])]);

    expect(madeTo("release_notice_read")).toHaveLength(1);
    expect(madeTo("workspace_open")).toHaveLength(1);
    expect(madeTo("project_watch_start").map((call) => call.args[0])).toEqual(["atlas"]);

    // Ended here rather than left pending: a promise still outstanding at teardown belongs to a
    // component that has been unmounted.
    answers.releaseNoticeHold.resolve();
    await settled();
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

  it("フォルダの有無を、起動時と設定モーダルを開くたびに問い直す", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    expect(madeTo("settings_directory_present")).toHaveLength(1);

    // doc-3 §2.1: the answer changes while the app runs — a 登録 creates the folder — so an open that
    // reused the startup answer would offer TASK-144's symptom again, a folder that is there and a
    // control that refuses. The 2 つのパス are the opposite case and are resolved once, which is why
    // only this one is re-asked; nothing else in the shell reads it, so no other call site can be
    // what keeps it current.
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
    await settled();
    expect(madeTo("settings_directory_present")).toHaveLength(2);
  });

  it("設定を保存したら Backlog CLI の縮退判定を問い直し、その結果を帯へ反映する", async () => {
    // doc-5 §4 順序 1 の `backlog_cli` は、この保存で変わりうる（decision-29）。問い直さないと、
    // **利用者がこの画面で直した直後も、再起動するまで縮退帯が立ったまま**になる。TASK-156 の趣旨は
    // 「発行できないから設定へ来た利用者が、アプリの中で直せること」なので、再起動を要する回復は
    // 到達できる手段になっていない。
    //
    // **呼び出し回数ではなく帯の有無で見る。** 回数だけを見るテストは、返ってきた縮退判定を捨てる
    // 実装でも通ってしまう。
    answers.cli = { state: "unavailable", detail: "解決できません" };
    const host = await startWith([loaded("atlas", [TASK])]);
    expect(host.querySelector('[data-band="cliDegraded"]')).not.toBeNull();

    // 設定でパスを直した、に相当する: 次の probe は解決する。
    answers.cli = { state: "ready", version: CONFIRMED_CLI_VERSION };
    await saveSomethingInSettings(host);

    expect(madeTo("cli_probe")).toHaveLength(2);
    expect(host.querySelector('[data-band="cliDegraded"]')).toBeNull();
    // 保存で問い直すのは 3 つとも。外部エディタ（doc-8 §7 起動指定の解決順）と 解決結果の表示
    // （decision-29）は先に入っており、縮退帯だけが落ちていた。
    expect(madeTo("editor_probe")).toHaveLength(2);
    expect(madeTo("external_programs_probe").length).toBeGreaterThanOrEqual(2);
  });

  it("逆向きも同じ: 解決できるパスを壊すと帯が立つ", async () => {
    // 片側だけ通すのは、片方向にしか効かない実装（例: 縮退から回復したときだけ書き換える）を
    // 見逃す。壊した側こそ、編集操作が有効なまま残るので害が大きい。
    const host = await startWith([loaded("atlas", [TASK])]);
    expect(host.querySelector('[data-band="cliDegraded"]')).toBeNull();

    answers.cli = { state: "unavailable", detail: "解決できません" };
    await saveSomethingInSettings(host);

    expect(host.querySelector('[data-band="cliDegraded"]')).not.toBeNull();
  });

  it("保存は probe の完了を待たずに返る", async () => {
    // `settingsSaving` が守るのは保存（書き込みと適用）までなので、probe を待つ間このフォームは
    // 操作できる。待った場合、遅れて解決した保存が `onsaved` を撃ち、そのときモーダルが持っている
    // **別の下書き**を破棄前確認なしに捨てる（doc-8 §6.3）。外部エディタはプロセスを起こさないが、
    // 外部コマンドが 3 つ（各 5 秒上限）、CLI が 1 つ（30 秒上限。doc-5 §5）なので、窓は実時間で開く。
    const host = await startWith([loaded("atlas", [TASK])]);
    // 起動時の probe も同じ fake を通るので、hold は起動を終えてから張る。
    const hold = deferred<void>();
    answers.cliProbeHolds = [hold];
    await saveSomethingInSettings(host);

    // probe は握られたままだが、書き込みは landed しているのでモーダルは下りている。
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).toBeNull();
    hold.resolve();
    await settled();
  });

  it("先に始めた probe が後から終わっても、新しい答えを上書きしない", async () => {
    // 切り離した以上、2 つが同時に走りうる: `backlog` のパスを保存 → 開き直して `git` のパスを保存、
    // という**この区画そのものの使い方**で起きる。1 つ 5 秒、CLI は 30 秒（doc-5 §5）なので、
    // 後から始めたほうが先に終わるのは容易であり、そのとき古い答えが帯へ載ると次の probe まで直らない。
    // 帯は表示だけの話ではなく、編集操作を出すかどうかを決めている。
    const host = await startWith([loaded("atlas", [TASK])]);
    const first = deferred<void>();
    const second = deferred<void>();
    answers.cliProbeHolds = [first, second];

    answers.cli = { state: "unavailable", detail: "古い答え" };
    await saveSomethingInSettings(host); // 1 回目: 解決できない、を握ったまま
    answers.cli = { state: "ready", version: CONFIRMED_CLI_VERSION };
    await saveSomethingInSettings(host); // 2 回目: 解決する、を握ったまま

    // 後から始めたほうを先に終わらせる。
    second.resolve();
    await settled();
    expect(host.querySelector('[data-band="cliDegraded"]')).toBeNull();

    // 先に始めたほうが後から終わる。これが上書きしてはいけない。
    first.resolve();
    await settled();
    expect(host.querySelector('[data-band="cliDegraded"]')).toBeNull();
  });

  it("区画も同じ: 先に始めた probe が後から終わっても上書きしない", async () => {
    // 帯と区画は**別の生成番号**で守っている（書き手が違う — 区画は設定モーダルを開く操作でも
    // 更新される）。片方だけ試すと、もう片方の競合が戻っても通ってしまう。
    //
    // **保存ではなく「開く・閉じる・開く」で起こす。**保存はモーダルを閉じるので、区画を見るには
    // 開き直すことになり、その開き直しが新しい probe を撃って競合ではなくそちらを見てしまう。
    // 開く操作 2 回なら、2 回目のモーダルが立ったまま両方を解決させられる。
    const host = await startWith([loaded("atlas", [TASK])]);
    const first = deferred<void>();
    const second = deferred<void>();
    answers.externalProgramsHolds = [first, second];

    answers.externalPrograms = [{ ...answers.externalPrograms[0], program: "/古い/backlog" }];
    openSettingsPanel(host);
    await settled();
    click(byText(host, "footer button", closeWithoutSavingLabel()));
    await settled();

    answers.externalPrograms = [{ ...answers.externalPrograms[0], program: "/新しい/backlog" }];
    openSettingsPanel(host);
    await settled();

    // 後から始めたほうを先に、次に先に始めたほうを終わらせる。
    second.resolve();
    await settled();
    first.resolve();
    await settled();

    // 区画が持つのは 2 回目の答え。1 回目の古い答えで上書きされてはならない。
    // Backlog CLI 行の ? を開く（解決結果はその中にある）。
    click(host.querySelectorAll<HTMLElement>(".command .help")[0]);
    expect(host.textContent).toContain("/新しい/backlog");
    expect(host.textContent).not.toContain("/古い/backlog");
  });

  it("継続検出の適用が終わるまで保存中のままにする", async () => {
    // `reconcileWatches` は登録ルート数ぶんの境界呼び出しで、**設定を適用する**側なので probe とは違い
    // ガードの内側に置く。外へ出すと、probe を切り離して塞いだ窓がそのまま開き直す。
    const host = await startWith([loaded("atlas", [TASK])]);
    const hold = deferred<void>();
    answers.watchStopHolds = [hold];

    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
    await settled();
    // 継続検出のチェックボックス。保存区分にも checkbox が並ぶので、ラベルの語で選ぶ。
    const watch = [...host.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("継続検出を使う"),
    );
    if (watch === undefined) {
      throw new Error("継続検出を使う control not found");
    }
    click(only<HTMLInputElement>(watch, 'input[type="checkbox"]'));
    click(byText(host, "footer button", "保存する"));
    await settled();

    // 見るのは**ガードそのもの**であって、モーダルが立っているかではない。ガードの外へ出しても
    // `saveSettings` は同じだけ遅く解決するのでモーダルは開いたままで、どちらでも通ってしまう。
    // 違うのは `settingsSaving` — 保存する の語と、3 つの出口が塞がっているかどうかである。
    expect(byText(host, "footer button", "保存中…")).not.toBeNull();
    hold.resolve();
    await settled();
    expect(host.querySelector('[role="dialog"][aria-label="設定"]')).toBeNull();
  });

  /** 設定モーダルを開き、1 項目だけ変えて 保存する を押す。*/
  async function saveSomethingInSettings(host: HTMLElement): Promise<void> {
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
    await settled();
    // 変更あり: 下書きがファイルと違わないと 保存する は押下を受け付けない。
    const other = [...host.querySelectorAll<HTMLInputElement>('input[name="card-density"]')].find(
      (radio) => !radio.checked,
    );
    if (other === undefined) {
      throw new Error("every カード情報量 is already checked");
    }
    click(other);
    click(byText(host, "footer button", "保存する"));
    await settled();
  }

  it("設定の読取が失敗しても既定値で起動を続ける", async () => {
    // What is fixed here is that a *rejection* is not fatal: the boundary already degrades a missing
    // or unreadable file to the defaults, so only an IPC failure reaches the shell, and leaving
    // 読み込み中 on screen over a workspace that reads perfectly well would be the worse answer.
    //
    // **The band is compared against the 文言表, not against a sentence spelled here** (decision-35).
    // This is the one case where the fake's `language: "ja"` does not reach the screen: the read that
    // would have carried it is the one that failed, so 表示言語 is 言語未選択 and the OS decides. A
    // literal would therefore pin the assertion to whatever locale the runner reports.
    answers.settingsReadFails = true;
    const host = await startWith([loaded("atlas", [TASK])]);

    expect(order()).toContain("workspace_open");
    expect(host.querySelector("button.card")).not.toBeNull();
    expect(host.querySelector('.band[data-band="notice"]')?.textContent).toContain(
      msg().shell.settingsReadFailed("Error: settings channel is gone"),
    );
  });

  it("表示言語 を変えると、開いたままの画面がその場で英語へ描き直る", async () => {
    // decision-35 の 表示言語 が、**再起動でも再マウントでもなく描き直しで効く**ことを固定する。
    // `messages-context.ts` の取得子がシェルの `$derived` を閉じ込めているのがその仕組みで、これを
    // 素の `msg()` に戻すと、最初に描いた言語のまま動かなくなる — 型は通り、画面だけが古びる。
    //
    // **見る先は詳細パネルである。** スイムレーンだけを見ると、設定モーダルが閉じるついでに引き直された
    // 場合と区別が付かない。詳細パネルは 編集セッション を持ちうる区画で、言語を変えても閉じない
    // (doc-8 §6.4 が破棄を禁じている理由と同じ) ので、**同じ要素が残ったまま字だけが変わる**ことまで
    // 見られる。
    const host = await startWith([loaded("atlas", [TASK])]);
    click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
    await settled();

    const before = only(host, '[aria-label="タスク詳細"]');
    expect(byText(host, "button.primary", "編集")).not.toBeNull();

    await switchToEnglish(host);

    // 同じ要素であること — 再マウントなら別のノードになる。
    const after = only(host, '[aria-label="Task detail"]');
    expect(after).toBe(before);
    expect(byText(host, "button.primary", "Edit")).not.toBeNull();
    // 背後のスイムレーンも同じ描き直しで動く — 詳細パネルだけが取得子を読んでいるのではない。
    expect(host.textContent).toContain("1 / 1 task");
  });

  /**
   * **文が純関数からしか来ない区画も、同じ描き直しで英語になる** (TASK-187 AC #2)。
   *
   * TASK-183 の時点ではここが日本語のまま残り、あの回はそれを「分割の帰結であって欠陥ではない」と
   * 記録して次へ送っていた。**測り直すのは上の「開いたままの画面が描き直るか」ではなく、取得子を
   * 読まない区画が取り残されていないか**である — 下の 3 つはどれも `.svelte` が綴らない文で、
   * `external-editor.ts`・`edit.ts`・`swimlane.ts` が組んで文字列として渡してくる。
   *
   * その描き直しを支えているのは `messages.ts` の 言語の出どころ で、シェルが自分の 表示言語 を
   * 渡しているために `msg()` の呼び出し自体が言語の読み取りになる。**この検査が落ちる形で壊れる** —
   * 出どころを外せば、区画ごとに取得子を読ませて回らないかぎりここは日本語のまま残る。
   */
  it("純関数だけが文を組む区画も、同じ描き直しで英語になる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();

    // 状態遷移の控え (`edit.ts`)、状態遷移の 保留理由 (`edit.ts`)、前後移動の群の名
    // (`swimlane.ts` の `laneGroupLabel`)。
    //
    // **`external-editor.ts` はもうこのパネルに文を出さない** (decision-45 §8): 起動の控えと注意は
    // ☰ の 外部で開く へ移り、区画に残ったのはパスと、継続検出 が止まっている間だけ出る再読込である。
    // あの module の言語切替は下の 「外部で開く のサブメニューも 表示言語 で入れ替わる」 が持つ。
    //
    // **3 つ目は `title` から読む。** 群の名が本文へ出る場所は無く（doc-8 §2.2 が 位置表示 から
    // 名前を落としている）、本文で読める `1 / 1 件` は同じ字を `visibleCount` も刷る — あちらは
    // `.svelte` が取得子で読む TASK-183 の経路なので、`swimlane.ts` を literal へ戻しても気づけない。
    // 前後の 2 つとも同じ群を名乗るので、両方の `title` をつないで見る（doc-8 §2.2）。
    const stepTitles = () =>
      [...host.querySelectorAll<HTMLButtonElement>("button.step")].map((b) => b.title).join(" | ");

    expect(host.textContent).toContain("draft へ差し戻す");
    expect(host.textContent).toContain("id は採番し直されます");
    expect(stepTitles()).toContain("In Progress セル");

    await switchToEnglish(host);

    expect(host.textContent).toContain("Move back to drafts");
    expect(host.textContent).toContain("the id is assigned afresh");
    expect(stepTitles()).toContain("the In Progress cell");
    expect(host.textContent).not.toContain("draft へ差し戻す");
    expect(host.textContent).not.toContain("id は採番し直されます");
    expect(stepTitles()).not.toContain("セル");
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
    if (other === undefined) {
      throw new Error("every placement reads as the current one");
    }
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
    //
    // **The refusal is checked by pressing, not by reading `disabled`.** Since 2026-08-10 this control
    // is `aria-disabled` and focusable (doc-11 §5 の 2 つ目の形 — its 保留理由 are of both kinds, doc-11
    // §8), so the attribute no longer carries the contract and a test that read it would report a
    // regression where there is none. What must hold either way is that the second press issues
    // nothing.
    const busy = only<HTMLButtonElement>(host, "button.primary");
    expect(busy.textContent?.trim()).toBe("保存中…");
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    click(busy);
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
    click(byText(byControl, "footer button", closeWithoutSavingLabel()));
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
    if (other === undefined) {
      throw new Error("every カード情報量 is already checked");
    }
    click(other);
    click(byText(host, "footer button", "保存する"));
    await settled();
    expect(madeTo("settings_save")).toHaveLength(1);

    click(byText(host, "footer button", closeWithoutSavingLabel()));
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
    click(byLabel(byEscape, '[role="dialog"][aria-label="メニュー"] button', shortcutHelpLabel()));

    // The layer is named by the same word as the line that opened it (TASK-130), so the query uses the
    // constant: a modal renamed away from its own menu line stops being findable here. What the word
    // itself is, is pinned in `header.test.ts` — it came from the user and nothing derives it.
    const list = only(byEscape, `[role="dialog"][aria-label="${shortcutHelpLabel()}"]`);
    // Printed from `shortcuts()` (doc-7 §2.1 の 1 箇所), so a row missing here means a row missing there.
    expect(list.querySelectorAll("tbody tr")).toHaveLength(shortcuts().length);
    expect(list.querySelector("h2")?.textContent).toBe(shortcutHelpLabel());

    press(list, "Escape");
    expect(byEscape.querySelector(`[aria-label="${shortcutHelpLabel()}"]`)).toBeNull();
    expectFocusBackOnMenu(byEscape);

    cleanup();

    const byControl = await startWith([loaded("atlas", [TASK])]);
    chooseFromMenu(byControl, shortcutHelpLabel());
    click(closeOf(byControl, shortcutHelpLabel()));
    expect(byControl.querySelector(`[aria-label="${shortcutHelpLabel()}"]`)).toBeNull();
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
    if (confirm === null) {
      throw new Error(`no 破棄前確認 in ${label}`);
    }
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
    if (other === undefined) {
      throw new Error("every カード情報量 is already checked");
    }
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
    if (labelled === undefined) {
      throw new Error("no プロジェクトルート field");
    }
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
    click(byText(byWording, "footer button", closeWithoutSavingLabel()));

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

  /**
   * doc-11 §4・§7 の一対 (TASK-134). 発行が通った事実そのものは ⑤ に載せず、通らなかったときは層を
   * 保ったまま控えの隣で述べる — 二つで一つの規則なので、片方だけを押さえると残る半分が黙って反転する
   * (成功で帯を立て直しても失敗側の試験は通り、失敗で層を閉じても成功側の試験は通る)。
   *
   * どちらも呼び出し元からしか固定できない。`band.ts` は 通知 か `null` を渡されるだけでどの押下が
   * それを産んだか知らず、`Settings.svelte` はシェルへ失敗文を返すだけで、帯が立ったかどうかを見ない。
   */
  it("保存が通っても上部帯は立たない（TASK-134 AC #1）", async () => {
    const host = await withSettingsDraft();
    click(byText(host, "footer button", "保存する"));
    await settled();

    // 層が下りたあとで見る: このモーダルは上部帯を覆う (doc-7 §2.1) ので、開いている間は立っていても
    // 見えない。「見えなかった」ではなく「立っていない」を押さえるための順序である。
    expect(madeTo("settings_save")).toHaveLength(1);
    expect(host.querySelector('[aria-label="設定"]')).toBeNull();
    expect(host.querySelector('.band[data-band="notice"]')).toBeNull();
  });

  it("保存が通らなければ層は残り、失敗は控えの隣に出る（TASK-134 AC #2）", async () => {
    answers.settingsSaveFails = true;
    const host = await withSettingsDraft();
    click(byText(host, "footer button", "保存する"));
    await settled();

    const dialog = dialogOf(host, "設定");
    expect(dialog.querySelector("footer p.warn")?.textContent).toContain("保存できませんでした");
    // ⑤ へは回さない (doc-11 §7): 層が残っているのだから、押した控えの隣が届く場所である。
    expect(host.querySelector('.band[data-band="notice"]')).toBeNull();
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
    if (original === undefined) {
      throw new Error("no other カード情報量 to go back to");
    }
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
describe("実行前確認が上げる被せ層 (doc-11 §12)", () => {
  /** The 共通修飾キー as a press carries it (doc-7 §2.1) — Command on macOS, Control elsewhere. */
  const MOD: KeyboardEventInit = MAC_KEYBOARD ? { metaKey: true } : { ctrlKey: true };

  /**
   * Press a control the way a pointer does, focus and all — jsdom's `click()` moves no focus, and part
   * of what this describe fixes is where focus goes back to.
   */
  function pressControl(control: HTMLElement): void {
    control.focus();
    click(control);
  }

  /** Open a 折畳み区画 of the detail panel by its heading (doc-8 §3). */
  function openSection(host: HTMLElement, title: string): void {
    const summary = [...host.querySelectorAll<HTMLElement>('[aria-label="タスク詳細"] summary')].filter(
      (element) => element.textContent?.includes(title),
    );
    if (summary.length !== 1) {
      throw new Error(`expected one ${title} summary, found ${summary.length}`);
    }
    const box = summary[0].closest("details");
    if (box === null) {
      throw new Error("a 区画見出し outside its details");
    }
    if (!(box as HTMLDetailsElement).open) {
      click(summary[0]);
    }
  }

  /** Open the first task and reach its 状態遷移 controls (doc-8 §6.5). */
  async function withTransitions(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK, NEIGHBOUR])]);
    click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
    await settled();
    openSection(host, "状態遷移");
    return host;
  }

  /**
   * Reach one row of the 外部で開く サブメニュー the way the screen offers it (doc-7 §2.1,
   * decision-45 §3): the ☰, then the parent line, then the row. **Three presses, not one** — and the
   * parent line does not unmount, because the submenu is moored to it rather than raised over it.
   */
  function openExternalSubmenu(host: HTMLElement): HTMLElement {
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "外部で開く"));
    const submenu = host.querySelector<HTMLElement>('[role="group"][aria-label="外部で開く"]');
    if (submenu === null) {
      throw new Error("expected the 外部で開く submenu");
    }
    return submenu;
  }

  /** The layer the question is drawn in, or `null` while nothing is being asked. */
  function layer(host: HTMLElement, title: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[role="dialog"][aria-label="${title}"]`);
  }

  it("押下は層を上げるだけで、同じ座標を続けて押しても発行に届かない", async () => {
    const host = await withTransitions();

    // 語尾の … (doc-11 §12 の ②): the mark is on every 状態遷移, since all five ask.
    const archive = byText<HTMLButtonElement>(host, "button.transition", "アーカイブ…");
    pressControl(archive);

    expect(layer(host, "アーカイブ")).not.toBeNull();
    expect(madeTo("update_apply")).toHaveLength(0);

    // 連打で素通りできない: the answer is in another layer, so pressing where the press was — twice more,
    // as a 連打 does — cannot reach the act. This is the property the 二度押し did not have.
    click(archive);
    click(archive);
    expect(madeTo("update_apply")).toHaveLength(0);
  });

  it("進む側の答えだけが発行し、それは 1 件だけである", async () => {
    const host = await withTransitions();
    answers.update = () => deferred<UpdateResult>().promise;
    pressControl(byText(host, "button.transition", "アーカイブ…"));

    const dialog = layer(host, "アーカイブ");
    if (dialog === null) {
      throw new Error("expected the question");
    }
    // 進む側は動作を名乗る (doc-11 §12): 実行する would be wider than what the press does.
    click(byText(dialog, ".answers button", "アーカイブする"));
    await settled();

    expect(madeTo("update_apply")).toHaveLength(1);
    expect(layer(host, "アーカイブ")).toBeNull();
  });

  it("やめる と Escape はどちらも何も発行せず、押した控えへフォーカスを戻す", async () => {
    const host = await withTransitions();
    const demote = byText<HTMLButtonElement>(host, "button.transition", "draft へ差し戻す…");

    // **`pressControl` ではなく素の `click`。** 層は自分がマウントされた時点で焦点にある要素を開き元と
    // して捕まえるが、**macOS WebKit はポインタ押下でボタンへ焦点を移さない**（プラットフォームの慣習。
    // jsdom の `click()` も同じで焦点を動かさない）。先に `focus()` してから押す試験は、実機で起きる
    // 経路をまたいでしまう — 控えが自分で焦点を取るのは押下ハンドラの中である（PR #93 1R [P2]）。
    click(demote);
    const dialog = layer(host, "draft へ差し戻す");
    if (dialog === null) {
      throw new Error("expected the question");
    }
    // フォーカスを内側に (doc-7 §2.1): `Modal.svelte` puts it on its × as the layer mounts.
    expect(dialog.contains(document.activeElement)).toBe(true);
    click(byText(dialog, ".answers button", "やめる"));
    await settled();

    expect(madeTo("update_apply")).toHaveLength(0);
    // 閉じたら開く前の操作へフォーカスを戻す (doc-7 §2.1). Nothing was started, so the control the question
    // came from is still pressable — which is why the return is observable on this answer.
    expect(document.activeElement).toBe(demote);

    click(demote);
    press(only(host, '[role="dialog"][aria-label="draft へ差し戻す"]'), "Escape");
    await settled();
    // 層の出口は戻る側と同じ (doc-11 §12): an unanswered question starts nothing.
    expect(madeTo("update_apply")).toHaveLength(0);
    expect(layer(host, "draft へ差し戻す")).toBeNull();
    expect(document.activeElement).toBe(demote);
  });

  it("別のタスクへ移ると問いは失効し、戻ってきても立っていない", async () => {
    const host = await withTransitions();
    pressControl(byText(host, "button.transition", "アーカイブ…"));
    expect(layer(host, "アーカイブ")).not.toBeNull();

    // The layer covers the window, so no card can be pressed while it is up. What can still move the
    // panel off the file the question was about is a re-read that no longer holds it — 失効 (doc-11 §12
    // の ③) is about exactly that, and it is the case the 二度押し got wrong (its armed state had no key,
    // so the next task inherited it and went in one press).
    emitReload({ slug: "atlas", load: loaded("atlas", [NEIGHBOUR]) });
    await settled();

    expect(host.querySelector('[aria-label="タスク詳細"]')).toBeNull();
    expect(layer(host, "アーカイブ")).toBeNull();
    expect(madeTo("update_apply")).toHaveLength(0);

    // 戻ってきても立っていない: the request was dropped, not hidden — selecting the neighbour draws its
    // own controls with no question over them.
    click(byText(host, "button.card .title", "隣の題").closest("button.card")!);
    await settled();
    expect(layer(host, "アーカイブ")).toBeNull();
    openSection(host, "状態遷移");
    expect(byText(host, "button.transition", "アーカイブ…")).not.toBeNull();
  });

  it("問いの対象がファイルごと読み取り結果から消えたら、未保存入力があっても失効する", async () => {
    // 未保存入力があるあいだ、パネルはファイルが消えても保持した読みを描き続ける (`shown.missing`) ので、
    // パスは同じままである。**それでも問いは失効しなければならない** — その状態では 外部で開く 自身が
    // 「読み取り結果にありません」で保留されており (decision-45 §1)、層だけが、画面が断っている動作を
    // 差し出すことになる (PR #93 1R [P2])。
    const host = await startWith([loaded("atlas", [TASK, NEIGHBOUR])]);
    click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
    await settled();
    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");
    click(
      byText<HTMLButtonElement>(openExternalSubmenu(host), "button", "OS の関連付けで開く…"),
    );
    await settled();
    expect(layer(host, "OS の関連付けで開く")).not.toBeNull();

    emitReload({ slug: "atlas", load: loaded("atlas", [NEIGHBOUR]) });
    await settled();

    // パネルは残る (未保存入力を守るため)。問いは残らない。
    expect(host.querySelector('[aria-label="タスク詳細"]')).not.toBeNull();
    expect(layer(host, "OS の関連付けで開く")).toBeNull();
    expect(madeTo("managed_file_open")).toHaveLength(0);
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");
  });

  it("外部エディタ起動は未保存入力があるときだけ問い、語尾の … もそのときだけ付く", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();

    // 抑止できる注意 (doc-11 §15) はここでは邪魔なので、先に抑止しておく — この試験が見ているのは
    // 抑止できない側の問い (doc-8 §6.4) である。抑止は 設定 の刻みで行う: 層の刻みで行うと、
    // その 1 回だけ層が立つ経路をこの試験自身が通ってしまう。
    await suppressOpenNotice(host);

    // 未保存入力が無いあいだは問わない (doc-8 §7): 毎回問うと 2 打目が反射になる。語尾に … も付かない。
    click(byText<HTMLButtonElement>(openExternalSubmenu(host), "button", "OS の関連付けで開く"));
    await settled();
    expect(madeTo("managed_file_open")).toHaveLength(1);

    click(byText(host, "button.primary", "編集"));
    fill(only<HTMLInputElement>(host, '.field input[type="text"]'), "書きかけの題");

    // 未保存入力があるあいだは問う (doc-8 §6.4): 同じ行が … を持ち、押下は起動に届かない。
    click(byText<HTMLButtonElement>(openExternalSubmenu(host), "button", "OS の関連付けで開く…"));
    await settled();
    const dialog = layer(host, "OS の関連付けで開く");
    if (dialog === null) {
      throw new Error("expected the question");
    }
    // 抑止されていても 実行前確認 は立つ (doc-11 §15 ③): 抑止できる注意 と抑止できない問いは別物で、
    // 抑止できる問いにすると、その問いが要る 1 回だけ立たないという状態を作れてしまう。
    expect(dialog.textContent).toContain("二重に編集する");
    expect(dialog.textContent).not.toContain("frontmatter");
    // 刻みも消える — 抑止する相手が層に無いので (decision-45 §6)。
    expect(dialog.querySelector('input[type="checkbox"]')).toBeNull();
    click(byText(dialog, ".answers button", "やめる"));
    await settled();
    expect(madeTo("managed_file_open")).toHaveLength(1);

    // 未保存入力はどちらの答えでも失われない (doc-8 §6.4)。
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");

    click(byText<HTMLButtonElement>(openExternalSubmenu(host), "button", "OS の関連付けで開く…"));
    await settled();
    click(
      byText(
        only(host, '[role="dialog"][aria-label="OS の関連付けで開く"]'),
        ".answers button",
        "OS の関連付けで開く",
      ),
    );
    await settled();
    expect(madeTo("managed_file_open")).toHaveLength(2);
    expect(only<HTMLInputElement>(host, '.field input[type="text"]').value).toBe("書きかけの題");
  });

  /**
   * 注意の抑止 (decision-45 §6): the 設定画面's own control, so a test that needs the notice out of the
   * way does not have to take the layer's tick — which is the one route this test must not exercise on
   * its own behalf.
   */
  async function suppressOpenNotice(host: HTMLElement): Promise<void> {
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
    await settled();
    const tick = byText<HTMLLabelElement>(
      host,
      "label.choice",
      "frontmatter の注意を今後表示しない",
    ).querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (tick === null) {
      throw new Error("expected the 注意の抑止 tick");
    }
    tick.checked = true;
    tick.dispatchEvent(new Event("change", { bubbles: true }));
    // 保存 closes the modal by itself (`settings-controller.ts`), so nothing has to close it here —
    // and the setting has to reach アプリ設定 rather than a draft, because that is what the next press
    // reads (decision-45 §6).
    click(byText(host, "footer button", "保存する"));
    await settled();
  }

  it("層が上がっている間はシェルの和音が届かない（被せ層 は 1 枚だけ）", async () => {
    const host = await withTransitions();
    pressControl(byText(host, "button.transition", "アーカイブ…"));
    expect(layer(host, "アーカイブ")).not.toBeNull();

    press(document.body, ",", MOD);
    await settled();

    // 被せ層 は同時に 1 枚 (`raiseModal`): the shell must keep that of a layer it raised for a 区画 too.
    expect(layer(host, "設定")).toBeNull();
    expect(layer(host, "アーカイブ")).not.toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------

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
    click(sectionTab(host, "文書"));
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
    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
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
  it("表示言語 を変えると、出したままの 発行結果 の帯も英語へ書き直る", async () => {
    // **発行結果 outlives the press that raised it**, and this screen keeps it up while the 設定モーダル
    // is opened over it — so it is the one sentence on screen that a 表示言語 change reaches only if it
    // is worded where it is *read*. Storing the string at the moment the issue returns type-checks and
    // passes every other test here, and leaves exactly this line in the language the screen has left.
    //
    // **The 上部帯 ⑤ 通知 cannot stand in for it**: `saveSettings` clears that band on a successful
    // write (doc-11 §4), and a successful write is the only route to a language change — so a stale
    // notice is not reachable there. This 区画's own line is not cleared, which is what makes it the
    // observable case.
    answers.update = () =>
      Promise.resolve({
        state: "ran",
        outcome: { state: "succeeded" },
        project: snapshot("atlas", [TASK]),
      } as UpdateResult);
    const host = await openDocumentCreate();
    await settled();
    fill(
      host.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="text"]')[0],
      "新しい文書",
    );
    click(byText(host, '[role="dialog"] button', "文書を作成"));
    await settled();

    // The create layer stays up over the screen; close it so the ☰ is reachable — 被せ層 は 1 枚だけ.
    click(closeOfCreate(host));
    await settled();

    const banner = () => host.querySelector("p.ok")?.textContent ?? "";
    expect(banner()).toContain("文書を作成しました");

    await switchToEnglish(host);

    expect(banner()).toContain("The document is created");
    expect(banner()).not.toContain("文書を作成しました");
  });
  it("改称の成功を伝える帯は、言語を変えてもアーカイブの文に化けない", async () => {
    // 発行結果 is worded lazily so it follows 表示言語 — but `runMilestoneOp` clears `milestoneOp` on
    // success, so a thunk that looked the operation up when the banner is *read* would find `null`
    // and word every success as アーカイブ. The kind is captured at the press for that reason, and
    // this holds it: 改称 has to stay 改称 through the language change.
    answers.update = () =>
      Promise.resolve({
        state: "ran",
        outcome: { state: "succeeded" },
        project: snapshot("atlas", [TASK], [MILESTONE]),
      } as UpdateResult);
    const host = await startWith([loaded("atlas", [TASK], undefined, [], [MILESTONE])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();
    click(sectionTab(host, "マイルストーン"));
    await settled();
    click(only(host, "button.card"));
    await settled();
    click(byText(host, "button", "編集"));
    await settled();
    click(byText(host, "button", "改称"));
    await settled();
    fill(only<HTMLInputElement>(host, '.sub-panel input[type="text"]'), "新しい節目");
    click(byText(host, "button", "改称を発行"));
    await settled();

    const banner = () => host.querySelector("p.ok")?.textContent ?? "";
    expect(banner()).toContain("マイルストーンを改称しました");

    await switchToEnglish(host);

    expect(banner()).toContain("The milestone is renamed");
    expect(banner()).not.toContain("archived");
  });
});

// -------------------------------------------------------------------------------------------------

describe("本文リンク (doc-8 §9.3)", () => {
  /** A task whose Description carries one openable link and one the screen must not offer. */
  const LINKED = taskView({
    id: "TASK-1",
    title: "最初の題",
    status: "In Progress",
    column: "inProgress",
    ordinal: 1000,
    description: "原文は [ここ](https://example.test/spec) と [隣](./doc-3.md) にある。",
  });

  async function openDetail(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [LINKED])]);
    click(only(host, "button.card"));
    await settled();
    return host;
  }

  /**
   * That a press reaches the boundary. No pure function can hold this: `markdown.ts` decides only which
   * links are drawn as links, and the wiring that turns a press into `body_link_open` is spread across
   * `Body.svelte`, `TaskDetail.svelte` and `App.svelte` — no single screen owns it.
   */
  it("押すと、その URL が境界へ渡る", async () => {
    const host = await openDetail();
    const link = only(host, `.body-block .${BODY_LINK_CLASS}`);
    // No href to follow (doc-8 §9.3): the press is the only way this opens, and the engine has no path
    // of its own — which is what 目視 2026-08-11 required after the context menu took the window away.
    expect(link.getAttribute("href")).toBeNull();
    click(link);
    await settled();

    expect(madeTo("body_link_open").map((call) => call.args[0])).toEqual(["https://example.test/spec"]);
    // Nothing is shown on success (doc-11 §4): the browser coming forward is the result.
    expect(host.querySelector('.band[data-band="notice"]')).toBeNull();
  });

  /**
   * doc-8 §9.3: the middle button opens it, and the secondary one does not.
   *
   * `auxclick` fires for every non-primary button, so a handler that took them all would launch the
   * browser out from under the right-click a reader makes to open the context menu — the very interaction
   * 目視 was performing when it found the navigation defect. `render.ts`'s `click` cannot express a
   * button (it calls `HTMLElement.click()`), so the event is dispatched here.
   */
  it("中ボタンは開き、右ボタンは開かない", async () => {
    const host = await openDetail();
    const link = only(host, `.body-block .${BODY_LINK_CLASS}`);

    const aux = (button: number): void => {
      link.dispatchEvent(new MouseEvent("auxclick", { button, bubbles: true, cancelable: true }));
      flushSync();
    };

    aux(2);
    await settled();
    expect(madeTo("body_link_open")).toEqual([]);

    aux(1);
    await settled();
    expect(madeTo("body_link_open").map((call) => call.args[0])).toEqual([
      "https://example.test/spec",
    ]);
  });

  /**
   * doc-8 §9.3: Enter opens it too. Dropping the `href` took the engine's own keyboard activation with
   * it, so this is wiring rather than a default — and a link a keyboard cannot reach is one this screen
   * offers to some readers only.
   */
  it("Enter でも同じ URL が境界へ渡る", async () => {
    const host = await openDetail();
    const link = only(host, `.body-block .${BODY_LINK_CLASS}`);
    expect(link.getAttribute("tabindex")).toBe("0");
    expect(link.getAttribute("role")).toBe("link");
    press(link, "Enter");
    await settled();

    expect(madeTo("body_link_open").map((call) => call.args[0])).toEqual([
      "https://example.test/spec",
    ]);
  });

  /** doc-8 §9.3: what is not opened is not drawn as a link, so there is nothing to press. */
  it("開かない相手はリンクにならず、境界も呼ばれない", async () => {
    const host = await openDetail();
    // One link only: `./doc-3.md` stays as text.
    expect(host.querySelectorAll(`.body-block .${BODY_LINK_CLASS}`)).toHaveLength(1);
    expect(only(host, ".body-block").textContent).toContain("隣");

    // Pressing it does nothing: it is text inside the 本文, not a control. Pressing the block itself
    // is what "pressed somewhere that is not a link" means — the path where `closest` finds nothing.
    click(only(host, ".body-block"));
    await settled();
    expect(madeTo("body_link_open")).toEqual([]);
  });

  /**
   * That a failure lands in ⑤ 通知 (doc-11 §4). **This press has no 控えの隣 to put a result line in**,
   * which is the whole reason: `Body.svelte` never sees the failure and `band.ts` does not know which
   * press produced a sentence — only the caller can hold this.
   */
  it("開けなければ ⑤ 通知 に出る", async () => {
    answers.bodyLink = () =>
      Promise.reject({
        kind: "bodyLinkFailed",
        reason: { reason: "launchFailed", program: "xdg-open", launch: { reason: "exited" } },
        detail: "exit status: 3",
      });
    const host = await openDetail();
    click(only(host, `.body-block .${BODY_LINK_CLASS}`));
    await settled();

    const band = host.querySelector('.band[data-band="notice"]');
    expect(band?.textContent).toContain("リンクを開けませんでした");
    expect(band?.textContent).toContain("xdg-open");
    // No result line inside the 本文: the file's content and Atlas's report about it do not share
    // one block.
    expect(only(host, ".body-block").textContent).not.toContain("開けませんでした");
  });
});

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

    click(byLabel(host, "button.back", "スイムレーンへ戻る"));

    // The same one gate as the task panel's: doc-8 §6.3 gives 破棄前確認 one wording, so neither
    // screen grows its own — and this screen holds all four 区画's input in one component, so
    // leaving it loses input the 区画切替 would have kept.
    expect(confirmBand(host)).not.toBeNull();
    expect(host.querySelector('input[placeholder="atlas"]')).not.toBeNull();
  });

  it("破棄して続けるとスイムレーンへ戻る", async () => {
    const host = await withUnsavedProjectInput();
    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
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
    click(sectionTab(host, "文書"));

    click(only(host, "button.card"));
    await settled();

    // 閲覧 is what opened: the body is on screen, and the 編集セッション is not — its 出口
    //「編集を閉じる」 exists only while one is open. Read through the 整形表示 block since TASK-142
    // (doc-8 §9): the text is the same, and `toContain` rather than equality because 整形 decides the
    // markup around it — what this test is about is that the 本文 is on screen at all.
    expect(only(host, ".body-block").textContent).toContain("本文の 1 行目");
    expect(byText(host, ".view-head button", "編集")).not.toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "編集を閉じる")).toBe(
      false,
    );

    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
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
    click(sectionTab(host, "マイルストーン"));

    click(only(host, "button.card"));
    await settled();

    // 閲覧 is what opened: the description is on screen, and the 編集セッション is not open — its input
    // box and its 出口「編集を閉じる」 exist only while one is. Read through the 整形表示 block since
    // TASK-142 (doc-8 §9, which doc-10 §6 draws from).
    expect(only(host, ".body-block").textContent).toContain(MILESTONE.description);
    expect(byText(host, ".view-head button", "編集")).not.toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "編集を閉じる")).toBe(
      false,
    );

    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
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
  const MENU = '[role="dialog"][aria-label="メニュー"]';

  function menu(host: HTMLElement): HTMLElement | null {
    return host.querySelector<HTMLElement>(MENU);
  }

  /** Open it if it is not already: a 表示切替行 leaves it up, so pressing ☰ again would close it. */
  function openMenu(host: HTMLElement): void {
    if (menu(host) === null) {
      click(byLabel(host, "button.header-entry", "メニュー"));
    }
  }

  function toggle(host: HTMLElement, label: string): void {
    click(byText(host, `${MENU} button`, label));
  }

  /** The プロジェクト一覧's lines, in order, as the open menu draws them (doc-7 §2.1). */
  function projectLines(host: HTMLElement): { label: string; shown: boolean }[] {
    return [...only(host, MENU).querySelectorAll("button")]
      .filter((button) => button.getAttribute("aria-pressed") !== null)
      .map((button) => ({
        label: button.querySelector(".label")?.textContent ?? "",
        shown: button.getAttribute("aria-pressed") === "true",
      }));
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
    toggle(host, "Atlas");
    await settled();
    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).toBeNull();

    // Closed the way a user closes it before leaving for the other screen. Escape rather than a press
    // outside because `render.ts`'s `click` is `HTMLElement.click()`, which dispatches no
    // `pointerdown` — and `pointerdown` is what `HeaderMenu.svelte` listens for. The same substitution
    // is used everywhere below.
    press(only(host, MENU), "Escape");
    click(only(host, '[title="kanri のプロジェクト詳細画面を開きます"]'));
    await settled();
    openMenu(host);
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: false },
      { label: "kanri", shown: true },
    ]);

    // 戻すのも同じ 1 か所から、グリッドが立っていなくてもできる。
    toggle(host, "Atlas");
    press(only(host, MENU), "Escape");
    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
    await settled();
    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).not.toBeNull();
  });

  /**
   * 閉じる契機は群で決まる (doc-7 §2.1): a `rows` line leaves the menu up so that several rows are one
   * errand, and a `layer` line closes it because 被せ層 は 1 枚だけ. Held here because the decision is
   * `App.svelte`'s — `header.ts` knows the 群 but nothing about closing, and the two halves have to be
   * checked against each other or a change to one reads as consistent on its own.
   */
  it("一覧の行ではメニューが開いたまま残り、被せ層を上げる行では閉じる", async () => {
    const host = await startWith([loaded("atlas", [TASK]), unreadable("kanri")]);

    openMenu(host);
    toggle(host, "Atlas");
    expect(menu(host)).not.toBeNull();
    toggle(host, "kanri");
    expect(menu(host)).not.toBeNull();
    await settled();
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: false },
      { label: "kanri", shown: false },
    ]);

    // すべてのプロジェクトを表示 is a `rows` line too, and now has something to do.
    toggle(host, showAllProjectsLabel());
    expect(menu(host)).not.toBeNull();
    expect(projectLines(host).every((line) => line.shown)).toBe(true);

    // A `layer` line raises one, so it closes the menu on the way.
    toggle(host, shortcutHelpLabel());
    expect(menu(host)).toBeNull();
    expect(host.querySelector(`[role="dialog"][aria-label="${shortcutHelpLabel()}"]`)).not.toBeNull();
  });

  /**
   * The menu is the only writer of 行非表示 (doc-7 §2.1・§5.1), and the exit that returns to a project's
   * lane is where a second one used to sit: it un-hid the row on the way out, which was unreachable
   * while the menu listed hidden rows alone and became reachable the moment it listed every project.
   * A cross-screen contract precisely because both halves are on different screens.
   */
  it("詳細画面の出口は、そこで隠した行を戻さない", async () => {
    const host = await startWith([loaded("atlas", [TASK]), unreadable("kanri")]);
    click(only(host, '[title="Atlas のプロジェクト詳細画面を開きます"]'));
    await settled();

    openMenu(host);
    toggle(host, "Atlas");
    press(only(host, MENU), "Escape");
    click(byText(host, "button", "このプロジェクトのレーンへ"));
    await settled();

    expect(host.querySelector('[title="Atlas のプロジェクト詳細画面を開きます"]')).toBeNull();
    openMenu(host);
    expect(projectLines(host)).toEqual([
      { label: "Atlas", shown: false },
      { label: "kanri", shown: true },
    ]);
  });

  /**
   * A reload is not the user asking a hidden row back: the row that arrives re-read is still the row
   * they put away. (行非表示 survives a restart since decision-13 の 再起動をまたぐ保持の改訂, which is a
   * different thing again — that one is the value being restored, this one is it not being cleared.)
   */
  it("再読込は非表示のままの行を戻さない", async () => {
    const host = await startWith([loaded("atlas", [TASK]), unreadable("kanri")]);
    openMenu(host);
    toggle(host, "Atlas");
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

const ROW_FOLD = '[aria-label="atlas の行折畳みを行う"]';
const COLUMN_FOLD = '[aria-label="To Do 列の列折畳みを行う"]';

/**
 * The レーンヘッダ行 of one project. Both rows read as the same project *name* (`fixtures.ts` gives
 * every root the same `config.yml`), so the slug beside it is what tells them apart — which is also
 * the key 行折畳み is held under.
 */
function laneHead(host: HTMLElement, slug: string): HTMLElement {
  const head = [...host.querySelectorAll<HTMLElement>(".lane-head")].find(
    (candidate) => candidate.querySelector(".slug")?.textContent === slug,
  );
  if (head === undefined) {
    throw new Error(`no レーンヘッダ行 for ${slug}`);
  }
  return head;
}

/** Which rows are drawn folded, by the counts a fold leaves in their header (doc-7 §2.3). */
function foldedRows(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".lane-head")]
    .filter((head) => head.querySelector(".fold-counts") !== null)
    .map((head) => head.querySelector(".slug")?.textContent ?? "");
}

/** Which columns are drawn folded, by the name each keeps in its 縦帯 (doc-7 §2.2). */
function foldedColumns(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".head.folded .label")].map(
    (label) => label.textContent ?? "",
  );
}

/** Which rows the grid is drawing at all, in order — a 行非表示 row has no レーンヘッダ行 (doc-7 §5.1). */
function drawnRows(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".lane-head .slug")].map(
    (slug) => slug.textContent ?? "",
  );
}

/**
 * 折畳み 2 種の 実行内保持 (doc-7 §5.1, TASK-147).
 *
 * 実行内保持 is about the value still being there when the user comes back to the screen, and the grid
 * is unmounted on both routes below — so where 列折畳み・行折畳み are held is what decides it, and only
 * the shell can be asked. `Swimlane.svelte` held them until TASK-147, which made both routes reset
 * them; the counts and the head class asserted here are the same ones `swimlane.ts` computes, so what
 * these tests add is the screen change in between.
 *
 * **Separate from 再起動をまたぐ保持** (the describe after next, TASK-148): that one is the file, this one
 * is where the value lives while the app runs. doc-7 §5.1 keeps both, and the second did not make the
 * first redundant — a value the grid held would still be lost on every screen change.
 */
// -------------------------------------------------------------------------------------------------

/**
 * 外部で開く (doc-7 §2.1, decision-45). **画面横断契約 だけを持つ** — 行の集合・語・保留理由 は
 * `external-editor.test.ts` の純関数の側にあり、ここが持つのは 2 画面をまたぐ 3 つである: 対象が
 * どの画面から来るか、サブメニューの出口の梯子、そして刻みがアプリ設定へ届くこと。
 */
describe("外部で開く (doc-7 §2.1, decision-45)", () => {
  const MENU = '[role="dialog"][aria-label="メニュー"]';
  const SUBMENU = '[role="group"][aria-label="外部で開く"]';

  /** The ☰ is an アイコンのみのボタン, so it is found by its name — which the 表示言語 also translates. */
  function openMenu(host: HTMLElement, menuName = "メニュー"): void {
    if (host.querySelector(`[role="dialog"][aria-label="${menuName}"]`) === null) {
      click(byLabel(host, "button.header-entry", menuName));
    }
  }

  function parentLine(host: HTMLElement, names = { menu: "メニュー", line: "外部で開く" }) {
    openMenu(host, names.menu);
    return byText<HTMLButtonElement>(
      host,
      `[role="dialog"][aria-label="${names.menu}"] button`,
      names.line,
    );
  }

  function openSubmenu(
    host: HTMLElement,
    names = { menu: "メニュー", line: "外部で開く" },
  ): HTMLElement {
    click(parentLine(host, names));
    const submenu = host.querySelector<HTMLElement>(
      `[role="group"][aria-label="${names.line}"]`,
    );
    if (submenu === null) {
      throw new Error(`expected the ${names.line} submenu`);
    }
    return submenu;
  }

  /**
   * 対象未選択 では理由付きで保留する (decision-45 §1, doc-11 §5). **行は消えない** — 行の有無が状態を
   * 述べる形にすると、メニューの項目数が状況ごとに違う値になる。
   */
  it("対象を選んでいないあいだは理由付きで保留し、選ぶと押せるようになる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);

    const held = parentLine(host);
    expect(held.getAttribute("aria-disabled")).toBe("true");
    expect(only(host, MENU).textContent).toContain("選ばれていません");
    // 保留されている行はサブメニューを開かない — 開いた 7 行が全部同じ理由で押せないのは、同じことを
    // 7 度述べるだけである。
    click(held);
    expect(host.querySelector(SUBMENU)).toBeNull();

    click(byLabel(host, "button.header-entry", "メニュー"));
    click(only(host, "button.card"));
    await settled();
    expect(parentLine(host).getAttribute("aria-disabled")).toBe("false");
  });

  /**
   * 対象は画面ではなく対象で定まる (decision-45 §1). **プロジェクト詳細画面 の 3 つの選択も対象になる** —
   * それがこのタスクの中心で、それまで外部へ出せたのはタスクだけだった。
   */
  it("プロジェクト詳細で文書を選んでも同じ行が押せるようになる", async () => {
    const host = await startWith([loaded("atlas", [TASK], undefined, [DOCUMENT])]);
    click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
    await settled();

    // 区画を開いただけでは 対象未選択 である (decision-45 §1)。
    click(sectionTab(host, "文書"));
    await settled();
    expect(parentLine(host).getAttribute("aria-disabled")).toBe("true");
    click(byLabel(host, "button.header-entry", "メニュー"));

    click(only(host, "button.card"));
    await settled();
    expect(parentLine(host).getAttribute("aria-disabled")).toBe("false");
    click(byText<HTMLButtonElement>(openSubmenu(host), "button", "OS の関連付けで開く…"));
    await settled();
    click(
      byText(
        only(host, '[role="dialog"][aria-label="OS の関連付けで開く"]'),
        ".answers button",
        "OS の関連付けで開く",
      ),
    );
    await settled();
    // 渡ったのは選んだ文書のパスである — タスクのものではない。
    const call = madeTo("managed_file_open").at(-1);
    expect(String(call?.args[1])).toContain("/docs/");
  });

  /**
   * 出口の梯子は 3 段 (decision-45 §3). Escape はサブメニューだけを降ろす — 1 回の押下が降ろすのは
   * 常に 1 つで、それが 被せ層 を 1 枚と数えられる根拠そのものである。
   */
  it("Escape はサブメニューだけを降ろし、もう一度でメニューが降りる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    openSubmenu(host);

    press(only(host, MENU), "Escape");
    await settled();
    expect(host.querySelector(SUBMENU)).toBeNull();
    expect(host.querySelector(MENU)).not.toBeNull();

    press(only(host, MENU), "Escape");
    await settled();
    expect(host.querySelector(MENU)).toBeNull();
  });

  /** 親の行の再押下もサブメニューだけを降ろす (梯子の 3 段目)。 */
  it("親の行をもう一度押すとサブメニューだけが降りる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    openSubmenu(host);
    click(parentLine(host));
    expect(host.querySelector(SUBMENU)).toBeNull();
    expect(host.querySelector(MENU)).not.toBeNull();
  });

  /**
   * 注意の抑止 (decision-45 §6, doc-11 §15 ②). **刻みはアプリ設定へ届く** — セッション内だけで覚える形に
   * すると「今後」が次の起動で嘘になる。届いた先が読み取り専用なら記録できず、注意は立ち続ける
   * （記録の経路が 設定 の保存と同じ 1 つだからそうなる）。
   */
  it("今後表示しない を刻んで進むと、アプリ設定へ書かれ、次の押下では層が立たない", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();

    click(byText<HTMLButtonElement>(openSubmenu(host), "button", "Visual Studio Code で開く…"));
    await settled();
    const dialog = only(host, '[role="dialog"][aria-label="Visual Studio Code で開く"]');
    expect(dialog.textContent).toContain("frontmatter");
    const tick = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (tick === null) {
      throw new Error("expected the 今後表示しない tick");
    }
    tick.checked = true;
    tick.dispatchEvent(new Event("change", { bubbles: true }));
    click(byText(dialog, ".answers button", "Visual Studio Code で開く"));
    await settled();

    expect(madeTo("managed_file_open")).toHaveLength(1);
    const saved = madeTo("settings_save").at(-1);
    expect(saved).not.toBeUndefined();
    expect(JSON.stringify(saved?.args)).toContain('"suppress_frontmatter_notice":true');

    // 2 度目は層が立たず、押下がそのまま起動になる。
    click(byText<HTMLButtonElement>(openSubmenu(host), "button", "Visual Studio Code で開く"));
    await settled();
    expect(madeTo("managed_file_open")).toHaveLength(2);
  });

  /**
   * `external-editor.ts` の文も 表示言語 で入れ替わる。**この module の文はもうタスク詳細のパネルに
   * 出ない**（decision-45 §8）ので、あちらの描き直しの試験から外れたぶんをここで持つ。
   */
  it("外部で開く のサブメニューも 表示言語 で入れ替わる", async () => {
    const host = await startWith([loaded("atlas", [TASK])]);
    click(only(host, "button.card"));
    await settled();
    expect(openSubmenu(host).textContent).toContain("Finder で表示");

    press(only(host, MENU), "Escape");
    press(only(host, MENU), "Escape");
    await switchToEnglish(host);

    const english = openSubmenu(host, { menu: "Menu", line: "Open externally" });
    expect(english.textContent).toContain("Reveal in Finder");
    expect(english.textContent).not.toContain("Finder で表示");
  });
});

describe("折畳み 2 種は画面を移っても効いたまま", () => {
  /**
   * 別ルートのタスク: a second loaded row, so a fold of one row is not a fold of every row — and the
   * one card still on screen once both folds are on, since a folded row hides its cells and a folded
   * column narrows its own. That is what the 全面シングルビュー route needs to select.
   */
  const OTHER = taskView({
    id: "TASK-9",
    project: "kanri",
    title: "別ルートの題",
    status: "In Progress",
    column: "inProgress",
    ordinal: 1000,
  });

  /** Fold the atlas row and the To Do column, and check that both took. */
  async function withBothFolds(): Promise<HTMLElement> {
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    click(only(host, ROW_FOLD));
    click(only(host, COLUMN_FOLD));
    await settled();

    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(foldedColumns(host)).toEqual(["To Do"]);
    return host;
  }

  it("プロジェクト詳細画面へ移って戻っても、畳んだ行と列はそのまま", async () => {
    const host = await withBothFolds();

    click(only(laneHead(host, "atlas"), "button.project"));
    await settled();
    // The grid is down while the other screen is up, which is the whole difficulty: nothing it held
    // is on screen to be read back.
    expect(host.querySelector(".lane-head")).toBeNull();

    click(byLabel(host, "button.back", "スイムレーンへ戻る"));
    await settled();

    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(foldedColumns(host)).toEqual(["To Do"]);
  });

  /**
   * 全面シングルビュー はスイムレーンを退ける (doc-8 §2.1), so selecting a card unmounts the grid on
   * this placement alone — the same loss as the screen change above, reached without leaving the
   * screen. Held separately because the two are different branches of the shell's template: a fix
   * that lifted the value for one route only would leave this one resetting the fold.
   */
  it("全面シングルビューでタスクを開いて閉じても、畳んだ行と列はそのまま", async () => {
    answers.settings = {
      ...answers.settings,
      settings: { ...answers.settings.settings, default_detail_placement: "full" },
    };
    const host = await withBothFolds();

    click(byText(host, "button.card .title", "別ルートの題").closest("button.card")!);
    await settled();
    expect(host.querySelector(".lane-head")).toBeNull();

    click(only(host, "button.close"));
    await settled();

    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(foldedColumns(host)).toEqual(["To Do"]);
  });
});

// -------------------------------------------------------------------------------------------------

/**
 * 3 値の 再起動をまたぐ保持 (doc-7 §5.1, decision-13 の 再起動をまたぐ保持の改訂, TASK-148).
 *
 * The pure rules are `swimlane.test.ts`'s (`restoredColumns` / `restoredRows`) and `settings.test.ts`'s
 * (the three fields surviving `mergeDraft` and counting in `isDirty`). What is only here is the wiring:
 * a press has to reach the file, a start has to take what the file holds, and the row half of
 * 復元時の正規化 has to happen after the ledger is read — the settings are read *first* during startup
 * (the describe at the top of this file fixes that order), so a normalization done where they arrive
 * would drop every saved slug and pass every pure test.
 */
describe("3 値は再起動をまたいで効く", () => {
  const OTHER = taskView({
    id: "TASK-9",
    project: "kanri",
    title: "別ルートの題",
    status: "In Progress",
    column: "inProgress",
    ordinal: 1000,
  });

  /** The アプリ設定 a start reads, with the three values set to `values`. */
  function savedGridState(values: {
    collapsed_columns?: string[];
    folded_rows?: string[];
    hidden_rows?: string[];
  }): void {
    answers.settings = {
      ...answers.settings,
      settings: { ...answers.settings.settings, ...values } as typeof answers.settings.settings,
    };
  }

  /** What the last settings write sent, or `undefined` if nothing was written. */
  function lastWrite(): Record<string, unknown> | undefined {
    return madeTo("settings_save").at(-1)?.args[0] as Record<string, unknown> | undefined;
  }

  it("畳む・隠すの押下ごとに、3 値がアプリ設定へ書かれる", async () => {
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    expect(madeTo("settings_save")).toHaveLength(0);

    click(only(host, ROW_FOLD));
    await settled();
    expect(lastWrite()).toMatchObject({ folded_rows: ["atlas"], collapsed_columns: [] });

    click(only(host, COLUMN_FOLD));
    await settled();
    expect(lastWrite()).toMatchObject({ folded_rows: ["atlas"], collapsed_columns: ["toDo"] });

    // 行非表示 goes through the menu, which is the only control for it (doc-7 §2.1, TASK-131). Taken by
    // position rather than by name: both rows read as the same project name, and the 表示切替行 are in
    // ledger order (doc-7 §2.1), so the first one is atlas.
    click(byLabel(host, "button.header-entry", "メニュー"));
    const lines = [
      ...only(host, '[role="dialog"][aria-label="メニュー"]').querySelectorAll<HTMLButtonElement>(
        "button[aria-pressed]",
      ),
    ];
    click(lines[0]);
    await settled();
    // All three on every write: the file is written whole, so a press that sent only its own value
    // would delete the other two.
    expect(lastWrite()).toMatchObject({
      collapsed_columns: ["toDo"],
      folded_rows: ["atlas"],
      hidden_rows: ["atlas"],
    });

    // すべてのプロジェクトを表示 (doc-7 §2.1) is the fourth writer of the three values, and it empties one
    // of them — a press that changed the screen without reaching the file would come back on the next
    // start with the rows hidden again.
    click(byText(host, '[role="dialog"][aria-label="メニュー"] button', showAllProjectsLabel()));
    await settled();
    expect(lastWrite()).toMatchObject({ hidden_rows: [], folded_rows: ["atlas"] });
  });

  it("保存された 3 値で起動すると、その行と列が畳まれ、非表示の行は出ない", async () => {
    savedGridState({
      collapsed_columns: ["toDo"],
      folded_rows: ["atlas"],
      hidden_rows: ["kanri"],
    });
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);

    expect(drawnRows(host)).toEqual(["atlas"]);
    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(foldedColumns(host)).toEqual(["To Do"]);
  });

  /**
   * AC #5. The アプリ設定ファイル is hand-editable (doc-3 §2.2) and the ledger changes by its own route, so
   * a slug in either row value may be one the ledger no longer has. It must draw the rows it does have
   * — and the next write must no longer carry the stale slug, or the file would keep it for good.
   */
  it("台帳に無い slug が保存値に残っていても、画面は残りの行を描き、落とした結果を書き戻す", async () => {
    savedGridState({ folded_rows: ["ghost", "atlas"], hidden_rows: ["ghost"] });
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);

    expect(drawnRows(host)).toEqual(["atlas", "kanri"]);
    expect(foldedRows(host)).toEqual(["atlas"]);
    // Written back at once, without waiting for a press: left in the file, `ghost` outlives the
    // registration and the row comes up folded if that slug is ever registered again.
    expect(lastWrite()).toMatchObject({ folded_rows: ["atlas"], hidden_rows: [] });
  });

  /**
   * 登録解除 drops that row's 行折畳み・行非表示 (doc-7 §5.1), and the file has to lose them too — else the
   * same slug registered again, by 登録 or by hand in the ledger (doc-3 §2.2), comes up hidden.
   */
  it("登録解除 した行の slug は、保存値からも消える", async () => {
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    click(only(host, ROW_FOLD));
    await settled();

    // By the row's slug: both rows read as the same project name (`fixtures.ts`), so the name in the
    // control's own label cannot tell them apart.
    click(only(laneHead(host, "atlas"), "button.project"));
    await settled();
    fill(only<HTMLInputElement>(host, 'input[placeholder="atlas"]'), "atlas");
    // The ledger the boundary answers with is the one without that entry — the fake returns whatever
    // `answers.ledger` holds, so removal is expressed by handing it the shorter ledger.
    answers.ledger = ledgerFor(entry("kanri"));
    click(byText(host, ".danger button", msg().projectDetail.unregister));
    await settled();

    expect(lastWrite()).toMatchObject({ folded_rows: [], hidden_rows: [] });
  });

  /**
   * The next press is the retry, so a write that goes through has to take the refusal down — and only
   * its own: a 通知 raised by anything else since is not this press's to clear.
   */
  it("保存が通ると、その前の保存失敗の通知だけが降りる", async () => {
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    answers.settingsSaveFails = true;
    click(only(host, ROW_FOLD));
    await settled();
    expect(host.querySelector('.band[data-band="notice"]')).not.toBeNull();

    answers.settingsSaveFails = false;
    click(only(host, COLUMN_FOLD));
    await settled();
    expect(host.querySelector('.band[data-band="notice"]')).toBeNull();
    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(foldedColumns(host)).toEqual(["To Do"]);
  });

  it("別の理由で立った通知は、保存が通っても降りない", async () => {
    // `startWatch` raised it, and a fold is not the retry of a watch that would not start (doc-9 §3).
    answers.watchStart = () => Promise.reject(new Error("watch is gone"));
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    expect(host.querySelector('.band[data-band="notice"]')).not.toBeNull();

    click(only(host, ROW_FOLD));
    await settled();
    expect(host.querySelector('.band[data-band="notice"]')).not.toBeNull();
  });

  /**
   * doc-7 §2.2 forbids collapsing every 正準ステータス列 and the control enforces it, so a saved set of
   * all four came from somewhere else. Restoring it would leave a grid of four bands.
   */
  it("4 列すべてを畳んだ保存値は、どの列も開いた状態で読む", async () => {
    savedGridState({ collapsed_columns: ["toDo", "inProgress", "inReview", "done"] });
    const host = await startWith([loaded("atlas", [TASK])]);

    expect(foldedColumns(host)).toEqual([]);
  });

  /**
   * decision-13 never overwrites a settings file newer than this build, so the write can be refused
   * while the fold itself is perfectly legal. What that costs is the next start, not the fold — and the
   * refusal is said in the ⑤ 通知, because none of the three controls has room for a sentence.
   */
  it("保存が断られても畳んだままで、理由は ⑤ 通知 が述べる", async () => {
    const host = await startWith([loaded("atlas", [TASK]), loaded("kanri", [OTHER])]);
    answers.settingsSaveFails = true;

    click(only(host, ROW_FOLD));
    await settled();

    expect(foldedRows(host)).toEqual(["atlas"]);
    expect(only(host, '.band[data-band="notice"]').textContent).toContain("read-only");
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

describe("並び順は帯と設定画面が書く 1 つの項目", () => {
  /**
   * 並び順 (doc-7 §5.4) は帯が選び、選んだ時点でアプリ設定の既定になる — 書き手が 2 つある 1 つの値で、
   * その 2 つを結んでいるのはシェルだけである（帯は値を受け取って返すだけ、設定画面は自分の下書きしか
   * 知らない）。純関数が持てるのは並びの規則そのもの（`swimlane.test.ts`）までで、**選択が保存に
   * 失敗したあと、無関係な保存で元へ戻らない**ことはここでしか固定できない。
   */
  const OLDER = taskView({
    id: "TASK-8",
    title: "古い方",
    status: "To Do",
    column: "toDo",
    updatedDate: "2026-07-01 09:00",
  });
  const NEWER = taskView({
    id: "TASK-9",
    title: "新しい方",
    status: "To Do",
    column: "toDo",
    updatedDate: "2026-07-20 09:00",
  });

  /** The ids the grid is showing, top to bottom. Both tasks are in the one row's To Do cell. */
  function cellIds(host: HTMLElement): string[] {
    return [...host.querySelectorAll(".card .identity")].map(
      (element) => element.textContent?.trim() ?? "",
    );
  }

  function chooseOrder(host: HTMLElement, label: string): void {
    // By the bar's own selector rather than by its announced name: the name comes from the `<label>`
    // wrapping it, which `announced` does not walk up to (it reads the element's own).
    const select = only<HTMLSelectElement>(host, ".bar .order select");
    const option = [...select.options].find((candidate) => candidate.textContent?.trim() === label);
    if (option === undefined) {
      throw new Error(`no 並び順 called ${label}`);
    }
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  it("帯で選ぶと並びが変わり、その選択が既定として保存される", async () => {
    const host = await startWith([loaded("atlas", [NEWER, OLDER])]);
    // 既定 (priority 降順) では、priority も ordinal も無い 2 件は updated_date の新しい順になる。
    expect(cellIds(host)).toEqual(["atlas:TASK-9", "atlas:TASK-8"]);

    chooseOrder(host, "updated 昇順");
    await settled();
    expect(cellIds(host)).toEqual(["atlas:TASK-8", "atlas:TASK-9"]);
    expect(madeTo("settings_save").at(-1)?.args[0]).toMatchObject({
      default_card_order: "updated_asc",
    });
  });

  it("保存が断られても選んだ並びは残り、次の保存もそれを戻さない", async () => {
    const host = await startWith([loaded("atlas", [NEWER, OLDER])]);
    answers.settingsSaveFails = true;

    chooseOrder(host, "updated 昇順");
    await settled();
    // 並びは変わっている — 断られたのは永続だけで、選択そのものではない。
    expect(cellIds(host)).toEqual(["atlas:TASK-8", "atlas:TASK-9"]);
    expect(only(host, ".bar .order-failure").textContent).toContain("read-only");

    // 断られた書き込みはファイルへ届いていないので、**別の項目**の保存が通ったときに返ってくる設定は
    // 古い並び順を持っている。それをそのまま取り込むと、利用者から見れば「選び直した並びが、無関係な
    // 保存のたびに勝手に戻る」ことになる。ここで通すのは設定画面の 継続検出 で、並び順には触れない。
    answers.settingsSaveFails = false;
    click(byLabel(host, "button.header-entry", "メニュー"));
    click(byLabel(host, '[role="dialog"][aria-label="メニュー"] button', "設定"));
    click(byText(host, '[aria-label="設定"] label.choice', "継続検出を使う").querySelector("input")!);
    click(byText(host, "footer button", saveLabel()));
    await settled();

    expect(madeTo("settings_save").at(-1)?.args[0]).toMatchObject({
      watch_external_changes: false,
      // The file never took the bar's choice, so this write carries the order it had before.
      default_card_order: "priority_desc",
    });
    expect(cellIds(host)).toEqual(["atlas:TASK-8", "atlas:TASK-9"]);
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
