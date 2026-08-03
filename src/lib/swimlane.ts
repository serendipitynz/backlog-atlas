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
 * | §1 レーンヘッダ行 | `Swimlane.svelte` の `.lane-head` | the row's own full-width line: name, slug, counts, row-level controls |
 * | §2.1 総件数 | [`SwimlaneTotals`] と [`totalsLabel`] | the whole grid's two ratios, beside the 画面名 |
 * | §1 列折畳み | [`columnFoldable`] / a collapsed [`GridColumn`] | one column narrowed to a band in every row at once, keeping its name |
 * | §1 行折畳み | `rowFoldable` / `laneCounts` | one row's cells folded away, keeping the per-column counts |
 * | §2.3 2 層スティッキー | `Swimlane.svelte` の `.head` / `.lane-head` と `--lane-top` | the two header rows held at the top, the lower one against the upper one's current height |
 * | §2.3 着地 | [`laneScrollDelta`] と `Swimlane.svelte` の `.lane-mark` | where the grid scrolls to for 「このプロジェクトのレーンへ」, and the marker it measures from |
 * | §5 セル内の安定並び | `compareCards` | priority 降順 → ordinal 昇順 → updated_date 新しい順 |
 * | §6 ルート読取不能 | `SwimlaneRow` state `"unreadable"` | the row stays, with the reason instead of cards |
 * | doc-3 §5.3 横断タスクID | `crossTaskId` (`card.ts`) | `<slug>:<TASK-ID>`, always slug-prefixed on this screen |
 *
 * Row *order* is not computed here: it is the ledger's entry order (doc-3 §2.2), which the
 * caller passes in, and a reorder is written back to the ledger rather than kept on screen
 * (doc-7 §5 permits reflecting it there). Row *visibility* is the opposite — 一時的 by
 * definition — so `hidden` stays a screen-local set and never reaches the ledger.
 */

import type {
  ColumnCreateStatuses,
  CommandError,
  ProjectLoad,
  StatusColumn,
  TaskView,
} from "./wire";
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

/**
 * What the 未対応区画 is called wherever it is named beside the four (doc-7 §2.2). It is not a
 * canonical column, so it has no entry in `CANONICAL_COLUMN_LABEL`; keeping the word here stops the
 * grid's column head, the folded row's counts and the detail panel's 位置表示 from drifting apart.
 */
export const UNMAPPED_LABEL = "未対応";

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
      /**
       * 列の作成時 status 候補 per canonical column (doc-7 §4.1), carried on the row because 列内新規
       * タスク入力 sits in *this project's* cells: the same column has candidates in one row and none
       * in the next, so it cannot be decided for the grid. Untouched by the filter — the entry is
       * about what may be created, not about which cards are shown.
       */
      createStatusCandidates: ColumnCreateStatuses[];
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
    createStatusCandidates: load.project.createStatusCandidates,
  };
}

// --- 折畳み (doc-7 §2.2・§2.3・§5.1) ----------------------------------------------------------

/**
 * One entry of the counts a folded row shows in place of its cells (doc-7 §2.3). 畳んでも件数は
 * 読める is the whole difference between 行折畳み and 行非表示 (doc-7 §5.1), so the folded row is
 * given the numbers as data rather than leaving each call site to count the cells again.
 */
export interface LaneCount {
  /** `null` は 未対応区画: it holds cards but is not a 正準ステータス列 (doc-7 §1). */
  column: StatusColumn | null;
  label: string;
  count: number;
}

/** Cards this row currently shows in one canonical column — the count a folded column keeps. */
export function cellCount(row: SwimlaneRow, column: StatusColumn): number {
  if (row.state !== "loaded") return 0;
  return row.cells.find((cell) => cell.column === column)?.tasks.length ?? 0;
}

/** Cards the row shows after filtering, across every column and its 未対応区画 (doc-7 §5.2 の n). */
export function visibleCount(row: SwimlaneRow): number {
  if (row.state !== "loaded") return 0;
  return row.cells.reduce((sum, cell) => sum + cell.tasks.length, 0) + row.unmapped.length;
}

