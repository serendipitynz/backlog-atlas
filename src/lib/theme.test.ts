import { describe, expect, it } from "vitest";
import * as sass from "sass";
import {
  RECORDED_THEMES,
  RECORDED_THEME_IDS,
  isRecorded,
  themeAttribute,
  themeLabel,
} from "./theme";

describe("themeAttribute", () => {
  it("leaves 未選択 without an attribute, so app.scss's media query keeps following the OS", () => {
    expect(themeAttribute(null)).toBeNull();
  });

  it("carries an explicitly chosen theme through, which outranks the OS の明暗 (decision-12)", () => {
    expect(themeAttribute("solarized-dark")).toBe("solarized-dark");
  });

  // decision-13 の縮退: a hand-edited file, or one written by a build with more themes, must land on
  // the default rather than on an attribute that paints nothing recognisable.
  it("falls back to the OS-following default for a name this build does not record", () => {
    expect(themeAttribute("Gruvbox")).toBeNull();
    expect(isRecorded("Gruvbox")).toBe(false);
    expect(themeLabel("Gruvbox")).toBeNull();
  });
});

// --- 収録条件の検算 (decision-12・decision-22・decision-23) -------------------------------------
//
// There are two conditions on the 族, because there are two ways a 印 is drawn, and three on the
// 優先度色, which are not 族 colours and are not drawn as 印 at all.
//
// **印チップ** (decision-12) draws 文字＝族の色 / 背景＝族の色 12% 混色 / 枠＝族の色 45% 混色, so its
// legibility is the ratio between the family colour and that 12% mix once it has been composited onto
// whatever surface the chip sits on. decision-12 makes 4.5:1 on every such cell the condition for
// recording a theme at all, and names the cost of not checking: a theme that fails it looks fine on
// screen.
//
// **印グリフ** (decision-22) has no mixed background — the family colour *is* the figure's stroke — so
// the 12% rule has nothing to measure and the ratio is the family colour against the bare surface.
// decision-22 sets that at 3:1, the WCAG 2.2 1.4.11 minimum for a non-text element, and refuses to
// borrow the chip's 4.5:1: the recorded themes clear it today by a wide margin, and a limit chosen
// because it happens to hold is one nobody can re-derive when adding the eleventh theme.
//
// **優先度色** (decision-23) are drawn four ways, and the conditions follow the drawing rather than
// the value: as the priority チップ they take the 印チップ配色規則's 4.5:1 against their own 12% mix; as
// the task detail's priority value they are plain text, so 4.5:1 against the bare surface; as the
// 優先度の縁 and the 畳んだ列の四角 they are non-text elements, so 3:1 against the bare surface. **The
// chip condition binds** — a value clearing it clears the other two — but all three are asserted,
// because which of them binds is a property of today's palette and not something a later editor
// should have to re-derive.
//
// They are checked apart from the families because the values are apart: `--priority-*` is its own
// set, and a change to one must not be able to pass by resembling a family colour that happens to
// clear the bar.
//
// All of it is computed here from `app.scss` itself — not from a copy of the values — and covers
// every recorded theme, every 族 plus `--info`, every 段, on every surface.

/** The surfaces a 印 can sit on. `--panel`/`--inset` are what decision-12 requires; `--bg` is the
 *  page ground the 上部帯 (doc-11 §4) sits on, and it is cheaper to hold all three than to argue
 *  about which screen puts a chip where.
 *
 *  These are the *actual* composites, not an approximation of them: no screen puts a chip on a face
 *  that is itself tinted with a family colour. The one that did — the 読取不能 lane header, under the
 *  継続検出停止 chip — now carries a 問題の縁 instead (`Swimlane.svelte`), because a tinted face under
 *  a chip moves the ratio this file fixes. Keep it that way: a family tint behind a 印 makes the
 *  numbers below true of the stylesheet and false of the screen. */
const SURFACES = ["--panel", "--inset", "--bg"] as const;

/** The 3 族 decision-22 left, plus `--info`, which is not one of them (doc-11 §2.1). */
const FAMILIES = [
  "--mark-inconsistent",
  "--mark-undetectable",
  "--mark-unreadable",
  "--info",
] as const;

/** 印チップの収録条件 (decision-12): 族の色 対 その族の 12% 混色背景. */
const REQUIRED_RATIO = 4.5;

/** 印グリフの収録条件 (decision-22): 族の色 対 それが載る面. WCAG 1.4.11 の非文字要素の下限. */
const REQUIRED_GLYPH_RATIO = 3;

