/**
 * 整形表示 (doc-8 §9, decision-25): one 本文 as rendered Markdown.
 *
 * Pure, and deliberately so — nothing here touches the DOM, the theme or the boundary, so the whole of
 * "what the screen will draw for this text" is decided by a function a `node` test can call. What needs
 * the DOM is elsewhere: the click that opens a 本文リンク and the 作図結果 that replaces a 作図フェンス
 * both belong to `Body.svelte`, which is also the one place `{@html}` appears.
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §9 整形表示 | [`bodyView`] with `kind: "formatted"` | the 本文 as HTML, ready for `{@html}` |
 * | doc-8 §9 そのまま表示 | [`bodyView`] with `kind: "verbatim"` | the caller keeps printing the string as text |
 * | doc-8 §9.3 本文リンク | [`BODY_LINK_CLASS`] + [`bodyLinkTarget`] | an `<a>` in the output, and the URL it may hand over |
 * | doc-8 §9.2 作図フェンス | [`BODY_FIGURE_CLASS`] | the ```mermaid block, still readable as a code fence until a 作図結果 replaces it |
 * | doc-11 §14.4 タスクリスト の印 | [`BODY_TASK_MARK_CLASS`] | the `square-check`/`square` figure standing for a `- [x]` |
 *
 * ## What is not interpreted, and why the list is short
 *
 * `html: false` (raw HTML is escaped into visible text) and no plugins. doc-8 §9.2 has the reasons and
 * decision-25's 却下表 has the measurements: the notations Atlas would need a plugin for — GitHub alert,
 * footnote, shortcode emoji, heading anchor — occur **0 times** in a real 台帳 (184 files, 2026-08-11),
 * and syntax highlighting is a thing the user said is not wanted. This module is therefore markdown-it
 * plus three rules of its own, and each of the three exists because a doc says so.
 */

// The default export is the callable class; the shapes its rules are written against are named exports
// of the same module (markdown-it 15 ships its own types, so no `@types/` package is involved).
import MarkdownIt from "markdown-it";
import type { MarkdownIt as Renderer, StateCore, Token } from "markdown-it";
import { iconMarkup } from "./icons/lucide";

/** Class on an `<a>` the screen may open (doc-8 §9.3). Also how `Body.svelte` finds them. */
export const BODY_LINK_CLASS = "body-link";

/** Class on a 作図フェンス's `<pre>` (doc-8 §9.2, doc-11 §14.5). */
export const BODY_FIGURE_CLASS = "body-figure";

/** Class on one `- [ ]` item. */
export const BODY_TASK_CLASS = "body-task";

/** Class on a `- [ ]` item's 状態の印 (doc-11 §14.4). */
export const BODY_TASK_MARK_CLASS = "body-task-mark";

/** The language a fence has to name to become a 作図フェンス. */
const FIGURE_LANGUAGE = "mermaid";

/**
 * The URL a 本文リンク may hand to 既定ブラウザ起動, or `null` when the link is not one the screen offers
 * (doc-8 §9.3).
 *
 * `null` means **the `<a>` is not drawn at all** — the text stays, without a link's colour or underline
 * (doc-11 §14.3). A link that looks pressable and does nothing is what this avoids; doc-11 §5 asks the
 * same of a control that is offered but withheld, and the cheaper answer here is not to offer it.
 *
 * **This is the screen's classification, not the check.** The boundary runs its own
 * (`editor::browser_url`) because the value reaches an OS call, and doc-8 §9.3 makes that one the門 —
 * this one decides what the screen draws. The two agree on the same rule for the same reason; neither
 * stands in for the other.
 */
export function bodyLinkTarget(href: string): string | null {
  const openable = ["http://", "https://"].some(
    (scheme) => href.length > scheme.length && href.slice(0, scheme.length).toLowerCase() === scheme,
  );
  return openable ? href : null;
}

/**
 * Whether a `- [ ]` / `- [x]` marker starts this item, and which. GFM allows any of a space, tab, `x` or
 * `X` between the brackets, and requires whitespace after them.
 */
const TASK_MARKER = /^\[([ \txX])\][ \t]+/;

/**
 * Drop the `<a>` around a link the screen does not open, and mark the ones it does (doc-8 §9.3).
 *
 * A core rule rather than a pair of renderer rules, because `link_close` carries no href: deciding at
 * render time would mean the closing tag guessing what the opening tag did. Removing both tokens instead
 * leaves the link's *text* — which is the whole intent — and keeps the two decisions in one place.
 *
 * Runs after `linkify`, so a bare URL that markdown-it turned into a link is judged by the same rule as
 * one the author wrote out.
 */
function bodyLinks(state: StateCore): boolean {
  for (const token of state.tokens) {
    if (token.type !== "inline" || token.children === null) {
      continue;
    }
    const kept: Token[] = [];
    // One entry per open link, so the matching close is dropped and no other. Links do not nest in
    // CommonMark, but a stack costs nothing and says that out loud.
    const dropping: boolean[] = [];
    for (const child of token.children) {
      if (child.type === "link_open") {
        // `attrGet` is typed `string | number | null` because markdown-it lets a rule set a numeric
        // attribute; an href parsed from the source is always a string, and `String` says so without
        // a cast that would also accept the wrong shape.
        const target = bodyLinkTarget(String(child.attrGet("href") ?? ""));
        dropping.push(target === null);
        if (target === null) {
          continue;
        }
        // The href is left exactly as the 本文 wrote it: decision-25 hands the boundary that value, and
        // a normalised copy would make what the screen shows and what the OS gets two different strings.
        child.attrJoin("class", BODY_LINK_CLASS);
        kept.push(child);
        continue;
      }
      if (child.type === "link_close") {
        if (dropping.pop() === true) {
          continue;
        }
        kept.push(child);
        continue;
      }
      kept.push(child);
    }
    token.children = kept;
  }
  return true;
}

