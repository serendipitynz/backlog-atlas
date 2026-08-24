<script lang="ts">
  // ☰ のメニュー (doc-7 §2.1, TASK-56). Two things live here and nowhere else:
  //
  // - **The 共通入口 themselves.** They had a button apiece on the header until TASK-66 folded those
  //   away, so this is now the only place either is drawn. §2.1's ヘッダに出している操作はメニューにも
  //   同じものを置く is met by there being nothing on the 帯 that is not here; each entry's own
  //   one-line 説明 came along with it, as the line's `title`.
  // - **The プロジェクト一覧 (doc-7 §2.1).** Every registered project, one 表示切替行 apiece, with a
  //   tick on the rows the grid is drawing. Since TASK-131 this is the only place 行非表示 is reached
  //   from: the レーンヘッダ行's 隠す and the 上部帯 ⑥ both went, so one state has one control again.
  //
  // The 割り当て一覧 (doc-7 §2.1) is *reached* from here and its table is no longer drawn here: TASK-67
  // moved that table into the 一覧モーダル (`ShortcutHelp.svelte`), leaving this menu one line that opens
  // it. §2.1 asks for the 一覧 in 1 箇所 — that is `shortcuts.ts`, which every hint below is printed from
  // as well, and which the table draws three of the five 欄 of.
  import {
    ariaKeyShortcuts,
    matchShortcut,
    shortcutHint,
    textEntryFocused,
  } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import { omitsSentence, startsGroup, type MenuItem } from "../lib/header";
  import { messages } from "../lib/messages-context";
  import Icon from "../lib/icons/Icon.svelte";

  interface Props {
    items: MenuItem[];
    /**
     * The box the menu hangs off, so a press on the ☰ that opened it is not counted as a press
     * outside — otherwise opening would immediately close it again (`FilterPopover` does the same).
     */
    boundary: HTMLElement | null;
    onchoose: (item: MenuItem) => void;
    onclose: () => void;
  }

  let { items, boundary, onchoose, onclose }: Props = $props();

  const t = messages();

  let root = $state<HTMLDivElement | null>(null);

  // Opened by a press, so the first line takes focus: the menu exists to be walked with the keyboard
  // when the 帯 is too narrow to show its entries, and focus left behind on the ☰ would put the
  // next keystroke nowhere the user can see.
  $effect(() => {
    root?.querySelector<HTMLElement>("button")?.focus();
  });

  // Closed by a press outside, as `FilterPopover` is: `pointerdown` rather than `click`, so a press that
  // starts outside cannot first land on whatever the menu was covering.
  $effect(() => {
    function outside(event: PointerEvent): void {
      const box = boundary ?? root;
      if (box !== null && !box.contains(event.target as Node)) {
        onclose();
      }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });

  function keydown(event: KeyboardEvent): void {
    const binding = matchShortcut(event, {
      // 被せ層 (`shortcuts.ts`): the menu answers the same Escape a modal and the 値一覧 do, and keeps
      // focus free — only a modal traps it, so the `modal` scope is not passed here.
      scopes: ["overlay"],
      textEntry: textEntryFocused(document.activeElement),
      mac: MAC_KEYBOARD,
    });
    if (binding?.action !== "closeOverlay") {
      return;
    }
    // Spent on this layer: it is the innermost thing open, so the window handler behind must not read
    // the same press as well.
    event.stopPropagation();
    onclose();
  }

  /** A line the user cannot take now says why (doc-11 §5), and the reason is an element, not a title. */
  function reasonId(index: number): string {
    return `header-menu-held-${index}`;
  }
</script>

<!-- `tabindex="-1"` for the same reason `FilterPopover` has it: the box itself must be able to take focus,
     so a press inside is answered here even before any line has it. -->
<div
  class="menu"
  role="dialog"
  aria-label={t().action.menu}
  tabindex="-1"
  bind:this={root}
  onkeydown={keydown}
>
  <ul>
    <!-- Keyed by the item's own `key` (`header.ts`), never by `kind`: the two 共通入口 share a kind, and
         Svelte makes duplicate keys a runtime error — which took the whole menu down. -->
    {#each items as item, index (item.key)}
      <!-- 区切り線 is decided by `startsGroup` (`header.ts`) and not by anything in this file: it reads
           the item's 群 and never its `availability`. That is what kept the mark from coming and going with the
           破線枠 that used to stand at this boundary, and doc-7 §2.1 keeps the rule now that the frame
           is gone — what the two describe stays different. -->
      <li class:group-start={startsGroup(items, index)}>
        <button
          type="button"
          aria-disabled={item.availability.state === "withheld"}
          aria-describedby={item.availability.state === "ready" ? undefined : reasonId(index)}
          aria-keyshortcuts={item.kind === "entry" ? ariaKeyShortcuts(item.entry.action, MAC_KEYBOARD) : undefined}
          aria-pressed={item.kind === "toggleProject" ? item.shown : undefined}
          title={item.kind === "entry" ? item.entry.note : undefined}
          onclick={() => item.availability.state === "ready" && onchoose(item)}
        >
          {#if item.kind === "toggleProject"}
            <!-- 表示中の印 (doc-7 §2.1). doc-11 §2.4's 可視の文言を持つ控えの中のアイコン: the row's
                 name is the control's name, so the figure takes no `aria-label` and adds no word to
                 it — `aria-pressed` above is what carries the state, which is the same test §2.4 puts
                 to a `<summary>`'s open state (the control's own mechanism already announces it).
                 The slot keeps its width when there is no tick, so the names line up as a column. -->
            <span class="mark">
              {#if item.shown}<Icon name="check" />{/if}
            </span>
          {/if}
          <span class="label">{item.kind === "entry" ? item.entry.label : item.label}</span>
          {#if item.kind === "entry"}
            <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4). Printed from the 割り当て一覧, so the menu
                 cannot advertise a chord the matcher does not answer. Hidden from the accessible name
                 because `aria-keyshortcuts` above already carries it as data. -->
            <span class="hint" aria-hidden="true">{shortcutHint(item.entry.action, MAC_KEYBOARD)}</span>
          {:else if item.kind === "releasePage" && item.notice !== null}
            <!-- 新しい版 (decision-44 §3). **Not `aria-hidden`**, unlike the chord above: no attribute
                 on this line carries the same fact as data, and the ☰'s own name says only that a
                 版 is out — which one is here and nowhere else. -->
            <span class="notice">{item.notice}</span>
          {/if}
        </button>
        {#if item.availability.state === "withheld"}
          <!-- Drawn or not by which 保留理由 this is (doc-7 §2.1 の 2 項). All rows shown is omitted:
               the 一覧 below states it — every line the grid draws carries a tick — which is doc-11 §8's
               licence for a sentence the 区画 already makes visible. An empty ledger is *not* on that
               licence, because an empty list states nothing, so its reason keeps a visible line.
               視覚的にのみ隠す (doc-11 §5 の 2 つ目の形) rather than dropped, so the reason stays in the
               accessibility tree and `aria-describedby` names something either way. -->
          <p
            class="held"
            class:unseen={omitsSentence(item.availability.reason)}
            id={reasonId(index)}
          >
            {item.availability.reason}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style lang="scss">
  .menu {
    position: absolute;
    z-index: 3;
    top: calc(100% + 0.25rem);
    right: 0;
    // Sized by what is in it. The panel held a fixed 24rem from the days it contained the 割り当て一覧
    // table (TASK-67 moved that to `ShortcutHelp.svelte` and left the number behind), and the lines that
    // remain ask for well under half of it — measured at 140.73px on WebKit and 148.53px on Chromium
    // against a 397.19px panel, so three fifths of the menu was blank. `max-content` is the width the
    // longest line wants; the cap and its value are doc-7 §2.1's, not this file's — it is what a long
    // project name in a 表示切替行 runs into, and past it the label wraps rather than the panel growing
    // across the window. 24rem is the width the panel already had, which is why the widest case is
    // unchanged.
    //
    // TASK-131 moved which line decides that width without changing the rule: the widest is now
    // すべてのプロジェクトを表示 at 157.23px (WebKit) / 167.52px (Chromium), where before it was
    // プロジェクトを登録 with its chord at 140.73 / 148.53 — so the panel went 153.92 → 170.42 and
    // 161.72 → 180.70. The プロジェクト names the list added are not the driver ("Backlog Atlas" asks
    // for 111.38px); a 60-character name is, and it wraps at the cap with 0px of horizontal overflow.
    width: max-content;
    max-width: min(24rem, 90vw);
    max-height: 70vh;
    padding: 0.35rem;
    border: 1px solid var(--line-strong);
    // パネル 6px (doc-11 §2.2).
    border-radius: 6px;
    background: var(--panel);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--fg) 18%, transparent);
    font-size: var(--text-md);
    overflow-y: auto;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  // 区切り線 (doc-7 §2.1): 罫線 は `--line` (doc-11 §2.1), 余白は .25rem 段 (doc-11 §2.2). Drawn on the
  // `li` rather than on the button inside it, so hover and 無効化提示 — both of which move the button's
  // own border — leave it where it is.
  //
  // Nothing carries it into the accessibility tree, and doc-7 §2.1 says so rather than leaving it to be
  // read as an oversight: what the 群 separates is already said by each line's own words, which is the
  // test doc-11 §2.4 puts to a figure that stands outside a control. Exposing the 群 as a named unit is
  // a different question, and §2.1 is where it would be settled — not here.
  li.group-start {
    margin-top: 0.25rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--line);
  }

  li > button {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    width: 100%;
    padding: 0.25rem 0.35rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-md);
    text-align: left;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a rule here would outrank it.

    &:hover:not([aria-disabled="true"]),
    &:focus-visible:not([aria-disabled="true"]) {
      border-color: var(--line-strong);
    }

    // A held line draws **no** frame, which is doc-7 §2.1's own exception to doc-11 §5 (2026-08-09).
    // §5 asks for a 破線枠 so that a held control differs in *form* from a pressable one (実線枠) — and
    // in this menu no line has a visible frame until it is hovered or focused, so the dash has nothing
    // to contrast with. Drawing it would put the list's only box around the one line that cannot be
    // taken, which reads as a mark on the list rather than as an unavailable control. The shared rule
    // in `app.scss` supplies the dash through `border-style` alone, so the transparent border above is
    // what leaves the line unframed; opacity .45 from that same rule is what says held here.
  }

  // 表示中の印 の置き場 (doc-7 §2.1). Held at the icon's own 1em (doc-11 §2.4) whether or not a tick is
  // in it: a slot that collapsed when the row is hidden would move that row's name, and the column of
  // names is what makes the list readable as a set of states rather than as separate lines.
  .mark {
    flex: none;
    width: 1em;
    // The tick is `align-items: baseline`'s to place otherwise, and a `block` SVG has no baseline of
    // its own — it would sit on the line box's bottom edge instead of beside the word. Centred on the
    // whole row rather than on its first line, because what the tick is about is the row: the only
    // labels that take two lines are the ones long enough to hit doc-7 §2.1's cap, and there the tick
    // belongs to both lines equally.
    align-self: center;
  }

  .label {
    flex: 1;
    min-width: 0;
  }

  // The chord, kept quiet: it is a reminder beside the operation, not the operation itself
  // (doc-7 §2.1 ショートカットだけが入口の操作を作らない — the line above is the entry).
  .hint {
    flex: none;
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  // 新しい版 (decision-44 §3), in the slot the chord uses — the two never appear on the same line, and
  // the column they share is what keeps either from moving the label. Not `--muted`: this is the one
  // thing in the menu the user did not come looking for, so it takes the body colour while the chord,
  // a reminder beside an operation, stays quiet.
  .notice {
    flex: none;
    font-size: var(--text-sm);
  }

  // 無効化の理由 (doc-11 §5) is a secondary sentence, so `--muted` (doc-11 §2.1). Kept for the day a
  // 保留理由 arrives here that the 一覧 does not already state — doc-11 §8's licence is per reason, not
  // per component, so the class that draws one has to stay drawable.
  .held {
    margin: 0 0.35rem 0.2rem;
    color: var(--muted);
    font-size: var(--text-sm);
    line-height: 1.3;
  }

  // 視覚的にのみ隠す (doc-11 §5 の 2 つ目の形), as `FilterBar.svelte` and `ProjectDetail.svelte` do it:
  // removing the element or giving it `display: none` would take the reason out of the accessibility
  // tree as well, and `aria-describedby` above would then name nothing.
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
</style>
