/**
 * Test fixtures: the boundary's payloads with every field filled in, so a test names only the
 * facet it is about. Not imported by the app — the swimlane's own tests are its only consumer.
 */

import type {
  AcceptanceCriterion,
  ColumnCreateStatuses,
  Commit,
  CommitSearch,
  Config,
  Document,
  Milestone,
  ProjectEntry,
  ProjectLoad,
  ProjectSnapshot,
  PrRelation,
  PullRequestRef,
  StatusColumn,
  StatusMapping,
  StorageState,
  Task,
  FileHealth,
  TaskHistory,
  TaskView,
  TypeValue,
  UnknownSection,
} from "./wire";

export const CONFIG: Config = {
  projectName: "Atlas",
  taskPrefix: "TASK",
  statuses: ["To Do", "In Progress", "In Review", "Done"],
  defaultStatus: "To Do",
  dateFormat: null,
};

export interface TaskViewOptions {
  id?: string | null;
  project?: string;
  title?: string | null;
  /** The canonical column the interpretation resolved to; `null` is 未分類 status. */
  column?: StatusColumn | null;
  /** The raw frontmatter status. `null` means the task carries none at all (解析不能). */
  status?: string | null;
  storageState?: StorageState | null;
  priority?: string | null;
  ordinal?: number | null;
  updatedDate?: string | null;
  labels?: string[];
  types?: TypeValue[];
  assignee?: string[];
  health?: FileHealth;
  sourcePath?: string;
  /** Extracted PR URLs — the interpretation's view of `references` (doc-6 §4, doc-8 §4). */
  pullRequests?: PullRequestRef[];
  milestone?: string | null;
  dependencies?: string[];
  references?: string[];
  documentation?: string[];
  description?: string | null;
  acceptanceCriteria?: AcceptanceCriterion[];
  implementationPlan?: string | null;
  implementationNotes?: string | null;
  unknownSections?: UnknownSection[];
  createdDate?: string | null;
}

export function taskView(options: TaskViewOptions = {}): TaskView {
  const id = options.id === undefined ? "TASK-1" : options.id;
  const status = options.status === undefined ? "To Do" : options.status;
  const task: Task = {
    sourcePath: options.sourcePath ?? `backlog/tasks/task-${id ?? "x"}.md`,
    project: options.project ?? "atlas",
    storageState: options.storageState === undefined ? "active" : options.storageState,
    id,
    title: options.title === undefined ? `Task ${id}` : options.title,
    status,
    type: (options.types ?? []).map((type) => type.value),
    labels: options.labels ?? [],
    assignee: options.assignee ?? [],
    priority: options.priority ?? null,
    ordinal: options.ordinal ?? null,
    milestone: options.milestone ?? null,
    createdDate: options.createdDate ?? null,
    updatedDate: options.updatedDate ?? null,
    dependencies: options.dependencies ?? [],
    documentation: options.documentation ?? [],
    references: options.references ?? [],
    description: options.description ?? null,
    acceptanceCriteria: options.acceptanceCriteria ?? [],
    implementationPlan: options.implementationPlan ?? null,
    implementationNotes: options.implementationNotes ?? null,
    unknownSections: options.unknownSections ?? [],
    health: options.health ?? { state: "ok" },
  };

  const mapping: StatusMapping | null =
    status === null
      ? null
      : {
          raw: status,
          column: options.column === undefined ? "toDo" : options.column,
          declaration: "declared",
        };

  return {
    task,
    interpretation: {
      status: mapping,
      types: options.types ?? [],
      pullRequests: options.pullRequests ?? [],
    },
  };
}

export function type(value: string, known = true): TypeValue {
  return { value, known };
}

/**
 * 列の作成時 status 候補 for [`CONFIG`] (doc-7 §4.1): its four declared statuses name-match one column
 * each. Written out rather than derived, so a test that changes the candidates changes them here and
 * not by re-deriving the rule the boundary owns.
 */
