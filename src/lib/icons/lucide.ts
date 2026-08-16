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
 * TASK-123 is the second, for `circle-question-mark`'s outer ring.
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
 * | doc-11 §2.4 の `<svg>` の約束 | [`ICON_SVG_ATTRS`] | the frame, stroke and joins both drawers put on the element |
 * | doc-11 §14.4 タスクリスト の印 | [`iconMarkup`] | the same figure as markup, for the 整形表示 pipeline that builds an HTML string |
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
  | "arrow-down"
  | "arrow-right"
  | "arrow-left"
  | "x"
  | "triangle-alert"
  | "plus"
  | "circle-question-mark"
  | "check"
  | "square-check"
  | "square"
  | "undo"
  | "refresh-ccw"
  | "image"
  | "image-off";

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
    }
  | { shape: "circle"; cx: string; cy: string; r: string }
  | { shape: "line"; x1: string; x2: string; y1: string; y2: string };

/** The frame the coordinates below are in (`defaultAttributes.mjs`). */
export const ICON_VIEWBOX = "0 0 24 24";

/**
 * The stroke lucide draws its figures with, in the frame above. Left at lucide's 2 rather than made a
 * knob: the figures are designed at this weight, and a thinner stroke on a 24-unit grid is a different
 * drawing rather than the same one smaller.
 */
export const ICON_STROKE_WIDTH = 2;

/**
 * The attributes every icon's `<svg>` carries — the frame, the stroke and the joins that make the
 * copied coordinates draw as lucide draws them.
 *
 * Here rather than written into [`Icon.svelte`], because that component is no longer the only thing
 * that draws one: [`iconMarkup`] serialises the same figure for the 整形表示 pipeline (doc-11 §14.4),
 * and two spellings of this agreement is exactly what the component's own header warns about — the
 * second one could disagree. `aria-hidden` is *not* here: it belongs to how a caller uses the figure
 * (doc-11 §2.4 puts the name on the control), and the two callers wrap it differently.
 */