/**
 * GFM task lists as 状態の印, not as inputs (doc-11 §14.4).
 *
 * Only the item is marked. A list can hold a task item and an ordinary one at once, so a class on the
 * enclosing list would take the marker off both (which it did, until 2026-08-11).
 *
 * Hand-written rather than a plugin: the rule is this one pass, and every plugin for it emits an
 * `<input type="checkbox" disabled>` — a control that refuses, where doc-11 §14.4 asks for the figure
 * ACCEPTANCE CRITERIA already uses for the same "ticked, not pressable" state (doc-8 §3).
 *
 * The figure goes in as an `html_inline` token, which the renderer passes through regardless of
 * `html: false` — that option governs raw HTML **in the source**, not markup the renderer itself makes.
 */
function bodyTaskLists(state: StateCore): boolean {
  const tokens = state.tokens;

  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at];
    if (token.type !== "inline" || at < 2) {
      continue;
    }
    if (tokens[at - 1].type !== "paragraph_open" || tokens[at - 2].type !== "list_item_open") {
      continue;
    }

    // Matched on the first child rather than on `inline.content`, so a marker that inline parsing has
    // already turned into something else (a link, emphasis) is left as the author wrote it.
    const first = token.children?.[0];
    if (first === undefined || first.type !== "text") {
      continue;
    }
    const marker = TASK_MARKER.exec(first.content);
    if (marker === null) {
      continue;
    }

    first.content = first.content.slice(marker[0].length);
    token.content = token.content.slice(marker[0].length);

    const checked = marker[1].toLowerCase() === "x";
    const mark = new state.Token("html_inline", "", 0);
    // `role="img"` is required rather than decoration: with the figure `aria-hidden` the span has no
    // content left, and `aria-label` on a bare span is not announced. Same shape as ACCEPTANCE
    // CRITERIA's 印 (doc-8 §3) — including the two words, so the same state reads the same way.
    mark.content =
      `<span class="${BODY_TASK_MARK_CLASS}" role="img" aria-label="${checked ? "完了" : "未完了"}">` +
      `${iconMarkup(checked ? "square-check" : "square")}</span>`;
    token.children?.unshift(mark);

    // The class goes on the item alone. Marking the enclosing list as well is what put the marker
    // suppression on a `<ul>` that can also hold ordinary items (doc-11 §14.4), so nothing needs it.
    tokens[at - 2].attrJoin("class", BODY_TASK_CLASS);
  }
  return true;
}

/**
 * A ```mermaid fence becomes a marked code fence (doc-8 §9.2, doc-11 §14.5).
 *
 * **It is a readable code fence first.** `Body.svelte` replaces it with a 作図結果 once mermaid has drawn
 * one, so what the reader sees when mermaid fails, or has not loaded yet, is the diagram's source — which
 * is what doc-11 §14.5 asks for, without a failure path of its own.
 */
function figureFence(md: Renderer): void {
  const fence = md.renderer.rules.fence;
  if (fence === undefined) {
    return;
  }
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim().toLowerCase() !== FIGURE_LANGUAGE) {
      return fence(tokens, idx, options, env, self);
    }
    return (
      `<pre class="${BODY_FIGURE_CLASS}"><code>` +
      `${md.utils.escapeHtml(token.content)}</code></pre>\n`
    );
  };
}

/**
 * An image is not drawn; its alt text is (doc-8 §9.2).
 *
 * An image with no alt text therefore contributes nothing — there is no text to show, and the alternative
 * (printing the URL) would put a path or a data URI into the prose in place of a picture.
 */
function altTextOnly(md: Renderer): void {
  md.renderer.rules.image = (tokens, idx) => md.utils.escapeHtml(tokens[idx].content);
}

function build(): Renderer {
  // `html: false` is the injection boundary (doc-8 §9.2): raw HTML in a 本文 is escaped into visible
  // text, so a `<script>` or an `onerror` a管理ファイル happens to contain is read, not run. markdown-it's
  // own `validateLink` additionally refuses `javascript:`, `vbscript:`, `file:` and non-image `data:` as
  // link targets — `bodyLinks` then keeps everything but `http`/`https` from being a link at all.
  const md = new MarkdownIt({ html: false, linkify: true });
  // After `linkify`, so a bare URL is judged by the same rule as a written-out link.
  md.core.ruler.push("body-links", bodyLinks);
  md.core.ruler.after("inline", "body-task-lists", bodyTaskLists);
  figureFence(md);
  altTextOnly(md);
  return md;
}

/** Built once: the configuration never varies, and parsing is the cost this avoids repeating. */
let renderer: Renderer | null = null;

/** What the screen should draw for one 本文 (doc-8 §9). */
export type BodyView =
  | { kind: "formatted"; html: string }
  | {
      /**
       * 整形 did not happen, so the caller prints the string as text (doc-8 §9.2 「整形が失敗したら
       * そのまま表示 へ落とす」). Carries nothing: the caller already has the source.
       */
      kind: "verbatim";
    };

/**
 * Render one 本文 (doc-8 §9).
 *
 * **Falls back rather than throwing.** doc-8 §9.2 requires the screen not to lose a 本文 to a failure in
 * rendering it, and a caller that had to try/catch around this would be the same rule written once per
 * call site. The failure is not counted as 不整合 — that word is about the file (doc-4 §5, decision-24),
 * and this would be about Atlas.
 */
export function bodyView(source: string): BodyView {
  try {
    renderer ??= build();
    return { kind: "formatted", html: renderer.render(source) };
  } catch {
    return { kind: "verbatim" };
  }
}
