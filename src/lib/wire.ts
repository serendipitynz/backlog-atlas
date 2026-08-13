/**
 * The Tauri boundary's payloads, as TypeScript. One declaration per `Serialize` type in
 * `src-tauri/src/commands.rs` (TASK-33) and the layers it re-exports (`domain.rs`,
 * `interpret/`, `ledger.rs`).
 *
 * Hand-written rather than generated: adding a schema generator would be a new dependency,
 * and the surface is small and already fixed by doc-4 §3.1's referent table. The rule these
 * declarations follow is therefore "mirror what serde emits", including where that differs
 * from the rest of the boundary — see `CommandError`, whose variant fields are snake_case
 * because serde's container-level `rename_all` renames variants, not their fields.
 *
 * Nothing here is interpreted; it is the wire shape only. The swimlane's own vocabulary
 * (rows, cells, filters) lives in `swimlane.ts` and `filter.ts`.
 */

// --- domain (doc-4 §3) --------------------------------------------------------------------

/** Where a task file sits, independent of its frontmatter status (doc-4 §3.4). */
export type StorageState = "active" | "draft" | "completed" | "archive";

/**
 * One 保存区分 choice the filter can hold (doc-7 §5.2): the four states plus `indeterminate`, a task
 * file found outside the recognized scan locations (`storageState` is `null`). Declared here rather
 * than only in `filter.ts` because アプリ設定 persists a list of these (`default_storage_filter`), so it
 * is a wire value; `filter.ts` re-exports it and states why the indeterminate case exists.
 */
export type StorageSelection = StorageState | "indeterminate";

export type RequiredField = "id" | "title" | "status";

export type ReferenceKind = "milestone" | "documentation" | "reference";

/** One degradation event on a task (doc-4 §5). Tagged `event`, not `kind`. */
export type DegradeEvent =
  | { event: "unparseable"; missingRequired: RequiredField[]; detail: string | null }
  | { event: "unexpectedSchema"; detail: string }
  | { event: "danglingReference"; kind: ReferenceKind; target: string };

/** Per-file parse health (doc-4 §5). `degraded` is one source of the 不整合印 the card shows
 *  (doc-7 §3, decision-22). The token stays 縮退-flavoured on purpose: it names what the read layer
 *  recorded, not the state the screen bundles it into.
 *
 *  Named for a management file since decision-24 widened 不整合's object from タスク 1 件 to
 *  管理ファイル 1 件: `Task`, `Milestone`, `Document` and `Decision` each carry one. Only the type
 *  name moved — the tokens are as decision-22 left them. */
export type FileHealth = { state: "ok" } | { state: "degraded"; events: DegradeEvent[] };

export interface AcceptanceCriterion {
  number: number;
  text: string;
  checked: boolean;
}

export interface UnknownSection {
  name: string;
  body: string;
}

/** One task mirrored from a Backlog root (doc-4 §3.1). */
export interface Task {
  sourcePath: string;
  /** Owning project — the ledger slug of the root this file came from, never frontmatter. */
  project: string;
  /** `null` is indeterminate, and doc-4 §3.4 forbids reading it as `active` (see `filter.ts`). */
  storageState: StorageState | null;
  id: string | null;
  title: string | null;
  /** Raw frontmatter status; the canonical-column mapping is in `TaskInterpretation`. */
  status: string | null;
  /**
   * Type 候補 from both Type 導出元 — kind labels first, then the frontmatter `type` field
   * (decision-20). What the file said, not what the screen shows: `TaskInterpretation.types`
   * is the folded, classified list, so this one can be longer. Named `type` on the wire by
   * doc-4 §3.1.
   */
  type: string[];
  /** Normal labels only — kind labels are split out at the read layer (doc-4 §3.3). */
  labels: string[];
  assignee: string[];
  priority: string | null;
  ordinal: number | null;
  milestone: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  dependencies: string[];
  documentation: string[];
  references: string[];
  description: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  implementationPlan: string | null;
  implementationNotes: string | null;
  unknownSections: UnknownSection[];
  health: FileHealth;
}

