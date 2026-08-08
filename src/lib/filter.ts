/**
 * カードの取捨 (doc-7 §5). A filter decides which task cards a row shows and nothing else —
 * the project rows and the canonical columns are built regardless, so no combination of
 * filters can change the grid's skeleton.
 *
 * ## Referent table (doc-7 §5 facet → identifier here)
 *
 * | doc-7 §5 | here | selection semantics |
 * |---|---|---|
 * | Type（未設定・未知も選べる） | `CardFilter.types` | `TypeSelection`: a value, 未設定, or 未知 |
 * | 通常ラベル | `CardFilter.labels` | non-`kind:` labels, split at the read layer |
 * | priority | `CardFilter.priorities` | normalized (trimmed, lower-cased) priority values |
 * | assignee | `CardFilter.assignees` | frontmatter assignee entries, verbatim |
 * | テキスト | `CardFilter.text` | 横断タスクID・title 部分一致, case-insensitive |
 * | 不整合 | `CardFilter.inconsistentOnly` | keep only 不整合 tasks (decision-22) |
 * | タスク保存区分 | `CardFilter.storage` | `StorageSelection`, defaulting to `active` alone |
 * | §5.2 条件を足した順 | `CardFilter.order` | the keys of the above, in the order they were added |
 *
 * Two rules run through all of it:
 *
 * - **Empty means unrestricted, for every facet but 保存区分.** 保存区分 is the one facet doc-7
 *   §5 gives a *default* rather than an "off" state ("既定は active のみ"), so it is a positive
 *   selection: what is selected is shown, and selecting nothing shows nothing.
 * - **Facets combine with AND, selections within a facet with OR** — which is what "複数 Type の
 *   タスクはいずれか一致で残す" states for Type and what the others need to stay usable.
 */

// `normalizePriority` lives in `card.ts` (decision-23): the 絞り込み and the 優先度の縁 have to call a
// task `high` on the same terms, and this module already owns that agreement for the identity.
import { cardIdentity, normalizePriority } from "./card";
import type { StorageSelection, TaskView } from "./wire";

/**
 * Whether one task is 不整合 (decision-22). Passed in rather than read off the view, because
 * 不整合 is not a property of the file alone: バージョン不整合 is what the shell observed about a save
 * (`lib/mark.ts`), and this module has no way to reach that record. Reading only `health` here would
 * make the 不整合 facet hide cards that are showing a ⚠️, on the same screen, at the same time.
 */
export type InconsistentLookup = (view: TaskView) => boolean;

export type { StorageSelection };

/** One Type choice: a concrete Type value, or one of the two doc-7 §5 boundary cases. */
export type TypeSelection =
  | { kind: "value"; value: string }
  | { kind: "unset" }
  | { kind: "unknown" };

/*
 * `StorageSelection` (declared in `wire.ts`, re-exported above) is the four doc-4 §3.4 states plus
 * `indeterminate` — a task file found outside the recognized scan locations, whose storage state is
 * `null`.
 *
 * `indeterminate` is its own selection rather than being folded anywhere, because both docs
 * constrain it and only this satisfies them at once: doc-4 §3.4 forbids treating a `null`
 * storage state as `active` ("must never be treated as Active by the default swimlane
 * filter"), while doc-4 §5 requires such a task be kept rather than dropped — and with the
 * four states as the only choices, a `null` would match no selection and become permanently
 * invisible, which is dropping it by another name. doc-7 §5 enumerates the four determinate
 * states because those are what it is naming; it does not say the indeterminate one is
 * unreachable.
 *
 * It lives in `wire.ts` because アプリ設定 persists a list of these as 既定の保存区分 (decision-13).
 */

export interface CardFilter {
  types: TypeSelection[];
  labels: string[];
  priorities: string[];
  assignees: string[];
  text: string;
  inconsistentOnly: boolean;
  storage: StorageSelection[];
  /**
   * 条件を足した順 (doc-7 §5.2): the keys of the conditions above — `conditionKey` in `token.ts` —
   * in the order they were added. The per-facet arrays hold no order *between* facets, so without
   * this neither the token row's order nor 直前の 1 つを戻す has an answer; doc-7 §5.2 makes both
   * part of what the filter is.
   *
   * Held as a *hint*, not as a second source of truth: which conditions are in force is the arrays'
   * answer alone, and `token.ts` reads this only to order them — ignoring keys the arrays no longer
   * hold, and appending held conditions this list has never heard of. A filter written field by
   * field from outside (アプリ設定's 既定の保存区分, `withStorage`) therefore degrades to the canonical
   * order rather than to a wrong filter.
   */
  order: string[];
}

