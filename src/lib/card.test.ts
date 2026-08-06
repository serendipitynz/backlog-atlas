import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_DENSITY, cardFields, normalizePriority, priorityEdge } from "./card";
import type { CardDensity } from "./wire";

const DENSITIES: CardDensity[] = ["s", "m", "l"];

describe("カード情報量の割当表 (doc-7 §3)", () => {
  it("draws S as identification only: no Type, no 通常ラベル, no assignee, one title line", () => {
    expect(cardFields("s")).toEqual({
      types: false,
      labels: false,
      assignee: false,
      titleLines: 1,
    });
  });

  it("adds Type at M and keeps the 可変長の項目 out (AC #1)", () => {
    // 通常ラベル and assignee are what make a card's height unpredictable, so M — the 既定 — is the
    // densest 段 that still guarantees its title's line count.
    expect(cardFields("m")).toEqual({
      types: true,
      labels: false,
      assignee: false,
      titleLines: 2,
    });
  });

  it("adds 通常ラベル and assignee at L", () => {
    expect(cardFields("l")).toEqual({
      types: true,
      labels: true,
      assignee: true,
      titleLines: 3,
    });
  });

  it("truncates the title at 1・2・3 lines, one 段 per count (AC #3)", () => {
    expect(DENSITIES.map((density) => cardFields(density).titleLines)).toEqual([1, 2, 3]);
  });

  it("only ever grows as the 段 grows — no item appears at S and disappears at L", () => {
    // The three 段 are one ordered scale (S ⊆ M ⊆ L), which is what lets the setting be described as
    // 情報量. An item that came back at a lower 段 would make S・M・L three layouts instead.
    const fields = DENSITIES.map((density) => cardFields(density));
    for (const item of ["types", "labels", "assignee"] as const) {
      const flags = fields.map((field) => field[item]);
      expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
    }
  });

  it("defaults to M, not L (doc-7 §3 が既定値の正本)", () => {
    // 画面設計案 01 defaulted to L; doc-7 §3 settles on M because L's items are variable in count and
    // nobody chose the state that stops the card's height from being predictable.
    expect(DEFAULT_CARD_DENSITY).toBe("m");
    expect(cardFields(DEFAULT_CARD_DENSITY).titleLines).toBe(2);
  });
});

describe("優先度の縁 (decision-23)", () => {
  it("draws one edge per priority 3 段", () => {
    expect(priorityEdge("high")).toBe("high");
    expect(priorityEdge("medium")).toBe("medium");
    expect(priorityEdge("low")).toBe("low");
  });

  it("reads the 3 段 the way the 絞り込み does, so one task is `high` to both", () => {
    // The same normalisation, not a second one: a card edge that took `High` while the priority facet
    // did not would show a colour for a value the filter says the task does not have.
    for (const written of ["High", " HIGH ", "hIgH"]) {
      expect(priorityEdge(written)).toBe("high");
      expect(normalizePriority(written)).toBe("high");
    }
  });

  it("gives priority 未設定 no edge — 縁が無いことが未設定を述べる (decision-6 の中立表示)", () => {
    expect(priorityEdge(null)).toBeNull();
  });

  it("gives priority 未知 no edge rather than guessing it into one of the three", () => {
    // A word the file actually carries: 未知 is not 未設定, and colouring it would claim the frontmatter
    // said something it did not. The priority チップ still shows `urgent` as written.
    expect(priorityEdge("urgent")).toBeNull();
    expect(priorityEdge("")).toBeNull();
    expect(priorityEdge("highest")).toBeNull();
  });
});
