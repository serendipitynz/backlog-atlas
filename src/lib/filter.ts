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
 * | 縮退 | `CardFilter.degradedOnly` | keep only tasks whose health is 縮退 (doc-4 §5) |
 * | タスク保存区分 | `CardFilter.storage` | `StorageSelection`, defaulting to `active` alone |
 *
 * Two rules run through all of it:
 *
 * - **Empty means unrestricted, for every facet but 保存区分.** 保存区分 is the one facet doc-7
 *   §5 gives a *default* rather than an "off" state ("既定は active のみ"), so it is a positive
 *   selection: what is selected is shown, and selecting nothing shows nothing.
 * - **Facets combine with AND, selections within a facet with OR** — which is what "複数 Type の
 *   タスクはいずれか一致で残す" states for Type and what the others need to stay usable.
 */

import { cardIdentity } from "./card";
import type { StorageState, TaskView } from "./wire";

/** One Type choice: a concrete Type value, or one of the two doc-7 §5 boundary cases. */
export type TypeSelection =
  | { kind: "value"; value: string }
  | { kind: "unset" }
  | { kind: "unknown" };

/**
 * One 保存区分 choice. The four doc-4 §3.4 states, plus `indeterminate` for a task file found
 * outside the recognized scan locations, whose storage state is `null`.
 *
 * `indeterminate` is its own selection rather than being folded anywhere, because both docs
 * constrain it and only this satisfies them at once: doc-4 §3.4 forbids treating a `null`
 * storage state as `active` ("must never be treated as Active by the default swimlane
 * filter"), while doc-4 §5 requires such a task be kept rather than dropped — and with the
 * four states as the only choices, a `null` would match no selection and become permanently
 * invisible, which is dropping it by another name. doc-7 §5 enumerates the four determinate
 * states because those are what it is naming; it does not say the indeterminate one is
 * unreachable.
 */
export type StorageSelection = StorageState | "indeterminate";

export interface CardFilter {
  types: TypeSelection[];
  labels: string[];
  priorities: string[];
  assignees: string[];
  text: string;
  degradedOnly: boolean;
  storage: StorageSelection[];
}

/** 既定は active タスクに限定 (doc-7 §2/§5); every other facet starts unrestricted. */
export const DEFAULT_FILTER: CardFilter = {
  types: [],
  labels: [],
  priorities: [],
  assignees: [],
  text: "",
  degradedOnly: false,
  storage: ["active"],
};

/** True when the filter is the default — i.e. the screen is showing its normal active view. */
export function isDefaultFilter(filter: CardFilter): boolean {
  return (
    filter.types.length === 0 &&
    filter.labels.length === 0 &&
    filter.priorities.length === 0 &&
    filter.assignees.length === 0 &&
    filter.text.trim() === "" &&
    !filter.degradedOnly &&
    filter.storage.length === 1 &&
    filter.storage[0] === "active"
  );
}

/** Priority values are compared case-insensitively so `High` and `high` are one facet. */
export function normalizePriority(priority: string): string {
  return priority.trim().toLowerCase();
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
export function matchesFilter(view: TaskView, filter: CardFilter): boolean {
  return (
    matchesStorage(view, filter.storage) &&
    matchesTypes(view, filter.types) &&
    matchesAny(filter.labels, view.task.labels) &&
    matchesAny(filter.priorities, priorityValues(view)) &&
    matchesAny(filter.assignees, view.task.assignee) &&
    matchesText(view, filter.text) &&
    (!filter.degradedOnly || view.task.health.state === "degraded")
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

/** The choices a filter control can offer, gathered from what the workspace actually holds. */
export interface Facets {
  types: TypeSelection[];
  labels: string[];
  priorities: string[];
  assignees: string[];
}

/**
 * Collect the selectable values from every task in every readable project — including tasks
 * the current filter hides, so an option never disappears because it is not currently shown.
 * 未設定・未知 appear only when some task is in that state (doc-7 §5 lets them be selected;
 * offering them against nothing would just be noise).
 */
export function collectFacets(views: Iterable<TaskView>): Facets {
  const types = new Map<string, TypeSelection>();
  const labels = new Set<string>();
  const priorities = new Set<string>();
  const assignees = new Set<string>();

  for (const view of views) {
    const values = view.interpretation.types;
    if (values.length === 0) types.set("unset", { kind: "unset" });
    for (const type of values) {
      types.set(`value:${type.value}`, { kind: "value", value: type.value });
      if (!type.known) types.set("unknown", { kind: "unknown" });
    }
    for (const label of view.task.labels) labels.add(label);
    if (view.task.priority !== null) priorities.add(normalizePriority(view.task.priority));
    for (const assignee of view.task.assignee) assignees.add(assignee);
  }

  return {
    types: sortTypeSelections([...types.values()]),
    labels: [...labels].sort(),
    // Ordered by rank, not alphabetically, so the control reads high → low.
    priorities: [...priorities].sort(byPriorityRank),
    assignees: [...assignees].sort(),
  };
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
function sortTypeSelections(selections: TypeSelection[]): TypeSelection[] {
  const order = { value: 0, unset: 1, unknown: 2 } as const;
  return selections.sort((a, b) => {
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return a.kind === "value" && b.kind === "value" ? a.value.localeCompare(b.value) : 0;
  });
}
