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
  // Bodies go through `Body.svelte`'s 整形表示 (doc-8 §9, decision-25), and a URL inside one is handed
  // to the OS by 既定ブラウザ起動 (doc-8 §9.3). **Neither is drawn as an `<a href>`** — an href is what
  // makes the engine treat an element as a link, and every way the engine has of following one takes
  // the window with it (`Body.svelte` carries the 目視 that found it).
  //
  // **What this file is, since TASK-106.** 区画 1 つにつき 1 コンポーネントで `task-detail/` に置いてあり、
  // ここに残っているのは 状態・副作用・区画の並べ方 である。分けたのはマークアップと SCSS で、状態は
  // 動かしていない — 区画を切り替えても折り畳んでも 未保存入力 が残るのは、それが 1 か所にあるからで
  // (m-1 TASK-55)、子が `$state` を持てばその瞬間に壊れる。だから子が受け取るのは値と、書き戻しの口
  // (`edit`・`setSession`・`set…` の 3 形) だけである。
  //
  // 複数の区画が要る SCSS 規則は `task-detail/_shared.scss` の mixin で、使う側が選択子を書く —
  // Svelte のスコープはコンポーネント境界を越えないので、規則そのものを親に残すことはできない。
  // **`@include` し忘れ・し過ぎは「Unused CSS selector」として出る**が、親と子が同じ規則を要る箇所は
  // その検算に掛からない (TASK-106 は実際に 2 件そこで落とし、実エンジンの実測で見つけた)。
  import { onDestroy, type Snippet } from "svelte";
  import type { ImageReader } from "../lib/markdown-image";
  // 区画コンポーネント (TASK-106). 1 区画につき 1 つで、doc-8 §3 の割当表の行に対応する。状態は
  // このファイルが持ち、子は値と入力の受け渡しだけを持つ — 区画切替と折畳みが入力を捨てないのは
  // それが理由である (m-1 TASK-55, AC #2)。
  import AcSection from "./task-detail/AcSection.svelte";
  import AssigneeSection from "./task-detail/AssigneeSection.svelte";
  import CommentsSection from "./task-detail/CommentsSection.svelte";
  import DependenciesSection from "./task-detail/DependenciesSection.svelte";
  import DescriptionSection from "./task-detail/DescriptionSection.svelte";
  import DodSection from "./task-detail/DodSection.svelte";
  import EditConsole from "./task-detail/EditConsole.svelte";
  import EditIssueRow from "./task-detail/EditIssueRow.svelte";
  import ExternalEditorSection from "./task-detail/ExternalEditorSection.svelte";
  import FinalSummarySection from "./task-detail/FinalSummarySection.svelte";
  import GitHistorySection from "./task-detail/GitHistorySection.svelte";
  import Heading from "./task-detail/Heading.svelte";
  import HeadingNotes from "./task-detail/HeadingNotes.svelte";
  import InconsistencyPanel from "./task-detail/InconsistencyPanel.svelte";
  import LabelsSection from "./task-detail/LabelsSection.svelte";
  import NotesSection from "./task-detail/NotesSection.svelte";
  import PlanSection from "./task-detail/PlanSection.svelte";
  import PullRequestSection from "./task-detail/PullRequestSection.svelte";
  import ReferencesSection from "./task-detail/ReferencesSection.svelte";
  import TransitionsSection from "./task-detail/TransitionsSection.svelte";
  import TypeSection from "./task-detail/TypeSection.svelte";
  import { cardIdentity, crossTaskId } from "../lib/card";
  import { messages } from "../lib/messages-context";
  import {
    acProgress,
    checklistProgress,
    dependencyLinks,
    milestoneRef,
    referenceSplit,
    type HistoryState,
  } from "../lib/detail";
  import {
    acDeltaDroppedByRebase,
    acRows,
    buildSave,
    divergence,
    editAvailability,
    externallyChanged,
    isDirty,
    rebaseOnto,
    saveAvailability,
    setField,
    startSession,
    transitionConfirmation,
    transitionOffers,
    type ApplyOutcome,
    type EditSession,
    type IssueConfirmation,
    type SaveState,
    type TransitionOffer,
  } from "../lib/edit";
  import {
  } from "../lib/external-editor";
  import {
    inconsistencyReasons,
    type ConflictTarget,
    type VersionConflict,
  } from "../lib/mark";
  import {
    MAIN_COLUMN_ORDER,
    MODAL_COLUMN_GAP_REM,
    MODAL_INSET_REM,
    MODAL_MAX_WIDTH_REM,
    MODAL_SIDE_COLUMN_REM,
    PANEL_PADDING_REM,
    PROSE_MAX_WIDTH_REM,
    SIDEBAR_WIDTH_REM,
    SIDE_COLUMN_ORDER,
    SINGLE_COLUMN_ORDER,
    layoutFor,
    placementPersistence,
    placementPersistenceNote,
    type DetailSection as SectionKey,
  } from "../lib/placement";
  import { detailPlacementLabel } from "../lib/settings";
  import type { LaneNeighbours } from "../lib/swimlane";
  import type {
    CliReadiness,
    DetailPlacement,
    EditorReadiness,
    LaunchMethod,
    ProjectEntry,
    ProjectSnapshot,
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
     * A 本文リンク in one of the 整形表示 区画 was pressed (doc-8 §9.3). The shell issues 既定ブラウザ起動:
     * this panel calls no command, and the failure's place is ⑤ 通知, which the shell owns (doc-11 §4).
     */
    onopenlink: (url: string) => void;
    /**
     * The bytes of one 添付画像 named by a 本文 of this task (doc-8 §9.2), for this task's project.
     * Passed straight to `Body`, for the same reason `onopenlink` is: this panel reaches no boundary.
     */
    readimage: ImageReader;
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
    onopenlink,
    readimage,
    conflict,
    onconflict,
    onapply,
    onselect,
    onreloadHistory,
    ondirty,
    onconfirmDiscard,
    onconfirmIssue,
    onclose,
  }: Props = $props();

  /** The 文言表 in force, read through the accessor so a 表示言語 change redraws the panel. */
  const t = messages();

  let task = $derived(view.task);
  let status = $derived(view.interpretation.status);
  let types = $derived(view.interpretation.types);
  let milestone = $derived(milestoneRef(view, snapshot.milestones));
  let dependencies = $derived(dependencyLinks(view, snapshot.tasks));
  let references = $derived(referenceSplit(view));
  let ac = $derived(acProgress(view));
  let dod = $derived(checklistProgress(view.task.definitionOfDone));
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
    placementPersistenceNote(persistence, (value) => detailPlacementLabel(value)),
  );
  let crossId = $derived(crossTaskId(view));

  // --- 編集セッション (doc-8 §6.3) ---------------------------------------------------------

  /** `null` outside a session: the panel is display-only until 編集 is pressed (明示保存の前提). */
  let session = $state<EditSession | null>(null);
  let saveState = $state<SaveState>({ state: "idle" });
  let busy = $state(false);
  /** Draft text of the "add one" boxes, which are inputs rather than part of the session. */
  let newLabel = $state("");
  let newAssignee = $state("");
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
  let plan = $derived(session === null ? null : buildSave(session));
  /** One decision for the save control's enabled state and its reason (doc-5 §5). */
  let saveGate = $derived(saveAvailability(plan, { fileMissing: missing, busy }));
  let acView = $derived(session === null ? [] : acRows(session));

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
    if (sessionPlacement !== null && sessionPlacement !== next) {
      endSession();
    }
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
    if (session !== null) {
      session = setField(session, key, value);
    }
  }

  /**
   * Take the next session a 区画 built. 完了印の切替・モード切替 return a whole session rather than one
   * field, so the 区画 that offer them hand it back through here instead of through `edit` — and the
   * value still lives in this file, which is what keeps a 折畳み or a 区画切替 from discarding it.
   */
  function setSession(next: EditSession): void {
    session = next;
  }

  function clearAddBoxes(): void {
    newLabel = "";
    newAssignee = "";
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
    if (dirty) {
      onconfirmDiscard(endSession);
    } else {
      endSession();
    }
  }

  /** The task a バージョン不整合 report is about, as of now. Captured before any await (see `save`). */
  function conflictTarget(): ConflictTarget {
    return { slug: task.project, sourcePath: task.sourcePath };
  }

  async function save(): Promise<void> {
    if (missing || session === null || plan === null || plan.state !== "ready" || busy) {
      return;
    }
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
          if (stillOpen) {
            saveState = { state: "uncheckable", detail: outcome.detail };
          }
          break;
        case "failed":
          // CLI 失敗 (doc-5 §5): nothing changed, the display is untouched, and the input stays
          // so the same save can be retried (doc-8 §6.3).
          if (stillOpen) {
            saveState = { state: "failed", detail: outcome.detail };
          }
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
    if (session === null) {
      return;
    }
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
   * back to the state before the press in v1.50.1 (the measurement is in doc-8 §6.5), so an
   * accidental one cannot be undone from Atlas at all.
   *
   * The question goes to the shell rather than being drawn here, and the act is what the shell hands
   * back on a 進む answer. That is also what closes the hole the 二度押し had: the layer is the shell's,
   * so it goes with the question when the panel is pointed at another task (doc-11 §12 の失効).
   */
  function runTransition(offer: TransitionOffer, control: HTMLButtonElement): void {
    if (offer.availability.state === "withheld" || busy) {
      return;
    }
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
    if (busy) {
      return;
    }
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
          if (stillOpen) {
            saveState = { state: "applied" };
          }
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
          if (stillOpen) {
            saveState = { state: "uncheckable", detail: outcome.detail };
          }
          break;
        case "failed":
          if (stillOpen) {
            saveState = { state: "failed", detail: outcome.detail };
          }
          break;
      }
    } finally {
      busy = false;
    }
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
    if (copyTimer !== null) {
      clearTimeout(copyTimer);
    }
    copyTimer = null;
  }

  async function copyCrossTaskId(): Promise<void> {
    const id = crossId;
    if (id === null) {
      return;
    }
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
    if (target !== null) {
      onselect(target);
    }
  }

  function addCriterion(): void {
    if (session === null || session.draft.ac.mode !== "delta") {
      return;
    }
    const text = newCriterion.trim();
    if (text === "") {
      return;
    }
    const delta = session.draft.ac.delta;
    session = setField(session, "ac", {
      mode: "delta",
      delta: { ...delta, add: [...delta.add, text] },
    });
    newCriterion = "";
  }
