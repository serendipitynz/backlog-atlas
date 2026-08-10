/**
 * The swimlane's skeleton, as data (doc-7 §2–§5). Everything here is a pure function of the
 * boundary's payloads plus the screen's own row/filter state, so the placement rule, the cell
 * ordering and the 未分類区画 can be tested without mounting a component.
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
 * | §2 未分類区画 | `SwimlaneRow.unmapped` | the row's tasks whose status maps to no column |
 * | §1 レーンヘッダ行 | `Swimlane.svelte` の `.lane-head` | the row's own full-width line: name, slug, counts, row-level controls |
 * | §2.1 総件数 | [`SwimlaneTotals`] と [`totalsLabel`] | the whole grid's two ratios, beside the 画面名 |
 * | §1 列折畳み | [`columnFoldable`] / a collapsed [`GridColumn`] | one column narrowed to a band in every row at once, keeping its name |
 * | §1 行折畳み | `rowFoldable` / `laneCounts` | one row's cells folded away, keeping the per-column counts |
 * | §2.3 2 層スティッキー | `Swimlane.svelte` の `.head` / `.lane-head` と `--lane-top` | the two header rows held at the top, the lower one against the upper one's current height |
 * | §2.3 着地 | [`laneScrollDelta`] と `Swimlane.svelte` の `.lane-mark` | where the grid scrolls to for 「このプロジェクトのレーンへ」, and the marker it measures from |
 * | §5.4 並び順 | [`CARD_ORDERS`] | the ten orders the 帯 offers: what each compares, and its screen word |
 * | §5.4 同順のときの比較規則 | [`cardComparator`] | the chosen order, then the 既定の 3 段, then the read order |
 * | §5.4 既定の並び順 | [`DEFAULT_CARD_ORDER`] | `priority_desc`, which with the tie-break is the order this screen had before the choice existed |
 * | §6 ルート読取不能 | `SwimlaneRow` state `"unreadable"` | the row stays, with the reason instead of cards |
 * | doc-3 §5.3 横断タスクID | `crossTaskId` (`card.ts`) | `<slug>:<TASK-ID>`, always slug-prefixed on this screen |
 *
 * Row *order* is not computed here: it is the ledger's entry order (doc-3 §2.2), which the
 * caller passes in, and a reorder is written back to the ledger rather than kept on screen
 * (doc-7 §5 permits reflecting it there). Row *visibility* is the opposite — 一時的 by
 * definition — so `hidden` stays a screen-local set and never reaches the ledger.
 */

import type {
  CardOrder,
  ColumnCreateStatuses,
  CommandError,
  ProjectLoad,
  StatusColumn,
  TaskView,
} from "./wire";
import { matchesFilter, type CardFilter, type InconsistentLookup } from "./filter";
import type { IconName } from "./icons/lucide";

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
 * What the 未分類区画 is called wherever it is named beside the four (doc-7 §2.2). It is not a
 * canonical column, so it has no entry in `CANONICAL_COLUMN_LABEL`; keeping the word here stops the
 * grid's column head, the folded row's counts and the detail panel's 前後移動 controls (through
 * [`laneGroupLabel`]) from drifting apart.
 *
 * Not the detail panel's 位置表示: that prints a count alone and names no group (doc-8 §2.2, TASK-72).
 */
export const UNMAPPED_LABEL = "未分類";

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
      /** 未分類区画 — only shown when non-empty; it is not a permanent fixture (doc-7 §5). */
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
  /** 並び順 (doc-7 §5.4) — the same one for every cell, since it is a property of the screen. */
  cardOrder: CardOrder;
  /**
   * Whether one task is 不整合 (decision-22) — the 不整合 facet's predicate. Supplied by the shell
   * because バージョン不整合 lives in its record rather than in the read (`lib/mark.ts`).
   */
  inconsistent: InconsistentLookup;
}

/**
 * Rank for priority (doc-7 §5.4). Backlog's three values, and 0 for 段なし — priority 未設定 and
 * priority 未知 alike (`card.ts` の `priorityStep` says why those two are one state).
 *
 * **段なし is a rank, not a missing key**, which is why it follows the direction the user chose
 * instead of staying at the end like the four attributes below: doc-7 §5.4 makes it the lowest of
 * four steps, so 昇順 starts there. decision-23 declining to colour it is about the card, not the order.
 */
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function priorityRank(priority: string | null): number {
  if (priority === null) return 0;
  return PRIORITY_RANK[priority.trim().toLowerCase()] ?? 0;
}

