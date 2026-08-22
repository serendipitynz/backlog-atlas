import { describe, expect, it } from "vitest";
import { createOverlayController, initialOverlayState } from "./overlay-controller";
import type { IssueConfirmation } from "./edit";

const CONFIRMATION: IssueConfirmation = {
  title: "アーカイブ",
  question: "アーカイブすると元の場所には戻せません。",
  proceed: "アーカイブする",
};

function harness() {
  const state = initialOverlayState();
  const focused: number[] = [];
  const settingsOpens: number[] = [];
  const controller = createOverlayController(state, {
    focusOpener: () => focused.push(focused.length),
    onSettingsOpened: () => settingsOpens.push(settingsOpens.length),
  });
  return { state, controller, focused, settingsOpens };
}

/** A layer standing over the screen, with the menu and the 値一覧 open behind it. */
function withMenuAndPopover(h: ReturnType<typeof harness>): void {
  h.state.menuOpen = true;
  h.state.filterPopoverOpen = true;
}

describe("被せ層 は同時に 1 枚", () => {
  it("共通入口 を開くとメニューと値一覧を閉じ、☰ へ焦点を戻す", () => {
    const h = harness();
    withMenuAndPopover(h);

    h.controller.openEntry("register");

    expect(h.state.registerOpen).toBe(true);
    expect(h.state.menuOpen).toBe(false);
    expect(h.state.filterPopoverOpen).toBe(false);
    expect(h.focused).toHaveLength(1);
  });

  it("設定を開くと、その画面が要る問い合わせも出る", () => {
    const h = harness();

    h.controller.openEntry("settings");

    expect(h.state.settingsOpen).toBe(true);
    expect(h.settingsOpens).toHaveLength(1);
  });

  it("一覧モーダル も同じ作法で開く", () => {
    const h = harness();
    withMenuAndPopover(h);

    h.controller.openShortcutHelp();

    expect(h.state.shortcutHelpOpen).toBe(true);
    expect(h.state.menuOpen).toBe(false);
    expect(h.focused).toHaveLength(1);
  });

  it("値一覧を開くとメニューは閉じる（逆も同じ）", () => {
    const h = harness();
    h.state.menuOpen = true;

    h.controller.setFilterPopover(true);
    expect(h.state.menuOpen).toBe(false);

    h.controller.openMenu();
    expect(h.state.filterPopoverOpen).toBe(false);
  });

  /**
   * doc-10 §1 の 作成モーダル は プロジェクト詳細画面 が自分で上げる。**焦点は動かさない** — 押した入口は
   * 外れておらず、この呼び出しは層が焦点を取った後に走るので、ここで `focus()` すると層の外へ出る。
   */
  it("プロジェクト詳細が自分で上げた層は、焦点を動かさない", () => {
    const h = harness();
    withMenuAndPopover(h);

    h.controller.detailOverlay(true);

    expect(h.state.menuOpen).toBe(false);
    expect(h.state.filterPopoverOpen).toBe(false);
    expect(h.focused).toHaveLength(0);
  });

  it("その層が降りたときは何も閉じない", () => {
    const h = harness();
    h.controller.detailOverlay(true);
    h.state.menuOpen = true;

    h.controller.detailOverlay(false);

    expect(h.state.detailModalOpen).toBe(false);
    expect(h.state.menuOpen).toBe(true);
  });

  /**
   * その画面は自分の報告を effect の後始末で取り下げるが、`screen` を第 2 の錠として併せて読む。
   * スイムレーンにはあちらの層が立ちえないという事実は、取り下げが効くかどうかとは別に主張してよい。
   */
  it("プロジェクト詳細の層は、その画面にいるときだけ 1 枚に数える", () => {
    const h = harness();
    h.controller.detailOverlay(true);

    expect(h.controller.modalOpen(true)).toBe(true);
    expect(h.controller.modalOpen(false)).toBe(false);
  });

  it("実行前確認 も 1 枚に数える", () => {
    const h = harness();
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => undefined);

    expect(h.controller.modalOpen(false)).toBe(true);
  });
});