export interface Config {
  projectName: string | null;
  taskPrefix: string;
  statuses: string[];
  defaultStatus: string | null;
  dateFormat: string | null;
}

export interface Milestone {
  /**
   * Source file path. doc-9 §4.2.2 puts this file in the 書き換え対象集合 of every milestone
   * operation, and three of them rewrite nothing else — without it they could only run unchecked.
   */
  sourcePath: string;
  id: string;
  title: string;
  description: string | null;
  /** 想定外スキーマ met while mapping this milestone (doc-4 §5, decision-24). */
  health: FileHealth;
}

export interface Document {
  sourcePath: string;
  id: string;
  title: string;
  type: string | null;
  tags: string[];
  createdDate: string | null;
  updatedDate: string | null;
  body: string | null;
  /** 想定外スキーマ met while mapping this document's optional fields (doc-4 §5, decision-24).
   *  `id`, `title` and `body` are what the file said; only the out-of-range field is unset. */
  health: FileHealth;
}

export interface Decision {
  /** Added with TASK-88: naming which decision file is 不整合 needs it. */
  sourcePath: string;
  id: string;
  title: string;
  status: string | null;
  date: string | null;
  body: string | null;
  health: FileHealth;
}

/** Which non-task management file an `UnmappedFile` came from (doc-4 §3.2). Tasks are absent by
 *  construction — a task that loses a required field is still a `Task` (doc-4 §5). */
export type ManagedFileKind = "milestone" | "document" | "decision";

/**
 * 写せなかったファイル (doc-4 §1, decision-24): a `milestones/`, `docs/` or `decisions/` file
 * 解析不能 kept out of its collection entirely, reduced to where it is, what it was meant to be,
 * and why it did not read.
 *
 * The fields are `DegradeEvent`'s `unparseable` payload without the tag: 解析不能 is the only
 * event that can produce one, since a file that got as far as 想定外スキーマ has an id and is in
 * its collection instead.
 */
export interface UnmappedFile {
  sourcePath: string;
  kind: ManagedFileKind;
  /** `status` never appears — doc-4 §3.2 makes `id`/`title` the required set for these kinds. */
  missingRequired: RequiredField[];
  detail: string | null;
}

// --- interpretation (TASK-29, decision-4 / decision-5) -------------------------------------

/** 正準ステータス列 (decision-4). The four fixed columns, in left-to-right order. */
export type StatusColumn = "toDo" | "inProgress" | "inReview" | "done";

export type StatusDeclaration = "declared" | "draft" | "undeclared" | "noDeclaredSet";

export interface StatusMapping {
  /** The status exactly as the frontmatter wrote it — what the 未分類区画 shows (decision-4). */
  raw: string;
  /** `null` is 未分類 status: the task belongs in the row's 未分類区画, never in a column. */
  column: StatusColumn | null;
  declaration: StatusDeclaration;
}

export interface TypeValue {
  value: string;
  known: boolean;
}

export interface TaskInterpretation {
  /** `null` when the task carries no status at all — a 解析不能 file (doc-4 §5). */
  status: StatusMapping | null;
  types: TypeValue[];
  /**
   * The task's References that are Pull Request URLs (doc-6 §4), derived with the task rather
   * than by the Git・PR history command: their only input is References, so the doc-8 §4
   * separation holds even for a task that has no TASK-ID to search commits with.
   */
  pullRequests: PullRequestRef[];
}

/** One task with Atlas's reading of it beside it, never merged into it. */
export interface TaskView {
  task: Task;
  interpretation: TaskInterpretation;
}

/**
 * 列の作成時 status 候補 (doc-7 §4.1) for one canonical column: the project's own declared statuses
 * that 列対応規則 sends there, in `config.yml`'s declaration order. All four columns are always
 * present, an empty `statuses` being 候補 0 件 rather than a missing answer.
 */
export interface ColumnCreateStatuses {
  column: StatusColumn;
  statuses: string[];
}

