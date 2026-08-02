/**
 * アイコン (doc-11 §2.4, TASK-67): the lucide figures this app draws, written out here.
 *
 * **Copied rather than depended on.** lucide's own packages (`lucide-svelte`) ship every icon and a
 * component layer to pick one; what Atlas needs is about ten figures, and AGENTS.md asks for a reason
 * before a production dependency. So the geometry is written out below and [`Icon.svelte`] draws it —
 * `pnpm ls` shows nothing new, and the icons cost the bundle their own path data and nothing else.
 *
 * Source: lucide v1.17.0, ISC licence, `dist/esm/icons/<name>.mjs` (`__iconNode`) with the shared
 * attributes from `dist/esm/defaultAttributes.mjs`. Whether the ISC notice has to be reproduced in a
 * shipped LICENSE file is TASK-97's question, not this module's; the attribution needed to *find* the
 * original is this paragraph.
 *
 * **The figures are copied, never redrawn.** A path written by hand — or a `rect` flattened into a
 * path so that this file could hold one shape kind — would be a figure that resembles lucide rather
 * than one that is lucide's, and nothing downstream could tell which had happened. So [`IconShape`] is
 * a closed union of the SVG elements lucide actually uses, and an icon that needs a new one adds a
 * member; [`drawnShape`] is then non-exhaustive and the build stops until the new kind is drawn.
 * (Verified by adding a `rect` member: `pnpm run check` reports [`drawnShape`] by name.)
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

/** The icons drawn so far. Closed, so a name cannot be used before its figure is written out. */
export type IconName = "menu";

/**
 * One drawn element of an icon, as lucide's `__iconNode` has it. Only the element kinds that the
 * figures below actually use — see the module header for why a missing kind is added rather than
 * worked around.
 */
export type IconShape = { shape: "path"; d: string };

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
 * A bare `{#if shape.shape === "path"}` in the template cannot do this. TypeScript narrows by
 * discriminant only across a *union*, and a one-member [`IconShape`] is not one — so the `{:else}` arm
 * is typed as the shape itself rather than as `never`, an exhaustiveness call there does not compile
 * today, and leaving the arm out compiles happily while drawing an empty `<svg>`: a green build and a
 * blank button, which is exactly the failure this guards.
 */
export function drawnShape(shape: IconShape): DrawnShape {
  switch (shape.shape) {
    case "path":
      return { tag: "path", attrs: { d: shape.d } };
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
};
