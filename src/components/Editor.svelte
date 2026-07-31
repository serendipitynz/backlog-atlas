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
        instance.commands.addCommand({
          name: "atlas-save",
          bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
          exec: () => onsave?.(),
        });
        editor = instance;
        promoted = true;
      })
      .catch((error: unknown) => {
        fallbackReason = error instanceof Error ? error.message : String(error);
      });
    return () => {
      cancelled = true;
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

  function keydown(event: KeyboardEvent): void {
    // Through the 割り当て一覧 (doc-7 §2.1 requires every assignment to be entered in one list, TASK-56):
    // this chord used to be recognised here, which is how it came to be the only place that knew 編集部品
    // had taken ⌘Enter. The IME guard 明示保存 needs (doc-8 §6.2 — the Enter belongs to the conversion,
    // and a WebView can report a composing keydown with `isComposing === false` and `keyCode === 229`)
    // now lives in `matchShortcut` and is applied to every assignment rather than to this one.
    const binding = matchShortcut(event, { scopes: ["editPart"], textEntry: true });
    if (binding?.action !== "saveEditSession") return;
    if (binding.preventsDefault !== null) event.preventDefault();
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
    }
  }

  .fallback {
    margin: 0;
    font-size: 0.68rem;
    opacity: 0.7;
  }
</style>