export interface ProjectSnapshot {
  slug: string;
  config: Config;
  tasks: TaskView[];
  milestones: Milestone[];
  documents: Document[];
  decisions: Decision[];
  /** 写せなかったファイル across all three non-task kinds, in scan order (decision-24). Each 区画
   *  filters it to its own kind and draws it below its cards (doc-10 §5・§6・§10). */
  unmappedFiles: UnmappedFile[];
  /** 列の作成時 status 候補, one entry per canonical column (doc-7 §4.1). */
  createStatusCandidates: ColumnCreateStatuses[];
}

// --- Git・Pull Request 履歴 (doc-6, TASK-30) ------------------------------------------------

/** A remote host kind Atlas can act on (doc-6 §5). An unrecognized host is `null`, not a value. */
export type RemoteHostKind = "gitHub";

/** One commit found by コミット検索 (doc-6 §3). `date` is strict ISO 8601 (git's `%aI`). */
export interface Commit {
  /** Full SHA — the key relation resolution matches on. */
  id: string;
  /** git's abbreviation, for display. */
  shortId: string;
  summary: string;
  date: string;
  author: string;
}

/**
 * A Pull Request URL selected from a task's References by the PR URL 抽出規則 (doc-6 §4). The
 * coordinates are filled only where the URL's shape decides them; `url` is always verbatim.
 */
export interface PullRequestRef {
  url: string;
  host: RemoteHostKind | null;
  owner: string | null;
  repo: string | null;
  number: number | null;
}

/** The owning project's determined remote host (doc-6 §5) — the gate on 関連解決. */
export interface RemoteHost {
  kind: RemoteHostKind;
  owner: string;
  repo: string;
}

/**
 * What became of コミット検索 (doc-6 §3/§6, decision-6). Three distinct facts, never one empty
 * display: `searched` with no commits is コミット該当なし (neutral — nothing committed yet),
 * `noRepository` is Git 対象不在, `unreadable` is a Git read that failed.
 */
export type CommitSearch =
  | { state: "searched"; commits: Commit[] }
  | { state: "noRepository"; projectRoot: string }
  | { state: "unreadable"; detail: string };

/**
 * Why a Pull Request's commit set could not be fetched (doc-6 §6). Typed because the four differ in
 * what would clear them, which doc-8 §5 asks the screen to state: `toolMissing` clears by installing
 * the reference means, `invalidReference` by editing the task's References, `timedOut` is a 照会
 * Atlas itself ended at the gh 照会期限 (decision-19) and may well differ on a retry, and
 * `queryFailed` is a query that ran and failed — auth, permission, a deleted PR or the network,
 * undecidable from here.
 */
export type LookupFailure =
  | "toolMissing"
  | "invalidReference"
  | "queryFailed"
  | "timedOut";

/**
 * What became of one Pull Request during コミット・PR 関連解決 (doc-6 §6). `resolved` with an empty
 * `commitIds` is a *resolved* state — the PR was queried and shares no commit with this task — and is
 * deliberately not the same value as a lookup that never succeeded.
 */
export type RelationOutcome =
  | { state: "resolved"; commitIds: string[] }
  | { state: "hostUnsupported" }
  | { state: "lookupFailed"; reason: LookupFailure; detail: string };

/** One Pull Request's relation result, keyed by the verbatim URL it was extracted from (doc-6 §6). */
export interface PrRelation {
  pullRequest: string;
  outcome: RelationOutcome;
}

/**
 * One task's Git 履歴 (doc-6 §2) — the parts that need Git or the remote. The extracted Pull Request
 * URLs are on `TaskInterpretation` instead, since References is their only input. `remote` is the
 * 関連解決 gate and `relations` its result, one entry per extracted PR: with the gate shut nothing is
 * queried and the list is empty, so the screen reads it only once `remote` is non-null.
 */
export interface TaskHistory {
  commits: CommitSearch;
  remote: RemoteHost | null;
  relations: PrRelation[];
}

/**
 * The project root's Git remote as it reads right now — the 概要区画's remote 現在値 (doc-10 §4.1).
 * Not the ledger's Git remote 有無属性 (doc-3 §3.2): that one is a recorded boolean, this one is read
 * on demand and never stored, so the two can disagree.
 *
 * Four states rather than a nullable URL, following decision-6: `remoteAbsent` (a repository with no
 * remote) and `noRepository` (the root is not one) differ in what the user would do next, and
 * `unreadable` says nothing about whether a remote exists.
 */
