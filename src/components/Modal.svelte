<script lang="ts">
  // モーダル (doc-7 §2.1, TASK-56): the layer 登録・設定・キーボード操作の一覧 open in (the third since
  // TASK-67). §2.1 gives it three obligations and this component is where all three are met once, rather
  // than in each thing it opens —
  // 開いている間フォーカスを内側に留め、Escape で閉じ、閉じたら開く前の操作へフォーカスを戻す.
  //
  // It is a layer and not a screen (AC #2 モーダルの外に画面遷移を作らない): the screen behind keeps its
  // rows, filter and selection, because none of the three is somewhere to work — they are answered, or
  // read, and dismissed. Nothing is unmounted to show them, so no route into them can lose 未保存入力 and
  // none of them needs the 破棄前確認 (doc-8 §6.3).
  //
  // Both keys it answers come from the 割り当て一覧 (`shortcuts.ts`), including the Tab it holds inside:
  // doc-7 §2.1 requires every key whose default is stopped to be entered in that list, and the trap
  // stops Tab's. During an IME composition neither fires, which is the same list's rule — the composition
  // owns the keyboard, and Escape then cancels the conversion instead of the modal.
  //
  // **This layer covers the 上部帯, including ① 確認**, unlike the 中央モーダル詳細配置 which is drawn over
  // the grid area alone (`App.svelte`) so a 破棄前確認 stays answerable behind it. The difference is
  // deliberate: doc-7 §2.1 requires *this* layer to keep focus inside, and a trap that let Tab reach a
  // control outside would not be one. Nothing becomes unreachable — Escape closes this modal and gives
  // focus back, so an unanswered ① is one key away, and none of the three can raise a 破棄前確認 of its
  // own, since opening them unmounts nothing that holds 未保存入力.
  //
  // **The × in the corner is this layer's** (doc-11 §7, TASK-76), not each caller's. Before, every one
  // of the three drew a 閉じる text button of its own beside its heading, so the one operation the three
  // share was three controls in three files — and the 設定 had none at all after TASK-74 moved its exits
  // to the 下部操作行. The × says only "close this layer"; a モーダル that holds a 下書き says what
  // becomes of it in its own 下部操作行 beside it (doc-11 §7 の役割の別).
  import type { Snippet } from "svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import { matchShortcut, textEntryFocused } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";

  interface Props {
    /** The dialog's accessible name — what the header entry that opened it is called. */
    label: string;
    /**
     * Why the shell will turn a close request away right now, or `null` while it will take one.
     *
     * The layer asks rather than decides — `onclose` stays a request (see below) — but a control that
     * silently does nothing is the 理由の無い無効化 doc-11 §5 refuses, and the × is the one exit that
     * has a control to hang a reason on. The shell holds the fact because it is the shell that wires
     * both exits: `App.svelte`'s `settingsSaving` turns away Escape too, so one circumstance closes
     * both rather than each exit reading its own.
     */
    closeBlocked?: string | null;
    onclose: () => void;
    children: Snippet;
  }

  let { label, closeBlocked = null, onclose, children }: Props = $props();

  /**
   * Where `aria-describedby` points while the × is withheld. A module constant rather than a generated
   * id: 被せ層 は 1 枚だけ (`App.svelte`'s `raiseModal`), so two of these cannot be in the document at
   * once. The reason is spelled here rather than shared with the caller's own printed line — a caller
   * that prints it (`Settings.svelte`'s 下部操作行) keeps its line, and one that does not still has a
   * reason to point at.
   */
  const CLOSE_BLOCKED_ID = "modal-close-blocked";

  /**
   * 閉じたら開く前の操作へフォーカスを戻す (doc-7 §2.1). Read while the component initialises, which is
   * still inside the press that opened it, so it is the control the user came from — a button in the
   * fixed header or a line of the menu. Read later (in an effect) it would already be the modal's own
   * first control.
   */
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let dialog = $state<HTMLDivElement | null>(null);

  /**
   * What Tab moves between. `[disabled]` is excluded and `aria-disabled` is not: doc-11 §5 keeps some
   * withheld controls focusable precisely so their `aria-describedby` reason can be read without a
   * pointer, and dropping them from the cycle would take that reason back.
   */
  const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "summary",
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");

  function focusable(): HTMLElement[] {
    const box = dialog;
    if (box === null) return [];
    return [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      // Rendered, rather than merely present: a control inside a closed `details` or behind `hidden`
      // cannot take focus, and Tab landing on it would look like the trap dropped the press.
      (element) => element.getClientRects().length > 0,
    );
  }

  // フォーカスを内側に (doc-7 §2.1): the first control, so the keyboard is already in the form rather
  // than on whatever sits behind the layer. Falls back to the dialog box itself, which `tabindex="-1"`
  // makes focusable, so focus is never left outside even before anything is rendered inside.
  $effect(() => {
    const box = dialog;
    if (box === null) return;
    const first = focusable()[0];
    (first ?? box).focus();
  });

  // Restoring the opener belongs to unmounting rather than to `onclose`: every way this modal can go —
  // its own 閉じる, Escape, and the shell dropping it for a reason of its own — ends here, and only here.
  $effect(() => {
    return () => opener?.focus();
  });

  function keydown(event: KeyboardEvent): void {
    const binding = matchShortcut(event, {
      scopes: ["overlay", "modal"],
      textEntry: textEntryFocused(document.activeElement),
      mac: MAC_KEYBOARD,
    });
    if (binding === null) return;
    if (binding.preventsDefault !== null) event.preventDefault();
    // The press is spent on the innermost open layer, so it does not also reach the window handler
    // behind it (`FilterPopover` consumes its Escape the same way).
    event.stopPropagation();
    if (binding.action === "closeOverlay") {
      onclose();
      return;
    }
    const items = focusable();
    if (items.length === 0) {
      dialog?.focus();
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = event.shiftKey
      ? at <= 0
        ? last
        : at - 1
      : at < 0 || at === last
        ? 0
        : at + 1;
    items[next]?.focus();
  }
</script>

<!-- The backdrop covers the whole window, so nothing behind it takes a press while the modal is open —
     that is the pointer half of フォーカスを内側に留める, and it is why there is no click-to-close here:
     a stray press on the backdrop would throw away a half-filled registration, and doc-7 §2.1 already
     gives a way out that cannot be pressed by accident (Escape). -->
<div class="backdrop">
  <!-- The keys are answered on the dialog box rather than on the backdrop: focus is inside it while the
       modal is up (that is what the trap is for), so every press passes through here on its way out. -->
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    bind:this={dialog}
    onkeydown={keydown}
  >
    <!--
      アイコンのみのボタン (doc-11 §2.4): no visible wording, so `aria-label` carries the whole name and
      it stays 閉じる whatever this layer is holding — the dialog's own `aria-label` above already says
      *what* is being closed, and 「プロジェクトを登録を閉じる」 is what composing the two would read as.
      `title` gives way to the reason while the close is withheld, as the 下部操作行 does.

      First in the dialog, so Tab starts here and the layer's own exit is one press away from opening —
      and so `Modal`'s focus-on-mount lands at the top of the box rather than below whatever the caller
      draws first (`ShortcutHelp` opens on a nine-row table and would otherwise open already scrolled).
    -->
    <button
      type="button"
      class="close"
      aria-label="閉じる"
      aria-disabled={closeBlocked !== null}
      aria-describedby={closeBlocked === null ? undefined : CLOSE_BLOCKED_ID}
      title={closeBlocked ?? "閉じる"}
      onclick={() => closeBlocked === null && onclose()}
    >
      <Icon name="x" />
    </button>
    <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Hidden from sight rather than left out: the one caller
         that withholds this control prints the same reason in its 下部操作行, and a second visible copy
         would name one circumstance twice in one box. Kept in the DOM at all times because a target
         inserted at the moment it is pointed at is not reliably announced. -->
    <span class="unseen" id={CLOSE_BLOCKED_ID}>
      {closeBlocked === null ? "" : `いま押せません: ${closeBlocked}`}
    </span>
    {@render children()}
  </div>
</div>

<style lang="scss">
  .backdrop {
    /*
     * How far the dialog is held off the window's top and bottom edges. Declared rather than written
     * into `padding` alone because a child that bounds its own height has to subtract it (`Settings`
     * does, so its 下部操作行 can stay outside the scroll), and the two numbers must be one number.
     * It inherits, which is what lets a child read it without either file naming the other's value.
     */
    --modal-backdrop-inset: 2rem;

    position: fixed;
    inset: 0;
    z-index: 4;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--modal-backdrop-inset) 1rem;
    // The same wash the 中央モーダル詳細配置 uses (`App.svelte`), so the two read as one kind of layer.
    background: color-mix(in srgb, var(--fg) 28%, transparent);
    overflow-y: auto;
  }

  .dialog {
    /*
     * The border a child has to subtract as well when it bounds its own height. In `px` and not `rem`
     * because that is what it is: a 1px rule does not scale with the root font, so it cannot be
     * expressed in the same unit as the inset above (TASK-115 の幾何).
     */
    --modal-dialog-border: 1px;
    /*
     * How far the × is held off the box's top and right edges. Its own value rather than a caller's
     * padding: the callers do not agree on one (`Settings` inlines 0.75rem, the other two pad 0.75rem
     * all round), and the × belongs to this box, not to what is drawn inside it.
     */
    --modal-close-inset: 0.5rem;

    position: relative;
    width: min(44rem, 100%);
    border: var(--modal-dialog-border) solid var(--line-strong);
    // パネル 6px (doc-11 §2.2).
    border-radius: 6px;
    background: var(--panel);
    box-shadow: 0 6px 24px color-mix(in srgb, var(--fg) 22%, transparent);

    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }

  /*
   * Out of the flow, so the box's first row is whatever the caller draws there (the heading) and the ×
   * sits at the end of that same line without every caller having to leave a slot for it.
   *
   * Square and sized from its own font-size: the figure is 1em (doc-11 §2.4), so the two numbers below
   * are the figure plus the room around it, and nothing here re-states the figure's size.
   */
  .close {
    box-sizing: border-box;
    position: absolute;
    top: var(--modal-close-inset);
    right: var(--modal-close-inset);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid transparent;
    // カード・ボタン 4px (doc-11 §2.2).
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;

    // hover は 枠線 --line → --line-strong (doc-11 §2.3). At rest the border is transparent rather
    // than absent: a border appearing on hover would move the figure by a pixel, and the whole point
    // of drawing it is that the control answers where it is.
    &:hover {
      border-color: var(--line-strong);
    }

    // 無効化提示 の 破線枠 (doc-11 §2.3) is drawn by `app.scss` as a `border-style`, which a border
    // this control keeps transparent at rest would draw in no colour at all. The colour is given back
    // here so the withheld state is the three marks §2.3 asks for and not two of them.
    &[aria-disabled="true"] {
      border-color: var(--line-strong);
    }

    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }

  // doc-11 §5 の 2 つ目の形: the reason stays in the accessibility tree while it is out of sight.
  // `display: none` would take it out of both, and a described-by target that is not in the tree is
  // the same as having no reason at all.
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
