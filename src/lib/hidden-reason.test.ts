/**
 * doc-11 §5 の 2 つ目の形 as a check over the source: a reason a screen is licensed not to *print*
 * (doc-11 §8) still has to be reachable, so it stays in the DOM and is hidden by CSS instead of being
 * dropped. Every component that hides one does it by putting `unseen` on the element.
 *
 * **Svelte scopes styles per component**, so the class is inert in any component that does not also
 * define a rule for it — the markup sets it, nothing matches it, and the sentence the screen was
 * licensed to leave unsaid stays painted. That failed twice in one session (TASK-135, 2026-08-10):
 * once in `TaskDetail.svelte`, caught by a screenshot, and once in `ProjectRegister.svelte`, caught by
 * the PR reviewer after the first was fixed and its sibling was not. Both were invisible to
 * `svelte-check`, which reports a rule with no markup and not markup with no rule, and invisible to a
 * DOM query for `:not(.unseen)`, which answers about the attribute rather than about what is drawn.
 *
 * jsdom runs no layout (`render.ts`), so no mounted test can assert the element is out of sight. What
 * *is* decidable is the pairing: a component that sets the class must carry a rule for it. That is
 * this file.
 *
 * Sources come through `import.meta.glob` for the reason `screen-text.test.ts` gives — `node:fs` would
 * pull in `@types/node`, and the dependency budget is `jsdom` alone.
 */
import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../components/*.svelte", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** `class:unseen={…}` and `class={… ? "unseen" : …}` — the two ways the markup sets it. */
const SETS_CLASS = /class:unseen\b|["'`]unseen["'`]/;
/** A rule whose selector mentions the class, however it is qualified (`.live.unseen` is one). */
const DEFINES_RULE = /^\s*[^\n{}]*\.unseen\b[^\n{}]*\{/m;

function styleBlock(source: string): string {
  const start = source.indexOf("<style");
  if (start === -1) return "";
  const open = source.indexOf(">", start);
  const end = source.indexOf("</style>", open);
  return open === -1 || end === -1 ? "" : source.slice(open + 1, end);
}

function markup(source: string): string {
  const start = source.indexOf("<style");
  return start === -1 ? source : source.slice(0, start);
}

describe("隠す理由は、隠す規則を同じコンポーネントが持つ (doc-11 §5)", () => {
  const entries = Object.entries(SOURCES);

  it("scans the components", () => {
    // The scanned set is observable, so a glob that silently stopped matching cannot pass by
    // testing nothing (`screen-text.test.ts` の同じ理由).
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.some(([path]) => path.endsWith("ProjectRegister.svelte"))).toBe(true);
  });

  it.each(entries.filter(([, source]) => SETS_CLASS.test(markup(source))))(
    "%s は unseen を付けるので、それに当たる規則も持つ",
    (_path, source) => {
      expect(DEFINES_RULE.test(styleBlock(source))).toBe(true);
    },
  );

  it("finds a component that sets the class but does not hide it", () => {
    // The check itself, against a planted case: a pairing test that matched nothing would pass every
    // component in the repository without looking at one.
    const planted = '<span class:unseen={true}></span><style lang="scss">.other { color: red; }</style>';
    expect(SETS_CLASS.test(markup(planted))).toBe(true);
    expect(DEFINES_RULE.test(styleBlock(planted))).toBe(false);
  });
});
