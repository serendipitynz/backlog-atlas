<script lang="ts">
  // 値一覧ポップオーバー (doc-7 §5.2): the one place a facet's values are listed, opened from
  // ＋ 絞り込み. It is what replaces the always-expanded checkbox groups — 検索・スクロール・値ごとの
  // 件数・選択数 — so the bar itself only ever carries the conditions actually chosen.
  //
  // 閉じる契機 は doc-7 §5.2 が 4 つに定める: the 「閉じる」 button below, Escape, a press outside the
  // anchor, and a second press on ＋ 絞り込み (that last one is `FilterBar.svelte`'s, since the button
  // is). Selecting a value is deliberately none of them — it applies the condition at once and
  // leaves the popover up. The rule used to live in this comment alone, which is what TASK-119 fixed:
  // a rule only a code comment holds is not a contract anything else can be checked against.
  import {
    conditionCount,
    conditionKey,
    conditionValueLabel,
    hasCondition,
    setPeriodEnd,
    toggleCondition,
    typeLabel,
    FACET_LABEL,
    PERIOD_END_LABEL,
    PERIOD_ENDS,
    type FilterCondition,
    type FilterFacet,
    type PeriodEnd,
  } from "../lib/token";
  import {
    relativeStart,
    PERIOD_UNITS,
    PERIOD_UNIT_LABEL,
    type PeriodUnit,
  } from "../lib/period";
  import type { CardFilter, Facets } from "../lib/filter";
  import { matchShortcut, textEntryFocused } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";

  interface Props {
    filter: CardFilter;
    facets: Facets;
    /**
     * The box a press counts as "inside" — the bar's ＋ 絞り込み anchor, which holds the opener as
     * well as this popover. Without it a press on the opener would read as outside, close the
     * popover, and let the opener's own click reopen it: the button would never close what it opened.
     */
    boundary: HTMLElement | null;
    onchange: (filter: CardFilter) => void;
    onclose: () => void;
  }

  let { filter, facets, boundary, onchange, onclose }: Props = $props();

  interface ValueEntry {
    key: string;
    condition: FilterCondition;
    label: string;
    count: number;
  }

  interface Section {
    facet: FilterFacet;
    label: string;
    entries: ValueEntry[];
  }

  function entry(condition: FilterCondition, count: number, label?: string): ValueEntry {
    return {
      key: conditionKey(condition),
      condition,
      label: label ?? conditionValueLabel(condition) ?? FACET_LABEL[condition.facet],
      count,
    };
  }

  // Built in `FACET_ORDER` (`token.ts`), so the sections here and the tokens in the bar name the
  // facets in one order.
  let sections = $derived<Section[]>(
    [
      {
        facet: "storage" as const,
        entries: facets.storage.map((value) =>
          entry({ facet: "storage", value: value.value }, value.count),
        ),
      },
      {
        facet: "type" as const,
        entries: facets.types.map((value) =>
          entry({ facet: "type", value: value.value }, value.count, typeLabel(value.value)),
        ),
      },
      {
        facet: "label" as const,
        entries: facets.labels.map((value) =>
          entry({ facet: "label", value: value.value }, value.count),
        ),
      },
      {
        facet: "priority" as const,
        entries: facets.priorities.map((value) =>
          entry({ facet: "priority", value: value.value }, value.count),
        ),
      },
      {
        facet: "assignee" as const,
        entries: facets.assignees.map((value) =>
          entry({ facet: "assignee", value: value.value }, value.count),
        ),
      },
      // 不整合 has no value list — the facet *is* the condition — so it is offered as a single entry
      // rather than as a section that would otherwise be missing from the search results.
      {
        facet: "inconsistent" as const,
        entries: [entry({ facet: "inconsistent" }, facets.inconsistent, "不整合のみ")],
      },
    ].map((section) => ({ ...section, label: FACET_LABEL[section.facet] })),
  );

  // The search box filters the *list*, not the cards, but it takes the bar's IME treatment for the
  // same reason and by the same means: `search` is what the box shows (bound DOM → state), `query`
  // is what the list is filtered by, and only a non-composing `input` copies one to the other. A
  // list re-ordered on every 変換候補 moves the entry the user is reaching for out from under them.
  let search = $state("");
  let query = $state("");

  function typed(event: Event): void {
    if ((event as InputEvent).isComposing) return;
    query = search;
  }

  function clearSearch(): void {
    search = "";
    query = "";
  }

  // Matched against the value's own wording and its facet name, so "ラベル" reaches the label list
  // even when no single label contains the word.
  let shown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return sections.filter((section) => section.entries.length > 0);
    return sections
      .map((section) => ({
        ...section,
        entries: section.label.toLowerCase().includes(needle)
          ? section.entries
          : section.entries.filter((value) => value.label.toLowerCase().includes(needle)),
      }))
      .filter((section) => section.entries.length > 0);
  });

  // 更新期間 (doc-7 §5.2). It has no value list to search, so it is matched on its heading alone —
  // and it is drawn whenever nothing is being searched for, like a section whose entries all matched.
  let periodShown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return needle === "" || FACET_LABEL.updated.toLowerCase().includes(needle);
  });

  function endValue(end: PeriodEnd): string {
    return end === "from" ? filter.updatedFrom : filter.updatedTo;
  }

  // 相対指定. The number and the unit are this control's own state rather than part of the filter:
  // what they produce is a 暦日, and it is the 暦日 that becomes the condition.
  let count = $state(7);
  let unit = $state<PeriodUnit>("day");

  /**
   * 解決時点 は押した時点 (doc-7 §5.2): `new Date()` is read here, when the press happens, and the
   * day it resolves to is stored as the 始端. Nothing downstream keeps a clock, which is why the
   * token can name a day and be telling the truth about the boundary indefinitely.
   */
  function applyRelative(): void {
    const day = relativeStart(count, unit, new Date());
    if (day !== null) onchange(setPeriodEnd(filter, "from", day));
  }

  let selected = $derived(conditionCount(filter));

  let root = $state<HTMLDivElement | null>(null);
  let field = $state<HTMLInputElement | null>(null);

  // Opened by a press, so the search box takes focus: typing is the first thing to do here, and the
  // alternative — the focus staying on the ＋ 絞り込み button behind the popover — puts keystrokes
  // nowhere the user can see.
  $effect(() => {
    field?.focus();
  });

  // ポップオーバーの外側の押下 (doc-7 §5.2). `pointerdown` rather than `click`, so a press that
  // starts outside cannot first land on whatever the popover was covering.
  $effect(() => {
    function outside(event: PointerEvent): void {
      const box = boundary ?? root;
      if (box !== null && !box.contains(event.target as Node)) onclose();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });

  function keydown(event: KeyboardEvent): void {
    // Through the 割り当て一覧 (doc-7 §2.1 asks for every assignment in one place, TASK-56). The popover is
    // one of the 被せ層 that row covers, so its Escape is answered here rather than recognised by key
    // name — which is what kept this assignment out of the list before.
    const binding = matchShortcut(event, {
      scopes: ["overlay"],
      textEntry: textEntryFocused(document.activeElement),
      mac: MAC_KEYBOARD,
    });
    if (binding?.action !== "closeOverlay") return;
    // Only this popover's Escape: it is the innermost thing open, and the press is spent closing it.
    event.stopPropagation();
    onclose();
  }
</script>

<div
  class="popover"
  role="dialog"
  aria-label="絞り込みを追加"
  tabindex="-1"
  bind:this={root}
  onkeydown={keydown}
>
  <label class="search">
    <span class="caption">値を検索</span>
    <input
      type="search"
      placeholder="値・属性名"
      bind:this={field}
      bind:value={search}
      oninput={typed}
    />
  </label>

  <div class="values">
    {#each shown as section (section.facet)}
      <section>
        <h3>{section.label}</h3>
        {#each section.entries as value (value.key)}
          {@const on = hasCondition(filter, value.condition)}
          <button
            type="button"
            class="value"
            class:on
            aria-pressed={on}
            onclick={() => onchange(toggleCondition(filter, value.condition))}
          >
            <span class="mark" aria-hidden="true">{on ? "✓" : ""}</span>
            <span class="name">{value.label}</span>
            <span class="count">{value.count}</span>
          </button>
        {/each}
      </section>
    {/each}

    <!-- 更新期間 (doc-7 §5.2). The eighth facet, and the only one whose values are entered rather
         than picked: a 暦日 belongs to no set the workspace holds, so 検索・件数 have nothing to say
         about it. It sits last, where doc-7 §5.2 lists it, and inside the scrolling area so the
         panel's height stays the one the value list decides. -->
    {#if periodShown}
      <section class="period">
        <h3>{FACET_LABEL.updated}</h3>
        {#each PERIOD_ENDS as end (end)}
          <label class="end">
            <span class="caption">{PERIOD_END_LABEL[end]}</span>
            <!-- 端は暦日 (doc-7 §5.2), which is exactly what a date input yields: `YYYY-MM-DD` or
                 the empty string. Emptying it takes the end off, the same as pressing its token's ×.
                 `change` rather than `input`, so a half-typed year is not applied as a condition. -->
            <input
              type="date"
              value={endValue(end)}
              onchange={(event) => onchange(setPeriodEnd(filter, end, event.currentTarget.value))}
            />
          </label>
        {/each}
        <div class="relative">
          <label>
            いまから
            <input type="number" min="1" step="1" bind:value={count} />
          </label>
          <select bind:value={unit} aria-label="いまから数える単位">
            {#each PERIOD_UNITS as value (value)}
              <option {value}>{PERIOD_UNIT_LABEL[value]}</option>
            {/each}
          </select>
          <button type="button" class="plain" onclick={applyRelative}>始端にする</button>
        </div>
      </section>
    {/if}

    {#if shown.length === 0 && !periodShown}
      <!-- 正常な不在 (doc-11 §6): a search that matched nothing is not an error, so it gets the
           neutral mark and a sentence, never a colour. -->
      <p class="none"><span class="dash">—</span> 「{query.trim()}」に一致する値はありません</p>
    {/if}
  </div>

  <footer>
    <span class="selected">選択中 {selected} 件</span>
    {#if query.trim() !== ""}
      <button type="button" class="plain" onclick={clearSearch}>検索を消す</button>
    {/if}
    <button type="button" class="plain" onclick={onclose}>閉じる</button>
  </footer>
</div>

<style lang="scss">
  .popover {
    // Without this the padding and the border are added to the 15rem below and the panel renders at
    // 16.02rem — the same content-box-versus-border-box slip the bar's two-row cap had, and there is
    // no global reset here to catch either.
    box-sizing: border-box;
    position: absolute;
    z-index: 3;
    top: calc(100% + 0.25rem);
    left: 0;
    display: flex;
    // 画面設計案 03 案A の値一覧ポップオーバー幅。The list's own entries are elided at the width
    // (`.name`), so a wider panel would buy reach for long values at the cost of covering more of the
    // grid it opens over — and the count beside each value is what the width has to keep readable.
    width: 15rem;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.45rem;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--panel);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 18%, transparent);
    font-size: 0.72rem;
    text-align: left;
  }

  .search {
    display: flex;
    flex-direction: column;
    gap: 0.16rem;
  }

  .caption {
    font-size: 0.62rem;
    color: var(--muted);
  }

  input[type="search"] {
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
  }

  // スクロール (doc-7 §5.2): the list is what grows with the workspace, so the height is capped here
  // and nowhere else — the popover stays the same size whether the project has 5 labels or 50.
  .values {
    display: flex;
    max-height: 17rem;
    flex-direction: column;
    gap: 0.3rem;
    overflow-y: auto;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  h3 {
    margin: 0;
    font-size: 0.62rem;
    font-weight: 650;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .value {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.1rem 0.25rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;

    &:hover {
      border-color: var(--line-strong);
    }

    &.on {
      border-color: color-mix(in srgb, var(--info) 45%, transparent);
      background: color-mix(in srgb, var(--info) 12%, transparent);
    }
  }

  .mark {
    width: 0.7rem;
    flex: none;
    color: var(--info);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 値ごとの件数 (doc-7 §5.2), lined up so the numbers can be compared down the column (doc-11 §2.2).
  .count {
    flex: none;
    color: var(--muted);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }

  .none {
    margin: 0;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .dash {
    color: var(--faint);
  }

  footer {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--line);
  }

  .selected {
    margin-right: auto;
    color: var(--muted);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }

  .plain {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
  }

  // 更新期間 (doc-7 §5.2). Fields rather than a list, but the same 区画見出し and the same gaps as
  // the value sections above — the panel should not read as two panels because one facet is entered.
  .period {
    gap: 0.25rem;
  }

  .end {
    display: flex;
    align-items: center;
    gap: 0.3rem;

    // Both captions take one width, so the two date fields start on the same column. Without it the
    // 始端・終端 boxes step sideways by the width difference of their labels.
    .caption {
      width: 2.4rem;
      flex: none;
    }
  }

  // 日付には tabular-nums (doc-11 §2.2): the two ends are read as a pair, and proportional digits
  // put the same day in two different places.
  input[type="date"],
  input[type="number"] {
    box-sizing: border-box;
    padding: 0.16rem 0.25rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  input[type="date"] {
    min-width: 0;
    flex: 1;
  }

  .relative {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    // 副次 (doc-11 §2.1): the row that builds a 始端 is quieter than the two ends themselves, which
    // are what actually filter.
    color: var(--muted);
    font-size: 0.65rem;

    label {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    input[type="number"] {
      width: 2.8rem;
      font-size: 0.65rem;
    }

    select {
      box-sizing: border-box;
      padding: 0.16rem 0.16rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: var(--bg);
      color: var(--fg);
      font: inherit;
      font-size: 0.65rem;
    }

    .plain {
      margin-left: auto;
      font-size: 0.65rem;
    }
  }
</style>
