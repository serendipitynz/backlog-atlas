<script lang="ts">
  // モーダル (doc-7 §2.1, TASK-56): the layer 登録・設定・キーボード操作一覧 open in (the third since
  // TASK-67). §2.1 gives it three obligations and this component is where all three are met once, rather
  // than in each thing it opens —
  // 開いている間フォーカスを内側に留め、Escape で閉じ、閉じたら開く前の操作へフォーカスを戻す.
  //
  // It is a layer and not a screen (AC #2 モーダルの外に画面遷移を作らない): the screen behind keeps its
  // rows, filter and selection, because none of the three is somewhere to work — they are answered, or
  // read, and dismissed. **Opening** one unmounts nothing, so no route *in* can lose 未保存入力.
  //
  // **Closing one does.** Two of the three hold input of their own — the 設定's 下書き and the 登録's
  // three fields — and the caller drops the whole form when this layer goes, so the way out is where
  // that input is lost, not the way in. That is why `onclose` is a *request* rather than the act
  // (TASK-86): the 破棄前確認 (doc-8 §6.3) stands in front of it, and the shell answers. Until then
  // this comment claimed the guarantee the way in has for the way out as well.
  //
  // Both keys it answers come from the 割り当て一覧 (`shortcuts.ts`), including the Tab it holds inside:
  // doc-7 §2.1 requires every key whose default is stopped to be entered in that list, and the trap
  // stops Tab's. During an IME composition neither fires, which is the same list's rule — the composition
  // owns the keyboard, and Escape then cancels the conversion instead of the modal.
  //
  // **This layer covers the 上部帯, including ① 確認**, unlike the 中央モーダル詳細配置 which is drawn over
  // the grid area alone (`App.svelte`) so a 破棄前確認 stays answerable behind it. The difference is
  // deliberate: doc-7 §2.1 requires *this* layer to keep focus inside, and a trap that let Tab reach a
  // control outside would not be one. An ① raised *behind* this layer is still one key away — Escape
  // closes this modal and gives focus back. An ① raised *by* this layer cannot be, which is why the
  // question is drawn in the box below rather than in the 帯 (doc-11 §7, TASK-86). It is the same ①,
  // in the one place it can be read while the layer that raised it is up — not a seventh 上部帯,
  // which doc-11 §4 does not allow.
  //
  // **The × in the corner is this layer's** (doc-11 §7, TASK-76), not each caller's. Before, every one
  // of the three drew a 閉じる text button of its own beside its heading, so the one operation the three
  // share was three controls in three files — and the 設定 had none at all after TASK-74 moved its exits
  // to the 下部操作行. The × says only "close this layer"; a モーダル with a second way out — one that
  // writes what it holds and leaves — says which is which in its own 下部操作行 beside it (doc-11 §7 の
  // 役割の別). Holding input is not what calls for that row: the 登録 has input and no such exit, so
  // there is nothing for a wording to tell apart, and what the × does with it is said by the
  // 破棄前確認 instead.
  import type { Snippet } from "svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import {
    DISCARD_CONFIRM_CLOSE,
    DISCARD_CONFIRM_KEEP,
    DISCARD_CONFIRM_QUESTION,
    type DiscardAnswers,
  } from "../lib/edit";
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
    /**
     * The answers to a 破棄前確認 this layer's own close request raised, or `null` while none is
     * standing (doc-8 §6.3, doc-11 §7).
     *
     * Not the same state as `closeBlocked` above, and the two must not be folded into one: that one
     * means the request is *not issued* (the × goes to 無効化提示, doc-11 §5), this one means the
     * request is issued and waiting for an answer — so the × stays pressable, and pressing it again
     * only asks the same question again.
     *
     * The shell decides both, for the same reason: it is what wires the exits, and a question the
     * form raised for itself would leave Escape asking nobody.
     */
    confirmDiscard?: DiscardAnswers | null;
    onclose: () => void;
    children: Snippet;
  }

  let {
    label,
    closeBlocked = null,
    confirmDiscard = null,
    onclose,
    children,
  }: Props = $props();

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
   * 帯 (the ☰) or a line of the menu. Read later (in an effect) it would already be the modal's own
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
    if (box === null) {
      return [];
    }
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
    if (box === null) {
      return;
    }
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
    if (binding === null) {
      return;
    }
    if (binding.preventsDefault !== null) {
      event.preventDefault();
    }
    // The press is spent on the innermost open layer, so it does not also reach the window handler
    // behind it (`FilterPopover` consumes its Escape the same way).
    event.stopPropagation();
    if (binding.action === "closeOverlay") {
      // The press is spent on the innermost open layer (see above), and while the 破棄前確認 stands
      // that is the question, not the modal: Escape withdraws the request it raised rather than
      // raising it a second time. 編集に戻る is what withdrawing it means, so this is that answer and
      // not a third one — and it is the reason the question is answerable without reaching for Tab.
      if (confirmDiscard !== null) {
        confirmDiscard.onkeep();
      } else {
        onclose();
      }
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
    class:confirming={confirmDiscard !== null}
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
    <!--
      破棄前確認 (doc-8 §6.3), drawn here because this layer covers the 上部帯 ① where every other
      route's confirmation goes (doc-11 §7). The three texts come from `edit.ts`, so this placement
      cannot word the same loss differently from the 帯 — doc-8 §6.3 asks for one wording, and the
      routes it names now have two places to be drawn rather than two questions.
      Above the caller's own content, which is where the 帯 sits relative to the screen it is about.
    -->
    {#if confirmDiscard !== null}
      <div class="confirm">
        <span class="confirm-text">{DISCARD_CONFIRM_QUESTION}</span>
        <button type="button" onclick={confirmDiscard.onproceed}>{DISCARD_CONFIRM_CLOSE}</button>
        <button type="button" onclick={confirmDiscard.onkeep}>{DISCARD_CONFIRM_KEEP}</button>
      </div>
    {/if}
    <!--
      The scrolling region of the layer. It is this box rather than the backdrop that scrolls, so a
      caller's 発行の行 can pin itself to the bottom of what is on screen (doc-11 §11): `sticky` sticks
      inside the nearest scrolling ancestor, and while that was the backdrop there was nothing inside
      the dialog to stick to.
    -->
    <div class="content">
      {@render children()}
    </div>
  </div>
</div>

<style lang="scss">
  .backdrop {
    /*
     * How far the dialog is held off the window's top and bottom edges. Declared rather than written
     * into `padding` alone because the dialog subtracts it from the window when it bounds its own
     * height below, and the two numbers must be one number.
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
    // パネル 6px (doc-11 §2.2). Named because the 破棄前確認 below is drawn against this box's top
    // corners and has to round with them — two literals would round by different amounts.
    --modal-dialog-radius: 6px;
    /*
     * How far the × is held off the box's top and right edges, and how big it is. Their own values
     * rather than a caller's padding: the callers do not agree on one (`Settings` inlines 0.75rem, the
     * other two pad 0.75rem all round), and the × belongs to this box, not to what is drawn inside it.
     * The size is declared here rather than only on `.close` because what is drawn first in the box
     * has to keep its right end clear of it.
     */
    --modal-close-inset: 0.5rem;
    --modal-close-size: 1.5rem;
    /*
     * The 破棄前確認's row. A stated height rather than the row's own, because the content's height
     * differs by engine (WebKit 18 / Chromium 18.8 for the same button) and one line is all this row
     * may ever be (doc-11 §4 折り返さない).
     *
     * It used to be declared twice — this, and how much of the box the row was taking right now — so
     * that a child bounding its own height could subtract it. No child does that any more: the box
     * below bounds itself and lays its rows out as flex items, so the question's row takes its height
     * from the layout and the region under it gets the rest. That is one number where there were two
     * that had to agree, which is what left the 下部操作行 under the window's edge exactly while the
     * user was being asked a question about it (TASK-74 の実測).
     */
    --modal-confirm-row: 2.25rem;

    position: relative;
    display: flex;
    flex-direction: column;
    /*
     * The layer bounds itself, so that what scrolls is `.content` and not the backdrop (doc-11 §11).
     * The window less what this file puts between this box and the window's edge: the backdrop's
     * padding on both sides and this box's own border on both. Both are declared right here, so
     * unlike the child-side `calc` this replaces, there is no second file holding a copy of the
     * formula. `max-height` sizes the content box — app.scss's `border-box` rule reaches フォーム部品
     * only (doc-11 §2.2) and this is the dialog — which is why the border is subtracted here rather
     * than left to `border-box`.
     */
    max-height: calc(
      100vh - var(--modal-backdrop-inset) * 2 - var(--modal-dialog-border) * 2
    );
    width: min(44rem, 100%);
    border: var(--modal-dialog-border) solid var(--line-strong);
    border-radius: var(--modal-dialog-radius);
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
    position: absolute;
    top: var(--modal-close-inset);
    right: var(--modal-close-inset);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--modal-close-size);
    height: var(--modal-close-size);
    padding: 0;
    border: 1px solid transparent;
    // カード・ボタン 4px (doc-11 §2.2).
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-3xl);
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

  /*
   * 破棄前確認 (doc-8 §6.3) inside the layer that covers the 上部帯 (doc-11 §7). Drawn as the 帯 ① is
   * drawn — one row, `--info` down the left in 4px, no wrap — because it is the same announcement and
   * a second look for it would say the two were different questions. It is not a 上部帯 all the same:
   * it is inside this box, and doc-11 §4's six are the screen's own stack.
   *
   * The right end is held clear of the ×, which is out of the flow above whatever the box draws
   * first — now this. Both numbers come from `.dialog`, so moving the × moves the room kept for it.
   *
   * The top corners are rounded with the box's, less its border: a square-cornered full-bleed row
   * would show its colour outside the rounded edge.
   */
  .content {
    flex: 1;
    // Without this a flex item refuses to shrink below its content, and the box would grow past the
    // bound above instead of scrolling here.
    min-height: 0;
    overflow-y: auto;
  }

  .confirm {
    box-sizing: border-box;
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    height: var(--modal-confirm-row);
    padding: 0.4rem 0.75rem;
    padding-right: calc(var(--modal-close-inset) * 2 + var(--modal-close-size));
    border-bottom: 1px solid var(--line);
    border-left: 4px solid var(--info);
    border-radius: calc(var(--modal-dialog-radius) - var(--modal-dialog-border))
      calc(var(--modal-dialog-radius) - var(--modal-dialog-border)) 0 0;
    background: var(--panel);
    font-size: var(--text-md);

    // 折り返さない, as the 帯 does not (doc-11 §4): the answers keep their place at the end of the row
    // whatever the question's length and the window's width.
    .confirm-text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    // 控えの群 (doc-11 §2.2): the two answers to the 破棄前確認 stand side by side with no field
    // between them. 1.4rem rather than the 1.75rem the layers below take: this row is the 帯 the
    // question is drawn in (doc-11 §7), and `--modal-confirm-row` caps its height at one line.
    button {
      flex: none;
      height: 1.4rem;
      padding: 0 0.4rem;
      border: 1px solid var(--line-strong);
      // カード・ボタン 4px (doc-11 §2.2).
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--sel);
        outline-offset: 1px;
      }
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