export const CREATE_STATUS_CANDIDATES: ColumnCreateStatuses[] = [
  { column: "toDo", statuses: ["To Do"] },
  { column: "inProgress", statuses: ["In Progress"] },
  { column: "inReview", statuses: ["In Review"] },
  { column: "done", statuses: ["Done"] },
];

/**
 * One 文書 as the read layer hands it over. Every field filled in, as everything here is.
 *
 * The nullable fields take `=== undefined` rather than `??`, following `taskView`: `null` is a value
 * the screen draws differently (「type 未設定」,「本文はありません。」in doc-10 §5's 閲覧), so a `??`
 * would silently hand back the default and make those branches untestable.
 */
export function documentView(options: Partial<Document> = {}): Document {
  const id = options.id ?? "doc-1";
  return {
    sourcePath: options.sourcePath ?? `/repos/atlas/backlog/docs/${id}.md`,
    id,
    title: options.title ?? `Document ${id}`,
    type: options.type === undefined ? "specification" : options.type,
    tags: options.tags ?? ["design"],
    createdDate: options.createdDate === undefined ? "2026-08-01 09:00" : options.createdDate,
    updatedDate: options.updatedDate === undefined ? "2026-08-01 09:00" : options.updatedDate,
    body: options.body === undefined ? "本文の 1 行目\n本文の 2 行目" : options.body,
    health: options.health ?? { state: "ok" },
  };
}

export function snapshot(
  slug: string,
  tasks: TaskView[],
  milestones: Milestone[] = [],
  createStatusCandidates: ColumnCreateStatuses[] = CREATE_STATUS_CANDIDATES,
  documents: Document[] = [],
): ProjectSnapshot {
  return {
    slug,
    config: CONFIG,
    tasks,
    milestones,
    documents,
    decisions: [],
    unmappedFiles: [],
    createStatusCandidates,
  };
}

export function loaded(
  slug: string,
  tasks: TaskView[],
  createStatusCandidates: ColumnCreateStatuses[] = CREATE_STATUS_CANDIDATES,
  documents: Document[] = [],
): ProjectLoad {
  return {
    state: "loaded",
    project: snapshot(slug, tasks, [], createStatusCandidates, documents),
  };
}

export function entry(slug: string, gitRemotePresent = true): ProjectEntry {
  return {
    slug,
    project_root: `/repos/${slug}`,
    backlog_root: `/repos/${slug}/backlog`,
    git_remote_present: gitRemotePresent,
  };
}

export function commit(id: string, summary: string, date = "2026-07-20T10:00:00+09:00"): Commit {
  return { id, shortId: id.slice(0, 7), summary, date, author: "Someone" };
}

export function pullRequest(url: string, number: number | null = null): PullRequestRef {
  return { url, host: "gitHub", owner: "serendipitynz", repo: "backlog-atlas", number };
}

export function history(options: {
  commits?: CommitSearch;
  remote?: TaskHistory["remote"];
  relations?: PrRelation[];
} = {}): TaskHistory {
  return {
    commits: options.commits ?? { state: "searched", commits: [] },
    // `null` is a meaningful value here (remote 不在 / 判別不能), so only an absent key defaults.
    remote:
      options.remote === undefined
        ? { kind: "gitHub", owner: "serendipitynz", repo: "backlog-atlas" }
        : options.remote,
    relations: options.relations ?? [],
  };
}

/** One 関連解決 result (doc-6 §6). The outcome is spelled out by the caller — that is the fact. */
export function relation(pullRequest: string, outcome: PrRelation["outcome"]): PrRelation {
  return { pullRequest, outcome };
}

export function unreadable(slug: string, detail = "config.yml not found"): ProjectLoad {
  return { state: "unreadable", slug, error: { kind: "rootUnreadable", slug, detail } };
}

/** The `loads` map `buildSwimlane` takes, keyed by slug. */
export function loadMap(...loads: ProjectLoad[]): Map<string, ProjectLoad> {
  return new Map(
    loads.map((load) => [load.state === "loaded" ? load.project.slug : load.slug, load]),
  );
}
