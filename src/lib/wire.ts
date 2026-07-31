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

/** Per-task parse health (doc-4 §5). `degraded` is the 縮退印 the card shows (doc-7 §3). */
export type TaskHealth = { state: "ok" } | { state: "degraded"; events: DegradeEvent[] };

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
  /** kind-label-derived Type candidates. Named `type` on the wire by doc-4 §3.1. */
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
  health: TaskHealth;
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
}

export interface Decision {
  id: string;
  title: string;
  status: string | null;
  date: string | null;
  body: string | null;
}

// --- interpretation (TASK-29, decision-4 / decision-5) -------------------------------------

/** 正準ステータス列 (decision-4). The four fixed columns, in left-to-right order. */
export type StatusColumn = "toDo" | "inProgress" | "inReview" | "done";

export type StatusDeclaration = "declared" | "draft" | "undeclared" | "noDeclaredSet";

export interface StatusMapping {
  /** The status exactly as the frontmatter wrote it — what the 未対応区画 shows (decision-4). */
  raw: string;
  /** `null` is 未対応 status: the task belongs in the row's 未対応区画, never in a column. */
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
 * Why a Pull Request's commit set could not be fetched (doc-6 §6). Typed because the three differ in
 * what would clear them, which doc-8 §5 asks the screen to state: `toolMissing` clears by installing
 * the reference means, `invalidReference` by editing the task's References, and `queryFailed` is a
 * query that ran and failed — auth, permission, a deleted PR or the network, undecidable from here.
 */
export type LookupFailure = "toolMissing" | "invalidReference" | "queryFailed";

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

export type CliReadiness =
  | { state: "ready"; version: string }
  | { state: "unavailable"; detail: string }
  | { state: "unsupported"; version: string; minimum: string };

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
  | { kind: "editorLaunchFailed"; method: LaunchMethod; program: string; detail: string };

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
 * adapter refuses an edit that sets nothing. `references` / `dependencies` are 非空全置換 — the
 * value is the whole new set, and an empty array is refused rather than silently ignored, which
 * is what `--ref ""` / `--depends-on ""` do in v1.47.1 (doc-5 §3.1). `assignee` is a single value,
 * not a list: `-a` takes one, and the write replaces the whole frontmatter list (doc-5 §3, 実測).
 */
export interface TaskEdit {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  /** 担当の設定・付け替え (doc-5 §3). A blank value is refused — the CLI cannot unassign. */
  assignee?: string;
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
  | { op: "milestoneRename"; from: string; to: string; updateTasks: boolean }
  | { op: "milestoneRemove"; name: string; taskHandling: MilestoneTaskHandling }
  | { op: "milestoneArchive"; name: string };

/** How a CLI invocation failed (doc-5 §5). */
export type FailureKind = { kind: "spawn" } | { kind: "nonZero"; code: number | null };

export interface UpdateFailure {
  /** The sub-command that failed, e.g. `"task edit"`. */
  command: string;
  kind: FailureKind;
  /** The CLI's stderr — the failure reason doc-5 §5 requires showing. */
  stderr: string;
  completedBefore: number;
  /** Earlier invocations already changed disk, so the re-read is mandatory (doc-5 §6). */
  partial: boolean;
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
  /** 継続検出の可否 (doc-9 §3.1). False stops every root's watch. */
  watch_external_changes: boolean;
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
