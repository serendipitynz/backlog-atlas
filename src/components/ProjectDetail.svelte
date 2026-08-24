<script lang="ts">
  // プロジェクト詳細画面 (doc-10, TASK-55): everything that can be done to one project, in one screen.
  //
  // TASK-39's 台帳管理画面 (every project's registration) and TASK-40's プロジェクト管理画面 (one
  // project's documents, milestones and new tasks) put two different granularities side by side, so
  // working on a single project meant moving between them. This levels the granularity at one
  // project; neither of the old screens remains. 登録 is the one ledger-wide operation and moved to
  // the 共通入口 instead (doc-3 §4, doc-7 §2.1).
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
  //
  // **What this file is, since TASK-106.** doc-10 §1 の 5 区画は `project-detail/` の 1 コンポーネント
  // ずつで、被せ層 (§1・§7) はどの区画にも属さないのでもう 1 つ。ここに残っているのは 状態・副作用・
  // ヘッダ・区画ナビ である。分けたのはマークアップと SCSS で、状態は動かしていない — 区画切替が
  // 何も落とさないのは全区画の入力がこの 1 か所にあるからで (§1)、`dirty` も 5 区画ぶんをここで足して
  // いる。だから子が受け取るのは値と、書き戻しの口だけである。
  //
  // 複数の区画が要る SCSS 規則は `project-detail/_shared.scss` の mixin で、使う側が選択子を書く —
  // Svelte のスコープはコンポーネント境界を越えないので、規則そのものを親に残すことはできない。
  // 一覧列 を持つ 3 区画 (§1/§5/§6/§10) が列の形をまるごと分け合うのはその mixin である。
  import { tick, untrack, type Snippet } from "svelte";
  import type { Availability } from "../lib/availability";
  import { AVAILABLE, withheld } from "../lib/availability";
  import type { ImageReader } from "../lib/markdown-image";
  import Icon from "../lib/icons/Icon.svelte";
  // 区画コンポーネント (TASK-106). doc-10 §1 の 5 区画に 1 つずつで、被せ層 はどの区画にも属さないので
  // 別に 1 つ。状態はこのファイルが持ち、子は値と入力の受け渡しだけを持つ — 区画切替が入力を落とさない
  // のはそれが理由である (m-1 TASK-55, AC #2)。
  import CreateLayer from "./project-detail/CreateLayer.svelte";
  import DecisionsSection from "./project-detail/DecisionsSection.svelte";
  import DocumentsSection from "./project-detail/DocumentsSection.svelte";
  import MilestonesSection from "./project-detail/MilestonesSection.svelte";
  import NewTaskSection from "./project-detail/NewTaskSection.svelte";
  import OverviewSection from "./project-detail/OverviewSection.svelte";
  import { fileInconsistencyReasons } from "../lib/mark";
  import { rereadRootLabel } from "../lib/external-editor";
  import type { DiscardAnswers } from "../lib/edit";
  import { messages } from "../lib/messages-context";
  import {
    CANONICAL_STATUS_NAMES,
    editOf,
    editProblems,
    resolvedBacklogRoot,
    toUpdateRequest,
    type EntryEdit,
    type LedgerActionResult,
    type RefusalReport,
  } from "../lib/ledger";
  import {
    EMPTY_DOC_CREATE,
    EMPTY_MILESTONE_ADD,
    EMPTY_MILESTONE_REMOVE,
    EMPTY_MILESTONE_RENAME,
    EMPTY_TASK_CREATE,
    issueBusyReason,
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
    type IssueAvailability,
    type IssueOutcome,
    type IssuePlan,
    type MilestoneAddInput,
    type MilestoneRemoveInput,
    type MilestoneRenameInput,
    type TaskCreateInput,
  } from "../lib/manage";
  import {
    sectionLabel,
    DETAIL_SECTIONS,
    displayPath,
    ledgerWriteInFlightReason,
    LIST_COLUMN_WIDTH_REM,
    SECTION_NAV_WIDTH_REM,
    sectionCount,
    gitRemoteDisagreement,
    gitRemoteLine,
    movesRoot,
    overviewSave,
    redetectControl,
    rootMoveNote,
    submittedAttributes,
    unregisterAvailability,
    type DetailSection,
  } from "../lib/project-detail";
  // 行長上限 (doc-8 §2.1, TASK-113). Borrowed rather than restated: the number is one measurement,
  // and a second `48` here would let the two drift while both docs still call it 行長上限.
  import { PROSE_MAX_WIDTH_REM } from "../lib/placement";
  import { createGitRemoteReader, type RemoteLine } from "../lib/git-remote-read";
  import type {
    CliReadiness,
    Decision,
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
    /** Whether a supported CLI exists (doc-5 §5); `null` is 確認中. Reaches the 区画 that issue
     *  (文書・マイルストーン・新規タスク) — not 概要, which does not go through the CLI, and not
     *  決定事項, which issues nothing at all (doc-10 §8). */
    readiness: CliReadiness | null;
    onpickDirectory: (title: string) => Promise<string | null>;
    onupdate: (request: UpdateRequest) => Promise<LedgerActionResult>;
    /**
     * Read the entry's remote 現在値 (doc-10 §4.1). Never rejects — a failed read is a
     * `GitRemoteRead` state of its own, because what the line has to say differs between「remote が
     * 無い」and「読めなかった」(decision-6).
     */
    onreadGitRemote: (slug: string) => Promise<RemoteLine>;
    onremove: (slug: string) => Promise<LedgerActionResult>;
    /** Issue one 更新操作 (doc-5 §3, doc-9 §4). The re-read belongs to the shell. */
    onissue: (slug: string, action: UpdateOperation[]) => Promise<IssueOutcome>;
    /**
     * A 本文リンク in a 管理ファイルの本文 this screen draws was pressed (doc-8 §9.3, which every 区画
     * with a 閲覧 draws from). The shell issues 既定ブラウザ起動 and owns where a failure goes (⑤ 通知).
     */
    onopenlink: (url: string) => void;
    /**
     * The bytes of one 添付画像 named by a 管理ファイルの本文 this screen draws (doc-8 §9.2), for this
     * screen's project. Passed straight to `Body`, like `onopenlink`.
     */
    readimage: ImageReader;
    /** True while this screen holds 未保存入力 — what makes leaving it ask first. */
    ondirty: (dirty: boolean) => void;
    /**
     * True while this screen has a 被せ層 up — its 作成モーダル (doc-10 §1).
     *
     * The shell has to know, for two reasons that are both doc-7 §2.1's 被せ層 は 1 枚だけ: it answers
     * the screen-wide chords on `window`, and a chord that opened the 設定モーダル over this one would
     * put two layers up; and its own メニュー hangs off the ☰ this screen's ヘッダ行 carries, so it has to come
     * down. Reported rather than raised by the shell because the layer belongs to this screen — the
     * control it must hand focus back to on close is the 作成の入口, which only exists here.
     */
    onoverlay: (open: boolean) => void;
    /** 出口 (doc-10 §2). */
    onback: () => void;
    ontoLane: () => void;
    /**
     * 選択中の管理ファイル (decision-45 §1): which of 文書・マイルストーン・決定事項 is selected here, or
     * `null` while none is. Reported up because the ☰'s 外部で開く lives on the shell and only this
     * screen knows which 区画 is open — the shell cannot derive it from a read.
     */
    onselectManaged: (target: { slug: string; sourcePath: string } | null) => void;
    /**
     * 当該ルートの再読込 (doc-10 §3, decision-45 §8). doc-8 §7 requires the re-read to be reachable from
     * the screen holding the selection, and this screen had none until 2026-08-25.
     */
    onreread: () => void;
    /** 継続検出 が止まっている for this root (doc-9 §3.1) — the re-read is offered only while it is. */
    watchStopped: boolean;
    /**
     * The ☰ and its menu (decision-31), drawn by the shell and placed at the right end of this
     * screen's ヘッダ行 (doc-10 §3). Since the 固定ヘッダ went it is the only visible way to 設定・
     * プロジェクトを登録・キーボード操作一覧 while this screen is up — doc-10 §2 records why an entry
     * reaching every project sits on a screen about one.
     */
    menu: Snippet;
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
    onopenlink,
    readimage,
    ondirty,
    onoverlay,
    onback,
    ontoLane,
    onselectManaged,
    onreread,
    watchStopped,
    menu,
  }: Props = $props();

  /** The 文言表 in force, read through the accessor so a 表示言語 change redraws this screen. */
  const t = messages();

  let section = $state<DetailSection>("overview");

  let project = $derived(load?.state === "loaded" ? load.project : null);
  /** ルート読取不能 (doc-10 §8). The 概要区画 still draws from the 台帳エントリ; every 区画 that reads
   *  the root has nothing to show. */
  let unreadable = $derived(load?.state === "unreadable" ? load.error : null);

  // The 台帳読取専用帯 and CLI 縮退帯 (doc-10 §3) are ③ and ② of the screen-common 上部帯 stack
  // (doc-11 §4), so the shell raises them for this screen too. Drawn from here they would sit *below*
  // the shell's 確認帯 ① and 通知帯 ⑤, which is the 出現順 doc-11 §4 forbids. What stays here is the
  // per-操作 reason (`overviewAvailability`・`withheld`・`overviewReadOnlyNote()`), which is where the
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
  /**
   * Whether issuance is held, and why, for the controls that build no plan of their own (文書一覧の
   * 編集). One value rather than a flag beside a sentence: doc-11 §5 refuses both directions the two
   * can come apart in, and `issuing` below is read *off* this so neither can move without the other.
   */
  let issuance = $derived<Availability>(
    ledgerSaving
      ? withheld(ledgerWriteInFlightReason())
      : busy
        ? withheld(issueBusyReason())
        : AVAILABLE,
  );
  let issuing = $derived(issuance.state === "withheld");
  /** The `title` a control held by 発行中 carries: the 保留理由 while it stands, its own hint otherwise. */
  function issuanceTitle(hint: string): string {
    return issuance.state === "withheld" ? issuance.reason : hint;
  }

  /**
   * Whether one form's 発行 control may be pressed, and why not (doc-5 §5). Wrapped rather than
   * called directly so the ledger-write hold reaches all four 区画 through one place — added to a
   * single form, it would be the one the others forgot.
   */
  function availability(plan: IssuePlan): IssueAvailability {
    return issueAvailability(plan, {
      readiness,
      busy,
      hold: ledgerSaving ? withheld(ledgerWriteInFlightReason()) : AVAILABLE,
    });
  }
  /**
   * The last action's result. Its tone follows doc-9 §5's families: an ordinary notice for a CLI
   * failure or a 更新前競合, and 照合不能's own colour for the one that is neither — so it cannot be
   * read as "a conflict happened".
   */
  let message = $state<{ tone: "ok" | "warn" | "undetectable"; text: () => string } | null>(null);

  function tone(outcome: IssueOutcome): "ok" | "warn" | "undetectable" {
    if (outcome.state === "applied") {
      return "ok";
    }
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
  let overviewNotice = $state<(() => string) | null>(null);

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
  const taskNoteLabel = (): string => t().projectDetail.taskNoteLabel;

  let saveControl = $derived(
    overviewSave({
      readOnly: ledgerReadOnly,
      busy: ledgerBusy || issuing,
      hasProblems: editIssues.length > 0,
      hasChanges: updateRequest !== null,
    }),
  );
  let unregisterAvailable = $derived(
    unregisterAvailability(unregisterInput, entry.slug, {
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
      field === "projectRoot" ? t().field.pickProjectRootTitle : t().field.pickBacklogRootTitle,
    );
    if (picked === null) {
      return;
    }
    edit[field] = picked;
  }

  async function save(): Promise<void> {
    const request = updateRequest;
    if (saveControl.state !== "ready" || request === null) {
      return;
    }
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
        // 決定事項 has no session for §4.1 to close, but it has a selection resolved against the old
        // root's read, and that is enough (doc-10 §10). Decision ids are `decision-1`, `decision-2`,
        // … so the same id almost certainly exists in the new root: left standing, the pane would
        // silently swap to a *different* project's decision under a selection the user never moved.
        dropDecisionSelection();
        // status and milestone name the old root's ID space (doc-3 §5.3), so they do not travel
        // either. Both are selections rather than typed text, so dropping them costs no input.
        taskInput.status = "";
        taskInput.milestone = "";
        overviewNotice = () => t().projectDetail.moved(result.slug);
        return;
      }
      overviewNotice = () => t().projectDetail.entryUpdated(result.slug);
    } finally {
      ledgerSaving = false;
    }
  }

  // --- 概要区画: remote 現在値と再検出 (doc-10 §4.1) ---------------------------------------------

  /**
   * remote 現在値 (doc-10 §4.1). `null` until the read lands: 未取得 is not 不在 (decision-6), and
   * `gitRemoteLine` is what keeps the two apart on screen.
   */
  let gitRemote = $state<RemoteLine | null>(null);

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
    if (redetect.state !== "ready") {
      return;
    }
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
      overviewNotice = () => t().projectDetail.remoteRedetected(result.slug);
    } finally {
      redetecting = false;
      ledgerSaving = false;
    }
  }

  async function unregister(): Promise<void> {
    if (unregisterAvailable.state === "withheld") {
      return;
    }
    entryReport = null;
    // Held for the same reason a save is: the boundary closes this project's session on the way,
    // and an issue made while that is in flight would be aimed at a project Atlas no longer reads.
    ledgerSaving = true;
    try {
      const result = await onremove(entry.slug);
      if (result.state === "refused") {
        entryReport = result.report;
      }
      // Closing this screen on success is the shell's job (`removeProject`). Calling `onback` from
      // here would meet the 破棄前確認 and ask whether to keep input for a registration that is gone.
    } finally {
      ledgerSaving = false;
    }
  }

  // --- 更新操作の発行 (doc-5 §3, doc-9 §4) -------------------------------------------------------

  /**
   * Issue one action against this project and state what became of it (doc-9 §5). Refuses while a
   * ledger write is in flight for the same reason the controls are withheld: that write may be a
   * move, and this action names files by the ids of the root as it was read.
   */
  async function issue(
    action: UpdateOperation[],
    done: () => string,
  ): Promise<IssueOutcome | null> {
    if (project === null || ledgerSaving) {
      return null;
    }
    busy = true;
    message = null;
    try {
      const outcome = await onissue(entry.slug, action);
      message = { tone: tone(outcome), text: () => outcomeMessage(outcome, done()) };
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
    if (taskIssue.state !== "ready" || taskPlan.state !== "ready") {
      return;
    }
    const outcome = await issue(taskPlan.action, () => t().projectDetail.taskCreated);
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
      ? ({ state: "blocked", reason: t().projectDetail.pickDocumentFirst } as const)
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
    if (docCreateIssue.state !== "ready" || docCreatePlan.state !== "ready") {
      return;
    }
    const outcome = await issue(docCreatePlan.action, () => t().projectDetail.documentCreated);
    if (outcome?.state === "applied") {
      docInput = { ...EMPTY_DOC_CREATE };
    }
  }

  async function updateDoc(): Promise<void> {
    const session = docSession;
    const plan = docUpdatePlan;
    if (session === null || plan === null || plan.state !== "ready") {
      return;
    }
    if (docUpdateIssue.state !== "ready") {
      return;
    }
    const submittedDoc = plan.submitted;
    const outcome = await issue(plan.action, () => t().projectDetail.documentUpdated);
    if (outcome?.state !== "applied") {
      return;
    }
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
      message = { tone: "warn", text: () => t().projectDetail.diverged(diverged) };
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
    if (docSelection === document.id) {
      return;
    }
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
    if (document === null || issuing) {
      return;
    }
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
    if (docPane !== undefined) {
      docPane.scrollTop = 0;
    }
  }

  function leaveConfirmed(): void {
    const target = pendingDocument;
    pendingDocument = null;
    if (target === null) {
      return;
    }
    if (target.document === null) {
      void discardEditor();
      return;
    }
    void openDocument(target.document);
  }

  function setDoc<K extends keyof DocDraft>(key: K, value: DocDraft[K]): void {
    if (docSession === null) {
      return;
    }
    docSession = setDocField(docSession, key, value);
  }

  // --- マイルストーン区画 (doc-10 §6) ------------------------------------------------------------

  let milestoneInput = $state<MilestoneAddInput>({ ...EMPTY_MILESTONE_ADD });
  let milestonePlan = $derived(buildMilestoneAdd(milestoneInput));
  let milestoneIssue = $derived(availability(milestonePlan));

  async function addMilestone(): Promise<void> {
    if (milestoneIssue.state !== "ready" || milestonePlan.state !== "ready") {
      return;
    }
    const outcome = await issue(milestonePlan.action, () => t().projectDetail.milestoneCreated);
    if (outcome?.state === "applied") {
      milestoneInput = { ...EMPTY_MILESTONE_ADD };
    }
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
    if (milestoneSelection === milestone.id) {
      return;
    }
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
    if (selectedMilestone === null || issuing) {
      return;
    }
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
    if (milestonePane !== undefined) {
      milestonePane.scrollTop = 0;
    }
  }

  function milestoneLeaveConfirmed(): void {
    const target = pendingMilestone;
    pendingMilestone = null;
    if (target === null) {
      return;
    }
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
    if (milestoneSelection !== milestone.id || milestoneOp === null) {
      return null;
    }
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

  /**
   * Issue 改称・削除・アーカイブ.
   *
   * **`kind` is a value, not a read of `milestoneOp`.** The 発行結果 is worded lazily so it follows
   * 表示言語 (decision-35), and on success this function clears `milestoneOp` — so a thunk that
   * looked the operation up when the banner is *read* would find `null` and word every success as
   * アーカイブ. Capturing the kind at the press keeps the sentence lazy and its subject fixed.
   */
  async function runMilestoneOp(
    milestone: Milestone,
    kind: "rename" | "remove" | "archive",
  ): Promise<void> {
    const done = (): string =>
      kind === "rename"
        ? t().projectDetail.renamed
        : kind === "remove"
          ? t().projectDetail.removed
          : t().projectDetail.archived;
    const plan = milestoneOpPlan(milestone);
    if (plan === null || plan.state !== "ready") {
      return;
    }
    if (availability(plan).state !== "ready") {
      return;
    }
    const outcome = await issue(plan.action, done);
    // Closed on success only: the milestone the input names is gone (removed/archived) or renamed,
    // so keeping the form open would offer a second issue against a stale operand. A failure or a
    // 更新前競合 keeps it, which is what lets the user reload and retry the same input.
    // The whole 編集セッション closes, not just this operation (doc-10 §6, TASK-121) — for the reason
    // §5 gives about 文書更新: after a success the state the input was formed against no longer
    // exists. 改称 keeps the id (v1.50.1 does not change it, doc-9 §4.2.1) so the selection stands
    // and the pane lands on 閲覧; 削除・アーカイブ take the milestone out of the re-read, which the
    // effect below turns into a dropped selection, on every read rather than only here.
    if (outcome?.state === "applied") {
      await discardMilestoneEdit();
    }
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
    if (plan.state !== "ready") {
      return;
    }
    if (availability(plan).state !== "ready") {
      return;
    }
    const outcome = await issue(plan.action, () => t().projectDetail.milestoneDescriptionUpdated(milestone.id));
    if (outcome?.state === "applied") {
      await discardMilestoneEdit();
    }
  }

  /**
   * 写せなかったファイル for one 区画 (doc-10 §1, decision-24). Filtered by kind here rather than sent
   * as three lists, because the record already carries its kind and one list is what keeps the three
   * 区画 from disagreeing about what counts as a failure.
   *
   * All three kinds now have a 区画 to be drawn in — 決定事項 got one with TASK-118 (doc-10 §10), so
   * decision-24's records are no longer recorded-but-unplaceable for any kind.
   */
  let unmappedDocuments = $derived(
    (project?.unmappedFiles ?? []).filter((file) => file.kind === "document"),
  );
  let unmappedMilestones = $derived(
    (project?.unmappedFiles ?? []).filter((file) => file.kind === "milestone"),
  );
  let unmappedDecisions = $derived(
    (project?.unmappedFiles ?? []).filter((file) => file.kind === "decision"),
  );

  /**
   * 理由行 for whichever document the 文書ペイン currently holds (doc-10 §5). One of these per 区画
   * with a 一覧列, derived once rather than at each use, so the ⚠️ on the card and the lines in the
   * pane can never be built from two different readings of the same file (decision-22 「導出は 1 回」).
   *
   * Taken from the **current read**, not from `docSession.baseline`. The baseline is the read the
   * *input* was made against and it deliberately survives a reload (that is how 未保存入力 stays
   * comparable), but the card beside it draws its ⚠️ from the current read — so reading the reasons
   * off the baseline would let a document broken while its editor is open show a ⚠️ with no lines
   * under it, which is the state doc-11 §2.4 admits the mark only on condition of avoiding.
   * `selectedMilestone` already resolves against the current read for the same reason (PR #71 [P2]).
   */
  let openDocReasons = $derived(
    selectedDocument === null ? [] : fileInconsistencyReasons(selectedDocument.health, "document"),
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
    if (project === null || docSelection === null || selectedDocument !== null) {
      return;
    }
    if (docSession !== null) {
      return;
    }
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
      : fileInconsistencyReasons(selectedMilestone.health, "milestone"),
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
    if (project === null || milestoneSelection === null || selectedMilestone !== null) {
      return;
    }
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

  // --- 決定事項区画 (doc-10 §10, TASK-118) --------------------------------------------------------
  //
  // The third 一覧列-holding 区画, and the only one that never issues: `backlog decision` has `create`
  // alone, whose options are `<title>` and `-s` (2026-08-13 measured), so there is no 作成の入口, no
  // 編集への切替 and no 編集セッション here. Everything the other two need in order to *hold* input —
  // a session, a dirty flag, a 破棄前確認, a card-blocking reason while a 発行 is in flight — has no
  // subject in this 区画 and is therefore absent rather than disabled (doc-11 §5: 理由の無い無効化を
  // 置かない). What remains is the pair doc-10 §1 defines: a 一覧列 that keeps the selection, and a
  // pane that shows 閲覧 of whatever it holds.

  /** 選択 (doc-10 §10): which decision the 決定事項ペイン holds, as an id. */
  let decisionSelection = $state<string | null>(null);
  let decisionPane = $state<HTMLDivElement | undefined>(undefined);

  /**
   * The selected decision as the **current read** holds it, for the reason `selectedDocument` gives:
   * a reload must move 閲覧 rather than leave it describing a file that has since changed, and a
   * decision that disappears must take the selection with it (the `$effect` below).
   */
  let selectedDecision = $derived(
    decisionSelection === null
      ? null
      : (project?.decisions.find((candidate) => candidate.id === decisionSelection) ?? null),
  );

  /** 理由行 for the decision in the pane (decision-24, doc-10 §10). Derived once, like the other two. */
  let openDecisionReasons = $derived(
    selectedDecision === null ? [] : fileInconsistencyReasons(selectedDecision.health, "decision"),
  );

  /** 表示パス (doc-10 §5's term, §10's instance) for the selected decision. */
  /**
   * 選択中の管理ファイル (decision-45 §1) as this screen holds it: whichever of the three is selected.
   * **At most one is**, because the three 区画 are not open at once — so this reads as a chain rather
   * than needing a rule for which wins.
   *
   * Reported through an `$effect` rather than by calling the callback from each selection handler: the
   * three selections also *drop* on a read that no longer holds the file (doc-10 §5), and those paths
   * touch no handler. An effect over the derived value catches every one of them.
   */
  let managedSelection = $derived(
    selectedDocument !== null
      ? { slug: entry.slug, sourcePath: selectedDocument.sourcePath }
      : selectedMilestone !== null
        ? { slug: entry.slug, sourcePath: selectedMilestone.sourcePath }
        : selectedDecision !== null
          ? { slug: entry.slug, sourcePath: selectedDecision.sourcePath }
          : null,
  );
  $effect(() => {
    onselectManaged(managedSelection);
  });
  let selectedDecisionPath = $derived(
    selectedDecision === null ? null : displayPath(selectedDecision.sourcePath, entry.project_root),
  );

  /** 選択が成立する: the pane swaps to 閲覧 of this decision. */
  async function selectDecision(decision: Decision): Promise<void> {
    // Re-pressing the selected card must not re-run the swap: there is no input to lose, but the
    // pane would jump to the top under a reader who had scrolled down it.
    if (decisionSelection === decision.id) {
      return;
    }
    decisionSelection = decision.id;
    await resetDecisionPane();
  }

  /** The 決定事項ペイン's swap, reset for the reason `resetDocPane` records. */
  async function resetDecisionPane(): Promise<void> {
    await tick();
    if (decisionPane !== undefined) {
      decisionPane.scrollTop = 0;
    }
  }

  /**
   * 選択が落ちて非選択時の姿へ戻る (doc-10 §10). One function for both occasions that reach it — a
   * disappearance from the read, and a completed root move — so the pane reset cannot come to depend
   * on which one it was. The other two 区画 have this spread over two places because each also has a
   * session and a 破棄前確認 to unwind, and those differ between the two occasions; here nothing does.
   */
  function dropDecisionSelection(): void {
    decisionSelection = null;
    void resetDecisionPane();
  }

  /**
   * A selection that no longer resolves is dropped, and the pane returns to 非選択時 (doc-10 §10).
   * Simpler than the other two 区画's: nothing here can be mid-edit, so there is no session to close
   * and no 破棄前確認 to withdraw. Guarded on `project !== null` for their reason — a read in flight
   * resolves nothing and must not be taken for a disappearance.
   */
  $effect(() => {
    if (project === null || decisionSelection === null || selectedDecision !== null) {
      return;
    }
    dropDecisionSelection();
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
      ? t().projectDetail.milestoneNew
      : layerOpen === "task-note"
        ? taskNoteLabel()
        : t().projectDetail.documentNew,
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
    if (issuing) {
      return;
    }
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
    if (createOpen === "document") {
      docInput = { ...EMPTY_DOC_CREATE };
    } else if (createOpen === "milestone") {
      milestoneInput = { ...EMPTY_MILESTONE_ADD };
    }
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

  /** What stands in for a list the screen cannot draw because the root is unreadable (doc-10 §8). */
  let unreadableNote = $derived(
    unreadable === null
      ? null
      : t().projectDetail.sectionUnreadable,
  );

  /**
   * 新規タスク区画 が欄を出しているか。**1 つの述語で足りるようにここに置いてある** — 欄が出ている
   * ときだけ 発行の行 が立ち (doc-11 §11)、そのとき `.panel` の下 padding をその行が持つので、区画と
   * パネルの両方がこの値を読む。分割前は `.panel:has(> section > .issue)` が要素の有無を読んでいたが、
   * 区画が子コンポーネントになった以上、その要素はこの木のスコープクラスを持たない。
   */
  let taskFormShown = $derived(unreadableNote === null && project !== null);
</script>

<!-- The column widths come from `project-detail.ts` so the number a doc cites and the number laid
     out are the same one (TASK-113's pattern). Both size content boxes (TASK-115). 行長上限 comes
     from `placement.ts` for the same reason, and is the very same 48rem doc-8 §2.1 puts on タスク詳細's
     body blocks — 閲覧's 本文 is prose in a column that takes whatever width is left, which is the
     situation that number was measured for (TASK-113). -->
<div
  class="detail"
  style="--section-nav-width: {SECTION_NAV_WIDTH_REM}rem; --list-column-width: {LIST_COLUMN_WIDTH_REM}rem; --prose-max-width: {PROSE_MAX_WIDTH_REM}rem"
>
  <!-- ヘッダ (doc-10 §3): identity, the round trip, and — since the 固定ヘッダ went — the ☰ at its right
       end (decision-31). Nothing here writes. The パンくず (doc-12 §8) puts the way back at the top left
       — where a way back is looked for — with the project name as the current place; the return that
       also lands (doc-10 §2) stays a separate control at the right, since it does more than go back. -->
  <header class="head">
    <nav class="breadcrumb" aria-label={t().projectDetail.breadcrumbLabel}>
      <!-- アイコンのみのボタン (doc-11 §2.4), and a deliberate deviation from that section's 語の中の記号
           — the original is 「← スイムレーン」 (doc-12 §8), where §2.4 refuses to lift the arrow out
           because doing so changes the word. decision-31 changes it knowingly; §2.4 records the
           deviation. The 行き先の語 is in the `aria-label`, so nothing about where this goes is carried
           by the figure alone. -->
      <button
        type="button"
        class="back"
        aria-label={t().action.backToSwimlane}
        title={t().action.backToSwimlane}
        onclick={onback}
      >
        <Icon name="arrow-left" />
      </button>
      <span class="separator" aria-hidden="true">/</span>
      <span class="name">{project?.config.projectName ?? entry.slug}</span>
    </nav>
    <span class="slug">{entry.slug}</span>
    <span class="counts">
      {#if project !== null}
        <!-- タスクの件数だけ (doc-10 §3・§10)。文書・マイルストーン は 2026-08-13 に区画ナビの括弧へ
             移った (TASK-118)。タスクがここに残るのは、この画面に タスク の区画が無いためで、移す
             先が無い — 区画ナビの括弧は「その区画の一覧が何件持っているか」であって、区画を持たない
             ものの件数を置ける場所ではない。 -->
        {t().projectDetail.taskCount(project.tasks.length)}
      {:else if unreadable !== null}
        <span class="unreadable-count">{t().projectDetail.countUnreadable}</span>
      {:else}
        {t().state.loading}
      {/if}
    </span>
    {#if watchStopped}
      <!-- 当該ルートの再読込 (doc-10 §3, decision-45 §8)。**継続検出 が止まっている間だけ出す** —
           動いている間は外部での保存が自動で届くので、押す理由が無い。置き場がヘッダ行なのは、ここが
           この画面のルート全体に効く操作の場所だからである。 -->
      <button type="button" class="reread" onclick={onreread}>{rereadRootLabel()}</button>
    {/if}
    <button type="button" class="to-lane" onclick={ontoLane}>{t().projectDetail.toLane}</button>
    <!-- 帯の右端 (decision-31). After 出口 rather than before it: the two exits are what this screen
         offers, and the ☰ opens things that have nothing to do with this project. -->
    {@render menu()}
  </header>

  <div class="body">
    <!-- 区画切替 (doc-10 §1): a display change within one screen, not a screen transition. Every
         区画's input lives in this one component, so moving between them loses nothing — which is why
         the 区画コンポーネント below hold none of it (TASK-106). -->
    <nav class="sections" aria-label={t().projectDetail.sectionsLabel}>
      {#each DETAIL_SECTIONS as item (item)}
        {@const count = sectionCount(item, project)}
        <button
          type="button"
          class:current={section === item}
          aria-current={section === item ? "true" : undefined}
          onclick={() => (section = item)}
        >
          <!-- 件数は括弧で label の隣に出す (doc-10 §1, TASK-118)。`null` のときは括弧ごと出さない —
               概要 と 新規タスク には数える対象が無く、読み取りが済むまでは件数そのものが無い。
               `(0)` と出すと、その 2 つが「空の一覧」と同じ絵になる。件数は控えの名前の一部なので
               `aria-hidden` にしない: 一覧に何件あるかは、その区画を開くかどうかの判断材料である。 -->
          {sectionLabel(item)}{count === null ? "" : ` (${count})`}
        </button>
      {/each}
    </nav>

    <!-- 一覧列を持つ 3 区画 (doc-10 §1/§5/§6/§10) では、パネルはスクローラを 2 列へ譲る。 -->
    <div
      class="panel"
      class:split={section === "documents" || section === "milestones" || section === "decisions"}
      class:issue-row={section === "newTask" && taskFormShown}
    >
      {#if message !== null}
        <p class={message.tone}>{message.text()}</p>
      {/if}

      {#if section === "overview"}
        <OverviewSection
          {entry}
          {ledgerReadOnly}
          notice={overviewNotice}
          {edit}
          {moveNote}
          {editIssues}
          {submitted}
          {entryReport}
          {saveControl}
          {unregisterAvailable}
          {redetect}
          {remoteLine}
          {remoteDisagreement}
          {declaredStatuses}
          {unregisterInput}
          setUnregisterInput={(value) => (unregisterInput = value)}
          onpickRoot={(field) => void pickRoot(field)}
          onfollowBacklogDefault={followBacklogDefault}
          onaddAliasRow={addAliasRow}
          onremoveAliasRow={removeAliasRow}
          onredetect={() => void redetectGitRemote()}
          onsave={() => void save()}
          onunregister={() => void unregister()}
        />
      {:else if section === "documents"}
        <DocumentsSection
          projectRoot={entry.project_root}
          documents={project?.documents ?? null}
          {unreadableNote}
          {unmappedDocuments}
          pending={pendingDocument}
          onleaveConfirmed={leaveConfirmed}
          onbackToInput={() => (pendingDocument = null)}
          {issuance}
          {issuing}
          {issuanceTitle}
          selection={docSelection}
          {selectedDocument}
          selectedPath={selectedDocPath}
          reasons={openDocReasons}
          session={docSession}
          editorDirty={docEditorDirty}
          {setDoc}
          {newTag}
          setNewTag={(value) => (newTag = value)}
          updateIssue={docUpdateIssue}
          oncreateOpen={() => openCreate("document")}
          onselect={(document) => selectDocument(document)}
          onstartEdit={() => void startDocEdit()}
          oncloseEditor={closeEditor}
          onupdate={() => void updateDoc()}
          onpane={(element) => (docPane = element)}
          {onopenlink}
          {readimage}
        />
      {:else if section === "milestones"}
        <MilestonesSection
          projectRoot={entry.project_root}
          milestones={project?.milestones ?? null}
          tasks={project?.tasks ?? []}
          {unreadableNote}
          {unmappedMilestones}
          pending={pendingMilestone}
          onleaveConfirmed={milestoneLeaveConfirmed}
          onbackToInput={() => (pendingMilestone = null)}
          {issuance}
          {issuing}
          {issuanceTitle}
          selection={milestoneSelection}
          selected={selectedMilestone}
          sessionOpen={milestoneEditing}
          dirty={milestoneDirty}
          reasons={openMilestoneReasons}
          operation={milestoneOp}
          {renameInput}
          {removeInput}
          descriptionText={milestoneDescriptionText}
          setDescriptionDraft={(value) => (milestoneDescriptionDraft = value)}
          opPlan={milestoneOpPlan}
          targetsOf={rewriteTargets}
          availabilityOf={availability}
          oncreateOpen={() => openCreate("milestone")}
          onselect={(milestone) => selectMilestone(milestone)}
          onstartEdit={() => void startMilestoneEdit()}
          oncloseEdit={closeMilestoneEdit}
          onsaveDescription={(milestone) => void saveMilestoneDescription(milestone)}
          onopenOperation={openMilestoneOp}
          oncloseOperation={closeMilestoneOp}
          onrun={(milestone, kind) => void runMilestoneOp(milestone, kind)}
          onpane={(element) => (milestonePane = element)}
          {onopenlink}
          {readimage}
        />
      {:else if section === "decisions"}
        <DecisionsSection
          {entry}
          {project}
          {unreadableNote}
          {unmappedDecisions}
          selection={decisionSelection}
          selected={selectedDecision}
          selectedPath={selectedDecisionPath}
          reasons={openDecisionReasons}
          onselect={(decision) => void selectDecision(decision)}
          onpane={(element) => (decisionPane = element)}
          {onopenlink}
          {readimage}
        />
      {:else}
        <NewTaskSection
          {unreadableNote}
          formShown={taskFormShown}
          statuses={project?.config.statuses ?? []}
          milestones={project?.milestones ?? []}
          {taskInput}
          {newLabel}
          setNewLabel={(value) => (newLabel = value)}
          {newCriterion}
          setNewCriterion={(value) => (newCriterion = value)}
          {taskIssue}
          oncreate={() => void createTask()}
          onopenNote={openTaskNote}
          noteLabel={taskNoteLabel()}
        />
      {/if}
    </div>
  </div>
</div>

<CreateLayer
  {layerOpen}
  {createOpen}
  label={layerLabel}
  {issuance}
  confirm={createConfirm}
  onclose={requestLayerClose}
  {docInput}
  {docCreateIssue}
  oncreateDoc={() => void createDoc()}
  {milestoneInput}
  {milestoneIssue}
  onaddMilestone={() => void addMilestone()}
  noteLabel={taskNoteLabel()}
/>

<style lang="scss">
  @use "./project-detail/shared" as shared;

  .detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    font-size: var(--text-lg);
  }

  // 控えの群 (doc-11 §2.2): ← スイムレーン and このプロジェクトのレーンへ are the two ways off this
  // screen, side by side with no field between them. 1.4rem rather than the 1.75rem the 区画 below
  // take — this is the screen's header, the same place タスク詳細 answers at 1.4rem, and the forms
  // are what the larger step is for.
  .head {
    // 1 行の高さ, named rather than repeated per control — the ☰ the shell renders into this row
    // (decision-31) reads it as well, and it is the one value that keeps that figure the same size as
    // the words beside it. The number is what this header's buttons already stood at.
    --bar-control: 1.4rem;

    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--line);
    background: var(--inset);

    button {
      height: var(--bar-control);
    }
  }

  .breadcrumb {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }

  // アイコンのみのボタン (doc-11 §2.4): square on the row's own height, since there is no label for the
  // horizontal padding of a worded button to sit beside. Centred rather than left on the row's
  // `baseline` for the reason the ☰ is — a figure has no baseline of its own.
  .back {
    display: inline-flex;
    width: var(--bar-control);
    align-items: center;
    align-self: center;
    justify-content: center;
    padding: 0;
    font-size: var(--text-sm);
  }

  // 副次 (doc-11 §2.1): the separator is punctuation between the way back and the current place,
  // not something to read on its own.
  .separator {
    color: var(--faint);
  }

  .name {
    font-size: var(--text-3xl);
    font-weight: 600;
  }

  // 副次 (doc-11 §2.1): the theme's own colour, not an opacity over `--fg`.
  .slug,
  .counts {
    color: var(--muted);
    font-size: var(--text-md);
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

    // 発行の行 を持つ区画では、この箱の下 padding は行が持つ (doc-11 §11)。**区画が子コンポーネントに
    // なったので、条件は要素の有無ではなく `taskFormShown` から来る** — Svelte のスコープはコンポーネント
    // 境界を越えないので、`:has(> section > .issue)` はあの要素に届かない (TASK-106)。
    &.issue-row {
      padding-bottom: 0;
    }

    // 一覧列を持つ区画 (doc-10 §1 enumerates them): the panel stops being the scroller
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

  // ヘッダと区画ナビの控え。**区画の側の控えは区画コンポーネントが持つ** — Svelte のスコープは
  // コンポーネント境界を越えないので、この規則が届くのはこのファイルが描く控えだけである。
  button {
    @include shared.button;
  }

  .ok {
    @include shared.ok;
  }

  // 照合不能 is neither a conflict nor a failure (doc-9 §4.2/§5): its own family's colour, so it
  // cannot be read as 不整合 (decision-6・decision-22 の「族を同じ印へ混ぜない」).
  .warn,
  .undetectable {
    margin: 0.4rem 0;
    padding: 0.35rem 0.45rem;
    border-left: 3px solid;
    font-size: var(--text-md);
  }

  .warn {
    border-left-color: var(--info);
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .undetectable {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }
</style>