export type GitRemoteRead =
  | { state: "configured"; name: string; url: string }
  | { state: "remoteAbsent" }
  | { state: "noRepository" }
  | { state: "unreadable"; detail: string };

// --- ledger (doc-3) ------------------------------------------------------------------------

/**
 * One registered project. snake_case here too, and for the same reason as `CommandError`:
 * the ledger types are `Serialize`/`Deserialize` with no `rename_all`, because their other
 * format is the hand-editable `projects.toml` (doc-3 §2.2). The JSON the boundary emits
 * therefore uses the TOML key names.
 */
export interface ProjectEntry {
  slug: string;
  project_root: string;
  backlog_root: string;
  git_remote_present: boolean;
  /** Absent when the entry has no 別名表 — the field is skipped rather than sent empty. */
  status_aliases?: Record<string, string>;
}

export interface Ledger {
  schema_version: number;
  /** Named after the TOML `[[project]]` array. Its order is the default row order (doc-3 §2.2). */
  project: ProjectEntry[];
}

export interface LedgerResponse {
  ledger: Ledger;
  /** True when the on-disk schema_version is newer than this build: ledger edits are refused. */
  readOnly: boolean;
}

/**
 * Input to `ledger_register` (doc-3 §4.1). snake_case, like the ledger types it creates.
 *
 * Both optional fields mean "let the ledger decide": an absent `backlog_root` resolves to
 * `<project_root>/backlog`, and an absent `slug` is derived from the project-root directory name
 * (doc-3 §3.1). They are omitted rather than sent empty, so the default stays the Rust side's.
 */
export interface RegisterRequest {
  project_root: string;
  backlog_root?: string;
  slug?: string;
}

/** What one 登録 produced. `entry` names the registered project even when its slug was derived. */
export interface RegisterResponse {
  entry: ProjectEntry;
  ledger: LedgerResponse;
}

/** Input to `ledger_update` (doc-3 §4.3). snake_case, like the ledger types it edits. */
export interface UpdateRequest {
  slug: string;
  project_root?: string;
  backlog_root?: string;
  redetect_git_remote?: boolean;
  status_aliases?: Record<string, string>;
  /**
   * New position in the display order — the swimlane's row reorder. Applied as remove-then-
   * insert, so an adjacent index swaps the entry with that neighbour in both directions.
   */
  new_index?: number;
}

// --- command results (TASK-33) -------------------------------------------------------------

/**
 * `minimum` is Atlas's 動作確認済み版 (Rust's `MIN_VERSION`, decision-7) and rides on `unsupported`
 * alone, because that is the only screen text naming a version: it states the difference between the
 * user's CLI and Atlas's confirmed one, and both halves have to be there to state it (decision-27).
 */
export type CliReadiness =
  | { state: "ready"; version: string }
  | { state: "unavailable"; detail: string }
  | { state: "unsupported"; version: string; minimum: string };

/**
 * 解決結果の出どころ (decision-29): which step of the 外部コマンド解決の順序 produced the program in
 * use. `configured` and `onPath` can name the same path — a user may have typed exactly what PATH
 * would have found — so this is what tells the two apart, not the `program` string.
 */
export type ExternalProgramSource = "configured" | "subPackage" | "onPath";

/** Whether the resolved 外部コマンド started (decision-29 解決結果の表示). */
export type ProbeOutcome =
  | { state: "launched"; report: string }
  | { state: "failed"; detail: string };

/**
 * One row of the 解決結果の表示 (decision-29): a 外部コマンド, what it resolved to, and whether that
 * program starts. All three are reported, `backlog` included; `CliReadiness` answers the separate
 * question of whether its *version* is supported, which only that one has.
 */
export interface ExternalProgramReport {
  name: string;
  program: string;
  source: ExternalProgramSource;
  outcome: ProbeOutcome;
}

