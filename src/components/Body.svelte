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
  import {
    BODY_LINK_CLASS,
    BODY_LINK_URL_ATTRIBUTE,
    bodyLinkTarget,
    bodyView,
  } from "../lib/markdown";
  import { currentScheme, drawFigures, onSchemeChange } from "../lib/markdown-figure";
  import { drawImages, releaseImages, type ImageReader } from "../lib/markdown-image";
  import type { ThemeScheme } from "../lib/theme";

  interface Props {
    /** The 本文 as the read layer produced it — frontmatter is already off it (doc-4 §4). */
    source: string;
    /**
     * A 本文リンク was pressed, with the URL it carries (doc-8 §9.3). Already classified: the shell is
     * given something it may hand to 既定ブラウザ起動, and the boundary checks it again.
     */
    onopenlink: (url: string) => void;
    /**
     * The bytes of one 添付画像 (doc-8 §9.2), for the project this 本文 came from.
     *
     * A prop for the same reason `onopenlink` is one: this component reaches no boundary, and the
     * project is not something it is told. **Absent means no 本文画像 is drawn** — every one stays at
     * its 状態の印, which is a state the screen already has to draw, so a caller with no project in
     * hand needs nothing extra.
     */
    readimage?: ImageReader;
  }

  let { source, onopenlink, readimage }: Props = $props();

  let view = $derived(bodyView(source));
  let block = $state<HTMLElement | null>(null);
  let scheme = $state<ThemeScheme>(currentScheme());

  /** `MouseEvent.button` for the middle button — the only non-primary one that activates a 本文リンク. */
  const MIDDLE_BUTTON = 1;

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

  // 添付画像 (doc-8 §9.2, doc-11 §14.7). Re-runs when the 本文 changes, which is what puts the 状態の印
  // back for `drawImages` to find; the 明暗 is not a dependency, because a picture carries no colours of
  // Atlas's. The blobs a previous pass opened are revoked here rather than left to the window: this
  // component redraws on every keystroke of an edit beside it.
  $effect(() => {
    const root = block;
    const html = view.kind === "formatted" ? view.html : null;
    const read = readimage;
    if (root === null || html === null || read === undefined) {
      return;
    }
    void drawImages(root, read);
    return () => releaseImages(root);
  });

  /**
   * The 本文リンク a press or key landed on, or `null` (doc-8 §9.3).
   *
   * Read from `data-body-link` rather than from an `href`, which these elements deliberately do not
   * carry: an `href` is what makes the engine treat one as a link, and then every way the engine has of
   * following a link takes the window with it. 目視 2026-08-11 found the context menu's「リンクを開く」
   * doing that, with no back control to return by.
   */
  function pressedLink(target: EventTarget | null): string | null {
    const element = landedOnLink(target);
    if (element === null) {
      return null;
    }
    // Classified again here rather than trusted: the attribute is written by `markdown.ts`, and this is
    // the second of the two checks doc-8 §9.3 asks for (the boundary's is the gate).
    return bodyLinkTarget(element.getAttribute(BODY_LINK_URL_ATTRIBUTE) ?? "");
  }

  /**
   * The 本文リンク an event landed on, whatever its URL turns out to be.
   *
   * Separate from [`pressedLink`] because the two questions have different answers and both are needed:
   * *this* one decides whether the event belongs to a link at all — and so whether the engine's default
   * is prevented — while the other decides whether there is a URL to hand over.
   */
  function landedOnLink(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest(`.${BODY_LINK_CLASS}`);
  }

  /**
   * A press inside the 本文, delegated (doc-8 §9.3).
   *
   * Bound imperatively rather than in the markup: the listener belongs to the block as a *delegation
   * point*, not to an interactive element, and writing `onclick` on a `<div>` would be claiming the div
   * is one.
   *
   * `auxclick` as well as `click`, because a middle press is a separate event — **but only the middle
   * button.** `auxclick` fires for every non-primary button, the secondary one included, and that is the
   * press a reader makes to open the context menu: activating on it would launch the browser out from
   * under a right-click, which is the very interaction 目視 was performing when it found the navigation
   * defect. The primary button arrives as `click` and is not filtered here.
   *
   * **The default is prevented for anything that lands on a 本文リンク, before the URL is looked at.**
   * There is nothing to navigate to today — that is the point of carrying no `href` — so this guards the
   * *next* change rather than this one: an element that reached here as a link must not act like one even
   * if its URL turns out to be a value the screen would not have drawn.
   */
  function press(event: MouseEvent): void {
    if (event.type === "auxclick" && event.button !== MIDDLE_BUTTON) {
      return;
    }
    if (!landedOnLink(event.target)) {
      return;
    }
    event.preventDefault();
    const url = pressedLink(event.target);
    if (url === null) {
      return;
    }
    onopenlink(url);
  }

  /**
   * Enter on a focused 本文リンク (doc-8 §9.3).
   *
   * Needed because these elements are not anchors as far as the engine is concerned: `role="link"` and
   * `tabindex` give a screen reader the name and the tab stop back, but neither turns Enter into a
   * click. Space is deliberately not handled — it activates a button, and this is a link.
   */
  function key(event: KeyboardEvent): void {
    if (event.key !== "Enter" || landedOnLink(event.target) === null) {
      return;
    }
    event.preventDefault();
    const url = pressedLink(event.target);
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
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("click", press);
      root.removeEventListener("auxclick", press);
      root.removeEventListener("keydown", key);
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
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);
    font-family: inherit;
    font-size: var(--text-lg);
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

    // 見出し (doc-11 §14.1): two sizes, and the 段 is the weight, the space above it, and — since
    // TASK-164 — the size as well.
    //
    // Both steps have moved up twice. They started at 1.054× the 本文 with h3 and below taking the
    // 本文's own step, so the only 段 a reader could see was the space above; the owner accepted that on
    // 2026-08-11, asked for it widened on 2026-08-14, and in the same day's 並置目視 asked for the whole
    // 整形表示 to be larger again.
    //
    // **The upper bound is §14.1's, and it is the heading of the panel this body sits inside** —
    // `--text-3xl`, which タスク title and プロジェクト名 both take. It is not 区画見出し: that bound stood
    // in §14.1 for a long time and the implementation never met it. Before TASK-164 these headings were
    // `.78rem` against a 区画見出し's `.68rem`, already above it at the 16px ground, and they are 16.19px
    // against 11.97px now. So §14.1 says what actually separates a 区画見出し — its rule line, its
    // letter-spacing and `--muted` — rather than a size bound nothing has held to.
    //
    // **プロジェクト詳細's pane heading is a different case and §14.1 spells it out**: before TASK-164 it
    // and these headings were both `.78rem`, so "never met" is true of 区画見出し and not of that one.
    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      margin: 0.75rem 0 0.25rem;
      font-weight: 650;
      line-height: 1.35;
    }

    :global(h1),
    :global(h2) {
      font-size: var(--text-2xl);
    }

    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      font-size: var(--text-xl);
    }

    :global(p) {
      margin: 0.6rem 0;
    }

    :global(ul),
    :global(ol) {
      margin: 0.45rem 0;
      padding-left: 1rem;
    }

    :global(li) {
      margin: 0.25rem 0;
    }

    // 本文リンク (doc-11 §14.3): only the ones the screen opens are drawn as links at all, so the colour
    // and the underline are not a state — they are the whole of what a link looks like here.
    //
    // Selected by class rather than by `a[href]`: these carry no `href` (doc-8 §9.3), which is also why
    // the focus ring has to be asked for — the engine does not treat them as links, so it gives them
    // none of a link's behaviour, only what is written here.
    :global(.body-link) {
      color: var(--info);
      text-decoration: underline;
      cursor: pointer;
    }

    :global(.body-link:focus-visible) {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }

    // コード (doc-11 §14.2). The ground stays the block's; the 罫線 is what separates it.
    :global(code) {
      padding: 0 0.25rem;
      border: 1px solid var(--line);
      border-radius: 3px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.95em;
    }

    :global(pre) {
      margin: 0.45rem 0;
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--line);
      border-radius: 3px;
      // No wrapping; it scrolls inside its own block instead (doc-11 §14.2): a fence's lines carry
      // meaning, so a break inserted for width would be a break the author did not write.
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
      margin: 0.45rem 0;
      border-collapse: collapse;
    }

    :global(th),
    :global(td) {
      padding: 0.25rem 0.45rem;
      border: 1px solid var(--line);
      text-align: left;
    }

    :global(th) {
      font-weight: 650;
    }

    :global(blockquote) {
      margin: 0.45rem 0;
      padding-left: 0.6rem;
      border-left: 2px solid var(--line);
      color: var(--muted);
    }

    :global(hr) {
      margin: 0.75rem 0;
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
      margin: 0.45rem 0;
      overflow-x: auto;
    }

    :global(.body-figure-drawn svg) {
      max-width: 100%;
      height: auto;
    }

    // 本文画像 that has not been drawn (doc-11 §14.7): the 状態の印 and whatever alt the 本文 wrote.
    // Inline-flex for the same reason as the タスクリスト の印 — the figure inside is a block.
    //
    // **This is a value, not a控え**, so doc-11 §5's 無効化提示 does not apply: nothing is being
    // withheld, and there was never a button here.
    :global(.body-image) {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      vertical-align: -0.15em;
      color: var(--muted);
    }

    // The remote half is also a 本文リンク, so §14.3's colour and underline win over the muted ground
    // above — it is pressable, and that is what a pressable thing looks like here.
    :global(.body-image.body-link) {
      color: var(--info);
    }

    :global(.body-image svg) {
      width: 1em;
      height: 1em;
      display: block;
    }

    // 添付画像 (doc-11 §14.7): bounded by the 本文ブロック like the 作図結果, and never taller than a
    // screenful — a full-window screenshot in a 本文 would otherwise push everything below it off the
    // panel.
    :global(.body-image-drawn) {
      display: block;
      max-width: 100%;
      max-height: 60vh;
      height: auto;
      margin: 0.45rem 0;
      border: 1px solid var(--line);
      border-radius: 3px;
    }
  }
</style>
