<script lang="ts">
  // フィルタ帯 (doc-7 §5.2). Every control here only takes cards away; none of them can change the
  // rows or the columns.
  //
  // The bar shows *the conditions that are on*, as 絞り込みトークン, and nothing else: the values a
  // condition could be built from live in the popover behind ＋ 絞り込み. That is the whole point of
  // the shape — a workspace with 20 labels and 6 assignees used to expand into some five rows of
  // checkboxes, and every one of those rows came out of the grid's height. With tokens the bar grows
  // with the number of conditions *chosen*, which is small, and is capped at two wrapped rows on top
  // of that (see `.tokens` below).
  //
  // 保存区分 is the one facet that starts from a 既定 rather than from "off" (doc-7 §5.2), so its
  // tokens are standing before the user has done anything — doc-12 §4 の常設トークン.
  import FilterPopover from "./FilterPopover.svelte";
  import { defaultFilter, type CardFilter, type Facets } from "../lib/filter";
  import {
    filterTokens,
    lastCondition,
    nothingToClear,
    removeCondition,
    removeLastCondition,
    setText,
  } from "../lib/token";
  import { ariaKeyShortcuts, shortcutHint } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import type { StorageSelection } from "../lib/wire";

  interface Props {
    filter: CardFilter;
    facets: Facets;
    /** 既定の保存区分 (decision-13): the state 全解除 puts the filter back to. */
    defaultStorage: readonly StorageSelection[];
    /**
     * Whether the 値一覧 is open. Held by the shell, not here, because a key opens it as well
     * (`shortcuts.ts`'s `addFilter`) — with the state in this component the chord would need a second
     * way in, and two openers would disagree about whether it is up.
     */
    popoverOpen: boolean;
    onpopover: (open: boolean) => void;
    onchange: (filter: CardFilter) => void;
  }

  let {
    filter,
    facets,
    defaultStorage,
    popoverOpen,
    onpopover,
    onchange,
  }: Props = $props();

  // The text box keeps its own state and is bound (DOM → state), never written back on every
  // keystroke: writing the value back mid-composition is what breaks IME input, and the filter
  // is not worth re-running on each intermediate 変換 candidate either. `isComposing` holds the
  // dispatch until the composition ends, and the effect only re-syncs when the filter is
  // changed from outside (全解除).
  let text = $state("");
  $effect(() => {
    text = filter.text;
  });

  function commitText(event: Event): void {
    // `isComposing` is true for every keystroke of an IME composition; the browser fires one
    // more `input` once the composition is committed, which is the one that gets through.
    if ((event as InputEvent).isComposing) return;
    // Through `setText` rather than by writing the field, so the text takes its place in 追加順 and
    // 直前の 1 つを戻す can take it back like any other condition (`token.ts` says why it has no token).
    onchange(setText(filter, text));
  }

  let tokens = $derived(filterTokens(filter));

  // 無効化提示 (doc-11 §5): the two 解除 controls stay in place when there is nothing to remove, and
  // the reason sits beside them as text — `aria-disabled` keeps them focusable so `aria-describedby`
  // reaches it without a pointer, and `title` only repeats what is already on screen.
  const BLOCKED_ID = "filter-clear-blocked";
  // `nothingToClear` implies `undoBlocked` (it is one of its two halves), so the pair can never end
  // up stating that there is nothing to undo beside an enabled 直前の 1 つを戻す.
  let undoBlocked = $derived(lastCondition(filter) === null);
  let clearBlocked = $derived(nothingToClear(filter, defaultStorage));
  let blockedReason = $derived(
    clearBlocked
      ? "絞り込みは既定のままです。戻す条件も解除する条件もありません。"
      : undoBlocked
        ? "自分で足した条件がないため、直前の 1 つは戻せません（保存区分の既定は各トークンの × で外します）。"
        : null,
  );

  let anchor = $state<HTMLDivElement | null>(null);
  let opener = $state<HTMLButtonElement | null>(null);

  function close(): void {
    onpopover(false);
    // Back to the control the popover was opened from, so the next keystroke has somewhere to go.
    // Kept here rather than in the shell: this component owns the button, and the chord that opens the
    // popover comes *from* somewhere else, so there is nothing for the shell to hand focus back to.
    opener?.focus();
  }
