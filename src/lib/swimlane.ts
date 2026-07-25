/**
 * The swimlane's skeleton, as data (doc-7 §2–§5). Everything here is a pure function of the
 * boundary's payloads plus the screen's own row/filter state, so the placement rule, the cell
 * ordering and the 未対応区画 can be tested without mounting a component.
 *
 * ## Referent table (doc-7 term → identifier here)
 *
 * Fixed before the code was written, following the Rust modules' convention.
 *
 * | doc-7 | here | is |
 * |---|---|---|
 * | §1 プロジェクト別スイムレーン | [`buildSwimlane`]'s result | the whole grid: one row per visible ledger entry, in ledger order |
 * | §1 プロジェクト行 | `SwimlaneRow` | one ledger entry's row — cards, or the reason it has none |
 * | §2 正準ステータス列 | `CANONICAL_COLUMNS` | the fixed four columns, identical across rows |
 * | §1 レーンセル | `LaneCell` | one row × one canonical column, holding that column's cards |
 * | §1 タスクカード | a `TaskView` inside a cell | the display unit; `TaskCard.svelte` renders it |
 * | §2 未対応区画 | `SwimlaneRow.unmapped` | the row's tasks whose status maps to no column |
 * | §5 セル内の安定並び | `compareCards` | priority 降順 → ordinal 昇順 → updated_date 新しい順 |
 * | §6 ルート読取不能 | `SwimlaneRow` state `"unreadable"` | the row stays, with the reason instead of cards |
 * | doc-3 §5.3 横断タスクID | `crossTaskId` (`card.ts`) | `<slug>:<TASK-ID>`, always slug-prefixed on this screen |
 *
 * Row *order* is not computed here: it is the ledger's entry order (doc-3 §2.2), which the
 * caller passes in, and a reorder is written back to the ledger rather than kept on screen
 * (doc-7 §5 permits reflecting it there). Row *visibility* is the opposite — 一時的 by
 * definition — so `hidden` stays a screen-local set and never reaches the ledger.
 */

import type { CommandError, ProjectLoad, StatusColumn, TaskView } from "./wire";
import { matchesFilter, type CardFilter } from "./filter";

/** 正準ステータス列 in left-to-right order (decision-4, doc-7 §2). Fixed for every row. */
export const CANONICAL_COLUMNS: readonly StatusColumn[] = [
  "toDo",
  "inProgress",
  "inReview",
  "done",
] as const;

/**
 * What each canonical column is called on screen (decision-4). Defined beside the columns
 * themselves because the detail screen shows the same mapping — doc-8 §3 asks the heading to put
 * a task's status next to the canonical column it maps to — and two copies of these four names
 * could drift apart.
 */
export const CANONICAL_COLUMN_LABEL: Record<StatusColumn, string> = {
  toDo: "To Do",
  inProgress: "In Progress",
  inReview: "In Review",
  done: "Done",
};

/** One row × one canonical column. Empty `tasks` is an empty cell — 該当タスク無し (doc-7 §6). */
export interface LaneCell {
  column: StatusColumn;
  tasks: TaskView[];
}

/**
 * One project row. `unreadable` keeps the row in place with its reason (doc-7 §6); `pending`
 * is the window between reading the ledger and the first read of the root, which is a third
 * thing again — the row exists, and nothing is yet known about it either way.
 */
export type SwimlaneRow =
  | {
      state: "loaded";
      slug: string;
      /** `config.yml`'s project_name, for the row header beside the slug. */
      projectName: string | null;
      cells: LaneCell[];
      /** 未対応区画 — only shown when non-empty; it is not a permanent fixture (doc-7 §5). */
      unmapped: TaskView[];
      /** Cards this row holds before filtering, so "filtered to nothing" stays distinguishable. */
      totalBeforeFilter: number;
    }
  | { state: "unreadable"; slug: string; detail: string }
  | { state: "pending"; slug: string };

export interface SwimlaneInput {
  /** Slugs in ledger order — the default row order (doc-3 §2.2, doc-7 §5). */
  order: readonly string[];
  /** Each slug's read outcome; a slug with no entry yet is a `pending` row. */
  loads: ReadonlyMap<string, ProjectLoad>;
  /** Rows the user hid for now (doc-7 §5). Screen-local, never written to the ledger. */
  hidden: ReadonlySet<string>;
  filter: CardFilter;
}

