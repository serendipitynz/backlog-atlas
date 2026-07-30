/**
 * 絞り込みトークン (doc-7 §1・§5.2). The filter's *control* model: which conditions are in force,
 * what each of them is called on screen, in which order they were added, and which one 直前の 1 つを
 * 戻す takes back. What a condition *does* to a card stays in `filter.ts` — nothing here can change
 * which tasks survive a filter, only how the filter is built and shown.
 *
 * ## Referent table (doc-7 term → identifier here)
 *
 * Fixed before the code was written, as the modules around it do.
 *
 * | doc-7 | here | is |
 * |---|---|---|
 * | §1 絞り込みトークン | `FilterToken` | one condition shown as 属性名・値・解除操作 |
 * | §5.2 条件 | `FilterCondition` | one selection inside one facet — what a token stands for |
 * | §5.2 条件を足した順 | `CardFilter.order` / `orderedConditions` | the order conditions were added in |
 * | §5.2 末尾から 1 件ずつ解除 | `removeLastCondition` | drop the last *added* condition |
 * | §5.2 全解除 | `defaultFilter` (`filter.ts`) | back to the state the screen opens in |
 * | §5.2 値の一覧 | `Facets` (`filter.ts`) + `FilterPopover.svelte` | the values a condition can be built from |
 *
 * Two things are deliberately *not* tokens:
 *
 * - **テキスト** is a condition like any other (it is in `order`, and 直前の 1 つを戻す can take it
 *   back), but the search box in the bar already shows its value and is where it is edited. A token
 *   beside the box would state the same condition twice, and clearing it from two places is how the
 *   two would disagree.
 * - **保存区分's 既定** carries no `order` entry, because the user did not add it. It draws first —
 *   doc-12 §4 の常設トークン — and 直前の 1 つを戻す steps over it, so pressing 戻す repeatedly can
 *   never leave the screen showing nothing. Its own × still removes it, which is a deliberate choice
 *   the user can see the result of.
 */

import {
  hasTypeSelection,
  isDefaultFilter,
  toggleTypeSelection,
  toggleValue,
  typeSelectionKey,
  type CardFilter,
  type StorageSelection,
  type TypeSelection,
} from "./filter";

/** The facets a condition can belong to (doc-7 §5.2 の絞り込み条件の並び). */
export type FilterFacet =
  | "storage"
  | "type"
  | "label"
  | "priority"
  | "assignee"
  | "text"
  | "degraded";

/** One 絞り込み条件: a facet and, for all but 縮退, the value selected inside it. */
export type FilterCondition =
  | { facet: "storage"; value: StorageSelection }
  | { facet: "type"; value: TypeSelection }
  | { facet: "label"; value: string }
  | { facet: "priority"; value: string }
  | { facet: "assignee"; value: string }
  | { facet: "text"; value: string }
  | { facet: "degraded" };

/** 属性名 as the bar and the popover name it (doc-7 §5.2 lists the facets in this order). */
export const FACET_LABEL: Record<FilterFacet, string> = {
  storage: "保存区分",
  type: "Type",
  label: "ラベル",
  priority: "priority",
  assignee: "assignee",
  text: "テキスト",
  degraded: "縮退",
};

/** The order facets are drawn in, wherever they are listed together (bar tokens, popover sections). */
export const FACET_ORDER: readonly FilterFacet[] = [
  // 保存区分 first: it is the one facet that starts from a 既定 rather than from "off" (doc-7 §5.2),
  // so its tokens are the ones already standing when the row is otherwise empty.
  "storage",
  "type",
  "label",
  "priority",
  "assignee",
  "degraded",
];

const STORAGE_LABEL: Record<StorageSelection, string> = {
  active: "active",
  draft: "draft",
  completed: "completed",
  archive: "archive",
  // Not a division a task is filed under but the absence of one (doc-4 §3.4), so it is named rather
  // than shown as a fourth-and-a-half division.
  indeterminate: "保存区分不明",
};

export function storageLabel(value: StorageSelection): string {
  return STORAGE_LABEL[value];
}

/** decision-5's three cases, worded as the value list and the tokens both show them. */
export function typeLabel(selection: TypeSelection): string {
  switch (selection.kind) {
    case "value":
      return selection.value;
    case "unset":
      return "Type 未設定";
    case "unknown":
      return "未知 Type";
  }
}

/**
 * A stable identity for one condition, used as the `order` entry, the `{#each}` key and the
 * membership test. The facet name prefixes the value, so a label and an assignee spelled the same
 * are two conditions rather than one.
 */
