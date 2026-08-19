/**
 * doc-11 §5 の 保留判定と保留理由を別の欄に持つ as a check over the source.
 *
 * The rule is easy to satisfy once and hard to keep: TASK-127 wrote it after the 概要区画's 保存 broke,
 * enumerated 8 sites on 2026-08-08, and TASK-128 reached 18 on 2026-08-19 — three of the additions
 * were written after the rule was. An enumeration in a task's body cannot hold a rule that new code
 * keeps meeting. TASK-128 swept the 18, and this is what stops the nineteenth taking either of the
 * two shapes below.
 *
 * **What is held is the surface form**, which is decidable: a control withheld by comparing a
 * *reason-named* value against `null`, and an `enabled` field computed the same way. **The first of
 * those reads the name**, because a regex cannot ask what a value's type is — `disabled={crossId ===
 * null}` compares the id being copied, not a sentence, and a scan that flagged every `null` there
 * would be answered by an allowlist rather than by a fix. So it is stated positively: **a 保留理由 is
 * named for what it is** (`…Blocked`・`…Held`・`…Hold`・`…Reason`・`…Withheld`), and one hidden under
 * another name is not caught here.
 *
 * **What is not held is the rule**, and the gap is wider than the two patterns. Three shapes are known
 * to be outside them, each demonstrated rather than supposed:
 *
 * - **A 保留判定 derived independently of its reason**, which is the direction §5 refuses second.
 *   `ProjectRegister.svelte` held a `canRegister` boolean and a `blocked` string over the same four
 *   predicates, and nothing here compares `null` at all — the round-1 reviewer found it by reading,
 *   after TASK-128's own recount had missed it for the same reason.
 * - **A guard in a module**, `if (reason != null) { … }` — not an attribute and not an `enabled:`
 *   field. `manage.ts` had exactly that before the sweep.
 * - **A reason under a name outside the list**, since the first pattern reads the name.
 *
 * So a green run is not proof doc-11 §5 is met; review is still where that is decided. What these two
 * patterns close is the pair of shapes the rule has actually come back in.
 *
 * Sources come through `import.meta.glob` for the reason `screen-text.test.ts` gives — `node:fs` would
 * pull in `@types/node`, and the dependency budget is `jsdom` alone.
 */
import { describe, expect, it } from "vitest";
import { AVAILABLE, withheld } from "./availability";

/** Recursive on purpose: `../components/*.svelte` alone leaves `lib/icons/Icon.svelte` unscanned, and
 *  a component added one directory down would be missed with nothing to report it (review round 1). */
const MARKUP: Record<string, string> = import.meta.glob("../**/*.svelte", {
  eager: true,
  query: "?raw",
  import: "default",
});

const MODULES: Record<string, string> = import.meta.glob("../**/*.ts", {
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

/**
 * How a 保留理由 is named, wherever it is held — bare, or as the last word of a camelCase name.
 *
 * **Written as two alternatives rather than one case-insensitive pattern**, because `\w*hold` also
 * matches `threshold`: a bare name has to be the whole word, and a suffixed one has to start where
 * the capital does. **`[!=]==?` rather than `===|!==`**, because loose equality withholds just as
 * well — `manage.ts`'s own pre-TASK-128 guard was `if (context.hold != null)`, one character from the
 * form the strict pattern catches.
 */
const REASON_NAMED =
  /(?:\b(?:blocked|held|hold|reason|withheld)|[a-z0-9_$][\w$]*(?:Blocked|Held|Hold|Reason|Withheld))\b\s*[!=]==?\s*null/;

/** `enabled: blocked === null && …` — the pair shape that satisfies §5's letter and not its point. */
const ENABLED_FROM_NULL = /\benabled:\s*[^,\n]*[!=]==?\s*null/;

function judgements(source: string): string[] {
  return [...source.matchAll(JUDGEMENT_BINDING)].map((match) => match[1]);
}

function decidedByNull(expression: string): boolean {
  return REASON_NAMED.test(expression);
}

describe("保留判定を保留理由の nullness で書かない (doc-11 §5)", () => {
  const markup = Object.entries(MARKUP);
  const modules = Object.entries(MODULES).filter(([path]) => !path.endsWith(".test.ts"));
  /** The `enabled:` rule runs over both: `{ enabled, reason }` pairs lived in components too, and
   *  `Settings.svelte` held one until this sweep. */
  const enabledSources = [...markup, ...modules];

  it("scans the markup and the modules it means to", () => {
    // The scanned set is observable, so a glob that silently stopped matching cannot pass by testing
    // nothing (`hidden-reason.test.ts` の同じ理由). The floors are loose on purpose: an exact count
    // would be a second thing to update on every new file, and what this has to catch is a glob that
    // went to zero, not one that went from 22 to 21.
    expect(markup.length).toBeGreaterThan(10);
    expect(markup.some(([path]) => path.endsWith("App.svelte"))).toBe(true);
    expect(markup.some(([path]) => path.endsWith("Settings.svelte"))).toBe(true);
    expect(modules.some(([path]) => path.endsWith("project-detail.ts"))).toBe(true);
    // The globs are recursive, so a file one directory down is in the set rather than silently out.
    expect(markup.some(([path]) => path.endsWith("icons/Icon.svelte"))).toBe(true);
    expect(modules.some(([path]) => path.includes("/messages/"))).toBe(true);
    // …and that it is reading the attributes, not merely the files.
    expect(markup.flatMap(([, source]) => judgements(source)).length).toBeGreaterThan(30);
  });

  it.each(markup)("%s の無効化提示は理由の有無で決めていない", (_path, source) => {
    expect(judgements(source).filter(decidedByNull)).toEqual([]);
  });

  it.each(enabledSources)("%s の enabled は理由の有無から導いていない", (_path, source) => {
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
    expect(ENABLED_FROM_NULL.test("      enabled: blocked === null && configured !== null,")).toBe(
      true,
    );
    // Loose equality withholds just as well, and this repository had written it (`manage.ts`).
    expect(judgements("<button disabled={hold != null}>").filter(decidedByNull)).toHaveLength(1);
    // …and leaves alone both the form doc-11 §5 asks for and a value that is not a reason at all.
    expect(
      judgements('<button disabled={reload.state === "withheld"}>').filter(decidedByNull),
    ).toEqual([]);
    expect(judgements("<button disabled={crossId === null}>").filter(decidedByNull)).toEqual([]);
    // …including the word that ends in one of the names without being one of them.
    expect(judgements("<button disabled={threshold === null}>").filter(decidedByNull)).toEqual([]);
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
