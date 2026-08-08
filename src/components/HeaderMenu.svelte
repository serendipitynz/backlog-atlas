<script lang="ts">
  // 固定ヘッダのメニュー (doc-7 §2.1, TASK-56). Two things live here and nowhere else:
  //
  // - **The 共通入口 themselves.** They had a button apiece on the header until TASK-66 folded those
  //   away, so this is now the only place either is drawn. §2.1's ヘッダに出している操作はメニューにも
  //   同じものを置く is met by there being nothing on the header that is not here; each entry's own
  //   one-line 説明 came along with it, as the line's `title`.
  // - **The per-row 行非表示 list.** doc-11 §4 names this case as its example of 縮約: the 帯 keeps the
  //   count and its own すべて戻す, and 個々のレーンはメニューの一覧から戻す — which is this list.
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
  import type { MenuItem } from "../lib/header";

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

  let root = $state<HTMLDivElement | null>(null);

  // Opened by a press, so the first line takes focus: the menu exists to be walked with the keyboard
  // when the header is too narrow to show its entries, and focus left behind on the ☰ would put the
  // next keystroke nowhere the user can see.
  $effect(() => {
    root?.querySelector<HTMLElement>("button")?.focus();
  });

  // Closed by a press outside, as `FilterPopover` is: `pointerdown` rather than `click`, so a press that
  // starts outside cannot first land on whatever the menu was covering.
  $effect(() => {
    function outside(event: PointerEvent): void {
      const box = boundary ?? root;
      if (box !== null && !box.contains(event.target as Node)) onclose();
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
    if (binding?.action !== "closeOverlay") return;
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
  aria-label="メニュー"
  tabindex="-1"
  bind:this={root}
  onkeydown={keydown}
>
  <ul>
    <!-- Keyed by the item's own `key` (`header.ts`), never by `kind`: the two 共通入口 share a kind, and
         Svelte makes duplicate keys a runtime error — which took the whole menu down. -->
    {#each items as item, index (item.key)}
      <li>
        <button
          type="button"
          aria-disabled={item.held !== null}
          aria-describedby={item.held === null ? undefined : reasonId(index)}
          aria-keyshortcuts={item.kind === "entry" ? ariaKeyShortcuts(item.entry.action, MAC_KEYBOARD) : undefined}
          title={item.kind === "entry" ? item.entry.note : undefined}
          onclick={() => item.held === null && onchoose(item)}
        >
          <span class="label">{item.kind === "entry" ? item.entry.label : item.label}</span>
          {#if item.kind === "entry"}
            <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4). Printed from the 割り当て一覧, so the menu
                 cannot advertise a chord the matcher does not answer. Hidden from the accessible name
                 because `aria-keyshortcuts` above already carries it as data. -->
            <span class="hint" aria-hidden="true">{shortcutHint(item.entry.action, MAC_KEYBOARD)}</span>
          {/if}
        </button>
        {#if item.held !== null}
          <!-- 常時表示する補助文 (doc-11 §5): the reason is on screen rather than in a `title`, which is
               unreachable from the keyboard and from touch. -->
          <p class="held" id={reasonId(index)}>{item.held}</p>
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
    // Narrower since TASK-67 took the table out: it was what needed 30rem — five columns then, three
    // since TASK-125 — and the widest thing left is a 保留理由 sentence, which reads better wrapped than
    // spread across a panel.
    width: min(24rem, 90vw);
    max-height: 70vh;
    padding: 0.35rem;
    border: 1px solid var(--line-strong);
    // パネル 6px (doc-11 §2.2).
    border-radius: 6px;
    background: var(--panel);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--fg) 18%, transparent);
    font-size: 0.75rem;
    overflow-y: auto;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
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
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a rule here would outrank it.

    &:hover:not([aria-disabled="true"]),
    &:focus-visible:not([aria-disabled="true"]) {
      border-color: var(--line-strong);
    }

    // A held line keeps a *visible* 破線枠. The shared rule in `app.scss` supplies only the dash
    // (`border-style`), so leaving this border transparent would draw the 無効化 with no frame at all —
    // and doc-11 §5 relies on that frame being the difference between held and pressable.
    &[aria-disabled="true"] {
      border-color: var(--line-strong);
    }
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
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  // 無効化の理由 (doc-11 §5) is a secondary sentence, so `--muted` (doc-11 §2.1).
  .held {
    margin: 0 0.35rem 0.2rem;
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.3;
  }
</style>
