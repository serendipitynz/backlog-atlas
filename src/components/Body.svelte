<script lang="ts">
  // 整形表示 (doc-8 §9, decision-25): one 本文, as rendered Markdown.
  //
  // **The only `{@html}` in Atlas.** doc-8 §9 asks for the injection surface to be one place, and this is
  // it: `markdown.ts` decides what the string becomes (with `html: false`, so raw HTML in a 管理ファイル
  // is escaped into visible text), and every 本文 on every screen goes through this component to be drawn.
  // A second `{@html}` elsewhere would be a second surface with its own answer to that question.
  //
  // **Nothing here calls the boundary.** A press on a 本文リンク is reported upwards and App.svelte issues
  // 既定ブラウザ起動 — the same division every other command in this app follows (`commands.ts` is
  // imported by `App.svelte` alone), and the reason it matters here is that the failure belongs to
  // ⑤ 通知 (doc-11 §4), which is the shell's.
  import { onDestroy } from "svelte";
  import { BODY_LINK_CLASS, bodyLinkTarget, bodyView } from "../lib/markdown";
  import { currentScheme, drawFigures, onSchemeChange } from "../lib/markdown-figure";
  import type { ThemeScheme } from "../lib/theme";

  interface Props {
    /** The 本文 as the read layer produced it — frontmatter is already off it (doc-4 §4). */
    source: string;
    /**
     * A 本文リンク was pressed, with the URL it carries (doc-8 §9.3). Already classified: the shell is
     * given something it may hand to 既定ブラウザ起動, and the boundary checks it again.
     */
    onopenlink: (url: string) => void;
  }

  let { source, onopenlink }: Props = $props();

  let view = $derived(bodyView(source));
  let block = $state<HTMLElement | null>(null);
  let scheme = $state<ThemeScheme>(currentScheme());

  const unsubscribe = onSchemeChange((next) => (scheme = next));
  onDestroy(unsubscribe);

  // 作図結果 (doc-11 §14.5). Re-runs when the 本文 changes (a new `view` puts the fence back) and when the
  // 明暗 changes (a drawn diagram carries its own colours, so it is the one thing a CSS variable cannot
  // re-paint). `drawFigures` returns before importing mermaid when there is no fence, which is every 本文
  // in a 台帳 that uses none.
  $effect(() => {
    const root = block;
    const html = view.kind === "formatted" ? view.html : null;
    if (root === null || html === null) {
      return;
    }
    void drawFigures(root, scheme);
  });

  /**
   * A press inside the 本文, delegated (doc-8 §9.3).
   *
   * Bound imperatively rather than in the markup: the listener belongs to the block as a *delegation
   * point*, not to an interactive element, and writing `onclick` on a `<div>` would be claiming the div
   * is one. What is interactive is each `<a>` inside — natively focusable, and Enter on a focused link
   * arrives here as a `click`.
   *
   * `auxclick` as well as `click`, because a middle press is a separate event: caught, it opens the link
   * like any other press; uncaught, it is one of the ways a webview navigates away from Atlas — which is
   * the thing doc-8 §9.3 exists to prevent.
   */
  function press(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest(`a.${BODY_LINK_CLASS}`);
    if (anchor === null) {
      return;
    }
    // Before the classification, not after: a link that reaches here must not navigate this webview even
    // if the href turns out to be one the screen would not have drawn.
    event.preventDefault();
    const url = bodyLinkTarget(anchor.getAttribute("href") ?? "");
    if (url === null) {
      return;
    }
    onopenlink(url);
  }

  $effect(() => {
    const root = block;
    if (root === null) {
      return;
    }
    root.addEventListener("click", press);
    root.addEventListener("auxclick", press);
    return () => {
      root.removeEventListener("click", press);
      root.removeEventListener("auxclick", press);
    };
  });
</script>