type Comparator = (a: TaskView, b: TaskView) => number;

/** 昇順 as `1`, 降順 as `-1` — the sign every rule below multiplies its ascending answer by. */
const ASC = 1;
const DESC = -1;

/**
 * Compare a key that a task may not carry at all, with the absent one **always last** whichever
 * direction was chosen (doc-7 §5.4). The direction reaches only the comparison of two present
 * values: 欠落は値ではない, so reversing must not float it to the top — a task with no ordinal has
 * not been placed, and a task with no date is not the oldest one.
 */
function byOptional<T>(
  read: (view: TaskView) => T | null,
  compare: (a: T, b: T) => number,
  direction: number,
): Comparator {
  return (a, b) => {
    const x = read(a);
    const y = read(b);
    if (x === null && y === null) {
      return 0;
    }
    if (x === null) {
      return 1;
    }
    if (y === null) {
      return -1;
    }
    return direction * compare(x, y);
  };
}

function byPriority(direction: number): Comparator {
  return (a, b) => direction * (priorityRank(a.task.priority) - priorityRank(b.task.priority));
}

// Backlog writes dates as `YYYY-MM-DD[ HH:MM]`, which orders correctly as text; comparing the
// strings avoids inventing a timezone for a value that carries none.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare two identifiers with their digit runs read as numbers (doc-7 §5.4): `TASK-2` before
 * `TASK-10`, `m-2` before `m-10`.
 *
 * **No locale is consulted.** `Intl.Collator(…, { numeric: true })` answers this correctly and
 * agreed across en/ja/de/tr/sv when measured, but its result is a function of the runtime's default
 * locale, and the same ledger reading differently on two machines is exactly what the ordering
 * contract promises it will not do — the same reason the dates above are compared as text rather
 * than parsed into a timezone.
 *
 * Outside the digit runs this compares UTF-16 code units, which is an arbitrary order but a total
 * and stable one; what the contract needs of the non-numeric part is only that it never disagrees
 * with itself.
 */
function compareNumberAware(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const endA = digitRunEnd(a, i);
    const endB = digitRunEnd(b, j);
    if (endA !== null && endB !== null) {
      const byNumber = compareDigitRuns(a.slice(i, endA), b.slice(j, endB));
      if (byNumber !== 0) {
        return byNumber;
      }
      i = endA;
      j = endB;
      continue;
    }
    if (a[i] !== b[j]) {
      return a[i] < b[j] ? -1 : 1;
    }
    i += 1;
    j += 1;
  }
  // One ran out first: the shorter remainder sorts first (`TASK-1` before `TASK-1.1`).
  return Math.sign(a.length - i - (b.length - j));
}

/** Where the run of digits starting at `at` ends, or `null` when there is no digit there. */
function digitRunEnd(text: string, at: number): number | null {
  let end = at;
  while (end < text.length && text[end] >= "0" && text[end] <= "9") {
    end += 1;
  }
  return end === at ? null : end;
}

/**
 * Two runs of digits as numbers, without going through `Number` — a Backlog id is not bounded by
 * `Number.MAX_SAFE_INTEGER` in any way this code could rely on, and parsing would make two distinct
 * ids compare equal once past it.
 */
function compareDigitRuns(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  if (x.length !== y.length) {
    return x.length < y.length ? -1 : 1;
  }
  if (x !== y) {
    return x < y ? -1 : 1;
  }
  // Same value, different spelling (`TASK-01` vs `TASK-1`): decided by the written form, so the
  // order stays total rather than falling through to the read order for two different ids.
  return Math.sign(a.length - b.length);
}

/** What one 並び順 compares first, and what it is called wherever the choice is offered. */
export interface CardOrderRule {
  /** The screen's word for it (doc-7 §5.4 の表). Attribute names follow doc-8 §3 の主要属性. */
  label: string;
  compare: Comparator;
}