</script>

<!--
  区画 1 つにつき snippet 1 つで、その snippet は 区画コンポーネント を 1 つ描く。**ここに並びは無い** —
  並びを持つのは `placement.ts` の `MAIN_COLUMN_ORDER` / `SIDE_COLUMN_ORDER` / `SINGLE_COLUMN_ORDER`
  だけで、下の `{#each}` がそれを引いて描く。区画名から snippet への対応は並びではないので、ここに
  綴っても正本は割れない。以前はこの位置に列ごとの呼び出し列があり、それが doc-8 §3.1 の並びの
  2 つ目の写しになっていた — 片方だけ入れ替えてもテストは全部通る形だったので、写しを持たない形へ替えた。
  `satisfies` が `Record<SectionKey, Snippet>` を要求するので、doc-8 §3 の割当表へ行が増えたら
  この表もコンパイルが通らなくなる (`placement.ts` の割当表と同じ守り方)。
  見出しと編集卓もここに居るが、どちらの並びにも入らない — 列の上に固定される行だからである
  (doc-8 §2.2)。それは `SECTION_COLUMN` の `"wide"` としてテストが押さえている。
-->
{#snippet headingSection()}
  <Heading
    {task}
    {snapshot}
    identity={cardIdentity(view)}
    {crossId}
    copyNotice={copyNotice}
    {copied}
    fadeMs={COPY_FADE_MS}
    oncopy={copyCrossTaskId}
    {status}
    {milestone}
    {reasons}
    {missing}
    {neighbours}
    onmove={moveTo}
    {placement}
    {defaultPlacement}
    {onplacement}
    {onclose}
    {session}
    {edit}
    {availability}
    onedit={startEditing}
  />
{/snippet}

{#snippet editConsoleSection()}
  <EditConsole
    editing={session !== null}
    {availability}
    {dirty}
    {externalChange}
    {saveState}
    {conflict}
    {acDeltaDropped}
    onrestart={restartFromLatest}
    onreapply={reapplyOntoLatest}
    onacknowledge={() => onconflict(null, conflictTarget())}
  />
{/snippet}

{#snippet inconsistency()}
  <InconsistencyPanel {reasons} unknownSections={task.unknownSections} />
{/snippet}

{#snippet typeSection()}
  <TypeSection {types} {layout} editing={session !== null} />
{/snippet}

{#snippet labelsSection()}
  <LabelsSection
    labels={task.labels}
    draft={session === null ? null : session.draft.labels}
    apply={(next) => edit("labels", next)}
    entry={newLabel}
    setEntry={(value) => (newLabel = value)}
    {layout}
  />
{/snippet}

{#snippet assigneeSection()}
  <AssigneeSection
    assignee={task.assignee}
    draft={session === null ? null : session.draft.assignee}
    apply={(next) => edit("assignee", next)}
    entry={newAssignee}
    setEntry={(value) => (newAssignee = value)}
    {layout}
  />
{/snippet}

{#snippet descriptionSection()}
  <DescriptionSection
    description={task.description}
    draft={session === null ? null : session.draft.description}
    onchange={(value) => edit("description", value)}
    onsave={save}
    {layout}
    {onopenlink}
    {readimage}
  />
{/snippet}

{#snippet acSection()}
  <AcSection
    items={task.acceptanceCriteria}
    progress={ac}
    {session}
    rows={acView}
    {setSession}
    setAc={(value) => edit("ac", value)}
    entry={newCriterion}
    setEntry={(value) => (newCriterion = value)}
    addEntry={addCriterion}
    onsave={save}
    {layout}
  />
{/snippet}

{#snippet dodSection()}
  <DodSection items={task.definitionOfDone} progress={dod} {layout} />
{/snippet}

{#snippet commentsSection()}
  <CommentsSection comments={task.comments} {layout} {onopenlink} {readimage} />
{/snippet}

{#snippet finalSummarySection()}
  <FinalSummarySection finalSummary={task.finalSummary} {layout} {onopenlink} {readimage} />
{/snippet}

{#snippet planSection()}
  <PlanSection
    implementationPlan={task.implementationPlan}
    draft={session === null ? null : session.draft.plan}
    onchange={(value) => edit("plan", value)}
    onsave={save}
    {layout}
    {onopenlink}
    {readimage}
  />
{/snippet}

{#snippet notesSection()}
  <NotesSection
    implementationNotes={task.implementationNotes}
    {session}
    {setSession}
    onchange={(value) => edit("notes", value)}
    onsave={save}
    {layout}
    {onopenlink}
    {readimage}
  />
{/snippet}

{#snippet dependenciesSection()}
  <DependenciesSection
    {dependencies}
    draft={session === null ? null : session.draft.dependencies}
    apply={(next) => edit("dependencies", next)}
    entry={newDependency}
    setEntry={(value) => (newDependency = value)}
    {layout}
    {onselect}
  />
{/snippet}

{#snippet pullRequestSection()}
  <PullRequestSection
    pullRequests={references.pullRequests}
    {layout}
    editing={session !== null}
  />
{/snippet}

{#snippet referencesSection()}
  <ReferencesSection
    references={references.references}
    draft={session === null ? null : session.draft.references}
    apply={(next) => edit("references", next)}
    entry={newReference}
    setEntry={(value) => (newReference = value)}
    {layout}
  />
{/snippet}

{#snippet gitHistorySection()}
  <GitHistorySection
    {history}
    {entry}
    {layout}
    {placement}
    {onplacement}
    {onreloadHistory}
  />
{/snippet}

<!-- 状態遷移・外部エディタ は doc-8 §3 の 1 行なので、2 つのコンポーネントが 1 区画を描く。並びを引く側は
     その行を 1 つの区画として扱えなければならないので、ここでまとめておく。 -->
{#snippet transitionsRow()}
  <TransitionsSection {transitions} {busy} onrun={runTransition} {layout} />
  <ExternalEditorSection sourcePath={task.sourcePath} {watchStopped} {onreread} {layout} />
{/snippet}

{#snippet column(order: readonly SectionKey[])}
  {@const draw = {
    heading: headingSection,
    editConsole: editConsoleSection,
    inconsistency,
    description: descriptionSection,
    ac: acSection,
    dod: dodSection,
    plan: planSection,
    notes: notesSection,
    comments: commentsSection,
    finalSummary: finalSummarySection,
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
  class:issue-row={session !== null}
  data-placement={placement}
  aria-label={t().taskDetail.panelLabel}
  style="--modal-side-column: {MODAL_SIDE_COLUMN_REM}rem; --modal-column-gap: {MODAL_COLUMN_GAP_REM}rem; --panel-padding: {PANEL_PADDING_REM /
    2}rem; --modal-inset: {MODAL_INSET_REM / 2}rem; --modal-max-width: {MODAL_MAX_WIDTH_REM}rem; --prose-max-width: {PROSE_MAX_WIDTH_REM}rem; --sidebar-width: {SIDEBAR_WIDTH_REM}rem;"
>
  {@render headingSection()}
  <HeadingNotes
    {persistenceNote}
    noNeighbours={neighbours === null}
    crossIdMissing={crossId === null}
    {copyNotice}
    {copied}
    {missing}
  />
  {@render editConsoleSection()}

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
    <EditIssueRow gate={saveGate} {busy} onsave={save} oncancel={cancelEditing} />
  {/if}
</aside>

<style lang="scss">
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    // No top padding: the sticky 見出し owns it (see `Heading.svelte`). Left here, it became a 9.6px
    // strip above the band that the content scrolled through — measured, and visible in a screenshot
    // as the 縮退帯 appearing over the pinned heading. The sideways value comes from `lib/placement.ts`
    // so that this padding and the band's pull-out are one number rather than two that have to
    // agree (TASK-115).
    padding: 0 var(--panel-padding) 1rem;
    background: var(--panel);
    // Scrolls inside itself so the swimlane keeps its own scroll position while the panel is open.
    overflow-y: auto;

    // 編集セッション中は下端に発行の行が居るので、この箱の下 padding は要らない — 残すと行が縁から
    // 浮き、スクロールの末尾でそのぶん持ち上がる (目視 2026-08-10。3 配置とも)。
    //
    // 発行の行 が在ることを、それを描く枝と同じ条件から取る。以前は `:has(> .issue)` で要素の有無を
    // 読んでいたが、TASK-106 で 発行の行 が子コンポーネントになったので、その要素はこの木のスコープ
    // クラスを持たない — Svelte のスコープはコンポーネント境界を越えないので、構造の選択子では届かない。
    &.issue-row {
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
</style>