describe("破棄前確認", () => {
  it("未保存入力が無ければそのまま進む", () => {
    const h = harness();
    const taken: number[] = [];

    h.controller.guardDiscard(false, () => taken.push(1));

    expect(taken).toEqual([1]);
    expect(h.state.pendingDiscard).toBeNull();
  });

  it("あれば続きを預かり、答えを待つ", () => {
    const h = harness();
    const taken: number[] = [];

    h.controller.guardDiscard(true, () => taken.push(1));
    expect(taken).toEqual([]);

    h.controller.discardConfirmed();
    expect(taken).toEqual([1]);
    expect(h.state.pendingDiscard).toBeNull();
  });

  it("編集に戻る は預かりを落とし、続きは走らせない", () => {
    const h = harness();
    const taken: number[] = [];
    h.controller.guardDiscard(true, () => taken.push(1));

    h.controller.keepEditing();

    expect(taken).toEqual([]);
    expect(h.state.pendingDiscard).toBeNull();
  });

  /**
   * doc-11 §7: 入力を持つ 2 つのモーダルだけが問いを内側に描く。層が立っている間はその後ろを押せない
   * ので、そのとき立っている問いはその層の出口のものである。**一覧モーダルは入っていない** — 何も
   * 持たないので問いを上げず、名指しすると後ろで上がった問いを描けない層へ移してしまう。
   */
  it("入力を持つモーダルが立っていれば、問いはその層が描く", () => {
    const h = harness();
    h.controller.guardDiscard(true, () => undefined);

    expect(h.controller.confirmInModal()).toBe(false);
    expect(h.controller.confirmingInBand()).toBe(true);

    h.state.settingsOpen = true;
    expect(h.controller.confirmInModal()).toBe(true);
    expect(h.controller.modalConfirm()).not.toBeNull();
    // 1 つの問いは 1 度だけ描く — 帯にも出すと、層を抜けた先で 2 枚目に出会う。
    expect(h.controller.confirmingInBand()).toBe(false);
  });

  it("一覧モーダルは問いを引き受けない", () => {
    const h = harness();
    h.controller.guardDiscard(true, () => undefined);
    h.state.shortcutHelpOpen = true;

    expect(h.controller.confirmInModal()).toBe(false);
    expect(h.controller.confirmingInBand()).toBe(true);
  });

  it("問いが無ければ層に渡す答えも無い", () => {
    const h = harness();
    h.state.settingsOpen = true;

    expect(h.controller.modalConfirm()).toBeNull();
  });

  /**
   * 後ろで上がった未回答の問いは、覆う層の下で失効する。どの層が問いを描くかは前面がどれかで決まる
   * ので、別の経路が上げた問いをこのモーダルが「自分の出口が訊いた」ものとして描くことになる。
   */
  it("層を上げると、後ろの未回答の問いは失効する", () => {
    const h = harness();
    const taken: number[] = [];
    h.controller.guardDiscard(true, () => taken.push(1));

    h.controller.openEntry("register");

    expect(h.state.pendingDiscard).toBeNull();
    expect(taken).toEqual([]);
  });

  it("実行前確認 を上げるときも同じである", () => {
    const h = harness();
    h.controller.guardDiscard(true, () => undefined);

    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => undefined);

    expect(h.state.pendingDiscard).toBeNull();
  });
});

describe("設定モーダルの出口", () => {
  it("保存が未解決の間はどの出口も断る", () => {
    const h = harness();
    h.state.settingsOpen = true;
    h.state.settingsDirty = true;
    h.state.settingsSaving = true;

    h.controller.closeSettings(false);

    expect(h.state.settingsOpen).toBe(true);
    expect(h.state.pendingDiscard).toBeNull();
  });

  it("下書きがあれば訊き、答えれば層と問いが一緒に降りる", () => {
    const h = harness();
    h.state.settingsOpen = true;
    h.state.settingsDirty = true;

    h.controller.closeSettings(false);
    expect(h.state.settingsOpen).toBe(true);
    expect(h.state.pendingDiscard).not.toBeNull();

    h.controller.discardConfirmed();
    expect(h.state.settingsOpen).toBe(false);
    expect(h.state.pendingDiscard).toBeNull();
  });

  /** 変更せずに閉じる は下書きの行方を語で述べているので、問いは訊くことが残っていない。 */
  it("行方を述べた出口からは訊かない", () => {
    const h = harness();
    h.state.settingsOpen = true;
    h.state.settingsDirty = true;

    h.controller.closeSettings(true);

    expect(h.state.settingsOpen).toBe(false);
    expect(h.state.pendingDiscard).toBeNull();
  });

  it("保存が通った出口は何も破棄しない", () => {
    const h = harness();
    h.state.settingsOpen = true;
    h.state.settingsDirty = true;

    h.controller.settingsSaved();

    expect(h.state.settingsOpen).toBe(false);
    expect(h.state.pendingDiscard).toBeNull();
  });

  /**
   * 問いを残して層を降ろすと、覆っていた画面の上に 帯 ① として戻ってくる — もうどこにも無い入力に
   * ついての問いで、しかも済んだ続きを提示する。
   */
  it("層が降りるとき、未回答の問いも一緒に落ちる", () => {
    const h = harness();
    h.state.settingsOpen = true;
    h.state.settingsDirty = true;
    h.controller.closeSettings(false);

    // 下書きがファイルの値へ戻ったので、次の押下は門を素通りする。
    h.state.settingsDirty = false;
    h.controller.closeSettings(false);

    expect(h.state.settingsOpen).toBe(false);
    expect(h.state.pendingDiscard).toBeNull();
  });
});

