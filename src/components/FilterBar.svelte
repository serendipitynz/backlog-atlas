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
  import type { Snippet } from "svelte";
  import FilterPopover from "./FilterPopover.svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import { defaultFilter, type CardFilter, type Facets } from "../lib/filter";
  import { CARD_ORDER_CHOICES, cardOrderLabel } from "../lib/swimlane";
  import type { CardOrder } from "../lib/wire";
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
  import { messages } from "../lib/messages-context";
  import type { StorageSelection } from "../lib/wire";

  interface Props {
    filter: CardFilter;
    facets: Facets;
    /** 既定の保存区分 (decision-13): the state 既定に戻す puts the filter back to. */
    defaultStorage: readonly StorageSelection[];
    /**
     * Whether the 値一覧 is open. Held by the shell, not here, because a key opens it as well
     * (`shortcuts.ts`'s `addFilter`) — with the state in this component the chord would need a second
     * way in, and two openers would disagree about whether it is up.
     */
    popoverOpen: boolean;
    /**
     * 並び順 (doc-7 §5.4). Not part of `filter`: the bar holds both, but a 並び順 takes no card away,
     * so it is neither a 絞り込み条件 nor something 既定に戻す reaches.
     */
    cardOrder: CardOrder;
    /** Why the last choice could not be stored as the 既定, or `null` (doc-7 §5.4). */
    cardOrderFailure: string | null;
    onpopover: (open: boolean) => void;
    onchange: (filter: CardFilter) => void;
    oncardorder: (order: CardOrder) => void;
    /**
     * The ☰ and its menu (decision-31), drawn by the shell and placed here: this is スイムレーン's
     * topmost row, and since the 固定ヘッダ went that is where the 共通入口 are reached from. Rendered
     * rather than built here because the menu's items, its open state and the focus a モーダル returns
     * to are all the shell's — this bar only says where on the row it goes.
     */
    menu: Snippet;
  }

  let {
    filter,
    facets,
    defaultStorage,
    popoverOpen,
    cardOrder,
    cardOrderFailure,
    onpopover,
    onchange,
    oncardorder,
    menu,
  }: Props = $props();

  const t = messages();

  // The text box keeps its own state and is bound (DOM → state), never written back on every
  // keystroke: writing the value back mid-composition is what breaks IME input, and the filter
  // is not worth re-running on each intermediate 変換 candidate either. `isComposing` holds the
  // dispatch until the composition ends, and the effect only re-syncs when the filter is
  // changed from outside (既定に戻す).
  let text = $state("");
  $effect(() => {
    text = filter.text;
  });

  function commitText(event: Event): void {
    // `isComposing` is true for every keystroke of an IME composition; the browser fires one
    // more `input` once the composition is committed, which is the one that gets through.
    if ((event as InputEvent).isComposing) {
      return;
    }
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
  // 絞り込みが既定のままのときは文を見せない (doc-11 §8): the 帯 is showing its own conditions, so the
  // state that makes 既定に戻す inert is already on screen. It is still *said* — these controls take
  // doc-11 §5's second form (`aria-disabled` + `aria-describedby`), where the target has to exist
  // whenever it is pointed at, so the reason is hidden rather than dropped.
  let blockedReason = $derived(
    clearBlocked
      ? t().filter.alreadyDefault
      : undoBlocked
        ? t().filter.nothingToUndo
        : null,
  );
  /** Whether the 帯 itself already shows the reason, so it is not printed a second time (doc-11 §8). */
  let reasonOnScreen = $derived(clearBlocked);

  /**
   * Take the `<select>`'s value back to the union by looking it up, not by asserting it — the same
   * bargain `card.ts` の `priorityStep` strikes with `find`. A cast would accept whatever the DOM
   * handed over, and this is the one value on the bar that is written to `settings.toml`.
   */
  function chooseOrder(value: string): void {
    const found = CARD_ORDER_CHOICES.find((order) => order === value);
    if (found !== undefined) {
      oncardorder(found);
    }
  }

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
  <!-- 帯全体の目印 (doc-7 §5.2): 操作に属さないアイコン, so it takes no `aria-label`, no `title` and
       no focus — it is not a control, and one that announced itself would be a thing a keyboard can
       reach and pressing does nothing. What it says in a figure, the bar also says in words (＋ 絞り込み,
       既定に戻す, and the box's own `aria-label`), which is what doc-11 §2.4 requires of an `aria-hidden`
       figure: the icon repeats the meaning rather than being the only place it exists. -->
  <span class="marker"><Icon name="funnel" /></span>

  <!-- No visible 属性名 (doc-7 §5.2, TASK-112). 「テキスト」 named the box without saying what it
       filters, so the word is gone and the two halves of naming are split: `aria-label` is the name a
       screen reader reads, the placeholder is what the box takes. **No `<label>` around it either** —
       with the word gone the element would wrap nothing but the input and promise a caption that is
       not there; `aria-label` names the box directly. The funnel is a sibling rather than a parent for
       the same reason it is not a label: it points at the whole bar (doc-11 §2.4). -->
  <input
    type="search"
    aria-label={t().filter.textLabel}
    placeholder={t().filter.textPlaceholder}
    bind:value={text}
    oninput={commitText}
  />

  <!-- 値の一覧は「＋ 絞り込み」から開くポップオーバーで選ぶ (doc-7 §5.2). Kept outside the token
       area so it stays put while the tokens scroll. The anchor is what the popover treats as
       「内側」, which is why pressing this button while it is open closes rather than reopens: the
       popover's `pointerdown` listener does run, but the press is inside the anchor it tests
       against, so it does nothing and this handler is the whole of that 閉じる契機. -->
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
      {t().filter.add}
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
        <!-- アイコンのみのボタン (doc-11 §2.4). doc-11 §3 keeps the トークン out of the 4 系統 because
             it carries this control; the figure is the same `x` the モーダル draws, and §7 says so
             without lending this control that section's contract. -->
        <button
          type="button"
          class="drop"
          aria-label={t().filter.removeToken(
            `${token.facet}${token.value === null ? "" : ` ${token.value}`}`,
          )}
          onclick={() => onchange(removeCondition(filter, token.condition))}
        >
          <Icon name="x" />
        </button>
      </span>
    {:else}
      <!-- Only reachable by taking every 保存区分 off: the selection is positive (doc-7 §5.2), so an
           empty one shows nothing. Said plainly, because an empty grid otherwise reads as a workspace
           with no tasks in it. -->
      <span class="empty">{t().filter.noStorageSelected}</span>
    {/each}
  </div>

  <div class="actions">
    <!-- 末尾から 1 件ずつ解除 (doc-7 §5.2). Tokens carry an order, which is what makes 直前の 1 つ
         a thing that can be pointed at at all.

         アイコンのみのボタン (doc-11 §2.4, TASK-175): the name is the `aria-label` and carries no
         chord, and the chord itself reaches the reader through `title` and `aria-keyshortcuts` — the
         form doc-7 §2.1 states for this type, and the reason the printed hint beside it is gone. When
         the control is blocked its `title` states the reason instead (doc-7 §2.1 again): naming the
         chord there would advertise an operation that will not answer. -->
    <button
      type="button"
      class="control icon"
      aria-label={t().filter.undoLabel}
      aria-disabled={undoBlocked}
      aria-describedby={undoBlocked ? BLOCKED_ID : undefined}
      aria-keyshortcuts={ariaKeyShortcuts("undoFilter", MAC_KEYBOARD)}
      title={undoBlocked
        ? (blockedReason ?? undefined)
        : t().filter.undoHint(shortcutHint("undoFilter", MAC_KEYBOARD))}
      onclick={() => !undoBlocked && onchange(removeLastCondition(filter))}
    >
      <Icon name="undo" />
    </button>
    <!-- No chord to print (doc-7 §5.2 assigns this control none on purpose), so the `title` is the
         operation alone — an アイコンのみのボタン without one would leave the figure as the only thing
         a pointer can ask. -->
    <button
      type="button"
      class="control icon"
      aria-label={t().filter.clearLabel}
      aria-disabled={clearBlocked}
      aria-describedby={clearBlocked ? BLOCKED_ID : undefined}
      title={clearBlocked ? (blockedReason ?? undefined) : t().filter.clearHint}
      onclick={() => !clearBlocked && onchange(defaultFilter(defaultStorage))}
    >
      <Icon name="refresh-ccw" />
    </button>
    <span class={reasonOnScreen ? "unseen" : "blocked-note"} id={BLOCKED_ID}>
      {blockedReason ?? ""}
    </span>
  </div>

  <!-- 並び順 (doc-7 §5.4). Outside `.tokens` and outside the two 解除 controls, because it is not a
       絞り込み条件: it takes no card away, carries no トークン, and 既定に戻す does not reach it. The
       visible 「並び順」 stays — unlike the text box's 属性名 (TASK-112), this word does say what the
       control decides, and it is the one thing on the bar that says this control is not a filter.
       A `<select>` spelling all ten orders in words, so the direction reads without hovering or
       pressing, and doc-11 §2.4 gains no new form. -->
  <div class="order">
    <label>
      {t().filter.orderLabel}
      <select value={cardOrder} onchange={(event) => chooseOrder(event.currentTarget.value)}>
        {#each CARD_ORDER_CHOICES as value (value)}
          <option {value}>{cardOrderLabel(value)}</option>
        {/each}
      </select>
    </label>
    <!-- The order took effect; only its persistence did not (doc-7 §5.4). Said rather than swallowed,
         and only while it is true — there is no blocked control here to describe. -->
    {#if cardOrderFailure !== null}
      <span class="order-failure">{cardOrderFailure}</span>
    {/if}
  </div>
  <!-- 総計 is not here (doc-7 §5.2, TASK-66): it is in the タイトルバー, which is the one place that
       prints it (decision-31). The per-row 内訳 on each レーンヘッダ行 stays where it is. -->

  <!-- 帯の右端 (decision-31): the ☰ is last on the row and pushes itself right, so it stays at the edge
       however the 絞り込みトークン above have wrapped. It sits *after* 並び順 rather than among the two
       解除 controls because it is not a control of this bar — what it opens reaches every screen. -->
  {@render menu()}
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
     * The cap can only be arithmetic on a border-box height; app.scss gives every フォーム部品 that
     * sizing in one place (doc-11 §2.2), so the controls here no longer each declare it. The value is
     * the middle step of that section's 段階 — this bar sits alongside the content rather than being
     * the thing the user came to fill in.
     */
    --bar-control: 1.4rem;
    // The gap between two token rows, named for the same reason `--bar-control` is: the cap below
    // adds one of these to two control heights, so a literal here and a literal there could drift
    // apart — which is the shape of the defect this task fixed, not a shape to leave behind.
    --bar-gap: 0.3rem;

    display: flex;
    flex-wrap: wrap;
    // 中央揃え (画面設計案 03 案A・01。baseline ではない — アイコンや枠を持つ控えは baseline を
    // 持たないので、揃うのは文字だけになる)。
    align-items: center;
    gap: var(--bar-gap);
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--line);
    font-size: var(--text-md);
  }

  // 操作に属さないアイコン (doc-11 §2.4). No size of its own: the figure is 1em, so the bar's own
  // font-size decides it — the same knob the words beside it take, which is why the marker cannot
  // drift away from them. `flex` only to keep the 1em box from sitting on a text baseline the row
  // does not use (the bar centres, and an inline box would add the line's descender to the height).
  .marker {
    display: flex;
    // 副次 (doc-11 §2.1), like the 属性名 this replaced. `Icon.svelte` draws in `currentColor`, so
    // this is the whole of the icon's colour.
    color: var(--muted);
  }

  input[type="search"] {
    height: var(--bar-control);
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: var(--text-sm);
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
    // Two rows of `--bar-control` and the one gap between them, both read from the same variables
    // the rows themselves use — so the cap is the height of exactly two rows rather than a number
    // that happens to be near it.
    max-height: calc(var(--bar-control) * 2 + var(--bar-gap));
    flex: 1;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: var(--bar-gap);
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
    font-size: var(--text-sm);
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
    font-size: var(--text-xs);
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
    // ボタンの角丸 (doc-11 §2.2), like the token it sits in — a chip's 3px would be the one value
    // in this bar that says a pressable thing is a label.
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--text-sm);
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
    font-size: var(--text-sm);
    // A fixed height cannot absorb a wrapped label — the second line would leave the 22.39px box.
    // The same reason `.token` carries it; these controls only gained a fixed height here.
    white-space: nowrap;
    cursor: pointer;
  }

  // 解除の 2 つは、条件を足す ＋ 絞り込み より一段静かに置く (画面設計案 03 案A が 既定に戻す に
  // 与えた大きさ)。帯で先に読まれるべきなのは、いま効いている条件と、条件を足す入口である。
  // 図形になった後もこの段のままなのは、doc-11 §2.4 の寸法が箱の `font-size` を読むためで、単独の
  // ボタンの既定 1rem をここで取ると、帯の中でこの 2 つだけが大きくなる (先頭の funnel と同じ理由で
  // 帯の側が勝つ。トークンの解除も同じ段を取っている)。
  .actions .control {
    font-size: var(--text-sm);
  }

  // アイコンのみのボタン (doc-11 §2.4, TASK-175). `.control` の左右の余白は語のために取ってあるので、
  // 図形へそのまま与えると図形より横に広い箱になり、帯の右端で 3 つ目の入力欄のように読める。幅を
  // 高さに揃えて正方にする — 高さは `--bar-control` のままなので、帯の 1 行は変わらない。
  .control.icon {
    width: var(--bar-control);
    justify-content: center;
    padding: 0;
  }

  // The chord beside its operation (doc-7 §2.1 / AC #4). Quiet, and outside the accessible name — the
  // control's own label is the entry, and `aria-keyshortcuts` carries the chord as data.
  .hint {
    color: var(--muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  // 視覚的にのみ隠す (doc-11 §5 の 2 つ目の形): the reason stays in the accessibility tree, because
  // `aria-describedby` names it whether or not it is drawn.
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  // The 理由 doc-11 §5 requires to be readable without hovering. It sits on the bar's own line
  // rather than on one of its own, so stating it costs the grid no height.
  .blocked-note {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  // 並び順 (doc-7 §5.4). Takes the bar's own height like every other control here — 帯の高さは 1 行
  // のまま (画面設計案 03 案A) is a property of the row, and a taller control would break it whether
  // or not the row wraps.
  .order {
    display: flex;
    align-items: center;
    gap: 0.3rem;

    label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      // 副次 (doc-11 §2.1), like the トークン's 属性名: the word names the control, the value is what
      // is read.
      color: var(--muted);
      font-size: var(--text-xs);
    }

    select {
      height: var(--bar-control);
      max-width: 9rem;
      padding: 0 0.16rem;
      border: 1px solid var(--line-strong);
      // ボタンの角丸 (doc-11 §2.2), the value every control in this bar takes.
      border-radius: 4px;
      background: var(--bg);
      color: var(--fg);
      font: inherit;
      font-size: var(--text-sm);
    }
  }

  .order-failure {
    color: var(--muted);
    font-size: var(--text-sm);
  }

</style>
