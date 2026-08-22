/**
 * 被せ層 and 未保存確認 (doc-7 §2.1, doc-8 §6.3, doc-11 §7・§12): which layer is up, and what stands
 * between a route and the input it would discard.
 *
 * These are one subject and not two. 被せ層 は同時に 1 枚 is why opening anything closes the menu and the
 * 値一覧; which layer is frontmost is what decides where a 破棄前確認 is *drawn*; and an unanswered
 * question lapses under a layer about to cover it. Every one of those sentences names both halves, and
 * while they were the shell's each was written out again at each of the seven or eight places that
 * raise a layer.
 *
 * **What is not here.** `screen` — which of the two screens is showing — is navigation, and the shell
 * keeps it: this controller is asked *whether* a route may proceed and never where it goes. The two
 * 未保存 flags below are named for what holds the input rather than for a screen, for the same reason.
 *
 * **Unlike the other controllers, six fields of [`OverlayState`] are written from outside**, for two
 * different reasons, and both are the point rather than a leak.
 *
 * The four 未保存 / 下書き flags, because only the component holding a 下書き knows whether it has one, and
 * only the shell knows that it has just unmounted the panel that held it — a component's own `ondirty`
 * cannot retract a flag after it is gone.
 *
 * `registerSubmitting` and `settingsSaving`, because **another controller owns the fact**: the ledger's
 * `registering` port and the settings' `busy` port are what raise them, since each knows when its own
 * write is unresolved and this file does not. It only reads them, in the two 出口 below — which is the
 * whole reason they are held at this level rather than in the forms (doc-11 §7: neither モーダル's Escape
 * reaches the form).
 *
 * What this file owns is every *rule* those six feed — where the question is drawn, which exits it stands
 * in front of, when it lapses — and no caller decides any of that by writing a flag.
 */

import type { DiscardAnswers, IssueConfirmation } from "./edit";

/** The 実行前確認 standing right now (doc-11 §12), filed against the file it is about. */
export interface PendingIssue {
  /**
   * The task file the question is about. What makes 失効 decidable (§12 の ③): the question is about the
   * task the panel was pointed at when it was asked, and the panel moving off that file takes it with it.
   */
  path: string;
  confirmation: IssueConfirmation;
  proceed: () => void;
}

export interface OverlayState {
  /** Whether the ☰'s メニュー is open (doc-7 §2.1). */
  menuOpen: boolean;
  /**
   * Whether the フィルタ帯's 値一覧 is open (doc-7 §5.2). Held at this level rather than by the bar because
   * a key opens it as well, and a second opener would need its own way in.
   */
  filterPopoverOpen: boolean;
  /** Whether the menu's 「プロジェクトを登録」 モーダル is open (doc-7 §2.1). */
  registerOpen: boolean;
  /** Whether the 設定画面 is open. Opened from the menu's 設定 (doc-7 §2.1). */
  settingsOpen: boolean;
  /**
   * Whether the 一覧モーダル is open — where the 割り当て一覧's 画面に出す列 are read (doc-7 §2.1 holds the
   * record and that table apart). It is a モーダル and not part of the menu since TASK-67: the table is the
   * longest thing the menu held, and a reference folded under the entries pushed the entries themselves
   * out of the menu's own height.
   */
  shortcutHelpOpen: boolean;
  /**
   * What プロジェクト詳細画面 last reported through its `onoverlay` — whether its 作成モーダル (doc-10 §1) is
   * up. Held beside the other four because [`OverlayController.modalOpen`] reads all five, but it is not
   * one of them: that screen raises it, and this file's part is only the 1 枚 rule.
   */
  detailModalOpen: boolean;
  /**
   * Whether the 登録 form holds 未保存入力 — what makes the モーダル's exits ask first (doc-8 §6.3,
   * doc-11 §7). Held here rather than in the form because neither of the two exits that would lose it is
   * the form's own control.
   */
  registerDirty: boolean;
  /**
   * Whether a registration issued from that form is still unresolved. Read by both of the モーダル's
   * exits — the same shape as `settingsSaving` one screen over, and for the same reason
   * (`Modal.svelte`'s Escape reaches this layer, not the form).
   *
   * Not the ledger's own busy flag: that one also stands for a command プロジェクト詳細画面 issued, and
   * holding a モーダル closed for a write it is not reporting would give a reason that is not the one
   * that held.
   */
  registerSubmitting: boolean;
  /**
   * Whether the 設定 form's 下書き differs from the file — what makes the three exits ask before they
   * discard it (doc-8 §6.3, doc-11 §7). Held here because only two of the three are the form's own
   * controls, and the third (Escape) never reaches it.
   */
  settingsDirty: boolean;
  /**
   * Whether a 設定 save is still unresolved. Held here rather than in the form, because it has to close
   * *both* ways out of the モーダル: the form withholds its own two controls with it, and Escape reaches
   * this layer (`Modal.svelte`), not the form. One fact, one flag.
   */
  settingsSaving: boolean;
  /** True while the タスク詳細 panel holds 未保存入力 — what makes leaving the panel ask first. */
  detailDirty: boolean;
  /**
   * True while プロジェクト詳細画面 holds 未保存入力 — its 台帳エントリ編集・文書編集セッション and the three
   * create forms alike. Separate from `detailDirty` because they belong to different screens: only the
   * one being left has input to protect, and one flag for both would ask about a panel that is not even
   * mounted.
   */
  projectDirty: boolean;
  /**
   * What the user asked for while something held 未保存入力, held as the continuation to run once they
   * answer the 破棄前確認 (doc-8 §6.3). One pending action rather than a tagged union of destinations,
   * because doc-8 §6.3 puts all five routes — キャンセル・閉じる・別タスクを開く・前後移動・詳細配置の切替 —
   * behind the same question in the same words: what differs between them is only what happens after
   * "はい", which is exactly what a continuation carries.
   */
  pendingDiscard: (() => void) | null;
  /** The 実行前確認 standing right now (doc-11 §12), or `null` while nothing is being asked. */
  pendingIssue: PendingIssue | null;
}

