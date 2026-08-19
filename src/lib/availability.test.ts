/**
 * doc-11 §5 の 保留判定と保留理由を別の欄に持つ as a check over the source.
 *
 * The rule is easy to satisfy once and hard to keep: TASK-127 wrote it after the 概要区画's 保存 broke,
 * enumerated 8 sites on 2026-08-08, and TASK-128 counted 17 on 2026-08-19 — three of the additions
 * were written after the rule was. An enumeration in a task's body cannot hold a rule that new code
 * keeps meeting. TASK-128 swept the 17, and this is what stops the eighteenth.
 *
 * **What is held is the surface form**, which is decidable: a control withheld by comparing a
 * *reason-named* value against `null`, and an `enabled` field computed the same way. **The first of
 * those reads the name**, because a regex cannot ask what a value's type is — `disabled={crossId ===
 * null}` compares the id being copied, not a sentence, and a scan that flagged every `null` there
 * would be answered by an allowlist rather than by a fix. So it is stated positively: **a 保留理由 is
 * named for what it is** (`…Blocked`・`…Held`・`…Hold`・`…Reason`・`…Withheld`), and one hidden under
 * another name is not caught here.
 *
 * **What is not held is the rule.** A 保留判定 can still be derived from a reason through a shape no
 * pattern reads — `ProjectDetail.svelte`'s `issuing` is derived from `issuance` by hand precisely
 * because nothing would have caught the two drifting apart. The review is still where doc-11 §5 is
 * met; this closes the two shapes it has actually come back in.
 *
 * Sources come through `import.meta.glob` for the reason `screen-text.test.ts` gives — `node:fs` would
 * pull in `@types/node`, and the dependency budget is `jsdom` alone.
 */
import { describe, expect, it } from "vitest";
import { AVAILABLE, withheld } from "./availability";

const MARKUP: Record<string, string> = {
  ...import.meta.glob("../components/*.svelte", { eager: true, query: "?raw", import: "default" }),
  ...import.meta.glob("../App.svelte", { eager: true, query: "?raw", import: "default" }),
};

const MODULES: Record<string, string> = import.meta.glob("./*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * The three attributes that carry a 保留判定 into the DOM. `draggable` is one of them: doc-7 §4.2's
 * つまめないカード withholds the gesture rather than a control, and it broke the same way — the card
 * became draggable again the moment the reason went.
 */
const JUDGEMENT_BINDING = /\b(?:aria-)?(?:disabled|draggable)=\{([^{}]*)\}/g;

/** How a 保留理由 is named, wherever it is held. Matched case-insensitively on the last word. */
const REASON_NAMED = /\b\w*(?:blocked|held|hold|reason|withheld)\b\s*(?:===|!==)\s*null/i;

/** `enabled: blocked === null && …` — the pair shape that satisfies §5's letter and not its point. */
const ENABLED_FROM_NULL = /\benabled:\s*[^,\n]*(?:===|!==)\s*null/;

function judgements(source: string): string[] {
  return [...source.matchAll(JUDGEMENT_BINDING)].map((match) => match[1]);
}

function decidedByNull(expression: string): boolean {
  return REASON_NAMED.test(expression);
}

describe("保留判定を保留理由の nullness で書かない (doc-11 §5)", () => {
  const markup = Object.entries(MARKUP);
  const modules = Object.entries(MODULES).filter(([path]) => !path.endsWith(".test.ts"));

  it("scans the markup and the modules it means to", () => {
    // The scanned set is observable, so a glob that silently stopped matching cannot pass by testing
    // nothing (`hidden-reason.test.ts` の同じ理由). The floors are loose on purpose: an exact count
    // would be a second thing to update on every new file, and what this has to catch is a glob that
    // went to zero, not one that went from 22 to 21.
    expect(markup.length).toBeGreaterThan(10);
    expect(markup.some(([path]) => path.endsWith("App.svelte"))).toBe(true);
    expect(markup.some(([path]) => path.endsWith("Settings.svelte"))).toBe(true);
    expect(modules.some(([path]) => path.endsWith("project-detail.ts"))).toBe(true);
    // …and that it is reading the attributes, not merely the files.
    expect(markup.flatMap(([, source]) => judgements(source)).length).toBeGreaterThan(30);
  });

  it.each(markup)("%s の無効化提示は理由の有無で決めていない", (_path, source) => {
    expect(judgements(source).filter(decidedByNull)).toEqual([]);
  });

  it.each(modules)("%s の enabled は理由の有無から導いていない", (_path, source) => {
    expect(ENABLED_FROM_NULL.test(source)).toBe(false);
  });

  it("finds the shape it is looking for, in both of the forms it took", () => {
    // A scan that matched nothing would pass every file in the repository without reading one. Both
    // planted cases are the code this repository actually had before TASK-128.
    expect(judgements('<button disabled={reloadBlocked !== null}>').filter(decidedByNull)).toEqual([
      "reloadBlocked !== null",
    ]);
    expect(
      judgements('<button aria-disabled={item.held !== null}>').filter(decidedByNull),
    ).toHaveLength(1);
    expect(
      judgements('<div draggable={dragHeld === null && id !== null}>').filter(decidedByNull),
    ).toHaveLength(1);
    expect(ENABLED_FROM_NULL.test("      enabled: blocked === null && configured !== null,")).toBe(true);
    // …and leaves alone both the form doc-11 §5 asks for and a value that is not a reason at all.
    expect(
      judgements('<button disabled={reload.state === "withheld"}>').filter(decidedByNull),
    ).toEqual([]);
    expect(judgements("<button disabled={crossId === null}>").filter(decidedByNull)).toEqual([]);
    expect(ENABLED_FROM_NULL.test("  enabled: true,")).toBe(false);
  });
});

describe("Availability", () => {
  it("carries the reason only on the withheld side", () => {
    // The guarantee the type is for: there is no value of this type that is withheld without saying
    // why, and none that says why without being withheld.
    expect(AVAILABLE).toEqual({ state: "ready" });
    expect(withheld("実行中です")).toEqual({ state: "withheld", reason: "実行中です" });
  });
});