export const ICON_SVG_ATTRS: Record<string, string> = {
  viewBox: ICON_VIEWBOX,
  fill: "none",
  stroke: "currentColor",
  "stroke-width": String(ICON_STROKE_WIDTH),
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

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
    case "circle":
      return { tag: "circle", attrs: { cx: shape.cx, cy: shape.cy, r: shape.r } };
    case "line":
      // Attribute order is lucide's own (`x1, x2, y1, y2`), not SVG's conventional pairing, so this
      // file stays diffable against `__iconNode` character for character.
      return {
        tag: "line",
        attrs: { x1: shape.x1, x2: shape.x2, y1: shape.y1, y2: shape.y2 },
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
  // 移動の族 (doc-11 §2.4 の 同じ図形を別の操作へ与えない). Arrows rather than the chevron pair above,
  // because chevron is the 折畳み family and a fold is not a move; doc-8 §2.2 and doc-7 §2.3 both write
  // their operation as ↑↓, so the pair is shared by 前後移動 and 行の並べ替え — §2.4 forbids sharing a
  // figure between operations that point at different things, and these two point at the same thing.
  "arrow-up": [
    { shape: "path", d: "m5 12 7-7 7 7" },
    { shape: "path", d: "M12 19V5" },
  ],
  "arrow-down": [
    { shape: "path", d: "M12 5v14" },
    { shape: "path", d: "m19 12-7 7-7-7" },
  ],
  // 行末の入口 (doc-7 §2.3) と 値の対応 (doc-10 §4.2 の別名表、§4.1 の保存で送る属性). The sketch prints
  // `›` and the nearest figure by shape would be `chevron-right`, but that one is already the 列折畳み
  // and the 区画見出し on the same screen: §2.4 copies what the glyph pointed at, not how it looked.
  "arrow-right": [
    { shape: "path", d: "M5 12h14" },
    { shape: "path", d: "m12 5 7 7-7 7" },
  ],
  // プロジェクト詳細の 戻る (doc-10 §3, decision-31). Deliberately the mirror of `arrow-right` above:
  // that one is the 行末の入口 into this screen, and the way out is the same move reversed. This is the
  // 語の中の記号 doc-11 §2.4 refuses to abstract — recorded as a deviation there rather than taken as
  // licence, because the word 「← スイムレーン」 does change when the arrow becomes the whole control.
  "arrow-left": [
    { shape: "path", d: "m12 19-7-7 7-7" },
    { shape: "path", d: "M19 12H5" },
  ],
  // 閉じる・解除・削除 (doc-11 §7 のモーダル、上部帯の通知、絞り込みトークン、status 別名表の行).
  // Those last three printed `×` until TASK-139 — they are older than `src/lib/icons/`, and doc-11 §7
  // is careful that sharing this figure is not sharing that section's contract.
  x: [
    { shape: "path", d: "M18 6 6 18" },
    { shape: "path", d: "m6 6 12 12" },
  ],
  // 不整合印 (decision-22). The one figure here that replaces an emoji rather than a character glyph:
  // ⚠️ is coloured by the platform's own font and redrawn by each of them, and Atlas runs on three
  // webviews (decision-11) with a theme it picks itself — so the emoji would be the one mark that
  // neither follows 表示テーマ nor looks the same twice. Drawn as a 印グリフ: the family colour is the
  // stroke, and there is no chip around it.
  "triangle-alert": [
    {
      shape: "path",
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    },
    { shape: "path", d: "M12 9v4" },
    { shape: "path", d: "M12 17h.01" },
  ],
  // 作成の入口 の 2 系統: 文書・マイルストーン (doc-10 §1, TASK-117) と レーンセルの ＋新規
  // (doc-7 §4.1, TASK-139). Both sit inside a 控え carrying its own visible wording (「新規文書」/
  // 「新規マイルストーン」/「新規」), so both are doc-11 §2.4's 可視の文言を持つ控えの中のアイコン.
  // The レーンセル one keeps an `aria-label` under the two exemptions §2.4 states for that type — its
  // wording does not say which cell, and CLI 縮退 puts the 保留理由 in the name. Two paths, so the
  // shape enumeration does not grow.
  plus: [
    { shape: "path", d: "M5 12h14" },
    { shape: "path", d: "M12 5v14" },
  ],
  // lucide `circle-question-mark`. The 注記の入口 beside the 新規タスク heading (doc-10 §7) — an
  // アイコンのみのボタン, so its `aria-label` carries the name and this figure carries nothing.
  //
  // Named `circle-question-mark` because that is what v1.17.0 calls it; the same package still exports
  // `circle-help.mjs`, but that file only re-exports this one, so the alias would have to be resolved
  // before the coordinates below could be diffed against anything.
  //
  // **This is where the shape enumeration grew a third kind** — the outer ring is a `circle`, and
  // flattening it into a path would be redrawing the figure, which the module header refuses. As the
  // header promises, `drawnShape` stopped compiling until the case was written.
  "circle-question-mark": [
    { shape: "circle", cx: "12", cy: "12", r: "10" },
    { shape: "path", d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
    { shape: "path", d: "M12 17h.01" },
  ],
  // 「選ばれている」印 の 2 か所: メニューの 表示中の印 (doc-7 §2.1, TASK-131) と 値一覧ポップオーバーの
  // 選択中の印 (doc-7 §5.2, TASK-139). Both sit inside a 控え carrying the thing's own name — a
  // project's, a value's — so both are doc-11 §2.4's 可視の文言を持つ控えの中のアイコン and take no
  // `aria-label`; the state each draws is `aria-pressed`'s to announce. One figure rather than one per
  // screen, which is what §2.4 の 同じ図形を別の操作へ与えない reads the other way round: these two
  // point at the same thing.
  //
  // The same tick `clipboard-check` ends with, at the size lucide draws it alone — the figures are
  // copied per name, so the shared stroke is written out twice rather than referenced once.
  check: [{ shape: "path", d: "M20 6 9 17l-5-5" }],
  // ACCEPTANCE CRITERIA の完了印 (doc-8 §3). 閲覧 draws it as doc-11 §2.4's 族を持たない状態の印 and
  // 編集セッション as an アイコンのみのボタン that toggles it — the same pair of figures either way, so
  // the項 does not change appearance when the session opens.
  //
  // Not a native checkbox: what 閲覧 shows is a state, not an input, and a disabled `<input>` there
  // would be a control that refuses. The two figures share their `rect` the way `clipboard` and
  // `clipboard-check` share theirs, which is what makes the swap read as one box being ticked.
  "square-check": [
    { shape: "rect", width: "18", height: "18", x: "3", y: "3", rx: "2" },
    { shape: "path", d: "m9 12 2 2 4-4" },
  ],
  square: [{ shape: "rect", width: "18", height: "18", x: "3", y: "3", rx: "2" }],
  // フィルタ帯の 2 つの解除 (doc-7 §5.2, TASK-175). Both became アイコンのみのボタン so that the bar
  // would stop spending its width on the two words; which figure stands for which control is doc-7's,
  // and nothing here knows what a 絞り込み is.
  //
  // `refresh-ccw` beside 既定に戻す is doc-11 §2.4's 同じ図形を別の操作へ与えない judged in that
  // section's third sub-bullet, not a figure picked for looking like a reset: 再読込 holds no figure at
  // all, so nothing is shared today, and what the judgment closes is that control's *later* choice —
  // `refresh-cw` included, because the two would then be a 族 and the rule is applied at the family.
  undo: [
    { shape: "path", d: "M3 7v6h6" },
    { shape: "path", d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" },
  ],
  "refresh-ccw": [
    { shape: "path", d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" },
    { shape: "path", d: "M3 3v5h5" },
    { shape: "path", d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" },
    { shape: "path", d: "M16 16h5v5" },
  ],
  // lucide `image`.
  image: [
    { shape: "rect", width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" },
    { shape: "circle", cx: "9", cy: "9", r: "2" },
    { shape: "path", d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" },
  ],
  // lucide `image-off`. The first figure this file draws with `line`.
  "image-off": [
    { shape: "line", x1: "2", x2: "22", y1: "2", y2: "22" },
    { shape: "path", d: "M10.41 10.41a2 2 0 1 1-2.83-2.83" },
    { shape: "line", x1: "13.5", x2: "6", y1: "13.5", y2: "21" },
    { shape: "line", x1: "18", x2: "21", y1: "12", y2: "15" },
    {
      shape: "path",
      d: "M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59",
    },
    { shape: "path", d: "M21 15V5a2 2 0 0 0-2-2H9" },
  ],
};

/**
 * One icon's figure as SVG markup, for the caller that cannot mount [`Icon.svelte`]: the 整形表示
 * pipeline builds an HTML string, and doc-11 §14.4 has the タスクリスト の印 drawn by the same figures
 * ACCEPTANCE CRITERIA uses — so the figure has to come from [`ICONS`] rather than be written again.
 *
 * `aria-hidden` is set here because every caller of this form wants it: the string is embedded inside a
 * wrapper that carries the name (doc-11 §2.4), exactly as the component's callers do.
 *
 * **Nothing here escapes anything, and nothing here needs to.** Every value comes from [`ICONS`] and
 * [`ICON_SVG_ATTRS`] — this module's own literals, never a caller's argument, never file content — and
 * [`tests`] holds that: `every_shape_attribute_is_safe_in_markup` fails if a coordinate ever grows a
 * character that would end an attribute. A generic escaper here would suggest that untrusted values
 * reach this function, and none do.
 */
export function iconMarkup(name: IconName): string {
  const frame = Object.entries(ICON_SVG_ATTRS)
    .map(([attr, value]) => `${attr}="${value}"`)
    .join(" ");
  const shapes = ICONS[name]
    .map((shape) => {
      const drawn = drawnShape(shape);
      const attrs = Object.entries(drawn.attrs)
        .map(([attr, value]) => `${attr}="${value}"`)
        .join(" ");
      return `<${drawn.tag} ${attrs}/>`;
    })
    .join("");
  return `<svg ${frame} aria-hidden="true">${shapes}</svg>`;
}
