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
 * find. The tree carried exactly one (TASK-152's notes), and the span assertion below is what sees it —
 * which is why this file checks the spans and not only the asterisks.
 *
 * **What this holds is the rendering condition, and the rule's letter is wider.** «閉じる `**` の後に文が
 * 続くなら半角スペース» is written without a condition; the punctuation is the reason, not the scope. Held
 * to the letter, `**Ubuntu なら 24.04 以降**で` violates it while rendering correctly, and the tree has 3,454
 * such sites (measured 2026-08-19 over the three directories: 1,574 in tasks, 1,325 in docs, 555 in
 * decisions, plus 64 in the four prose files). Rewriting them is a different piece of work from this one,
 * so **a clean run here is not proof the rule's letter is met** — TASK-161's AC named the rendering count
 * and that is the boundary this file draws. Do not read the pass as covering the wider claim; TASK-194
 * decides whether those 3,454 count as defects, and until it does the letter still binds newly written
 * prose.
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
import { bodyView } from "./markdown";

/**
 * A bare instance, where `markdown.ts` builds one with `html: false`, `linkify: true` and four custom
 * rules. Emphasis pairing is the same under both — none of those rules touches the delimiter stack — but
 * that is asserted rather than promised: "agrees with the app's renderer about every bold run" below
 * renders each body through `bodyView` too and compares. So a change to `markdown.ts` that did move
 * emphasis fails here instead of quietly leaving this file describing a renderer the app stopped using.
 */
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
  ["../../backlog/drafts/*.md", "../../backlog/completed/*.md", "../../backlog/archive/**/*.md"],
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
 * pass every site this repository actually writes. Whitespace is `Zs` plus the five ASCII controls the
 * spec names, and deliberately not `Zl`/`Zp`: the spec's list does not include them.
 */
const WHITESPACE = /[ \t\n\v\f\r\p{Zs}]/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

/** Same-length stand-in for masked code. Not a character any managed body contains. */
const MASK = String.fromCharCode(1);

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || WHITESPACE.test(character);
}

function isPunctuation(character: string | undefined): boolean {
  return character !== undefined && PUNCTUATION.test(character);
}

/**
 * One `**` inside a run of asterisks. `at` is where those two characters sit — the boundary a bold span
 * starts or ends at — while `runStart`/`runLength` describe the whole run, which is what flanking is
 * judged on: markdown-it takes a maximal sequence of asterisks as one delimiter run, so the characters
 * that decide whether it can open or close are the ones outside the run, never the asterisks beside it.
 */
type Delimiter = { at: number; runStart: number; runLength: number };

/** CommonMark left-flanking, judged on the run the delimiter belongs to. */
function canOpen(body: string, delimiter: Delimiter): boolean {
  const before = body[delimiter.runStart - 1];
  const after = body[delimiter.runStart + delimiter.runLength];
  if (isWhitespace(after)) {
    return false;
  }
  return !isPunctuation(after) || isWhitespace(before) || isPunctuation(before);
}

/** CommonMark right-flanking, judged on the run the delimiter belongs to. */
function canClose(body: string, delimiter: Delimiter): boolean {
  const before = body[delimiter.runStart - 1];
  const after = body[delimiter.runStart + delimiter.runLength];
  if (isWhitespace(before)) {
    return false;
  }
  return !isPunctuation(before) || isWhitespace(after) || isPunctuation(after);
}

/**
 * Code replaced by same-length stand-ins, so its asterisks stop counting while every offset outside it
 * stays where it was. A `src` glob written into prose is the form that makes this necessary.
 *
 * **Blocks are masked from markdown-it's own tokens rather than by a regex**, which is what makes an
 * indented (four-space) block count: `backlog/tasks/` already holds two, and a glob inside one would
 * otherwise add a delimiter markdown-it never saw. Because pairing is positional, one extra delimiter
 * flips the open/close role of every later one in that file, so the cost of missing a block is a long
 * list of hits pointing at delimiters that are not wrong.
 *
 * Inline spans still need a regex — an inline token carries no source offset — and a match spanning a
 * blank line is left alone: a code span cannot cross a block boundary, so two stray backticks in
 * separate paragraphs are not one span, and masking between them would swallow real delimiters.
 */
