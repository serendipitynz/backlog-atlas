import { describe, expect, it } from "vitest";
import {
  ICONS,
  ICON_SVG_ATTRS,
  drawnShape,
  iconMarkup,
  type IconName,
  type IconShape,
} from "./lucide";

// `drawnShape`'s exhaustive `switch` holds one axis — element *kinds* — and the module says so: a kind
// added to `IconShape` leaves the switch non-exhaustive and the build stops. It holds nothing about the
// attributes *within* a kind, and TASK-72 is where that started to matter: lucide writes `clipboard`'s
// rect with an `ry` that `panel-right`'s does not have, so `ry` is optional, and an optional field left
// out of `drawnShape` would compile, draw a `<rect>` missing a corner radius, and pass every other test
// in the project. This file is that axis: whatever a figure below was written with has to come back out.
//
// Asserted over `ICONS` rather than over hand-made samples, because the claim is about the figures this
// app actually draws. A new icon is covered the moment it is added, without this file being touched.

/** A shape's attributes: every field but the discriminant, which names the element rather than an attribute. */
const geometryOf = (shape: IconShape): Record<string, string> =>
  Object.fromEntries(Object.entries(shape).filter(([field]) => field !== "shape"));

describe("drawnShape", () => {
  it.each(Object.entries(ICONS))("%s draws every attribute its figure was written with", (_, shapes) => {
    for (const shape of shapes) {
      expect(drawnShape(shape).attrs).toEqual(geometryOf(shape));
    }
  });

  it("names the SVG element after the shape kind", () => {
    for (const shapes of Object.values(ICONS)) {
      for (const shape of shapes) {
        expect(drawnShape(shape).tag).toBe(shape.shape);
      }
    }
  });

  // The positive side of the claim above: without this, a `geometryOf` that silently returned `{}` — or
  // an `ICONS` whose figures had no attributes at all — would satisfy the round-trip vacuously. Both
  // `rect` variants are named because the optional `ry` is the whole reason this file exists: one figure
  // has to carry it and one has to not.
  it("carries lucide's own attributes, including the ry only some rects have", () => {
    expect(drawnShape(ICONS.clipboard[0]).attrs).toEqual({
      width: "8",
      height: "4",
      x: "8",
      y: "2",
      rx: "1",
      ry: "1",
    });
    expect(drawnShape(ICONS["panel-right"][0]).attrs).toEqual({
      width: "18",
      height: "18",
      x: "3",
      y: "3",
      rx: "2",
    });
    expect(drawnShape(ICONS["clipboard-check"][2]).attrs).toEqual({ d: "m9 14 2 2 4-4" });
  });
});

// `iconMarkup` is the second drawer of the same figures (doc-11 §14.4): the 整形表示 pipeline builds an
// HTML string, so it cannot mount `Icon.svelte`. What has to hold is that the two draw the *same* thing
// and that the string form is safe to embed — the function escapes nothing, on the stated grounds that
// every value is this module's own literal, and that ground is what these tests keep true.
describe("iconMarkup", () => {
  it("draws every shape of every icon, in lucide's element order", () => {
    for (const [name, shapes] of Object.entries(ICONS)) {
      const markup = iconMarkup(name as IconName);
      // Every element but the wrapping `<svg>`, matched by shape rather than by a named alternation:
      // a list of kinds here would have to be widened for each new one, and until it was, the figure
      // that used it would compare an empty tag list against an empty expectation and pass. TASK-186
      // added `line` and found exactly that.
      const tags = [...markup.matchAll(/<([a-z]+)\b/g)]
        .map((match) => match[1])
        .filter((tag) => tag !== "svg");
      expect(tags).toEqual(shapes.map((shape) => shape.shape));
      for (const shape of shapes) {
        for (const [attr, value] of Object.entries(drawnShape(shape).attrs)) {
          expect(markup).toContain(`${attr}="${value}"`);
        }
      }
    }
  });

  it("carries the same frame the component puts on the element", () => {
    const markup = iconMarkup("square");
    for (const [attr, value] of Object.entries(ICON_SVG_ATTRS)) {
      expect(markup).toContain(`${attr}="${value}"`);
    }
    // 族を持たない状態の印 (doc-11 §2.4): the name is the wrapper's, so the figure itself is decorative.
    expect(markup).toContain('aria-hidden="true"');
  });

  it("has no attribute value that could end an attribute or open a tag", () => {
    const values = [
      ...Object.values(ICON_SVG_ATTRS),
      ...Object.values(ICONS)
        .flat()
        .flatMap((shape) => Object.values(drawnShape(shape).attrs))
        .map(String),
    ];
    // This is the claim `iconMarkup` makes instead of escaping. A coordinate that grew a `"` would end
    // its attribute; one with `<` or `&` would be markup rather than geometry.
    for (const value of values) {
      expect(value).not.toMatch(/["<>&]/);
    }
  });
});