/**
 * 列別の件数 for a folded row (doc-7 §2.3). The four canonical columns are always listed — a column
 * with no cards reads as 0 rather than disappearing, so the folded row and the unfolded grid line up
 * on the same four positions. The 未対応区画 joins them only while the grid is showing that column
 * (doc-7 §2.2: 該当がある間だけ現れる), which is what `withUnmapped` carries in.
 */
export function laneCounts(row: SwimlaneRow, withUnmapped: boolean): LaneCount[] {
  const counts: LaneCount[] = CANONICAL_COLUMNS.map((column) => ({
    column,
    label: CANONICAL_COLUMN_LABEL[column],
    count: cellCount(row, column),
  }));
  if (withUnmapped) {
    counts.push({
      column: null,
      label: UNMAPPED_LABEL,
      count: row.state === "loaded" ? row.unmapped.length : 0,
    });
  }
  return counts;
}

/**
 * One column of the grid: a 正準ステータス列, or the 未対応区画 while it is showing. 列折畳み reaches
 * both (doc-7 §2.2), so both need one name — the 未対応区画 is `"unmapped"` rather than a fifth member
 * of [`CANONICAL_COLUMNS`], because it is not a status and only exists while some row has a task in it.
 */
export type GridColumn = StatusColumn | "unmapped";

/**
 * Whether 列折畳み may be applied to this column, given the ones already folded (doc-7 §2.2).
 *
 * Folding is refused only for the **last open 正準ステータス列**: with all four folded there is no
 * status column left to read cards in, and the screen is a set of bands whose only way back is the
 * controls that folded them. Unfolding is never refused, so a folded column's control always works —
 * the rule blocks one direction, which is why this takes the column and not just a count.
 *
 * **The 未対応区画 does not count as the column left open**, even though it holds cards: it disappears
 * of its own accord once no row has an 未対応 status task left (doc-7 §2.2), which would leave a grid
 * whose four bands can no longer be forced open by this rule. It can itself always be folded, since
 * folding it never takes a status column away — said as its own line below rather than left to fall
 * out of the canonical test, which would answer `false` for it once all four were folded. That state
 * is unreachable through the screen, but this is an exported rule and "always" has to mean always.
 */
export function columnFoldable(collapsed: readonly GridColumn[], column: GridColumn): boolean {
  if (collapsed.includes(column)) return true;
  if (column === "unmapped") return true;
  return CANONICAL_COLUMNS.some((other) => other !== column && !collapsed.includes(other));
}

// --- 総件数 (doc-7 §2.1) -----------------------------------------------------------------------

/**
 * 総件数とは、画面名の横に出す 2 つの比 — タスク数（表示数 / 全件）とプロジェクト数（表示数 / 全件）
 * — を指す。
 *
 * The two ratios are counted over different populations on purpose, and the difference is the whole
 * reason both are shown:
 *
 * - **The cards are counted over the rows the grid is drawing.** 行非表示のレーンは表示数からも全件
 *   からも外れる, so this total is exactly the sum of the per-row 内訳 on the レーンヘッダ行 — the two
 *   are read together, and a total counting rows that are not on screen would not add up to them.
 *   Those rows are accounted for by the 行非表示 帯 instead (doc-7 §5.3 ⑥).
 * - **The lanes are counted against the ledger.** 全件 is every registered entry, so hiding a row
 *   moves 表示数 alone and the pair says how many are put away. Counting hidden rows out of both
 *   would make the two numbers equal and the ratio would say nothing.
 */
export interface SwimlaneTotals {
  /** Cards on screen after filtering, over the drawn rows. */
  shownCards: number;
  /** Cards those same rows hold before filtering. */
  totalCards: number;
  /** Rows the grid is drawing. */
  shownLanes: number;
  /** 台帳エントリ数 (doc-3 §2.2) — every registered project, hidden or not. */
  totalLanes: number;
}

