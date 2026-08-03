<script lang="ts">
  // タスク詳細画面 (doc-8): one task's every item on one surface, and the entry point for the
  // editing operations doc-8 §6 defines (TASK-36). Every edit is issued through the Backlog 更新
  // アダプター (doc-5) by the shell — this panel builds the 更新操作 and never touches a file.
  //
  // The same panel is drawn three ways (doc-8 §2.1 詳細配置). What the placement changes is *where*
  // the shell puts this element and, through `layoutFor`, how much of each 区画 is open and how much
  // of the Git 履歴欄 is shown (doc-8 §3 の割当表). What it never changes is which 区画 exist: the
  // panel shows the same task either way, and 縮退表示 stays 常設 in all three (doc-8 §3).
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
  import DetailSection from "./DetailSection.svelte";
  import Editor from "./Editor.svelte";
  import GitHistory from "./GitHistory.svelte";
  import { cardIdentity, crossTaskId } from "../lib/card";
  import { ariaKeyShortcuts, shortcutHint } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import {
    acProgress,
    degradeSummary,
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
    NOTHING_TO_SAVE_REASON,
    PRIORITIES,
    TYPE_NOT_EDITABLE,
    acDeltaDroppedByRebase,
    acRows,
    assigneeCollapseWarning,
    buildSave,
    canRemoveLast,
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
    transitionOffers,
    type ApplyOutcome,
    type EditSession,
    type SaveState,
    type TransitionOffer,
  } from "../lib/edit";
  import {
    CLI_LIMIT_GUIDANCE,
    FRONTMATTER_NOTICE,
    REREAD_ROOT_LABEL,
    UNSAVED_INPUT_WARNING,
    WATCH_STOPPED_NOTE,
    WRITE_BACK_NOTE,
    editorOffers,
    launchSummary,
    needsConfirmation,
    type EditorOffer,
    type OpenOutcome,
  } from "../lib/external-editor";
  import {
    conflictSetDetail,
    taskMarks,
    versionConflictMark,
    type ConflictTarget,
    type VersionConflict,
  } from "../lib/mark";
  import {
    DEFAULT_PLACEMENT_MARK,
    MODAL_COLUMN_GAP_REM,
    MODAL_INSET_REM,
    MODAL_MAX_WIDTH_REM,
    MODAL_PADDING_REM,
    MODAL_SIDE_COLUMN_REM,
    PLACEMENTS,
    layoutFor,
    placementPersistence,
    placementPersistenceNote,
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
    ReferenceKind,
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
     * 版ずれ (doc-9) recorded for this task, or `null`. Held by the shell so the mark outlives the
     * panel and reaches the swimlane card (AC #4); the panel reads it back so the two surfaces say
     * the same thing about the same task.
     */
    conflict: VersionConflict | null;
    /**
     * Record or clear a 版ずれ for one task. `target` is passed explicitly rather than resolved from
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
    onclose,
  }: Props = $props();

  const STORAGE_LABEL: Record<StorageState, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
    milestone: "milestone",
    documentation: "documentation",
    reference: "references",
  };

  let task = $derived(view.task);
  let status = $derived(view.interpretation.status);
  let types = $derived(view.interpretation.types);
  let milestone = $derived(milestoneRef(view, snapshot.milestones));
  let dependencies = $derived(dependencyLinks(view, snapshot.tasks));
  let references = $derived(referenceSplit(view));
  let ac = $derived(acProgress(view));
  let degrade = $derived(degradeSummary(view));
  /**
   * 縮退印 and 版ずれ印 for the heading, from the derivation the swimlane card shares (`lib/mark.ts`).
   * One source so the two screens cannot disagree about a task's marks or their wording, which is
   * what decision-6's 三者を同じ印へ混ぜない asks of a cross-cutting display (AC #4).
   */
  let marks = $derived(taskMarks(view, conflict));

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

  /** `null` outside a session: the panel is display-only until 編集 is pressed (明示保存の前提). */
  let session = $state<EditSession | null>(null);
  let saveState = $state<SaveState>({ state: "idle" });
  /** A destructive action awaiting its second press — see `CONFIRMED_ACTIONS` below. */
  let confirming = $state<string | null>(null);
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
    confirming = null;
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
    confirming = null;
    acDeltaDropped = false;
    clearAddBoxes();
  }

  function cancelEditing(): void {
    // 破棄前確認 (doc-8 §6.3): only when there is something to lose, and through the shell's band —
    // the same words the other four routes use.
    if (dirty) onconfirmDiscard(endSession);
    else endSession();
  }

  /** The task a 版ずれ report is about, as of now. Captured before any await (see `save`). */
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
      // what is on screen, so they are only touched while that is still true; the 版ずれ record is
      // about the task and is always filed against `target`.
      const stillOpen = task.sourcePath === target.sourcePath;
      switch (outcome.state) {
        case "applied": {
          // 事後通知 (doc-9 §5): compared against the operated task's own re-read, which the outcome
          // carries — not against `view`, which is whatever the panel is showing by now. Skipping the
          // comparison when the selection moved would be worse than wrong: a clean result clears the
          // task's 版ずれ record, so an unchecked save would erase a mark it never checked.
          const diverged = divergence(submitted, outcome.view);
          if (stillOpen) {
            session = null;
            confirming = null;
            clearAddBoxes();
            saveState =
              diverged.length === 0 ? { state: "applied" } : { state: "diverged", fields: diverged };
          }
          // The 版ずれ record follows the same split: a clean save clears it, and the 事後通知 is
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
          // does *not* record a 版ずれ — doc-9 §5 requires the user not to read it as a conflict.
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
    // divergence is resolved: what remains is unsaved input against the current read, not a 版ずれ.
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
   * Transitions ask for a second press. Not a general habit — none of these has a reverse
   * operation in v1.48.0 (doc-5 §3.1), so an accidental one cannot be undone from Atlas at all.
   */
  async function runTransition(offer: TransitionOffer): Promise<void> {
    if (!offer.enabled || busy) return;
    if (confirming !== offer.kind) {
      confirming = offer.kind;
      return;
    }
    confirming = null;
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
  /** A launch awaiting its second press — asked for only while there is 未保存入力 (doc-8 §6.4). */
  let confirmingOpen = $state<{ method: LaunchMethod; path: string } | null>(null);
  /** The notice belonging to the *open* task; anything else counts as no launch on this task. */
  let openNotice = $derived(
    openState.state !== "idle" && openState.path === task.sourcePath ? openState : null,
  );
  let pendingOpen = $derived(
    confirmingOpen !== null && confirmingOpen.path === task.sourcePath
      ? confirmingOpen.method
      : null,
  );

  /**
   * 外部エディタ経路 (doc-8 §7). Deliberately leaves the 編集セッション alone: doc-8 §6.4 does not let
   * an external edit take the 未保存入力, so opening the file neither saves nor discards the draft. The
   * two are reconciled where they already are — the 継続検出 notice above, and the save's 更新前競合検出.
   */
  async function openExternally(offer: EditorOffer): Promise<void> {
    if (!offer.enabled) return;
    // The path is captured before the await: the launch is for the task that was on screen when it was
    // asked for, and the answer is filed under that file rather than under whatever is shown when it
    // arrives (the shell resolves the same (slug, path) pair).
    const path = task.sourcePath;
    if (needsConfirmation(dirty) && pendingOpen !== offer.method) {
      confirmingOpen = { method: offer.method, path };
      return;
    }
    confirmingOpen = null;
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
    | { state: "failed"; path: string; text: string }
  >({ state: "idle" });
  let copyNotice = $derived(
    copyState.state !== "idle" && copyState.path === task.sourcePath ? copyState : null,
  );

  async function copyCrossTaskId(): Promise<void> {
    const id = crossId;
    if (id === null) return;
    const path = task.sourcePath;
    try {
      await navigator.clipboard.writeText(id);
      copyState = { state: "copied", path };
    } catch {
      // No reason text: what the user needs here is the id itself, in a form they can select — the
      // clipboard API's own message ("permission denied", "not focused") does not help them copy it.
      copyState = { state: "failed", path, text: id };
    }
  }

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
    <div class="line">
      <!-- 横断タスクID を併記 (doc-8 §2, doc-3 §5.3): the panel is single-project, but the heading
           still says which project's task this is. A 解析不能 file has no id, so it is named by
           its file — the only stable handle it has (doc-4 §5). -->
      <span class="identity">{cardIdentity(view)}</span>
      {#if crossId === null}
        <!-- 解析不能 (doc-4 §5): a required field the read layer could not get — the 縮退 family,
             not the 版ずれ one, since the divergence has nothing to do with it. -->
        <span class="mark" data-kind="degraded">TASK-ID 不明</span>
      {/if}
      <!-- 縮退（解析起因）と版ずれ（doc-9 の競合）は別の印 (decision-6, AC #4): the same chips, in
           the same words and colours, as the card in the swimlane. -->
      {#each marks as mark (mark.kind)}
        <span
          class="mark"
          data-kind={mark.kind}
          title={mark.detail}
          aria-label="{mark.label}: {mark.detail}"
        >
          {mark.label}
        </span>
      {/each}
      {#if missing}
        <span class="mark" data-kind="unreadable">ファイル不明</span>
      {/if}

      <!-- 配置の切替は「閉じる ×」と同じ操作群に置く (doc-8 §2.2): both answer "この面をどうするか",
           and neither belongs among the operations on the task's contents. -->
      <div class="frame">
        <div class="placement" role="group" aria-label="詳細配置">
          {#each PLACEMENTS as candidate (candidate)}
            <button
              type="button"
              class="switch"
              class:on={candidate === placement}
              aria-pressed={candidate === placement}
              onclick={() => onplacement(candidate)}
            >
              {DETAIL_PLACEMENT_LABEL[candidate]}
              {#if candidate === defaultPlacement}
                <!-- 既定の配置がどれかを切替の見た目で示す (doc-8 §2.2). -->
                <span class="default-mark">{DEFAULT_PLACEMENT_MARK}</span>
              {/if}
            </button>
          {/each}
        </div>
        <button type="button" class="close" onclick={onclose}>閉じる</button>
      </div>
    </div>

    {#if persistenceNote !== null}
      <p class="hint">{persistenceNote}</p>
    {/if}

    <!-- 前後移動 と ID コピー (doc-8 §2.2). Both sit in the heading in all three placements: the
         id copy is the only way to point at this task from outside Atlas, and the move is what makes
         the panel a place to read a cell from rather than a single stop. -->
    <div class="line nav">
      <!-- 端での無効化の理由は、隣の位置表示がそのまま担う。読めない位置に理由を隠さない、が
           doc-11 §5 の要求である。**群の名前は `laneGroupLabel` だけが決める** (doc-8 §2.2): この 3 つと
           位置表示が同じ行に並ぶので、片方が「セル」と刷って片方が「未分類区画」と刷ると、同じ群を
           2 つの語で呼ぶことになる。未分類区画はレーンセルではない (doc-7 §1)。 -->
      <button
        type="button"
        class="mini"
        disabled={neighbours === null || neighbours.previous === null}
        title={neighbours === null
          ? NO_LANE_CELL_REASON
          : neighbours.previous === null
            ? `${laneGroupLabel(neighbours.group)}の先頭です`
            : `${laneGroupLabel(neighbours.group)}内のひとつ前のタスクへ`}
        onclick={() => moveTo(neighbours?.previous ?? null)}
      >
        ← 前のタスク
      </button>
      <span class="position">
        {neighbours === null ? "スイムレーン上の位置不明" : laneNeighbourLabel(neighbours)}
      </span>
      <button
        type="button"
        class="mini"
        disabled={neighbours === null || neighbours.next === null}
        title={neighbours === null
          ? NO_LANE_CELL_REASON
          : neighbours.next === null
            ? `${laneGroupLabel(neighbours.group)}の末尾です`
            : `${laneGroupLabel(neighbours.group)}内のひとつ次のタスクへ`}
        onclick={() => moveTo(neighbours?.next ?? null)}
      >
        次のタスク →
      </button>
      <button
        type="button"
        class="mini"
        disabled={crossId === null}
        onclick={copyCrossTaskId}
      >
        横断タスクID をコピー
      </button>
    </div>
    {#if neighbours === null}
      <!-- 無効化提示 (doc-11 §5): the reason sits beside the control, not only in a tooltip. -->
      <p class="hint">{NO_LANE_CELL_REASON}</p>
    {/if}
    {#if crossId === null}
      <p class="hint">
        TASK-ID を読めないため横断タスクID を作れません（doc-4 §5 の解析不能）。
      </p>
    {/if}
    {#if copyNotice !== null && copyNotice.state === "copied"}
      <p class="ok">横断タスクID をコピーしました。</p>
    {:else if copyNotice !== null}
      <p class="warn">
        クリップボードへ書けませんでした。次の文字列を選択してコピーしてください。
        <input type="text" readonly value={copyNotice.text} aria-label="横断タスクID" />
      </p>
    {/if}

    {#if missing}
      <!-- doc-8 §6.4: an external move does not get to take the 未保存入力 with it. The panel
           stays up showing the last read that resolved, so the input can be copied out before it
           is discarded on purpose. -->
      <p class="warn">{FILE_MISSING_REASON}</p>
    {/if}

    {#if session === null}
      <h2>{task.title ?? "（title 不明）"}</h2>
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
          <span class="mark" data-kind="degraded">status を読めません</span>
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
      <dd>
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

      <dt>assignee</dt>
      <dd>
        {#if session !== null}
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
        {:else}
          {task.assignee.length > 0 ? task.assignee.join(", ") : "—"}
        {/if}
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

      <dt>保存区分</dt>
      <dd>
        {task.storageState === null
          ? "保存区分不明"
          : STORAGE_LABEL[task.storageState]}
      </dd>

      <dt>日付</dt>
      <dd>
        created {task.createdDate ?? "—"} / updated {task.updatedDate ?? "—"}
      </dd>

      <dt>ファイル</dt>
      <dd class="path">{task.sourcePath}</dd>
    </dl>
  </header>
{/snippet}

<!-- 編集（明示保存） (doc-8 §3): 常設 in all three. Nothing here writes as you type, and Enter is
     not one of the save keys (doc-8 §6.2). -->
{#snippet editConsole()}
  <section class="console">
    {#if session === null}
      {#if availability.state === "editable"}
        <button type="button" class="primary" onclick={startEditing}>編集</button>
      {:else}
        <button type="button" class="primary" disabled title={availability.reason}>編集</button>
        <p class="hint">{availability.reason}</p>
      {/if}
    {:else}
      <div class="buttons">
        <button
          type="button"
          class="primary"
          disabled={saveGate.state !== "ready"}
          aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
          title={saveGate.state === "ready"
            ? `保存 (${shortcutHint("saveEditSession", MAC_KEYBOARD)})`
            : saveGate.reason}
          onclick={save}
        >
          {busy ? "保存中…" : "保存"}
        </button>
        <button type="button" onclick={cancelEditing}>キャンセル</button>
      </div>
      {#if !missing}
        <!-- Withheld while the file is gone: naming the save shortcut there would advertise an
             operation that cannot be issued (doc-5 §5). The banner above carries the reason.
             The chord is printed from the 割り当て一覧 (doc-7 §2.1) rather than spelled here, so this
             sentence cannot outlive the assignment — and it names *where* the chord is answered, which
             is the 編集部品 (its 適用範囲) and not the whole session. Enter's own meaning is stated at the
             field itself (`Editor.svelte`), where the key is pressed. -->
        <p class="hint">
          保存は保存ボタン、または本文欄で {shortcutHint("saveEditSession", MAC_KEYBOARD)} です。
        </p>
      {/if}
      {#if plan !== null && plan.state === "refused"}
        <p class="warn">{plan.reason}</p>
      {:else if plan !== null && plan.state === "nothingToSave" && !missing}
        <p class="hint">{NOTHING_TO_SAVE_REASON}。</p>
      {/if}
      {#if dirty}
        <!-- 破棄前確認を通す 5 経路 (doc-8 §6.3) を、押す前に読める形で置く: どれを押しても同じ確認が
             上部帯に出る、という予告である。 -->
        <p class="hint">
          未保存入力があります。キャンセル・閉じる・別タスク選択・前後移動・配置切替のいずれでも、
          破棄する前に「{DISCARD_CONFIRM_PROCEED}」の確認を通します（doc-8 §6.3）。
        </p>
      {/if}
      {#if externalChange}
        <!-- 編集中の継続検出 (doc-8 §6.4). The 版ずれ family, not a generic notice: the version has
             *been observed* to move against this session's baseline. It is not recorded on the card,
             though — no save has been attempted, and doc-8 §6.4 keeps this stated rather than acted
             on, so it belongs to the live session and ends with it. -->
        <p class="conflict">
          このタスクのファイルが編集中に外部で変わりました（版ずれ）。入力はそのまま保持しています。
          保存時に更新前競合検出を通します（doc-8 §6.4）。
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
          更新前競合検出は best-effort であり、この窓に入った外部更新は防げません。窓内に入った更新が
          上書きで失われた場合、その内容は表示も復元もできません（doc-9 §4.1）。
        </p>
      </div>
    {:else if conflict !== null}
      <!-- A 版ずれ recorded on an earlier visit to this task: the banners above belong to the save
           that just happened, and this one is what the swimlane card is still marking. Kept
           dismissible so the mark can be retired without a save — the input it belonged to is gone,
           so neither doc-9 §5 path applies any more. -->
      <div class="conflict">
        <p>{versionConflictMark(conflict).detail}</p>
        <p class="hint">表示は再読込後の最新内容です。未保存入力は残っていません。</p>
        <div class="buttons">
          <button type="button" onclick={() => onconflict(null, conflictTarget())}>
            確認した（版ずれ印を消す）
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

<!-- 縮退表示 (doc-4 §5, doc-8 §3): 3 配置とも常設で、折り畳めない。折畳みへ落とすと問題のあるタスクが
     正常に見えるためであり（doc-8 §3）、それは開閉できる折畳みでも「前のタスクで閉じた状態」が引き継
     がれる形で起こりうる。 -->
{#snippet degradePanel()}
  {#if degrade.degraded || task.unknownSections.length > 0}
    <section class="degrade-panel">
      <h3>縮退（判別できなかった項目）</h3>
      {#if degrade.missingRequired.length > 0}
        <p>解析不能: {degrade.missingRequired.join("・")} を読めません</p>
      {/if}
      {#each degrade.schemaIssues as issue, index (index)}
        <p>想定外スキーマ: {issue}</p>
      {/each}
      {#each degrade.danglingReferences as dangling, index (index)}
        <p>参照欠損: {REFERENCE_KIND_LABEL[dangling.kind]} {dangling.target}</p>
      {/each}
      {#each task.unknownSections as section, index (index)}
        <details>
          <summary>未知セクション {section.name}（保持のみ）</summary>
          <pre class="body">{section.body}</pre>
        </details>
      {/each}
    </section>
  {/if}
{/snippet}

<!-- Type と通常ラベルは別区画 (doc-8 §4): two sections, never one label list. -->
{#snippet typeSection()}
  <DetailSection title="Type" disposition={layout.sections.type}>
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

{#snippet labelsSection()}
  <DetailSection
    title="通常ラベル"
    disposition={layout.sections.labels}
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
  <DetailSection title="Description" disposition={layout.sections.description}>
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
  <DetailSection
    title="Acceptance Criteria"
    disposition={layout.sections.ac}
    count={`${ac.checked} / ${ac.total}`}
  >
    {#if session === null}
      {#if ac.total === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="ac">
          {#each task.acceptanceCriteria as item (item.number)}
            <li class:checked={item.checked}>
              <span class="box" aria-label={item.checked ? "完了" : "未完了"}>
                {item.checked ? "☑" : "☐"}
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
              <button
                type="button"
                class="box"
                aria-label={`#${row.number} を${row.checked ? "未完了" : "完了"}にする`}
                onclick={() => (session = toggleAcCheck(session!, row.number))}
              >
                {row.checked ? "☑" : "☐"}
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
          保存時に既存の全項目を削除してから、ここにある項目を並び順どおり作り直します（1 回の
          task edit にまとめます。doc-5 §3）。
        </p>
      {/if}
    {/if}
  </DetailSection>
{/snippet}

{#snippet planSection()}
  <DetailSection title="実装計画" disposition={layout.sections.plan}>
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
  <DetailSection title="実装ノート" disposition={layout.sections.notes}>
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
    disposition={layout.sections.dependencies}
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
      <p class="hint">保存時は既存を含む全集合で置き換えます（doc-5 §3 の非空全置換）。</p>
    {/if}
  </DetailSection>
{/snippet}

<!-- Pull Request URL は References と分離して独立表示 (doc-8 §4). Both sections stay visible in
     every 保存区分 (doc-8 §6.5) — they are 参照系, which reading never depends on edit rights. -->
{#snippet pullRequestSection()}
  <DetailSection
    title="Pull Request"
    disposition={layout.sections.pullRequest}
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
        Pull Request URL の登録は References の編集です（doc-8 §6）。下の References 欄へ足すと、
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
    disposition={layout.sections.references}
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
      <p class="hint">保存時は既存を含む全集合で置き換えます（doc-5 §3 の非空全置換）。</p>
    {/if}
  </DetailSection>
{/snippet}

<!-- 状態遷移・外部エディタ は doc-8 §3 の 1 行であり、同じ割当（併置・モーダルでは折畳み、全面では
     常設）で動く。2 つの区画に分けてあるのは操作の系統が違うためで、開き方は 1 つの規則に従う。 -->
{#snippet transitionsSection()}
  <DetailSection title="状態遷移" disposition={layout.sections.transitions}>
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
              onclick={() => runTransition(offer)}
            >
              {confirming === offer.kind ? `${offer.label}：実行してよいですか？（もう一度押す）` : offer.label}
            </button>
            {#if confirming === offer.kind}
              <button type="button" class="mini" onclick={() => (confirming = null)}>やめる</button>
            {/if}
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
  <DetailSection title="外部エディタで開く" disposition={layout.sections.transitions}>
    <p class="hint">{CLI_LIMIT_GUIDANCE}</p>
    <!-- 開く前に示す (doc-8 §7 難点と受け方): the frontmatter is exposed and the CLI's schema checking
         is bypassed, so this is stated before a launch rather than after a degraded read. -->
    <p class="warn">{FRONTMATTER_NOTICE}</p>
    {#if watchStopped}
      <!-- 継続検出が止まっている場合の書き戻し (doc-8 §7): said before the launch, with the re-read
           that is the only thing which will bring the edit back. -->
      <p class="warn">{WATCH_STOPPED_NOTE}</p>
      <p><button type="button" class="mini" onclick={onreread}>{REREAD_ROOT_LABEL}</button></p>
    {:else}
      <p class="hint">{WRITE_BACK_NOTE}</p>
    {/if}
    {#if dirty}
      <!-- 二重取り込みの回避 (doc-8 §6.4): stated, and the launch asks for a second press. The input
           is not discarded either way. -->
      <p class="warn">{UNSAVED_INPUT_WARNING}</p>
    {/if}
    <ul class="editor-list">
      {#each editorOfferList as offer (offer.method)}
        <li>
          <button
            type="button"
            disabled={!offer.enabled}
            title={offer.reason ?? offer.command}
            onclick={() => openExternally(offer)}
          >
            {pendingOpen === offer.method
              ? `${offer.label}：開いてよいですか？（もう一度押す）`
              : offer.label}
          </button>
          {#if pendingOpen === offer.method}
            <button type="button" class="mini" onclick={() => (confirmingOpen = null)}>やめる</button>
          {/if}
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
  <DetailSection title="Git 履歴欄" disposition={layout.sections.gitHistory}>
    <GitHistory
      {history}
      {entry}
      detail={layout.history}
      onexpand={placement === "full" ? null : () => onplacement("full")}
      onreload={onreloadHistory}
    />
  </DetailSection>
{/snippet}

<!-- 1 列の並び (併置サイドバー・全面シングルビュー): doc-8 §3 の割当表の順。Type と通常ラベルが本文の
     前に来るのは表のとおりで、Pull Request を References の前に置くのは、PR 区画の注記が「下の
     References 欄へ足すと」と、その並びを指しているためである。 -->
{#snippet flowSections()}
  {@render typeSection()}
  {@render labelsSection()}
  {@render descriptionSection()}
  {@render acSection()}
  {@render planSection()}
  {@render notesSection()}
  {@render dependenciesSection()}
  {@render pullRequestSection()}
  {@render referencesSection()}
  {@render gitHistorySection()}
  {@render transitionsSection()}
  {@render externalEditorSection()}
{/snippet}

<!-- 主列 / 脇列 (doc-8 §2.1). 見出し・編集卓・縮退表示 are drawn outside both: those three belong to
     the panel rather than to a column (`SECTION_COLUMN` records the assignment). -->
{#snippet mainColumn()}
  {@render descriptionSection()}
  {@render acSection()}
  {@render planSection()}
  {@render notesSection()}
  {@render gitHistorySection()}
{/snippet}

{#snippet sideColumn()}
  {@render typeSection()}
  {@render labelsSection()}
  {@render dependenciesSection()}
  {@render pullRequestSection()}
  {@render referencesSection()}
  {@render transitionsSection()}
  {@render externalEditorSection()}
{/snippet}

<aside
  class="detail"
  data-placement={placement}
  aria-label="タスク詳細"
  style="--modal-side-column: {MODAL_SIDE_COLUMN_REM}rem; --modal-column-gap: {MODAL_COLUMN_GAP_REM}rem; --modal-padding: {MODAL_PADDING_REM /
    2}rem; --modal-inset: {MODAL_INSET_REM / 2}rem; --modal-max-width: {MODAL_MAX_WIDTH_REM}rem;"
>
  {@render heading()}
  {@render editConsole()}
  {@render degradePanel()}

  {#if layout.columns === 2}
    <!-- 中央モーダルは 2 列を保つ (doc-8 §2.1): the 脇列 is a fixed 18rem and the 主列 takes the
         rest, with no breakpoint that stacks them — 狭いからといって縦積みへ落とさない. -->
    <div class="columns">
      <div class="col">{@render mainColumn()}</div>
      <div class="col">{@render sideColumn()}</div>
    </div>
  {:else}
    <div class="flow">{@render flowSections()}</div>
  {/if}

  <footer class="note">
    Atlas 自身は管理ファイルを書き込みません。この画面の編集は Backlog CLI 経由で、外部エディタ経路は
    利用者のエディタが書き込みます（doc-2・doc-8 §7）。
  </footer>
</aside>

<style lang="scss">
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem 1rem;
    background: var(--panel);
    // Scrolls inside itself so the swimlane keeps its own scroll position while the panel is open.
    overflow-y: auto;
  }

  // 併置サイドバー (doc-8 §2.1): a fixed share of the width — the grid beside it is the element
  // that gives way (it scrolls).
  .detail[data-placement="sidebar"] {
    flex: none;
    width: min(30rem, 45vw);
    border-left: 1px solid var(--line);
  }

  // 中央モーダル (doc-8 §2.1): a box over the grid, wide enough for two columns at 1280×800. The
  // numbers come from `lib/placement.ts` through the custom properties above, so the width the
  // test checks and the width the browser lays out are the same numbers.
  .detail[data-placement="modal"] {
    width: min(var(--modal-max-width), calc(100vw - var(--modal-inset) * 2));
    max-height: 100%;
    padding: 0.6rem var(--modal-padding) 1rem;
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

  // 1 列 (併置サイドバー・全面シングルビュー) と、モーダルの各列そのもの.
  // `minmax(0, 1fr)` は、長い 1 行が列幅を押し広げて隣の列を箱の外へ追い出すのを止める。
  .flow,
  .col {
    grid-template-columns: minmax(0, 1fr);
  }

  // 中央モーダルの 2 列 (doc-8 §2.1): 脇列は固定 18rem、主列が残りを取る。畳む分岐は無い。
  .columns {
    grid-template-columns: minmax(0, 1fr) var(--modal-side-column);
    gap: var(--modal-column-gap);
    align-items: start;
  }

  .heading {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;

    h2 {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.35;
    }
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }

  .nav {
    align-items: center;
  }

  .position {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }

  .identity {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  // 配置の切替と閉じるは 1 つの操作群 (doc-8 §2.2).
  .frame {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .placement {
    display: flex;
    gap: 0.2rem;
  }

  .switch {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    font-size: 0.68rem;

    &.on {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  // 既定の印は中立: 状態の族ではなく、次回起動時にどれで開くかという情報である (decision-6).
  .default-mark {
    padding: 0 0.25rem;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    font-size: 0.6rem;
    opacity: 0.75;
  }

  .close {
    padding: 0 0.4rem;
    font-size: 0.7rem;
  }

  .facts {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 0.15rem 0.5rem;
    margin: 0;
    font-size: 0.74rem;

    dt {
      opacity: 0.6;
    }

    dd {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.3rem;
    }
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

  // 印は `cursor: help` と説明を伴う (doc-11 §3). Keyed on the explanation actually being there: the
  // 見出し carries chips that are their own whole statement (TASK-ID 不明・ファイル不明), and a help
  // cursor over one of those would promise something more to read that does not exist.
  .mark[title] {
    cursor: help;
  }

  // 解析縮退・版ずれ・未分類・中立の印を混ぜない (decision-6): each family takes its own colour from
  // the 表示テーマ's one definition in `app.scss` (`lib/mark.ts` の MarkKind), an unmapped or dangling
  // reference is outlined, and a merely-informative state stays plain.
  //
  // 印チップ配色規則 (decision-12): 文字＝族の色、背景＝族の色 12% 混色、枠＝族の色 45% 混色。Each family
  // sets `--family` and nothing else, so the same three declarations serve all four.
  .mark[data-kind] {
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
  }

  .mark[data-kind="degraded"] {
    --family: var(--mark-degraded);
  }

  .mark[data-kind="versionConflict"] {
    --family: var(--mark-version-conflict);
  }

  .mark[data-kind="undetectable"] {
    --family: var(--mark-undetectable);
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

  .degrade-panel {
    padding: 0.35rem 0.45rem;
    border-left: 3px solid var(--mark-degraded);
    background: color-mix(in srgb, var(--mark-degraded) 10%, transparent);

    details {
      font-size: 0.72rem;
    }
  }

  .note {
    font-size: 0.68rem;
    opacity: 0.55;
  }

  // --- editing ---------------------------------------------------------------------------

  .console {
    gap: 0.3rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .add-row {
    display: flex;
    gap: 0.3rem;

    input {
      flex: 1;
      min-width: 0;
    }
  }

  input[type="text"],
  select {
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

  .ac button.box {
    padding: 0;
    border: none;
    background: none;
    font-size: 0.8rem;
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

  // 競合は縮退印と別の表現 (doc-9 §5, decision-6): the file reads fine, its version moved — so 版ずれ
  // takes its own colour rather than 縮退's amber *or* the generic notice blue it used to share with
  // every other warning here.
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
    border-left-color: var(--mark-version-conflict);
    background: color-mix(in srgb, var(--mark-version-conflict) 14%, transparent);
  }

  // 照合不能 is neither: 版がずれているとは限らず、確かめる方法が無い (doc-9 §4.2/§5).
  .undetectable {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }
</style>