describe("登録モーダルの出口", () => {
  it("発行が未解決の間は断る", () => {
    const h = harness();
    h.state.registerOpen = true;
    h.state.registerSubmitting = true;

    h.controller.closeRegister();

    expect(h.state.registerOpen).toBe(true);
  });

  it("打ったものがあれば訊く", () => {
    const h = harness();
    h.state.registerOpen = true;
    h.state.registerDirty = true;

    h.controller.closeRegister();

    expect(h.state.registerOpen).toBe(true);
    expect(h.state.pendingDiscard).not.toBeNull();
  });

  it("無ければそのまま閉じる", () => {
    const h = harness();
    h.state.registerOpen = true;

    h.controller.closeRegister();

    expect(h.state.registerOpen).toBe(false);
  });
});

describe("実行前確認", () => {
  it("進む は問いを降ろして続きを取る", () => {
    const h = harness();
    const taken: number[] = [];
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => taken.push(1));

    h.controller.issueConfirmed();

    expect(taken).toEqual([1]);
    expect(h.state.pendingIssue).toBeNull();
  });

  it("やめる は何も起こさずに落とす", () => {
    const h = harness();
    const taken: number[] = [];
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => taken.push(1));

    h.controller.cancelIssue();

    expect(taken).toEqual([]);
    expect(h.state.pendingIssue).toBeNull();
  });

  /**
   * 対象が無い（タスクが開いていない、あるいはパネルが読取結果から消えたファイルを描いている）とき
   * 訊かない。訊いたら、下の画面が断っている行為を層の中で提示することになる。
   */
  it("対象が無ければ何も訊かない", () => {
    const h = harness();

    h.controller.askIssue(null, CONFIRMATION, () => undefined);

    expect(h.state.pendingIssue).toBeNull();
  });

  /** doc-11 §12 の ③ 失効。**隠すのではなく落とす** — 残すと次にそのタスクを選んだとき戻ってくる。 */
  it("対象が動いたら失効する", () => {
    const h = harness();
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => undefined);

    h.controller.lapseIssue("/atlas/task-2.md");

    expect(h.state.pendingIssue).toBeNull();
  });

  it("対象が同じままなら立っている", () => {
    const h = harness();
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => undefined);

    h.controller.lapseIssue("/atlas/task-1.md");

    expect(h.state.pendingIssue).not.toBeNull();
  });

  it("対象が消えたら失効する", () => {
    const h = harness();
    h.controller.askIssue("/atlas/task-1.md", CONFIRMATION, () => undefined);

    h.controller.lapseIssue(null);

    expect(h.state.pendingIssue).toBeNull();
  });
});

describe("メニュー", () => {
  it("閉じたら開いた控えへ焦点を戻す", () => {
    const h = harness();
    h.controller.openMenu();

    h.controller.closeMenu();

    expect(h.state.menuOpen).toBe(false);
    expect(h.focused).toHaveLength(1);
  });

  it("値一覧を閉じるときはメニューを触らない", () => {
    const h = harness();
    h.state.menuOpen = true;

    h.controller.setFilterPopover(false);

    expect(h.state.menuOpen).toBe(true);
  });
});