/**
 * Count the grid (doc-7 §2.1). `registered` is the ledger's entry count rather than something derived
 * from `rows`, because the rows a hide took away are exactly what the lane ratio is about.
 *
 * A 読取不能行 counts as a shown lane and contributes no cards. It is on screen and it is a registered
 * project, so leaving it out of 表示数 would report fewer lanes than the user can see; its cards are a
 * separate matter — there are none to count, and 全件 is a card count, not a claim about the root.
 */
export function swimlaneTotals(
  rows: readonly SwimlaneRow[],
  registered: number,
): SwimlaneTotals {
  return {
    shownCards: rows.reduce((sum, row) => sum + visibleCount(row), 0),
    totalCards: rows.reduce(
      (sum, row) => sum + (row.state === "loaded" ? row.totalBeforeFilter : 0),
      0,
    ),
    shownLanes: rows.length,
    totalLanes: registered,
  };
}

/**
 * 総件数 as the one line the 固定ヘッダ prints (doc-7 §2.1).
 *
 * 画面設計案 01 writes the lane side as a single `{laneCount} レーン`; this puts a ratio there instead,
 * which the user chose on 2026-08-01 knowing the difference (doc-7 §2.1 records why). The word is
 * プロジェクト rather than レーン because that is the ledger's unit (doc-1) and the number now counts
 * ledger entries, not rows on screen.
 */
export function totalsLabel(totals: SwimlaneTotals): string {
  return (
    `表示 ${totals.shownCards} / ${totals.totalCards} 件` +
    ` ・ ${totals.shownLanes} / ${totals.totalLanes} プロジェクト`
  );
}

/**
 * Whether 行折畳み applies to this row. Only a loaded row has cells to fold away; 読取不能行 is
 * excluded by doc-7 §6 for exactly that reason, and a pending row has not been read yet, so folding
 * it would fold nothing and then unfold into cards that appeared meanwhile.
 */
export function rowFoldable(row: SwimlaneRow): boolean {
  return row.state === "loaded";
}

/**
 * Why 読取不能行 gets no 行折畳み. Written as a sentence next to the row rather than as a disabled
 * button: doc-7 §4.1 draws the same distinction for 列内新規タスク入力 — an operation Atlas does not
 * place says why it is absent, which is not the same as an operation that is there but blocked
 * (doc-11 §5).
 */
export const ROW_FOLD_ABSENT_REASON =
  "ルートが読めず畳む対象のセルがないため、この行に行折畳みは置きません（doc-7 §6）。行非表示は使えます。";

/**
 * Why the last open column's 列折畳み is blocked (doc-7 §2.2). This one *is* placed and disabled —
 * unlike the two above, the control exists in every canonical column head and only its last instance
 * is refused, so removing it would make the heads differ in what they hold (doc-11 §5).
 */
export const LAST_COLUMN_FOLD_BLOCKED_REASON =
  "残り 1 列は畳めません。すべて畳むと、どの列のカードも読めない画面になります（doc-7 §2.2）。";

// --- 2 層スティッキーへの着地 (doc-7 §2.3, doc-10 §2) -----------------------------------------

/** What the grid measures before it scrolls a lane into view. All lengths are CSS pixels. */
export interface LaneLanding {
  /**
   * The lane's start, from the top of the grid's scrollport — negative once it has scrolled past.
   * Read from the row's anchor rather than from its レーンヘッダ行: the header is sticky, so while it
   * is held at the top its own position reads as `headHeight` however far the row is above.
   */
  offset: number;
  /** The 列ヘッダ行's current height, which is what the レーンヘッダ行 is stuck below. */
  headHeight: number;
  /** The レーンヘッダ行's own height. Sticky does not change it, so it can be measured anywhere. */
  laneHeight: number;
  /** The scrollport's height. */
  viewportHeight: number;
}

