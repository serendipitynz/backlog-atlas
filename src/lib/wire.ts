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
}

/** One task with Atlas's reading of it beside it, never merged into it. */
export interface TaskView {
  task: Task;
  interpretation: TaskInterpretation;
}

export interface ProjectSnapshot {
  slug: string;
  config: Config;
  tasks: TaskView[];
  milestones: Milestone[];
  documents: Document[];
  decisions: Decision[];
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
export type CommandError =
  | { kind: "ledger"; detail: string }
  | { kind: "rootUnreadable"; slug: string; detail: string }
  | { kind: "unknownProject"; slug: string }
  | { kind: "projectNotOpen"; slug: string }
  | { kind: "taskNotFound"; slug: string; task_id: string }
  | { kind: "notAGitRepo"; project_root: string }
  | { kind: "gitFailed"; detail: string }
  | { kind: "updatesUnavailable"; readiness: CliReadiness }
  | { kind: "updateRejected"; detail: string }
  | { kind: "uncheckableTarget"; what: string; detail: string }
  | { kind: "reloadFailed"; detail: string; applied: unknown }
  | { kind: "versionProbeFailed"; detail: string }
  | { kind: "watchFailed"; slug: string; detail: string };

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
