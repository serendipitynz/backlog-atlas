<script lang="ts">
  // プロジェクト詳細画面 (doc-10, TASK-55): everything that can be done to one project, in one screen.
  //
  // TASK-39's 台帳管理画面 (every project's registration) and TASK-40's プロジェクト管理画面 (one
  // project's documents, milestones and new tasks) put two different granularities side by side, so
  // working on a single project meant moving between them. This levels the granularity at one
  // project; neither of the old screens remains. 登録 is the one ledger-wide operation and moved to
  // the fixed header instead (doc-3 §4, doc-7 §2.1).
  //
  // Where each 区画 writes differs. 概要 writes the ledger file alone (doc-3 §2.1); 文書・マイル
  // ストーン・新規タスク write the target project's management files through the Backlog 更新アダプター
  // (doc-5). This component holds no path and no `invoke`, so doc-2's boundary is structural here
  // rather than a rule to remember.
  //
  // The rules live in `lib/project-detail.ts` (the screen's frame and the 概要区画) and in
  // `lib/ledger.ts` / `lib/manage.ts` (building the request values); this component is layout, local
  // form state and callbacks. Text inputs bind to local state and are never rewritten while the user
  // is typing — the same IME rule the other screens follow.
  import { untrack } from "svelte";
  import Editor from "./Editor.svelte";
  import { PRIORITIES } from "../lib/edit";
  import { ariaKeyShortcuts, shortcutHint } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import {
    CANONICAL_STATUS_NAMES,
    aliasKeyEffect,
    editOf,
    editProblems,
    resolvedBacklogRoot,
    toUpdateRequest,
    type EntryEdit,
    type FieldProblem,
    type LedgerActionResult,
    type LedgerField,
    type RefusalReport,
  } from "../lib/ledger";
  import {
    DOC_TYPES,
    EMPTY_DOC_CREATE,
    EMPTY_MILESTONE_ADD,
    EMPTY_MILESTONE_REMOVE,
    EMPTY_MILESTONE_RENAME,
    EMPTY_TASK_CREATE,
    ISSUE_BUSY_REASON,
    MILESTONE_KEEP_LEAVES_DANGLING_REFERENCES,
    MILESTONE_REMOVE_MOVES_THE_FILE,
    TASK_CREATE_OMITTED_FIELDS,
    TASK_CREATE_SCOPE_NOTE,
    WITHHELD_DOCUMENT_OPERATIONS,
    WITHHELD_MILESTONE_OPERATIONS,
    buildDocCreate,
    buildDocUpdate,
    buildMilestoneAdd,
    buildMilestoneArchive,
    buildMilestoneRemove,
    buildMilestoneRename,
    buildTaskCreate,
    docDivergence,
    followsReferences,
    hasDocCreateInput,
    hasMilestoneAddInput,
    hasTaskCreateInput,
    isDocDirty,
    issueAvailability,
    outcomeMessage,
    referencingTasks,
    setDocField,
    startDocSession,
    type DocCreateInput,
    type DocDraft,
    type DocSession,
    type IssueAvailability,
    type IssueOutcome,
    type IssuePlan,
    type MilestoneAddInput,
    type MilestoneRemoveInput,
    type MilestoneRenameInput,
    type TaskCreateInput,
    type WithheldOperation,
  } from "../lib/manage";
  import {
    ALIAS_EFFECT_NOTES,
    DETAIL_SECTIONS,
    LEDGER_WRITE_IN_FLIGHT_REASON,
    OVERVIEW_READ_ONLY_NOTE,
    SLUG_IMMUTABLE_NOTE,
    UNREGISTER_SCOPE_NOTE,
    movesRoot,
    overviewBlocked,
    rootMoveNote,
    submittedAttributes,
    unregisterBlocked,
    type DetailSection,
  } from "../lib/project-detail";
  import type {
    CliReadiness,
    Document,
    Milestone,
    ProjectEntry,
    ProjectLoad,
    TaskView,
    UpdateOperation,
    UpdateRequest,
  } from "../lib/wire";

  interface Props {
    /** The 台帳エントリ this screen is about. Readable even when its root is not (doc-10 §8). */
    entry: ProjectEntry;
    /** That root's read outcome. `undefined` means it has not been read yet. */
    load: ProjectLoad | undefined;
    /** The ledger is read-only (doc-3 §2.2). Reaches the 概要区画 only. */
    ledgerReadOnly: boolean;
    /** True while one ledger command is in flight (the shell serializes them). */
    ledgerBusy: boolean;
    /** Whether a supported CLI exists (doc-5 §5); `null` is 確認中. Reaches the other three 区画 only. */
    readiness: CliReadiness | null;
    onpickDirectory: (title: string) => Promise<string | null>;
    onupdate: (request: UpdateRequest) => Promise<LedgerActionResult>;
    onremove: (slug: string) => Promise<LedgerActionResult>;
    /** Issue one 更新操作 (doc-5 §3, doc-9 §4). The re-read belongs to the shell. */
    onissue: (slug: string, action: UpdateOperation[]) => Promise<IssueOutcome>;
    /** True while this screen holds 未保存入力 — what makes leaving it ask first. */
    ondirty: (dirty: boolean) => void;
    /** 出口 (doc-10 §2). */
    onback: () => void;
    ontoLane: () => void;
  }

  let {
    entry,
    load,
    ledgerReadOnly,
    ledgerBusy,
    readiness,
    onpickDirectory,
    onupdate,
    onremove,
    onissue,
    ondirty,
    onback,
    ontoLane,
  }: Props = $props();

  let section = $state<DetailSection>("overview");

  let project = $derived(load?.state === "loaded" ? load.project : null);
  /** ルート読取不能 (doc-10 §8). The 概要区画 still draws; the other three have no list to show. */
  let unreadable = $derived(load?.state === "unreadable" ? load.error : null);

  // The 台帳読取専用帯 and CLI 縮退帯 (doc-10 §3) are ③ and ② of the screen-common 上部帯 stack
  // (doc-11 §4), so the shell raises them for this screen too. Drawn from here they would sit *below*
  // the shell's 確認帯 ① and 通知帯 ⑤, which is the 出現順 doc-11 §4 forbids. What stays here is the
  // per-操作 reason (`overviewBlocked`・`withheld`・`OVERVIEW_READ_ONLY_NOTE`), which is where the
  // full text lives once the band is 縮約 to one line.

  // --- 発行の可否 (doc-5 §5, doc-9 §5) ----------------------------------------------------------

  /** True while one 更新操作 is in flight. Every 発行 control is withheld, not only the one pressed. */
  let busy = $state(false);
  /**
   * True while a ledger write this screen issued is in flight, from before the await until its
   * follow-up is done. Separate from `ledgerBusy` (the shell's, which only serializes ledger
   * commands): what this one guards is *issuance*, because a save may be a move, and a move changes
   * which files this screen's ids name (review [P1] round 2).
   */
  let ledgerSaving = $state(false);
  /**
   * Whether an 更新操作 may be issued at all. A ledger write in flight counts as busy for every
   * 区画 — not just the one that started it — since the boundary detaches the old session and
   * reopens the slug against the new root while it runs.
   */
  let issuing = $derived(busy || ledgerSaving);
  /** Why issuance is held, for the controls that build no plan of their own (文書一覧の 編集). */
  let issuingReason = $derived(
    ledgerSaving ? LEDGER_WRITE_IN_FLIGHT_REASON : busy ? ISSUE_BUSY_REASON : null,
  );

  /**
   * Whether one form's 発行 control may be pressed, and why not (doc-5 §5). Wrapped rather than
   * called directly so the ledger-write hold reaches all four 区画 through one place — added to a
   * single form, it would be the one the others forgot.
   */
  function availability(plan: IssuePlan): IssueAvailability {
    return issueAvailability(plan, {
      readiness,
      busy,
      hold: ledgerSaving ? LEDGER_WRITE_IN_FLIGHT_REASON : null,
    });
  }
  /**
   * The last action's result. Its tone follows doc-9 §5's families: an ordinary notice for a CLI
   * failure or a 更新前競合, and 照合不能's own colour for the one that is neither — so it cannot be
   * read as "a conflict happened".
   */
  let message = $state<{ tone: "ok" | "warn" | "undetectable"; text: string } | null>(null);

  function tone(outcome: IssueOutcome): "ok" | "warn" | "undetectable" {
    if (outcome.state === "applied") return "ok";
    return outcome.state === "uncheckable" ? "undetectable" : "warn";
  }

  // --- 概要区画: 台帳エントリ (doc-10 §4) ------------------------------------------------------

  /**
   * The 台帳エントリ edit form. Copied from `entry` once and then held as the user's own. It is not
   * re-copied after a successful save because it does not need to be: `entry` moves, so
   * `toUpdateRequest` returns `null` and the form settles at 変更なし by itself. Re-copying would
   * instead overwrite the user's input silently whenever another change landed alongside the save.
   */
  let edit = $state<EntryEdit>(untrack(() => editOf(entry)));
  let unregisterInput = $state("");
  let entryReport = $state<RefusalReport | null>(null);
  let overviewNotice = $state<string | null>(null);

  let editIssues = $derived(editProblems(edit));
  let updateRequest = $derived(toUpdateRequest(entry, edit));
  /** 送信属性一覧 (doc-10 §4.1), shown above the 保存 at all times rather than on hover (doc-11 §5). */
  let submitted = $derived(updateRequest === null ? [] : submittedAttributes(entry, updateRequest));
  let moveNote = $derived(rootMoveNote(entry, edit));

  const OVERVIEW_BLOCKED_ID = "overview-blocked";
  const UNREGISTER_BLOCKED_ID = "overview-unregister-blocked";

  let saveBlocked = $derived(
    // Ordered as the obstacles are: a ledger that cannot be written first, an action in flight
    // next, and the input and what it amounts to last.
    overviewBlocked({ readOnly: ledgerReadOnly, busy: ledgerBusy || issuing }) ??
      (editIssues.length > 0
        ? "入力に問題があります（各欄の指摘を参照）。"
        : updateRequest === null
          ? "変更がありません（送る属性がありません）。"
          : null),
  );
  let unregisterReason = $derived(
    unregisterBlocked(unregisterInput, entry.slug, {
      readOnly: ledgerReadOnly,
      busy: ledgerBusy || issuing,
    }),
  );

  /** The statuses this project declares; `null` when the root is unreadable (nothing to judge by). */
  let declaredStatuses = $derived(project?.config.statuses ?? null);

  function addAliasRow(): void {
    edit.aliases.push({ key: "", value: CANONICAL_STATUS_NAMES[0] });
  }

  function removeAliasRow(index: number): void {
    edit.aliases.splice(index, 1);
  }

  /** Put in the default Backlog root for the project root as the field currently has it (doc-3 §3). */
  function followBacklogDefault(): void {
    edit.backlogRoot = resolvedBacklogRoot({
      projectRoot: edit.projectRoot,
      backlogRoot: "",
      slug: "",
    });
  }

  async function pickRoot(field: "projectRoot" | "backlogRoot"): Promise<void> {
    const picked = await onpickDirectory(
      field === "projectRoot" ? "プロジェクトルートを選択" : "Backlog ルートを選択",
    );
    if (picked === null) return;
    edit[field] = picked;
  }

  async function save(): Promise<void> {
    const request = updateRequest;
    if (saveBlocked !== null || request === null) return;
    entryReport = null;
    overviewNotice = null;
    // Raised *before* the await, not after it (review [P1] round 2). The cleanup below cannot be the
    // whole guard: while `onupdate` is in flight the boundary detaches the old session and reopens
    // the slug against the new root, and an issue made from another 区画 in that window would carry
    // this root's document id to the other one — arriving after the reopen, so the 更新前競合検出
    // checks it against the new root's fresh read and lets it through. Dropped only in the
    // `finally`, after the cleanup below: everything past the await is synchronous, so nothing can
    // slip between the reopen and the session being cleared.
    ledgerSaving = true;
    try {
      const result = await onupdate(request);
      if (result.state === "refused") {
        entryReport = result.report;
        return;
      }
      // The re-detection is one request, not a stored setting (doc-3 §4.3). Left checked, every
      // later save would carry it too, so it is dropped once one has gone through.
      edit.redetectGitRemote = false;
      if (movesRoot(request)) {
        // A completed move closes the open 編集セッション (doc-10 §4.1). This screen is keyed by
        // slug alone and a move keeps the slug, so nothing else would close it. A surviving session
        // would let this root's body be sent to the other one by document id — and with the same id
        // present there, the 更新前競合検出 passes against the new root's own read, so `--content`
        // replaces it whole.
        docSession = null;
        newTag = "";
        pendingDocument = null;
        // status and milestone name the old root's ID space (doc-3 §5.3), so they do not travel
        // either. Both are selections rather than typed text, so dropping them costs no input.
        taskInput.status = "";
        taskInput.milestone = "";
        overviewNotice =
          `${result.slug} を移動しました。開いていた文書の編集セッションは、旧ルートの読み取りに` +
          "基づくため閉じました（doc-10 §4.1）。";
        return;
      }
      overviewNotice = `${result.slug} の台帳エントリを更新しました。`;
    } finally {
      ledgerSaving = false;
    }
  }

  async function unregister(): Promise<void> {
    if (unregisterReason !== null) return;
    entryReport = null;
    // Held for the same reason a save is: the boundary closes this project's session on the way,
    // and an issue made while that is in flight would be aimed at a project Atlas no longer reads.
    ledgerSaving = true;
    try {
      const result = await onremove(entry.slug);
      if (result.state === "refused") entryReport = result.report;
      // Closing this screen on success is the shell's job (`removeProject`). Calling `onback` from
      // here would meet the 破棄前確認 and ask whether to keep input for a registration that is gone.
    } finally {
      ledgerSaving = false;
    }
  }

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }

  // --- 更新操作の発行 (doc-5 §3, doc-9 §4) -------------------------------------------------------

  /**
   * Issue one action against this project and state what became of it (doc-9 §5). Refuses while a
   * ledger write is in flight for the same reason the controls are withheld: that write may be a
   * move, and this action names files by the ids of the root as it was read.
   */
  async function issue(action: UpdateOperation[], done: string): Promise<IssueOutcome | null> {
    if (project === null || ledgerSaving) return null;
    busy = true;
    message = null;
    try {
      const outcome = await onissue(entry.slug, action);
      message = { tone: tone(outcome), text: outcomeMessage(outcome, done) };
      return outcome;
    } finally {
      busy = false;
    }
  }

  // --- 新規タスク区画 (doc-10 §7) --------------------------------------------------------------

  let taskInput = $state<TaskCreateInput>({ ...EMPTY_TASK_CREATE });
  let newLabel = $state("");
  let newCriterion = $state("");
  let taskPlan = $derived(buildTaskCreate(taskInput));
  let taskIssue = $derived(availability(taskPlan));

  async function createTask(): Promise<void> {
    if (taskIssue.state !== "ready" || taskPlan.state !== "ready") return;
    const outcome = await issue(taskPlan.action, "タスクを作成しました。");
    // Cleared only on success: a failed create keeps its input so it can be corrected and retried.
    if (outcome?.state === "applied") {
      taskInput = { ...EMPTY_TASK_CREATE };
      newLabel = "";
      newCriterion = "";
    }
  }

  // --- 文書区画 (doc-10 §5) ---------------------------------------------------------------------

  let docInput = $state<DocCreateInput>({ ...EMPTY_DOC_CREATE });
  let docCreatePlan = $derived(buildDocCreate(docInput));
  let docCreateIssue = $derived(availability(docCreatePlan));

  /** The document being edited, with its session. One at a time: two would both claim 発行. */
  let docSession = $state<DocSession | null>(null);
  let newTag = $state("");
  let docUpdatePlan = $derived(docSession === null ? null : buildDocUpdate(docSession));
  let docUpdateIssue = $derived(
    docUpdatePlan === null
      ? ({ state: "blocked", reason: "編集する文書を選んでください" } as const)
      : availability(docUpdatePlan),
  );
  let docDirty = $derived(docSession !== null && isDocDirty(docSession));
  /**
   * What the document editor holds, as opposed to what the session's fields hold. The add-row's text
   * dies with the editor but changes no field until 追加 is pressed, so `docDirty` alone leaves it
   * unprotected — closing or replacing the editor would clear a typed tag without asking.
   */
  let docEditorDirty = $derived(docDirty || newTag.trim() !== "");
  /** Where the user asked to go while 未保存入力 was held — **not applied** until they answer. */
  let pendingDocument = $state<{ document: Document | null } | null>(null);

  async function createDoc(): Promise<void> {
    if (docCreateIssue.state !== "ready" || docCreatePlan.state !== "ready") return;
    const outcome = await issue(docCreatePlan.action, "文書を作成しました。");
    if (outcome?.state === "applied") docInput = { ...EMPTY_DOC_CREATE };
  }

  async function updateDoc(): Promise<void> {
    const session = docSession;
    const plan = docUpdatePlan;
    if (session === null || plan === null || plan.state !== "ready") return;
    if (docUpdateIssue.state !== "ready") return;
    const submittedDoc = plan.submitted;
    const outcome = await issue(plan.action, "文書を更新しました。");
    if (outcome?.state !== "applied") return;
    // 防げない喪失の事後通知 (doc-9 §5): the re-read has already landed, so the document below is
    // the post-update one. `--content` full-replaces the body (doc-5 §3.1), which is why this
    // comparison matters more for a document than for anything else on screen.
    const diverged = docDivergence(
      submittedDoc,
      project?.documents.find((candidate) => candidate.id === session.baseline.id) ?? null,
    );
    // Closed on success: this session's baseline is the pre-update read, and keeping it open would
    // compare the next edit against a version that no longer exists.
    docSession = null;
    newTag = "";
    if (diverged.length > 0) {
      message = {
        tone: "warn",
        text:
          `更新は適用されましたが、再読込した内容が送信した内容と一致しません（${diverged.join("・")}）。` +
          "照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。更新前競合検出は " +
          "best-effort であり、この窓に入った更新が上書きで失われた場合、その内容は表示も復元も" +
          "できません（doc-9 §4.1）。",
      };
    }
  }

  /** Open one document's 編集セッション, asking first when another one's input would be lost. */
  function editDocument(document: Document): void {
    // Already open: pressing 編集 again would restart the session and drop the input without asking.
    if (docSession?.baseline.id === document.id) return;
    if (docEditorDirty) {
      pendingDocument = { document };
      return;
    }
    openDocument(document);
  }

  function openDocument(document: Document): void {
    docSession = startDocSession(document);
    newTag = "";
    message = null;
  }

  function closeEditor(): void {
    if (docEditorDirty) {
      pendingDocument = { document: null };
      return;
    }
    docSession = null;
    newTag = "";
  }

  function leaveConfirmed(): void {
    const target = pendingDocument;
    pendingDocument = null;
    if (target === null) return;
    if (target.document === null) {
      docSession = null;
      newTag = "";
      return;
    }
    openDocument(target.document);
  }

  function setDoc<K extends keyof DocDraft>(key: K, value: DocDraft[K]): void {
    if (docSession === null) return;
    docSession = setDocField(docSession, key, value);
  }

  // --- マイルストーン区画 (doc-10 §6) ------------------------------------------------------------

  let milestoneInput = $state<MilestoneAddInput>({ ...EMPTY_MILESTONE_ADD });
  let milestonePlan = $derived(buildMilestoneAdd(milestoneInput));
  let milestoneIssue = $derived(availability(milestonePlan));

  async function addMilestone(): Promise<void> {
    if (milestoneIssue.state !== "ready" || milestonePlan.state !== "ready") return;
    const outcome = await issue(milestonePlan.action, "マイルストーンを作成しました。");
    if (outcome?.state === "applied") milestoneInput = { ...EMPTY_MILESTONE_ADD };
  }

  /**
   * Which milestone's 改称・削除・アーカイブ is open (doc-10 §6). One at a time, keyed by id: each
   * carries input of its own, and two open at once would leave the 書き換え対象集合 shown beside one
   * operation while another is the one about to be issued.
   */
  let milestoneOp = $state<{ id: string; kind: "rename" | "remove" | "archive" } | null>(null);
  let renameInput = $state<MilestoneRenameInput>({ ...EMPTY_MILESTONE_RENAME });
  let removeInput = $state<MilestoneRemoveInput>({ ...EMPTY_MILESTONE_REMOVE });

  function openMilestoneOp(milestone: Milestone, kind: "rename" | "remove" | "archive"): void {
    // Pressing the open operation again closes it, which is a cancel like any other.
    if (milestoneOp?.id === milestone.id && milestoneOp.kind === kind) {
      closeMilestoneOp();
      return;
    }
    milestoneOp = { id: milestone.id, kind };
    // Moving to another operation starts from empty, so a name or a 付け替え先 typed for one
    // milestone cannot be issued against the next.
    renameInput = { ...EMPTY_MILESTONE_RENAME };
    removeInput = { ...EMPTY_MILESTONE_REMOVE };
    message = null;
  }

  /**
   * Close the open operation, clearing its input. The clearing is the point: `dirty` counts these
   * inputs, so a close that left them behind would keep asking before leaving the screen — to
   * protect input the user cancelled and can no longer see (review round 1 [P2]).
   */
  function closeMilestoneOp(): void {
    milestoneOp = null;
    renameInput = { ...EMPTY_MILESTONE_RENAME };
    removeInput = { ...EMPTY_MILESTONE_REMOVE };
  }

  /** The plan the open operation would issue, or `null` when none is open. */
  function milestoneOpPlan(milestone: Milestone): IssuePlan | null {
    if (milestoneOp?.id !== milestone.id) return null;
    switch (milestoneOp.kind) {
      case "rename":
        return buildMilestoneRename(milestone, renameInput);
      case "remove":
        return buildMilestoneRemove(milestone, removeInput);
      case "archive":
        return buildMilestoneArchive(milestone);
    }
  }

  /**
   * 書き換え対象集合 (doc-9 §4.2.2) as the screen states it before the user commits. The milestone's
   * own file is always in it; the 参照タスク集合 only for the operations that follow references —
   * which is read off the built operation, so what is shown and what is issued cannot disagree.
   */
  function rewriteTargets(
    milestone: Milestone,
    plan: IssuePlan | null,
  ): { fanOut: boolean; tasks: TaskView[] } {
    const fanOut = plan?.state === "ready" && followsReferences(plan.action[0]);
    return {
      fanOut,
      tasks: fanOut ? referencingTasks(milestone, project?.tasks ?? []) : [],
    };
  }

  async function runMilestoneOp(milestone: Milestone, done: string): Promise<void> {
    const plan = milestoneOpPlan(milestone);
    if (plan === null || plan.state !== "ready") return;
    if (availability(plan).state !== "ready") return;
    const outcome = await issue(plan.action, done);
    // Closed on success only: the milestone the input names is gone (removed/archived) or renamed,
    // so keeping the form open would offer a second issue against a stale operand. A failure or a
    // 更新前競合 keeps it, which is what lets the user reload and retry the same input.
    if (outcome?.state === "applied") closeMilestoneOp();
  }

  // --- 未保存入力 (doc-8 §6.3) -------------------------------------------------------------------

  /**
   * The 未保存入力 this screen holds. A 区画切替 loses none of it — this one component holds every
   * 区画's state, and the switch is a display change (doc-10 §1) — but leaving the screen loses all
   * of it, which is why the shell's 破棄前確認 has to see all four. The three add-rows count too:
   * text typed but not yet committed with 追加 is the easiest thing to lose and the least visible.
   */
  let dirty = $derived(
    updateRequest !== null ||
      unregisterInput.trim() !== "" ||
      docEditorDirty ||
      hasTaskCreateInput(taskInput) ||
      hasDocCreateInput(docInput) ||
      hasMilestoneAddInput(milestoneInput) ||
      // An open 改称・削除 carries input of its own — a name typed but not yet issued is exactly the
      // kind of thing leaving the screen loses silently (doc-8 §6.3).
      renameInput.to.trim() !== "" ||
      removeInput.handling !== null ||
      newLabel.trim() !== "" ||
      newCriterion.trim() !== "",
  );

  $effect(() => {
    ondirty(dirty);
  });

  // --- 表示の小道具 -------------------------------------------------------------------------------

  /** Where the list's 編集 buttons send `aria-describedby` while issuance is held (doc-11 §5). */
  const DOC_EDIT_BLOCKED_ID = "detail-doc-edit-blocked";

  function why(availability: { state: string; reason?: string }): string {
    return availability.state === "blocked" ? (availability.reason ?? "") : "";
  }

  function addTo(values: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || values.includes(trimmed) ? values : [...values, trimmed];
  }

  /** What stands in for a list the screen cannot draw because the root is unreadable (doc-10 §8). */
  let unreadableNote = $derived(
    unreadable === null
      ? null
      : "ルートが読めないため、この区画の一覧と発行は出せません。概要区画でルートを直してください" +
        "（台帳エントリ自体は読めています。doc-10 §8）。",
  );
