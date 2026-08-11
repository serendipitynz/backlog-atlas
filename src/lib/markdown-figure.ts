/**
 * 作図結果 (doc-8 §9.2, doc-11 §14.5): drawing the 作図フェンス that `markdown.ts` left in the output.
 *
 * Separate from `markdown.ts` because everything here is the opposite of that module: it touches the
 * DOM, it is asynchronous, and it loads code. **mermaid is imported only when a 作図フェンス is actually
 * on screen** (decision-25 の 遅延読込) — the measured cost of that package is about 2.9MB of chunks, and
 * a 台帳 with no diagram in it must not pay any of it. The `import` below is the whole of that promise:
 * nothing in this module's static imports reaches mermaid.
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §9.2 作図フェンス | `pre.${BODY_FIGURE_CLASS}` | the fence as `markdown.ts` rendered it — a readable code block |
 * | doc-11 §14.5 作図結果 | [`FIGURE_DRAWN_CLASS`] | the drawn SVG, in place of that block |
 * | decision-25 遅延読込 | [`loadMermaid`] | the one dynamic import, made only when a fence is present |
 *
 * ## What happens when it cannot be drawn
 *
 * Nothing is removed. doc-11 §14.5 requires the fence to stay readable, and the fence *is* the failure
 * state — a diagram that cannot be drawn leaves the reader looking at its source rather than at a gap.
 * That covers three different failures with one shape: mermaid's chunk not loading, mermaid rejecting
 * the diagram's syntax, and this module never running at all.
 */

import { BODY_FIGURE_CLASS } from "./markdown";
import { themeScheme, type ThemeScheme } from "./theme";

/** Class on a drawn 作図結果 (doc-11 §14.5). */
export const FIGURE_DRAWN_CLASS = "body-figure-drawn";

/** Where a drawn 作図結果 keeps its source, so a theme change can draw it again. */
const SOURCE_ATTRIBUTE = "data-figure-source";

/** Which 明暗 a drawn 作図結果 was drawn for, so a re-draw can be skipped when it still matches. */
const SCHEME_ATTRIBUTE = "data-figure-scheme";

type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;

/**
 * mermaid, loaded at most once per session.
 *
 * The rejection is remembered with the promise, so a failed load is not retried on every keystroke that
 * re-renders the panel — and a failure here is not an error the user is told about: what they see is the
 * fence, which is the state doc-11 §14.5 asks for.
 */
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((module) => module.default);
  return mermaidPromise;
}

function initialise(mermaid: Mermaid, scheme: ThemeScheme): void {
  mermaid.initialize({
    // Atlas draws diagrams itself, at the moment a 本文 is shown; nothing here waits for a page load.
    startOnLoad: false,
    // mermaid's own default, kept deliberately rather than by omission: 'strict' sanitises the SVG and
    // ignores `click` directives and embedded HTML inside a diagram. Atlas offers no interaction inside
    // a 作図結果, so nothing is lost — and the source of these diagrams is a管理ファイル a person edited
    // by hand, which is exactly the input that should not be able to script the panel it is drawn in.
    // 'sandbox' would put each diagram in an iframe and take the theme re-draw below with it.
    securityLevel: "strict",
    // 明暗 only (doc-11 §14.5): decision-12's ten sets are colour *values*, and mapping each of them into
    // a diagram's palette would put colour values somewhere other than `app.scss`.
    theme: scheme === "dark" ? "dark" : "default",
    // The 作図結果 is bounded by the 本文ブロック (doc-11 §14.5); the width it may take is the block's.
    flowchart: { useMaxWidth: true },
  });
}

/** Ids have to be unique per render, and mermaid uses them inside the SVG it returns. */
let drawSeq = 0;

/**
 * Which draw is current for one root. Per root rather than one counter for the module, because a panel
 * draws several 本文 at once (doc-8 §3 has three 区画 with one) — a shared counter would let a later
 * 本文's draw cancel an earlier one's.
 */
const generations = new WeakMap<ParentNode, number>();