export function conditionKey(condition: FilterCondition): string {
  switch (condition.facet) {
    case "type":
      return `type:${typeSelectionKey(condition.value)}`;
    // One text condition at a time, whatever it currently says: the key has no value in it, so
    // editing the search box keeps the position the condition was added at.
    case "text":
      return "text";
    case "degraded":
      return "degraded";
    default:
      return `${condition.facet}:${condition.value}`;
  }
}

/** 値 as a token and the value list show it, or `null` for a facet whose name is the whole condition. */
export function conditionValueLabel(condition: FilterCondition): string | null {
  switch (condition.facet) {
    case "storage":
      return storageLabel(condition.value);
    case "type":
      return typeLabel(condition.value);
    case "degraded":
      return null;
    default:
      return condition.value;
  }
}

export function hasCondition(filter: CardFilter, condition: FilterCondition): boolean {
  switch (condition.facet) {
    case "storage":
      return filter.storage.includes(condition.value);
    case "type":
      return hasTypeSelection(filter, condition.value);
    case "label":
      return filter.labels.includes(condition.value);
    case "priority":
      return filter.priorities.includes(condition.value);
    case "assignee":
      return filter.assignees.includes(condition.value);
    case "text":
      return filter.text.trim() !== "";
    case "degraded":
      return filter.degradedOnly;
  }
}

/** Add one condition, recording where it lands in 追加順. Adding a held condition changes nothing. */
export function addCondition(filter: CardFilter, condition: FilterCondition): CardFilter {
  if (hasCondition(filter, condition)) return filter;
  return withOrder(applyCondition(filter, condition, true), condition, true);
}

/** Take one condition back — the × on a token, and what 直前の 1 つを戻す calls. */
export function removeCondition(filter: CardFilter, condition: FilterCondition): CardFilter {
  if (!hasCondition(filter, condition)) return filter;
  return withOrder(applyCondition(filter, condition, false), condition, false);
}

export function toggleCondition(filter: CardFilter, condition: FilterCondition): CardFilter {
  return hasCondition(filter, condition)
    ? removeCondition(filter, condition)
    : addCondition(filter, condition);
}

/**
 * Set テキスト to what the search box now holds. Emptying it removes the condition rather than
 * leaving a blank one standing: `matchesFilter` already treats blank text as no restriction, and a
 * condition 直前の 1 つを戻す could take back while restricting nothing is a token that lies.
 */
export function setText(filter: CardFilter, text: string): CardFilter {
  const condition: FilterCondition = { facet: "text", value: text };
  const next = { ...filter, text };
  return text.trim() === ""
    ? withOrder(next, condition, false)
    : withOrder(next, condition, filter.text.trim() === "" ? true : null);
}

/** Apply the selection itself, leaving `order` to `withOrder`. */
function applyCondition(
  filter: CardFilter,
  condition: FilterCondition,
  add: boolean,
): CardFilter {
  switch (condition.facet) {
    case "storage":
      return { ...filter, storage: toggleValue(filter.storage, condition.value) };
    case "type":
      return toggleTypeSelection(filter, condition.value);
    case "label":
      return { ...filter, labels: toggleValue(filter.labels, condition.value) };
    case "priority":
      return { ...filter, priorities: toggleValue(filter.priorities, condition.value) };
    case "assignee":
      return { ...filter, assignees: toggleValue(filter.assignees, condition.value) };
    case "text":
      return { ...filter, text: add ? condition.value : "" };
    case "degraded":
      return { ...filter, degradedOnly: add };
  }
}

/** `add: true` appends the key, `false` drops it, `null` leaves the order untouched. */
function withOrder(
  filter: CardFilter,
  condition: FilterCondition,
  add: boolean | null,
): CardFilter {
  if (add === null) return filter;
  const key = conditionKey(condition);
  const without = filter.order.filter((held) => held !== key);
  return { ...filter, order: add ? [...without, key] : without };
}

/**
 * Every condition the filter holds, in 追加順 (doc-7 §5.2). Conditions `order` has never heard of —
 * a filter written field by field from outside — come first, in `FACET_ORDER`, which is also where
 * 保存区分's 既定 sits: it was never added, so it was never recorded.
 */
export function orderedConditions(filter: CardFilter): FilterCondition[] {
  const held = heldConditions(filter);
  // A stable sort, so conditions sharing a rank (the unrecorded ones, all at -1) keep the canonical
  // order they were gathered in.
  return held.sort(
    (a, b) => filter.order.indexOf(conditionKey(a)) - filter.order.indexOf(conditionKey(b)),
  );
}