export function initialOverlayState(): OverlayState {
  return {
    menuOpen: false,
    filterPopoverOpen: false,
    registerOpen: false,
    settingsOpen: false,
    shortcutHelpOpen: false,
    detailModalOpen: false,
    registerDirty: false,
    registerSubmitting: false,
    settingsDirty: false,
    settingsSaving: false,
    detailDirty: false,
    projectDirty: false,
    pendingDiscard: null,
    pendingIssue: null,
  };
}

/** The 共通入口 (doc-7 §2.1) — the two entries the menu opens as モーダル over whichever screen is up. */
export type OverlayEntry = "register" | "settings";

export interface OverlayControllerPorts {
  /**
   * Put focus on the control a モーダル comes back to. The ☰ is on every screen's topmost bar, so it is on
   * screen whichever route was taken into the modal — unlike the menu line that was pressed, which the
   * modal unmounts on its way up.
   */
  focusOpener: () => void;
  /**
   * What opening the 設定画面 asks for beyond the layer going up: the folder probe and 解決結果の表示. Both
   * are the settings controller's, and both are issued on every open rather than once — the folder can
   * have been created since, and the 外部コマンド can have been installed since, which is the likeliest
   * reason the user opened this screen at all.
   */
  onSettingsOpened: () => void;
}