/**
 * 並び順 (doc-7 §5.4) — the ten orders, in the order the 帯's control and the 設定画面 list them.
 *
 * The attribute order comes from the 原文 (2026-08-09 のユーザーの要求); **the direction order is
 * 昇順 then 降順 for every one of them**, which is where this departs from the 原文 — that listing put
 * priority's 降順 first, and one attribute reading backwards among five is the thing a reader notices
 * before anything else (2026-08-10 のユーザー判断). The 既定 is `priority_desc` whatever position it
 * ends up in: the list's order is the screen's, and the `<select>` shows the value in force rather
 * than its first entry.
 *
 * The 並び順 a card is laid out by is `task.id`, **not** the 横断タスクID: a レーンセル holds one
 * project's cards, so the slug prefix is the same on all of them and would only cost a comparison.
 */
export const CARD_ORDERS: Record<CardOrder, CardOrderRule> = {
  priority_asc: { label: "priority 昇順", compare: byPriority(ASC) },
  priority_desc: { label: "priority 降順", compare: byPriority(DESC) },
  task_id_asc: {
    label: "task id 昇順",
    compare: byOptional((view) => view.task.id, compareNumberAware, ASC),
  },
  task_id_desc: {
    label: "task id 降順",
    compare: byOptional((view) => view.task.id, compareNumberAware, DESC),
  },
  updated_asc: {
    label: "updated 昇順",
    compare: byOptional((view) => view.task.updatedDate, compareText, ASC),
  },
  updated_desc: {
    label: "updated 降順",
    compare: byOptional((view) => view.task.updatedDate, compareText, DESC),
  },
  created_asc: {
    label: "created 昇順",
    compare: byOptional((view) => view.task.createdDate, compareText, ASC),
  },
  created_desc: {
    label: "created 降順",
    compare: byOptional((view) => view.task.createdDate, compareText, DESC),
  },
  milestone_asc: {
    label: "milestone 昇順",
    compare: byOptional((view) => view.task.milestone, compareNumberAware, ASC),
  },
  milestone_desc: {
    label: "milestone 降順",
    compare: byOptional((view) => view.task.milestone, compareNumberAware, DESC),
  },
};

/**
 * The ten as a list, for the controls that offer them (the 帯 and the 設定画面). Derived from the
 * record rather than written out a second time, so the two cannot come to hold different sets;
 * `Object.entries` widens the key to `string`, which is what the annotation puts back.
 */
export const CARD_ORDER_CHOICES = Object.entries(CARD_ORDERS) as [CardOrder, CardOrderRule][];

/** 既定の並び順 (doc-7 §5.4) — the order in force before the settings read answers. */
export const DEFAULT_CARD_ORDER: CardOrder = "priority_desc";

/**
 * 同順のときの比較規則 (doc-7 §5.4): the 既定の 3 段, run after whichever order the user chose.
 *
 * The same three for all ten, including the three that read a key the chosen order has already
 * compared — a tie on that key means the values are equal, so its step here answers 0 and costs
 * nothing. Writing it as one list rather than as a per-order remainder is what makes 既定 (
 * `priority_desc`) come out identical to the single order this screen had before the choice
 * existed: its first step below is the no-op, and steps 2 and 3 are the other two the old
 * comparator had.
 */
const TIE_BREAK: readonly Comparator[] = [
  byPriority(DESC),
  byOptional((view) => view.task.ordinal, (x, y) => Math.sign(x - y), ASC),
  byOptional((view) => view.task.updatedDate, compareText, DESC),
];

/**
 * The comparator for one 並び順 (doc-7 §5.4): the chosen order, then the 既定の 3 段.
 *
 * What is *not* here is the last step the contract names — 読み取り順. Two cards that survive every
 * step above compare equal, and `Array.prototype.sort` is stable, so they keep the order they
 * arrived in: the read layer's path-sorted scan (`read::scan` sorts before parsing). That is what
 * keeps positions from jumping between reloads, and it is a property of the sort rather than of a
 * comparison, so a fourth step here would have to invent a key the cards do not carry.
 */
export function cardComparator(order: CardOrder): Comparator {
  const chosen = CARD_ORDERS[order].compare;
  return (a, b) => {
    const answer = chosen(a, b);
    if (answer !== 0) {
      return answer;
    }
    for (const step of TIE_BREAK) {
      const broken = step(a, b);
      if (broken !== 0) {
        return broken;
      }
    }
    return 0;
  };
}

/**
 * Build every visible row (doc-7 §2). Filtering takes cards away and nothing else: the four
 * columns and the project rows stay exactly as they are, so a filter can never make the grid
 * look like a different project set (doc-7 §5).
 */
