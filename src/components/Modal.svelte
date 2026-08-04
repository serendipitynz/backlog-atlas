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
  import type { Snippet } from "svelte";
  import { matchShortcut, textEntryFocused } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";

  interface Props {
    /** The dialog's accessible name — what the header entry that opened it is called. */
    label: string;
    onclose: () => void;
    children: Snippet;
  }

  let { label, onclose, children }: Props = $props();

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
</style>