</script>

<div class="bar">
  <!-- 属性名 beside the box rather than above it: stacked, this one control was 41px against the
       22px everything else in the row is, and a row whose height one member decides is the 崩れ this
       task is about (画面設計案 03 案A は帯を常に 1 行と置く). -->
  <label class="text">
    <span class="caption">テキスト</span>
    <input
      type="search"
      placeholder="横断タスクID・title"
      bind:value={text}
      oninput={commitText}
    />
  </label>

  <!-- 値の一覧は「＋ 絞り込み」から開くポップオーバーで選ぶ (doc-7 §5.2). Kept outside the token
       area so it stays put while the tokens scroll. -->
  <div class="add" bind:this={anchor}>
    <button
      type="button"
      class="control"
      bind:this={opener}
      aria-expanded={popoverOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts={ariaKeyShortcuts("addFilter", MAC_KEYBOARD)}
      onclick={() => (popoverOpen ? close() : onpopover(true))}
    >
      ＋ 絞り込み
      <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4); the chord itself is on `aria-keyshortcuts`. -->
      <span class="hint" aria-hidden="true">{shortcutHint("addFilter", MAC_KEYBOARD)}</span>
    </button>
    {#if popoverOpen}
      <FilterPopover {filter} {facets} boundary={anchor} {onchange} onclose={close} />
    {/if}
  </div>

  <div class="tokens">
    {#each tokens as token (token.key)}
      <!-- 属性名・値・解除操作の組 (doc-7 §1). -->
      <span class="token" class:baseline={token.baseline}>
        <span class="facet">{token.facet}</span>
        {#if token.value !== null}
          <span class="value" title={token.value}>{token.value}</span>
        {/if}
        <button
          type="button"
          class="drop"
          aria-label="{token.facet}{token.value === null ? '' : ` ${token.value}`} を解除"
          onclick={() => onchange(removeCondition(filter, token.condition))}>×</button
        >
      </span>
    {:else}
      <!-- Only reachable by taking every 保存区分 off: the selection is positive (doc-7 §5.2), so an
           empty one shows nothing. Said plainly, because an empty grid otherwise reads as a workspace
           with no tasks in it. -->
      <span class="empty">保存区分がひとつも選ばれていないため、カードは出ません</span>
    {/each}
  </div>

  <div class="actions">
    <!-- 末尾から 1 件ずつ解除 (doc-7 §5.2). Tokens carry an order, which is what makes 直前の 1 つ
         a thing that can be pointed at at all. -->
    <button
      type="button"
      class="control"
      aria-disabled={undoBlocked}
      aria-describedby={undoBlocked ? BLOCKED_ID : undefined}
      aria-keyshortcuts={ariaKeyShortcuts("undoFilter", MAC_KEYBOARD)}
      title={undoBlocked ? (blockedReason ?? undefined) : "最後に足した条件を 1 件戻します"}
      onclick={() => !undoBlocked && onchange(removeLastCondition(filter))}
    >
      直前の 1 つを戻す
      <span class="hint" aria-hidden="true">{shortcutHint("undoFilter", MAC_KEYBOARD)}</span>
    </button>
    <button
      type="button"
      class="control"
      aria-disabled={clearBlocked}
      aria-describedby={clearBlocked ? BLOCKED_ID : undefined}
      title={clearBlocked ? (blockedReason ?? undefined) : "すべての条件を外し、保存区分を既定へ戻します"}
      onclick={() => !clearBlocked && onchange(defaultFilter(defaultStorage))}
    >
      全解除
    </button>
    {#if blockedReason !== null}
      <span class="blocked-note" id={BLOCKED_ID}>{blockedReason}</span>
    {/if}
  </div>
  <!-- 総計 is not here (doc-7 §5.2, TASK-66): it is beside the 画面名 in the 固定ヘッダ, which is the one
       place that prints it. The per-row 内訳 on each レーンヘッダ行 stays where it is. -->
</div>

<style lang="scss">
  .bar {
    /*
     * The height every control in the row is drawn to (画面設計案 03 案A: 帯は常に 1 行).
     *
     * One value rather than each control sizing itself, because two separate things depend on them
     * agreeing. Vertically, controls of unequal height in a `center` row put their contents on
     * different lines — the 崩れ this task fixes was three of them at 17.39 / 17.78 / 27.08 (WebKit,
     * measured). And the two-row cap on `.tokens` below is computed from this: when the cap was
     * derived from a *content* height instead, the 1px borders it left out made two rows 47.2px
     * against a 43.2px cap, and 折り返し 2 行で頭打ち (doc-7 §5.2) clipped its own second row.
     * Every control here therefore takes `box-sizing: border-box` as well — there is no global
     * reset, and a border-box height is the only one the cap can be arithmetic on.
     */
    --bar-control: 1.4rem;

    display: flex;
    flex-wrap: wrap;
    // 中央揃え (画面設計案 03 案A・01。baseline ではない — アイコンや枠を持つ控えは baseline を
    // 持たないので、揃うのは文字だけになる)。
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.72rem;
  }

  .text {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .caption {
    font-size: 0.64rem;
    color: var(--muted);
  }

  input[type="search"] {
    box-sizing: border-box;
    height: var(--bar-control);
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
  }

  .add {
    // The popover is positioned against this box, so it opens under ＋ 絞り込み wherever the bar's
    // wrapping has put it.
    position: relative;
  }

  /*
   * 折り返し 2 行で頭打ち (doc-7 §5.2). The cap is a height, not a limit on how many conditions may
   * be held: past two rows the area scrolls, so every token stays reachable while the bar stops
   * taking height from the grid. Hiding the overflow instead would drop conditions out of sight
   * while they were still filtering the cards, which is the one thing this shape exists to prevent.
   */
  .tokens {
    display: flex;
    // Two rows of `--bar-control` and the one gap between them — the same gap the rule below sets,
    // so the cap is the height of exactly two rows rather than a number that happens to be near it.
    max-height: calc(var(--bar-control) * 2 + 0.3rem);
    flex: 1;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.3rem;
    overflow-y: auto;
  }

  .token {
    box-sizing: border-box;
    display: inline-flex;
    height: var(--bar-control);
    max-width: 14rem;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.16rem 0 0.3rem;
    border: 1px solid var(--line-strong);
    // ボタンの角丸 (doc-11 §2.2). 絞り込みトークン is not one of doc-11 §3's 印チップ — it is a
    // control with its own 解除 button inside it — so it takes the 4px the section gives controls
    // rather than the 3px it gives chips.
    border-radius: 4px;
    background: var(--inset);
    font-size: 0.68rem;
    white-space: nowrap;

    // 保存区分's 既定 was not chosen by anyone, so it is drawn a shade quieter than the conditions
    // the user did add — without a colour, since it is not a 印 and nothing is wrong (decision-6).
    &.baseline {
      border-style: dashed;
      background: transparent;
    }
  }

  .facet {
    color: var(--muted);
    font-size: 0.64rem;
  }

  .value {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .drop {
    display: inline-flex;
    width: 0.95rem;
    height: 0.95rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--fg) 10%, transparent);
      color: var(--fg);
    }
  }

  .empty {
    align-self: center;
    color: var(--muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .control {
    box-sizing: border-box;
    display: inline-flex;
    height: var(--bar-control);
    gap: 0.3rem;
    align-items: center;
    padding: 0 0.45rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
  }

  // 解除の 2 つは、条件を足す ＋ 絞り込み より一段静かに置く (画面設計案 03 案A が 既定に戻す に
  // 与えた大きさ)。帯で先に読まれるべきなのは、いま効いている条件と、条件を足す入口である。
  .actions .control {
    font-size: 0.66rem;
  }

  // The chord beside its operation (doc-7 §2.1 / AC #4). Quiet, and outside the accessible name — the
  // control's own label is the entry, and `aria-keyshortcuts` carries the chord as data.
  .hint {
    color: var(--muted);
    font-size: 0.62rem;
    font-variant-numeric: tabular-nums;
  }

  // The 理由 doc-11 §5 requires to be readable without hovering. It sits on the bar's own line
  // rather than on one of its own, so stating it costs the grid no height.
  .blocked-note {
    color: var(--muted);
    font-size: 0.65rem;
  }

</style>
