<script lang="ts">
  // タスク詳細画面 (doc-8): one task's every item on one surface, and the entry point for the
  // editing operations doc-8 §6 defines (TASK-36). Every edit is issued through the Backlog 更新
  // アダプター (doc-5) by the shell — this panel builds the 更新操作 and never touches a file.
  //
  // The same panel is drawn three ways (doc-8 §2.1 詳細配置). What the placement changes is *where*
  // the shell puts this element and, through `layoutFor`, how much of each 区画 is open and how much
  // of the Git 履歴欄 is shown (doc-8 §3 の割当表). What it never changes is which 区画 exist: the
  // panel shows the same task either way, and 不整合区画 stays 常設 in all three (doc-8 §3).
  //
  // 参照系 (Type・References・Pull Request・Git 履歴) is read and shown for every 保存区分
  // (doc-8 §6.5); what changes with the 保存区分 is which operations are *offered*, and an
  // operation that is not offered carries the reason it is not (doc-5 §5).
  //
  // Bodies are shown as the file wrote them, not rendered as Markdown: a Markdown renderer is a
  // new production dependency, which AGENTS requires confirming before introducing.
  //
  // URLs are text, not links, for the same reason inverted: an <a href> inside the Tauri WebView
  // would navigate the app window away from Atlas, and opening an external browser needs a
  // capability this build does not have.
  import { onDestroy, type Snippet } from "svelte";
  import DetailSection from "./DetailSection.svelte";
  import Editor from "./Editor.svelte";
  import GitHistory from "./GitHistory.svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import { cardIdentity, crossTaskId, priorityStep } from "../lib/card";
  import { omitsSentence } from "../lib/manage";
  import { ariaKeyShortcuts, shortcutHint } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import {
    CROSS_ID_UNAVAILABLE,
    acProgress,
    dependencyLinks,
    milestoneRef,
    referenceSplit,
    type HistoryState,
  } from "../lib/detail";
  import {
    ASSIGNEE_NOT_CLEARABLE,
    DISCARD_CONFIRM_PROCEED,
    EMPTY_DEPENDENCIES_REASON,
    EMPTY_REFERENCES_REASON,
    FILE_MISSING_REASON,
    PRIORITIES,
    TYPE_NOT_EDITABLE,
    acDeltaDroppedByRebase,
    acRows,
    assigneeCollapseWarning,
    buildSave,
    canRemoveLast,
    confirmMarkedLabel,
    divergence,
    editAvailability,
    externallyChanged,
    isDirty,
    milestoneOptions,
    optionsFor,
    rebaseOnto,
    saveAvailability,
    setAcMode,
    setField,
    setNotesMode,
    startSession,
    toggleAcCheck,
    toggleAcRemoval,
    transitionConfirmation,
    transitionOffers,
    type ApplyOutcome,
    type EditSession,
    type IssueConfirmation,
    type SaveState,
    type TransitionOffer,
  } from "../lib/edit";
  import {
    FRONTMATTER_NOTICE,
    REREAD_ROOT_LABEL,
    UNSAVED_INPUT_WARNING,
    WATCH_STOPPED_NOTE,
    editorOffers,
    launchConfirmation,
    launchSummary,
    needsConfirmation,
    type EditorOffer,
    type OpenOutcome,
  } from "../lib/external-editor";
  import {
    conflictSetDetail,
    inconsistencyLabel,
    inconsistencyReasons,
    versionConflictReason,
    type ConflictTarget,
    type VersionConflict,
  } from "../lib/mark";
  import {
    DISCLOSURE_ICON,
    MAIN_COLUMN_ORDER,
    MODAL_COLUMN_GAP_REM,
    MODAL_INSET_REM,
    MODAL_MAX_WIDTH_REM,
    MODAL_SIDE_COLUMN_REM,
    PANEL_PADDING_REM,
    PLACEMENTS,
    PLACEMENT_ICON,
    PROSE_MAX_WIDTH_REM,
    SIDEBAR_WIDTH_REM,
    SIDE_COLUMN_ORDER,
    SINGLE_COLUMN_ORDER,
    STEP_ICON,
    layoutFor,
    placementPersistence,
    placementPersistenceNote,
    placementSwitchName,
    // `DetailSection` is the component imported above; the type takes an alias here.
    type DetailSection as SectionKey,
  } from "../lib/placement";
  import { DETAIL_PLACEMENT_LABEL } from "../lib/settings";
  import {
    CANONICAL_COLUMN_LABEL,
    NO_LANE_CELL_REASON,
    laneGroupLabel,
    laneNeighbourLabel,
    type LaneNeighbours,
  } from "../lib/swimlane";
  import type {
    CliReadiness,
    DetailPlacement,
    EditorReadiness,
    LaunchMethod,
    ProjectEntry,
    ProjectSnapshot,
    StorageState,
    TaskView,
    UpdateOperation,
  } from "../lib/wire";

  interface Props {
    view: TaskView;
    /** The snapshot the task was read from — milestone and dependency ids resolve inside it. */
    snapshot: ProjectSnapshot;
    /**
     * The file left the read result while this panel was open (an external move or delete), so
     * `view` is the last read that resolved it rather than the current one. The panel stays up
     * with its 未保存入力 instead of vanishing (doc-8 §6.4); nothing can be issued against a file
     * that is no longer there, so every operation is withheld with that as the reason.
     */
    missing: boolean;
    entry: ProjectEntry | null;
    history: HistoryState;
    /** 詳細配置 (doc-8 §2.1): which of the three ways this panel is being placed right now. */
    placement: DetailPlacement;
    /** The placement アプリ設定 holds as the 既定 — what the switch marks (doc-8 §2.2). */
    defaultPlacement: DetailPlacement;
    /** Why the last switch could not be stored as the 既定, or `null` (decision-13 read-only file). */
    placementFailure: string | null;
    /**
     * Ask for another 詳細配置. The shell owns the change because it owns both halves: where the panel
     * is put on screen, and the 破棄前確認 the switch goes through while there is 未保存入力
     * (doc-8 §2.2/§6.3).
     */
    onplacement: (placement: DetailPlacement) => void;
    /**
     * Where this task sits in the lane cell it is drawn in, and the cards either side of it
     * (doc-8 §2.2 前後移動). `null` when the grid is not showing the task at all.
     */
    neighbours: LaneNeighbours | null;
    /** 縮退 (doc-5 §5): `null` while the probe is still running. */
    readiness: CliReadiness | null;
    /** 外部エディタ経路 (doc-8 §7): which launch methods exist. `null` while the probe is running. */
    editorReadiness: EditorReadiness | null;
    /**
     * 継続検出 is stopped for this task's root (doc-9 §3.1) — the watch failed, the event subscription
     * is dead, or アプリ設定 turned it off. The panel states it *before* the launch and offers the
     * re-read, which is what doc-8 §7 requires of this route while nothing brings the save back on its
     * own. One flag for all three causes, because doc-9 §3.1 keeps the state undivided.
     */
    watchStopped: boolean;
    /** Re-read this task's root (doc-8 §7 戻ってきたときに読み直せる; same operation as the row's). */
    onreread: () => void;
    /**
     * バージョン不整合 (doc-9) recorded for this task, or `null`. Held by the shell so the mark outlives the
     * panel and reaches the swimlane card (AC #4); the panel reads it back so the two surfaces say
     * the same thing about the same task.
     */
    conflict: VersionConflict | null;
    /**
     * Record or clear a バージョン不整合 for one task. `target` is passed explicitly rather than resolved from
     * the shell's current selection: an operation is awaited, and the selection can move while it is
     * in flight, which would file this task's divergence against whatever is open when the answer
     * arrives.
     */
    onconflict: (conflict: VersionConflict | null, target: ConflictTarget) => void;
    /** Issue one 更新操作 through the boundary. The shell owns the call and the re-read. */
    onapply: (action: UpdateOperation[]) => Promise<ApplyOutcome>;
    /**
     * Start the user's editor on this task's management file (doc-8 §7). The shell owns the call for
     * the same reason as `onapply` — it holds the (slug, path) the boundary resolves against.
     */
    onopenExternally: (method: LaunchMethod) => Promise<OpenOutcome>;
    /** Follow a dependency to its task (doc-8 §3 解決先タスクへ辿れる), or move to a neighbour. */
    onselect: (view: TaskView) => void;
    onreloadHistory: () => void;
    /** Whether an 編集セッション holds 未保存入力 — the shell guards selection changes with it. */
    ondirty: (dirty: boolean) => void;
    /**
     * Ask the 破棄前確認 (doc-8 §6.3) for the one route the shell cannot carry out itself: キャンセル
     * ends the session without leaving the task, so only the panel can do the discarding. The other
     * four routes are the shell's, and go through the same band with the same words.
     */
    onconfirmDiscard: (proceed: () => void) => void;
    /**
     * Ask the 実行前確認 (doc-11 §12). The 被せ層 it is drawn in belongs to the shell — that is what
     * keeps 被せ層 を同時に 1 枚 true — so the panel hands over the question and what to do with a
     * 進む answer, exactly as it does for the 破棄前確認 above.
     */
    onconfirmIssue: (confirmation: IssueConfirmation, proceed: () => void) => void;
    onclose: () => void;
  }

  let {
    view,
    snapshot,
    missing,
    entry,
    history,
    placement,
    defaultPlacement,
    placementFailure,
    onplacement,
    neighbours,
    readiness,
    editorReadiness,
    watchStopped,
    onreread,
    conflict,
    onconflict,
    onapply,
    onopenExternally,
    onselect,
    onreloadHistory,
    ondirty,
    onconfirmDiscard,
    onconfirmIssue,
    onclose,
  }: Props = $props();

  const STORAGE_LABEL: Record<StorageState, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  let task = $derived(view.task);
  let status = $derived(view.interpretation.status);
  let types = $derived(view.interpretation.types);
  let milestone = $derived(milestoneRef(view, snapshot.milestones));
  let dependencies = $derived(dependencyLinks(view, snapshot.tasks));
  let references = $derived(referenceSplit(view));
  let ac = $derived(acProgress(view));
  /**
   * 不整合の理由行 (decision-22), from the derivation the swimlane card shares (`lib/mark.ts`). One
   * source so the card's ⚠️, this heading's ⚠️ and the 不整合区画 below cannot disagree about the same
   * task — which is what decision-6's 族を同じ印へ混ぜない asks of a cross-cutting display (AC #4).
   */
  let reasons = $derived(inconsistencyReasons(view, conflict));

  // --- 詳細配置 (doc-8 §2) -----------------------------------------------------------------

  /** doc-8 §3 の割当表 for the placement in force — one decision for every 区画 at once. */
  let layout = $derived(layoutFor(placement));
  let persistence = $derived(
    placementPersistence(placement, defaultPlacement, placementFailure),
  );
  let persistenceNote = $derived(
    placementPersistenceNote(persistence, (value) => DETAIL_PLACEMENT_LABEL[value]),
  );
  let crossId = $derived(crossTaskId(view));

  // --- 編集セッション (doc-8 §6.3) ---------------------------------------------------------

  /** The 発行の行's reason element — named so `aria-describedby` can point at it (doc-11 §5). */
  const SAVE_REASON_ID = "task-detail-save-reason";

  /** `null` outside a session: the panel is display-only until 編集 is pressed (明示保存の前提). */
  let session = $state<EditSession | null>(null);
  let saveState = $state<SaveState>({ state: "idle" });
  let busy = $state(false);
  /** Why every 状態遷移 is withheld while one is in flight (doc-11 §5: 理由の無い無効化を残さない). */
  const TRANSITION_BUSY_REASON = "更新を発行中です。完了するまで次の遷移は始められません。";
  /** Draft text of the "add one" boxes, which are inputs rather than part of the session. */
  let newLabel = $state("");
  let newDependency = $state("");
  let newReference = $state("");
  let newCriterion = $state("");

  let availability = $derived(editAvailability(view, readiness, missing));
  let dirty = $derived(session !== null && isDirty(session));
  let transitions = $derived(
    transitionOffers(view, { readiness, hasUnsavedInput: dirty, fileMissing: missing }),
  );
  /** 編集中の継続検出 (doc-8 §6.4): stated, never acted on — the input stays as the user left it. */
  let externalChange = $derived(
    !missing && session !== null && externallyChanged(session, view),
  );
  /** The 外部エディタ経路 controls (doc-8 §7). Offered for every 保存区分 — this is the route doc-8
   * §6.5 sends draft・completed・archive to — so it depends on neither `availability` nor the CLI. */
  let editorOfferList = $derived(editorOffers(editorReadiness, { fileMissing: missing }));
  let plan = $derived(session === null ? null : buildSave(session));
  /** One decision for the save control's enabled state and its reason (doc-5 §5). */
  let saveGate = $derived(saveAvailability(plan, { fileMissing: missing, busy }));
  let acView = $derived(session === null ? [] : acRows(session));
  /** Stated before the save that would collapse a multi-assignee list, not for every session. */
  let assigneeCollapse = $derived(assigneeCollapseWarning(plan, view.task.assignee));

  // The session belongs to one file. A different task in the same panel starts from that task's
  // own read rather than inheriting a draft written against another one; the shell asks before
  // it lets the selection change while the session is dirty.
  $effect(() => {
    const path = view.task.sourcePath;
    if (session !== null && session.baseline.task.sourcePath !== path) {
      endSession();
    }
  });

  /**
   * The placement the session was opened in. A switch ends the session, which is what makes the
   * 破棄前確認 the shell asks for true — and it is done here rather than left to the remount the
   * shell's own layout happens to cause, so the rule holds however the shell places the panel.
   */
  let sessionPlacement: DetailPlacement | null = null;
  $effect(() => {
    const next = placement;
    if (sessionPlacement !== null && sessionPlacement !== next) endSession();
    sessionPlacement = next;
  });

  $effect(() => {
    ondirty(dirty);
  });

  function endSession(): void {
    session = null;
    saveState = { state: "idle" };
    clearAddBoxes();
  }

  function edit<K extends keyof EditSession["draft"]>(
    key: K,
    value: EditSession["draft"][K],
  ): void {
    if (session !== null) session = setField(session, key, value);
  }

  function clearAddBoxes(): void {
    newLabel = "";
    newDependency = "";
    newReference = "";
    newCriterion = "";
  }

  function startEditing(): void {
    session = startSession(view);
    saveState = { state: "idle" };
    acDeltaDropped = false;
    clearAddBoxes();
  }

  function cancelEditing(): void {
    // 破棄前確認 (doc-8 §6.3): only when there is something to lose, and through the shell's band —
    // the same words the other four routes use.
    if (dirty) onconfirmDiscard(endSession);
    else endSession();
  }

  /** The task a バージョン不整合 report is about, as of now. Captured before any await (see `save`). */
  function conflictTarget(): ConflictTarget {
    return { slug: task.project, sourcePath: task.sourcePath };
  }

  async function save(): Promise<void> {
    if (missing || session === null || plan === null || plan.state !== "ready" || busy) return;
    const submitted = plan.submitted;
    // Captured before the await, like the 外部エディタ経路 does with its path: the answer is about
    // *this* task, and the panel may be pointed at another one by the time it arrives (a dirty
    // session asks first, but 破棄して続ける during the in-flight save is an answer).
    const target = conflictTarget();
    busy = true;
    try {
      const outcome = await onapply(plan.action);
      // Whether the panel still holds the operated task's read. `saveState` and the session are about
      // what is on screen, so they are only touched while that is still true; the バージョン不整合 record is
      // about the task and is always filed against `target`.
      const stillOpen = task.sourcePath === target.sourcePath;
      switch (outcome.state) {
        case "applied": {
          // 事後通知 (doc-9 §5): compared against the operated task's own re-read, which the outcome
          // carries — not against `view`, which is whatever the panel is showing by now. Skipping the
          // comparison when the selection moved would be worse than wrong: a clean result clears the
          // task's バージョン不整合 record, so an unchecked save would erase a mark it never checked.
          const diverged = divergence(submitted, outcome.view);
          if (stillOpen) {
            session = null;
            clearAddBoxes();
            saveState =
              diverged.length === 0 ? { state: "applied" } : { state: "diverged", fields: diverged };
          }
          // The バージョン不整合 record follows the same split: a clean save clears it, and the 事後通知 is
          // recorded so it survives leaving this task (doc-9 §5, AC #4).
          onconflict(
            diverged.length === 0 ? null : { kind: "postWindow", fields: diverged },
            target,
          );
          break;
        }
        case "conflict":
          // 未保存入力を保持したまま (doc-8 §6.4): the session stays open and the two paths of
          // doc-9 §5 are offered below.
          if (stillOpen) {
            saveState = {
              state: "conflict",
              diverged: outcome.diverged,
              unread: outcome.unread,
            };
          }
          onconflict(
            { kind: "preUpdate", diverged: outcome.diverged, unread: outcome.unread },
            target,
          );
          break;
        case "uncheckable":
          // 照合不能 (doc-9 §4.2): no CLI ran and no divergence was observed, so this deliberately
          // does *not* record a バージョン不整合 — doc-9 §5 requires the user not to read it as a conflict.
          if (stillOpen) saveState = { state: "uncheckable", detail: outcome.detail };
          break;
        case "failed":
          // CLI 失敗 (doc-5 §5): nothing changed, the display is untouched, and the input stays
          // so the same save can be retried (doc-8 §6.3).
          if (stillOpen) saveState = { state: "failed", detail: outcome.detail };
          break;
      }
    } finally {
      busy = false;
    }
  }

  /** doc-9 §5 (i): drop the 未保存入力 and start again from the re-read the conflict brought. */
  function restartFromLatest(): void {
    session = startSession(view);
    saveState = { state: "idle" };
    // Both doc-9 §5 paths 帰着させる the situation to 最新の版に対する新しい更新操作, so the recorded
    // divergence is resolved: what remains is unsaved input against the current read, not a バージョン不整合.
    onconflict(null, conflictTarget());
  }

  /** doc-9 §5 (ii): keep the input and move the session's baseline onto the latest read. */
  function reapplyOntoLatest(): void {
    if (session === null) return;
    // Stated before the rebase, since afterwards the two baselines are the same and the drop is
    // no longer visible — and a silently dropped AC operation is exactly what doc-8 §6.4 forbids.
    acDeltaDropped = acDeltaDroppedByRebase(session, view);
    session = rebaseOnto(session, view);
    saveState = { state: "idle" };
    onconflict(null, conflictTarget());
  }

  /** Whether the last rebase had to drop index-bound AC operations (see `acDeltaForCli`). */
  let acDeltaDropped = $state(false);

  /**
   * Every 状態遷移 asks first (doc-11 §12 の実行前確認). Not a general habit — none of the five has a way
   * back to the state before the press in v1.48.0 (the measurement is in doc-8 §6.5), so an
   * accidental one cannot be undone from Atlas at all.
   *
   * The question goes to the shell rather than being drawn here, and the act is what the shell hands
   * back on a 進む answer. That is also what closes the hole the 二度押し had: the layer is the shell's,
   * so it goes with the question when the panel is pointed at another task (doc-11 §12 の失効).
   */
  function runTransition(offer: TransitionOffer, control: HTMLButtonElement): void {
    if (!offer.enabled || busy) return;
    focusForReturn(control);
    onconfirmIssue(transitionConfirmation(offer), () => void issueTransition(offer));
  }

  /**
   * Take focus onto the control the question is about to be asked from (doc-7 §2.1 閉じたら開く前の操作へ
   * フォーカスを戻す).
   *
   * The layer captures whatever holds focus as it mounts, and **macOS WebKit does not focus a button on a
   * pointer press** (by platform convention) — so without this the layer would capture whatever the user
   * happened to focus earlier, and closing it would send focus there instead of back to the press. A
   * keyboard press already holds focus here, which makes this a no-op on that path. `App.svelte`'s
   * `raiseModal` does the same thing for the ☰, and for the same reason.
   */
  function focusForReturn(control: HTMLButtonElement): void {
    control.focus();
  }

  /**
   * Issue the transition the 実行前確認 was answered for.
   *
   * `busy` is checked again because the answer arrives later than the press. Nothing else is
   * re-checked against the current read: the layer covered the window while the question stood, so the
   * only thing that can have moved underneath is the file itself — and that is what 更新前競合検出
   * (doc-9 §4) is for, which this call already goes through.
   */
  async function issueTransition(offer: TransitionOffer): Promise<void> {
    if (busy) return;
    // A transition needs no 未保存入力, so nothing asks before the selection changes — the swimlane's
    // cards stay clickable while the CLI runs, and `busy` only disables this panel's own controls.
    // The target is therefore captured here rather than read back afterwards.
    const target = conflictTarget();
    busy = true;
    try {
      const outcome = await onapply([offer.operation]);
      const stillOpen = task.sourcePath === target.sourcePath;
      switch (outcome.state) {
        case "applied":
          if (stillOpen) saveState = { state: "applied" };
          break;
        case "conflict":
          if (stillOpen) {
            saveState = {
              state: "conflict",
              diverged: outcome.diverged,
              unread: outcome.unread,
            };
          }
          onconflict(
            { kind: "preUpdate", diverged: outcome.diverged, unread: outcome.unread },
            target,
          );
          break;
        case "uncheckable":
          if (stillOpen) saveState = { state: "uncheckable", detail: outcome.detail };
          break;
        case "failed":
          if (stillOpen) saveState = { state: "failed", detail: outcome.detail };
          break;
      }
    } finally {
      busy = false;
    }
  }

  /**
   * The last launch, or the reason there was none — and which file it was for. Kept apart from
   * `saveState` because an editor launch is not a CLI update, and *keyed by path* for the reason the
   * Git 履歴 read is (TASK-35): a notice held by identity would state "起動しました" over the next task
   * the panel is pointed at, and every reload replaces the view objects.
   */
  let openState = $state<
    | { state: "idle" }
    | { state: "launched"; path: string; summary: string }
    // Nothing was started: the press found 継続検出 stopped, and the notice it produced has to be read
    // before the editor opens (doc-8 §7). Kept apart from `failed` — nothing went wrong.
    | { state: "deferred"; path: string; detail: string }
    | { state: "failed"; path: string; detail: string }
  >({ state: "idle" });
  /** The notice belonging to the *open* task; anything else counts as no launch on this task. */
  let openNotice = $derived(
    openState.state !== "idle" && openState.path === task.sourcePath ? openState : null,
  );

  /**
   * 外部エディタ経路 (doc-8 §7). Deliberately leaves the 編集セッション alone: doc-8 §6.4 does not let
   * an external edit take the 未保存入力, so opening the file neither saves nor discards the draft. The
   * two are reconciled where they already are — the 継続検出 notice above, and the save's 更新前競合検出.
   */
  function openExternally(offer: EditorOffer, control: HTMLButtonElement): void {
    if (!offer.enabled) return;
    // The path is captured before anything can be awaited: the launch is for the task that was on
    // screen when it was asked for, and the answer is filed under that file rather than under whatever
    // is shown when it arrives (the shell resolves the same (slug, path) pair).
    const path = task.sourcePath;
    if (needsConfirmation(dirty)) {
      focusForReturn(control);
      onconfirmIssue(launchConfirmation(offer), () => void launch(offer, path));
      return;
    }
    void launch(offer, path);
  }

  /** Start the editor, and say what became of it against the file it was asked for (doc-8 §7). */
  async function launch(offer: EditorOffer, path: string): Promise<void> {
    const outcome = await onopenExternally(offer.method);
    openState =
      outcome.state === "launched"
        ? { state: "launched", path, summary: launchSummary(outcome.launch) }
        : { state: outcome.state, path, detail: outcome.detail };
  }

  // --- 見出しの操作群 (doc-8 §2.2) ----------------------------------------------------------

  /**
   * 横断タスクID のコピー (doc-8 §2.2). Atlas has no URL, so this is the only way to point at a task
   * from a commit message or a chat — which is why the failure is not swallowed: the id is offered as
   * selectable text instead, rather than the press quietly doing nothing.
   *
   * Keyed by path like the launch notice above, so "コピーしました" cannot outlive the task it was
   * about when the panel is pointed at another one.
   */
  let copyState = $state<
    | { state: "idle" }
    | { state: "copied"; path: string }
    | { state: "fading"; path: string }
    | { state: "failed"; path: string; text: string }
  >({ state: "idle" });
  let copyNotice = $derived(
    copyState.state !== "idle" && copyState.path === task.sourcePath ? copyState : null,
  );
  /** Whether the control is showing its 成功 figure — `clipboard-check` — rather than `clipboard`. */
  let copied = $derived(copyNotice?.state === "copied" || copyNotice?.state === "fading");

  /**
   * 成功表示の 2 段 (AC #4): hold the 成功色 for `COPY_HOLD_MS`, then let it fade over `COPY_FADE_MS`
   * and put the `clipboard` figure back. Two phases rather than one timer because the sentence AC #4
   * writes has four parts — 変わり / 成功色になって / フェードアウトし / 元へ戻る — and a single revert
   * would snap the figure back while the colour was still on its way out.
   *
   * `COPY_FADE_MS` is also the CSS transition below. Kept as one number in one place: two that had to
   * agree and did not would put the figure back mid-fade, which is the defect this shape avoids.
   */
  const COPY_HOLD_MS = 1200;
  const COPY_FADE_MS = 450;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  function clearCopyTimer(): void {
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = null;
  }

  async function copyCrossTaskId(): Promise<void> {
    const id = crossId;
    if (id === null) return;
    const path = task.sourcePath;
    try {
      await navigator.clipboard.writeText(id);
      // Restarted rather than queued: pressing again during the fade is a second copy, and it should
      // read as one — a full hold from now, not the tail of the previous press.
      clearCopyTimer();
      copyState = { state: "copied", path };
      copyTimer = setTimeout(() => {
        copyState = { state: "fading", path };
        copyTimer = setTimeout(() => {
          copyTimer = null;
          copyState = { state: "idle" };
        }, COPY_FADE_MS);
      }, COPY_HOLD_MS);
    } catch {
      // No reason text: what the user needs here is the id itself, in a form they can select — the
      // clipboard API's own message ("permission denied", "not focused") does not help them copy it.
      // Nor does this one time out: the id is still on screen to be selected, and taking it away on a
      // timer would take away the only copy that worked.
      clearCopyTimer();
      copyState = { state: "failed", path, text: id };
    }
  }

  // A pending timer outlives the panel otherwise, and fires `copyState` into a component that is gone.
  onDestroy(clearCopyTimer);

  /**
   * 前後移動 (doc-8 §2.2). The move is an ordinary selection change, so it goes through the shell's
   * `onselect` — and therefore through the same 破棄前確認 as clicking another card. Asking here as
   * well would put the question twice.
   */
  function moveTo(target: TaskView | null): void {
    if (target !== null) onselect(target);
  }

  function addTo(values: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || values.includes(trimmed) ? values : [...values, trimmed];
  }

  function addCriterion(): void {
    if (session === null || session.draft.ac.mode !== "delta") return;
    const text = newCriterion.trim();
    if (text === "") return;
    const delta = session.draft.ac.delta;
    session = setField(session, "ac", {
      mode: "delta",
      delta: { ...delta, add: [...delta.add, text] },
    });
    newCriterion = "";
  }
