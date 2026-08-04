import { describe, expect, it } from "vitest";
import { ICONS, drawnShape, type IconShape } from "./lucide";

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