/**
 * How far the grid must scroll for a lane's header to be whole and unobscured, or 0 when it already
 * is — the 着地 of 「このプロジェクトのレーンへ」 (doc-10 §2).
 *
 * Both header rows are sticky (doc-7 §2.3), so the two ways a lane header can be unreadable are not
 * symmetric: above, it is *behind* the 列ヘッダ行 rather than off the screen, which no scroll position
 * reports as out of view. That is why the test is against `headHeight` and not against 0, and why the
 * landing puts the lane's start exactly at the 列ヘッダ行's lower edge instead of at the scrollport's.
 */
export function laneScrollDelta(landing: LaneLanding): number {
  const behindTheHead = landing.offset < landing.headHeight;
  const pastTheBottom = landing.offset + landing.laneHeight > landing.viewportHeight;
  return behindTheHead || pastTheBottom ? landing.offset - landing.headHeight : 0;
}

// --- 前後移動 (doc-8 §2.2) ------------------------------------------------------------------

/**
 * Where one task sits among the cards it is shown beside, and which cards those neighbours are
 * (doc-8 §2.2 前後移動). Computed from the built rows rather than from the snapshot, so the move
 * follows exactly what the grid shows: the same filter, the same 安定並び (§5.4), the same row.
 */
export interface LaneNeighbours {
  /**
   * The group the task is in. 未対応区画 is not a レーンセル (doc-7 §1 makes a cell a row × a
   * canonical column), but it is the run of cards the task is actually shown in — so moving through
   * it is the same operation, and naming it apart keeps the position label honest.
   */
  group: { kind: "column"; column: StatusColumn } | { kind: "unmapped" };
  /** 1-based position within the group, and how many cards it holds — doc-8 §2.2's セル内 n / m 件. */
  position: number;
  total: number;
  previous: TaskView | null;
  next: TaskView | null;
}

/**
 * Find one task's neighbours in the grid as drawn. `null` when the task is not on the grid at all —
 * its row is hidden or unreadable, or the filter took the card away — which is a state the panel
 * states rather than a move it offers: the detail panel can be open on a task the grid is not
 * currently showing, and inventing an order for cards that are not there would move the user to a
 * task they cannot see.
 */
export function laneNeighbours(
  rows: readonly SwimlaneRow[],
  ref: { slug: string; sourcePath: string },
): LaneNeighbours | null {
  const row = rows.find((candidate) => candidate.slug === ref.slug);
  if (row === undefined || row.state !== "loaded") return null;
  const groups: { group: LaneNeighbours["group"]; tasks: TaskView[] }[] = [
    ...row.cells.map((cell) => ({
      group: { kind: "column" as const, column: cell.column },
      tasks: cell.tasks,
    })),
    { group: { kind: "unmapped" as const }, tasks: row.unmapped },
  ];
  for (const { group, tasks } of groups) {
    const at = tasks.findIndex((view) => view.task.sourcePath === ref.sourcePath);
    if (at === -1) continue;
    return {
      group,
      position: at + 1,
      total: tasks.length,
      previous: tasks[at - 1] ?? null,
      next: tasks[at + 1] ?? null,
    };
  }
  return null;
}

/** doc-8 §2.2 の位置表示: which cell, and where in it. */
export function laneNeighbourLabel(neighbours: LaneNeighbours): string {
  const where =
    neighbours.group.kind === "column"
      ? CANONICAL_COLUMN_LABEL[neighbours.group.column]
      : UNMAPPED_LABEL;
  return `${where} セル内 ${neighbours.position} / ${neighbours.total} 件`;
}

/** Why 前後移動 is not offered, when it is not (doc-11 §5: a withheld control says why). */
export const NO_LANE_CELL_REASON =
  "このタスクは今のスイムレーンに出ていないため（行の非表示・ルート読取不能・絞り込みのいずれか）、" +
  "前後のタスクを決められません。";

/**
 * The reason a row has no cards. Only ルート読取不能 and the ledger-level failures can reach a
 * row, so the detail-carrying variants are spelled out and the rest degrade to their tag
 * rather than being flattened into one message upstream (TASK-33 keeps them apart).
 */
export function unreadableDetail(error: CommandError): string {
  switch (error.kind) {
    case "rootUnreadable":
    case "ledger":
    case "settings":
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
