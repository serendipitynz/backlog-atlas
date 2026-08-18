/**
 * AGENTS「作業上の規約」's Japanese-emphasis rule as a check over the managed bodies, not as a one-time
 * sweep. Atlas draws task and document bodies with markdown-it (decision-25), so a bold run that fails
 * to pair is visible in the app as well as on GitHub — TASK-161 found 426 such delimiters across 44
 * files, in three shapes:
 *
 * - `**〜である。**次の文` — the closer is preceded by `。`, so it is not right-flanking and cannot close.
 *   This is the common one, because most Japanese sentences end inside the emphasis.
 * - `〜取る。****控えの群**` — a closer and the next opener collide into one run of four, which markdown-it
 *   reads as a single delimiter run and can only open.
 * - `には**「〜」**と書いた` — the mirror: the opener is followed by `「`, so it is not left-flanking.
 *
 * **A fourth shape leaves no literal asterisk behind and so is invisible to the count above.** Where a
 * closer fails, the following opener can absorb it and the emphasis nests instead: `。**最も効いたのは**
 * 実測日付**の指摘` renders one bold run containing another, with no `**` in the output for a scan to
 * find. The tree carried exactly one (TASK-152's notes), and the second assertion below is what sees it —
 * which is why this file checks the spans and not only the asterisks.
 *
 * **What this holds is the rendering condition, and the rule's letter is wider.** «閉じる `**` の後に文が
 * 続くなら半角スペース» is written without a condition; the punctuation is the reason, not the scope. Held
 * to the letter, `**Ubuntu なら 24.04 以降**で` violates it while rendering correctly, and the tree has 3,454
 * such sites (measured 2026-08-19 over the three directories: 1,574 in tasks, 1,325 in docs, 555 in
 * decisions, plus 64 in the four prose files). Rewriting them is a different piece of work from this one,
 * so **a clean run here is not proof the rule's letter is met** — TASK-161's AC named the rendering count
 * and that is the boundary this file draws. Do not read the pass as covering the wider claim.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason
 * `third-party-licenses.test.ts` gives: `node:fs` would pull in `@types/node`, and the dependency budget
 * is `jsdom` alone. `_sandbox/` is out of scope because it is git-ignored, the same reason
 * `sandbox-reference.test.ts` gives for its own boundary.
 *
 * No DOM here, so this runs in the `node` project.
 */

import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

const md = new MarkdownIt();