/**
 * Every failure the boundary returns. Field names are snake_case inside the variants because
 * that is what the Rust side emits — serde's container `rename_all` renames the variants
 * (`taskNotFound`), not their fields (`task_id`). Mirrored as-is rather than "corrected"
 * here, since a mismatch would fail silently at runtime.
 */
/**
 * Which 台帳操作 refusal happened (doc-3 §4). One value per refusal the ledger keeps apart, carrying
 * the input that caused it — this is what lets the 台帳管理画面 name a reason and send the user back
 * to the field that gets them past it (doc-3 §3.1 別 slug 指定で回復). `schema_version` is snake_case
 * for the usual reason: serde renames variants, not their fields.
 */
export type LedgerRefusal =
  | { reason: "readOnly"; schema_version: number }
  | { reason: "backlogRootInvalid"; path: string }
  | { reason: "invalidSlug"; slug: string }
  | { reason: "duplicateSlug"; slug: string }
  | { reason: "slugNotFound"; slug: string }
  | { reason: "nonAbsoluteRoot"; path: string }
  /** `slug` is the entry that already holds the root — the one whose form has to change. */
  | { reason: "duplicateRoot"; slug: string }
  | { reason: "invalidStatusAlias"; key: string; value: string };

export type CommandError =
  | { kind: "ledger"; detail: string }
  // A ledger *operation* turned down, as opposed to `ledger` above (the file or the plumbing failed,
  // or a cross-task-id was rejected). `detail` is the boundary's own sentence, kept for diagnostics;
  // the screen's text comes from `reason`.
  | { kind: "ledgerRefused"; reason: LedgerRefusal; detail: string }
  | { kind: "rootUnreadable"; slug: string; detail: string }
  | { kind: "unknownProject"; slug: string }
  | { kind: "projectNotOpen"; slug: string }
  | { kind: "taskNotFound"; slug: string; task_id: string }
  // Git 対象不在 / a failed Git read are not errors here: they are `CommitSearch` states, so a
  // root that is no Git repository still returns its Pull Request 区画 (decision-6, doc-8 §5).
  // アプリ設定 (decision-13): only a *save* fails — a read degrades to the defaults and says why
  // through `SettingsStatus`, so this always means the values on screen were not persisted.
  | { kind: "settings"; detail: string }
  | { kind: "updatesUnavailable"; readiness: CliReadiness }
  | { kind: "updateRejected"; detail: string }
  | { kind: "uncheckableTarget"; what: string; detail: string }
  | { kind: "reloadFailed"; detail: string; applied: unknown }
  | { kind: "versionProbeFailed"; detail: string }
  | { kind: "watchFailed"; slug: string; detail: string }
  // 外部エディタ経路 (doc-8 §7). `unknownTaskFile` is a path that is not one of the open model's task
  // files: nothing was started. The other two separate "this environment has no launcher for the
  // method you chose" from "the launcher existed and the OS refused it".
  | { kind: "unknownTaskFile"; slug: string; path: string }
  | { kind: "editorUnavailable"; detail: string }
  | { kind: "editorLaunchFailed"; method: LaunchMethod; program: string; detail: string }
  // 履歴読取の取消 (decision-19): the screen cancelled this read, so there is no answer. Carries only
  // the 読取識別子 — the screen that gets it has already stopped displaying that read, so there is
  // nothing here for it to show.
  | { kind: "historyCancelled"; read_id: string }
  // 既定ブラウザ起動 (doc-8 §9.3) did not open the 本文リンク: the URL was refused, or the OS call ran
  // and opened nothing. One variant for both, because the screen does the same thing with either —
  // ⑤ 通知 with this sentence (doc-11 §4). The program that failed, when there was one, is in `detail`.
  | { kind: "bodyLinkFailed"; detail: string };

// --- 外部エディタ経路 (doc-8 §7, TASK-37) ----------------------------------------------------

/** Which of doc-8 §7's two launch methods to use: `$VISUAL`/`$EDITOR`, or the OS association. */
export type LaunchMethod = "configured" | "association";

/**
 * 起動指定 (doc-8 §7): the program to start and the arguments preceding the file path. Also the shape
 * アプリ設定 stores it in (`AppSettings.external_editor`), so the setting and the launch agree.
 */