{#if view.kind === "formatted"}
  <div class="body-block" bind:this={block}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- doc-8 §9: this is the one place, and
         `markdown.ts` is where the escaping decision lives (`html: false`). -->
    {@html view.html}
  </div>
{:else}
  <!-- そのまま表示 (doc-8 §9.2): 整形 threw, so the 本文 is printed as text — the same treatment every
       本文 had before TASK-142, kept as the failure state rather than as a screen with nothing on it. -->
  <pre class="body-block verbatim">{source}</pre>
{/if}

<style lang="scss">
  // doc-11 §14: 整形表示 の中の見え方. Every value is taken from §2.2's table — this block introduces no
  // new step.
  //
  // The rules reach inside `{@html}` output, which the compiler cannot scope, so each one is `:global`
  // *under* the scoped block class: the compiled selector still carries this component's hash on
  // `.body-block`, so nothing outside this component's element is matched.
  //
  // **The class names are written out here** because a stylesheet cannot read a TypeScript constant.
  // `markdown.test.ts` asserts that every class `markdown.ts` emits appears in this file, so renaming
  // one there without coming here fails a test rather than silently leaving part of a 本文 unstyled.
  .body-block {
    margin: 0;
    // The frame the 本文 had before it was rendered: くぼみ面 with a 罫線 (doc-12 §3 の原文, doc-11 §2.1).
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);
    font-family: inherit;
    font-size: 0.74rem;
    line-height: 1.5;
    // doc-8 §2.1 の行長上限 48rem。The value is the caller's `--prose-max-width` so this component holds
    // no second 48 (doc-10 §5 takes the same line).
    max-width: var(--prose-max-width, none);
    word-break: break-word;

    // そのまま表示: newlines are the file's and long lines wrap rather than scrolling the panel.
    &.verbatim {
      white-space: pre-wrap;
    }

    // The block's own padding is the margin at both ends; the first and last child add none.
    :global(> :first-child) {
      margin-top: 0;
    }

    :global(> :last-child) {
      margin-bottom: 0;
    }

    // 見出し (doc-11 §14.1): two sizes, and the段 is the weight and the space above it.
    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      margin: 0.6rem 0 0.16rem;
      font-weight: 650;
      line-height: 1.35;
    }

    :global(h1),
    :global(h2) {
      font-size: 0.78rem;
    }

    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      font-size: 0.74rem;
    }

    :global(p) {
      margin: 0.3rem 0;
    }

    :global(ul),
    :global(ol) {
      margin: 0.3rem 0;
      padding-left: 1rem;
    }

    :global(li) {
      margin: 0.16rem 0;
    }

    // 本文リンク (doc-11 §14.3): only the ones the screen opens are drawn as links at all, so the colour
    // and the underline are not a state — they are the whole of what a link looks like here.
    :global(a.body-link) {
      color: var(--info);
      text-decoration: underline;
      cursor: pointer;
    }

    // コード (doc-11 §14.2). The ground stays the block's; the 罫線 is what separates it.
    :global(code) {
      padding: 0 0.16rem;
      border: 1px solid var(--line);
      border-radius: 3px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.95em;
    }

    :global(pre) {
      margin: 0.3rem 0;
      padding: 0.25rem 0.3rem;
      border: 1px solid var(--line);
      border-radius: 3px;
      // 折り返さず、そのブロックの中で横スクロールする (doc-11 §14.2): a fence's lines carry meaning.
      overflow-x: auto;
    }

    // The `<code>` inside a fence would otherwise draw a second frame inside the first.
    :global(pre code) {
      padding: 0;
      border: 0;
      border-radius: 0;
      font-size: 1em;
    }

    // GFM 表 (doc-11 §14.2): `display: block` is what lets the table scroll inside itself instead of
    // widening the 本文ブロック past doc-8 §2.1's limit.
    :global(table) {
      display: block;
      overflow-x: auto;
      margin: 0.3rem 0;
      border-collapse: collapse;
    }

    :global(th),
    :global(td) {
      padding: 0.16rem 0.3rem;
      border: 1px solid var(--line);
      text-align: left;
    }

    :global(th) {
      font-weight: 650;
    }

    :global(blockquote) {
      margin: 0.3rem 0;
      padding-left: 0.45rem;
      border-left: 2px solid var(--line);
      color: var(--muted);
    }

    :global(hr) {
      margin: 0.6rem 0;
      border: 0;
      border-top: 1px solid var(--line);
    }

    // タスクリスト (doc-11 §14.4): the 印 replaces the marker **on the item that has one**.
    //
    // On the item and not on the list, because a list can hold both kinds: `- [x] done` beside
    // `- ordinary`. Suppressing the marker on the `<ul>` took the bullet off the ordinary sibling too,
    // and the indent with it — a list that GFM renders with one bullet and one checkbox came out with
    // neither. The item also stays a block: `display: flex` on it put a nested list *beside* the item's
    // own text instead of under it.
    :global(.body-task) {
      list-style: none;
    }

    // Inline-flex, so the 印 sits in the text's flow: the figure inside is `display: block` (doc-11
    // §2.4's form, as `Icon.svelte` draws it), and a block child in a bare inline span would break the
    // line. 1em is §2.4's size — the figure follows the text beside it.
    :global(.body-task-mark) {
      display: inline-flex;
      margin-right: 0.25rem;
      vertical-align: -0.15em;
    }

    :global(.body-task-mark svg) {
      width: 1em;
      height: 1em;
      display: block;
    }

    // 作図結果 (doc-11 §14.5): bounded by the block, scrolling inside itself when it cannot be.
    :global(.body-figure-drawn) {
      margin: 0.3rem 0;
      overflow-x: auto;
    }

    :global(.body-figure-drawn svg) {
      max-width: 100%;
      height: auto;
    }
  }
</style>