/** 優先度色 (decision-23): the three values priority 3 段 draws with. Not 族 — no 印 borrows them. */
const PRIORITY_COLOURS = ["--priority-high", "--priority-medium", "--priority-low"] as const;

/** 優先度色の収録条件 ①: priority チップ として、自分の 12% 混色背景に対して (印チップ配色規則). */
const REQUIRED_PRIORITY_CHIP_RATIO = 4.5;

/** 優先度色の収録条件 ②: タスク詳細の priority の値 — 素の文字なので面に対して. */
const REQUIRED_PRIORITY_TEXT_RATIO = 4.5;

/** 優先度色の収録条件 ③: 優先度の縁・畳んだ列の四角 — 非文字要素なので WCAG 1.4.11 の下限. */
const REQUIRED_PRIORITY_NONTEXT_RATIO = 3;

// Compiled by `sass` from the path rather than read and compiled as a string: the stylesheet is the
// only place the values exist (decision-12), and letting sass open it keeps this test free of Node's
// fs types — the project has no `@types/node` and does not need one for this.
const CSS = sass.compile("src/app.scss").css;

/** Each `:root[data-theme=…]` block's custom properties, by theme id. */
const BLOCKS = new Map<string, Map<string, string>>(
  [...CSS.matchAll(/:root\[data-theme=("?)([a-z-]+)\1\]\s*\{([^}]*)\}/g)].map(
    ([, , id, body]): [string, Map<string, string>] => [
      id,
      new Map(
        [...body.matchAll(/(--[a-z-]+|color-scheme):\s*([^;]+);/g)].map(([, name, value]) => [
          name,
          value.trim(),
        ]),
      ),
    ],
  ),
);

const hex = (value: string): [number, number, number] => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (match === null) throw new Error(`色値が 6 桁の hex ではありません: ${value}`);
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16)) as [number, number, number];
};

