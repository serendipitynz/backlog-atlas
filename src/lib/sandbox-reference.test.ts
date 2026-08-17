/**
 * decision-36 as a check over the two directories README sends a reader to, not as a one-time sweep.
 *
 * `_sandbox/` is git-ignored, so a path into it is a claim this repository cannot keep true: no check
 * inside the tree can reach the file, and nothing fails when it moves. That is not a hypothetical —
 * six of the twenty-one paths `backlog/decisions/` and `backlog/docs/` carried were already dead in
 * the author's own tree when TASK-169 counted them, five of them broken at once by a single session
 * that reorganised `_sandbox/` and never opened a decision. **The forcing function decision-27 §4
 * relies on for version literals is exactly what is missing here**, which is why this file exists and
 * that rule needs no equivalent.
 *
 * Scope is the two directories and nothing else, matching decision-36 §4: `backlog/tasks/` and code
 * comments carry the same kind of path deliberately, so widening this glob would report 158 sites the
 * decision chose to leave.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason
 * `third-party-licenses.test.ts` gives: `node:fs` would pull in `@types/node`, and the dependency
 * budget is `jsdom` alone.
 *
 * No DOM here, so this runs in the `node` project.
 */

import { describe, expect, it } from "vitest";

const DECISIONS: Record<string, string> = import.meta.glob("../../backlog/decisions/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const DOCS: Record<string, string> = import.meta.glob("../../backlog/docs/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * The other four committed files a reader or an agent reads as instruction. They carry no such path
 * today, so including them changes no text — it only stops the same failure arriving here, in the
 * files most likely to be read at all. `backlog/tasks/` stays out: it is the ledger, not prose.
 */
const PROSE: Record<string, string> = import.meta.glob(
  ["../../AGENTS.md", "../../AGENTS.ja.md", "../../README.md", "../../README.ja.md"],
  { eager: true, query: "?raw", import: "default" },
);

/**
 * `_sandbox/` followed by anything that continues a path. The trailing character class is the whole
 * of decision-36 §3: naming the directory itself (`` `_sandbox/` ``, as decision-32 does when it says
 * which trees Biome swept) closes the code span right after the slash and stays legal, while one more
 * character makes it a location a reader is sent to.
 *
 * **The class is a negation rather than an ASCII name set**, because every managed file in this repo
 * is named in Japanese: an ASCII set passes a citation like `_sandbox/対応表/表.md` while decision-36
 * forbids it, and nothing else would notice. The two excluded characters are the only ways a
 * reference ends here — the closing backtick, or whitespace when the path is written bare. Prose
 * running straight into the slash without a code span reports a false positive, which is the
 * direction of error this check wants: a loud failure on a form the house style does not use, rather
 * than a silent pass on one it does.
 */
const SANDBOX_PATH = /_sandbox\/[^\s`]/;

/**
 * A referent table named by file rather than by the task that produced it. This is the one form the
 * rot took *without* the `_sandbox/` prefix — decision-23 cited one that way, and that citation was
 * as dead as its prefixed neighbours. The middle is negated for the reason given above. A bare
 * filename of some other kind would still slip through both patterns; that gap is real and stated
 * rather than implied, and it is the reason the rule in decision-36 §2 is about what to write, not
 * only about what to avoid.
 */
const BARE_TABLE_FILE = /referent-table[^\s`]*\.md/;

function offendingLines(body: string, pattern: RegExp): string[] {
  const hits: string[] = [];
  body.split("\n").forEach((line, index) => {
    if (pattern.test(line)) {
      hits.push(`${index + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

function scanAll(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const sources of [DECISIONS, DOCS, PROSE]) {
    for (const [path, body] of Object.entries(sources)) {
      for (const hit of offendingLines(body, pattern)) {
        found.push(`${path} ${hit}`);
      }
    }
  }
  return found;
}

describe("decision-36 _sandbox/ 配下のパスを名乗らない", () => {
  /**
   * The scan holds its own source set. A glob that resolved to nothing would make every assertion
   * below pass while reading no file at all, which is the failure mode this project has already seen
   * once in `third-party-licenses.test.ts` — there an unparseable header left it comparing an empty
   * list against an empty list and agreeing that nothing had gone stale.
   */
  it("reads every file it claims to read", () => {
    expect(Object.keys(DECISIONS).length).toBeGreaterThanOrEqual(36);
    expect(Object.keys(DOCS).length).toBeGreaterThanOrEqual(11);
    expect(Object.keys(PROSE)).toHaveLength(4);
    expect(Object.keys(DECISIONS).some((path) => path.includes("decision-36"))).toBe(true);
    expect(Object.keys(DOCS).some((path) => path.includes("doc-11"))).toBe(true);
  });

  it("finds no path into the ignored tree", () => {
    expect(scanAll(SANDBOX_PATH)).toEqual([]);
  });

  it("finds no referent table named by file", () => {
    expect(scanAll(BARE_TABLE_FILE)).toEqual([]);
  });

  /**
   * Both patterns are planted rather than trusted. A pattern that had stopped matching would make the
   * two tests above pass by testing nothing, and the planted lines are the forms the tree actually
   * carried before TASK-169 rewrote them.
   */
  it("sees a path planted in a body", () => {
    const planted = ["手順は `_sandbox/csp-check/measure-csp.mjs` にある。"].join("\n");
    expect(offendingLines(planted, SANDBOX_PATH)).toHaveLength(1);
  });

  /**
   * The form an ASCII-only class would have passed. Every managed file in this repo is named in
   * Japanese, so a citation shaped like this is the likely one, not an exotic case — which is why it
   * is planted beside the ASCII form rather than left to the class definition to promise.
   */
  it("sees a path whose name is not ASCII", () => {
    const planted = ["語と指示対象は `_sandbox/対応表/表.md` 初版で固定した。"].join("\n");
    expect(offendingLines(planted, SANDBOX_PATH)).toHaveLength(1);
  });

  it("sees a referent table filename planted in a body", () => {
    const planted = ["起点は `referent-table-task-77.md` 第 2 版）。"].join("\n");
    expect(offendingLines(planted, BARE_TABLE_FILE)).toHaveLength(1);
  });

  /**
   * decision-36 §3 in the form the scan reads it. decision-32's sentence is the live instance, so it
   * is quoted here rather than paraphrased — if §3 is ever narrowed, this is the line that says which
   * sentence stops being legal.
   */
  it("leaves the directory named as itself alone", () => {
    const legal = "実際に一度そうなり、`_sandbox/` と `src-tauri/target/` を舐めて 49,056 件を報告した。";
    expect(offendingLines(legal, SANDBOX_PATH)).toEqual([]);
  });
});