export interface OverlayController {
  /**
   * Whether a モーダル is up. While one is, the shell answers no chord at all: doc-7 §2.1 keeps a modal's
   * focus inside itself, and the modal is what answers Escape and Tab there (`Modal.svelte`).
   *
   * `onProjectScreen` is read with プロジェクト詳細's own report as a second lock, not as the retraction:
   * that screen retracts its report from its effect's teardown, so a stale `true` should not outlive it.
   * The argument is what keeps a bug there from reaching the swimlane, where none of that screen's layers
   * can be up anyway — a fact worth asserting whether or not the retraction holds.
   */
  modalOpen: (onProjectScreen: boolean) => boolean;
  /**
   * Whether the 破棄前確認 standing right now belongs inside a モーダル rather than in the 上部帯 (doc-11 §7).
   * Only the two モーダル that hold input are asked about: while one of them is up nothing behind it can be
   * pressed (the layer covers the window and keeps focus inside), so a question standing at that moment is
   * one of its own exits' — and it is drawn where it can be answered.
   *
   * The 一覧モーダル is not in the list: it holds nothing, so it raises no question, and naming it here
   * would move a question raised behind it into a layer with no way to show it.
   */
  confirmInModal: () => boolean;
  /**
   * The two answers, as the layer that draws them takes them (doc-8 §6.3), or `null` while the question
   * is not the モーダル's to draw. One value, so the question and its answers cannot be handed over
   * half-set.
   */
  modalConfirm: () => DiscardAnswers | null;
  /** Whether a 破棄前確認 is standing in the 上部帯 ① — i.e. one is asked and no モーダル is drawing it. */
  confirmingInBand: () => boolean;
  /**
   * Do something that would lose 未保存入力 — now if there is none, after the 破棄前確認 if there is
   * (doc-8 §6.3). One gate for every such route, so none of them can grow its own wording or forget to
   * ask; the panel's キャンセル reaches it too, being the one route the shell cannot carry out itself.
   *
   * The モーダル's exits come through here as well (TASK-86, doc-11 §7). They are not among doc-8 §6.3's
   * five and the input they lose is not the 編集セッション's, but the question and the two answers are the
   * same ones, and a second gate is how the same loss would come to be described two ways.
   */
  guardDiscard: (dirty: boolean, proceed: () => void) => void;
  /** Take the exit the user just confirmed, discarding the 未保存入力 (doc-8 §6.3). */
  discardConfirmed: () => void;
  /**
   * 編集に戻る: drop the request and leave the input where it is. Named rather than written inline at each
   * place the answer is offered — the 帯 and the モーダル draw the same two answers, and only one of them
   * is a continuation the caller supplied.
   */
  keepEditing: () => void;
  /** Open one 共通入口 (doc-7 §2.1) as a モーダル over the screen that is up, never a screen of its own. */
  openEntry: (id: OverlayEntry) => void;
  /** Open the 一覧モーダル (doc-7 §2.1) — a reference, so nothing behind it is unmounted. */
  openShortcutHelp: () => void;
  /** Close the 一覧モーダル. It holds nothing, so there is nothing to ask about. */
  closeShortcutHelp: () => void;
  /** Open the ☰'s メニュー. */
  openMenu: () => void;
  /** Close it, and hand focus back to the control it was opened from. */
  closeMenu: () => void;
  /** Open or close the 値一覧 (doc-7 §5.2), from the フィルタ帯's button or from its chord. */
  setFilterPopover: (open: boolean) => void;
  /**
   * What every モーダル the menu opens does first, for the two reasons only this level can answer: 被せ層 は
   * 1 枚だけ (doc-7 §2.1 — モーダル・メニュー・値一覧 all answer Escape where they are, so two open at once
   * leaves it undecided which one a press belongs to), and the ☰ taking focus *before* the modal mounts,
   * so the modal captures a control that is still on screen and hands focus back to it on close.
   *
   * Public because the 一覧モーダル is opened from a menu line that does its own second step.
   */
  raiseModal: () => void;
  /**
   * The same, for a 被せ層 プロジェクト詳細画面 raises itself — its 作成モーダル (doc-10 §1). Since TASK-117 a
   * 被せ層 is defined by its form rather than by which entry opened it (doc-11 §7), and this is the one the
   * 共通入口 do not open.
   *
   * **Unlike `raiseModal` this moves no focus, and must not.** `raiseModal` focuses the ☰ because the menu
   * line the user pressed is unmounted by the opening, leaving the layer nothing on screen to hand focus
   * back to; the 作成の入口 is not unmounted and needs no such stand-in. And this runs from an effect
   * *after* the layer has mounted and taken focus onto its own ×, so a `focus()` here would not redirect
   * the opener — it would put focus outside the layer that is up, which is the opposite of doc-7 §2.1's
   * フォーカスを内側に留める.
   */
  detailOverlay: (open: boolean) => void;
  /**
   * Where every way out of the 設定モーダル meets (doc-11 §7): the × `Modal.svelte` draws, the Escape it
   * answers, and the form's own 変更せずに閉じる. A *request* — what it does with it is two decisions, in
   * order.
   *
   * All three are refused while a save is unresolved, but only Escape is refused *here*. The panel is what
   * reports the write's outcome, and leaving takes it away while the write already issued goes on to store
   * the draft — under a control whose name says nothing was written. The two pressable exits are held one
   * step earlier by the reason this same flag produces, so each of them can say why it will not answer
   * (doc-11 §5). Escape has no control to hang a reason on, which is why this end of it only declines.
   *
   * Then the 破棄前確認 (doc-8 §6.3), for the exits that do not say what becomes of the 下書き — the × says
   * only 閉じる and Escape says nothing at all, so the question is where the draft's fate gets stated.
   * Behind the same gate as every other route that discards input, so the モーダル cannot grow a wording or
   * a rule of its own; what is particular to it is only where the question is drawn (doc-11 §7 — this
   * layer covers the 上部帯, so `Modal.svelte` draws it).
   *
   * — except from 変更せずに閉じる, which says it already. That is what `fateStated` carries, and it is a
   * parameter rather than a route of its own so that all three exits still meet here (doc-11 §7 の
   * 出口はすべて 1 つの閉じる要求へ集まる): the 発行中 refusal above, and the layer being dropped below, stay
   * one decision made in one place. What the flag selects is only whether the question has anything left
   * to say — 下書きの行方を語で述べる出口かどうか, which is the axis §7 already draws between the 下部操作行
   * and the corner.
   *
   * 保存する does not come through here at all: it wrote the 下書き, so 変更せずに閉じる would be false of
   * what happened, and [`settingsSaved`] is its own way out.
   */
  closeSettings: (fateStated: boolean) => void;
  /** The 設定 write landed (TASK-74 保存は成功したときだけ閉じる), so nothing is being discarded. */
  settingsSaved: () => void;
  /**
   * The same for the 登録モーダル, which has two exits rather than three: the × and Escape (doc-11 §7 —
   * 登録 writes without leaving the layer, so there is no 下部操作行 to state a fate in). Both discard
   * whatever has been typed, so both come through the one gate.
   */
  closeRegister: () => void;
  /**
   * Raise the 実行前確認 the panel asked for (doc-11 §12), filed against the file it is about.
   *
   * The subject is passed rather than read back later: what the question is about is whatever the panel
   * has on screen at the moment of the press. `null` — no task, or a panel showing a read the file has
   * left — asks nothing, because every control that would ask is withheld for that same reason, and a
   * question standing over that state would offer, in the layer, the act the screen underneath refuses.
   */
  askIssue: (subject: string | null, confirmation: IssueConfirmation, proceed: () => void) => void;
  /** 進む: close the question and take the act it was about (doc-11 §12). */
  issueConfirmed: () => void;
  /**
   * やめる, and the layer's own exits (×・Escape) with it: drop the request. Nothing is lost — the act never
   * started, which is what makes this question different from the 破棄前確認 (doc-11 §12).
   */
  cancelIssue: () => void;
  /**
   * 失効 (doc-11 §12 の ③): the question was about one task's current read, so the panel moving off it
   * takes the question — whether by another selection or by that file leaving the read result.
   *
   * Cleared rather than only hidden while the two disagree — held, it would come back the next time that
   * task is selected, and the user would meet a question they never asked twice over.
   */
  lapseIssue: (subject: string | null) => void;
}

