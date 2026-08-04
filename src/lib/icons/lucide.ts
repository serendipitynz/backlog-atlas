/**
 * アイコン (doc-11 §2.4, TASK-67): the lucide figures this app draws, written out here.
 *
 * **Copied rather than depended on.** lucide's own packages (`lucide-svelte`) ship every icon and a
 * component layer to pick one; what Atlas needs is about ten figures, and AGENTS.md asks for a reason
 * before a production dependency. So the geometry is written out below and [`Icon.svelte`] draws it —
 * `pnpm ls` shows nothing new, and the icons cost the bundle their own path data and nothing else.
 *
 * Source: **lucide-react** v1.17.0, ISC licence, `dist/esm/icons/<name>.mjs` (`__iconNode`) with the
 * shared attributes from `dist/esm/defaultAttributes.mjs`. The package name matters: lucide ships the
 * same figures through several packages, and only naming the one the coordinates were read from lets a
 * later reader diff them against anything (this header said "lucide" until TASK-112 checked, and
 * `menu.mjs`'s `__iconNode` there is character-for-character [`ICONS.menu`] below). Whether the ISC
 * notice has to be reproduced in a shipped LICENSE file is TASK-97's question, not this module's; the
 * attribution needed to *find* the original is this paragraph.
 *
 * **The figures are copied, never redrawn.** A path written by hand — or a `rect` flattened into a
 * path so that this file could hold one shape kind — would be a figure that resembles lucide rather
 * than one that is lucide's, and nothing downstream could tell which had happened. So [`IconShape`] is
 * a closed union of the SVG elements lucide actually uses, and an icon that needs a new one adds a
 * member; [`drawnShape`] is then non-exhaustive and the build stops until the new kind is drawn.
 * TASK-71 is where that happened for real rather than as a mutation: `panel-right` and
 * `panel-top-dashed` open with a `rect`, and `pnpm run check` named [`drawnShape`] until it was drawn.
 *
 * ## Referent table (doc term → identifier here)
 *
 * The words this module is written in, fixed before the names. アイコン is a lucide *figure* — not the
 * ☰ / ⚙ character glyphs the screen used to carry, which is the distinction doc-11 §2.4 opens with.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-11 §2.4 アイコン | [`IconName`] + [`ICONS`] | one lucide figure, as its drawn elements |
 * | doc-11 §2.4 の寸法・線幅 | [`ICON_VIEWBOX`] + [`ICON_STROKE_WIDTH`] | the frame the copied coordinates are in, and the stroke lucide draws them with |
 *
 * Nothing here reads the DOM or the theme: the colour is `currentColor` and the size is `1em`, both
 * decided by [`Icon.svelte`], so an icon needs no token of its own (decision-12 stays as it is).
 */

/**
 * The icons drawn so far. Closed, so a name cannot be used before its figure is written out. The names
 * are lucide's own, hyphens and all: a renamed copy would have to be looked up twice to be diffed
 * against the source this file names.
 */
export type IconName =
  | "menu"
  | "funnel"
  | "chevron-up"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "panel-right"
  | "panel-top-dashed"
  | "maximize"
  | "clipboard"
  | "clipboard-check"
  | "arrow-up"
  | "arrow-down";

/**
 * One drawn element of an icon, as lucide's `__iconNode` has it. Only the element kinds that the
 * figures below actually use — see the module header for why a missing kind is added rather than
 * worked around.
 *
 * The attribute values are lucide's own strings rather than numbers: SVG reads either the same way,
 * and keeping the spelling means a reader diffing this file against `__iconNode` compares characters
 * instead of deciding whether a retyped coordinate is still the same coordinate.
 *
 * `ry` is optional because lucide writes it on some rects and not others — `clipboard`'s carries
 * `rx: "1", ry: "1"` while `panel-right`'s carries `rx: "2"` alone. Writing `ry` onto the panels to
 * make the field required would be redrawing them, which the module header refuses; dropping it from
 * `clipboard` would be redrawing that one.
 *
 * **An optional attribute is not held by [`drawnShape`]'s exhaustiveness.** That switch is over
 * element *kinds*: a new kind leaves it non-exhaustive and the build stops, but a new attribute on an
 * existing kind compiles fine and would simply never reach the SVG. `lucide.test.ts` is what holds
 * this axis — it asserts every field of every shape below comes back out of [`drawnShape`].
 */
export type IconShape =
  | { shape: "path"; d: string }
  | {
      shape: "rect";
      width: string;
      height: string;
      x: string;
      y: string;
      rx: string;
      ry?: string;
    };

/** The frame the coordinates below are in (`defaultAttributes.mjs`). */
export const ICON_VIEWBOX = "0 0 24 24";

/**
 * The stroke lucide draws its figures with, in the frame above. Left at lucide's 2 rather than made a
 * knob: the figures are designed at this weight, and a thinner stroke on a 24-unit grid is a different
 * drawing rather than the same one smaller.
 */
export const ICON_STROKE_WIDTH = 2;

/** One shape as the SVG element that draws it: the tag, and the attributes that carry its geometry. */
export interface DrawnShape {
  tag: string;
  attrs: Record<string, string | number>;
}

