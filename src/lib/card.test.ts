import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARD_DENSITY,
  cardFields,
  collapsedCellLabel,
  normalizePriority,
  priorityStep,
  priorityTally,
} from "./card";
import { taskView } from "./fixtures";
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

describe("priority 3 段 の判定 (decision-23)", () => {
  it("names the 段 for each of the three values 優先度色 exist for", () => {
    expect(priorityStep("high")).toBe("high");
    expect(priorityStep("medium")).toBe("medium");
    expect(priorityStep("low")).toBe("low");
  });

  it("reads the 3 段 the way the 絞り込み does, so one task is `high` to both", () => {
    // The same normalisation, not a second one: a card that took `High` while the priority facet did
    // not would show a colour for a value the filter says the task does not have.
    for (const written of ["High", " HIGH ", "hIgH"]) {
      expect(priorityStep(written)).toBe("high");
      expect(normalizePriority(written)).toBe("high");
    }
  });

  it("gives priority 未設定 no 段 — 色が無いことが未設定を述べる (decision-6 の中立表示)", () => {
    expect(priorityStep(null)).toBeNull();
  });

  it("gives priority 未知 no 段 rather than guessing it into one of the three", () => {
    // A word the file actually carries: 未知 is not 未設定, and colouring it would claim the frontmatter
    // said something it did not. The priority チップ still shows `urgent` as written.
    expect(priorityStep("urgent")).toBeNull();
    expect(priorityStep("")).toBeNull();
    expect(priorityStep("highest")).toBeNull();
  });
});

describe("畳んだ列の四角の内訳 (decision-23)", () => {
  const of = (...priorities: (string | null)[]) =>
    priorities.map((priority, index) =>
      taskView({ id: `TASK-${index + 1}`, sourcePath: `t-${index}.md`, priority }),
    );

  it("groups the 段 most urgent first, so the run is a shape before it is a hue", () => {
    // The order is the non-colour half of WCAG 1.4.1 here: a reader who cannot separate the hues still
    // reads the block left to right as urgency. Input order is deliberately scrambled.
    expect(priorityTally(of("low", null, "high", "medium", "high"))).toEqual([
      { step: "high", count: 2 },
      { step: "medium", count: 1 },
      { step: "low", count: 1 },
      { step: null, count: 1 },
    ]);
  });

  it("drops a 段 nothing is in, rather than leaving a zero group in the run", () => {
    expect(priorityTally(of("high", "high"))).toEqual([{ step: "high", count: 2 }]);
    expect(priorityTally([])).toEqual([]);
  });

  it("counts priority 未設定 と priority 未知 as one group — both are the absence of a 段", () => {
    expect(priorityTally(of(null, "urgent"))).toEqual([{ step: null, count: 2 }]);
  });

  it("announces the total and the breakdown, which the aria-hidden squares cannot", () => {
    // The squares carry the distribution visually and are `aria-hidden`; without this the count would
    // say only how many there are, which is what the colour was added on top of.
    expect(collapsedCellLabel("In Progress", of("high", "low", null))).toBe(
      "In Progress 3 件（high 1・low 1・priority 未設定・未知 1）",
    );
  });

  it("says just the count for an empty cell, with no empty parenthesis", () => {
    expect(collapsedCellLabel("Done", [])).toBe("Done 0 件");
  });
});