export interface EditorCommand {
  program: string;
  /** Arguments preceding the file path (`code -w` → `["-w"]`). */
  args: string[];
}

/** Where the 起動指定 in effect came from (doc-8 §7 の解決順: アプリ設定 → `$VISUAL` → `$EDITOR`). */
export type EditorSource = "appSettings" | "visual" | "editor";

/** The 起動指定 resolution picked, with the source it came from. */
export interface ConfiguredEditor {
  source: EditorSource;
  program: string;
  args: string[];
}

/**
 * Which launch methods the environment has. `association` is what that method invokes: a program name
 * where the platform's launcher is a program (`open`, `xdg-open`), or `ShellExecuteW` where it is a
 * Win32 call (Windows — `editor::association_launcher_of`). Never `null`: every platform this project
 * builds for has a launcher. Whether a named *program* is installed is only learned by running it.
 */
export interface EditorReadiness {
  configured: ConfiguredEditor | null;
  association: string;
}

/** What one launch did. Shown, because a terminal-only editor started from a GUI process is the
 * expected way for a launch to appear to have done nothing. `program` is the launcher (a program, or
 * `ShellExecuteW`) and `args` is what it received — an argv for a spawn, the one path parameter for
 * `ShellExecuteW`. */
export interface EditorLaunch {
  method: LaunchMethod;
  program: string;
  args: string[];
}

// --- 更新操作 (doc-5 §3, TASK-31) ------------------------------------------------------------

/**
 * The operation map's input side. Unlike everything above, these travel *to* the boundary: they
 * are `Deserialize` on the Rust side (`update.rs`), and the shapes below are what serde accepts.
 * The whole enum is declared, not only the operations the task detail screen issues, because it
 * is one contract — doc/milestone editing (TASK-40) sends the same values through the same
 * command rather than a second, parallel wire type.
 */

/** `--notes` (replace) vs `--append-notes` (append) — distinct CLI options, so distinct here. */
export type NoteEdit =
  | { mode: "keep" }
  | { mode: "set"; text: string }
  | { mode: "append"; text: string };

export interface AcItem {
  text: string;
  checked: boolean;
}

/**
 * AC の項目単位操作 と AC 全体差し替え を分けたまま送る (doc-5 §3/§3.1). `replace` is the composite
 * the adapter expands into `--remove-ac`×existing ＋ `--ac`×items ＋ `--check-ac`; `existing` is
 * the current AC count, since the removals reference the *original* 1-based indices.
 */
export type AcEdit =
  | { mode: "keep" }
  | { mode: "delta"; add: string[]; remove: number[]; check: number[]; uncheck: number[] }
  | { mode: "replace"; existing: number; items: AcItem[] };

/**
 * The combinable `task edit` facets (doc-5 §3). An absent key leaves that facet untouched; the
 * adapter refuses an edit that sets nothing. `assignee` / `references` / `dependencies` are
 * 非空全置換 — the value is the whole new set, and an empty array is refused rather than silently
 * ignored, which is what `-a ""` / `--ref ""` / `--depends-on ""` do in v1.49.3 (doc-5 §3.1).
 */
export interface TaskEdit {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  /** 担当の非空全置換 (doc-5 §3). `-a` reads its value as a comma-separated set (実測). */
  assignee?: string[];
  plan?: string;
  notes?: NoteEdit;
  addLabels?: string[];
  removeLabels?: string[];
  dependencies?: string[];
  references?: string[];
  ac?: AcEdit;
}

export interface DocUpdate {
  title?: string;
  content?: string;
  docType?: string;
  path?: string;
  tags?: string[];
}

export type MilestoneTaskHandling =
  | { mode: "clear" }
  | { mode: "keep" }
  | { mode: "reassign"; to: string };