function maskCode(body: string): string {
  const lines = body.split("\n");
  const starts = [0];
  for (const line of lines) {
    starts.push(starts[starts.length - 1] + line.length + 1);
  }
  const blank = (text: string) => text.replace(/[^\n]/g, MASK);
  let masked = body;
  for (const token of md.parse(body, {})) {
    if ((token.type !== "fence" && token.type !== "code_block") || !token.map) {
      continue;
    }
    const from = Math.min(starts[token.map[0]], body.length);
    const to = Math.min(starts[token.map[1]], body.length);
    masked = masked.slice(0, from) + blank(masked.slice(from, to)) + masked.slice(to);
  }
  return masked.replace(/(`+)(?:[^`]|(?!\1)`)*?\1/g, (span) =>
    /\n[ \t]*\n/.test(span) ? span : blank(span),
  );
}

/**
 * Every delimiter in a body, in source order. Pairing is positional — the first opens, the second closes
 * — because that is what the author wrote. Asking markdown-it which run pairs with which would only
 * report the damage, which is the whole point: the two answers are compared below, and a disagreement is
 * the defect.
 *
 * A run of any length contributes the `**` pairs it holds, so `***強調***` (legal CommonMark: bold inside
 * italic) and a longer run are read rather than refused. Pairing runs over the whole body rather than per
 * block: a table cell's inline token carries no source map, so a per-block scheme would silently skip
 * every cell, and alternation across a block boundary is harmless while each block holds an even count.
 * The even-count and span assertions are what make that assumption fail loudly if one ever does not.
 */
function delimiters(body: string): Delimiter[] {
  const masked = maskCode(body);
  const found: Delimiter[] = [];
  for (const run of masked.matchAll(/\*{2,}/g)) {
    const runStart = run.index;
    const runLength = run[0].length;
    for (let offset = 0; offset + 2 <= runLength; offset += 2) {
      found.push({ at: runStart + offset, runStart, runLength });
    }
  }
  return found;
}

function offendingDelimiters(body: string): string[] {
  const hits: string[] = [];
  delimiters(body).forEach((delimiter, index) => {
    const opens = index % 2 === 0;
    if (opens ? !canOpen(body, delimiter) : !canClose(body, delimiter)) {
      hits.push(body.slice(Math.max(0, delimiter.at - 24), delimiter.at + 12).replace(/\n/g, "⏎"));
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
    // the quote, not to the span's text, so it comes off before the slice is rendered for comparison.
    const raw = body.slice(positions[i].at + 2, positions[i + 1].at).replace(/\n[ \t]*>[ \t]?/g, "\n");
    spans.push(strip(md.renderInline(raw)));
  }
  return spans;
}

/** The bold spans a render produced. A nested run contributes its outermost span and no more. */
function renderedSpans(html: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const piece of html.matchAll(/<strong>|<\/strong>|[^<]+|<[^>]*>/g)) {
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

  /**
   * Positional pairing needs an even count to mean anything: an odd one silently drops the last
   * delimiter, and the span assertion would then compare a short list against a short list.
   */
  it("finds an even number of delimiters in every body", () => {
    const odd = everyBody()
      .filter(([, body]) => delimiters(body).length % 2 === 1)
      .map(([path]) => path);
    expect(odd).toEqual([]);
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
      const got = renderedSpans(md.render(body));
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
   * What ties this file's bare renderer to the one the screen uses. `markdown.ts` configures markdown-it
   * and adds four rules; none of them touches the delimiter stack, so the two agree — and this is where
   * that stops being an assumption.
   */
  it("agrees with the app's renderer about every bold run", () => {
    const disagreed: string[] = [];
    for (const [path, body] of everyBody()) {
      const view = bodyView(body);
      if (view.kind !== "formatted") {
        disagreed.push(`${path}: the app renderer fell back to verbatim`);
        continue;
      }
      const mine = renderedSpans(md.render(body));
      const theirs = renderedSpans(view.html);
      if (mine.join(" ") !== theirs.join(" ")) {
        disagreed.push(`${path}: ${mine.length} bold runs here against ${theirs.length} in the app`);
      }
    }
    expect(disagreed).toEqual([]);
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
    expect(renderedSpans(md.render(planted))).toHaveLength(1);
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
    expect(renderedSpans(md.render(legal))).toEqual(intendedSpans(legal));
  });

  /**
   * A run of three is bold inside italic, legal CommonMark, and breaks none of the rules above. It is
   * planted because reading runs by the `**` pairs they hold replaced a version that threw on any run
   * other than two or four — and a throw escaping the scan would have reported a character offset with
   * no path, where every assertion here reports the file.
   */
  it("reads a run of three as the bold pair it holds", () => {
    const legal = "この規則は ***強調*** で書く。";
    expect(delimiters(legal)).toHaveLength(2);
    expect(offendingDelimiters(legal)).toEqual([]);
    expect(leftoverAsterisks(legal)).toEqual([]);
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

  /**
   * An indented block, which a fence-only mask would have let through. `backlog/tasks/` already holds
   * two, so this is the form the tree can actually grow, not an exotic one.
   */
  it("reads no delimiter inside an indented code block", () => {
    const legal = ["走査の対象:", "", "    grep -o '**' src/**/*.md", "", "以上。"].join("\n");
    expect(delimiters(legal)).toEqual([]);
  });

  /**
   * Two stray backticks in separate paragraphs are not one code span, so the text between them keeps its
   * delimiters. Masking across the blank line would swallow the broken closer this planted body carries.
   */
  it("does not mask across a blank line between two stray backticks", () => {
    const planted = ["値は ` で囲む。", "", "**これは閉じない。**次の文", "", "終端は ` である。"].join(
      "\n",
    );
    expect(offendingDelimiters(planted)).toHaveLength(1);
    expect(leftoverAsterisks(planted)).toHaveLength(1);
  });
});