/** Every 作図フェンス not yet drawn, plus every 作図結果 drawn for a different 明暗. */
function pending(root: ParentNode, scheme: ThemeScheme): HTMLElement[] {
  const fences = [...root.querySelectorAll<HTMLElement>(`pre.${BODY_FIGURE_CLASS}`)];
  const stale = [...root.querySelectorAll<HTMLElement>(`.${FIGURE_DRAWN_CLASS}[${SOURCE_ATTRIBUTE}]`)]
    .filter((drawn) => drawn.getAttribute(SCHEME_ATTRIBUTE) !== scheme);
  return [...fences, ...stale];
}

/** The diagram's source: the fence's text on the first pass, the recorded copy on a re-draw. */
function sourceOf(element: HTMLElement): string {
  return (element.getAttribute(SOURCE_ATTRIBUTE) ?? element.textContent ?? "").trim();
}

/**
 * Draw every 作図フェンス under `root`, and re-draw any 作図結果 whose 明暗 no longer matches.
 *
 * Safe to call on every update: it returns before importing anything when there is no fence to draw,
 * which is the case for every 本文 in a 台帳 that uses no diagrams (measured: 0 of 184 files).
 */
export async function drawFigures(root: ParentNode, scheme: ThemeScheme): Promise<void> {
  if (pending(root, scheme).length === 0) return;

  const generation = (generations.get(root) ?? 0) + 1;
  generations.set(root, generation);

  let mermaid: Mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    // The fence stays on screen (doc-11 §14.5). Nothing else can be said here: the module that would
    // have drawn the diagram is what failed to arrive.
    return;
  }
  if (generations.get(root) !== generation) return;
  initialise(mermaid, scheme);

  // Re-read rather than reusing the list from the guard above: the `await` gave the panel a chance to
  // replace the whole 本文, and an element from before it may no longer be in the document.
  for (const element of pending(root, scheme)) {
    if (generations.get(root) !== generation) return;
    if (!element.isConnected) continue;
    const source = sourceOf(element);
    if (source === "") continue;

    let svg: string;
    try {
      drawSeq += 1;
      ({ svg } = await mermaid.render(`body-figure-${drawSeq}`, source));
    } catch {
      // A diagram mermaid will not parse leaves its source on screen — which is both the failure state
      // doc-11 §14.5 asks for and the only thing that tells the author *what* did not draw.
      continue;
    }
    if (generations.get(root) !== generation || !element.isConnected) continue;

    const drawn = element.ownerDocument.createElement("div");
    drawn.className = FIGURE_DRAWN_CLASS;
    drawn.setAttribute(SOURCE_ATTRIBUTE, source);
    drawn.setAttribute(SCHEME_ATTRIBUTE, scheme);
    // The SVG is mermaid's own output, sanitised by it under `securityLevel: 'strict'` above.
    drawn.innerHTML = svg;
    element.replaceWith(drawn);
  }
}

/** The media query `app.scss` follows while nothing is chosen (decision-12 既定は OS の明暗に追従). */
const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  // jsdom answers this, but a harness that stubs `window` may not; a missing query means "not dark",
  // which is the same ground `app.scss` paints without the media query.
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/**
 * The 明暗 in effect right now, read from the document the way `app.scss` decides it: the chosen theme's
 * ground, or the OS's preference when nothing is chosen (`themeScheme` holds that rule).
 */
export function currentScheme(): ThemeScheme {
  return themeScheme(document.documentElement.dataset.theme ?? null, prefersDark());
}

/**
 * Call `handler` whenever the 明暗 changes, and return the unsubscribe.
 *
 * Two sources, because there are two ways it can change: the 設定画面 writing `data-theme` on `<html>`
 * (App.svelte), and the OS switching light↔dark while 未選択 (decision-12). One subscription covers both
 * so a caller cannot listen to one and miss the other.
 *
 * Per subscriber rather than one observer shared by the module: at most a handful of 本文 are on screen
 * at once (doc-8 §3), and a shared registry would have to be reference-counted for no measurable gain.
 */
export function onSchemeChange(handler: (scheme: ThemeScheme) => void): () => void {
  const report = () => handler(currentScheme());
  const observer = new MutationObserver(report);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  media?.addEventListener("change", report);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", report);
  };
}
