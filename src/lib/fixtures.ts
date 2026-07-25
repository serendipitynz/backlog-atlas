/**
 * Test fixtures: the boundary's payloads with every field filled in, so a test names only the
 * facet it is about. Not imported by the app — the swimlane's own tests are its only consumer.
 */

import type {
  Config,
  ProjectLoad,
  ProjectSnapshot,
  StatusColumn,
  StatusMapping,
  StorageState,
  Task,
  TaskHealth,
  TaskView,
  TypeValue,
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
  /** The canonical column the interpretation resolved to; `null` is 未対応 status. */
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
  health?: TaskHealth;
  sourcePath?: string;
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
    milestone: null,
    createdDate: null,
    updatedDate: options.updatedDate ?? null,
    dependencies: [],
    documentation: [],
    references: [],
    description: null,
    acceptanceCriteria: [],
    implementationPlan: null,
    implementationNotes: null,
    unknownSections: [],
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

  return { task, interpretation: { status: mapping, types: options.types ?? [] } };
}

export function type(value: string, known = true): TypeValue {
  return { value, known };
}

export function loaded(slug: string, tasks: TaskView[]): ProjectLoad {
  const project: ProjectSnapshot = {
    slug,
    config: CONFIG,
    tasks,
    milestones: [],
    documents: [],
    decisions: [],
  };
  return { state: "loaded", project };
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