/** 既定は active タスクに限定 (doc-7 §2/§5); every other facet starts unrestricted. */
export const DEFAULT_FILTER: CardFilter = {
  types: [],
  labels: [],
  priorities: [],
  assignees: [],
  text: "",
  inconsistentOnly: false,
  storage: ["active"],
  order: [],
};

/**
 * The filter 既定に戻す returns to (doc-7 §5.2): everything unrestricted, and 保存区分 back to the 既定
 * — which is アプリ設定's 既定の保存区分 (decision-13), not necessarily `active` alone. 保存区分 is a
 * positive selection, so clearing it outright would leave the grid empty; the control returns the
 * filter to the state the screen opens in, which is what its name says.
 */
export function defaultFilter(storage: readonly StorageSelection[]): CardFilter {
  return { ...DEFAULT_FILTER, storage: [...storage] };
}

/**
 * Replace 保存区分 wholesale — アプリ設定's 既定の保存区分 arriving after the fact. Written through
 * here rather than by spreading the field, so `order` keeps no key for a state that is no longer
 * selected.
 */
export function withStorage(filter: CardFilter, storage: readonly StorageSelection[]): CardFilter {
  const dropped = filter.storage.filter((state) => !storage.includes(state));
  return {
    ...filter,
    storage: [...storage],
    order: filter.order.filter((key) => !dropped.some((state) => key === `storage:${state}`)),
  };
}

/**
 * True when the filter restricts nothing beyond `storage` — i.e. the screen is showing its normal
 * view. `order` is not read: it only says in which order the conditions arrived, so a filter holding
 * no condition is the default whatever stale keys are left in it.
 */
export function isDefaultFilter(filter: CardFilter, storage: readonly StorageSelection[] = ["active"]): boolean {
  return (
    filter.types.length === 0 &&
    filter.labels.length === 0 &&
    filter.priorities.length === 0 &&
    filter.assignees.length === 0 &&
    filter.text.trim() === "" &&
    !filter.inconsistentOnly &&
    filter.storage.length === storage.length &&
    filter.storage.every((state, index) => state === storage[index])
  );
}

/** A stable key for a Type selection, for `{#each}` keys and set membership in the UI. */
export function typeSelectionKey(selection: TypeSelection): string {
  return selection.kind === "value" ? `value:${selection.value}` : selection.kind;
}

export function hasTypeSelection(filter: CardFilter, selection: TypeSelection): boolean {
  const key = typeSelectionKey(selection);
  return filter.types.some((held) => typeSelectionKey(held) === key);
}

/** Add or remove one Type selection, returning a new filter (state stays replaceable). */
export function toggleTypeSelection(filter: CardFilter, selection: TypeSelection): CardFilter {
  const key = typeSelectionKey(selection);
  const types = hasTypeSelection(filter, selection)
    ? filter.types.filter((held) => typeSelectionKey(held) !== key)
    : [...filter.types, selection];
  return { ...filter, types };
}

/** Add or remove one value from a string-valued facet. */
export function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((held) => held !== value)
    : [...values, value];
}

/** Does this task's card survive the filter? (doc-7 §5) */
export function matchesFilter(
  view: TaskView,
  filter: CardFilter,
  inconsistent: InconsistentLookup,
): boolean {
  return (
    matchesStorage(view, filter.storage) &&
    matchesTypes(view, filter.types) &&
    matchesAny(filter.labels, view.task.labels) &&
    matchesAny(filter.priorities, priorityValues(view)) &&
    matchesAny(filter.assignees, view.task.assignee) &&
    matchesText(view, filter.text) &&
    (!filter.inconsistentOnly || inconsistent(view))
  );
}

function matchesStorage(view: TaskView, storage: readonly StorageSelection[]): boolean {
  return storage.includes(view.task.storageState ?? "indeterminate");
}

function matchesTypes(view: TaskView, selections: readonly TypeSelection[]): boolean {
  if (selections.length === 0) return true;
  const types = view.interpretation.types;
  return selections.some((selection) => {
    switch (selection.kind) {
      // 複数 Type のタスクはいずれか一致で残す (doc-7 §5).
      case "value":
        return types.some((type) => sameType(type.value, selection.value));
      case "unset":
        return types.length === 0;
      case "unknown":
        return types.some((type) => !type.known);
    }
  });
}