</script>

{#snippet listEditor(
  values: string[],
  apply: (next: string[]) => void,
  draft: string,
  setDraft: (value: string) => void,
  placeholder: string,
  lastRemovalReason: string | null,
)}
  <ul class="list-edit">
    {#each values as value, index (index)}
      {@const removable = lastRemovalReason === null || canRemoveLast(values)}
      <li>
        <span class="url">{value}</span>
        <button
          type="button"
          class="mini"
          disabled={!removable}
          title={removable ? "削除" : (lastRemovalReason ?? "")}
          onclick={() => apply(values.filter((_, at) => at !== index))}
        >
          削除
        </button>
      </li>
    {/each}
  </ul>
  {#if lastRemovalReason !== null && values.length === 1}
    <p class="hint">{lastRemovalReason}</p>
  {/if}
  <div class="add-row">
    <input
      type="text"
      {placeholder}
      value={draft}
      oninput={(event) => setDraft(event.currentTarget.value)}
    />
    <button
      type="button"
      class="mini"
      onclick={() => {
        apply(addTo(values, draft));
        setDraft("");
      }}
    >
      追加
    </button>
  </div>
{/snippet}

<!-- 見出し (doc-8 §3): 常設 in all three placements. -->
{#snippet heading()}
  <header class="heading">
    <div class="line id-line">
      <!-- 横断タスクID を併記 (doc-8 §2, doc-3 §5.3): the panel is single-project, but the heading
           still says which project's task this is. A 解析不能 file has no id, so it is named by
           its file — the only stable handle it has (doc-4 §5). -->
      <!-- 行に収まらない幅では末尾を落とす (doc-8 §2.2 の「1 行に収める」)。落ちるのは描かれる字だけで、
           全体は `title` が持ち、隣の控えは描かれた字ではなく値そのものをコピーする。 -->
      <span class="identity" title={cardIdentity(view)}>{cardIdentity(view)}</span>
      <!-- ID コピーは ID の右横 (doc-8 §2.2, TASK-72). アイコンのみのボタン (doc-11 §2.4): the figure
           carries no words, so `aria-label` holds the whole name — and it holds the *operation* name
           only. 成功 is said by the sentence below, which is a live region, rather than by a name that
           would change under a user who is looking for this button by it (doc-11 §2.4 の「持続する
           状態の印」はここに及ばない). 無効化提示 (doc-11 §5) keeps its reason beside the control as
           well as in `title`: the hint under this line carries it. -->
      <button
        type="button"
        class="copy"
        class:copied={copyNotice?.state === "copied"}
        class:fading={copyNotice?.state === "fading"}
        style="--copy-fade: {COPY_FADE_MS}ms"
        disabled={crossId === null}
        aria-label="横断タスクID をコピー"
        title={crossId === null ? CROSS_ID_UNAVAILABLE : "横断タスクID をコピー"}
        onclick={copyCrossTaskId}
      >
        <Icon name={copied ? "clipboard-check" : "clipboard"} />
      </button>
      {#if crossId === null}
        <!-- 解析不能 (doc-4 §5): a required field the read layer could not get. Still a 印チップ and
             not part of the ⚠️ — it names the field that is missing *here*, where the ID would have
             been, which is a different act from listing the task's reasons (decision-22). -->
        <span class="mark" data-kind="inconsistent">TASK-ID 不明</span>
      {/if}
      <!-- 不整合印 (decision-22): カードと同じ ⚠️ 1 つで、族名も由来名も出さない。理由は下の
           不整合区画が持つ。同じ 1 つの derivation から出るので、カード・見出し・区画が同じタスク
           について食い違うことがない。 -->
      {#if reasons.length > 0}
        <span
          class="inconsistent"
          role="img"
          aria-label={inconsistencyLabel(reasons)}
          title={inconsistencyLabel(reasons)}
        >
          <Icon name="triangle-alert" />
        </span>
      {/if}
      {#if missing}
        <span class="mark" data-kind="unreadable">ファイル不明</span>
      {/if}

      <!-- 前後移動 (doc-8 §2.2) は 1 行目の右端、配置切替の手前 (画面設計案 02。doc-12 §3)。
           ↑↓ のアイコンのみのボタン (doc-11 §2.4) で、名前は `aria-label` が全部持つ — 操作の名前
           だけで、群の名前は入れない (doc-11 §2.4 が `aria-label` に操作の名前だけを求めている)。
           **群の名前を刷るのはこの 2 つの `title` だけで、どちらも `laneGroupLabel` から取る**
           (doc-8 §2.2)。`aria-label` が `title` に優先するので、群の名前はこの控えの説明であって
           名前ではない。
           2 つが別の語を刷れば、同じ群を同じ行の中で 2 つの語で呼ぶことになる。未分類区画はレーン
           セルではない (doc-7 §1)。**隣の位置表示は群の名前を持たない** — 1 行に収める必要があり、
           名前がその行の 97px を占めていた (TASK-72 の実測)。端での無効化の理由は隣の位置表示と
           下の控えが担う — 読めない位置に理由を隠さない、が doc-11 §5 の要求である。 -->
      <div class="nav">
        {#each [{ dir: "previous", name: "前のタスクへ", edge: "先頭" }, { dir: "next", name: "次のタスクへ", edge: "末尾" }] as const as step (step.dir)}
          {@const target = neighbours === null ? null : neighbours[step.dir]}
          <button
            type="button"
            class="step"
            disabled={target === null}
            aria-label={step.name}
            title={neighbours === null
              ? NO_LANE_CELL_REASON
              : target === null
                ? `${laneGroupLabel(neighbours.group)}の${step.edge}です`
                : `${laneGroupLabel(neighbours.group)}内の${step.name}`}
            onclick={() => moveTo(target)}
          >
            <!-- 移動の図形 (doc-11 §2.4) は `placement.ts` の `STEP_ICON` が持つ — the family rule is
                 cross-screen (this pair is 行の並べ替え's too), so the choice has to be somewhere a
                 test can read it rather than here. -->
            <Icon name={STEP_ICON[step.dir]} />
          </button>
        {/each}
        <span class="position">
          {neighbours === null ? "スイムレーン上の位置不明" : laneNeighbourLabel(neighbours)}
        </span>
      </div>

      <!-- 配置の切替は「閉じる ×」と同じ操作群に置く (doc-8 §2.2): both answer "この面をどうするか",
           and neither belongs among the operations on the task's contents. -->
      <div class="frame">
        <div class="placement" role="group" aria-label="詳細配置">
          {#each PLACEMENTS as candidate (candidate)}
            {@const isDefault = candidate === defaultPlacement}
            <!-- アイコンのみのボタン (doc-11 §2.4): the figure is decorative, so `aria-label` carries
                 the whole name — 配置名, and 既定 for the one the 下線 marks. Both come from
                 `placementSwitchName`, since a label and a title that disagreed would be two answers
                 to the same question. -->
            <button
              type="button"
              class="switch"
              class:on={candidate === placement}
              class:is-default={isDefault}
              aria-pressed={candidate === placement}
              aria-label={placementSwitchName(DETAIL_PLACEMENT_LABEL[candidate], isDefault)}
              title={placementSwitchName(DETAIL_PLACEMENT_LABEL[candidate], isDefault)}
              onclick={() => onplacement(candidate)}
            >
              <Icon name={PLACEMENT_ICON[candidate]} />
            </button>
          {/each}
        </div>
        <button type="button" class="close" onclick={onclose}>閉じる</button>
      </div>
    </div>


    <!-- 2 行目: title と編集入口 (画面設計案 02。doc-12 §3, doc-8 §3). 編集入口は押しボタンだけで、
         保存キーの注記・未保存の予告・バージョン不整合の告知は編集卓に残る — それらは長さが変わる文であり、
         見出しは固定されているので、伸びた分だけ本文の高さを奪うことになる。 -->
    <div class="line title-line">
      {#if session === null}
        <!-- 2 行を超える title は末尾を落とす (doc-11 §13)。全体は `title` が持つ — 落ちるのは
             描かれる字だけで、値は編集セッションの欄がそのまま持っている。 -->
        <h2 title={task.title ?? "（title 不明）"}>{task.title ?? "（title 不明）"}</h2>
      {:else}
        <label class="field">
          <span>title</span>
          <input
            type="text"
            value={session.draft.title}
            oninput={(event) => edit("title", event.currentTarget.value)}
          />
        </label>
      {/if}
      {@render editEntry()}
    </div>
  </header>

  <!-- 主要属性の属性表 (doc-8 §3): 見出しの 3 行目でありながら、上の 2 行と違って固定帯の外に立つ。
       固定行の高さの上限 (doc-11 §13) がこの行を締め出す — 6 つの値は面が狭くなるほど折り返し、
       実測では 560px 幅の窓で 94.58px、320px で 162.58px を取っていた (WebKit・閲覧)。固定帯が
       それを背負うと、帯の残りが控え 1 つぶんを切って面の内容が届かなくなる。**この行を固定する
       理由は doc-8 §3 に書かれていない** — 同節が固定の理由に挙げるのは ID コピー・前後移動・
       閉じる の 3 つで、いずれも 1 行目の控えである。 -->
  <dl class="facts">
    <dt>status</dt>
    <dd>
      {#if session !== null}
        <select
          aria-label="status"
          value={session.draft.status}
          onchange={(event) => edit("status", event.currentTarget.value)}
        >
          {#each optionsFor(task.status, snapshot.config.statuses) as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      {:else if status === null}
        <span class="mark" data-kind="inconsistent">status を読めません</span>
      {:else}
        <span class="raw">{status.raw}</span>
        <!-- 正準対応を併記 (AC #1): 未分類 status is stated as such rather than shown blank. -->
        {#if status.column === null}
          <span class="mark unmapped">正準列 未分類</span>
        {:else}
          <span class="column">正準列: {CANONICAL_COLUMN_LABEL[status.column]}</span>
        {/if}
        {#if status.declaration === "undeclared"}
          <span class="mark unmapped">config.yml 未宣言</span>
        {:else if status.declaration === "noDeclaredSet"}
          <span class="mark neutral">config.yml に status 宣言なし</span>
        {:else if status.declaration === "draft"}
          <span class="mark neutral">draft の既知 status</span>
        {/if}
      {/if}
    </dd>

    <dt>priority</dt>
    <!-- priority の値は 優先度色 で書く (decision-23): カードが色で述べていることを、詳細でも同じ
         色で述べる。札にはしない — 主要属性の値は素の文字で並んでおり、ここだけ札にすると
         doc-11 §3 のチップの 4 系統に 5 つ目が現れる。3 段のどれでもない値と `—` は色を持たない
         (`data-priority` が付かない)。編集中は `<select>` がプラットフォームの描画なので、色は
         閲覧時の値にだけ効く。 -->
    <dd data-priority={session === null ? priorityStep(task.priority) : null}>
      {#if session !== null}
        <select
          aria-label="priority"
          value={session.draft.priority}
          onchange={(event) => edit("priority", event.currentTarget.value)}
        >
          {#each optionsFor(task.priority, PRIORITIES) as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      {:else}
        {task.priority ?? "—"}
      {/if}
    </dd>

    <dt>保存区分</dt>
    <dd>
      {task.storageState === null ? "保存区分不明" : STORAGE_LABEL[task.storageState]}
    </dd>

    <dt>milestone</dt>
    <dd>
      {#if session !== null}
        <select
          aria-label="milestone"
          value={session.draft.milestone}
          onchange={(event) => edit("milestone", event.currentTarget.value)}
        >
          {#each milestoneOptions(snapshot, task.milestone) as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      {:else if milestone === null}
        —
      {:else}
        {milestone.id}
        {#if milestone.title === null}
          <span class="mark unmapped">未解決</span>
        {:else}
          <span class="resolved">{milestone.title}</span>
        {/if}
      {/if}
    </dd>

    <!-- created と updated は別のセル (画面設計案 02 の 3 段目。doc-12 §3). 1 セルに 2 つ収めると
         `tabular-nums` が桁を揃える相手を持たない — 揃えたい 2 つが同じ列に立って初めて効く。 -->
    <dt>created</dt>
    <dd class="date">{task.createdDate ?? "—"}</dd>

    <dt>updated</dt>
    <dd class="date">{task.updatedDate ?? "—"}</dd>
  </dl>
{/snippet}

<!-- 見出しの操作が述べる文 (doc-8 §3, doc-11 §5): drawn *below* the 見出し rather than inside it. Every
     one of these appears and disappears — a 既定 write that was refused, an end-of-cell move, an id that
     cannot be built, the result of a copy, a file that left the read — so inside the 固定 band each of
     them would grow it, and the failed-copy one would grow it and stay. The band is the three rows
     doc-12 §3 transcribed and nothing else; height it takes is height the body never gets back.
     Adjacency is what doc-11 §5 actually asks for (a reason readable without hovering), and these sit
     immediately under the controls they speak for. -->
{#snippet headingNotes()}
  <div class="heading-notes">
    {#if persistenceNote !== null}
      <p class="hint">{persistenceNote}</p>
    {/if}
    {#if neighbours === null}
      <!-- 無効化提示 (doc-11 §5): the reason sits beside the control, not only in a tooltip. -->
      <p class="hint">{NO_LANE_CELL_REASON}</p>
    {/if}
    {#if crossId === null}
      <p class="hint">{CROSS_ID_UNAVAILABLE}</p>
    {/if}
    <!-- 成功・失敗を述べる語 (doc-11 §2.4, TASK-72). A live region because the control's own name must
         not change under the user: the figure and the 成功色 reach the eye, and this is what reaches
         the ear. `role="status"` — polite — so it waits for a pause rather than cutting in on whatever
         is being read; the copy has already happened either way. Always in the tree, empty when there is
         nothing to say: a region inserted at the moment it fills is not reliably announced. -->
    <div
      role="status"
      aria-live="polite"
      class="live"
      class:unseen={copyNotice?.state !== "failed"}
    >
      {#if copied}
        <p class="ok">横断タスクID をコピーしました。</p>
      {:else if copyNotice !== null && copyNotice.state === "failed"}
        <p class="warn">
          クリップボードへ書けませんでした。次の文字列を選択してコピーしてください。
          <input type="text" readonly value={copyNotice.text} aria-label="横断タスクID" />
        </p>
      {/if}
    </div>
    {#if missing}
      <!-- doc-8 §6.4: an external move does not get to take the 未保存入力 with it. The panel
           stays up showing the last read that resolved, so the input can be copied out before it
           is discarded on purpose. -->
      <p class="warn">{FILE_MISSING_REASON}</p>
    {/if}
  </div>
{/snippet}

<!-- 編集入口 (doc-8 §3): drawn at the right end of the heading's title row so that the way into an
     edit is reachable without scrolling — the same requirement that fixes the heading at all.
     **保存 と キャンセル are not here** (2026-08-10, doc-11 §11): those are the 発行 and its 取りやめ,
     and the rule puts them in a row pinned to the bottom of the panel (`editIssueRow`). What stays is
     the entry, which issues nothing. The slot is empty during a session, and the console below keeps
     every sentence that outlives the press. -->
{#snippet editEntry()}
  <div class="entry">
    {#if session === null}
      <button
        type="button"
        class="primary"
        disabled={availability.state !== "editable"}
        title={availability.state === "editable" ? "編集" : availability.reason}
        onclick={startEditing}
      >
        編集
      </button>
    {/if}
  </div>
{/snippet}

<!-- 発行の行 (doc-11 §11): the 編集セッション is the only 発行 this panel holds and the panel scrolls,
     so the row pins to its bottom. Inside it goes what has to be read *before* the press — the reason
     保存 is withheld, and the chord that runs it. The result of the press does not: a save that lands
     ends the session (doc-8 §6.3), so a sentence in this row would go down with the row. Those stay in
     the 編集卓 (doc-8 §3), which is drawn whether or not a session is open. -->
{#snippet editIssueRow()}
  <div class="issue">
    <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because `aria-describedby` points at
         it; printed unless the reason is one §8 licences the screen to leave unsaid. 変更はまだありません
         is such a reason (licence ②: the form itself says what to do next), so the row stays quiet
         until there is something to say. The chord's 併記 is not here at all any more — doc-7 §2.1
         takes `title` and `aria-keyshortcuts` plus the キーボード操作一覧 as discharging it. -->
    <span
      class="hint"
      id={SAVE_REASON_ID}
      class:unseen={saveGate.state === "ready" || omitsSentence(saveGate.reason)}
    >
      {saveGate.state === "ready" ? "" : saveGate.reason}
    </span>
    <div class="issue-actions">
      <!-- 取りやめ → 発行 (doc-11 §11). -->
      <button type="button" onclick={cancelEditing}>キャンセル</button>
      <!-- `aria-disabled` rather than `disabled`: this control's 保留理由 are of both kinds (doc-11 §8)
           — 発行中 and ファイルが無い are caused from outside the form and keep a printed line, 変更は
           まだありません is licensed away — and one control may not take focus or not depending on why
           it is withheld. `save()` holds the same gate, so a press while withheld issues nothing. -->
      <button
        type="button"
        class="primary"
        aria-disabled={saveGate.state !== "ready"}
        aria-describedby={saveGate.state === "ready" ? undefined : SAVE_REASON_ID}
        aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
        title={saveGate.state === "ready"
          ? `保存 (${shortcutHint("saveEditSession", MAC_KEYBOARD)})`
          : saveGate.reason}
        onclick={save}
      >
        {busy ? "保存中…" : "保存"}
      </button>
    </div>
  </div>
{/snippet}

<!-- 編集（明示保存） (doc-8 §3): 常設 in all three. Nothing here writes as you type, and Enter is
     not one of the save keys (doc-8 §6.2). The buttons are in the heading (`editEntry`); what is left
     here is every sentence that explains, warns or foretells. -->
{#snippet editConsole()}
  <section class="console">
    {#if session === null}
      {#if availability.state !== "editable"}
        <!-- 無効化提示 (doc-11 §5): the disabled 編集 button in the heading carries this in its
             `title`, and doc-11 §5 refuses to leave a reason on hover alone. -->
        <p class="hint">{availability.reason}</p>
      {/if}
    {:else}
      <!-- The chord's 併記 and the reason 保存 is withheld moved to the 発行の行 (doc-11 §11,
           `editIssueRow`): both have to be read at the moment the control is pressed, and that
           control is no longer here. Enter's own meaning stays stated at the field itself
           (`Editor.svelte`), where the key is pressed. -->
      {#if dirty}
        <!-- 破棄前確認 (doc-8 §6.3) を、押す前に読める形で置く: 入力を失う操作の前には同じ確認が
             上部帯に出る、という予告である。§6.3 の 5 経路をここへ数え上げないのは doc-11 §8 の
             設計文の写しに当たるためで、予告として要るのは「確認を通る」ことだけである。 -->
        <p class="hint">
          未保存入力があります。破棄する前に「{DISCARD_CONFIRM_PROCEED}」の確認を通します。
        </p>
      {/if}
      {#if externalChange}
        <!-- 編集中の継続検出 (doc-8 §6.4). 不整合 の色を取り、generic notice ではない: the version has
             *been observed* to move against this session's baseline. It is not recorded on the card,
             though — no save has been attempted, and doc-8 §6.4 keeps this stated rather than acted
             on, so it belongs to the live session and ends with it. -->
        <p class="conflict">
          このタスクのファイルが編集中に外部で変わりました（バージョン不整合）。入力はそのまま保持しています。
          保存時に更新前競合検出を通します。
        </p>
      {/if}
    {/if}

    {#if saveState.state === "applied"}
      <p class="ok">保存しました。</p>
    {:else if saveState.state === "failed"}
      <!-- CLI 失敗 (doc-5 §5): the display above is unchanged and the input is still here. -->
      <p class="warn">保存できませんでした: {saveState.detail}</p>
    {:else if saveState.state === "uncheckable"}
      <!-- 照合不能 (doc-9 §4.2/§5): its own family (`undetectable`), because 版がずれているとは
           限らず、確かめる方法が無い — doc-9 §5 requires this not to read as a conflict, and forbids
           offering an unchecked run as the way around it. -->
      <p class="undetectable">{saveState.detail}</p>
    {:else if saveState.state === "conflict"}
      <!-- 防げる競合の未然提示 (doc-9 §5): the check stopped this before the CLI ran. -->
      <div class="conflict">
        <p>
          更新前競合を検出したため、CLI を起動せずに保存を止めました（{conflictSetDetail(
            saveState,
          )}）。未保存入力は保持しています。
        </p>
        <div class="buttons">
          <button type="button" onclick={restartFromLatest}>
            最新を読み直してやり直す（入力を破棄）
          </button>
          <button type="button" onclick={reapplyOntoLatest}>
            入力を保持して最新版へ再適用する
          </button>
        </div>
        <p class="hint">
          再適用は、触った項目だけを最新版の上に載せ直します（触っていない項目は最新のままです）。
          内容を確かめてからもう一度保存してください。
        </p>
      </div>
    {:else if saveState.state === "diverged"}
      <!-- 防げない喪失の事後通知 (doc-9 §4.1/§5). Deliberately worded apart from the conflict
           above: this one was *not* prevented, and what an overwrite removed cannot be shown. -->
      <div class="conflict">
        <p>
          保存は適用されましたが、再読込した内容が送信した内容と一致しません（{saveState.fields.join(
            "・",
          )}）。照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。
        </p>
        <p class="hint">
          この間に入った外部更新は防げません。上書きで失われた場合、その内容は表示も復元もできません。
        </p>
      </div>
    {:else if conflict !== null}
      <!-- A バージョン不整合 recorded on an earlier visit to this task: the banners above belong to
           the save that just happened, and this one is what the swimlane card is still marking. Kept
           dismissible so the mark can be retired without a save — the input it belonged to is gone,
           so neither doc-9 §5 path applies any more. -->
      <div class="conflict">
        <p>{versionConflictReason(conflict)}</p>
        <p class="hint">表示は再読込後の最新内容です。未保存入力は残っていません。</p>
        <div class="buttons">
          <button type="button" onclick={() => onconflict(null, conflictTarget())}>
            確認した（不整合の印を消す）
          </button>
        </div>
      </div>
    {/if}

    {#if acDeltaDropped}
      <!-- Stated rather than done quietly: the rebase kept every other field's input, and a
           silently dropped AC operation would look like the save simply ignored it. -->
      <p class="warn">
        最新版では Acceptance Criteria の並びが変わっていたため、番号で指していた削除・チェックの
        指定は取り消しました（同じ番号が別の項目を指すため）。必要なら指定し直してください。
      </p>
    {/if}
  </section>
{/snippet}

<!-- 不整合区画 (decision-22, doc-8 §3): 3 配置とも常設で、折り畳めない。折畳みへ落とすと問題のある
     タスクが正常に見えるためであり（doc-8 §3）、それは開閉できる折畳みでも「前のタスクで閉じた状態」が
     引き継がれる形で起こりうる。**理由行だけを並べ、族名も総称も行には出さない** — 何件あるかと
     「不整合である」ことは、区画が在ることと見出しの ⚠️ が既に述べている。 -->
{#snippet inconsistencyPanel()}
  <!-- 条件は理由行の有無だけである。未知セクションは読み取り層が想定外スキーマとして記録する
       (`domain.rs` の `UnknownSection`) ので、それを持つタスクは必ず理由行を持つ — `||` で足すと、
       ⚠️ の無いタスクに「⚠️ 不整合」の見出しを描く枝ができる。 -->
  {#if reasons.length > 0}
    <section class="inconsistency-panel">
      <h3>
        <span class="glyph"><Icon name="triangle-alert" /></span>
        不整合
      </h3>
      {#each reasons as reason, index (index)}
        <p>{reason}</p>
      {/each}
      <!-- 未知セクション は区画ではなく不整合区画の中の項目だが、開閉の記号は折畳み区画に揃える
           (doc-8 §3) — 同じ面の中で UA 既定マーカーと 開閉印 が並ぶと、同じ操作が 2 通りの記号で
           出ることになる。向きは `[open]` から CSS で選ぶ: 開いているかを持つのは要素自身で、
           それを写した変数を別に置くと、タスクを移った先の別のセクションへ前の開閉が付く
           (この一覧の鍵は index であり、節の名前ではない)。 -->
      {#each task.unknownSections as section, index (index)}
        <details class="unknown">
          <summary>
            <!-- `mark` ではない: そのクラスは 状態の印 チップ (doc-11 §3) が取っており、
                 開閉印はその 4 系統のどれでもない。 -->
            <span class="disclosure closed"><Icon name={DISCLOSURE_ICON.closed} /></span>
            <span class="disclosure open"><Icon name={DISCLOSURE_ICON.open} /></span>
            未知セクション {section.name}（保持のみ）
          </summary>
          <pre class="body">{section.body}</pre>
        </details>
      {/each}
    </section>
  {/if}
{/snippet}

<!-- Type と通常ラベルは別区画 (doc-8 §4): two sections, never one label list. -->
{#snippet typeSection()}
  <DetailSection title="Type" section="type" {layout}>
    <ul class="chips">
      {#if types.length === 0}
        <!-- Type 未設定 は破線輪郭のチップ (doc-11 §3), カードと同じ形で. A sentence here and a chip on
             the card made the same 未設定 read as two different findings. -->
        <li class="type unset">Type 未設定</li>
      {:else}
        {#each types as value, index (index)}
          <li class="type" class:unknown={!value.known}>
            {value.value}{value.known ? "" : "（未知）"}
          </li>
        {/each}
      {/if}
    </ul>
    {#if session !== null}
      <p class="hint">{TYPE_NOT_EDITABLE}</p>
    {/if}
  </DetailSection>
{/snippet}

<!-- assignee (doc-8 §3): 見出しから外して本文側の区画へ置いた (TASK-72). 画面設計案 02 の属性表には
     あるが、本書は意図的に外れている (doc-12 §3) — 属性表を 2 列に保ったまま created と updated を
     別のセルへ割くためで、assignee は編集セッションでだけ書き換える値なので、常に読める必要がある
     見出しの側に要らない。割当表にはこの区画自身の行がある (TASK-73 まで通常ラベルの行を借りていた)。 -->
{#snippet assigneeSection()}
  <DetailSection title="assignee" section="assignee" {layout}>
    {#if session === null}
      {#if task.assignee.length === 0}
        <p class="neutral">なし</p>
      {:else}
        <p>{task.assignee.join(", ")}</p>
      {/if}
    {:else}
      <!-- 担当の設定・付け替えはこの画面で閉じる (doc-5 §3・doc-10 §7, TASK-57). 1 欄 1 値 —
           `-a` は 1 件しか受け取らず、frontmatter の一覧を丸ごと置き換える. -->
      <input
        type="text"
        aria-label="assignee"
        value={session.draft.assignee}
        oninput={(event) => edit("assignee", event.currentTarget.value)}
      />
      <p class="hint">{ASSIGNEE_NOT_CLEARABLE}</p>
      {#if assigneeCollapse !== null}
        <p class="warn">{assigneeCollapse}</p>
      {/if}
    {/if}
  </DetailSection>
{/snippet}

{#snippet labelsSection()}
  <DetailSection
    title="通常ラベル"
    section="labels" {layout}
    count={`${task.labels.length} 件`}
  >
    {#if session === null}
      {#if task.labels.length === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="chips">
          {#each task.labels as label, index (index)}
            <li class="label">{label}</li>
          {/each}
        </ul>
      {/if}
    {:else}
      {@render listEditor(
        session.draft.labels,
        (next) => edit("labels", next),
        newLabel,
        (value) => (newLabel = value),
        "追加するラベル",
        null,
      )}
    {/if}
  </DetailSection>
{/snippet}

{#snippet descriptionSection()}
  <DetailSection title="Description" section="description" {layout}>
    {#if session === null}
      {#if task.description}
        <pre class="body">{task.description}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <Editor
        label="Description"
        value={session.draft.description}
        rows={8}
        onchange={(value) => edit("description", value)}
        onsave={save}
      />
    {/if}
  </DetailSection>
{/snippet}

{#snippet acSection()}
  <DetailSection title="Acceptance Criteria" section="ac" {layout} progress={ac}>
    {#if session === null}
      {#if ac.total === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="ac">
          {#each task.acceptanceCriteria as item (item.number)}
            <li class:checked={item.checked}>
              <!-- 族を持たない状態の印 (doc-11 §2.4): not pressable outside an 編集セッション, so the
                   name goes on the wrapper. `role="img"` is required, not decoration — with the figure
                   `aria-hidden` this span has no content left, and `aria-label` on a bare span is not
                   announced. While it printed a glyph, the glyph itself was the name. -->
              <span class="box" role="img" aria-label={item.checked ? "完了" : "未完了"}>
                <Icon name={item.checked ? "square-check" : "square"} />
              </span>
              <span class="number">#{item.number}</span>
              <span class="text">{item.text}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <!-- 項目単位操作 と 全体差し替え を区別する (doc-5 §3/§3.1): the CLI has no single option that
           sets all criteria, so the composite replacement is its own mode, entered on purpose. -->
      <div class="modes">
        <button
          type="button"
          class="mini"
          class:on={session.draft.ac.mode === "delta"}
          onclick={() => (session = setAcMode(session!, "delta"))}
        >
          項目単位（増減・チェック）
        </button>
        <button
          type="button"
          class="mini"
          class:on={session.draft.ac.mode === "replace"}
          onclick={() => (session = setAcMode(session!, "replace"))}
        >
          全体差し替え
        </button>
      </div>

      {#if session.draft.ac.mode === "delta"}
        <ul class="ac">
          {#each acView as row (row.number)}
            <li class:checked={row.checked} class:removed={row.removed}>
              <!-- 編集セッション中は同じ印がアイコンのみのボタンになる (doc-11 §2.4). The figure pair is
                   the one 閲覧 draws, so the項 does not change appearance when the session opens; what
                   changes is that it can be pressed. The state the figure shows is in the name already
                   (「を完了にする」 can only be said of an unchecked one), so nothing is added for it. -->
              <button
                type="button"
                class="box"
                aria-label={`#${row.number} を${row.checked ? "未完了" : "完了"}にする`}
                onclick={() => (session = toggleAcCheck(session!, row.number))}
              >
                <Icon name={row.checked ? "square-check" : "square"} />
              </button>
              <span class="number">#{row.number}</span>
              <span class="text">{row.text}</span>
              <button
                type="button"
                class="mini"
                onclick={() => (session = toggleAcRemoval(session!, row.number))}
              >
                {row.removed ? "削除を取り消す" : "削除"}
              </button>
            </li>
          {/each}
        </ul>
        {#each session.draft.ac.delta.add as text, index (index)}
          <p class="hint">追加予定: {text}</p>
        {/each}
        <div class="add-row">
          <input
            type="text"
            placeholder="追加する Acceptance Criterion"
            value={newCriterion}
            oninput={(event) => (newCriterion = event.currentTarget.value)}
          />
          <button type="button" class="mini" onclick={addCriterion}>追加</button>
        </div>
        <p class="hint">
          既存項目の本文は項目単位では変えられません（CLI に本文編集の手段がないため）。本文を変える
          ときは全体差し替えを使います。
        </p>
      {:else}
        {@const items = session.draft.ac.mode === "replace" ? session.draft.ac.items : []}
        <ul class="ac-replace">
          {#each items as item, index (index)}
            <li>
              <label class="check">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onchange={(event) =>
                    edit("ac", {
                      mode: "replace",
                      items: items.map((entry, at) =>
                        at === index
                          ? { ...entry, checked: event.currentTarget.checked }
                          : entry,
                      ),
                    })}
                />
                完了
              </label>
              <Editor
                label={`Acceptance Criterion ${index + 1}`}
                value={item.text}
                rows={2}
                onchange={(value) =>
                  edit("ac", {
                    mode: "replace",
                    items: items.map((entry, at) =>
                      at === index ? { ...entry, text: value } : entry,
                    ),
                  })}
                onsave={save}
              />
              <button
                type="button"
                class="mini"
                onclick={() =>
                  edit("ac", {
                    mode: "replace",
                    items: items.filter((_, at) => at !== index),
                  })}
              >
                削除
              </button>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          class="mini"
          onclick={() =>
            edit("ac", { mode: "replace", items: [...items, { text: "", checked: false }] })}
        >
          項目を追加
        </button>
        <p class="hint">
          保存時に既存の全項目を削除してから、ここにある項目を並び順どおり作り直します。
        </p>
      {/if}
    {/if}
  </DetailSection>
{/snippet}

{#snippet planSection()}
  <DetailSection title="実装計画" section="plan" {layout}>
    {#if session === null}
      {#if task.implementationPlan}
        <pre class="body">{task.implementationPlan}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <Editor
        label="実装計画"
        value={session.draft.plan}
        onchange={(value) => edit("plan", value)}
        onsave={save}
      />
    {/if}
  </DetailSection>
{/snippet}

{#snippet notesSection()}
  <DetailSection title="実装ノート" section="notes" {layout}>
    {#if session === null}
      {#if task.implementationNotes}
        <pre class="body">{task.implementationNotes}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <div class="modes">
        <button
          type="button"
          class="mini"
          class:on={session.draft.notesMode === "set"}
          onclick={() => (session = setNotesMode(session!, "set"))}
        >
          置換（--notes）
        </button>
        <button
          type="button"
          class="mini"
          class:on={session.draft.notesMode === "append"}
          onclick={() => (session = setNotesMode(session!, "append"))}
        >
          追記（--append-notes）
        </button>
      </div>
      <Editor
        label={session.draft.notesMode === "append" ? "実装ノート（追記）" : "実装ノート"}
        value={session.draft.notes}
        onchange={(value) => edit("notes", value)}
        onsave={save}
      />
    {/if}
  </DetailSection>
{/snippet}

{#snippet dependenciesSection()}
  <DetailSection
    title="dependencies"
    section="dependencies" {layout}
    count={`${task.dependencies.length} 件`}
  >
    {#if session === null}
      {#if dependencies.length === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="deps">
          {#each dependencies as dependency, index (index)}
            <li>
              {#if dependency.target === null}
                <span class="id">{dependency.id}</span>
                <span class="mark unmapped">未解決</span>
              {:else}
                {@const target = dependency.target}
                <button type="button" onclick={() => onselect(target)}>
                  {dependency.id}
                  <span class="dep-title">{target.task.title ?? "（title 不明）"}</span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      {@render listEditor(
        session.draft.dependencies,
        (next) => edit("dependencies", next),
        newDependency,
        (value) => (newDependency = value),
        "TASK-ID",
        EMPTY_DEPENDENCIES_REASON,
      )}
      <p class="hint">保存時は既存を含む全集合で置き換えます。</p>
    {/if}
  </DetailSection>
{/snippet}

<!-- Pull Request URL は References と分離して独立表示 (doc-8 §4). Both sections stay visible in
     every 保存区分 (doc-8 §6.5) — they are 参照系, which reading never depends on edit rights. -->
{#snippet pullRequestSection()}
  <DetailSection
    title="Pull Request"
    section="pullRequest" {layout}
    count={`${references.pullRequests.length} 件`}
  >
    {#if references.pullRequests.length === 0}
      <p class="neutral">References に Pull Request URL はありません</p>
    {:else}
      <ul class="prs">
        {#each references.pullRequests as pr, index (index)}
          <li>
            <span class="url">{pr.url}</span>
            <span class="meta">
              {pr.host ?? "ホスト種別 不明"}{pr.owner && pr.repo
                ? ` / ${pr.owner}/${pr.repo}`
                : ""}{pr.number === null ? "" : ` / #${pr.number}`}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if session !== null}
      <p class="hint">
        Pull Request URL の登録は References の編集です。下の References 欄へ足すと、
        既存参照を含む非空全集合で置き換えます。
      </p>
    {/if}
  </DetailSection>
{/snippet}

{#snippet referencesSection()}
  <!-- 折畳み（件数を見せる） (doc-8 §3): the count is on the summary, so a folded References still
       says how many there are. -->
  <DetailSection
    title="References"
    section="references" {layout}
    count={`${references.references.length} 件`}
  >
    {#if session === null}
      {#if references.references.length === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="refs">
          {#each references.references as reference, index (index)}
            <li>
              <span class="url">{reference.value}</span>
              {#if reference.dangling}
                <span class="mark unmapped">参照欠損</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <!-- The list is every reference, Pull Request URLs included: `--ref` replaces the whole set,
           so editing anything less would drop the rest (doc-5 §3, doc-8 §6). -->
      {@render listEditor(
        session.draft.references,
        (next) => edit("references", next),
        newReference,
        (value) => (newReference = value),
        "URL",
        EMPTY_REFERENCES_REASON,
      )}
      <p class="hint">保存時は既存を含む全集合で置き換えます。</p>
    {/if}
  </DetailSection>
{/snippet}

<!-- 状態遷移・外部エディタ は doc-8 §3 の 1 行であり、同じ割当（3 配置とも折畳み。既定は併置・モーダルで
     閉、全面で開）で動く。2 つの区画に分けてあるのは操作の系統が違うためで、開き方は 1 つの規則に従う。 -->
{#snippet transitionsSection()}
  <DetailSection title="状態遷移" section="transitions" {layout}>
    {#if transitions.state === "none"}
      <!-- 提供しない理由であって不在ではない (doc-11 §5): 空表示の弱 (`--faint`) で描くと、読ませたい
           理由が一番読みにくい文字になる。 -->
      <p class="withheld-reason">{transitions.reason}</p>
    {:else}
      {#if busy}
        <!-- 発行中は全ての遷移が同じ理由で押せない (doc-11 §5): the offers' own reasons say nothing about
             it, so it is stated once for the list rather than left to each button's `title`. -->
        <p class="hint">{TRANSITION_BUSY_REASON}</p>
      {/if}
      <ul class="transition-list">
        {#each transitions.offers as offer (offer.kind)}
          <li>
            <button
              type="button"
              class="transition"
              disabled={!offer.enabled || busy}
              title={busy ? TRANSITION_BUSY_REASON : (offer.reason ?? offer.effect)}
              onclick={(event) => runTransition(offer, event.currentTarget)}
            >
              <!-- 語尾の … (doc-11 §12): every 状態遷移 asks first, so the mark is unconditional here. -->
              {confirmMarkedLabel(offer.label)}
            </button>
            <span class="effect">{offer.reason ?? offer.effect}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </DetailSection>
{/snippet}

<!-- 外部エディタ経路 (doc-8 §7). Atlas starts the editor and writes nothing; the editor's save comes
     back through the file watch (doc-9 §3), so nothing here waits for it to close. Offered for every
     保存区分 and independently of the CLI probe: this is where doc-8 §6.5 and doc-5 §3.1 send the
     edits Atlas itself cannot issue. -->
{#snippet externalEditorSection()}
  <DetailSection title="外部エディタで開く" section="transitions" {layout}>
    <!-- 管理ファイルのパス (doc-8 §7): 見出しから移した (TASK-72). 開く操作の隣がパスの置き場である —
         何を開こうとしているのかは押す前に読めていなければならない。画面でこのパスを出しているのは
         ここだけなので、不整合や外部変更の切り分けでファイルを特定する手掛かりもここにある。 -->
    <p class="path">{task.sourcePath}</p>
    <!-- 開く前に示す (doc-8 §7 難点と受け方): the frontmatter is exposed and the CLI's schema checking
         is bypassed, so this is stated before a launch rather than after a degraded read. -->
    <p class="warn">{FRONTMATTER_NOTICE}</p>
    {#if watchStopped}
      <!-- 継続検出が止まっている場合の書き戻し (doc-8 §7): said before the launch, with the re-read
           that is the only thing which will bring the edit back. -->
      <p class="warn">{WATCH_STOPPED_NOTE}</p>
      <p><button type="button" class="mini" onclick={onreread}>{REREAD_ROOT_LABEL}</button></p>
    {/if}
    {#if dirty}
      <!-- 二重取り込みの回避 (doc-8 §6.4): stated here, and the launch asks before it starts
           (doc-11 §12) with this same text as the question. The input is not discarded either way. -->
      <p class="warn">{UNSAVED_INPUT_WARNING}</p>
    {/if}
    <ul class="editor-list">
      {#each editorOfferList as offer (offer.method)}
        <li>
          <button
            type="button"
            disabled={!offer.enabled}
            title={offer.reason ?? offer.command}
            onclick={(event) => openExternally(offer, event.currentTarget)}
          >
            <!-- 語尾の … only while the launch asks (doc-11 §12): the question is raised by 未保存入力,
                 and a mark left on when nothing will be asked predicts nothing. -->
            {needsConfirmation(dirty) ? confirmMarkedLabel(offer.label) : offer.label}
          </button>
          <span class="effect">{offer.enabled ? offer.command : ""}</span>
          {#if offer.reason !== null}
            <span class="effect">{offer.reason}</span>
          {/if}
        </li>
      {/each}
    </ul>
    {#if openNotice !== null && openNotice.state === "launched"}
      <p class="ok">{openNotice.summary}</p>
    {:else if openNotice !== null}
      <!-- `deferred` and `failed` both read as "not opened, and here is why"; the notice above says
           what to do next in either case. -->
      <p class="warn">{openNotice.detail}</p>
    {/if}
  </DetailSection>
{/snippet}

{#snippet gitHistorySection()}
  <DetailSection title="Git 履歴欄" section="gitHistory" {layout}>
    <GitHistory
      {history}
      {entry}
      detail={layout.history}
      onexpand={placement === "full" ? null : () => onplacement("full")}
      onreload={onreloadHistory}
    />
  </DetailSection>
{/snippet}

<!-- 状態遷移・外部エディタ は doc-8 §3 の 1 行なので、2 つの snippet が 1 区画を描く。並びを引く側は
     その行を 1 つの区画として扱えなければならないので、ここでまとめておく。 -->
{#snippet transitionsRow()}
  {@render transitionsSection()}
  {@render externalEditorSection()}
{/snippet}

<!--
  区画 1 つにつき snippet 1 つ。**ここに並びは無い** — 並びを持つのは `placement.ts` の
  `MAIN_COLUMN_ORDER` / `SIDE_COLUMN_ORDER` / `SINGLE_COLUMN_ORDER` だけで、下の `{#each}` が
  それを引いて描く。区画名から snippet への対応は並びではないので、ここに綴っても正本は割れない。
  以前はこの位置に列ごとの呼び出し列があり、それが doc-8 §3.1 の並びの 2 つ目の写しになっていた —
  片方だけ入れ替えてもテストは全部通る形だったので、写しを持たない形へ替えた。
  `satisfies` が `Record<SectionKey, Snippet>` を要求するので、doc-8 §3 の割当表へ行が増えたら
  この表もコンパイルが通らなくなる (`placement.ts` の割当表と同じ守り方)。`SectionKey` は
  `DetailSection` 型の別名である — このファイルでは `DetailSection` は同名のコンポーネントを指す。
  見出しと編集卓もここに居るが、どちらの並びにも入らない — 列の上に固定される行だからである
  (doc-8 §2.2)。それは `SECTION_COLUMN` の `"wide"` としてテストが押さえている。
-->
{#snippet column(order: readonly SectionKey[])}
  {@const draw = {
    heading,
    editConsole,
    inconsistency: inconsistencyPanel,
    description: descriptionSection,
    ac: acSection,
    plan: planSection,
    notes: notesSection,
    gitHistory: gitHistorySection,
    type: typeSection,
    labels: labelsSection,
    assignee: assigneeSection,
    dependencies: dependenciesSection,
    pullRequest: pullRequestSection,
    references: referencesSection,
    transitions: transitionsRow,
  } satisfies Record<SectionKey, Snippet>}
  {#each order as section (section)}
    {@render draw[section]()}
  {/each}
{/snippet}

<aside
  class="detail"
  data-placement={placement}
  aria-label="タスク詳細"
  style="--modal-side-column: {MODAL_SIDE_COLUMN_REM}rem; --modal-column-gap: {MODAL_COLUMN_GAP_REM}rem; --panel-padding: {PANEL_PADDING_REM /
    2}rem; --modal-inset: {MODAL_INSET_REM / 2}rem; --modal-max-width: {MODAL_MAX_WIDTH_REM}rem; --prose-max-width: {PROSE_MAX_WIDTH_REM}rem; --sidebar-width: {SIDEBAR_WIDTH_REM}rem;"
>
  {@render heading()}
  {@render headingNotes()}
  {@render editConsole()}

  {#if layout.columns === 2}
    <!-- 中央モーダルと全面シングルビューは 2 列を保つ (doc-8 §2.1): the 脇列 is a fixed 18rem and the
         主列 takes the rest, with no breakpoint that stacks them — 狭いからといって縦積みへ落とさない. -->
    <div class="columns">
      <div class="col">{@render column(MAIN_COLUMN_ORDER)}</div>
      <div class="col">{@render column(SIDE_COLUMN_ORDER)}</div>
    </div>
  {:else}
    <!-- 併置サイドバーだけが列を持たない (doc-8 §2.1)。`SINGLE_COLUMN_ORDER` は主列の並びに脇列の
         並びを継いだもので、`placement.ts` が連結して作る。 -->
    <div class="flow">{@render column(SINGLE_COLUMN_ORDER)}</div>
  {/if}

  <!-- 発行の行 (doc-11 §11), last so it pins against this panel's bottom edge in all three placements —
       the same box the 見出し pins against at the top. Only while a session is open: there is no 発行
       to place otherwise, and a row standing empty would take height from the body for nothing. -->
  {#if session !== null}
    {@render editIssueRow()}
  {/if}
</aside>

<style lang="scss">
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    // No top padding: the sticky 見出し owns it (see `.heading`). Left here, it became a 9.6px strip
    // above the band that the content scrolled through — measured, and visible in a screenshot as the
    // 縮退帯 appearing over the pinned heading. The sideways value comes from `lib/placement.ts` so
    // that this padding and the band's pull-out below are one number rather than two that have to
    // agree (TASK-115).
    padding: 0 var(--panel-padding) 1rem;
    background: var(--panel);
    // Scrolls inside itself so the swimlane keeps its own scroll position while the panel is open.
    overflow-y: auto;

    // 編集セッション中は下端に発行の行が居るので、この箱の下 padding は要らない — 残すと行が縁から
    // 浮き、スクロールの末尾でそのぶん持ち上がる (目視 2026-08-10。3 配置とも)。
    &:has(> .issue) {
      padding-bottom: 0;
    }
  }

  // 併置サイドバー (doc-8 §2.1): a fixed share of the width — the grid beside it is the element
  // that gives way (it scrolls).
  .detail[data-placement="sidebar"] {
    flex: none;
    // 45vw is this component's own floor for a small window; the 30rem is doc-8 §2.1's number and
    // comes from `lib/placement.ts`, so the document and the layout hold one value between them.
    width: min(var(--sidebar-width), 45vw);
    border-left: 1px solid var(--line);
  }

  // 中央モーダル (doc-8 §2.1): a box over the grid, wide enough for two columns at 1280×800. The
  // numbers come from `lib/placement.ts` through the custom properties above, so the width the
  // test checks and the width the browser lays out are the same numbers.
  //
  // This `width` is a *content* box — app.scss's `border-box` rule reaches フォーム部品 only, and this
  // is a panel (doc-11 §2.2); the repository has no reset beyond that — so it is the
  // box the two columns divide, and the padding and border below are laid outside it. `placement.ts`
  // states its geometry in those terms for that reason (TASK-115).
  .detail[data-placement="modal"] {
    width: min(var(--modal-max-width), calc(100vw - var(--modal-inset) * 2));
    max-height: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    box-shadow: 0 8px 32px color-mix(in srgb, var(--fg) 25%, transparent);
  }

  // 全面シングルビュー (doc-8 §2.1): the swimlane is put away and the panel takes the space.
  .detail[data-placement="full"] {
    flex: 1;
    min-width: 0;
  }

  .columns,
  .flow,
  .col {
    display: grid;
    align-content: start;
    gap: 0.6rem;
  }

  // 1 列 (併置サイドバーだけ。doc-8 §2.1) と、2 列配置の各列そのもの.
  // `minmax(0, 1fr)` は、長い 1 行が列幅を押し広げて隣の列を箱の外へ追い出すのを止める。
  .flow,
  .col {
    grid-template-columns: minmax(0, 1fr);
  }

  // 2 列 (doc-8 §2.1): 中央モーダルと全面シングルビューが共に使う。脇列は固定 18rem、主列が残りを
  // 取る。畳む分岐は無い。custom property の名は中央モーダル時代のままで、値の出所も同じである。
  .columns {
    grid-template-columns: minmax(0, 1fr) var(--modal-side-column);
    gap: var(--modal-column-gap);
    align-items: start;
  }

  /*
   * 見出しは 3 配置とも固定 (doc-8 §3, AC #2). `.detail` is the scroll container (`overflow-y: auto`)
   * and this is its direct child, so `sticky` pins against that box in all three placements without
   * any per-placement rule.
   *
   * The band has to reach all four of the panel's edges, or the content scrolls through whatever it does
   * not cover. Sideways that is negative margins with matching padding, against the panel's horizontal
   * padding. Upwards it is the panel having *no* top padding and this element carrying it instead: a
   * negative top margin does not work, because a sticky box is pinned by its static position and the
   * pull-up is given straight back when it sticks. That was measured — the band settled 9.6px below the
   * panel's edge in both engines, and a screenshot showed the 縮退帯 riding through the gap.
   * `--panel` is the same requirement in the third dimension: a transparent sticky band is a band the
   * text scrolls *through*.
   *
   * What is fixed is deliberately only the three rows doc-12 §3 transcribed. Every sentence that comes
   * and goes is drawn outside it — the ones the heading's own controls speak (`.heading-notes`) and the
   * ones the session speaks (the 編集卓) — because the band cannot grow without taking that height from
   * the body permanently, and the failed-copy notice would grow it and then stay.
   */
  .heading {
    /*
     * The height and the text size of every control in the heading's first row, as one value each —
     * the same reason `Swimlane.svelte` has `--head-control`. The ↑↓, the 3 配置切替 and 閉じる draw a
     * figure or a word in boxes that do not otherwise share anything, and a figure is `1em` of its own
     * box (doc-11 §2.4) rather than a line box handed down by the row: without one font-size taken by
     * all of them they would only line up by coincidence, and the coincidence differs by engine.
     * Declared here rather than on `.frame` because the ↑↓ group sits outside it and has to take the
     * same two numbers (TASK-72 moved 前後移動 into this row).
     */
    --frame-control: 1.4rem;
    --frame-text: 0.7rem;

    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0 calc(var(--panel-padding) * -1);
    padding: 0.6rem var(--panel-padding) 0.4rem;
    border-bottom: 1px solid var(--line);
    background: var(--panel);

    h2 {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.35;
    }
  }

  // The band needs no per-placement rule sideways. There used to be one for the 中央モーダル, on the
  // grounds that its horizontal padding differed — it does not: `.detail` takes `--panel-padding` in
  // all three placements, so that rule wrote the same value back (TASK-115 measured 12px a side in
  // each). The pull-out above draws on that one value and reaches the edges of every placement.

  // 2 行目: title が伸びしろを取り、編集入口は右端で自分の幅のまま。
  .title-line {
    align-items: center;
    gap: 0.5rem;
    // The items stay on one line (`.line` above), and the title takes at most two — the clamp below
    // is what makes that true. The earlier note here read "one line in both states (目視 2026-08-04)",
    // which the 2026-08-11 measurement contradicts: the 目視 was done in a wide window, and in a
    // narrow one this row grows with the title it is drawing.

    /*
     * 2 行で止める (doc-11 §13). A title has no length limit — it is whatever the task's frontmatter
     * says — and this row is inside the 固定帯, so an unbounded one takes the 覆われない帯 with it:
     * measured at 480 characters the band went to -126.0px in a 640×480 窓 and every control in the
     * panel became unreachable (2026-08-11, both engines). §13 asks for exactly this — what stands in
     * a fixed row must not grow with what it is drawing — so the row keeps two lines and the whole
     * string stays in `title`, the same trade the id line makes one row up.
     *
     * `-webkit-line-clamp` rather than a `max-height` in `em`: the clamp counts line boxes, so it
     * lands on a line boundary in both engines instead of slicing one in half at whatever
     * `line-height` resolves to.
     */
    h2 {
      display: -webkit-box;
      flex: 1;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      min-width: 0;
      overflow: hidden;
    }

    // Editing: the label sits *beside* its input rather than above it, so the field is one line like
    // the `h2` it replaces. `min-width: 0` on both is what lets the input give way instead of pushing
    // 保存・キャンセル onto a line of their own — a flex item's default `min-width: auto` refuses to
    // shrink below its content.
    .field {
      flex: 1;
      min-width: 0;
      flex-direction: row;
      align-items: center;
      gap: 0.3rem;

      span {
        flex: none;
      }

      input {
        flex: 1;
        min-width: 0;
      }
    }
  }

  /*
   * 見出しが述べる文の置き場: 固定帯のすぐ下、本文より前。
   *
   * `display: contents` so the group itself lays nothing out: its children become items of the panel's
   * own column and take that column's spacing, and — when there is nothing to say — this subtree
   * contributes no box at all. A wrapper with its own box would spend one of the panel's `gap`s
   * whether or not it had anything in it.
   */
  .heading-notes {
    display: contents;
  }

  /*
   * 成功の語は読み上げにだけ残す (doc-11 §2.4)。The figure already says it to the eye — `clipboard`
   * becomes `clipboard-check` and takes the 成功色 — so a sentence repeating that is one the sighted
   * reader has to read past every time they copy an id. What it must not do is disappear from the
   * accessibility tree, because the tree is the *only* place the result exists for a screen reader:
   * `aria-label` stays fixed on the button by doc-11 §2.4, and a figure announces nothing.
   *
   * Hence visually hidden rather than `display: none` or a removed element. Both of those take it out
   * of the tree, and an unmounted region announces nothing when it fills, which is the whole reason it
   * is kept mounted. Out of flow as well, so a silent round spends none of the panel's `gap`.
   *
   * The failure notice is not covered by this: it carries the id as selectable text, which is the only
   * way left to copy it, and no figure says that. It stays visible — which is why the class is driven
   * by the failure state rather than by "is there anything to say".
   */
  /*
   * The 発行の行's reason takes the same treatment for a different requirement: doc-11 §8 licences the
   * screen not to *print* 変更はまだありません, and doc-11 §5 keeps it reachable all the same, because
   * 保存 points at it with `aria-describedby`. Selecting on the class alone rather than qualifying it
   * as `.live.unseen` does, so both users of it get the same hiding — this was two rules for one
   * behaviour until the reason was added (2026-08-10), and the reason was drawn on screen in the
   * meantime because nothing here matched the class the markup was setting.
   */
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .entry {
    display: flex;
    flex: none;
    gap: 0.3rem;
    margin-left: auto;
  }

  /*
   * 発行の行 (doc-11 §11), pinned against the same box the 見出し band pins against — `.detail` is the
   * scroll container in all three placements, so one rule covers them. The sideways pull-out and the
   * opaque background are the band's requirements read the other way up: a transparent pinned row is
   * one the body scrolls *through*, and a row that stops at the panel's padding leaves a strip of
   * text showing beside it.
   *
   * Unlike the band, this row may grow: the withheld reason is a sentence of unknown length. That is
   * affordable here and was not there — the band takes its height off the top of the body permanently,
   * while this row stands only during a session and is what the session is being read for.
   */
  .issue {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 calc(var(--panel-padding) * -1);
    padding: 0.45rem var(--panel-padding) 0.5rem;
    border-top: 1px solid var(--line);
    background: var(--panel);

    .hint {
      margin: 0;
      text-align: center;
      font-size: 0.7rem;
    }
  }

  .issue-actions {
    display: flex;
    // 行の中で中央 (doc-11 §11).
    justify-content: center;
    gap: 0.3rem;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }

  /*
   * 1 行に収める (doc-8 §2.2) は、収まる幅では守り、収まらない幅では折り返す。**収まらない幅がある** —
   * この行の控えの群は 253.73px (WebKit) / 257.14px (Chromium) を占め、縮まない。一方 併置サイドバーは
   * `min(30rem, 45vw)` なので、窓 590px あたりでパネルの内容幅がその数を切る (2026-08-11 実測)。
   *
   * `nowrap` で押し通すと、そこから下は**横あふれ**になる (560px 窓で 12 / 16px) か、ID の描画幅が 0 に
   * なる (600 / 620px 窓で実測) かのどちらかである。後者は doc-8 §2.2 が ID に与えた役目 —— 他所から
   * このタスクを指し示す唯一の手段 —— を画面から消す。
   *
   * だから ID に**下限**を与え、折り返しを許す。**この行が折り返しても 覆われない帯 (doc-11 §13) は
   * 割れない** — 帯を割っていたのは 3 行目の属性表で、それは固定帯の外へ出た。1 行に収めることは、
   * それ自体が目的だったのではなく、帯を守るための手段だった。
   *
   * `flex: 1 1 0` は「折り返すかどうかは下限で決め、収まったら余りを全部取る」を 1 つの宣言で書く形で
   * ある: 折り返しの判定が読むのは基準寸法を下限で留めた値なので、行は ID が下限を割るときにだけ
   * 折り返し、そうでなければ ID が余白を吸って全体が出る。
   */
  .id-line {
    // 控えと印は自分の寸法のまま。縮ませると図形と語が潰れ、doc-11 §2.2 の控えの群の 1 値も崩れる。
    > :not(.identity) {
      flex: none;
    }
  }

  // 前後移動 (doc-8 §2.2): 1 行目の右端、配置切替の手前。`margin-left: auto` はこちらが持ち、
  // `.frame` はその隣に続く — 2 つとも auto を持つと間が開いて 1 つの群に見えなくなる。
  .nav {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
    // The same two values the 操作群 beside it takes (`.frame`), so the ↑↓ and the 3 配置切替 line up
    // by one number rather than by coincidence.
    font-size: var(--frame-text);
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-control);
    height: var(--frame-control);
    padding: 0;
  }

  .position {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    opacity: 0.7;
  }

  .identity {
    // 下限 4rem は「`atlas:TASK-1` の頭が読める幅」で、`.copy` が同じ行に居られる最小でもある
    // (実測 64px ＝ 約 6 字 ＋ 省略記号)。0 を許すと、行は収まったまま ID が消える。
    flex: 1 1 0;
    min-width: 4rem;
    overflow: hidden;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.75;
  }

  // 横断タスクID のコピー (doc-8 §2.2): アイコンのみのボタン sitting against the id it copies.
  .copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    // Square, and sized from the id beside it rather than from `--frame-control`: this control belongs
    // to the ID, not to the 操作群 at the other end of the line (doc-8 §2.2 puts those two apart).
    width: 1.35rem;
    height: 1.35rem;
    padding: 0;
    font-size: 0.75rem;
    // No transition at rest. `color` is the property the 成功色 and its fade both move (the figure is
    // `currentColor`, doc-11 §2.4), and a standing `transition: color` on this button animates *every*
    // change of it — 表示テーマ の切り替え included, which measured as this one control easing to its
    // new colour while the rest of the panel had already changed. The transition belongs to the fade,
    // so `.fading` is what carries it.

    /*
     * 成功色 (AC #5, TASK-72): `--info` の代替 — decision-12 と doc-11 §2.1 が `--info` を通知・確認の
     * 色と定めており、コピー成功は確認そのものである。新しい変数を起こしていないのは、成功が図形
     * (`clipboard-check`) で述べられていて色がその繰り返しだからで、色相を 1 つ増やしても新しい判別は
     * 生まれない。実測では 10 テーマとも `--info` 対 `--panel` が 5.67:1 以上あり、非文字要素の下限
     * 3:1 を満たす。
     *
     * `transition: none` on the way in: 成功は押した瞬間の返事なので、色が育つのを待たせない。
     * 成功は押した瞬間の返事なので、入るときは transition を持たせない (色が育つのを待たせない)。
     * フェードは `.fading` に入った瞬間から始まり、図形は色が引き終わるまで `clipboard-check` の
     * ままで、そのあと `clipboard` へ戻る。時間はスクリプトの `COPY_FADE_MS` から `--copy-fade` で
     * 入ってくるので、フェードとそれを終わらせるタイマーは 1 つの数である。
     */
    &.copied {
      color: var(--info);
    }

    &.fading {
      color: inherit;
      transition: color var(--copy-fade) ease;
    }
  }

  // 配置の切替と閉じるは 1 つの操作群 (doc-8 §2.2).
  .frame {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .placement {
    display: flex;
    gap: 0.2rem;
  }

  .switch {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    // A step taller than the `--head-control` the 列・行折畳み use, because this control carries a
    // mark below its figure and that one does not: measured at 1.2rem the 既定印 sat against the
    // frame and read as part of it.
    height: var(--frame-control);
    // Square: an アイコンのみのボタン has nothing to be wider than its figure for, and three of them
    // side by side read as one group of switches only if they are the same size.
    width: var(--frame-control);
    padding: 0;
    font-size: var(--frame-text);

    &.on {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }

    /*
     * 既定印 (doc-8 §2.2): the 下線 画面設計案 02 puts on the button of the placement the next start
     * will open in (doc-12 §3). Its own element rather than a bottom border or an inset shadow —
     * both of those follow the border radius and end up reading as the button's own frame, which the
     * first measurement showed. Absolute, so it takes no part in the layout: the three switches stay
     * the same size whichever of them is the 既定.
     *
     * `--fg` rather than the `--line-strong` of the frame around it: a mark that shares the frame's
     * colour is a thicker frame. It stays 中立 (decision-6) all the same — being the 既定 is which
     * placement is stored, not a 族 of state — and `.on`'s `--info` border is left to say the other
     * thing, since いま出ている配置 と 次回開く配置 can be true of different buttons at once.
     */
    &.is-default::after {
      content: "";
      position: absolute;
      right: 0.25rem;
      bottom: 0.1rem;
      left: 0.25rem;
      height: 2px;
      border-radius: 1px;
      background: var(--fg);
    }
  }

  .close {
    // The height is written with a border and padding in play; app.scss folds them in for every
    // フォーム部品 (doc-11 §2.2), so this rule states only the placement. `inline-flex` centres the
    // word in that height — the switches beside it centre a figure the same way.
    display: inline-flex;
    align-items: center;
    height: var(--frame-control);
    padding: 0 0.4rem;
    font-size: var(--frame-text);
  }

  /*
   * 主要属性の属性表 (画面設計案 02。doc-12 §3): 3 段 2 列。Four grid tracks — label, value, label,
   * value — so the six items fall into three rows of two pairs in source order, which is the order
   * doc-8 §3 writes them in. The label tracks are `auto` rather than a fixed 5.5rem: with two pairs on
   * a line, a fixed label column spends width the values need, and the labels here are short.
   *
   * `--frame-control` is not involved: these rows carry text only, so the line box is the right thing
   * to size them. (An earlier note here said the table "drops to one pair per line under a narrow
   * box". It does not — the four tracks have no wrapping rule — and what it actually did was push the
   * panel sideways, measured at 35 / 66 / 84px of horizontal overflow in a 700 / 560 / 480px 窓 during
   * an 編集セッション, 変更前 2026-08-11. `minmax(0, 1fr)` lets the *track* reach zero; the `select` in
   * it kept its own `min-width: auto`, so the track could not take the value with it.)
   */
  .facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.15rem 0.5rem;
    margin: 0;
    font-size: 0.74rem;

    // 値は列の幅に従う。値が列を押し広げると、押し広げた分だけパネルが横へスクロールする。
    select {
      min-width: 0;
    }

    dt {
      opacity: 0.6;
    }

    dd {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.3rem;

      // priority の値 (decision-23): 素の文字なので満たすのは面に対する 4.5:1 のほう
      // (優先度色の収録条件)。`font-weight` は上げない — カードのチップと違い、ここは 6 つの属性が
      // 同じ体裁で並ぶ表であり、1 行だけ太くすると色ではなく太さが目を引く。
      &[data-priority="high"] {
        color: var(--priority-high);
      }

      &[data-priority="medium"] {
        color: var(--priority-medium);
      }

      &[data-priority="low"] {
        color: var(--priority-low);
      }
    }
  }

  .date {
    font-variant-numeric: tabular-nums;
  }

  .path {
    word-break: break-all;
    opacity: 0.7;
  }

  .raw {
    font-weight: 600;
  }

  .column,
  .resolved {
    opacity: 0.7;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    h3 {
      margin: 0;
      font-size: 0.8rem;
    }
  }

  .body {
    margin: 0;
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);
    font-family: inherit;
    font-size: 0.74rem;
    line-height: 1.5;
    // Long lines wrap instead of scrolling the panel sideways; newlines are kept as written.
    white-space: pre-wrap;
    word-break: break-word;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.7rem;
  }

  // Same rule as the card's (doc-11 §3), so the two screens do not draw the same distinction two
  // ways: Type は塗り＋太字＋角丸 3px、通常ラベルは輪郭ピル＋細字＋`--muted`. Here the two are already
  // separate 区画 (doc-8 §4), and the chip shapes keep them apart once both are on screen at once.
  .type {
    padding: 0 0.35rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--fg) 13%, transparent);
    font-weight: 600;

    &.unset {
      background: none;
      border: 1px dashed var(--line-strong);
      color: var(--muted);
      font-weight: 400;
    }

    &.unknown {
      background: none;
      border: 1px solid var(--line-strong);
    }
  }

  .label {
    padding: 0 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
  }

  .ac,
  .deps,
  .refs,
  .prs,
  .list-edit,
  .ac-replace,
  .transition-list,
  .editor-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.74rem;
  }

  .ac li {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;

    &.checked .text {
      opacity: 0.65;
    }

    // A criterion marked for removal is still listed: the save has not happened, and taking it out
    // of the list would hide what the mark is about to do.
    &.removed .text {
      text-decoration: line-through;
      opacity: 0.55;
    }
  }

  .number {
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .deps li {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;

    button {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      padding: 0.1rem 0.35rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.74rem;
      text-align: left;
      cursor: pointer;

      &:hover {
        border-color: var(--line-strong);
      }
    }
  }

  .dep-title {
    opacity: 0.7;
  }

  .refs li,
  .prs li,
  .list-edit li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .url {
    word-break: break-all;
  }

  .meta {
    font-size: 0.68rem;
    opacity: 0.6;
  }

  .mark {
    padding: 0 0.3rem;
    border-radius: 3px;
    font-size: 0.66rem;
  }

  // 不整合印 (decision-22): 印グリフ なので族の色は図形自身が持ち、背景も枠も無い。カードと同じ扱いで、
  // 大きさは隣の 印チップ・横断タスクID より 1 段大きい .8rem — 語を持たない図形は、同じ高さの文字より
  // 小さく見えるためである（カード側と同じ理由・同じ値）。
  .inconsistent {
    display: inline-flex;
    align-items: center;
    align-self: center;
    color: var(--mark-inconsistent);
    font-size: 0.8rem;
    cursor: help;
  }

  // 印の族を混ぜない (decision-6, decision-22): each family takes
  // its own colour from the 表示テーマ's one definition in `app.scss` (`lib/mark.ts` の MarkKind), an
  // unmapped or dangling reference is outlined, and a merely-informative state stays plain.
  //
  // 印チップ配色規則 (decision-12): 文字＝族の色、背景＝族の色 12% 混色、枠＝族の色 45% 混色。Each family
  // sets `--family` and nothing else, so the same three declarations serve all of them.
  .mark[data-kind] {
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
  }

  .mark[data-kind="inconsistent"] {
    --family: var(--mark-inconsistent);
  }

  .mark[data-kind="unreadable"] {
    --family: var(--mark-unreadable);
  }

  .mark.unmapped {
    border: 1px solid var(--line-strong);
  }

  // 中立の情報は族でも Type でもない (doc-11 §3): `--muted`, no family colour — it reports what the
  // project's config says, not that anything is wrong with it.
  .mark.neutral {
    color: var(--muted);
  }

  p {
    margin: 0;
    font-size: 0.74rem;
  }

  // 正常な不在は `--faint` (doc-11 §2.1・§6), the same 弱 as 空セル の `—` and the Git 履歴欄's 該当なし.
  // An opacity would land somewhere else on every 表示テーマ and pull the three apart. Only 空表示
  // takes it: a 理由 is 副次 (`--muted`), never 弱 — see `.withheld-reason`.
  .neutral {
    color: var(--faint);
  }

  .withheld-reason {
    color: var(--muted);
  }

  // 不整合区画 (decision-22). 面の左端の 3px は残る — doc-11 §2.3 の 問題の縁 のうち外れたのは
  // カードの側だけで、こちらは区画そのものが何の区画かを述べている（カードでは ⚠️ がそれを述べる）。
  .inconsistency-panel {
    padding: 0.35rem 0.45rem;
    border-left: 3px solid var(--mark-inconsistent);
    background: color-mix(in srgb, var(--mark-inconsistent) 10%, transparent);

    // 区画見出しの中の 印グリフ (decision-22): 見出しの語と同じ色で、同じ 1em に従う。
    h3 {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--mark-inconsistent);
    }

    .glyph {
      display: inline-flex;
    }

    details {
      font-size: 0.72rem;
    }
  }

  .unknown {
    summary {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      // 開閉印 が UA 既定マーカーの代わりに立つ (doc-8 §3). WebKit は擬似要素、Chromium は
      // `list-style` に答えるので、両方を書かないと片方の webview で記号が 2 つ出る。
      list-style: none;
      cursor: pointer;

      &::-webkit-details-marker {
        display: none;
      }
    }

    .disclosure.open {
      display: none;
    }

    &[open] .disclosure.open {
      display: block;
    }

    &[open] .disclosure.closed {
      display: none;
    }
  }

  // --- editing ---------------------------------------------------------------------------

  .console {
    gap: 0.3rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    // 述べることが無いときは枠ごと消す。TASK-72 が押しボタンを見出しへ移してから、この区画は文だけを
    // 持つようになり、何も述べない状態 (編集できるタスクを編集していないとき) が通常になった — 空の枠は
    // 読むものが 1 つあるように見えて何も無い。doc-11 §6 の 正常な不在 に当たらないので目印も置かない:
    // そこが要求しているのは「空セル」のように不在そのものが情報である場合で、ここは言うことが無いだけ。
    // 上の `{#if}` 群の条件を書き写さず要素の有無で見るのは、二重に持つと片方だけが動くためである。
    &:not(:has(*)) {
      display: none;
    }
  }

  // 控えの群 (doc-11 §2.2): the two ways out of a 更新前競合 (doc-9 §5), side by side with no field
  // between them. The panel's step, like the groups in its heading — neither answer is a 発行 (§11):
  // one re-reads, the other re-applies what is already typed, and the 保存 that follows is elsewhere.
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;

    button {
      height: 1.4rem;
    }
  }

  // 控えの群 (doc-11 §2.2): two buttons choosing one mode, with no field among them, so they take a
  // step like the 前後移動 and 配置切替 groups above — the panel's 1.4rem. Not a 発行の行 (§11): neither
  // of them issues anything, they pick which shape the 編集 below takes.
  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;

    button {
      height: 1.4rem;
    }
  }

  .add-row {
    display: flex;
    gap: 0.3rem;

    input {
      flex: 1;
      min-width: 0;
    }
  }

  /*
   * フォーム部品の高さ (doc-11 §2.2). 1.4rem — the same step `--frame-control` above already takes, so
   * the panel answers the question once: the title input sits in the 固定 band beside those controls,
   * and the 編集セッション's fields sit under it in a panel that is 30rem wide in 併置サイドバー. The
   * largest step belongs to the screens that are a form and nothing else (doc-10 §1 の作成モーダル).
   * Stated rather than left to the engine: the three `select`s in the 属性表 drew at 18px in WebKit
   * and 25px in Chromium against a 24.52px input, from this one declaration (変更前実測 2026-08-11).
   */
  input[type="text"],
  select {
    height: 1.4rem;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--inset);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.7rem;

    span {
      opacity: 0.6;
    }
  }

  button {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5). Nothing here may add a `:disabled` rule: a
    // component-scoped one outranks the global selector and would put this screen's blocked controls
    // back out of step with the others.
  }

  button.primary {
    background: color-mix(in srgb, var(--fg) 14%, transparent);
    font-weight: 600;
  }

  button.mini {
    font-size: 0.68rem;
  }

  button.mini.on {
    background: color-mix(in srgb, var(--fg) 18%, transparent);
  }

  // AC の完了印 (doc-11 §2.4): a span in 閲覧, a button in the 編集セッション, the same figure in both.
  // The size is stated once here rather than on each, so the two cannot drift apart — the figure draws
  // at 1em of it (§2.4). `display: block` because `.ac li` aligns on the baseline and an svg has none:
  // the row then puts its bottom edge on the text's baseline, which is where the glyph used to sit.
  .ac .box {
    display: block;
    flex: none;
    font-size: 0.8rem;
  }

  .ac button.box {
    padding: 0;
    border: none;
    background: none;
  }

  .ac-replace li {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--line);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
  }

  .transition-list li,
  .editor-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .effect {
    flex-basis: 100%;
    font-size: 0.68rem;
    opacity: 0.6;
  }

  .hint {
    font-size: 0.68rem;
    opacity: 0.65;
  }

  .ok {
    font-size: 0.7rem;
    opacity: 0.8;
  }

  // 更新前競合の告知 は 不整合 の色を取る (decision-22): バージョン不整合 が持っていた紫の族は廃されたので、
  // 同じ 1 つの事象（バージョン不整合）を告知と理由行で 2 色に描くことがなくなった。generic notice
  // blue (`--info`) へは戻さない — 通知は族ではなく、青い確認は不整合ではない (doc-11 §2.1)。
  .warn,
  .conflict,
  .undetectable {
    padding: 0.3rem 0.4rem;
    border-left: 3px solid;
    font-size: 0.72rem;
  }

  .warn {
    border-left-color: var(--info);
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .conflict {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    border-left-color: var(--mark-inconsistent);
    background: color-mix(in srgb, var(--mark-inconsistent) 14%, transparent);
  }

  // 照合不能 は不整合ではない: 版がずれているとは限らず、確かめる方法が無い (doc-9 §4.2/§5).
  .undetectable {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }
</style>