const TASKS: Record<string, string> = import.meta.glob("../../backlog/tasks/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const DOCS: Record<string, string> = import.meta.glob("../../backlog/docs/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const DECISIONS: Record<string, string> = import.meta.glob("../../backlog/decisions/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const MILESTONES: Record<string, string> = import.meta.glob("../../backlog/milestones/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * The three directories the Backlog CLI moves a task into, and their archived counterparts. All empty
 * today, so including them changes no assertion — it only stops a body escaping this check by being
 * filed rather than by being edited.
 */
const FILED: Record<string, string> = import.meta.glob(
  [
    "../../backlog/drafts/*.md",
    "../../backlog/completed/*.md",
    "../../backlog/archive/**/*.md",
  ],
  { eager: true, query: "?raw", import: "default" },
);

/**
 * The four committed files a reader or an agent reads as instruction. Atlas does not draw them, but the
 * rule binds them and GitHub renders them; they are clean today, so including them changes no text.
 */
const PROSE: Record<string, string> = import.meta.glob(
  ["../../AGENTS.md", "../../AGENTS.ja.md", "../../README.md", "../../README.ja.md"],
  { eager: true, query: "?raw", import: "default" },
);

const SOURCES = [TASKS, DOCS, DECISIONS, MILESTONES, FILED, PROSE];

/**
 * CommonMark's own two classes. Punctuation is `P` plus `S` rather than ASCII punctuation, because the
 * characters that break these bodies — `。`「」（）— are none of them ASCII, and an ASCII-only class would
 * pass every site this repository actually writes.
 */
const WHITESPACE = /[\t\n\r\f\v\p{Zs}\u2028\u2029]/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || WHITESPACE.test(character);
}

function isPunctuation(character: string | undefined): boolean {
  return character !== undefined && PUNCTUATION.test(character);
}

/** CommonMark left-flanking, over a delimiter occupying [at, at + 2). */
function canOpen(body: string, at: number): boolean {
  const before = body[at - 1];
  const after = body[at + 2];
  if (isWhitespace(after)) {
    return false;
  }
  return !isPunctuation(after) || isWhitespace(before) || isPunctuation(before);
}

/** CommonMark right-flanking, over a delimiter occupying [at, at + 2). */
function canClose(body: string, at: number): boolean {
  const before = body[at - 1];
  const after = body[at + 2];
  if (isWhitespace(before)) {
    return false;
  }
  return !isPunctuation(before) || isWhitespace(after) || isPunctuation(after);
}

/**
 * Code replaced by same-length placeholders, so its asterisks stop counting while every offset outside it
 * stays where it was. `src/**` in a path is the form that makes this necessary.
 */
function maskCode(body: string): string {
  const blank = (matched: string) => "\u0001".repeat(matched.length);
  return body
    .replace(/^ {0,3}(```+|~~~+)[\s\S]*?^ {0,3}\1[^\n]*$/gm, blank)
    .replace(/(`+)(?:[^`]|(?!\1)`)*?\1/g, blank);
}

function bodyOf(source: string): string {
  if (!source.startsWith("---\n")) {
    return source;
  }
  const end = source.indexOf("\n---\n", 3);
  if (end === -1) {
    return source;
  }
  return source.slice(end + 5);
}

/**
 * Every delimiter in a body, in source order, with a run of four read as a closer and an opener that have
 * collided. Pairing is positional — the first opens, the second closes — because that is what the author
 * wrote. Asking markdown-it which run pairs with which would only report the damage, which is the whole
 * point: the two answers are compared below, and a disagreement is the defect.
 */
function delimiters(body: string): number[] {
  const masked = maskCode(body);
  const found: number[] = [];
  for (const run of masked.matchAll(/\*{2,}/g)) {
    const at = run.index;
    if (run[0].length === 2) {
      found.push(at);
    } else if (run[0].length === 4) {
      found.push(at, at + 2);
    } else {
      throw new Error(`a run of ${run[0].length} asterisks at ${at} is neither one delimiter nor two`);
    }
  }
  return found;
}

function offendingDelimiters(body: string): string[] {
  const positions = delimiters(body);
  const hits: string[] = [];
  positions.forEach((at, index) => {
    const opens = index % 2 === 0;
    if (opens ? !canOpen(body, at) : !canClose(body, at)) {
      hits.push(body.slice(Math.max(0, at - 24), at + 12).replace(/\n/g, "⏎"));
    }
  });
  return hits;
}

/** Asterisks markdown-it gave up on and left in the text — the shape a reader sees as literal `**`. */
function leftoverAsterisks(body: string): string[] {
  const hits: string[] = [];
  for (const token of md.parse(body, {})) {
    if (token.type !== "inline" || !token.children) {
      continue;
    }
    for (const child of token.children) {
      if (child.type === "text" && child.content.includes("**")) {
        hits.push(child.content.slice(0, 60));
      }
    }
  }
  return hits;
}

function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

/** The bold spans the author wrote, read off the source pairing rather than off the render. */
function intendedSpans(body: string): string[] {
  const positions = delimiters(body);
  const spans: string[] = [];
  for (let i = 0; i + 1 < positions.length; i += 2) {
    // A span inside a blockquote carries the continuation line's `>` in the raw slice; that belongs to
    // the quote, not to the span, so it comes off before the slice is rendered for comparison.
    const raw = body.slice(positions[i] + 2, positions[i + 1]).replace(/\n[ \t]*>[ \t]?/g, "\n");
    spans.push(strip(md.renderInline(raw)));
  }
  return spans;
}

/** The bold spans markdown-it produced. A nested run contributes its outermost span and no more. */
function renderedSpans(body: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const piece of md.render(body).matchAll(/<strong>|<\/strong>|[^<]+|<[^>]*>/g)) {
    const text = piece[0];
    if (text === "<strong>") {
      if (depth === 0) {
        buffer = "";
      }
      depth += 1;
    } else if (text === "</strong>") {
      depth -= 1;
      if (depth === 0) {
        spans.push(strip(buffer));
      }
    } else if (depth > 0) {
      buffer += text;
    }
  }
  return spans;
}

function everyBody(): [string, string][] {
  const bodies: [string, string][] = [];
  for (const sources of SOURCES) {
    for (const [path, source] of Object.entries(sources)) {
      bodies.push([path, bodyOf(source)]);
    }
  }
  return bodies;
}

describe("AGENTS 作業上の規約 閉じない太字強調を残さない", () => {
  /**
   * The scan holds its own source set. A glob that resolved to nothing would make every assertion below
   * pass while reading no file at all — the failure `third-party-licenses.test.ts` has already seen once,
   * where an unparseable header left it comparing an empty list against an empty list and agreeing that
   * nothing had gone stale.
   */
  it("reads every file it claims to read", () => {
    expect(Object.keys(TASKS).length).toBeGreaterThanOrEqual(192);
    expect(Object.keys(DOCS).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(DECISIONS).length).toBeGreaterThanOrEqual(38);
    expect(Object.keys(MILESTONES).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(PROSE)).toHaveLength(4);
    expect(everyBody().length).toBeGreaterThanOrEqual(250);
    expect(Object.keys(TASKS).some((path) => path.includes("task-161"))).toBe(true);
    expect(Object.keys(DOCS).some((path) => path.includes("doc-11"))).toBe(true);
    expect(Object.keys(DECISIONS).some((path) => path.includes("decision-30"))).toBe(true);
  });

  it("leaves no delimiter that cannot open or close where it stands", () => {
    const found = everyBody().flatMap(([path, body]) =>
      offendingDelimiters(body).map((hit) => `${path}: ${hit}`),
    );
    expect(found).toEqual([]);
  });

  it("leaves no asterisks markdown-it gave up on", () => {
    const found = everyBody().flatMap(([path, body]) =>
      leftoverAsterisks(body).map((hit) => `${path}: ${hit}`),
    );
    expect(found).toEqual([]);
  });

  /**
   * The assertion the leftover count cannot make. Every bold span markdown-it produces has to be the one
   * the author delimited; where a closer fails and the next opener absorbs it, the count stays at zero
   * and the bolding moves.
   */
  it("bolds exactly the spans the author delimited", () => {
    const moved: string[] = [];
    for (const [path, body] of everyBody()) {
      const want = intendedSpans(body);
      const got = renderedSpans(body);
      if (want.length !== got.length) {
        moved.push(`${path}: ${want.length} delimited spans against ${got.length} rendered`);
        continue;
      }
      want.forEach((span, index) => {
        if (span !== got[index]) {
          moved.push(`${path}: span ${index} is ${got[index]} where ${span} was delimited`);
        }
      });
    }
    expect(moved).toEqual([]);
  });

  /**
   * The three shapes are planted rather than trusted. A predicate that had stopped matching would make
   * the assertions above pass by reading nothing, and these are the forms the tree carried before
   * TASK-161 rewrote them.
   */
  it("sees a closer whose preceding character is punctuation", () => {
    const planted = "**1 値を共有する範囲は入力面である。**同じ入力面に載るフォーム部品は、";
    expect(offendingDelimiters(planted)).toHaveLength(1);
    expect(leftoverAsterisks(planted)).toHaveLength(1);
  });

  it("sees a closer and an opener collided into one run", () => {
    const planted = "控えの群も同じ段階から 1 値を取る。****控えの群**とは、入力欄を持たない領域を指す。";
    expect(offendingDelimiters(planted).length).toBeGreaterThanOrEqual(1);
    expect(leftoverAsterisks(planted)).toHaveLength(1);
  });

  it("sees an opener whose following character is punctuation", () => {
    const planted = "doc-11 には**「優先度の縁の収録条件という縁だけの契約は無い」**と書いた。";
    expect(offendingDelimiters(planted)).toHaveLength(2);
    expect(leftoverAsterisks(planted)).toHaveLength(1);
  });

  /**
   * TASK-152's shape, and the reason two assertions run over the tree instead of one. The closer after
   * `。` cannot close, the next opener absorbs it, and the result is a bold run inside a bold run with no
   * asterisk left over — so the leftover check passes and the span check is what fails.
   */
  it("sees emphasis that nested instead of leaving an asterisk behind", () => {
    const planted = "**ラウンド 1: [P2]2・[P3]3。**最も効いたのは**実測日付**の指摘だった。";
    expect(leftoverAsterisks(planted)).toEqual([]);
    expect(offendingDelimiters(planted)).toHaveLength(1);
    expect(intendedSpans(planted)).toHaveLength(2);
    expect(renderedSpans(planted)).toHaveLength(1);
  });

  /**
   * The boundary this file draws, stated as a test rather than left to the header comment. The closer is
   * preceded by `降` rather than by punctuation, so it is right-flanking and the emphasis renders — and
   * the rule's letter still asks for a space after it. Nothing here reports the site.
   */
  it("leaves a closer alone when its preceding character is not punctuation", () => {
    const legal = "**Ubuntu なら 24.04 以降**でビルドできる。";
    expect(offendingDelimiters(legal)).toEqual([]);
    expect(leftoverAsterisks(legal)).toEqual([]);
    expect(renderedSpans(legal)).toEqual(intendedSpans(legal));
  });

  it("reads no delimiter inside a code span", () => {
    const legal = "走査の対象は `src/**/*.test.ts` である。";
    expect(delimiters(legal)).toEqual([]);
    expect(offendingDelimiters(legal)).toEqual([]);
  });

  it("reads no delimiter inside a fence", () => {
    const legal = ["```", "grep -o '\\*\\*' **/*.md", "```"].join("\n");
    expect(delimiters(legal)).toEqual([]);
  });
});