</script>

{#snippet listEditor(
  values: string[],
  apply: (next: string[]) => void,
  draft: string,
  setDraft: (value: string) => void,
  placeholder: string,
)}
  {#if values.length > 0}
    <ul class="list-edit">
      {#each values as value, index (index)}
        <li>
          <span class="value">{value}</span>
          <button
            type="button"
            class="mini"
            onclick={() => apply(values.filter((_, at) => at !== index))}
          >
            削除
          </button>
        </li>
      {/each}
    </ul>
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

{#snippet withheld(title: string, operations: WithheldOperation[])}
  <!-- 提供しない操作区画 (doc-10 §1/§6, doc-11 §5): instead of unpressable buttons, the three points
       — 名称, the CLI it maps to, and the reason. 無効化 means「今は条件が揃っていない」, while what
       is listed here is what Atlas decided not to offer in this version: a different statement. -->
  <div class="withheld">
    <h3>{title}</h3>
    <ul>
      {#each operations as operation (operation.kind)}
        <li>
          <span class="label">{operation.label}</span>
          <code>{operation.mapping}</code>
          <p>{operation.reason}</p>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<div class="detail">
  <!-- ヘッダ (doc-10 §3): identity and the round trip only. Nothing here writes. -->
  <header class="head">
    <div class="identity">
      <span class="name">{project?.config.projectName ?? entry.slug}</span>
      <span class="slug">{entry.slug}</span>
    </div>
    <span class="counts">
      {#if project !== null}
        タスク {project.tasks.length} ・ 文書 {project.documents.length} ・ マイルストーン
        {project.milestones.length}
      {:else if unreadable !== null}
        <span class="unreadable-count">件数はルート読取不能のため出せません</span>
      {:else}
        読み込み中…
      {/if}
    </span>
    <div class="exits">
      <button type="button" onclick={onback}>← スイムレーン</button>
      <button type="button" onclick={ontoLane}>このプロジェクトのレーンへ</button>
    </div>
  </header>

  <div class="body">
    <!-- 区画切替 (doc-10 §1): a display change within one screen, not a screen transition. Every
         区画's input lives in this one component, so moving between them loses nothing. -->
    <nav class="sections" aria-label="区画">
      {#each DETAIL_SECTIONS as item (item.id)}
        <button
          type="button"
          class:current={section === item.id}
          aria-current={section === item.id ? "true" : undefined}
          onclick={() => (section = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="panel">
      {#if message !== null}
        <p class={message.tone}>{message.text}</p>
      {/if}

      {#if section === "overview"}
        <!-- 概要区画 (doc-10 §4): the ledger file is the only thing it writes, so CLI 縮退 does not
             reach it. -->
        <section>
          <h2>概要（台帳エントリ）</h2>

          {#if ledgerReadOnly}
            <!-- doc-10 §8 asks for both the inputs and 登録解除 to be disabled. With only the save
                 held back, the user could edit values that can never be written, that input would
                 count as 未保存入力, and they would later be asked whether to discard changes that
                 were never saveable (review [P2]). `disabled` is allowed because this sentence is on
                 screen near the controls at all times (doc-11 §5). -->
            <p class="blocked-note" id={OVERVIEW_BLOCKED_ID}>{OVERVIEW_READ_ONLY_NOTE}</p>
          {/if}

          {#if overviewNotice}
            <p class="ok">{overviewNotice}</p>
          {/if}

          <div class="field">
            <span class="label">slug</span>
            <p class="value-line"><code>{entry.slug}</code></p>
            <!-- No unpressable field for it (doc-10 §4.1): what is shown is the value, and what
                 changing it would take instead. -->
            <p class="hint">{SLUG_IMMUTABLE_NOTE}</p>
          </div>

          <label class="field">
            <span class="label">project_root</span>
            <span class="row-inline">
              <input
                type="text"
                bind:value={edit.projectRoot}
                spellcheck="false"
                disabled={ledgerReadOnly}
              />
              <button type="button" disabled={ledgerReadOnly} onclick={() => pickRoot("projectRoot")}>
                選択…
              </button>
            </span>
          </label>
          {#if moveNote !== null}
            <p class="hint">{moveNote}</p>
          {/if}
          {#each problemsFor(editIssues, "projectRoot") as text (text)}
            <p class="problem">{text}</p>
          {/each}

          <label class="field">
            <span class="label">backlog_root</span>
            <span class="row-inline">
              <input
                type="text"
                bind:value={edit.backlogRoot}
                spellcheck="false"
                disabled={ledgerReadOnly}
              />
              <button type="button" disabled={ledgerReadOnly} onclick={() => pickRoot("backlogRoot")}>
                選択…
              </button>
              <button type="button" disabled={ledgerReadOnly} onclick={followBacklogDefault}>
                既定に合わせる
              </button>
            </span>
          </label>
          {#each problemsFor(editIssues, "backlogRoot") as text (text)}
            <p class="problem">{text}</p>
          {/each}

          <label class="check">
            <input type="checkbox" bind:checked={edit.redetectGitRemote} disabled={ledgerReadOnly} />
            <span>
              Git remote を再判定する（現在: {entry.git_remote_present ? "あり" : "なし"}）
            </span>
          </label>

          <fieldset class="aliases">
            <legend>status 別名表（doc-3 §3.3）</legend>
            <p class="hint">
              プロジェクト固有の status を正準ステータス列へ対応づけます。既定は空で、Backlog.md 既定の
              4 status は名称一致するため設定は要りません。
            </p>
            {#each edit.aliases as row, index (index)}
              {@const effect =
                declaredStatuses === null ? null : aliasKeyEffect(row.key, declaredStatuses)}
              {@const note = effect === null ? null : ALIAS_EFFECT_NOTES[effect]}
              {@const invalidValue = !CANONICAL_STATUS_NAMES.includes(row.value)}
              <div class="alias-row">
                <input
                  type="text"
                  placeholder="プロジェクトの status"
                  list={`declared-${entry.slug}`}
                  bind:value={row.key}
                  disabled={ledgerReadOnly}
                />
                <span aria-hidden="true">→</span>
                <select bind:value={row.value} disabled={ledgerReadOnly}>
                  {#each CANONICAL_STATUS_NAMES as name (name)}
                    <option value={name}>{name}</option>
                  {/each}
                  {#if invalidValue}
                    <!-- 不正な別名を台帳から削除しない (doc-3 §3.3, TASK-42). Showing the row with its
                         own out-of-range value *is* what「削除しない」means on this screen: listing
                         only the canonical four would swap the value for the first option the moment
                         the form opened, and the save would then drop it. -->
                    <option value={row.value}>{row.value}（不正: 正準列ではありません）</option>
                  {/if}
                </select>
                <button
                  type="button"
                  title="この行を削除"
                  disabled={ledgerReadOnly}
                  onclick={() => removeAliasRow(index)}
                >
                  ×
                </button>
                {#if row.key.trim() !== ""}
                  {#if note !== null}
                    <!-- Whether the alias actually applies (doc-10 §4.2). Only the one ineffective
                         state takes the 縮退 family's colour. -->
                    <span class="alias-effect" class:ineffective={note.ineffective} title={note.note}>
                      {note.label}
                    </span>
                  {:else}
                    <span class="alias-effect">
                      ルート読取不能のため、この別名が効くかを判定できません
                    </span>
                  {/if}
                {/if}
              </div>
              {#if row.key.trim() !== "" && note !== null}
                <p class="alias-note" class:ineffective={note.ineffective}>{note.note}</p>
              {/if}
            {/each}
            <div class="row-inline">
              <button type="button" disabled={ledgerReadOnly} onclick={addAliasRow}>別名を追加</button>
              {#if declaredStatuses !== null}
                <datalist id={`declared-${entry.slug}`}>
                  {#each declaredStatuses as status (status)}
                    <option value={status}></option>
                  {/each}
                </datalist>
              {/if}
            </div>
            {#each problemsFor(editIssues, "aliases") as text (text)}
              <p class="problem">{text}</p>
            {/each}
          </fieldset>

          <!-- 送る属性を保存の直前に列挙する (doc-10 §4.1). What is listed is what the request
               actually carries, not what the screen thinks it changed — a move carrying both roots
               shows up here. -->
          <div class="submit-preview">
            <h3>保存で送る属性</h3>
            {#if submitted.length === 0}
              <p class="neutral">変更なし（送る属性はありません）。</p>
            {:else}
              <ul class="submitted">
                {#each submitted as attribute (attribute.attribute)}
                  <li>
                    <code>{attribute.attribute}</code>
                    <span class="from">{attribute.from}</span>
                    <span aria-hidden="true">→</span>
                    <span class="to">{attribute.to}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          {#if entryReport !== null}
            <p class="problem">{entryReport.message}</p>
          {/if}

          <div class="actions">
            <button
              type="button"
              class="primary"
              aria-disabled={saveBlocked !== null}
              aria-describedby={saveBlocked === null
                ? undefined
                : ledgerReadOnly
                  ? OVERVIEW_BLOCKED_ID
                  : "overview-save-blocked"}
              title={saveBlocked ?? "上に並べた属性を台帳へ書きます"}
              onclick={save}>保存</button
            >
          </div>
          {#if saveBlocked !== null && !ledgerReadOnly}
            <!-- On a read-only ledger the note above is already the reason, so it is not repeated
                 a second time here (doc-11 §5). -->
            <p class="blocked-note" id="overview-save-blocked">{saveBlocked}</p>
          {/if}

          <!-- 登録解除 (doc-10 §4.3): a 危険区画, kept apart from the other operations. -->
          <div class="danger">
            <h3>登録解除</h3>
            <p>{UNREGISTER_SCOPE_NOTE}</p>
            <label class="field">
              <span class="label">確認: slug を入力してください</span>
              <input
                type="text"
                placeholder={entry.slug}
                spellcheck="false"
                bind:value={unregisterInput}
                disabled={ledgerReadOnly}
              />
            </label>
            <div class="actions">
              <button
                type="button"
                aria-disabled={unregisterReason !== null}
                aria-describedby={unregisterReason === null
                  ? undefined
                  : ledgerReadOnly
                    ? OVERVIEW_BLOCKED_ID
                    : UNREGISTER_BLOCKED_ID}
                title={unregisterReason ?? "この登録を台帳から外します"}
                onclick={unregister}>台帳から外す</button
              >
            </div>
            {#if unregisterReason !== null && !ledgerReadOnly}
              <p class="blocked-note" id={UNREGISTER_BLOCKED_ID}>{unregisterReason}</p>
            {/if}
          </div>
        </section>
      {:else if section === "documents"}
        <!-- 文書区画 (doc-10 §5) -->
        <section>
          <h2>文書</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            {#if pendingDocument !== null}
              <!-- 破棄前確認: 未保存入力 is held and the requested action would drop it. The action
                   itself has not been applied. -->
              <div class="confirm">
                <span>
                  {#if pendingDocument.document === null}
                    文書の編集に未保存入力があります。編集を閉じると破棄されます。
                  {:else}
                    文書の編集に未保存入力があります。{pendingDocument.document.id} を開くと破棄されます。
                  {/if}
                </span>
                <button type="button" onclick={leaveConfirmed}>破棄して続行</button>
                <button type="button" onclick={() => (pendingDocument = null)}>入力に戻る</button>
              </div>
            {/if}

            {#if project.documents.length === 0}
              <p class="neutral">文書はありません。</p>
            {:else}
              {#if issuingReason !== null}
                <!-- Every 編集 in the list is held by the same one thing (doc-11 §5): the reason is
                     written once above the list and each button is bound to it. They stay
                     `aria-disabled` so they keep taking focus, which is what makes the binding
                     reachable without a pointer. -->
                <p class="reason" id={DOC_EDIT_BLOCKED_ID}>
                  {issuingReason}。完了するまで文書の編集は開けません。
                </p>
              {/if}
              <ul class="records">
                {#each project.documents as document (document.id)}
                  <li>
                    <div class="record-head">
                      <span class="id">{document.id}</span>
                      <span class="title">{document.title}</span>
                      <span class="meta">{document.type ?? "type 未設定"}</span>
                      {#if document.tags.length > 0}
                        <span class="meta">tags: {document.tags.join(", ")}</span>
                      {/if}
                      {#if docSession?.baseline.id === document.id && docEditorDirty}
                        <!-- 未保存入力のある文書には印を付ける (doc-10 §5). Only one 編集セッション
                             exists at a time, so only one row can carry it; it is shown on the list
                             side so that「まだ送っていない」stays readable even when the editor has
                             scrolled out of view. -->
                        <span class="unsaved">未保存</span>
                      {/if}
                      <button
                        type="button"
                        class="mini"
                        aria-disabled={issuing}
                        aria-describedby={issuing ? DOC_EDIT_BLOCKED_ID : undefined}
                        title={issuingReason ?? "この文書を編集します"}
                        onclick={() => !issuing && editDocument(document)}
                      >
                        {docSession?.baseline.id === document.id ? "編集中" : "編集"}
                      </button>
                    </div>
                    <!-- パス (doc-10 §5): the `source_path` the read layer got from its scan, not the
                         docs-relative value `-p` takes — which is why the update form's path field
                         holds no current value. -->
                    <p class="path"><code>{document.sourcePath}</code></p>
                  </li>
                {/each}
              </ul>
            {/if}

            {#if docSession !== null}
              {@const session = docSession}
              <div class="sub-panel">
                <h3>{session.baseline.id} を更新（doc update）</h3>

                <label class="field">
                  <span class="label">title</span>
                  <input
                    type="text"
                    value={session.draft.title}
                    oninput={(event) => setDoc("title", event.currentTarget.value)}
                  />
                </label>

                <div class="field">
                  <span class="label">本文（全置換）</span>
                  <Editor
                    label="本文"
                    value={session.draft.content}
                    rows={14}
                    onchange={(value) => setDoc("content", value)}
                    onsave={updateDoc}
                  />
                  <p class="hint">
                    `doc update --content` は本文を全置換します（v1.47.1 に部分更新はありません。doc-5
                    §3.1）。この欄は読み取った本文全文で、発行時はここにある全文をそのまま渡します。
                  </p>
                </div>

                <div class="row">
                  <label class="field">
                    <span class="label">type</span>
                    <select
                      value={session.draft.docType}
                      onchange={(event) => setDoc("docType", event.currentTarget.value)}
                    >
                      <option value="">—（変更しない）</option>
                      {#each DOC_TYPES as value (value)}
                        <option {value}>{value}</option>
                      {/each}
                    </select>
                  </label>

                  <label class="field">
                    <span class="label">path（移動する場合のみ）</span>
                    <input
                      type="text"
                      placeholder="空欄なら変更しません"
                      value={session.draft.path}
                      oninput={(event) => setDoc("path", event.currentTarget.value)}
                    />
                  </label>
                </div>

                <div class="field">
                  <span class="label">tags</span>
                  {@render listEditor(
                    session.draft.tags,
                    (next) => setDoc("tags", next),
                    newTag,
                    (value) => (newTag = value),
                    "追加するタグ",
                  )}
                </div>

                <div class="actions">
                  <button
                    type="button"
                    disabled={docUpdateIssue.state !== "ready"}
                    aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
                    title={why(docUpdateIssue)}
                    onclick={updateDoc}
                  >
                    文書を更新（doc update）
                  </button>
                  <button type="button" onclick={closeEditor}>閉じる</button>
                  {#if docUpdateIssue.state === "blocked"}
                    <span class="reason">{docUpdateIssue.reason}</span>
                  {/if}
                </div>
                <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4). The chord is answered inside the 本文欄
                     (its 適用範囲 is 編集部品の内側), so it is named here at the 発行 it runs — printed from
                     the 割り当て一覧, never spelled by hand. -->
                <p class="hint">
                  本文欄では {shortcutHint("saveEditSession", MAC_KEYBOARD)} でも更新を発行できます。
                </p>
              </div>
            {/if}

            <div class="sub-panel">
              <h3>文書を作成（doc create）</h3>
              <div class="row">
                <label class="field">
                  <span class="label">title（必須）</span>
                  <input
                    type="text"
                    value={docInput.title}
                    oninput={(event) => (docInput.title = event.currentTarget.value)}
                  />
                </label>
                <label class="field">
                  <span class="label">type</span>
                  <select
                    value={docInput.docType}
                    onchange={(event) => (docInput.docType = event.currentTarget.value)}
                  >
                    <option value="">—（CLI の既定）</option>
                    {#each DOC_TYPES as value (value)}
                      <option {value}>{value}</option>
                    {/each}
                  </select>
                </label>
                <label class="field">
                  <span class="label">path</span>
                  <input
                    type="text"
                    placeholder="docs 配下の下位パス（任意）"
                    value={docInput.path}
                    oninput={(event) => (docInput.path = event.currentTarget.value)}
                  />
                </label>
              </div>
              <p class="hint">
                本文は `doc create` では渡せません（doc-5 §3 の create 写像は title・type・path のみ）。
                作成後、上の一覧から「編集」して本文を入れます。
              </p>
              <div class="actions">
                <button
                  type="button"
                  disabled={docCreateIssue.state !== "ready"}
                  title={why(docCreateIssue)}
                  onclick={createDoc}
                >
                  文書を作成
                </button>
                {#if docCreateIssue.state === "blocked"}
                  <span class="reason">{docCreateIssue.reason}</span>
                {/if}
              </div>
            </div>
          {/if}

          {@render withheld("現時点で提供しない操作（文書）", WITHHELD_DOCUMENT_OPERATIONS)}
        </section>
      {:else if section === "milestones"}
        <!-- マイルストーン区画 (doc-10 §6) -->
        <section>
          <h2>マイルストーン</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            {#if project.milestones.length === 0}
              <p class="neutral">マイルストーンはありません。</p>
            {:else}
              <ul class="records">
                {#each project.milestones as milestone (milestone.id)}
                  {@const held = project.tasks.filter(
                    (view) => view.task.milestone === milestone.id,
                  ).length}
                  {@const plan = milestoneOpPlan(milestone)}
                  {@const open = milestoneOp?.id === milestone.id ? milestoneOp.kind : null}
                  {@const opIssue = plan === null ? null : availability(plan)}
                  {@const targets = rewriteTargets(milestone, plan)}
                  <li>
                    <div class="record-head">
                      <span class="id">{milestone.id}</span>
                      <span class="title">{milestone.title}</span>
                      <span class="meta">所属タスク {held} 件</span>
                    </div>
                    {#if milestone.description}
                      <p class="description">{milestone.description}</p>
                    {:else}
                      <p class="neutral">説明なし</p>
                    {/if}
                    <!-- 改称・削除・アーカイブ (doc-10 §6). doc-9 §4.2 defines the 照合 for all
                         three, so they are operations here rather than 提供しない操作区画 entries. -->
                    <div class="actions">
                      <button
                        type="button"
                        aria-expanded={open === "rename"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp(milestone, "rename")}
                      >
                        改称
                      </button>
                      <button
                        type="button"
                        aria-expanded={open === "remove"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp(milestone, "remove")}
                      >
                        削除
                      </button>
                      <button
                        type="button"
                        aria-expanded={open === "archive"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp(milestone, "archive")}
                      >
                        アーカイブ
                      </button>
                    </div>

                    {#if open !== null}
                      <div class="sub-panel">
                        {#if open === "rename"}
                          <h3>改称（milestone rename）</h3>
                          <label class="field">
                            <span class="label">新しい名称（必須）</span>
                            <input
                              type="text"
                              value={renameInput.to}
                              oninput={(event) => (renameInput.to = event.currentTarget.value)}
                            />
                          </label>
                          <label class="check">
                            <input
                              type="checkbox"
                              checked={renameInput.updateTasks}
                              onchange={(event) =>
                                (renameInput.updateTasks = event.currentTarget.checked)}
                            />
                            <span>参照するタスクも更新する（外すと --no-update-tasks）</span>
                          </label>
                          <p class="hint">
                            v1.47.1 の改称は id（{milestone.id}）を変えないため、実際に書き換わるのは
                            milestone 値が id 以外のタスクだけです。
                          </p>
                        {:else if open === "remove"}
                          <h3>削除（milestone remove）</h3>
                          <p class="hint">{MILESTONE_REMOVE_MOVES_THE_FILE}</p>
                          <fieldset class="handling">
                            <legend>参照するタスクの扱い（必須。--task-handling）</legend>
                            {#each [{ mode: "clear", label: "milestone 値を除去する（clear）" }, { mode: "keep", label: "そのまま保持する（keep）" }, { mode: "reassign", label: "別マイルストーンへ付け替える（reassign）" }] as choice (choice.mode)}
                              <label class="check">
                                <input
                                  type="radio"
                                  name={`handling-${milestone.id}`}
                                  checked={removeInput.handling === choice.mode}
                                  onchange={() =>
                                    (removeInput.handling = choice.mode as
                                      | "clear"
                                      | "keep"
                                      | "reassign")}
                                />
                                <span>{choice.label}</span>
                              </label>
                            {/each}
                          </fieldset>
                          {#if removeInput.handling === "keep"}
                            <p class="hint">{MILESTONE_KEEP_LEAVES_DANGLING_REFERENCES}</p>
                          {/if}
                          {#if removeInput.handling === "reassign"}
                            <label class="field">
                              <span class="label">付け替え先（必須。--reassign-to）</span>
                              <select
                                value={removeInput.reassignTo}
                                onchange={(event) =>
                                  (removeInput.reassignTo = event.currentTarget.value)}
                              >
                                <option value="">選択してください</option>
                                {#each project.milestones.filter((candidate) => candidate.id !== milestone.id) as candidate (candidate.id)}
                                  <option value={candidate.id}>
                                    {candidate.id}
                                    {candidate.title}
                                  </option>
                                {/each}
                              </select>
                            </label>
                          {/if}
                        {:else}
                          <h3>アーカイブ（milestone archive）</h3>
                          <p class="hint">
                            マイルストーンのファイルを archive/milestones/ へ移します。参照するタスクは
                            書き換わりません。
                          </p>
                        {/if}

                        <!-- 実行前に書き換え対象集合を示す (doc-10 §6, doc-9 §4.2.2/§4.2.3): what the
                             user decides from has to be what the check protects. -->
                        <div class="targets">
                          <h4>書き換え対象（doc-9 §4.2.2）</h4>
                          <ul class="paths">
                            <li>{milestone.sourcePath}</li>
                          </ul>
                          {#if targets.fanOut}
                            <p class="meta">
                              参照するタスク {targets.tasks.length} 件も併せて書き換わります（参照追随書き換え）。
                            </p>
                            {#if targets.tasks.length > 0}
                              <ul class="paths">
                                {#each targets.tasks as view (view.task.sourcePath)}
                                  <li>{view.task.id ?? view.task.sourcePath}</li>
                                {/each}
                              </ul>
                            {/if}
                          {:else}
                            <p class="meta">参照するタスクは書き換わりません。</p>
                          {/if}
                        </div>

                        <div class="actions">
                          <button
                            type="button"
                            disabled={opIssue?.state !== "ready"}
                            title={opIssue === null ? "" : why(opIssue)}
                            onclick={() =>
                              runMilestoneOp(
                                milestone,
                                open === "rename"
                                  ? "マイルストーンを改称しました。"
                                  : open === "remove"
                                    ? "マイルストーンを削除しました。"
                                    : "マイルストーンをアーカイブしました。",
                              )}
                          >
                            {open === "rename"
                              ? "改称を発行"
                              : open === "remove"
                                ? "削除を発行"
                                : "アーカイブを発行"}
                          </button>
                          <button type="button" onclick={closeMilestoneOp}>やめる</button>
                          {#if opIssue?.state === "blocked"}
                            <span class="reason">{opIssue.reason}</span>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}

            <div class="sub-panel">
              <h3>マイルストーンを作成（milestone add）</h3>
              <label class="field">
                <span class="label">名称（必須）</span>
                <input
                  type="text"
                  value={milestoneInput.name}
                  oninput={(event) => (milestoneInput.name = event.currentTarget.value)}
                />
              </label>
              <label class="field">
                <span class="label">説明（作成時のみ設定できます）</span>
                <input
                  type="text"
                  value={milestoneInput.description}
                  oninput={(event) => (milestoneInput.description = event.currentTarget.value)}
                />
              </label>
              <div class="actions">
                <button
                  type="button"
                  disabled={milestoneIssue.state !== "ready"}
                  title={why(milestoneIssue)}
                  onclick={addMilestone}
                >
                  マイルストーンを作成
                </button>
                {#if milestoneIssue.state === "blocked"}
                  <span class="reason">{milestoneIssue.reason}</span>
                {/if}
              </div>
            </div>
          {/if}

          {@render withheld(
            "現時点で提供しない操作（マイルストーン）",
            WITHHELD_MILESTONE_OPERATIONS,
          )}
        </section>
      {:else}
        <!-- 新規タスク区画 (doc-10 §7) -->
        <section>
          <h2>新規タスク</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            <label class="field">
              <span class="label">title（必須）</span>
              <input
                type="text"
                value={taskInput.title}
                oninput={(event) => (taskInput.title = event.currentTarget.value)}
              />
            </label>

            <div class="field">
              <span class="label">description</span>
              <Editor
                label="description"
                value={taskInput.description}
                rows={5}
                onchange={(value) => (taskInput.description = value)}
                onsave={createTask}
              />
            </div>

            <div class="row">
              <label class="field">
                <span class="label">status</span>
                <select
                  value={taskInput.status}
                  onchange={(event) => (taskInput.status = event.currentTarget.value)}
                >
                  <!-- 未指定 stays selectable throughout: leaving `--status` off is what makes
                       `default_status` apply, and that is a different request from setting one. -->
                  <option value="">—（config.yml の既定 status に任せる）</option>
                  <!-- 選択肢は宣言済みの原文 status に限る (doc-10 §7): `-s` takes only what
                       `config.yml` declares, and an undeclared value is refused with exit code 1.
                       Canonical column names are deliberately not listed. -->
                  {#each project.config.statuses as status (status)}
                    <option value={status}>{status}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span class="label">priority</span>
                <select
                  value={taskInput.priority}
                  onchange={(event) => (taskInput.priority = event.currentTarget.value)}
                >
                  <option value="">—（未設定）</option>
                  {#each PRIORITIES as priority (priority)}
                    <option value={priority}>{priority}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span class="label">milestone</span>
                <select
                  value={taskInput.milestone}
                  onchange={(event) => (taskInput.milestone = event.currentTarget.value)}
                >
                  <option value="">—（未設定）</option>
                  {#each project.milestones as milestone (milestone.id)}
                    <option value={milestone.id}>{milestone.id} {milestone.title}</option>
                  {/each}
                </select>
              </label>
            </div>

            <div class="field">
              <span class="label">通常ラベル</span>
              {@render listEditor(
                taskInput.labels,
                (next) => (taskInput.labels = next),
                newLabel,
                (value) => (newLabel = value),
                "追加するラベル",
              )}
              <p class="hint">
                Type（kind ラベル）はここでは扱いません。`task create --labels` は 1 個のカンマ区切り値
                を取るため、「,」を含むラベルは発行しません。
              </p>
            </div>

            <div class="field">
              <span class="label">Acceptance Criteria</span>
              {@render listEditor(
                taskInput.acceptanceCriteria,
                (next) => (taskInput.acceptanceCriteria = next),
                newCriterion,
                (value) => (newCriterion = value),
                "追加する Acceptance Criterion",
              )}
            </div>

            <div class="actions">
              <button
                type="button"
                disabled={taskIssue.state !== "ready"}
                aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
                title={why(taskIssue)}
                onclick={createTask}
              >
                タスクを作成（task create）
              </button>
              {#if taskIssue.state === "blocked"}
                <span class="reason">{taskIssue.reason}</span>
              {/if}
            </div>
            <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4): the same chord, answered in the description
                 欄. It reads「作成」here because what a 編集部品's chord confirms is its form's own 発行 —
                 which is why the 割り当て一覧 words that row for both. -->
            <p class="hint">
              description 欄では {shortcutHint("saveEditSession", MAC_KEYBOARD)} でも作成を発行できます。
            </p>
          {/if}

          <!-- The omissions are stated as a product judgment (doc-10 §7), never as「CLI に無い」—
               v1.47.1's `task create` does accept these (measured), so that would be false. -->
          <div class="scope">
            <h3>この区画が欄を出さない項目</h3>
            <p>{TASK_CREATE_SCOPE_NOTE}</p>
            <ul>
              {#each TASK_CREATE_OMITTED_FIELDS as field (field.label)}
                <li>
                  <span class="label">{field.label}</span>
                  <code>{field.flag}</code>
                  <p>{field.reason}</p>
                  <p class="after">作成後: {field.after}</p>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    font-size: 0.78rem;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--line);
    background: var(--inset);
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }

  .name {
    font-size: 0.95rem;
    font-weight: 600;
  }

  // 副次 (doc-11 §2.1): the theme's own colour, not an opacity over `--fg`.
  .slug,
  .counts {
    color: var(--muted);
    font-size: 0.72rem;
  }

  .unreadable-count {
    color: var(--mark-unreadable);
  }

  .exits {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sections {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.2rem;
    width: 9rem;
    padding: 0.6rem 0.4rem;
    border-right: 1px solid var(--line);

    button {
      text-align: left;

      &.current {
        border-color: var(--info);
        background: color-mix(in srgb, var(--info) 14%, transparent);
      }
    }
  }

  .panel {
    flex: 1;
    min-width: 0;
    padding: 0.6rem 0.75rem 1.5rem;
    overflow-y: auto;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.88rem;
  }

  h3 {
    margin: 0 0 0.35rem;
    font-size: 0.78rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.55rem;
    min-width: 12rem;
  }

  .label {
    font-size: 0.72rem;
    opacity: 0.85;
  }

  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.55rem;
    font-size: 0.75rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;

    .field {
      flex: 1;
    }
  }

  .row-inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }

  .value-line {
    margin: 0;
  }

  input[type="text"],
  select {
    padding: 0.25rem 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--inset);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
  }

  .row-inline input[type="text"] {
    flex: 1;
    min-width: 0;
  }

  button {
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
    // 無効化提示 lives in one place in app.scss (doc-11 §5); a `:disabled` rule here would outrank it.

    &.mini {
      padding: 0 0.3rem;
      font-size: 0.68rem;
    }

    &.primary {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  .aliases {
    margin: 0 0 0.6rem;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    legend {
      font-size: 0.72rem;
      opacity: 0.8;
    }
  }

  /* 参照するタスクの扱い (doc-10 §6): the same framed group the alias table uses, so a required
     choice reads as one field rather than three loose radios. */
  .handling {
    margin: 0 0 0.6rem;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    legend {
      font-size: 0.72rem;
      opacity: 0.8;
    }

    .check {
      margin-bottom: 0.25rem;
    }
  }

  /* 書き換え対象集合 (doc-9 §4.2.2) shown before the operation is issued. */
  .targets {
    margin: 0 0 0.55rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);

    h4 {
      margin: 0 0 0.25rem;
      font-size: 0.72rem;
      opacity: 0.85;
    }
  }

  .paths {
    margin: 0 0 0.25rem;
    padding-left: 1rem;
    font-size: 0.72rem;
    word-break: break-all;
  }

  .alias-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.2rem;

    input[type="text"] {
      width: 12rem;
    }
  }

  // How one alias row takes effect (doc-10 §4.2). Only the one ineffective state takes the 縮退
  // family's colour; the rest stay the colour of a secondary sentence — which is what keeps
  // 宣言集合なし, where the alias works without a declaration behind it, out of that mark.
  .alias-effect {
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-degraded);
    }
  }

  .alias-note {
    margin: 0 0 0.35rem;
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-degraded);
    }
  }

  .submit-preview {
    margin: 0.6rem 0;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
  }

  .submitted {
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem;
      padding: 0.12rem 0;
      font-size: 0.72rem;
    }

    .from {
      color: var(--muted);
    }

    .to {
      font-weight: 600;
    }
  }

  // 危険区画 (doc-10 §4.3): kept apart from the other operations. The confirmation is slug 入力一致,
  // a stricter condition than doc-11 §5's two-press default.
  .danger {
    margin-top: 1rem;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--mark-unreadable) 45%, transparent);
    border-radius: 4px;

    p {
      margin: 0 0 0.4rem;
      font-size: 0.74rem;
    }
  }

  .records {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;

    li {
      padding: 0.3rem 0;
      border-bottom: 1px solid var(--line);
    }
  }

  .record-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;

    .id {
      font-family: ui-monospace, monospace;
      font-size: 0.72rem;
    }

    .meta {
      color: var(--muted);
      font-size: 0.7rem;
    }
  }

  .description {
    margin: 0.2rem 0 0;
    font-size: 0.74rem;
    white-space: pre-wrap;
  }

  .path {
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.68rem;
    word-break: break-all;
  }

  // The 未保存入力 mark (doc-10 §5). Not one of decision-6's 印の族 — nothing is degraded and nothing
  // diverged; the user simply has not sent it yet — so it takes the neutral info hue.
  .unsaved {
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--info) 45%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    color: var(--info);
    font-size: 0.66rem;
  }

  .sub-panel {
    margin-top: 0.6rem;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 5px;
  }

  .list-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      font-size: 0.72rem;
    }
  }

  .add-row {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .hint,
  // 無効化の理由 (doc-11 §5) is a secondary sentence, so `--muted` (doc-11 §2.1). Not an opacity: the
  // reason has to stay readable on every 表示テーマ, and dimming it is the opposite of its purpose.
  .reason,
  .blocked-note {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .neutral {
    margin: 0.2rem 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  // A correctable input problem. decision-6's unreadable hue is deliberately not reused: this is
  // input the user can fix, not a root Atlas failed to read.
  .problem {
    margin: 0.15rem 0;
    color: var(--mark-degraded);
    font-size: 0.72rem;
  }

  // ルート読取不能 (doc-7 §6, decision-6): never drawn the same way as an empty list.
  .unreadable {
    margin: 0.3rem 0;
    color: var(--mark-unreadable);
    font-size: 0.74rem;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.74rem;
  }

  .ok {
    margin: 0.4rem 0;
    color: var(--muted);
    font-size: 0.74rem;
  }

  // 照合不能 is neither a conflict nor a failure (doc-9 §4.2/§5): its own family's colour, so it
  // cannot be read as a 版ずれ (decision-6's「三者を同じ印へ混ぜない」).
  .warn,
  .undetectable,
  .withheld,
  .scope {
    margin: 0.4rem 0;
    padding: 0.35rem 0.45rem;
    border-left: 3px solid;
    font-size: 0.74rem;
  }

  .warn {
    border-left-color: var(--info);
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .undetectable,
  .withheld {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }

  // 提供しない操作区画 and 出さない項目 are laid out alike: "there is no unpressable button here" and
  // "this was decided against" are only told apart when the presentation matches. The colours differ,
  // though — the first belongs to the 照合不能 / CLI-constraint family, the second is Atlas's own
  // product judgment and stays neutral.
  .scope {
    border-left-color: var(--line-strong);
    background: var(--inset);
  }

  .withheld,
  .scope {
    margin-top: 0.9rem;

    ul {
      margin: 0;
      padding-left: 1rem;
    }

    li {
      margin-bottom: 0.45rem;
    }

    code {
      font-size: 0.7rem;
    }

    p {
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.7rem;
    }

    .label {
      margin-right: 0.3rem;
      font-weight: 600;
      opacity: 1;
    }
  }

  code {
    font-size: 0.95em;
  }
</style>