export function buildSwimlane(input: SwimlaneInput): SwimlaneRow[] {
  // Built once for the whole grid rather than per cell: the comparator is the same for every cell,
  // and the chosen rule is looked up by token.
  const compare = cardComparator(input.cardOrder);
  return input.order
    .filter((slug) => !input.hidden.has(slug))
    .map((slug) => buildRow(slug, input.loads.get(slug), input.filter, input.inconsistent, compare));
}

function buildRow(
  slug: string,
  load: ProjectLoad | undefined,
  filter: CardFilter,
  inconsistent: InconsistentLookup,
  compare: Comparator,
): SwimlaneRow {
  if (load === undefined) return { state: "pending", slug };
  if (load.state === "unreadable") {
    return { state: "unreadable", slug, detail: unreadableDetail(load.error) };
  }

  const cells: LaneCell[] = CANONICAL_COLUMNS.map((column) => ({ column, tasks: [] }));
  const byColumn = new Map(cells.map((cell) => [cell.column, cell]));
  const unmapped: TaskView[] = [];

  for (const view of load.project.tasks) {
    if (!matchesFilter(view, filter, inconsistent)) continue;
    // doc-7 §4: placement is the interpretation's column, with no second rule here. No column
    // — 未分類 status, or a 解析不能 task with no status at all — goes to the 未分類区画, never
    // into a canonical column.
    const column = view.interpretation.status?.column ?? null;
    if (column === null) unmapped.push(view);
    else byColumn.get(column)?.tasks.push(view);
  }

  for (const cell of cells) {
    cell.tasks.sort(compare);
  }
  unmapped.sort(compare);

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
  /** `null` は 未分類区画: it holds cards but is not a 正準ステータス列 (doc-7 §1). */
  column: StatusColumn | null;
  label: string;
  count: number;
}

/** Cards this row currently shows in one canonical column — the count a folded column keeps. */
export function cellCount(row: SwimlaneRow, column: StatusColumn): number {
  if (row.state !== "loaded") return 0;
  return row.cells.find((cell) => cell.column === column)?.tasks.length ?? 0;
}

/** Cards the row shows after filtering, across every column and its 未分類区画 (doc-7 §5.2 の n). */
export function visibleCount(row: SwimlaneRow): number {
  if (row.state !== "loaded") return 0;
  return row.cells.reduce((sum, cell) => sum + cell.tasks.length, 0) + row.unmapped.length;
}

/**
 * 列別の件数 for a folded row (doc-7 §2.3). The four canonical columns are always listed — a column
 * with no cards reads as 0 rather than disappearing, so the folded row and the unfolded grid line up
 * on the same four positions. The 未分類区画 joins them only while the grid is showing that column
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
 * One column of the grid: a 正準ステータス列, or the 未分類区画 while it is showing. 列折畳み reaches
 * both (doc-7 §2.2), so both need one name — the 未分類区画 is `"unmapped"` rather than a fifth member
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
 * **The 未分類区画 does not count as the column left open**, even though it holds cards: it disappears
 * of its own accord once no row has an 未分類 status task left (doc-7 §2.2), which would leave a grid
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
 *   Those rows are accounted for by the lane ratio below, and named one by one in the メニューの
 *   プロジェクト一覧 (doc-7 §2.1).
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
  "ルートが読めず畳む対象のセルがないため、この行に行折畳みは置きません。" +
  "この行を画面から外すには、ヘッダのメニューのプロジェクト一覧を使います。";

/**
 * Why the last open column's 列折畳み is blocked (doc-7 §2.2). This one *is* placed and disabled —
 * unlike the two above, the control exists in every canonical column head and only its last instance
 * is refused, so removing it would make the heads differ in what they hold (doc-11 §5).
 */
export const LAST_COLUMN_FOLD_BLOCKED_REASON =
  "残り 1 列は畳めません。すべて畳むと、どの列のカードも読めない画面になります。";

// --- レーンヘッダ行と列ヘッダの図形 (doc-7 §2.2・§2.3, doc-11 §2.4) ----------------------------