/** Rank for priority 降順 (doc-7 §5). Backlog's three values; anything else sorts last. */
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function priorityRank(priority: string | null): number {
  if (priority === null) return 0;
  return PRIORITY_RANK[priority.trim().toLowerCase()] ?? 0;
}

/**
 * セル内の並び (doc-7 §5): priority 降順 → ordinal 昇順 → updated_date 新しい順.
 *
 * Ties fall through to the caller's input order, which is the read layer's path-sorted scan
 * (`read::scan` sorts before parsing) — so equal-key cards keep the same relative position
 * across reloads, which is what "更新のたびにカード位置が飛ばない" asks for. A missing key
 * sorts last within its step rather than defaulting to a value: a task with no ordinal has
 * not been placed, and putting it at 0 would jump it above tasks that were.
 */
export function compareCards(a: TaskView, b: TaskView): number {
  const priority = priorityRank(b.task.priority) - priorityRank(a.task.priority);
  if (priority !== 0) return priority;

  const ordinal = compareOptional(a.task.ordinal, b.task.ordinal, (x, y) => x - y);
  if (ordinal !== 0) return ordinal;

  // Backlog writes dates as `YYYY-MM-DD[ HH:MM]`, which orders correctly as text; comparing
  // the strings avoids inventing a timezone for a value that carries none.
  return compareOptional(a.task.updatedDate, b.task.updatedDate, (x, y) => (x < y ? 1 : x > y ? -1 : 0));
}

/** Compare two optional keys, sorting an absent one after a present one. */
function compareOptional<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/**
 * Build every visible row (doc-7 §2). Filtering takes cards away and nothing else: the four
 * columns and the project rows stay exactly as they are, so a filter can never make the grid
 * look like a different project set (doc-7 §5).
 */
export function buildSwimlane(input: SwimlaneInput): SwimlaneRow[] {
  return input.order
    .filter((slug) => !input.hidden.has(slug))
    .map((slug) => buildRow(slug, input.loads.get(slug), input.filter));
}

function buildRow(
  slug: string,
  load: ProjectLoad | undefined,
  filter: CardFilter,
): SwimlaneRow {
  if (load === undefined) return { state: "pending", slug };
  if (load.state === "unreadable") {
    return { state: "unreadable", slug, detail: unreadableDetail(load.error) };
  }

  const cells: LaneCell[] = CANONICAL_COLUMNS.map((column) => ({ column, tasks: [] }));
  const byColumn = new Map(cells.map((cell) => [cell.column, cell]));
  const unmapped: TaskView[] = [];

  for (const view of load.project.tasks) {
    if (!matchesFilter(view, filter)) continue;
    // doc-7 §4: placement is the interpretation's column, with no second rule here. No column
    // — 未対応 status, or a 解析不能 task with no status at all — goes to the 未対応区画, never
    // into a canonical column.
    const column = view.interpretation.status?.column ?? null;
    if (column === null) unmapped.push(view);
    else byColumn.get(column)?.tasks.push(view);
  }

  for (const cell of cells) cell.tasks.sort(compareCards);
  unmapped.sort(compareCards);

  return {
    state: "loaded",
    slug,
    projectName: load.project.config.projectName,
    cells,
    unmapped,
    totalBeforeFilter: load.project.tasks.length,
  };
}

/**
 * The reason a row has no cards. Only ルート読取不能 and the ledger-level failures can reach a
 * row, so the detail-carrying variants are spelled out and the rest degrade to their tag
 * rather than being flattened into one message upstream (TASK-33 keeps them apart).
 */
export function unreadableDetail(error: CommandError): string {
  switch (error.kind) {
    case "rootUnreadable":
    case "ledger":
    case "watchFailed":
    case "updateRejected":
    case "versionProbeFailed":
    case "reloadFailed":
      return error.detail;
    case "unknownProject":
      return `slug "${error.slug}" is not registered in the ledger`;
    case "projectNotOpen":
      return `slug "${error.slug}" is not open`;
    default:
      return error.kind;
  }
}