export function createOverlayController(
  state: OverlayState,
  ports: OverlayControllerPorts,
): OverlayController {
  function raiseModal(): void {
    state.menuOpen = false;
    state.filterPopoverOpen = false;
    ports.focusOpener();
  }

  function confirmInModal(): boolean {
    return state.pendingDiscard !== null && (state.settingsOpen || state.registerOpen);
  }

  function guardDiscard(dirty: boolean, proceed: () => void): void {
    if (dirty) {
      state.pendingDiscard = proceed;
    } else {
      proceed();
    }
  }

  function discardConfirmed(): void {
    const proceed = state.pendingDiscard;
    state.pendingDiscard = null;
    proceed?.();
  }

  function keepEditing(): void {
    state.pendingDiscard = null;
  }

  /**
   * Take a モーダル away, and with it any 破棄前確認 one of its exits had raised.
   *
   * The question goes because it was about leaving *that* layer, and every route to here leaves it one way
   * or another — answered 破棄して閉じる (already cleared), a write that landed, or a draft reverted to the
   * file's values while the question stood, which lets the next press through the gate unanswered. Left
   * behind, an unanswered one would come back as the 上部帯 ① over the screen the layer had been covering:
   * a question about input that is no longer anywhere, offering a continuation that has already happened.
   * Dropping it discards nothing — the request lapses.
   */
  function drop(which: "settings" | "register"): void {
    state.pendingDiscard = null;
    if (which === "settings") {
      state.settingsOpen = false;
    } else {
      state.registerOpen = false;
    }
  }

  return {
    modalOpen(onProjectScreen: boolean): boolean {
      return (
        state.registerOpen ||
        state.settingsOpen ||
        state.shortcutHelpOpen ||
        state.pendingIssue !== null ||
        (onProjectScreen && state.detailModalOpen)
      );
    },
    confirmInModal,
    modalConfirm(): DiscardAnswers | null {
      return confirmInModal() ? { onproceed: discardConfirmed, onkeep: keepEditing } : null;
    },
    confirmingInBand(): boolean {
      // Not while a モーダル is up: it covers the 上部帯 (doc-7 §2.1), so the ① would stand where it cannot
      // be read or answered while `Modal.svelte` draws the same question inside the layer (doc-11 §7).
      // One question, drawn once — a band behind the layer would be a second copy of it that the user
      // meets on the way back out.
      return state.pendingDiscard !== null && !confirmInModal();
    },
    guardDiscard,
    discardConfirmed,
    keepEditing,
    openEntry(id: OverlayEntry): void {
      raiseModal();
      // An unanswered 破棄前確認 from the screen behind lapses here rather than being taken over by the
      // layer about to cover it. Where the question is drawn is decided by which layer is up
      // (`confirmInModal`), so one raised by another route would be drawn by this モーダル as though one of
      // its own exits had asked it — and 破棄して閉じる would then carry out that other route behind it,
      // leaving the モーダル standing over a screen that had changed underneath. Dropping it discards
      // nothing: the request lapses and the 未保存入力 it was about stays where it is.
      state.pendingDiscard = null;
      if (id === "register") {
        state.registerOpen = true;
      } else {
        state.settingsOpen = true;
        ports.onSettingsOpened();
      }
    },
    openShortcutHelp(): void {
      raiseModal();
      state.shortcutHelpOpen = true;
    },
    closeShortcutHelp(): void {
      state.shortcutHelpOpen = false;
    },
    openMenu(): void {
      state.menuOpen = true;
      // 被せ層 は 1 枚だけ (see `raiseModal`).
      state.filterPopoverOpen = false;
    },
    closeMenu(): void {
      state.menuOpen = false;
      // Back to the control the menu was opened from, so the next keystroke has somewhere to go
      // (`FilterBar` returns focus to its own opener the same way).
      ports.focusOpener();
    },
    setFilterPopover(open: boolean): void {
      state.filterPopoverOpen = open;
      // 被せ層 は 1 枚だけ (see `raiseModal`).
      if (open) {
        state.menuOpen = false;
      }
    },
    raiseModal,
    detailOverlay(open: boolean): void {
      state.detailModalOpen = open;
      if (!open) {
        return;
      }
      // 被せ層 は 1 枚だけ (see `raiseModal`).
      state.menuOpen = false;
      state.filterPopoverOpen = false;
      // An unanswered 破棄前確認 from behind lapses under the layer about to cover it, for the reason
      // `openEntry` spells out: which layer draws a question is decided by which one is frontmost.
      state.pendingDiscard = null;
    },
    closeSettings(fateStated: boolean): void {
      if (state.settingsSaving) {
        return;
      }
      guardDiscard(state.settingsDirty && !fateStated, () => drop("settings"));
    },
    settingsSaved(): void {
      drop("settings");
    },
    closeRegister(): void {
      if (state.registerSubmitting) {
        return;
      }
      guardDiscard(state.registerDirty, () => drop("register"));
    },
    askIssue(subject: string | null, confirmation: IssueConfirmation, proceed: () => void): void {
      if (subject === null) {
        return;
      }
      // 被せ層 は 1 枚だけ (see `raiseModal`), and an unanswered 破棄前確認 from behind lapses under the layer
      // about to cover it — the reason `detailOverlay` and `openEntry` do the same: which layer draws a
      // question is decided by which one is frontmost (doc-11 §7). Dropping it discards nothing.
      state.menuOpen = false;
      state.filterPopoverOpen = false;
      state.pendingDiscard = null;
      state.pendingIssue = { path: subject, confirmation, proceed };
    },
    issueConfirmed(): void {
      const pending = state.pendingIssue;
      state.pendingIssue = null;
      pending?.proceed();
    },
    cancelIssue(): void {
      state.pendingIssue = null;
    },
    lapseIssue(subject: string | null): void {
      if (state.pendingIssue !== null && state.pendingIssue.path !== subject) {
        state.pendingIssue = null;
      }
    },
  };
}
