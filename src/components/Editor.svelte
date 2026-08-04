<script lang="ts">
  // 編集部品 (doc-8 §6.1): a plain `textarea` is the base form, and Ace is a promotion of it. The
  // textarea is always the element that exists first, so a failed Ace load leaves an editor that
  // still edits — 読込に失敗しても編集不能にしない — rather than an empty box.
  //
  // 複数行入力・マウス選択/置換・全選択 (doc-8 §6.1) are the component's standard behaviour in both
  // forms; nothing here intercepts selection, paste or Cmd/Ctrl+A, which is what makes the two
  // interchangeable from the user's side.
  //
  // Enter is never bound to save (doc-8 §6.2). It confirms an IME conversion while composing, and
  // inserts a newline otherwise; saving is Cmd/Ctrl+Enter, a different key.
  import { onMount } from "svelte";
  import { loadAce, type AceEditor } from "../lib/ace";
  import { matchShortcut } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";

  interface Props {
    value: string;
    /** Names the field for assistive tech — the section heading is not tied to the control. */
    label: string;
    rows?: number;
    onchange: (value: string) => void;
    /**
     * 明示保存 (doc-8 §6.3): the `saveEditSession` chord of the 割り当て一覧 (`shortcuts.ts`), never Enter
     * on its own. What it confirms is whatever the surrounding form's 発行 is — 保存 in an 編集セッション,
     * 作成 in a create form — so the chord is 併記 at that form's own button and not under every field:
     * one 編集セッション mounts several of these (one per Acceptance Criterion), and a hint here would be
     * repeated as many times.
     */
    onsave?: () => void;
  }

  let { value, label, rows = 6, onchange, onsave }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let editor: AceEditor | null = null;
  let promoted = $state(false);
  /** Set only when the promotion failed, so the fallback is stated rather than silent. */
  let fallbackReason = $state<string | null>(null);

  onMount(() => {
    let cancelled = false;
    loadAce()
      .then((ace) => {
        if (cancelled || host === null) return;
        const instance = ace.edit(host);
        instance.setTheme("ace/theme/textmate");
        instance.session.setMode("ace/mode/text");
        // No syntax mode means no worker to start; asking for one would fetch a file the vendored
        // single-file build does not ship.
        instance.session.setUseWorker(false);
        instance.session.setUseWrapMode(true);
        instance.setOptions({ fontSize: "0.74rem", showPrintMargin: false, useSoftTabs: true });
        instance.setValue(value, -1);
        instance.on("change", () => {
          const next = instance.getValue();
          if (next !== value) onchange(next);
        });
        // 昇格後も同じ 1 本の handler を通す (doc-7 §2.1: 割り当て一覧を 1 箇所に持つ). Ace's own
        // `commands.addCommand` was a second assignment table: it never saw the list's composition guard
        // (so a chord could fire on a keydown the fallback textarea refused) and it bound its own
        // per-platform keys, so the promoted and unpromoted forms of the same field did not agree.
        //
        // Listened for on the host in the **capture** phase, which is the only way to run before Ace:
        // at the target element itself, listeners fire in registration order whatever their capture
        // flag, and Ace registered its own during `ace.edit` above. `keydown` stops propagation when it
        // matches, so Ace never sees the press and cannot also insert a newline.
        host?.addEventListener("keydown", keydown, true);
        editor = instance;
        promoted = true;
      })
      .catch((error: unknown) => {
        fallbackReason = error instanceof Error ? error.message : String(error);
      });
    return () => {
      cancelled = true;
      host?.removeEventListener("keydown", keydown, true);
      editor?.destroy();
      editor = null;
    };
  });

  // Push external changes (a conflict rebase, a cancel) into Ace, but never echo the user's own
  // typing back: writing the value Ace already holds would reset the caret mid-edit.
  $effect(() => {
    const current = value;
    if (editor !== null && editor.getValue() !== current) editor.setValue(current, -1);
  });

  /**
   * The one key handler for this field, in **both** its forms — the fallback `textarea` binds it as
   * `onkeydown`, and the promoted Ace instance has it in front of its own handlers (see `onMount`).
   * There is nothing left for the two paths to disagree about, which is what the second assignment table
   * made possible.
   *
   * Every clause comes from the 割り当て一覧 (doc-7 §2.1): the chord, whether it fires with the caret in
   * text, and the default it stops. That includes the IME guard 明示保存 needs (doc-8 §6.2 — the Enter
   * belongs to the conversion, and a WebView can report a composing keydown with `isComposing === false`
   * and `keyCode === 229`), applied to every assignment rather than re-argued here.
   */
  function keydown(event: KeyboardEvent): void {
    const binding = matchShortcut(event, {
      scopes: ["editPart"],
      textEntry: true,
      mac: MAC_KEYBOARD,
    });
    if (binding?.action !== "saveEditSession") return;
    if (binding.preventsDefault !== null) event.preventDefault();
    // The press is spent here: Ace must not also see it (it would insert the newline), and the shell's
    // window handler has nothing to add.
    event.stopPropagation();
    onsave?.();
  }
</script>

<div class="editor">
  <!-- Kept in the DOM either way: it is the base form, and hiding rather than removing it is what
       makes the Ace promotion reversible if the instance ever fails after loading. -->
  <textarea
    aria-label={label}
    hidden={promoted}
    {rows}
    {value}
    oninput={(event) => onchange(event.currentTarget.value)}
    onkeydown={keydown}
  ></textarea>
  <div class="ace-host" class:promoted bind:this={host} aria-label={label} role="presentation"></div>
  {#if fallbackReason !== null}
    <p class="fallback">
      Ace を読み込めなかったため textarea のまま編集します（操作は変わりません）: {fallbackReason}
    </p>
  {/if}
</div>

<style lang="scss">
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  textarea {
    width: 100%;
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--inset);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
    line-height: 1.5;
    resize: vertical;
  }

  // Zero-height until Ace takes it over, so the unpromoted state does not leave a gap under the
  // textarea while the vendored file is still loading.
  .ace-host {
    width: 100%;
    height: 0;
    border-radius: 4px;

    &.promoted {
      height: 10rem;
      border: 1px solid var(--line-strong);
      resize: vertical;
      overflow: auto;
      // Ace の内部レイヤをこの箱の中に閉じ込める。Ace 自身の CSS はこの要素を `position: relative` に
      // するが z-index を与えないので、スタッキングコンテキストが立たず、`.ace_gutter` (z-index 4) と
      // `.ace_scrollbar` (同 6) が外の文脈へ抜けて、`TaskDetail` の固定見出し (z-index 1) の上に描かれて
      // いた — 編集中にスクロールすると、貼り付いた見出しの上をガターが横切る。**見出しの数字を
      // 上げる形では直さない**: Ace が内部で使う値に依存することになり、その値が変わるたびに追いかける。
      // 内部のレイヤはエディタの持ち物なので、外へ出さないのが正しい位置の直し方である。
      isolation: isolate;
    }
  }

  .fallback {
    margin: 0;
    font-size: 0.68rem;
    opacity: 0.7;
  }
</style>