/** One 更新操作 (doc-5 §3). Tagged `op`; the create variants carry their fields inline. */
export type UpdateOperation =
  | {
      op: "taskCreate";
      title: string;
      description?: string;
      status?: string;
      labels?: string[];
      priority?: string;
      milestone?: string;
      acceptanceCriteria?: string[];
    }
  | { op: "taskEdit"; taskId: string; edit: TaskEdit }
  | { op: "draftPromote"; draftId: string }
  | { op: "draftArchive"; draftId: string }
  | { op: "taskDemote"; taskId: string }
  | { op: "taskArchive"; taskId: string }
  | { op: "taskComplete"; taskId: string }
  | { op: "docCreate"; title: string; docType?: string; path?: string }
  | { op: "docUpdate"; docId: string; update: DocUpdate }
  | { op: "milestoneAdd"; name: string; description?: string }
  /**
   * マイルストーン説明の更新 — the 直接書き込み操作 (doc-5 §1, decision-21). The only operation whose
   * 写像先 is not a CLI sub-command: Atlas replaces 説明の本文範囲 of the milestone's file itself.
   * `description` is required and may be empty, because the empty string is the request to empty the
   * description (doc-10 §6) rather than a field left out.
   */
  | { op: "milestoneDescribe"; name: string; description: string }
  | { op: "milestoneRename"; from: string; to: string; updateTasks: boolean }
  | { op: "milestoneRemove"; name: string; taskHandling: MilestoneTaskHandling }
  | { op: "milestoneArchive"; name: string };

/**
 * How an update failed (doc-5 §5). `timedOut` is 期限到達 (decision-18): the process was still
 * running at the CLI 終了期限 and Atlas killed it, so no exit code was ever observed — which is why it
 * is not a `nonZero` with a missing code. `write` is the 直接書き込み操作 failing (decision-21): no
 * process ran, so there is neither an exit code nor a deadline, and 一時ファイル置換 means the old
 * file is still whole.
 */
export type FailureKind =
  | { kind: "spawn" }
  | { kind: "nonZero"; code: number | null }
  | { kind: "timedOut"; afterMs: number }
  | { kind: "write" };

export interface UpdateFailure {
  /**
   * The 写像先 that failed — a sub-command like `"task edit"`, or the operation's own name for the
   * 直接書き込み操作, which has no sub-command (doc-5 §1/§3).
   */
  command: string;
  kind: FailureKind;
  /** The CLI's stderr, or the write's reason — the failure reason doc-5 §5 requires showing. */
  stderr: string;
  completedBefore: number;
  /**
   * 要再読込 (doc-5 §5): Atlas cannot say the managed files are as they were, so the re-read is
   * mandatory (doc-5 §6). True for an invocation after the first (an earlier one already wrote) and
   * for every 期限到達 (the killed invocation may have written).
   */
  reloadRequired: boolean;
}

/** What became of a screen action (doc-5 §5). `failed` carries the failure's fields inline. */
export type UpdateOutcome = { state: "succeeded" } | ({ state: "failed" } & UpdateFailure);

/**
 * Which files broke 全件一致 (doc-9 §4.2.3). Two lists rather than one, because the screen has to
 * say two different things: a `diverged` member changed since Atlas read it, while an `unread` entry
 * is an active task file Atlas never read — which makes a 参照追随書き換え's 書き換え対象集合 itself
 * untrustworthy rather than any one file stale (doc-9 §4.2.3-2). A 1 対 1 操作 can only ever fill
 * `diverged`, and with exactly one entry.
 */
export interface ConflictSet {
  diverged: string[];
  unread: string[];
}

/**
 * What became of one `update_apply` (doc-9 §4). `conflict` is 更新前競合: 全件一致 broke, so **no CLI
 * ran** — `project` is the ordinary re-read that surfaces the external change (doc-9 §5). `ran` means
 * the CLI answered; `project` is present exactly when on-disk state moved and was re-read.
 */
export type UpdateResult =
  | ({ state: "conflict"; project: ProjectSnapshot } & ConflictSet)
  | { state: "ran"; outcome: UpdateOutcome; project: ProjectSnapshot | null };

/**
 * What became of one ledger entry when the workspace read it (doc-7 §6): a row that shows
 * cards, or a row that stays in place and shows why it has none.
 */