/** Type values keep their project's spelling but are matched case-insensitively (decision-5). */
function sameType(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function priorityValues(view: TaskView): string[] {
  const priority = view.task.priority;
  return priority === null ? [] : [normalizePriority(priority)];
}

/** OR within a facet; an empty selection restricts nothing. */
function matchesAny(selected: readonly string[], values: readonly string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

function matchesText(view: TaskView, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (needle === "") return true;
  const title = view.task.title ?? "";
  return (
    cardIdentity(view).toLowerCase().includes(needle) || title.toLowerCase().includes(needle)
  );
}

/**
 * One selectable value and 値ごとの件数 (doc-7 §5.2 の値一覧). The count is over *every* read task,
 * the same population the values themselves come from — not over what the current filter leaves.
 * A count conditioned on the filter would move while the user selects inside the same facet (values
 * within a facet combine with OR, so picking one raises the others' apparent relevance without any
 * task having changed), and it would read 0 beside a value that is about to bring cards back.
 */
export interface FacetValue<T> {
  value: T;
  count: number;
}

/** The choices a filter control can offer, gathered from what the workspace actually holds. */
export interface Facets {
  /**
   * The four 保存区分 always, whatever their counts: they are the fixed choices of doc-4 §3.4, and a
   * division disappearing at 0 would take away the way to look for the tasks in it. 保存区分不明 is
   * the exception — it is not a division anyone files a task under, so it is offered only once a
   * task is actually in that state.
   */
  storage: FacetValue<StorageSelection>[];
  types: FacetValue<TypeSelection>[];
  labels: FacetValue<string>[];
  priorities: FacetValue<string>[];
  assignees: FacetValue<string>[];
  /** 不整合 tasks (decision-22). The facet has one condition rather than a value list, so it is a count. */
  inconsistent: number;
}

/** The 保存区分 offered whatever the workspace holds (doc-4 §3.4), in the order they are drawn. */
const STORAGE_VALUES: readonly StorageSelection[] = ["active", "draft", "completed", "archive"];

/**
 * Collect the selectable values from every task in every readable project — including tasks
 * the current filter hides, so an option never disappears because it is not currently shown.
 * 未設定・未知 appear only when some task is in that state (doc-7 §5 lets them be selected;
 * offering them against nothing would just be noise).
 */
export function collectFacets(
  views: Iterable<TaskView>,
  inconsistent: InconsistentLookup,
): Facets {
  const types = new Map<string, FacetValue<TypeSelection>>();
  const labels = new Map<string, number>();
  const priorities = new Map<string, number>();
  const assignees = new Map<string, number>();
  const storage = new Map<StorageSelection, number>(STORAGE_VALUES.map((value) => [value, 0]));
  let inconsistentCount = 0;

  for (const view of views) {
    const values = view.interpretation.types;
    if (values.length === 0) bumpType(types, "unset", { kind: "unset" });
    // A task carrying two Type values counts under both, which is what 複数 Type のタスクはいずれか
    // 一致で残す makes true of the selection as well.
    for (const type of values) {
      bumpType(types, `value:${type.value}`, { kind: "value", value: type.value });
    }
    if (values.some((type) => !type.known)) bumpType(types, "unknown", { kind: "unknown" });
    for (const label of view.task.labels) bump(labels, label);
    if (view.task.priority !== null) bump(priorities, normalizePriority(view.task.priority));
    for (const assignee of view.task.assignee) bump(assignees, assignee);
    bump(storage, view.task.storageState ?? "indeterminate");
    if (inconsistent(view)) inconsistentCount += 1;
  }

  return {
    storage: [...storage.entries()]
      // 保存区分不明 joins the four only when something is in it (`wire.ts` says why the state exists).
      .filter(([value, count]) => value !== "indeterminate" || count > 0)
      .map(([value, count]) => ({ value, count })),
    types: sortTypeSelections([...types.values()]),
    labels: sortByValue(labels),
    // Ordered by rank, not alphabetically, so the control reads high → low.
    priorities: sortByValue(priorities, byPriorityRank),
    assignees: sortByValue(assignees),
    inconsistent: inconsistentCount,
  };
}

function bump<T>(counts: Map<T, number>, value: T): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function bumpType(
  types: Map<string, FacetValue<TypeSelection>>,
  key: string,
  value: TypeSelection,
): void {
  const held = types.get(key);
  if (held === undefined) types.set(key, { value, count: 1 });
  else held.count += 1;
}

function sortByValue(
  counts: Map<string, number>,
  compare: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): FacetValue<string>[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compare(a.value, b.value));
}

const PRIORITY_ORDER = ["high", "medium", "low"];

function byPriorityRank(a: string, b: string): number {
  const rank = (value: string) => {
    const index = PRIORITY_ORDER.indexOf(value);
    return index === -1 ? PRIORITY_ORDER.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** Concrete Type values first (alphabetical), then 未設定, then 未知. */
function sortTypeSelections(
  selections: FacetValue<TypeSelection>[],
): FacetValue<TypeSelection>[] {
  const order = { value: 0, unset: 1, unknown: 2 } as const;
  return selections.sort(({ value: a }, { value: b }) => {
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return a.kind === "value" && b.kind === "value" ? a.value.localeCompare(b.value) : 0;
  });
}