const relativeLuminance = (rgb: readonly number[]): number => {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG relative-luminance contrast ratio, which is what decision-12's 4.5:1 is stated in. */
const contrast = (a: readonly number[], b: readonly number[]): number => {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

/**
 * The cells that miss the floor, rounded for reading.
 *
 * **The comparison is on the raw ratio and the rounding happens after it** (PR #70 の [P2]): rounding
 * first lets 2.999:1 become 3.00 and clear a 3:1 floor, so a theme edit could land just under the
 * condition and be told it passed. Two decimals is what makes a failure legible — it is a diagnostic,
 * not the judgement.
 */
const failing = (ratios: Record<string, number>, floor: number): Record<string, number> =>
  Object.fromEntries(
    Object.entries(ratios)
      .filter(([, ratio]) => ratio < floor)
      .map(([cell, ratio]) => [cell, Math.round(ratio * 100) / 100]),
  );

/** `color-mix(in srgb, <族の色> 12%, transparent)` composited onto an opaque surface. */
const markBackground = (family: string, surface: string): number[] => {
  const mark = hex(family);
  const under = hex(surface);
  return mark.map((channel, i) => 0.12 * channel + 0.88 * under[i]);
};

describe("収録した表示テーマ (decision-12)", () => {
  it("has a [data-theme] block for every recorded name and nothing besides", () => {
    expect([...BLOCKS.keys()].sort()).toEqual([...RECORDED_THEME_IDS].sort());
  });

  // AC #4: the platform paints form controls and scrollbars, and it needs telling per theme —
  // otherwise a light theme on a dark desktop keeps dark `<select>`s and scrollbars.
  it("declares color-scheme on each block, matching the theme's 明暗", () => {
    for (const theme of RECORDED_THEMES) {
      expect(BLOCKS.get(theme.id)?.get("color-scheme")).toBe(theme.scheme);
    }
  });

  it.each(RECORDED_THEMES.map((theme) => [theme.id] as const))(
    "%s: 印チップ — 3 族 と --info が 12%% 混色背景に対して 4.5:1 以上 (--panel / --inset / --bg)",
    (id) => {
      const block = BLOCKS.get(id);
      if (block === undefined) throw new Error(`[data-theme="${id}"] のブロックがありません`);
      const ratios: Record<string, number> = {};
      for (const family of FAMILIES) {
        for (const surface of SURFACES) {
          const mark = block.get(family);
          const under = block.get(surface);
          if (mark === undefined || under === undefined) {
            throw new Error(`${id} に ${family} または ${surface} がありません`);
          }
          ratios[`${family} on ${surface}`] = contrast(hex(mark), markBackground(mark, under));
        }
      }
      // Asserted as one object so a failure names every cell and its ratio, rather than stopping at
      // the first — a palette is adjusted family by family, and the whole picture is what guides it.
      expect(failing(ratios, REQUIRED_RATIO)).toEqual({});
    },
  );

  // 印グリフ (decision-22). The same families on the same surfaces, without the 12% mix: 不整合印 is the
  // only glyph today, but the condition is stated over every family — a second one would otherwise be
  // drawn against a number nobody had checked.
  it.each(RECORDED_THEMES.map((theme) => [theme.id] as const))(
    "%s: 印グリフ — 3 族 と --info が載る面に対して 3:1 以上 (--panel / --inset / --bg)",
    (id) => {
      const block = BLOCKS.get(id);
      if (block === undefined) throw new Error(`[data-theme="${id}"] のブロックがありません`);
      const ratios: Record<string, number> = {};
      for (const family of FAMILIES) {
        for (const surface of SURFACES) {
          const glyph = block.get(family);
          const under = block.get(surface);
          if (glyph === undefined || under === undefined) {
            throw new Error(`${id} に ${family} または ${surface} がありません`);
          }
          ratios[`${family} on ${surface}`] = contrast(hex(glyph), hex(under));
        }
      }
      expect(failing(ratios, REQUIRED_GLYPH_RATIO)).toEqual({});
    },
  );

  /** The three ways 優先度色 are drawn, each with the ratio its drawing implies (decision-23). */
  const PRIORITY_CONDITIONS = [
    {
      drawn: "priority チップ",
      floor: REQUIRED_PRIORITY_CHIP_RATIO,
      // Against its own 12% mix, exactly as a 印チップ — the chip borrows the 規則, not the 族.
      against: (colour: string, surface: string) => markBackground(colour, surface),
    },
    {
      drawn: "タスク詳細の priority の値",
      floor: REQUIRED_PRIORITY_TEXT_RATIO,
      // Plain text on the panel: no mix to composite, so the surface itself is the other side.
      against: (_colour: string, surface: string) => hex(surface),
    },
    {
      drawn: "優先度の縁・畳んだ列の四角",
      floor: REQUIRED_PRIORITY_NONTEXT_RATIO,
      against: (_colour: string, surface: string) => hex(surface),
    },
  ] as const;

  // The edge sits on the card's own border — `--panel` inside, the lane cell's ground (`--bg`)
  // outside — and the 四角 sit on the folded column's band. `--inset` is held with them for the same
  // reason the two conditions above hold it, so a later screen putting either on a くぼみ面 does not
  // need this file reopened.
  it.each(
    RECORDED_THEMES.flatMap((theme) =>
      PRIORITY_CONDITIONS.map((condition) => [theme.id, condition] as const),
    ),
  )("%s: 優先度色 — %s として収録条件を満たす (--panel / --inset / --bg)", (id, condition) => {
    const block = BLOCKS.get(id);
    if (block === undefined) throw new Error(`[data-theme="${id}"] のブロックがありません`);
    const ratios: Record<string, number> = {};
    for (const colour of PRIORITY_COLOURS) {
      for (const surface of SURFACES) {
        const step = block.get(colour);
        const under = block.get(surface);
        if (step === undefined || under === undefined) {
          throw new Error(`${id} に ${colour} または ${surface} がありません`);
        }
        ratios[`${colour} on ${surface}`] = contrast(hex(step), condition.against(step, under));
      }
    }
    expect(failing(ratios, condition.floor)).toEqual({});
  });

  // 優先度色 は族ではない (decision-23): a theme that set one of them to a family's value would put the
  // family's hue on a card edge as a priority — exactly what decision-12 refused and what decision-23
  // only re-opened for *where priority may be coloured*, not for the family colours themselves.
  it.each(RECORDED_THEMES.map((theme) => [theme.id] as const))(
    "%s: 優先度色 が族の色そのものではない",
    (id) => {
      const block = BLOCKS.get(id);
      if (block === undefined) throw new Error(`[data-theme="${id}"] のブロックがありません`);
      const families = FAMILIES.map((family) => block.get(family)?.toLowerCase());
      for (const colour of PRIORITY_COLOURS) {
        expect(families).not.toContain(block.get(colour)?.toLowerCase());
      }
    },
  );
});