/**
 * この画面が刷る図形 (doc-11 §2.4 の 同じ図形を別の操作へ与えない). Four controls, two families: 折畳み
 * speaks chevron and 移動 speaks arrow, and no figure may be claimed by both.
 *
 * Held here rather than inline in the markup because §2.4 states the rule and something has to be able
 * to check it — the markup can only pick a figure, so a rule kept there is a rule nothing can be tested
 * against (the same reason doc-7 §5.2 took the ポップオーバーの閉じる契機 out of a code comment). This is
 * the swimlane's part of the claim; タスク詳細's is `DISCLOSURE_ICON` and `STEP_ICON` (`placement.ts`),
 * and `swimlane.test.ts` reads all three together. **Every figure that stands for an operation the rule
 * speaks about has to be in one of them** — one left in the markup is one the check cannot see, and
 * 前後移動 was exactly that until TASK-139's review: 脇パネル配置 draws it beside these four, so a
 * chevron given to it would have collided with 行折畳み with every test still passing. The rule reaches
 * operations only, so the `arrow-right` in `ProjectDetail.svelte`'s 値の対応 is outside it and outside
 * these tables — §2.4 says why, and it is an 操作に属さないアイコン rather than a control.
 *
 * **Which figure of a pair is showing is doc-7's rule, and the two folds do not share it.** 行折畳み
 * points at the state the row is in (§2.3), 列折畳み at what the press would do (§2.2) — sideways there
 * is no open or closed to point at. The keys are named for that difference, so neither pair can be
 * copied onto the other by reading this table alone.
 */
export const LANE_FIGURE = {
  /** 行折畳み (§2.3): the state the row's cells are in. */
  rowFold: { open: "chevron-down", folded: "chevron-up" },
  /** 列折畳み (§2.2): what pressing would do to the column. */
  columnFold: { fold: "chevron-left", unfold: "chevron-right" },
  /** 行の並べ替え (§2.3): the pair 前後移動 also takes (doc-8 §2.2) — both move one step. */
  moveUp: "arrow-up",
  moveDown: "arrow-down",
  /** 行末の入口 (§2.3): a move to another screen, so an arrow rather than the sketch's `›`. */
  openProject: "arrow-right",
} as const satisfies Record<string, IconName | Record<string, IconName>>;

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
   * The group the task is in. 未分類区画 is not a レーンセル (doc-7 §1 makes a cell a row × a
   * canonical column), but it is the run of cards the task is actually shown in — so moving through
   * it is the same operation, and naming it apart keeps the position label honest.
   */
  group: { kind: "column"; column: StatusColumn } | { kind: "unmapped" };
  /** 1-based position within the group, and how many cards it holds — doc-8 §2.2's 位置表示. */
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

/**
 * What the group holding this task is called on screen (doc-8 §2.2). **The 未分類区画 is not a
 * レーンセル** — doc-7 §1 makes a cell a プロジェクト行 × 正準ステータス列 — so the noun differs by
 * group, and every string that names the group takes it from here: the two 前後移動 controls in the
 * heading. Spelling セル in each of them is what let the panel call the 区画 a cell while doc-7 said
 * it is not one.
 *
 * Two callers, not three: the 位置表示 dropped the group's name in TASK-72, because the heading's
 * first row has to hold one line and the name was 97px of it (measured at the 30rem sidebar with a
 * long id). The two controls still take their noun from here, so no screen ever calls the 未分類区画
 * a cell — which is the whole point of this function, and it survives the count changing.
 */
export function laneGroupLabel(group: LaneNeighbours["group"]): string {
  return group.kind === "column"
    ? `${CANONICAL_COLUMN_LABEL[group.column]} セル`
    : `${UNMAPPED_LABEL}区画`;
}

/**
 * doc-8 §2.2 の位置表示: where in its group this task sits.
 *
 * The group's *name* is not here (TASK-72). It sits in the heading's first row beside the id, the
 * marks, the 前後移動 controls, the 3 配置切替 and 閉じる, and that row is fixed — a second line there
 * is height the body never gets back. The name is the longest part of it and the least load-bearing:
 * the two ↑↓ controls immediately to the left say it in full in their `title`, and 画面設計案 02 itself
 * prints only「セル内 3 / 7」(doc-12 §3).
 *
 * `title`, not the accessible name: those controls carry `aria-label="前のタスクへ"`, and an
 * `aria-label` outranks a `title` — so the group's name is their *description*, which is what
 * doc-11 §2.4 wants (the label holds the operation's name and nothing else).
 */
export function laneNeighbourLabel(neighbours: LaneNeighbours): string {
  return `${neighbours.position} / ${neighbours.total} 件`;
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
