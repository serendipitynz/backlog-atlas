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
  import { tick, untrack } from "svelte";
  import Editor from "./Editor.svelte";
  import Modal from "./Modal.svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import {
    fileInconsistencyReasons,
    inconsistencyLabel,
    unmappedFileReason,
  } from "../lib/mark";
  import { PRIORITIES, type DiscardAnswers } from "../lib/edit";
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
    TASK_CREATE_LATER_FIELDS,
    TASK_CREATE_NOTE,
    buildDocCreate,
    buildDocUpdate,
    buildMilestoneAdd,
    buildMilestoneArchive,
    buildMilestoneDescribe,
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
    omitsSentence,
    type IssueAvailability,
    type IssueOutcome,
    type IssuePlan,
    type MilestoneAddInput,
    type MilestoneRemoveInput,
    type MilestoneRenameInput,
    type TaskCreateInput,
  } from "../lib/manage";
  import {
    ALIAS_EFFECT_NOTES,
    DETAIL_SECTIONS,
    displayPath,
    LEDGER_WRITE_IN_FLIGHT_REASON,
    LIST_COLUMN_WIDTH_REM,
    OVERVIEW_READ_ONLY_NOTE,
    SECTION_NAV_WIDTH_REM,
    SLUG_IMMUTABLE_NOTE,
    UNREGISTER_SCOPE_NOTE,
    gitRemoteDisagreement,
    gitRemoteLine,
    movesRoot,
    overviewSave,
    redetectControl,
    rootMoveNote,
    submittedAttributes,
    unregisterBlocked,
    type DetailSection,
  } from "../lib/project-detail";
  // 行長上限 (doc-8 §2.1, TASK-113). Borrowed rather than restated: the number is one measurement,
  // and a second `48` here would let the two drift while both docs still call it 行長上限.
  import { PROSE_MAX_WIDTH_REM } from "../lib/placement";
  import { createGitRemoteReader } from "../lib/git-remote-read";
  import type {
    CliReadiness,
    Document,
    GitRemoteRead,
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
    /**
     * Read the entry's remote 現在値 (doc-10 §4.1). Never rejects — a failed read is a
     * `GitRemoteRead` state of its own, because what the line has to say differs between「remote が
     * 無い」and「読めなかった」(decision-6).
     */
    onreadGitRemote: (slug: string) => Promise<GitRemoteRead>;
    onremove: (slug: string) => Promise<LedgerActionResult>;
    /** Issue one 更新操作 (doc-5 §3, doc-9 §4). The re-read belongs to the shell. */
    onissue: (slug: string, action: UpdateOperation[]) => Promise<IssueOutcome>;
    /** True while this screen holds 未保存入力 — what makes leaving it ask first. */
    ondirty: (dirty: boolean) => void;
    /**
     * True while this screen has a 被せ層 up — its 作成モーダル (doc-10 §1).
     *
     * The shell has to know, for two reasons that are both doc-7 §2.1's 被せ層 は 1 枚だけ: it answers
     * the screen-wide chords on `window`, and a chord that opened the 設定モーダル over this one would
     * put two layers up; and its own メニュー is in the header above this screen, so it has to come
     * down. Reported rather than raised by the shell because the layer belongs to this screen — the
     * control it must hand focus back to on close is the 作成の入口, which only exists here.
     */
    onoverlay: (open: boolean) => void;
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
    onreadGitRemote,
    onremove,
    onissue,
    ondirty,
    onoverlay,
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
  const SAVE_BLOCKED_ID = "overview-save-blocked";
  const UNREGISTER_BLOCKED_ID = "overview-unregister-blocked";
  const REDETECT_BLOCKED_ID = "overview-redetect-blocked";

  /**
   * What the 注記の入口 is called, and what the 注記モーダル it raises is announced as (doc-10 §7).
   *
   * One string for both. The figure on the button has no word of its own (doc-11 §2.4), so its
   * `aria-label` has to name what pressing it gets you — and that is the layer, whose `role="dialog"`
   * is then announced by the same name. Two strings here would let the promise and the thing drift.
   */
  const TASK_NOTE_LABEL = "作成後に追加できる項目";

  let saveControl = $derived(
    overviewSave({
      readOnly: ledgerReadOnly,
      busy: ledgerBusy || issuing,
      hasProblems: editIssues.length > 0,
      hasChanges: updateRequest !== null,
    }),
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
    if (saveControl.state !== "ready" || request === null) return;
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
      if (movesRoot(request)) {
        // A completed move closes **every** open 編集セッション (doc-10 §4.1, which says so without
        // qualification). This screen is keyed by slug alone and a move keeps the slug, so nothing
        // else would close them. A surviving session would let this root's input be sent to the
        // other one by id — and with the same id present there, the 更新前競合検出 passes against
        // the new root's own read, so the write lands whole.
        docSession = null;
        docSelection = null;
        newTag = "";
        pendingDocument = null;
        // The マイルストーン編集セッション goes with it (PR #74 1R [P1]). Until TASK-121 this 区画
        // had no session for §4.1 to rule on, which is why only the 文書 one was closed here; the
        // ids collide even more readily than document ids do (m-1, m-2, …), and 説明を保存 issues
        // by id alone. The selection goes too: with the session closed, a selection resolved against
        // the old root's read has nothing left to be about.
        milestoneEditing = false;
        milestoneSelection = null;
        closeMilestoneOp();
        milestoneDescriptionDraft = null;
        pendingMilestone = null;
        // status and milestone name the old root's ID space (doc-3 §5.3), so they do not travel
        // either. Both are selections rather than typed text, so dropping them costs no input.
        taskInput.status = "";
        taskInput.milestone = "";
        overviewNotice =
          `${result.slug} を移動しました。開いていた文書・マイルストーンの編集セッションは、` +
          "旧ルートの読み取りに基づくため閉じました。";
        return;
      }
      overviewNotice = `${result.slug} の台帳エントリを更新しました。`;
    } finally {
      ledgerSaving = false;
    }
  }

  // --- 概要区画: remote 現在値と再検出 (doc-10 §4.1) ---------------------------------------------

  /**
   * remote 現在値 (doc-10 §4.1). `null` until the read lands: 未取得 is not 不在 (decision-6), and
   * `gitRemoteLine` is what keeps the two apart on screen.
   */
  let gitRemote = $state<GitRemoteRead | null>(null);

  /**
   * Every read goes through this, so only the newest one reaches the line — including the one
   * 再検出する starts, which is about the same entry as the effect's and would otherwise be
   * indistinguishable from it (`git-remote-read.ts` carries the reasoning and the ordering test).
   */
  const remoteReader = createGitRemoteReader({
    read: (slug) => onreadGitRemote(slug),
    show: (read) => (gitRemote = read),
  });

  $effect(() => {
    // The root is a dependency, not context: `ledger_update` can move it under the same slug
    // (doc-3 §4.3), and this value describes the root — so a move has to re-read. Which answer wins
    // is the reader's business, not this effect's.
    void entry.project_root;
    void remoteReader.load(entry.slug);
  });

  let remoteLine = $derived(gitRemoteLine(gitRemote));
  let remoteDisagreement = $derived(gitRemoteDisagreement(entry, gitRemote));
  /** True only while *this* control's own write-then-read is in flight (doc-10 §4.1). */
  let redetecting = $state(false);
  let redetect = $derived(
    redetectControl({
      readOnly: ledgerReadOnly,
      busy: ledgerBusy || issuing,
      running: redetecting,
    }),
  );

  /**
   * Re-detect the Git remote and record the result (doc-10 §4.1). Issues on press rather than riding
   * on the save: what it writes is the ledger's own judgement of the root, not a value the user typed,
   * so there is nothing for a form to hold between the press and the write.
   *
   * `ledgerSaving` is raised for the same reason `save` raises it — this is a ledger write, and every
   * 区画's 発行 waits for one — but the roots cannot move here, so no session is closed afterwards.
   */
  async function redetectGitRemote(): Promise<void> {
    if (redetect.state !== "ready") return;
    entryReport = null;
    overviewNotice = null;
    redetecting = true;
    ledgerSaving = true;
    try {
      const result = await onupdate({ slug: entry.slug, redetect_git_remote: true });
      if (result.state === "refused") {
        entryReport = result.report;
        return;
      }
      // Read again rather than reasoning from the new entry: the recorded boolean is what the write
      // returned, and the line shows the address — only a second read can produce it. Through the
      // reader, so this answer supersedes any read still in flight instead of racing it. `refresh`
      // rather than `load`: this entry's address is still true until the new answer lands, and
      // blanking it made the field flash through 未取得 (2026-08-08 の目視).
      await remoteReader.refresh(entry.slug);
      overviewNotice = `${result.slug} の Git remote を再検出しました。`;
    } finally {
      redetecting = false;
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

  /**
   * 選択 (doc-10 §5): which document the 文書ペイン holds, as an id. Held apart from `docSession`
   * since TASK-116 — a selection opens 閲覧 and no 編集セッション, so the two states now stand
   * independently and the card's emphasis and its 編集中 chip say different things.
   */
  let docSelection = $state<string | null>(null);
  /**
   * The selected document as the **current read** holds it (doc-10 §5). Derived rather than stored,
   * so 閲覧 and the 表示パス follow a reload instead of showing a document that has since changed —
   * and so an external change that removes it drops the selection (the `$effect` below).
   */
  let selectedDocument = $derived(
    docSelection === null
      ? null
      : (project?.documents.find((candidate) => candidate.id === docSelection) ?? null),
  );

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
  /** The 文書ペイン's scroll container, for the reset below. */
  let docPane = $state<HTMLDivElement | undefined>(undefined);

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
    // compare the next edit against a version that no longer exists. The selection stays, so the
    // pane lands on 閲覧 of what was just written (doc-10 §5).
    await discardEditor();
    if (diverged.length > 0) {
      message = {
        tone: "warn",
        text:
          `更新は適用されましたが、再読込した内容が送信した内容と一致しません（${diverged.join("・")}）。` +
          "照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。この間に入った更新が" +
          "上書きで失われた場合、その内容は表示も復元もできません。",
      };
    }
  }

  /**
   * Select one document (doc-10 §5), asking first when an open editor's input would be lost. The
   * selection opens 閲覧, never a 編集セッション — that is what TASK-116 changed, and it is why a
   * user who is only reading is never asked about unsaved input.
   */
  function selectDocument(document: Document): void {
    // Already the selected one: re-pressing must not restart anything. While its editor is open this
    // would otherwise drop the input without asking; while only 閲覧 is open there is nothing to do.
    if (docSelection === document.id) return;
    if (docEditorDirty) {
      pendingDocument = { document };
      return;
    }
    void openDocument(document);
  }

  /** 選択が成立する: the pane swaps to 閲覧 of this document. Any open editor goes with it. */
  async function openDocument(document: Document): Promise<void> {
    docSelection = document.id;
    docSession = null;
    newTag = "";
    message = null;
    await resetDocPane();
  }

  /** 編集への切替 (doc-10 §5): the one place a 文書の編集セッション opens. */
  async function startDocEdit(): Promise<void> {
    const document = selectedDocument;
    if (document === null || issuing) return;
    docSession = startDocSession(document);
    newTag = "";
    await resetDocPane();
  }

  /** 編集を閉じる: back to 閲覧 of the same document, not to the 作成フォーム (doc-10 §5). */
  function closeEditor(): void {
    if (docEditorDirty) {
      pendingDocument = { document: null };
      return;
    }
    void discardEditor();
  }

  async function discardEditor(): Promise<void> {
    docSession = null;
    newTag = "";
    await resetDocPane();
  }

  /**
   * The 文書ペイン is a persistent scroller and only its content swaps: left at its old scrollTop,
   * whatever just opened can sit above the viewport and the press looks like it did nothing
   * (review [P2]). Reset once the swap has rendered — never the 文書一覧, whose kept position is the
   * point of the split scrollers (doc-10 §5).
   */
  async function resetDocPane(): Promise<void> {
    await tick();
    if (docPane !== undefined) docPane.scrollTop = 0;
  }

  function leaveConfirmed(): void {
    const target = pendingDocument;
    pendingDocument = null;
    if (target === null) return;
    if (target.document === null) {
      void discardEditor();
      return;
    }
    void openDocument(target.document);
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
   * 選択中のマイルストーン (doc-10 §6): which card the マイルストーン一覧 holds selected. One at a
   * time. Since TASK-121 a selection opens 閲覧 and no 編集セッション, exactly as the 文書区画's
   * does — which is why the pane it drives is now the マイルストーンペイン rather than the 操作ペイン.
   */
  let milestoneSelection = $state<string | null>(null);
  /**
   * Whether the 編集セッション (doc-8 §1) is open on the selected milestone (doc-10 §6, TASK-121).
   *
   * A flag rather than a session object holding a baseline, which is what the 文書区画 keeps. The
   * difference is deliberate: the 説明 box is an *override* of the current read (see the draft
   * below), so there is no pre-edit snapshot to compare against and nothing for a baseline to hold.
   * 改称・削除・アーカイブ read their operand from the current read for the same reason.
   */
  let milestoneEditing = $state(false);
  /** The マイルストーンペイン's scroll container, for the resets doc-10 §6 counts. */
  let milestonePane = $state<HTMLDivElement | undefined>(undefined);
  /**
   * Which operation is open on the selected milestone (doc-10 §6). Two open at once would leave the
   * 書き換え対象集合 shown beside one operation while another is the one about to be issued.
   */
  let milestoneOp = $state<"rename" | "remove" | "archive" | null>(null);
  let renameInput = $state<MilestoneRenameInput>({ ...EMPTY_MILESTONE_RENAME });
  let removeInput = $state<MilestoneRemoveInput>({ ...EMPTY_MILESTONE_REMOVE });
  /**
   * Input typed into the open operation and not yet issued — what the 破棄前確認 protects
   * (doc-10 §6). `reassignTo` needs no clause of its own: the field only appears once 参照タスクの
   * 扱い is `reassign`, so `handling !== null` already stands wherever a 付け替え先 could be set.
   */
  let milestoneOpDirty = $derived(renameInput.to.trim() !== "" || removeInput.handling !== null);
  /**
   * The 説明 box's content **while the user is editing it**, and `null` while they are not
   * (doc-10 §6, decision-21).
   *
   * An override rather than a copy, so that an untouched box always shows the current read. Seeding
   * a plain string on selection would make an external change to the description read as 未保存入力
   * — the box would differ from the milestone through no act of the user's, and 破棄前確認 would
   * stand over text nobody typed. That is the shape of PR #65 round 1's [P2], reached from the
   * other side.
   */
  let milestoneDescriptionDraft = $state<string | null>(null);
  /** Where the user asked to go while 未保存入力 was held — **not applied** until they answer. */
  let pendingMilestone = $state<{ milestone: Milestone | null } | null>(null);

  /**
   * Select one milestone's card (doc-10 §6), asking first when the open 編集セッション's input would
   * be lost. The selection opens 閲覧, never the session — that is what TASK-121 changed here, and
   * it is why a user who is only reading is never asked about unsaved input.
   */
  function selectMilestone(milestone: Milestone): void {
    // Already the selected one: re-pressing must not restart anything. While its editor is open this
    // would otherwise drop the input without asking; while only 閲覧 is open there is nothing to do.
    if (milestoneSelection === milestone.id) return;
    if (milestoneDirty) {
      pendingMilestone = { milestone };
      return;
    }
    void openMilestone(milestone);
  }

  /** 選択が成立する: the pane swaps to 閲覧 of this milestone. Any open editor goes with it. */
  async function openMilestone(milestone: Milestone): Promise<void> {
    milestoneSelection = milestone.id;
    // Each selection starts from 閲覧 with no operation and empty input, so a name or a 付け替え先
    // typed for one milestone cannot be issued against the next. Dropping the 説明 draft is the same
    // rule: left standing it would be a description written for one milestone, shown over another's.
    milestoneEditing = false;
    closeMilestoneOp();
    milestoneDescriptionDraft = null;
    message = null;
    await resetMilestonePane();
  }

  /** 編集への切替 (doc-10 §6): the one place a マイルストーンの編集セッション opens. */
  async function startMilestoneEdit(): Promise<void> {
    if (selectedMilestone === null || issuing) return;
    milestoneEditing = true;
    await resetMilestonePane();
  }

  /** 編集を閉じる: back to 閲覧 of the same milestone (doc-10 §6). One of the 破棄前確認's two paths. */
  function closeMilestoneEdit(): void {
    if (milestoneDirty) {
      pendingMilestone = { milestone: null };
      return;
    }
    void discardMilestoneEdit();
  }

  /**
   * End the 編集セッション and land on 閲覧. Clearing the input is the point: `milestoneDirty` counts
   * these values, so a close that left them behind would keep asking before leaving the screen — to
   * protect input the user can no longer see (PR #65 1R [P2], reached from the session's side).
   */
  async function discardMilestoneEdit(): Promise<void> {
    milestoneEditing = false;
    closeMilestoneOp();
    milestoneDescriptionDraft = null;
    await resetMilestonePane();
  }

  /**
   * The マイルストーンペイン is a persistent scroller and only its content swaps (doc-10 §6, the same
   * rule and the same four occasions as the 文書ペイン's). Never the 一覧, whose kept position is the
   * point of the split scrollers.
   */
  async function resetMilestonePane(): Promise<void> {
    await tick();
    if (milestonePane !== undefined) milestonePane.scrollTop = 0;
  }

  function milestoneLeaveConfirmed(): void {
    const target = pendingMilestone;
    pendingMilestone = null;
    if (target === null) return;
    if (target.milestone === null) {
      void discardMilestoneEdit();
      return;
    }
    void openMilestone(target.milestone);
  }

  function openMilestoneOp(kind: "rename" | "remove" | "archive"): void {
    // Pressing the open operation again closes it, which is a cancel like any other.
    if (milestoneOp === kind) {
      closeMilestoneOp();
      return;
    }
    milestoneOp = kind;
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
    if (milestoneSelection !== milestone.id || milestoneOp === null) return null;
    switch (milestoneOp) {
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
    // The whole 編集セッション closes, not just this operation (doc-10 §6, TASK-121) — for the reason
    // §5 gives about 文書更新: after a success the state the input was formed against no longer
    // exists. 改称 keeps the id (v1.48.0 does not change it, doc-9 §4.2.1) so the selection stands
    // and the pane lands on 閲覧; 削除・アーカイブ take the milestone out of the re-read, which the
    // effect below turns into a dropped selection, on every read rather than only here.
    if (outcome?.state === "applied") await discardMilestoneEdit();
  }

  /**
   * マイルストーン説明の更新 (doc-10 §6, decision-21) — the one action this screen issues that is not
   * a CLI call. The plan is built from the box's current text, so what is issued is what is on
   * screen.
   *
   * The 編集セッション is closed on success and kept otherwise, which is the same rule
   * `runMilestoneOp` follows: after a success the re-read holds the new description and 閲覧 states
   * it, while after a failure or a 更新前競合 the user still has what they typed.
   */
  async function saveMilestoneDescription(milestone: Milestone): Promise<void> {
    const plan = buildMilestoneDescribe(milestone, milestoneDescriptionText);
    if (plan.state !== "ready") return;
    if (availability(plan).state !== "ready") return;
    const outcome = await issue(plan.action, `${milestone.id} の説明を更新しました`);
    if (outcome?.state === "applied") await discardMilestoneEdit();
  }

  /**
   * 写せなかったファイル for one 区画 (doc-10 §1, decision-24). Filtered by kind here rather than sent
   * as three lists, because the record already carries its kind and one list is what keeps the three
   * 区画 from disagreeing about what counts as a failure.
   *
   * `decisions` are read and recorded but have no 区画 to draw them in; TASK-118 adds one (doc-10 §9).
   */
  let unmappedDocuments = $derived(
    (project?.unmappedFiles ?? []).filter((file) => file.kind === "document"),
  );
  let unmappedMilestones = $derived(
    (project?.unmappedFiles ?? []).filter((file) => file.kind === "milestone"),
  );

  /**
   * 理由行 for whichever document / milestone the pane currently holds (doc-10 §5/§6). Derived once
   * here rather than at each use, so the ⚠️ on the card and the lines in the pane can never be
   * built from two different readings of the same file (decision-22 「導出は 1 回」).
   *
   * Taken from the **current read**, not from `docSession.baseline`. The baseline is the read the
   * *input* was made against and it deliberately survives a reload (that is how 未保存入力 stays
   * comparable), but the card beside it draws its ⚠️ from the current read — so reading the reasons
   * off the baseline would let a document broken while its editor is open show a ⚠️ with no lines
   * under it, which is the state doc-11 §2.4 admits the mark only on condition of avoiding.
   * `selectedMilestone` already resolves against the current read for the same reason (PR #71 [P2]).
   */
  let openDocReasons = $derived(
    selectedDocument === null ? [] : fileInconsistencyReasons(selectedDocument.health, "文書"),
  );

  /**
   * 表示パス (doc-10 §5) for the selected document, derived once here and read by both places that
   * state it — the 閲覧ヘッダ and the line above the update form's path field. Taken from the current
   * read for the same reason the 理由行 are.
   */
  let selectedDocPath = $derived(
    selectedDocument === null ? null : displayPath(selectedDocument.sourcePath, entry.project_root),
  );

  /**
   * A selection that no longer resolves is dropped, the same rule the マイルストーン一覧 follows
   * (PR #65 round 1 [P2]): 閲覧 has nothing left to show, and a reappearing id would otherwise
   * restore it against a different read.
   *
   * An open 編集セッション is exempt. Its `baseline` is the read the 未保存入力 was made against and
   * deliberately survives a reload (`DocSession`, doc-8 §6.4's rule), so the editor and its input
   * are still on screen — the failure that rule guards against is input standing *nowhere visible*,
   * which is not this. Closing the editor lands here with the selection unresolved and drops it.
   *
   * Guarded on `project !== null` so a read in flight, which resolves nothing, does not clear a
   * selection the user still has.
   *
   * The pane is reset here too, because this is now one of the four occasions doc-10 §5 counts —
   * since TASK-121 removed 選択を解除 it is the *only* way back to the 非選択時 pane, and the swap
   * it makes is the same one that press used to make.
   */
  $effect(() => {
    if (project === null || docSelection === null || selectedDocument !== null) return;
    if (docSession !== null) return;
    docSelection = null;
    void resetDocPane();
  });

  /**
   * The selected milestone as the current read holds it (doc-10 §6). Derived rather than stored, so
   * 閲覧 follows a reload instead of showing a milestone that has since changed — and so an external
   * change that removes it drops the selection rather than leaving operations pointed at a milestone
   * that is no longer there.
   */
  let selectedMilestone = $derived(
    milestoneSelection === null
      ? null
      : (project?.milestones.find((candidate) => candidate.id === milestoneSelection) ?? null),
  );

  let openMilestoneReasons = $derived(
    selectedMilestone === null
      ? []
      : fileInconsistencyReasons(selectedMilestone.health, "マイルストーン"),
  );

  /** What the 説明 box shows: the draft while one is being typed, the current read otherwise. */
  let milestoneDescriptionText = $derived(
    milestoneDescriptionDraft ?? selectedMilestone?.description ?? "",
  );
  /**
   * 説明 typed but not yet issued. Part of the 未保存入力 doc-10 §6 protects, and unlike 改称・削除 it
   * stands without any operation being open — the box is on screen for as long as the 編集セッション
   * is, which is why the 破棄前確認 below cannot key off `milestoneOp`.
   */
  let milestoneDescriptionDirty = $derived(
    milestoneDescriptionDraft !== null &&
      milestoneDescriptionDraft !== (selectedMilestone?.description ?? ""),
  );
  /** Every kind of 未保存入力 the マイルストーン区画 holds (doc-10 §6). */
  let milestoneDirty = $derived(milestoneOpDirty || milestoneDescriptionDirty);

  /**
   * A selection that no longer resolves takes its 編集セッション with it (PR #65 round 1 [P2]).
   * Dropping the selection alone is not enough: `milestoneOp` and its input would stay standing, and
   * `milestoneDirty` would then hold both 破棄前確認 — this 区画's and the shell's — over input that
   * is nowhere on screen, which is the failure `closeMilestoneOp` records. Leaving it would also let
   * a reappearing id restore the old form with the old input aimed at the new read. The 説明 draft
   * goes with them for the same reason, and it is the one that could otherwise be re-issued against
   * a *different* milestone if the id came back.
   *
   * Unlike the 文書区画's, an open 編集セッション is **not** exempt here. That exemption exists
   * because a `DocSession` carries the baseline its 未保存入力 was made against and so survives a
   * reload on purpose (doc-8 §6.4); this session carries no baseline — the 説明 box overrides the
   * current read and the operations read their operand from it — so once the milestone is gone,
   * there is nothing left for the input to be about.
   *
   * The pane is reset for the reason the 文書区画's effect gives: since TASK-121 removed
   * 選択を解除, this is one of the ways the pane comes to show something else (doc-10 §6).
   *
   * Guarded on `project !== null` so a read in flight, which resolves nothing, does not clear input
   * the user is still typing.
   */
  $effect(() => {
    if (project === null || milestoneSelection === null || selectedMilestone !== null) return;
    milestoneSelection = null;
    milestoneEditing = false;
    closeMilestoneOp();
    milestoneDescriptionDraft = null;
    // The 破棄前確認 goes with the input it protects (PR #74 1R [P3]). Raised while the session was
    // open and left standing, the band would ask about 未保存入力 that this very block just dropped,
    // over a pane now showing 非選択時 — and 入力に戻る would have nothing to return to. The 文書区画
    // cannot reach this because its effect exempts an open session; this one deliberately does not.
    pendingMilestone = null;
    void resetMilestonePane();
  });

  // --- 作成モーダル (doc-10 §1, TASK-117) ---------------------------------------------------------
  //
  // The 作成フォーム of both 一覧列-holding 区画 used to be a state of the column on the right — the one
  // shown while nothing was selected. That made adding a document something the user could only reach
  // by first giving up whatever they were reading, and it put a form beside an open editor's own
  // actions. Both now open from the 一覧見出し行's 作成の入口 into this layer instead.
  //
  // The layer is doc-7 §2.1's 被せ層, which that section stopped defining by enumeration in the same
  // task: what makes something one is the form (focus held inside, Escape closes, focus goes back),
  // not which header opened it. `Modal.svelte` is that form, and it draws the × and the 破棄前確認 —
  // this file supplies only what goes inside and when the layer may go.

  /**
   * Which 被せ層 this screen has up, or `null` while none is.
   *
   * One value rather than a flag per layer, for the reason doc-7 §2.1 gives: 被せ層 は 1 枚だけ. Flags
   * could disagree; this cannot. 区画切替 shows one 区画 at a time in any case, so there is no state
   * where two would be wanted.
   *
   * **TASK-123 added the third member**: doc-10 §7's 注記モーダル, which the 新規タスク区画 raises from
   * its 注記の入口. It joins this value rather than getting a flag of its own precisely because the
   * rule is about layers and not about 作成.
   */
  let layerOpen = $state<"document" | "milestone" | "task-note" | null>(null);

  /**
   * The 作成モーダル among them, or `null`. Everything below that is about a 作成 — the 下書き, the
   * 破棄前確認, what the ✕ has to ask — reads this rather than [`layerOpen`], so the 注記モーダル
   * (which holds no input) cannot fall into any of it.
   */
  let createOpen = $derived<"document" | "milestone" | null>(
    layerOpen === "document" || layerOpen === "milestone" ? layerOpen : null,
  );
  /**
   * Whether the open layer's close request is standing and waiting for an answer (doc-11 §7).
   *
   * Not the same as「閉じられない」: this means the request *was* issued, so the × stays pressable and
   * pressing it again just asks again. Issuance in flight is the other state, and it is read from
   * `issuing` below — §7 requires that one to be answered first.
   */
  let createCloseAsked = $state(false);

  /** 未保存入力 held by the 作成モーダル that is up right now. */
  let createDirty = $derived(
    createOpen === "document"
      ? hasDocCreateInput(docInput)
      : createOpen === "milestone"
        ? hasMilestoneAddInput(milestoneInput)
        : false,
  );

  /** The layer's accessible name — what the 入口 that opened it is called (doc-11 §7). */
  let layerLabel = $derived(
    layerOpen === "milestone"
      ? "新規マイルストーン"
      : layerOpen === "task-note"
        ? TASK_NOTE_LABEL
        : "新規文書",
  );

  let createConfirm = $derived<DiscardAnswers | null>(
    createCloseAsked
      ? { onproceed: closeCreate, onkeep: () => (createCloseAsked = false) }
      : null,
  );

  // 被せ層 は 1 枚だけ, and the shell answers the screen-wide chords (see `onoverlay`). Reported from
  // an effect rather than from the two functions below so that one place decides what is reported,
  // whatever set `createOpen`.
  $effect(() => {
    onoverlay(layerOpen !== null);
    // Retracted on the way out — a `$effect` without this does not run at destroy, so unmounting
    // with a layer up would leave the shell holding `true` for a screen that no longer exists. Its
    // `screen` guard silences that on the swimlane but not on the *next* プロジェクト詳細画面, which
    // would then answer no chord at all until some 作成モーダル had been opened and closed again.
    // The same shape `Modal.svelte` uses to give the opener its focus back.
    //
    // It also runs before each re-run, so opening costs one extra `false` first. That changes
    // nothing: both calls land in the same synchronous flush, and `modalOpen` is only read after it.
    return () => onoverlay(false);
  });

  function openCreate(which: "document" | "milestone"): void {
    // An unanswered 破棄前確認 from a 区画's own route lapses under the layer about to cover it
    // (doc-11 §7): the question is drawn by whichever layer is frontmost, so leaving one standing
    // behind would put a question this layer never asked in front of the user, with a 破棄して閉じる
    // that carries out a route in the 区画 underneath. **Nothing is discarded by the lapse** — the
    // request is withdrawn and the 未保存入力 it was about stays exactly where it is.
    pendingDocument = null;
    pendingMilestone = null;
    createCloseAsked = false;
    layerOpen = which;
  }

  /**
   * Raise the 注記モーダル (doc-10 §7) from the 注記の入口 beside the 新規タスク heading.
   *
   * The same lapse the 作成モーダル causes (doc-11 §7): an unanswered 破棄前確認 standing in a 区画
   * underneath is withdrawn, because the question is drawn by whichever layer is frontmost. Nothing is
   * discarded — the 未保存入力 it was about stays where it is.
   *
   * There is no close *request* to wire: the layer holds no 下書き, so `Modal`'s own close acts, and
   * the way out is this function's inverse rather than [`requestCreateClose`].
   */
  function openTaskNote(): void {
    pendingDocument = null;
    pendingMilestone = null;
    createCloseAsked = false;
    layerOpen = "task-note";
  }

  /**
   * The one place every way out of the 作成モーダル meets (doc-11 §7): the × `Modal.svelte` draws and
   * the Escape it answers.
   *
   * 発行中は破棄前確認より前に断る (§7): Escape reaches this without passing the ×'s own withholding,
   * so the circumstance is read here rather than only on that control — otherwise the key would offer
   * 破棄して閉じる for input that is at this moment being written to a management file.
   */
  function requestCreateClose(): void {
    if (issuing) return;
    if (createDirty) {
      createCloseAsked = true;
      return;
    }
    closeCreate();
  }

  /**
   * What `Modal`'s single exit reaches, whichever layer is up (doc-11 §7: 出口はすべて 1 つの閉じる
   * 要求へ集まる).
   *
   * The 注記モーダル leaves immediately. Both things that could stand in the way of a 作成モーダル —
   * a 発行 in flight and a 下書き to ask about — are about input this layer does not have, so routing
   * it through [`requestCreateClose`] would turn a reader away from an exit for a reason that cannot
   * apply to what they are reading.
   */
  function requestLayerClose(): void {
    if (layerOpen === "task-note") {
      layerOpen = null;
      return;
    }
    requestCreateClose();
  }

  /**
   * Close the layer, dropping what its form held. The dropping is the point — it is what the
   * 破棄前確認 above is a question about, and it is why the 作成の入口 always opens on an empty form
   * rather than on the leftovers of a session the user walked away from.
   */
  function closeCreate(): void {
    if (createOpen === "document") docInput = { ...EMPTY_DOC_CREATE };
    else if (createOpen === "milestone") milestoneInput = { ...EMPTY_MILESTONE_ADD };
    createCloseAsked = false;
    layerOpen = null;
  }

  // --- 未保存入力 (doc-8 §6.3) -------------------------------------------------------------------

  /**
   * The 未保存入力 this screen holds. A 区画切替 loses none of it — this one component holds every
   * 区画's state, and the switch is a display change (doc-10 §1) — but leaving the screen loses all
   * of it, which is why the shell's 破棄前確認 has to see all four. The three add-rows count too:
   * text typed but not yet committed with 追加 is the easiest thing to lose and the least visible.
   *
   * **The two 作成フォーム are not counted here since TASK-117**, and their absence is not an
   * oversight: their input lives in the 作成モーダル (doc-10 §1), which covers every way off this
   * screen while it is up and drops what it holds through its own 破棄前確認 (doc-11 §7) on the way
   * out. So `docInput` and `milestoneInput` are empty at every moment this screen can be left, and a
   * clause for them here would be one that can never be true. `createDirty` is where they are read.
   */
  let dirty = $derived(
    updateRequest !== null ||
      unregisterInput.trim() !== "" ||
      docEditorDirty ||
      hasTaskCreateInput(taskInput) ||
      // An open 改称・削除, or an edited 説明, carries input of its own — a name or a description
      // typed but not yet issued is exactly the kind of thing leaving the screen loses silently
      // (doc-8 §6.3). The same value drives the 区画内の破棄前確認 (doc-10 §6), so the two cannot
      // disagree about what counts as unsaved.
      milestoneDirty ||
      newLabel.trim() !== "" ||
      newCriterion.trim() !== "",
  );

  $effect(() => {
    ondirty(dirty);
  });

  // --- 表示の小道具 -------------------------------------------------------------------------------

  /** Where a 一覧列's cards send `aria-describedby` while issuance is held (doc-11 §5). One id per
   * 区画, because the two lists are never on screen together but their sentences differ. */
  const DOC_EDIT_BLOCKED_ID = "detail-doc-edit-blocked";
  const DOC_UPDATE_BLOCKED_ID = "detail-doc-update-blocked";
  const DESCRIBE_BLOCKED_ID = "detail-milestone-describe-blocked";
  /** The same for the 閲覧ヘッダ's 編集: a different sentence, since that one is about editing. */
  const DOC_EDIT_HELD_ID = "detail-doc-edit-held";
  const MILESTONE_SELECT_BLOCKED_ID = "detail-milestone-select-blocked";
  /** The same for the マイルストーン閲覧ヘッダ's 編集 (doc-10 §6, TASK-121). */
  const MILESTONE_EDIT_HELD_ID = "detail-milestone-edit-held";

  function why(availability: { state: string; reason?: string }): string {
    return availability.state === "blocked" ? (availability.reason ?? "") : "";
  }

  /**
   * The `title` of a 発行 control that has a chord (doc-7 §2.1 の併記). When the control is pressable
   * the chord is what the title has to carry — since 2026-08-10 the 併記 is discharged by the control
   * itself and the キーボード操作一覧, with no visible line beside the row (目視). When it is withheld,
   * the reason takes the title's place: naming a chord for a 発行 that cannot be issued advertises an
   * operation the form is refusing (doc-5 §5).
   */
  function issueTitle(availability: { state: string; reason?: string }, label: string): string {
    return availability.state === "blocked"
      ? (availability.reason ?? "")
      : `${label} (${shortcutHint("saveEditSession", MAC_KEYBOARD)})`;
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
        "（台帳エントリ自体は読めています）。",
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

{#snippet listHead(count: string, entry: string, hint: string, onopen: () => void)}
  <!-- 一覧見出し行 (doc-10 §1, TASK-117). One snippet for both 一覧列 because §1 makes the row a
       property of the column rather than of either 区画 — written twice, the two would start to
       differ in exactly the way §1 rules out. What each 区画 supplies is its own wording.

       The 作成の入口 is never withheld: it issues nothing, and the reason a 作成 cannot be issued
       right now (CLI 縮退, a write in flight) is printed beside the 発行 control inside the layer,
       which is where it can actually be read. -->
  <div class="list-head">
    <h2>{count}</h2>
    <!-- 可視の文言を持つ控えの中のアイコン (doc-11 §2.4): the wording is the button's name, so the
         figure takes no `aria-label` of its own and adds nothing to the accessibility tree. -->
    <button type="button" class="create-entry" title={hint} onclick={onopen}>
      <Icon name="plus" />
      {entry}
    </button>
  </div>
{/snippet}

<!-- The column widths come from `project-detail.ts` so the number a doc cites and the number laid
     out are the same one (TASK-113's pattern). Both size content boxes (TASK-115). 行長上限 comes
     from `placement.ts` for the same reason, and is the very same 48rem doc-8 §2.1 puts on タスク詳細's
     body blocks — 閲覧's 本文 is prose in a column that takes whatever width is left, which is the
     situation that number was measured for (TASK-113). -->
<div
  class="detail"
  style="--section-nav-width: {SECTION_NAV_WIDTH_REM}rem; --list-column-width: {LIST_COLUMN_WIDTH_REM}rem; --prose-max-width: {PROSE_MAX_WIDTH_REM}rem"
>
  <!-- ヘッダ (doc-10 §3): identity and the round trip only. Nothing here writes. The パンくず
       (doc-12 §8) puts 「← スイムレーン」 at the top left — where a way back is looked for — with
       the project name as the current place; the return that also lands (doc-10 §2) stays a
       separate control at the right, since it does more than go back. -->
  <header class="head">
    <nav class="breadcrumb" aria-label="現在地">
      <button type="button" onclick={onback}>← スイムレーン</button>
      <span class="separator" aria-hidden="true">/</span>
      <span class="name">{project?.config.projectName ?? entry.slug}</span>
    </nav>
    <span class="slug">{entry.slug}</span>
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
    <button type="button" class="to-lane" onclick={ontoLane}>このプロジェクトのレーンへ</button>
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

    <!-- 一覧列を持つ 2 区画 (doc-10 §1/§5/§6) では、パネルはスクローラを 2 列へ譲る。 -->
    <div class="panel" class:split={section === "documents" || section === "milestones"}>
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

          <div class="field">
            <span class="label">Git remote</span>
            <p class="value-line remote" class:setting={remoteLine.kind === "setting"} class:failure={remoteLine.kind === "failure"}>
              {#if remoteLine.address}
                <code>{remoteLine.text}</code>
                <span class="remote-name">（{remoteLine.name}）</span>
              {:else}
                {remoteLine.text}
              {/if}
            </p>
            {#if remoteDisagreement !== null}
              <p class="hint">{remoteDisagreement}</p>
            {/if}
            <span class="row-inline">
              <button
                type="button"
                disabled={redetect.state !== "ready"}
                aria-describedby={redetect.state === "withheld" ? REDETECT_BLOCKED_ID : undefined}
                onclick={redetectGitRemote}
              >
                {redetect.label}
              </button>
            </span>
            {#if redetect.state === "withheld"}
              <!-- doc-11 §5: a withheld control carries its reason in view, not on hover. The
                   running state has no line of its own — its label is what says so. -->
              <p class="problem" id={REDETECT_BLOCKED_ID}>{redetect.reason}</p>
            {/if}
          </div>

          <fieldset class="aliases">
            <legend>status 別名表</legend>
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
                <!-- 値の対応を示す記号 (doc-11 §2.4). 操作に属さないアイコン: not inside a pressable
                     control, and what it shows — 原文 status を正準列へ対応づける — is what the 区画's
                     own hint sentence above says in words, which is the condition §2.4 puts on this
                     type. So it carries no `aria-label`, no `title` and no focus. -->
                <Icon name="arrow-right" />
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
                <!-- アイコンのみのボタン (doc-11 §2.4). 原文 is the wording「行を外す」; doc-10 §4.2
                     records why this row takes a figure instead. The name has to name *which* row —
                     with the glyph gone there is no visible name left, and the rows are otherwise
                     alike. A row whose 原文 status is still empty has nothing to be called but its
                     place in the table. -->
                <button
                  type="button"
                  class="drop"
                  aria-label={row.key.trim() === ""
                    ? `${index + 1} 行目を削除`
                    : `${row.key} の行を削除`}
                  title="この行を削除"
                  disabled={ledgerReadOnly}
                  onclick={() => removeAliasRow(index)}
                >
                  <Icon name="x" />
                </button>
                {#if row.key.trim() !== ""}
                  {#if note !== null}
                    <!-- Whether the alias actually applies (doc-10 §4.2). Only the one ineffective
                         state takes the 不整合 family's colour. -->
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
            <!-- 状態文 (doc-11 §8): what this 区画 has to show when the list is empty. §8 puts 状態文
                 outside its own scope, so the 一掃 that dropped this line as a 状態の言い換え
                 (`8aa4be9`) was applying the wrong rule — and doc-10 §4.1 names「変更なし」as the
                 word to use. It is also the 保存's 保留理由 stated by the 区画 itself (§8 の licence ①),
                 which is why no second sentence is printed under the control. -->
            {#if submitted.length === 0}
              <p class="neutral">変更なし（送る属性はありません）。</p>
            {:else}
              <ul class="submitted">
                {#each submitted as attribute (attribute.attribute)}
                  <!-- 値の対応を示す記号 (doc-11 §2.4 の 操作に属さないアイコン). That type requires the
                       区画's own words to say what the figure says, and here nothing did: the two
                       values were told apart by the arrow alone, which is `aria-hidden`, so a reader
                       heard「project_root 旧パス 新パス」. The words are 視覚的にのみ隠す (doc-11 §5 の
                       2 つ目の形) — the figure already says it to the eye. -->
                  <li>
                    <code>{attribute.attribute}</code>
                    <span class="unseen">変更前</span>
                    <span class="from">{attribute.from}</span>
                    <Icon name="arrow-right" />
                    <span class="unseen">変更後</span>
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
              aria-disabled={saveControl.state !== "ready"}
              aria-describedby={saveControl.state === "ready"
                ? undefined
                : ledgerReadOnly
                  ? OVERVIEW_BLOCKED_ID
                  : SAVE_BLOCKED_ID}
              title={saveControl.state === "withheld"
                ? saveControl.reason
                : "上に並べた属性を台帳へ書きます"}
              onclick={save}>保存</button
            >
          </div>
          {#if !ledgerReadOnly}
            <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because `aria-describedby`
                 points at it: hidden when the 区画 already states it (doc-11 §8), visible otherwise.
                 On a read-only ledger the note above is the reason instead, so nothing is placed
                 here at all. -->
            <p
              id={SAVE_BLOCKED_ID}
              class={saveControl.state === "withheld" && !omitsSentence(saveControl.reason)
                ? "blocked-note"
                : "unseen"}
            >
              {saveControl.state === "withheld" ? saveControl.reason : ""}
            </p>
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
        <!-- 文書区画 (doc-10 §5): 文書一覧 (16rem) beside the 文書ペイン, the screen's own second and
             third column after the 区画ナビ. Each column scrolls on its own — a deliberate departure
             from design 07's single scroller, recorded in doc-10 §5 — so choosing a document swaps
             the pane while the list keeps its scroll position. The 破棄前確認 stays above the
             columns: it must be visible whatever either column has scrolled to. -->
        <section class="split-section">
          {#if unreadableNote !== null}
            <h2>文書</h2>
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <h2>文書</h2>
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

            <div class="columns">
              <div class="list-column">
                <!-- 一覧見出し行 (doc-10 §1, TASK-117): the count and the 作成の入口 on one line, at
                     the head of the column and outside its scroller — so both stay readable however
                     far the cards are scrolled. The count is the cards' own (目視反映), which is why
                     the 写せなかったファイル below are not in it (decision-24). -->
                {@render listHead(
                  `文書 ${project.documents.length} 件`,
                  "新規文書",
                  "文書の作成を開きます",
                  () => openCreate("document"),
                )}
                {#if project.documents.length === 0}
                  <p class="neutral">文書はありません。</p>
                {:else}
                  {#if issuingReason !== null}
                    <!-- Every card is held by the same one thing (doc-11 §5): the reason is written
                         once above the list and each card is bound to it. They stay `aria-disabled`
                         so they keep taking focus, which is what makes the binding reachable
                         without a pointer. -->
                    <p class="reason" id={DOC_EDIT_BLOCKED_ID}>
                      {issuingReason}。完了するまで別の文書は開けません。
                    </p>
                  {/if}
                  <ul class="cards">
                    {#each project.documents as document (document.id)}
                      {@const current = docSelection === document.id}
                      {@const editing = docSession?.baseline.id === document.id}
                      {@const reasons = fileInconsistencyReasons(document.health, "文書")}
                      <li>
                        <!-- カード (doc-10 §5): the whole area is the selection — no separate 編集
                             button, and the current card is marked (目視反映: which document is
                             being read must be readable from the list). No path here: the 表示パス
                             moved to the 文書ペイン (doc-10 §5's recorded departure). Since TASK-116
                             the emphasis says「読んでいる」and the chip below says「編集している」:
                             a selection opens 閲覧 and no 編集セッション. -->
                        <button
                          type="button"
                          class="card"
                          class:current
                          aria-current={current ? "true" : undefined}
                          aria-disabled={issuing}
                          aria-describedby={issuing ? DOC_EDIT_BLOCKED_ID : undefined}
                          title={issuingReason ?? "この文書を開きます"}
                          onclick={() => !issuing && selectDocument(document)}
                        >
                          <span class="card-head">
                            <span class="id">{document.id}</span>
                            <span class="meta">{document.type ?? "type 未設定"}</span>
                            {#if editing}
                              <span class="editing">編集中</span>
                            {/if}
                            {#if editing && docEditorDirty}
                              <!-- 未保存入力のある文書には印を付ける (doc-10 §5). Only one 編集セッション
                                   exists at a time, so only one card can carry it; it is shown on the
                                   list side so that「まだ送っていない」stays readable even when the
                                   editor has scrolled out of view. -->
                              <span class="unsaved">未保存</span>
                            {/if}
                            {#if reasons.length > 0}
                              <!-- 不整合印 (decision-22, widened to 管理ファイル 1 件 by decision-24):
                                   one ⚠️, no family name and no 由来名. `role="img"` on the wrapper
                                   because `Icon.svelte` is always `aria-hidden` (doc-11 §2.4). The
                                   lines themselves are read in the 閲覧ヘッダ, which is what the
                                   selection opens — the ⚠️ is allowed only where そこが用意されて
                                   いる (doc-11 §2.4, decision-24 as TASK-116 revised it). -->
                              <span
                                class="inconsistent"
                                role="img"
                                aria-label={inconsistencyLabel(reasons)}
                                title={inconsistencyLabel(reasons)}
                              >
                                <Icon name="triangle-alert" />
                              </span>
                            {/if}
                          </span>
                          <span class="card-title">{document.title}</span>
                          {#if document.tags.length > 0}
                            <span class="meta">tags: {document.tags.join(", ")}</span>
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                {#if unmappedDocuments.length > 0}
                  <!-- 写せなかったファイルの一覧 (doc-10 §1, decision-24): not cards — these have no
                       id, so there is nothing to select or load into the pane. The heading above
                       still counts only the cards; this region states its own count. -->
                  <div class="unmapped">
                    <h3>写せなかったファイル {unmappedDocuments.length} 件</h3>
                    <ul>
                      {#each unmappedDocuments as file (file.sourcePath)}
                        <li>
                          <code>{displayPath(file.sourcePath, entry.project_root)}</code>
                          <span class="reason-line">{unmappedFileReason(file)}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>

              <!-- 文書ペイン (doc-10 §5): three states in one column — the update form alone while a
                   session is open, 閲覧 while a document is merely selected, and a line saying what
                   the column is for while nothing is. Renamed from 編集ペイン by TASK-116: selection
                   opens 閲覧, so editing is one state of three. -->
              <div class="pane" bind:this={docPane}>
                {#if docSession !== null}
                  {@const session = docSession}
                  <div class="sub-panel">
                    <h3>{session.baseline.id} を更新</h3>

                    <label class="field">
                      <span class="label">title（必須）</span>
                      <input
                        type="text"
                        value={session.draft.title}
                        oninput={(event) => setDoc("title", event.currentTarget.value)}
                      />
                    </label>

                    <div class="field">
                      <span class="label">本文</span>
                      <Editor
                        label="本文"
                        value={session.draft.content}
                        rows={14}
                        onchange={(value) => setDoc("content", value)}
                        onsave={updateDoc}
                      />
                      <p class="hint">
                        保存すると、ここにある全文で本文を置き換えます。
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
                        <!-- 表示パス (doc-10 §5), repeated here from the 閲覧ヘッダ: this field is a
                             move request holding no current value, and「空欄なら変更しません」only
                             reads against where the file is now. One derivation for both places
                             (`selectedDocPath`, from the current read) — the baseline would put a
                             second reading of the same file on screen beside the card's ⚠️. -->
                        <!-- `null` is a state the design reaches: the `$effect` above exempts an
                             open session from the drop rule, so a document broken or removed
                             externally leaves the editor standing with nothing to resolve. Printing
                             the null would put「現在の所在:」over an empty path, which asserts a
                             location rather than admitting there is none (PR #72 1R [P2]). -->
                        {#if selectedDocPath === null}
                          <span class="path">
                            現在の所在は読み取れません（この文書は最新の読み取りに見当たりません）。
                          </span>
                        {:else}
                          <span class="path">現在の所在: <code>{selectedDocPath}</code></span>
                        {/if}
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

                  </div>
                  <!-- 発行の行 (doc-11 §11): this 編集セッション is the only 発行 this column holds, so
                       the row pins to the bottom of the column and is read wherever the form has been
                       scrolled to. **Outside the framed 更新フォーム above**, the way the 設定モーダル's
                       下部操作行 sits outside its body: a row inside that frame is held off the column's
                       edges by the frame's own border and padding, and cannot reach the edge it pins
                       to (目視 2026-08-10). The reason the 発行 is withheld goes in with it. -->
                  <div class="issue">
                    <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because
                         `aria-describedby` points at it: hidden when the 区画 already states it
                         (doc-11 §8), visible otherwise. -->
                    <span
                      id={DOC_UPDATE_BLOCKED_ID}
                      class={docUpdateIssue.state === "blocked" &&
                      omitsSentence(docUpdateIssue.reason)
                        ? "unseen"
                        : "reason"}
                    >
                      {docUpdateIssue.state === "blocked" ? docUpdateIssue.reason : ""}
                    </span>
                    <!-- 併記 は控えの `title` と `aria-keyshortcuts`、そしてキーボード操作一覧が担う
                         (doc-7 §2.1)。可視の 1 行はここに置かない。 -->
                    <div class="actions">
                      <!-- 取りやめ → 発行 (doc-11 §11): one order everywhere, since the row is centred. -->
                      <button type="button" onclick={closeEditor}>編集を止める</button>
                      <button
                        type="button"
                        aria-disabled={docUpdateIssue.state !== "ready"}
                        aria-describedby={docUpdateIssue.state === "blocked" ? DOC_UPDATE_BLOCKED_ID : undefined}
                        aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
                        title={issueTitle(docUpdateIssue, "文書を更新")}
                        onclick={() => docUpdateIssue.state === "ready" && updateDoc()}
                      >
                        文書を更新
                      </button>
                    </div>
                  </div>
                {:else if selectedDocument !== null}
                  {@const document = selectedDocument}
                  <!-- 閲覧 (doc-10 §5, TASK-116): what the selection opens. No input of any kind, so
                       nothing here can hold 未保存入力 and no 破棄前確認 can arise from reading. -->
                  <div class="sub-panel">
                    <!-- 閲覧ヘッダ: title and 編集 on one line, then ID・type・tags・表示パス, then
                         the 理由行 (選択を解除 left this row with TASK-121). The heading is the
                         document's own title rather
                         than a sentence about it — the pane is showing that document, and a title is
                         what names it. -->
                    <div class="view-head">
                      <h3>{document.title}</h3>
                      <!-- Held while a 発行 is in flight, and the reason is reachable without a
                           pointer: `aria-disabled` keeps the button focusable and points at the
                           sentence below, which is route (b) of doc-11 §5. `disabled` would need an
                           always-visible 補助文 instead, and a `title` alone is neither. -->
                      <button
                        type="button"
                        aria-disabled={issuing}
                        aria-describedby={issuing ? DOC_EDIT_HELD_ID : undefined}
                        title={issuingReason ?? "この文書の編集を開きます"}
                        onclick={() => !issuing && startDocEdit()}
                      >
                        編集
                      </button>
                      <!-- No 選択を解除 here since TASK-121 (doc-10 §5). The reason it was placed —
                           the create form's 未保存入力 sitting off screen while still counting
                           toward the screen's 破棄前確認 — died with TASK-117's 作成モーダル, and
                           the reason written in its place (always being able to return to「何も
                           選んでいない」) was judged insufficient at 目視. Nothing is lost by not
                           returning: 閲覧 shows every value the card carries and holds no input. -->
                    </div>
                    {#if issuingReason !== null}
                      <p class="reason" id={DOC_EDIT_HELD_ID}>
                        {issuingReason}。完了するまでこの文書の編集は開けません。
                      </p>
                    {/if}
                    <p class="meta-line">
                      <span class="id">{document.id}</span>
                      <span>{document.type ?? "type 未設定"}</span>
                      <span>
                        {document.tags.length > 0
                          ? `tags: ${document.tags.join(", ")}`
                          : "tags なし"}
                      </span>
                    </p>
                    <!-- 表示パス (doc-10 §5): which file this is, project-relative. -->
                    <p class="path"><code>{selectedDocPath}</code></p>
                    {#if openDocReasons.length > 0}
                      <!-- 理由行 (decision-22, doc-10 §5 as TASK-116 revised it): the place doc-11
                           §2.4 requires the ⚠️'s full reason to be readable without hovering. It
                           sits here, not in the update form, because 選択 is what opens this and the
                           guarantee is about the place the selection reaches. No 区画 of its own —
                           one line per reason is the whole of it. -->
                      <!-- Keyed by index, not by the string: two reasons can read identically
                           (two same-named unclosed SECTION pairs, two stray `:END`s), and a
                           duplicate key throws in production Svelte (PR #71 [P2]). -->
                      <ul class="reason-lines">
                        {#each openDocReasons as reason, at (at)}
                          <li>{reason}</li>
                        {/each}
                      </ul>
                    {/if}
                    <!-- 本文: the string as read. Nothing formats Markdown in this build, so a
                         rendered look would be a claim the screen cannot keep — the same treatment
                         タスク詳細 gives Description. -->
                    {#if (document.body ?? "") === ""}
                      <p class="neutral">本文はありません。</p>
                    {:else}
                      <pre class="read-body">{document.body}</pre>
                    {/if}
                  </div>
                {:else}
                  <!-- 非選択時の文書ペイン (doc-10 §5). The 作成フォーム left this column for the
                       作成モーダル (TASK-117) and the 提供しない操作区画 was dropped altogether
                       (TASK-123), so what remains is the line saying what the column is for. It is
                       what keeps the column from reading as an empty box the user has broken.
                       doc-11 §6's `—` is not this: that mark stands for a value that is absent, and
                       what is absent here is a selection. -->
                  <p class="neutral">文書が選択されていません</p>
                {/if}
              </div>
            </div>
          {/if}
        </section>
      {:else if section === "milestones"}
        <!-- マイルストーン区画 (doc-10 §6): マイルストーン一覧 — this 区画's 一覧列 (§1) — beside the
             マイルストーンペイン, the same three columns the 文書区画 has. Each column scrolls on its
             own and the 破棄前確認 stays above both, for the reasons doc-10 §5 records and §6
             repeats. -->
        <section class="split-section">
          {#if unreadableNote !== null}
            <h2>マイルストーン</h2>
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <h2>マイルストーン</h2>
            <p class="neutral">読み込み中…</p>
          {:else}
            {#if pendingMilestone !== null}
              <!-- 破棄前確認 (doc-10 §6): the open 編集セッション holds 未保存入力 and the requested
                   move would drop it. The move itself has not been applied. The two paths are 別の
                   マイルストーンを選ぶ and 編集を閉じる since TASK-121 — the second used to be
                   選択を解除する, and the count of two is unchanged by the swap. -->
              <div class="confirm">
                <span>
                  {#if pendingMilestone.milestone === null}
                    マイルストーンの編集に未保存入力があります。編集を閉じると破棄されます。
                  {:else}
                    マイルストーンの編集に未保存入力があります。{pendingMilestone.milestone.id} を開くと破棄されます。
                  {/if}
                </span>
                <button type="button" onclick={milestoneLeaveConfirmed}>破棄して続行</button>
                <button type="button" onclick={() => (pendingMilestone = null)}>入力に戻る</button>
              </div>
            {/if}

            <div class="columns">
              <div class="list-column">
                <!-- 一覧見出し行 (doc-10 §1, TASK-117) — the same row as the 文書一覧's, from the
                     same snippet. §1 puts it on the 一覧列 rather than on either 区画, so the two
                     cannot come to differ in how a new object is added. -->
                {@render listHead(
                  `マイルストーン ${project.milestones.length} 件`,
                  "新規マイルストーン",
                  "マイルストーンの作成を開きます",
                  () => openCreate("milestone"),
                )}
                {#if project.milestones.length === 0}
                  <p class="neutral">マイルストーンはありません。</p>
                {:else}
                  {#if issuingReason !== null}
                    <!-- Every card is held by the same one thing (doc-11 §5): written once above the
                         list and each card bound to it. They stay `aria-disabled` so they keep
                         taking focus, which is what makes the binding reachable without a pointer. -->
                    <p class="reason" id={MILESTONE_SELECT_BLOCKED_ID}>
                      {issuingReason}。完了するまで別のマイルストーンは開けません。
                    </p>
                  {/if}
                  <ul class="cards">
                    {#each project.milestones as milestone (milestone.id)}
                      {@const held = project.tasks.filter(
                        (view) => view.task.milestone === milestone.id,
                      ).length}
                      {@const current = milestoneSelection === milestone.id}
                      {@const editing = current && milestoneEditing}
                      {@const reasons = fileInconsistencyReasons(milestone.health, "マイルストーン")}
                      <li>
                        <!-- カード (doc-10 §6): id・title・所属タスク件数. No 説明 — the 一覧列 is
                             16rem and the description is stated in the pane instead (§6's recorded
                             departure). Since TASK-121 the emphasis says「読んでいる」and the chip
                             below says「編集している」, the same split the 文書カード makes: a
                             selection opens 閲覧 and no 編集セッション. -->
                        <button
                          type="button"
                          class="card"
                          class:current
                          aria-current={current ? "true" : undefined}
                          aria-disabled={issuing}
                          aria-describedby={issuing ? MILESTONE_SELECT_BLOCKED_ID : undefined}
                          title={issuingReason ?? "このマイルストーンを開きます"}
                          onclick={() => !issuing && selectMilestone(milestone)}
                        >
                          <span class="card-head">
                            <span class="id">{milestone.id}</span>
                            <span class="meta">所属タスク {held} 件</span>
                            {#if editing}
                              <span class="editing">編集中</span>
                            {/if}
                            {#if editing && milestoneDirty}
                              <!-- 未保存入力の印 (doc-10 §6): only the card with the open 編集
                                   セッション can carry it, and it is shown here so「まだ発行して
                                   いない」stays readable when the マイルストーンペイン has scrolled
                                   out of view. -->
                              <span class="unsaved">未保存</span>
                            {/if}
                            {#if reasons.length > 0}
                              <!-- 不整合印 — same figure and same rule as the 文書カード (doc-10 §6
                                   defers to §5 here rather than deciding it again). -->
                              <span
                                class="inconsistent"
                                role="img"
                                aria-label={inconsistencyLabel(reasons)}
                                title={inconsistencyLabel(reasons)}
                              >
                                <Icon name="triangle-alert" />
                              </span>
                            {/if}
                          </span>
                          <span class="card-title">{milestone.title}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                {#if unmappedMilestones.length > 0}
                  <!-- 写せなかったファイルの一覧 — same form as the 文書区画's (doc-10 §1/§6). -->
                  <div class="unmapped">
                    <h3>写せなかったファイル {unmappedMilestones.length} 件</h3>
                    <ul>
                      {#each unmappedMilestones as file (file.sourcePath)}
                        <li>
                          <code>{displayPath(file.sourcePath, entry.project_root)}</code>
                          <span class="reason-line">{unmappedFileReason(file)}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>

              <!-- マイルストーンペイン (doc-10 §6, renamed from 操作ペイン by TASK-121): 非選択時 の
                   1 行, then 閲覧 while a milestone is merely selected, then the 編集セッション
                   alone once 編集 is pressed. The same three states — and the same order of
                   branches — as the 文書ペイン's, since selection now opens the same thing in both.
                   The name follows §5's rule that a column is named for what it opens. -->
              <div class="pane" bind:this={milestonePane}>
                {#if selectedMilestone !== null && milestoneEditing}
                  {@const milestone = selectedMilestone}
                  {@const plan = milestoneOpPlan(milestone)}
                  {@const open = milestoneOp}
                  {@const opIssue = plan === null ? null : availability(plan)}
                  {@const targets = rewriteTargets(milestone, plan)}
                  {@const describeIssue = availability(
                    buildMilestoneDescribe(milestone, milestoneDescriptionText),
                  )}
                  <!-- 編集セッション (doc-8 §1, doc-10 §6): everything that takes input or issues a
                       write is behind 編集への切替, so that 閲覧 keeps the property §5 gave it —
                       holding no input, and therefore never raising a 破棄前確認 from reading. -->
                  <div class="sub-panel">
                    <!-- Which milestone this session is about, in the place the 文書区画's update
                         form states the same thing. The 一覧 says it too (emphasis and 編集中 chip),
                         but the two columns scroll apart — the selected card can be above the
                         viewport while this pane is being typed into, which is the direction §6
                         already argues in for the 未保存 chip. -->
                    <h3>{milestone.id} を編集</h3>
                    <!-- 説明 (doc-10 §6): stated on this column rather than on the card, which is the
                         second of this 区画's departures from design 07 — and editable, which is the
                         third (decision-21). The box is not one of the 改称・削除・アーカイブ
                         operations: it is open for as long as the session is, because the
                         description is what this column states about the milestone and editing it is
                         that statement being corrected. -->
                    <label class="field">
                      <span class="label">説明</span>
                      <textarea
                        rows="4"
                        placeholder="説明なし"
                        value={milestoneDescriptionText}
                        oninput={(event) =>
                          (milestoneDescriptionDraft = event.currentTarget.value)}
                      ></textarea>
                    </label>
                    <!-- Not pinned (doc-11 §11): this column holds 改称・削除・アーカイブ as well, so no
                         one 発行 owns its bottom row. 取りやめ → 発行 all the same. -->
                    <div class="actions">
                      <button type="button" onclick={closeMilestoneEdit}>編集を止める</button>
                      <button
                        type="button"
                        aria-disabled={describeIssue.state !== "ready"}
                        aria-describedby={describeIssue.state === "blocked" ? DESCRIBE_BLOCKED_ID : undefined}
                        title={why(describeIssue)}
                        onclick={() =>
                          describeIssue.state === "ready" && saveMilestoneDescription(milestone)}
                      >
                        説明を保存
                      </button>
                      <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). See the 文書ペイン's copy above. -->
                      <span
                        id={DESCRIBE_BLOCKED_ID}
                        class={describeIssue.state === "blocked" &&
                        omitsSentence(describeIssue.reason)
                          ? "unseen"
                          : "reason"}
                      >
                        {describeIssue.state === "blocked" ? describeIssue.reason : ""}
                      </span>
                    </div>

                    <!-- 改称・削除・アーカイブ (doc-10 §6). doc-9 §4.2 defines the 照合 for all
                         three, which is why Atlas offers them at all (TASK-45).
                         アーカイブ takes no input, but it issues a write, and §6 keeps every issuing
                         operation on this side of 編集への切替 rather than splitting the three. -->
                    <div class="actions">
                      <button
                        type="button"
                        aria-expanded={open === "rename"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp("rename")}
                      >
                        改称
                      </button>
                      <button
                        type="button"
                        aria-expanded={open === "remove"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp("remove")}
                      >
                        削除
                      </button>
                      <button
                        type="button"
                        aria-expanded={open === "archive"}
                        disabled={issuing}
                        title={issuingReason ?? ""}
                        onclick={() => openMilestoneOp("archive")}
                      >
                        アーカイブ
                      </button>
                    </div>

                    {#if open !== null}
                      <div class="sub-panel">
                        {#if open === "rename"}
                          <h3>改称</h3>
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
                            v1.48.0 の改称は id（{milestone.id}）を変えないため、実際に書き換わるのは
                            milestone 値が id 以外のタスクだけです。
                          </p>
                        {:else if open === "remove"}
                          <h3>削除</h3>
                          <p class="hint">{MILESTONE_REMOVE_MOVES_THE_FILE}</p>
                          <fieldset class="handling">
                            <legend>参照するタスクの扱い（必須）</legend>
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
                              <span class="label">付け替え先（必須）</span>
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
                          <h3>アーカイブ</h3>
                          <p class="hint">
                            マイルストーンのファイルを archive/milestones/ へ移します。参照するタスクは
                            書き換わりません。
                          </p>
                        {/if}

                        <!-- 実行前に書き換え対象集合を示す (doc-10 §6, doc-9 §4.2.2/§4.2.3): what the
                             user decides from has to be what the check protects. -->
                        <div class="targets">
                          <h4>書き換え対象</h4>
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
                          <!-- 取りやめ → 発行 (doc-11 §11). Not pinned: see the 説明を保存 row above. -->
                          <button type="button" onclick={closeMilestoneOp}>キャンセル</button>
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
                          {#if opIssue?.state === "blocked" && !omitsSentence(opIssue.reason)}
                            <span class="reason">{opIssue.reason}</span>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </div>
                {:else if selectedMilestone !== null}
                  {@const milestone = selectedMilestone}
                  {@const held = project.tasks.filter(
                    (view) => view.task.milestone === milestone.id,
                  ).length}
                  <!-- 閲覧 (doc-10 §6, TASK-121): what the selection opens. No input of any kind, so
                       nothing here can hold 未保存入力 and no 破棄前確認 can arise from reading —
                       the property §5 attached to this word, kept by using the same word. -->
                  <div class="sub-panel">
                    <!-- 閲覧ヘッダ: title and 編集 on one line, then id・所属タスク件数, then the
                         理由行. The heading is the milestone's own title rather than a sentence
                         about it, for the reason the 文書区画's copy gives. -->
                    <div class="view-head">
                      <h3>{milestone.title}</h3>
                      <!-- Held while a 発行 is in flight, and the reason is reachable without a
                           pointer — route (b) of doc-11 §5, the same treatment the 文書区画's
                           編集 gets. -->
                      <button
                        type="button"
                        aria-disabled={issuing}
                        aria-describedby={issuing ? MILESTONE_EDIT_HELD_ID : undefined}
                        title={issuingReason ?? "このマイルストーンの編集を開きます"}
                        onclick={() => !issuing && startMilestoneEdit()}
                      >
                        編集
                      </button>
                    </div>
                    {#if issuingReason !== null}
                      <p class="reason" id={MILESTONE_EDIT_HELD_ID}>
                        {issuingReason}。完了するまでこのマイルストーンの編集は開けません。
                      </p>
                    {/if}
                    <p class="meta-line">
                      <span class="id">{milestone.id}</span>
                      <span>所属タスク {held} 件</span>
                    </p>
                    {#if openMilestoneReasons.length > 0}
                      <!-- 理由行 (decision-22, doc-10 §6 as TASK-121 revised it): the place doc-11
                           §2.4 requires the ⚠️'s full reason to be readable without hovering. It
                           moved here from the pane's heading when the selection started opening
                           閲覧 — decision-24's rule (under the heading of whatever the selection
                           opens) did not change, only the place it points at. -->
                      <!-- Keyed by index for the reason the 文書区画's copy gives. -->
                      <ul class="reason-lines">
                        {#each openMilestoneReasons as reason, at (at)}
                          <li>{reason}</li>
                        {/each}
                      </ul>
                    {/if}
                    <!-- 説明 (doc-10 §6): the current value, read-only. Same treatment as the
                         文書区画's 本文 — the string as read, with doc-8 §2.1's 48rem line length on
                         it, since this column takes whatever width is left. -->
                    {#if (milestone.description ?? "") === ""}
                      <p class="neutral">説明はありません。</p>
                    {:else}
                      <pre class="read-body">{milestone.description}</pre>
                    {/if}
                  </div>
                {:else}
                  <!-- 非選択時のマイルストーンペイン (doc-10 §6, TASK-117). The same single line the
                       文書ペイン draws in this state: the 作成フォーム went to the 作成モーダル, and
                       what used to differ — this 区画 had no 提供しない操作 to list where the 文書区画
                       had one — stopped differing when TASK-123 dropped that 区画 from both. The
                       column is still drawn — folding it would move the cards' width every time a
                       selection came and went (§5・§6) — and the line says what the column is for.
                       Since TASK-121 this state is reached only by the three occasions §6 lists, not
                       by a press: 選択を解除 is gone. -->
                  <p class="neutral">マイルストーンが選択されていません</p>
                {/if}
              </div>
            </div>
          {/if}
        </section>
      {:else}
        <!-- 新規タスク区画 (doc-10 §7) -->
        <section>
          <!-- 区画見出しの横に 注記の入口 (doc-10 §7, TASK-123). アイコンのみのボタン (doc-11 §2.4):
               the figure carries no word, so the `aria-label` carries the name — the same name the
               layer it raises is announced by, since that is what the reader is being offered.
               Until TASK-123 the five fields sat at the foot of this 区画 at all times, 361px of an
               885px 区画 and the reason the form did not fit its scroller (measured). -->
          <div class="section-head">
            <h2>新規タスク</h2>
            <!-- Only where the form is. What the note answers is「この欄はどこにあるのか」, a
                 question a reader has while filling the form in — beside a 読み込み中 or a
                 ルート読取不能 message there is no form to have it about, and an entry offering
                 advice about one is the noise this task exists to remove. Same placement rule the
                 作成の入口 follows one 区画 over. -->
            {#if unreadableNote === null && project !== null}
              <button
                type="button"
                class="note-entry"
                aria-label={TASK_NOTE_LABEL}
                title={TASK_NOTE_LABEL}
                onclick={openTaskNote}
              >
                <Icon name="circle-question-mark" />
              </button>
            {/if}
          </div>

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
                Type（kind ラベル）はここでは扱いません。ラベルは 1 個のカンマ区切り値として扱われる
                ため、「,」を含むラベルは発行しません。
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

            <!-- 発行の行 (doc-11 §11): the only 発行 this 区画 holds, and the form is long enough to
                 carry it off screen, so it pins to the bottom of the 区画. -->
            <div class="issue">
              {#if taskIssue.state === "blocked" && !omitsSentence(taskIssue.reason)}
                <span class="reason">{taskIssue.reason}</span>
              {/if}
              <!-- 併記 は控えの `aria-keyshortcuts`・`title` とキーボード操作一覧が担う (doc-7 §2.1)。 -->
              <div class="actions">
                <button
                  type="button"
                  disabled={taskIssue.state !== "ready"}
                  aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
                  title={issueTitle(taskIssue, "タスクを作成")}
                  onclick={createTask}
                >
                  タスクを作成
                </button>
              </div>
            </div>
          {/if}

        </section>
      {/if}
    </div>
  </div>
</div>

<!--
  この画面が上げる被せ層 — 作成モーダル (doc-10 §1, TASK-117) と 注記モーダル (doc-10 §7, TASK-123).
  Outside the screen's own boxes because a 被せ層 is not a part of any 区画: `Modal.svelte` draws a
  fixed backdrop over the window, and the layer covers the 上部帯 the same way the header's three do.

  One `Modal` for all three contents rather than one each: 被せ層 は 1 枚だけ (doc-7 §2.1), and
  `layerOpen` already makes that structural. It carries the same three obligations here as anywhere —
  focus held inside, Escape, focus back to the 入口 the layer captured as it mounted.

  `closeBlocked` and `confirmDiscard` are about a 下書き, so both are `null` for the 注記モーダル,
  which has none. On a 作成モーダル `closeBlocked` is `issuingReason`, which stands exactly while
  `issuing` does: doc-11 §7 wants the circumstance held by the thing that wires *both* exits, and here
  that is this file. What the reason guards is a 作成 already sent to a management file — offering
  破棄して閉じる over that would ask the user about input that is at this moment being written.
-->
{#if layerOpen !== null}
  <Modal
    label={layerLabel}
    closeBlocked={createOpen === null ? null : issuingReason}
    confirmDiscard={createConfirm}
    onclose={requestLayerClose}
  >
    {#if createOpen === "document"}
      <div class="modal-form">
        <h2>文書を作成</h2>
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
        <!-- 本文の欄をここに出さないことについては何も述べない (doc-11 §8): 画面が欄を見せていない
             ものについて、なぜ無いかを述べない、が本則である。作成した文書へ本文を入れる先は
             文書ペインの編集セッションで、そこには欄がある。 -->
        <!-- No 下部操作行 (doc-11 §7): 「文書を作成」 writes but does not leave the layer, so there is
             only one way out and nothing for a second wording to tell apart. What the × does with
             what is typed here is said by the 破棄前確認 instead. **The pinned 発行の行 below is not one**
             (doc-11 §11): that row carries a 発行, and a 下部操作行 carries exits. -->
        <div class="issue">
          {#if docCreateIssue.state === "blocked" && !omitsSentence(docCreateIssue.reason)}
            <span class="reason">{docCreateIssue.reason}</span>
          {/if}
          <div class="actions">
            <button
              type="button"
              disabled={docCreateIssue.state !== "ready"}
              title={why(docCreateIssue)}
              onclick={createDoc}
            >
              文書を作成
            </button>
          </div>
        </div>
      </div>
    {:else if layerOpen === "task-note"}
      <!-- 注記モーダル (doc-10 §7). 代替経路の案内 (doc-11 §8) and nothing else: where these are
           added, never why the form has no input for them. No 下部操作行 — the layer holds no
           下書き, so it has no exit that writes and leaves for the ✕ to be told apart from
           (doc-11 §7 の条件). -->
      <div class="modal-form note">
        <h2>{TASK_NOTE_LABEL}</h2>
        <p>{TASK_CREATE_NOTE}</p>
        <ul>
          {#each TASK_CREATE_LATER_FIELDS as field (field)}
            <li>{field}</li>
          {/each}
        </ul>
      </div>
    {:else}
      <div class="modal-form">
        <h2>マイルストーンを作成</h2>
        <label class="field">
          <span class="label">名称（必須）</span>
          <input
            type="text"
            value={milestoneInput.name}
            oninput={(event) => (milestoneInput.name = event.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="label">説明</span>
          <input
            type="text"
            value={milestoneInput.description}
            oninput={(event) => (milestoneInput.description = event.currentTarget.value)}
          />
        </label>
        <!-- 発行の行 (doc-11 §11), as the 文書を作成 layer above. -->
        <div class="issue">
          {#if milestoneIssue.state === "blocked" && !omitsSentence(milestoneIssue.reason)}
            <span class="reason">{milestoneIssue.reason}</span>
          {/if}
          <div class="actions">
            <button
              type="button"
              disabled={milestoneIssue.state !== "ready"}
              title={why(milestoneIssue)}
              onclick={addMilestone}
            >
              マイルストーンを作成
            </button>
          </div>
        </div>
      </div>
    {/if}
  </Modal>
{/if}

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

  .breadcrumb {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }

  // 副次 (doc-11 §2.1): the separator is punctuation between the way back and the current place,
  // not something to read on its own.
  .separator {
    color: var(--faint);
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

  .to-lane {
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
    // 区画ナビ (doc-10 §3): design 07's 12rem, dropped from `project-detail.ts` as a content-box
    // width (TASK-115 — no global box-sizing reset, so the padding sits outside it).
    width: var(--section-nav-width);
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

    // 発行の行 を持つ区画では、この箱の下 padding は行が持つ (上の `.pane` と同じ理由)。
    &:has(> section > .issue) {
      padding-bottom: 0;
    }

    > section > .issue {
      margin-right: -0.75rem;
      margin-left: -0.75rem;
    }

    // 一覧列を持つ区画 (doc-10 §1: 文書 §5 と マイルストーン §6): the panel stops being the scroller
    // and hands its height to the two columns, each scrolling on its own. Its horizontal padding
    // moves into the columns — a focus ring at a scrollport's edge is clipped (TASK-74's実測), so
    // each scroll container carries its own side padding — which leaves the direct children above
    // the columns to carry it themselves.
    &.split {
      display: flex;
      flex-direction: column;
      padding: 0.6rem 0 0;
      overflow: hidden;

      > p {
        margin-right: 0.75rem;
        margin-left: 0.75rem;
      }
    }
  }

  .split-section {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;

    > h2,
    > .confirm,
    > .unreadable,
    > .neutral {
      margin-right: 0.75rem;
      margin-left: 0.75rem;
    }
  }

  .columns {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  // 一覧列 (doc-10 §1): the column that keeps the selection — 文書一覧 (§5) and マイルストーン一覧
  // (§6) are its two instances, styled once because the doc calls them one column type. Width is
  // design 07's 16rem, a content box like the 区画ナビ's. The heading stays out of the scroller
  // (`.cards` is the scroll container) so the count is readable at any scroll position.
  .list-column {
    display: flex;
    flex: none;
    flex-direction: column;
    width: var(--list-column-width);
    padding: 0 0.35rem 0 0.75rem;
    border-right: 1px solid var(--line);
    overflow: hidden;
  }

  /*
   * 一覧見出し行 (doc-10 §1): the count and the 作成の入口 on one line, at the head of the 一覧列 and
   * outside `.cards`'s scroller — which is what keeps both readable however far the cards are
   * scrolled. `flex: none` because this row takes its own height and `.cards` below takes the slack;
   * it is now the row rather than the `h2` that says so, the `h2` having become this row's child
   * instead of the column's.
   */
  .list-head {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;

    h2 {
      flex: 1;
      /*
       * 件数は語の途中で折り返さない。実測 (WebKit, 16rem 列): 「マイルストーン 9 件」 の自然幅は
       * 124.39px で、入口 (125.22px) と 0.4rem の間隔を引いた残りとちょうど同じ — 桁が 1 つ増えた
       * だけで溢れ、折り返すと見出しは「マイルストーン」「99 件」に割れる。**割れた見出しより、
       * 入口が次の行へ下りるほうがよい**ので、`nowrap` で見出しの最小幅をその全長に固定し、
       * `flex-wrap` の側で行を折り返させる。`min-width: 0` を置かないのはそのためで、置くと
       * flex はここを潰して行を 1 本に保ち、割れるのは見出しの側になる。
       */
      white-space: nowrap;
    }
  }

  /*
   * 作成の入口 (doc-10 §1). A 控え with visible wording *and* a figure, which is doc-11 §2.4's
   * 可視の文言を持つ控えの中のアイコン — so the figure is `aria-hidden` and adds no name.
   *
   * `font-size` is what sizes the ＋ (doc-11 §2.4 の 1em), so the figure follows the wording rather
   * than carrying a second size knob of its own.
   */
  .create-entry {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line-strong);
    // カード・ボタン 4px (doc-11 §2.2).
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    white-space: nowrap;
    cursor: pointer;

    // hover は 枠線 --line → --line-strong (doc-11 §2.3); at rest this one is already the stronger
    // line, so the change is the background wash the other 控え use.
    &:hover {
      background: color-mix(in srgb, var(--fg) 8%, transparent);
    }

    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }

  .cards {
    flex: 1;
    min-height: 0;
    margin: 0;
    // The side padding keeps a focused card's ring inside the scrollport (TASK-74's実測).
    padding: 0.15rem 0.25rem 1.5rem 0.15rem;
    overflow-y: auto;
    list-style: none;

    li {
      margin-bottom: 0.35rem;
    }
  }

  // カード (doc-10 §5/§6): the whole area is the selection, and the current one is marked the way
  // the 区画ナビ marks its current entry — one vocabulary for「いま開いているもの」.
  .card {
    display: block;
    width: 100%;
    padding: 0.3rem 0.45rem;
    text-align: left;

    &.current {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 12%, transparent);
    }

    .card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem;
    }

    .id {
      font-family: ui-monospace, monospace;
      font-size: 0.72rem;
    }

    .meta {
      display: block;
      color: var(--muted);
      font-size: 0.68rem;
    }

    .card-head .meta {
      display: inline;
    }

    .card-title {
      display: block;
      margin-top: 0.1rem;
      font-size: 0.75rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  }

  // 編集中 on the current card: the same neutral info hue as 未保存 — being open is not one of
  // decision-6's 印の族 either.
  .editing {
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--info) 45%, transparent);
    border-radius: 3px;
    color: var(--info);
    font-size: 0.66rem;
  }

  // 文書ペイン (doc-10 §5) / マイルストーンペイン (§6): 非選択時 の 1 行, 閲覧 while something is
  // selected, and the 編集セッション once 編集 is pressed. Two names in the doc because they open
  // different objects, one rule here because the column is the same shape — and since TASK-121 the
  // same three states as well. Its first block starts at the columns' top: the pane has no heading
  // of its own, so an inherited margin here reads as a hole (目視反映).
  .pane {
    flex: 1;
    min-width: 0;
    padding: 0 0.75rem 1.5rem 0.6rem;
    overflow-y: auto;

    > :first-child {
      margin-top: 0;
    }

    // 編集セッション中は下端に発行の行が居るので、この列自身の下 padding は要らない — 残すと行が
    // 縁から浮き、スクロールの末尾でそのぶん持ち上がる (目視 2026-08-10)。
    &:has(.issue) {
      padding-bottom: 0;
    }

    // 発行の行 は框の外 — 列の子として直接置いているので、引き出しは要らない。左右は列の padding を
    // 打ち消して縁まで届かせ、内側の余白は行が自分で持つ。
    > .issue {
      margin-right: -0.75rem;
      margin-left: -0.6rem;
    }
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

  // remote 現在値 (doc-10 §4.1). The three families are decision-6's, drawn as GitHistory.svelte
  // draws the same three — 正常な不在 は中立、設定で解消できるものは中間、失敗だけが族の色.
  .remote {
    margin-bottom: 0.35rem;
    // No font-size of its own: it is a `.value-line` like the slug's two fields above, and 実測 put
    // a size here 0.48px off that one (TASK-124). Two value lines in the same list differing for no
    // reason is what TASK-74 measured on two controls in one row.
    overflow-wrap: anywhere;

    &.setting {
      padding: 0.2rem 0.35rem;
      border-left: 2px solid var(--line-strong);
      background: var(--inset);
    }

    &.failure {
      color: var(--mark-unreadable);
    }
  }

  .remote-name {
    color: var(--muted);
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

  /*
   * 発行の行 (doc-11 §11), for the three faces here that hold exactly one 発行: the 文書ペイン's
   * 編集セッション, the 新規タスク区画, and each 作成モーダル. Pinned to the bottom of whichever box is
   * scrolling — the pane, the panel, or `Modal.svelte`'s content region — so `sticky` rather than a
   * row outside the scroll: the scroller is not this component's in the modal case, so there is no
   * outside to sit in, and one mechanism for all three is one rule to read.
   *
   * Opaque and ruled off, or the form scrolls *through* it (the same requirement `TaskDetail.svelte`
   * states for its pinned 見出し band). The 概要区画 and the マイルストーンペイン have no rule of their
   * own here: they hold two 発行 apiece, so their rows stay in the flow (doc-10 §4.1・§6).
   */
  .issue {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    /*
     * Pulled out to the edges of the box that scrolls, and given that room back as its own padding —
     * a rule that stops short of the edge reads as a line drawn *inside* the panel rather than as the
     * panel's own division (目視 2026-08-10). Each face states its own two values because the three
     * scrollers do not share a padding: the pane is 0.6/0.75rem, the panel 0.75rem both sides, and a
     * modal form keeps the × clear on the right.
     */
    margin-top: 0.4rem;
    padding: 0.45rem 0.75rem 0.6rem;
    border-top: 1px solid var(--line);
    background: var(--panel);

    .actions {
      // 行の中で中央 (doc-11 §11).
      justify-content: center;
      margin-top: 0;
    }

    .reason {
      text-align: center;
    }
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

    // 行削除 as an アイコンのみのボタン (doc-11 §2.4, doc-10 §4.2 の逸脱 1 件目). Centred and squared
    // off: the shared `button` padding above is sized for a word, and a figure given it sits in a box
    // wider than it is tall — beside an input and a select, that reads as a third field.
    .drop {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.3rem;
    }
  }

  // How one alias row takes effect (doc-10 §4.2). Only the one ineffective state takes the 不整合
  // family's colour; the rest stay the colour of a secondary sentence — which is what keeps
  // 宣言集合なし, where the alias works without a declaration behind it, out of that mark.
  .alias-effect {
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-inconsistent);
    }
  }

  .alias-note {
    margin: 0 0 0.35rem;
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-inconsistent);
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

  // 表示パス (doc-10 §5). `display: block` because this class is worn by a `<p>` in the 閲覧ヘッダ and
  // by a `<span>` inside the update form's path `<label>` — a `<p>` is not phrasing content and
  // cannot go in a label, but the line has to read the same in both places.
  .path {
    display: block;
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.68rem;
    word-break: break-all;
  }

  // 閲覧ヘッダ (doc-10 §5・§6): title and 編集 on one line. The heading takes the space so the button
  // keeps its place at the right edge whatever the title's length, and both stay on the first line —
  // which is the line the selection is meant to land on. Worn by both 区画 since TASK-121: the two
  // 閲覧ヘッダ differ in what they list underneath, not in this row.
  .view-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;

    h3 {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }

    button {
      flex: none;
    }
  }

  // Under the 閲覧ヘッダ's first line: ID・type・tags in the 文書区画, id・所属タスク件数 in the
  // マイルストーン区画. One line of muted metadata, the same values the card carries — repeated here
  // because the card is 16rem and truncates, and this column is not.
  .meta-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.7rem;

    .id {
      color: var(--fg);
      font-weight: 600;
    }
  }

  // What 閲覧 shows as prose: the 文書's 本文 (doc-10 §5) and the マイルストーン's 説明 (§6), each as
  // the string was read. `pre-wrap` keeps the newlines the file has and wraps the long lines instead
  // of scrolling the pane sideways — the treatment `TaskDetail.svelte` gives Description, for the
  // same reason (nothing here formats Markdown). The 48rem is doc-8 §2.1's, borrowed rather than
  // decided again: it was measured for a prose block in a column that takes the remaining width,
  // which is what both of these are (doc-10 §5, TASK-113). Named `read-body` and not `body`: this
  // component already wears `.body` on the frame that holds the 区画ナビ and panel.
  .read-body {
    margin: 0.5rem 0 0;
    max-width: var(--prose-max-width);
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);
    font-family: inherit;
    font-size: 0.74rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  // 不整合印 (decision-22, decision-24) on a 文書カード / マイルストーンカード. A 印グリフ: the family
  // colour is the figure's own, with no chip background and no word (doc-11 §2.4). The size matches
  // `TaskCard.svelte`'s .8rem — a figure carrying no word reads smaller than text of the same height
  // — and the 収録条件 is decision-22's 3:1, which `theme.test.ts` recomputes from `app.scss`.
  .inconsistent {
    display: inline-flex;
    align-items: center;
    align-self: center;
    color: var(--mark-inconsistent);
    font-size: 0.8rem;
    cursor: help;
  }

  // 理由行 (decision-22) in either 区画's 閲覧ヘッダ — the place doc-11 §2.4 requires the ⚠️'s reason
  // to be readable without hovering, which decision-24 fixes as「選択が開く場所の見出し下」and which
  // TASK-121 made the same領域 in both. Plain lines, not a 区画: they carry no heading of their own
  // because the ⚠️ above already said there is something to read.
  .reason-lines {
    margin: 0.35rem 0 0;
    padding-left: 1.1rem;
    color: var(--mark-inconsistent);
    font-size: 0.7rem;

    li {
      margin-bottom: 0.15rem;
    }
  }

  // 写せなかったファイルの一覧 (doc-10 §1). Below the cards and outside their scroller, so a short
  // list is not pushed out of view by a long one. Deliberately not `.card`: nothing here is
  // selectable, and giving it the card's shape would put a dead target in the list.
  .unmapped {
    flex: none;
    margin: 0.35rem 0.25rem 0.5rem 0.15rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--line);
    color: var(--mark-inconsistent);

    h3 {
      margin: 0 0 0.25rem;
      font-size: 0.7rem;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      margin-bottom: 0.3rem;
    }

    code {
      display: block;
      font-size: 0.66rem;
      word-break: break-all;
    }
  }

  .reason-line {
    display: block;
    font-size: 0.66rem;
  }

  // The 未保存入力 mark (doc-10 §5・§6). Not one of decision-6's 印の族 — nothing is degraded and nothing
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

  /*
   * The inside of a 作成モーダル (doc-10 §1). No border of its own — the layer `Modal.svelte` draws is
   * already a box, and a second one inside it would read as a 区画 within the 被せ層.
   *
   * The right padding clears the ×, which `Modal.svelte` puts out of the flow above whatever the
   * caller draws first. The two numbers are that layer's own custom properties, so moving the × moves
   * the room kept for it here without this file restating either.
   */
  .modal-form {
    padding: 0.75rem;
    padding-right: calc(var(--modal-close-inset) * 2 + var(--modal-close-size));
    // The 発行の行 pins to the bottom of the layer's scrolling region (doc-11 §11); a padding here
    // would hold it that far off the edge it pins to, and it carries its own instead.
    padding-bottom: 0;

    > :first-child {
      margin-top: 0;
    }

    // 区切りは層の幅いっぱいに引く — 設定モーダルの下部操作行と同じ見え方にする (目視 2026-08-10)。
    // 右は × のぶんまで戻す: 行の中身は × を避ける必要が無く、避けているのは上の欄だけである。
    .issue {
      margin-right: calc(-1 * (var(--modal-close-inset) * 2 + var(--modal-close-size)));
      margin-left: -0.75rem;
    }
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

  // 視覚的にのみ隠す (doc-11 §5 の 2 つ目の形): the reason stays in the accessibility tree because
  // `aria-describedby` points at it. Its own rule — a `//` comment does not end a selector list, so
  // appending this to the group below would have pulled `.hint` into it.
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
    color: var(--mark-inconsistent);
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
  // cannot be read as 不整合 (decision-6・decision-22 の「族を同じ印へ混ぜない」).
  .warn,
  .undetectable {
    margin: 0.4rem 0;
    padding: 0.35rem 0.45rem;
    border-left: 3px solid;
    font-size: 0.74rem;
  }

  .warn {
    border-left-color: var(--info);
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .undetectable {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }

  // 区画見出しと、その横に置く入口 (doc-10 §7). `baseline` so the figure sits on the heading's own
  // line rather than on the middle of its box, which is where an icon beside text is looked for.
  //
  // The h2 keeps its own `margin: 0 0 0.5rem` — zeroing it here would close the gap below the
  // heading that every other 区画 has, and `.list-head` (the same shape one column over) does not
  // zero it either.
  .section-head {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }

  // 注記の入口: アイコンのみのボタン (doc-11 §2.4). The figure is 1em of whatever box it sits in, so
  // the size comes from this button's font-size and nothing here names a second one.
  .note-entry {
    padding: 0.15rem;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--fg);
    }

    // 選択の描き方 (doc-11 §2.3), the same ring 作成の入口 carries: the entry is reachable by
    // keyboard (doc-10 §7 の AC), and a control that takes focus without showing it is reachable
    // only in the accessibility tree.
    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }

  // 注記モーダル (doc-10 §7): one sentence and the names under it. No `code`, no per-item reason —
  // what the layer is for is 代替経路の案内 alone (doc-11 §8).
  .note {
    // Keeps the bottom padding the other two give up: this layer holds no 発行, so there is no row
    // pinned to the bottom edge to carry it (doc-11 §11 — 発行の控えを持たない面は本節の外である).
    padding-bottom: 0.75rem;

    ul {
      margin: 0.35rem 0 0;
      padding-left: 1.1rem;
    }

    li {
      margin-bottom: 0.2rem;
    }
  }

  code {
    font-size: 0.95em;
  }
</style>