/**
 * The tokens the bar draws: every condition in 追加順 except テキスト, which the search box shows
 * (see the header). One token per condition, so the row's length is the number of conditions rather
 * than the number of values a facet *could* take.
 */
export interface FilterToken {
  key: string;
  condition: FilterCondition;
  /** 属性名 (doc-7 §1). */
  facet: string;
  /** 値, or `null` when the facet name is the whole condition (縮退). */
  value: string | null;
  /**
   * True for a condition the user never added — 保存区分's 既定. Drawn like any other token and
   * removable by its own ×, but skipped by 直前の 1 つを戻す, which walks 追加順.
   */
  baseline: boolean;
}

export function filterTokens(filter: CardFilter): FilterToken[] {
  return orderedConditions(filter)
    .filter((condition) => condition.facet !== "text")
    .map((condition) => ({
      key: conditionKey(condition),
      condition,
      facet: FACET_LABEL[condition.facet],
      value: conditionValueLabel(condition),
      baseline: !filter.order.includes(conditionKey(condition)),
    }));
}

/**
 * The condition 直前の 1 つを戻す would take back: the last one in 追加順 that the filter still
 * holds. `null` when there is nothing to take back — only 保存区分's 既定 is left, or the order has
 * gone stale against the selections and nothing in it is in force any more.
 */
export function lastCondition(filter: CardFilter): FilterCondition | null {
  const byKey = new Map(heldConditions(filter).map((condition) => [conditionKey(condition), condition]));
  for (let index = filter.order.length - 1; index >= 0; index -= 1) {
    const condition = byKey.get(filter.order[index]);
    if (condition !== undefined) return condition;
  }
  return null;
}

/** 直前の 1 つを戻す (doc-7 §5.2). Returns the filter unchanged when there is nothing to take back. */
export function removeLastCondition(filter: CardFilter): CardFilter {
  const last = lastCondition(filter);
  return last === null ? filter : removeCondition(filter, last);
}

/** How many conditions are in force — the popover's 選択数 and the bar's own count. */
export function conditionCount(filter: CardFilter): number {
  return heldConditions(filter).length;
}

/**
 * Whether 全解除 has anything left to do — false while any condition beyond the 既定 is held, *or*
 * while 追加順 still holds one 直前の 1 つを戻す would act on.
 *
 * The second half is what keeps the two controls from contradicting each other. The selections can
 * come back to the 既定 by a route that leaves history behind — take 保存区分's 既定 off its token
 * and pick the same division again in the popover, and the values are the 既定 again while
 * `storage:active` is now something the user *added*. Judged on the values alone, 全解除 would go
 * blocked ("既定のままです") next to an enabled 直前の 1 つを戻す whose press then empties the grid,
 * with no way to clear the history it acts on.
 */
export function nothingToClear(
  filter: CardFilter,
  storage: readonly StorageSelection[],
): boolean {
  return isDefaultFilter(filter, storage) && lastCondition(filter) === null;
}

/**
 * Every condition in force, in `FACET_ORDER` and, within a facet, in the filter's own order.
 *
 * One condition per key, however often the underlying array repeats it. `settings.toml` is meant to
 * be hand-editable (decision-13) and the boundary reads 既定の保存区分 into a list without rejecting
 * a repeated entry, so `default_storage_filter = ["active", "active"]` reaches the screen intact —
 * and a token row drawn from it would key two elements the same, which is an exception in Svelte's
 * keyed `{#each}` rather than a duplicate chip. The selection means the same thing either way
 * (`matchesFilter` asks whether the state is *in* the list), so the repeat is dropped here rather
 * than treated as a broken settings file.
 */
function heldConditions(filter: CardFilter): FilterCondition[] {
  const held: FilterCondition[] = [];
  for (const facet of FACET_ORDER) {
    switch (facet) {
      case "storage":
        for (const value of filter.storage) held.push({ facet, value });
        break;
      case "type":
        for (const value of filter.types) held.push({ facet, value });
        break;
      case "label":
        for (const value of filter.labels) held.push({ facet, value });
        break;
      case "priority":
        for (const value of filter.priorities) held.push({ facet, value });
        break;
      case "assignee":
        for (const value of filter.assignees) held.push({ facet, value });
        break;
      case "degraded":
        if (filter.degradedOnly) held.push({ facet });
        break;
    }
  }
  // Not in `FACET_ORDER` because it has no token to draw, but it is a condition: it counts, it holds
  // a place in 追加順, and 直前の 1 つを戻す can take it back.
  if (filter.text.trim() !== "") held.push({ facet: "text", value: filter.text });

  const seen = new Set<string>();
  return held.filter((condition) => {
    const key = conditionKey(condition);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