/**
 * The element [`Icon.svelte`] draws for one shape. **This is where the promise in this module's header is
 * kept**, and it is a `switch` rather than a branch in the template because only here does the compiler
 * hold it: `shape.shape` is a union of literals, so a member added to [`IconShape`] leaves the switch
 * non-exhaustive and TypeScript then reports a function that can fall off its end. The template renders
 * whatever comes back, so there is no path where a shape kind is drawn by nothing.
 *
 * A bare `{#if shape.shape === "path"}` in the template cannot do this, and the reason is worth keeping
 * now that [`IconShape`] has grown a second member: a template arm is checked only for the members that
 * exist when it is written, so the arm added for `rect` today would still compile — silently drawing an
 * empty `<svg>`, a green build and a blank button — the day a third kind arrives. Back when
 * [`IconShape`] had one member the template could not even be made to complain (TypeScript narrows by
 * discriminant across a *union*, and a one-member type is not one, so the `{:else}` arm was typed as
 * the shape itself rather than as `never`). The `switch` is what refuses in both situations.
 */
export function drawnShape(shape: IconShape): DrawnShape {
  switch (shape.shape) {
    case "path":
      return { tag: "path", attrs: { d: shape.d } };
    case "rect":
      return {
        tag: "rect",
        attrs: {
          width: shape.width,
          height: shape.height,
          x: shape.x,
          y: shape.y,
          rx: shape.rx,
          // Spread rather than `ry: shape.ry`: an explicit `undefined` is an attribute Svelte then has
          // to decide about, and the rects lucide writes without a `ry` should carry no `ry` at all.
          ...(shape.ry === undefined ? {} : { ry: shape.ry }),
        },
      };
  }
}

/** Each icon's figure, in lucide's own element order. */
export const ICONS: Record<IconName, readonly IconShape[]> = {
  // lucide `menu`.
  menu: [
    { shape: "path", d: "M4 5h16" },
    { shape: "path", d: "M4 12h16" },
    { shape: "path", d: "M4 19h16" },
  ],
  // lucide `funnel`. The 目印 at the head of フィルタ帯 (doc-7 §5.2) — 操作に属さないアイコン, so
  // nothing about the figure changes, only where `Icon.svelte` is placed.
  funnel: [
    {
      shape: "path",
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
    },
  ],
  // The four 折畳み controls (doc-7 §2.2・§2.3). Two axes, two pairs: 行折畳み takes the vertical pair
  // and 列折畳み the horizontal one, and which of a pair a control shows is doc-7's rule, not this
  // module's — nothing here knows what a fold is.
  "chevron-up": [{ shape: "path", d: "m18 15-6-6-6 6" }],
  "chevron-down": [{ shape: "path", d: "m6 9 6 6 6-6" }],
  "chevron-left": [{ shape: "path", d: "m15 18-6-6 6-6" }],
  "chevron-right": [{ shape: "path", d: "m9 18 6-6-6-6" }],
  // The three 詳細配置 切替 (doc-8 §2.2). Which figure stands for which placement is doc-8's mapping,
  // not this module's — `PLACEMENT_ICON` in `placement.ts` holds it, and nothing here knows what a
  // 配置 is. These two are the first figures to need a `rect`, which is why `IconShape` has one.
  "panel-right": [
    { shape: "rect", width: "18", height: "18", x: "3", y: "3", rx: "2" },
    { shape: "path", d: "M15 3v18" },
  ],
  "panel-top-dashed": [
    { shape: "rect", width: "18", height: "18", x: "3", y: "3", rx: "2" },
    { shape: "path", d: "M14 9h1" },
    { shape: "path", d: "M19 9h2" },
    { shape: "path", d: "M3 9h2" },
    { shape: "path", d: "M9 9h1" },
  ],
  maximize: [
    { shape: "path", d: "M8 3H5a2 2 0 0 0-2 2v3" },
    { shape: "path", d: "M21 8V5a2 2 0 0 0-2-2h-3" },
    { shape: "path", d: "M3 16v3a2 2 0 0 0 2 2h3" },
    { shape: "path", d: "M16 21h3a2 2 0 0 0 2-2v-3" },
  ],
  // 横断タスクID のコピー (doc-8 §2.2) の 2 態. The pair is one control's before and after, not two
  // controls: `clipboard-check` is `clipboard` plus a tick, and lucide draws the first two elements
  // identically in both — which is why the swap reads as the same button answering rather than as the
  // button being replaced. Which figure is showing is `TaskDetail.svelte`'s to decide; nothing here
  // knows what a copy is.
  clipboard: [
    { shape: "rect", width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" },
    {
      shape: "path",
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    },
  ],
  "clipboard-check": [
    { shape: "rect", width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" },
    {
      shape: "path",
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    },
    { shape: "path", d: "m9 14 2 2 4-4" },
  ],
  // 前後移動 (doc-8 §2.2) の ↑↓. Arrows rather than the chevron pair above: doc-8 §2.2 writes this
  // operation as ↑↓, and the 折畳み controls already speak chevron on the same screens — a fold and a
  // move to the neighbouring task are different operations and should not share a figure.
  "arrow-up": [
    { shape: "path", d: "m5 12 7-7 7 7" },
    { shape: "path", d: "M12 19V5" },
  ],
  "arrow-down": [
    { shape: "path", d: "M12 5v14" },
    { shape: "path", d: "m19 12-7 7-7-7" },
  ],
};
