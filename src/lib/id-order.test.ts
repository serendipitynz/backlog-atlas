/**
 * doc-4 §7 の id の比較規則 as a check over the frontend's half of it.
 *
 * The rule has two implementations — `read::id_order` in Rust for the three non-task lists, and
 * `compareNumberAware` here for the card order doc-7 §5.4 lets the user choose. Nothing in the
 * type system relates them, so this file and `read::id_order`'s tests read **the same line of the
 * design document** and each sorts it with its own implementation. A change to either side that
 * moved the digit-run answer would fail on that side alone, which is what puts something behind
 * §7's「実装は 2 つある」rather than leaving it a note.
 *
 * The expected order is not written here for the reason TASK-164 established: an expectation
 * spelled in a test is a third copy beside the doc and the code, and the three then drift with
 * nothing failing.
 *
 * The doc is read through `import.meta.glob` rather than `node:fs` — same reason as
 * `text-scale.test.ts` and `wire-fixture.test.ts`: the `unit` project's dependency budget is zero,
 * and `node:fs` would pull in `@types/node`.
 */
import { describe, expect, it } from "vitest";
import { compareNumberAware } from "./swimlane";

const DOC_4: Record<string, string> = import.meta.glob("../../backlog/docs/doc-4*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const MARKER = "- **昇順の例**: ";

/** doc-4 §7 の 昇順の例 の行が挙げる id を、doc が書いた順のまま返す。 */
function docExamples(): string[] {
  const sources = Object.values(DOC_4);
  // A glob that matched nothing would otherwise leave every case below vacuously true — the
  // 「0 件が正常でありうるかを先に決める」 shape this repository has been caught by.
  expect(sources).toHaveLength(1);
  const line = sources[0].split("\n").find((row) => row.startsWith(MARKER));
  expect(line, "doc-4 §7 の 昇順の例 の行が読めない").toBeDefined();
  const ids = (line as string)
    .slice(MARKER.length)
    .split("。")[0]
    .split("→")
    .map((cell) => cell.trim().replace(/^`|`$/g, ""))
    .filter((id) => id !== "");
  expect(ids.length).toBeGreaterThan(1);
  return ids;
}

describe("doc-4 §7 の id の比較規則", () => {
  it("sorts the doc's 昇順の例 into the order the doc lists them in", () => {
    const expected = docExamples();
    // Reversed rather than shuffled: every adjacent pair then disagrees with the answer, so a
    // comparator returning a constant cannot pass.
    const scrambled = [...expected].reverse().sort(compareNumberAware);
    expect(scrambled).toEqual(expected);
  });

  it("answers the digit runs the way the Rust implementation does", () => {
    // The three cases §7 spells out in prose. Each is a *consequence* named there, not a second
    // copy of the ladder: 数として比べる, 綴りの短いほうが先, 数字を持たない id を特別扱いしない.
    expect(compareNumberAware("decision-2", "decision-10")).toBeLessThan(0);
    expect(compareNumberAware("doc-1", "doc-01")).toBeLessThan(0);
    expect(compareNumberAware("doc-notes", "doc-10")).toBeGreaterThan(0);
  });
});