export type ProjectLoad =
  | { state: "loaded"; project: ProjectSnapshot }
  | { state: "unreadable"; slug: string; error: CommandError };

/** Payload of the `project-reloaded` event — one root re-read after an external change. */
export interface ReloadEvent {
  slug: string;
  load: ProjectLoad;
}

// --- アプリ設定 (decision-13, TASK-46) ------------------------------------------------------

/** カード情報量 (doc-7 §3): which column of the card assignment table is in force. 既定は M. */
export type CardDensity = "s" | "m" | "l";

/** 詳細配置 (doc-8 §2.1): 併置サイドバー / 中央モーダル / 全面シングルビュー. */
export type DetailPlacement = "sidebar" | "modal" | "full";

/**
 * 並び順 (doc-7 §5.4): which of the ten orders a レーンセル and the 未分類区画 lay their cards out in.
 * One flat token per order rather than an attribute paired with a direction, because these ten are
 * exactly the ten entries the 絞り込み帯's control offers (`swimlane.ts` の `CARD_ORDERS` holds what
 * each one compares, and what it is called on screen).
 */
export type CardOrder =
  | "priority_asc"
  | "priority_desc"
  | "task_id_asc"
  | "task_id_desc"
  | "updated_asc"
  | "updated_desc"
  | "created_asc"
  | "created_desc"
  | "milestone_asc"
  | "milestone_desc";

/**
 * アプリ設定 (decision-13): the display defaults that belong to no ledger entry. snake_case, like the
 * ledger's types — these names are the `settings.toml` keys too, and doc-3 §2.2's hand-editing rule
 * applies to both app-config files.
 *
 * Deliberately absent: 列折畳み・行折畳み・行非表示 (画面の一時状態, decision-13) and 起動時の全ルート
 * 読み取り (doc-9 §3.2 makes it mandatory rather than a setting).
 */
export interface AppSettings {
  schema_version: number;
  /** 表示テーマ (decision-12). `null` = 未選択, i.e. follow the OS's light/dark. */
  theme: string | null;
  card_density: CardDensity;
  /** 既定の保存区分 — the selection the filter starts with (doc-7 §5.2). */
  default_storage_filter: StorageSelection[];
  default_detail_placement: DetailPlacement;
  /** 既定の並び順 (doc-7 §5.4). The 帯's control writes it as well as the 設定画面 — choosing an order
   *  is choosing the default, the same second-writer shape 既定の詳細配置 has (doc-8 §2.2). */
  default_card_order: CardOrder;
  /** 継続検出の可否 (doc-9 §3.1). False stops every root's watch. */
  watch_external_changes: boolean;
  /**
   * 実行ファイル解決の順序 の 1 段目 (doc-5 §4, decision-16): the Backlog CLI executable to run, as an
   * absolute path. Absent — not `null` — when unset, like `external_editor`, and unset is the normal
   * case: the automatic resolution covers an npm install on all three platforms.
   */
  backlog_cli?: string;
  /**
   * 外部コマンド指定 for `git` (decision-29): the executable doc-6 §3/§5 and doc-3 §3.2 launch.
   * Absent when unset, like `backlog_cli`, and read under the same rule — used as written, with no
   * existence check and no fallback.
   */
  git_cli?: string;
  /** 外部コマンド指定 for `gh` (decision-29): the executable doc-6 §6 の GitHub 参照手段 launches. */
  gh_cli?: string;
  /** 外部エディタ指定 (doc-8 §7). Absent — not `null` — when unset: the key is skipped in the file. */
  external_editor?: EditorCommand;
}

/**
 * Why the settings in hand are what they are (decision-13). Only `readOnly` forbids saving; `absent`
 * and `unreadable` are both "running on the defaults", which the screen states (AC #6), and the next
 * save rebuilds the file.
 */
export type SettingsStatus =
  | { state: "stored" }
  | { state: "absent" }
  | { state: "unreadable"; detail: string }
  | { state: "readOnly"; version: number };

/** What `settings_read` / `settings_save` return: the values in force, and why. */
export interface LoadedSettings {
  settings: AppSettings;
  status: SettingsStatus;
}
