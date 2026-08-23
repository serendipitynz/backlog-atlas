/**
 * decision-41's one machine-checkable half, over every hand-written source in the tree: the sections,
 * decisions, identifiers and paths a code comment names have to exist.
 *
 * A comment's attribution is the whole reason decision-41 keeps `doc-N §X` in code where doc-11 §8
 * bans it on screen — the reader of this tree can open the document. That is only true while the
 * reference resolves, and nothing else in the repository notices when it stops: a section renumbered
 * by the next task, a decision superseded, a function renamed, leave the citation behind unchanged.
 * TASK-169 measured what that costs elsewhere — six of the twenty-one `_sandbox/` paths in
 * `backlog/` were already dead, five of them broken by one session — and code comments carry
 * 3,800 lines of the same kind of reference (measured 2026-08-23).
 *
 * ## What this does not hold
 *
 * **Whether a comment re-describes a contract.** decision-41's other half has no machine check, on
 * purpose: the sentence that must fall and the sentence that must stay are written with the same
 * predicate — both are a "why" — so anything counted by wording counts the wrong set. Review holds
 * it. **A clean run here is not decision-41 met.**
 *
 * Three more shapes pass, and each was demonstrated rather than assumed:
 *
 * - **A name written as prose rather than as a link.** The identifier arm reads only the rustdoc /
 *   JSDoc form ``[`X`]``, which is a claim that `X` exists in this project. A bare `` `X` `` names
 *   anything — `SetWindowPos`, `waitpid`, `reqwest`, markdown-it's own `validateLink` — and the arm
 *   would need a list of every external name to tell those apart, which is a list that rots faster
 *   than the citations it guards. Measured 2026-08-23: 807 links, and widening to bare backticks
 *   adds 60 names of which 57 are external.
 * - **A renamed identifier that still exists somewhere else in the tree.** The arm asks whether the
 *   name appears in any source, not whether it appears where the comment implies. Moving
 *   `omitsSentence` from `manage.ts` to another module keeps every comment naming it green.
 * - **A citation of a section that exists but says something else.** `doc-7 §4` resolves whether or
 *   not §4 is about what the comment claims; renumbering that keeps the count of sections intact
 *   passes.
 * - **A bare `§N` charged to the wrong doc.** A section binds to the doc named to its left, which is
 *   this repository's own reading convention, so a comment naming doc-11 and then meaning doc-10 §4.1
 *   is checked against doc-11 and passes when doc-11 happens to have a §4.1.
 * - **An id written inside a code span.** Those are stripped before scanning, because the tree
 *   discusses ids as values (`read.rs` explains folding an outside file into the id `doc-404`;
 *   `id_order.rs` compares the spellings `doc-01` and `doc-1`). Stripping is what makes those four
 *   sites legal, and it is also why a real citation must not be written in backticks.
 *
 * Test sources are in scope, not excluded: they carry 458 doc-section citations of their own
 * (measured 2026-08-23) and nothing else watches those.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason
 * `third-party-licenses.test.ts` gives: `node:fs` would pull in `@types/node`, and the dependency
 * budget is `jsdom` alone.
 *
 * No DOM here, so this runs in the `node` project.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob(
  [
    "../**/*.ts",
    "../**/*.svelte",
    "../../src-tauri/src/**/*.rs",
    "../../scripts/**/*.mjs",
  ],
  { eager: true, query: "?raw", import: "default" },
);

/**
 * Every file the tree carries, as names only — the modules are never imported, so this costs a
 * directory listing rather than a parse. It is a wider set than `SOURCES` on purpose: a comment may
 * name a test, a stylesheet, a workflow or a config, and all of those are things that get renamed.
 */
const TREE: Record<string, unknown> = import.meta.glob(
  [
    "../../src/**/*",
    "../../src-tauri/src/**/*",
    "../../src-tauri/*.json",
    "../../src-tauri/wire-fixtures/*.json",
    "../../src-tauri/*.toml",
    "../../scripts/**/*",
    "../../backlog/*.yml",
    "../../.github/workflows/*.yml",
    "../../*.ts",
    "../../*.js",
    "../../*.json",
    "../../*.html",
    "../../*.toml",
  ],
  { eager: false },
)

/**
 * Every path the tree carries, repo-relative. The glob keys are relative to *this* file, so they
 * have to be resolved against `src/lib` — stripping the leading `../` instead turns
 * `../components/X.svelte` into `components/X.svelte`, which then matches nothing a comment writes.
 */
function repoRelative(key: string): string {
  const parts = "src/lib".split("/")
  for (const segment of key.split("/")) {
    if (segment === "..") {
      parts.pop()
    } else if (segment !== "." && segment !== "") {
      parts.push(segment)
    }
  }
  return parts.join("/")
}

const PATHS = Object.keys(TREE).map(repoRelative)

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

/**
 * Files a comment may name that the tree does not contain, each for a stated reason. Listed rather
 * than pattern-matched so that adding one means saying which reason it has — the same shape
 * `manage.ts` uses for `omitsSentence`, and for the same purpose.
 */
const NAMEABLE_ELSEWHERE = new Map<string, string>([
  ["projects.toml", "written at runtime into the アプリ設定ディレクトリ, never into the tree"],
  ["settings.toml", "written at runtime into the アプリ設定ディレクトリ, never into the tree"],
  [".window-state.json", "written at runtime by tauri-plugin-window-state (decision-38)"],
  ["defaultAttributes.mjs", "a file inside the lucide-react package (decision-25 の 図形の出どころ)"],
  ["dist/esm/defaultAttributes.mjs", "the same file, named by its path inside that package"],
  ["menu.mjs", "a lucide-react icon module"],
  ["circle-help.mjs", "a lucide-react icon module"],
]);

interface Comment {
  readonly file: string;
  readonly line: number;
  /** Which run of adjacent comment lines this belongs to — the unit a §N's document binding spans. */
  readonly block: number;
  readonly text: string;
}

/**
 * A line counts as a comment when its first non-space characters open one. That misses a trailing
 * comment after code, and takes a string that begins a line with `//` — the first loses citations
 * this check would otherwise hold, the second reports one that is not a citation. Both were measured
 * at zero over the tree on 2026-08-23; the rule stays this shape because a real tokenizer for three
 * languages is a dependency, and the miss is in the direction of reporting less rather than
 * inventing more.
 */
function comments(file: string, body: string): Comment[] {
  const found: Comment[] = []
  const lines = body.split("\n")
  let open: "block" | "html" | null = null
  let block = 0
  let previous = -2
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    let text: string | null = null
    if (open === "block") {
      text = trimmed.replace(/^\*+\s?/, "").replace(/\*\/\s*$/, "")
      if (trimmed.includes("*/")) {
        open = null
      }
    } else if (open === "html") {
      // Every line until the close, not just the opener: `Icon.svelte`'s four-line one carries two
      // citations below its first line, and taking the opener alone let those two rot unwatched.
      text = trimmed.replace(/-->\s*$/, "")
      if (trimmed.includes("-->")) {
        open = null
      }
    } else if (trimmed.startsWith("/*")) {
      text = trimmed.replace(/^\/\*+\s?/, "").replace(/\*\/\s*$/, "")
      if (!trimmed.includes("*/")) {
        open = "block"
      }
    } else if (trimmed.startsWith("//")) {
      text = trimmed.replace(/^\/\/[/!]?\s?/, "")
    } else if (trimmed.startsWith("<!--")) {
      text = trimmed.replace(/^<!--\s?/, "").replace(/-->\s*$/, "")
      if (!trimmed.includes("-->")) {
        open = "html"
      }
    }
    if (text !== null) {
      if (i !== previous + 1) {
        block++
      }
      previous = i
      found.push({ file, line: i + 1, block, text })
    }
  }
  return found
}

/** Ids and names inside a code span are values under discussion, not references. */
function withoutCodeSpans(text: string): string {
  return text.replace(/`[^`\n]*`/g, " ")
}

function docId(path: string): string | null {
  const m = /\/(doc-\d+)\b/.exec(path)
  return m ? m[1] : null
}

const SECTIONS = new Map<string, Set<string>>()
for (const [path, body] of Object.entries(DOCS)) {
  const id = docId(path)
  if (id === null) {
    continue
  }
  const numbers = new Set<string>()
  for (const line of body.split("\n")) {
    const heading = /^#{2,6}\s+(\d+(?:\.\d+)*)\.?\s/.exec(line)
    if (heading) {
      numbers.add(heading[1])
    }
  }
  SECTIONS.set(id, numbers)
}

const DECISION_IDS = new Set(
  Object.keys(DECISIONS)
    .map((path) => /\/(decision-\d+)\b/.exec(path)?.[1])
    .filter((id): id is string => id !== undefined),
)

const ALL_COMMENTS: Comment[] = Object.entries(SOURCES).flatMap(([path, body]) =>
  comments(repoRelative(path), body),
)

/**
 * The sources with their comment lines removed. **Comments must not be in here**: with them in, a
 * name planted in a comment satisfies its own citation, and the arm below cannot fail at all — which
 * is what the first mutation of it showed (a fabricated identifier passed).
 */
const CODE_TEXT = Object.entries(SOURCES)
  .map(([path, body]) => {
    const commented = new Set(comments(path, body).map((c) => c.line))
    return body
      .split("\n")
      .filter((_, index) => !commented.has(index + 1))
      .join("\n")
  })
  .join("\n")



/** Every basename among them, so a comment may name a file by its name alone. */
const BASENAMES = new Set(PATHS.map((path) => path.split("/").pop() ?? path))

describe("code comments cite things that exist", () => {
  it("reads the whole tree", () => {
    // Guards the globs themselves: a pattern that stops matching answers "no bad citation" for the
    // same reason an empty tree would. TASK-184's [P2] was exactly this shape, one branch down.
    expect(SECTIONS.size).toBeGreaterThan(10)
    expect(DECISION_IDS.size).toBeGreaterThan(30)
    expect(ALL_COMMENTS.length).toBeGreaterThan(3_000)
    expect(Object.keys(TREE).length).toBeGreaterThan(Object.keys(SOURCES).length)
    // Each language separately: one glob going quiet is the failure this guards, and a total would
    // hide it behind the other three.
    for (const [ext, floor] of [
      [".ts", 90],
      [".svelte", 40],
      [".rs", 20],
      [".mjs", 3],
    ] as const) {
      expect(Object.keys(SOURCES).filter((path) => path.endsWith(ext)).length).toBeGreaterThanOrEqual(floor)
    }
  })

  it("names a doc that exists, and a section that doc has", () => {
    const bad: string[] = []
    // Walked left to right rather than matched as one pattern, because a §N binds to the doc named to
    // its left whatever sits between them: `doc-9 §4.2 照合不能 / §3 継続検出停止` names two sections
    // of doc-9, and a pattern requiring them adjacent checked the first and skipped the second.
    // `decision-N` and AGENTS take no §, so meeting one clears the binding — otherwise a §N belonging
    // to neither would be charged to whichever doc was last mentioned.
    //
    // **A 対応表's header row binds its own rows, and nothing else spans lines.** Several tables name
    // their document once in the header (`| doc-10 | here | is |`) and give every row a bare §N —
    // `project-detail.ts` is thirty rows under one such header, and none of them was checked while the
    // binding reset per line. **Prose is deliberately not treated the same way**: carrying the binding
    // across prose lines was tried and produced six false positives, every one a bare §N whose document
    // was named earlier in the block while a *different* one was named more recently
    // (`lucide.ts`'s `§2.4` is doc-11's, three docs after doc-11 was last written). The tree's
    // convention is "the document this sentence is about", which no scanner can resolve; a table row's
    // is "the one in the header", which it can. **So a bare §N in prose is unchecked.**
    let current: string | null = null
    let tableDoc: string | null = null
    let block = -1
    for (const comment of ALL_COMMENTS) {
      if (comment.block !== block) {
        tableDoc = null
        block = comment.block
      }
      const trimmed = comment.text.trim()
      const header = /^\|\s*(doc-\d+)\b[^|]*\|/.exec(trimmed)
      if (header !== null && SECTIONS.has(header[1])) {
        tableDoc = header[1]
      }
      current = trimmed.startsWith("|") ? tableDoc : null
      for (const hit of withoutCodeSpans(comment.text).matchAll(
        /\bdoc-(\d+)\b|\bdecision-\d+\b|\bAGENTS\b|§\s*(\d+(?:\.\d+)*)/g,
      )) {
        if (hit[1] !== undefined) {
          const id = `doc-${hit[1]}`
          if (SECTIONS.has(id)) {
            current = id
          } else {
            bad.push(`${comment.file}:${comment.line} names ${id}, which is not a document`)
            current = null
          }
        } else if (hit[2] === undefined) {
          current = null
        } else if (current !== null && !SECTIONS.get(current)?.has(hit[2])) {
          bad.push(`${comment.file}:${comment.line} names ${current} §${hit[2]}, which that document has no heading for`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it("names a decision that exists", () => {
    const bad: string[] = []
    for (const comment of ALL_COMMENTS) {
      for (const hit of withoutCodeSpans(comment.text).matchAll(/\bdecision-(\d+)\b/g)) {
        if (!DECISION_IDS.has(`decision-${hit[1]}`)) {
          bad.push(`${comment.file}:${comment.line} names decision-${hit[1]}, which does not exist`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it("names a file the tree carries, or one of the files listed as living elsewhere", () => {
    const bad: string[] = []
    for (const comment of ALL_COMMENTS) {
      for (const hit of comment.text.matchAll(/`(\w[\w./-]*\.(?:ts|svelte|rs|mjs|json|scss|toml|yml|html))`/g)) {
        const named = hit[1]
        if (NAMEABLE_ELSEWHERE.has(named)) {
          continue
        }
        // **A citation carrying a directory is checked whole.** Matching such a one by basename would
        // accept `src/lib/wire-fixture.test.ts` after the file moved to another directory — the
        // citation's whole point is where to look. Only a bare filename falls back to the basename,
        // because it claims no location.
        const ok = named.includes("/")
          ? PATHS.some((path) => path === named || path.endsWith(`/${named}`))
          : BASENAMES.has(named) || NAMEABLE_ELSEWHERE.has(named)
        if (!ok) {
          bad.push(`${comment.file}:${comment.line} names ${named}, which is neither in the tree nor listed`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it("links to an identifier that exists", () => {
    // Only the rustdoc / JSDoc link form. It is the form the 対応表 rows use, and the one that
    // asserts the name is this project's — which is what makes it checkable without a list of
    // every external symbol the prose is allowed to mention.
    const bad: string[] = []
    let links = 0
    for (const comment of ALL_COMMENTS) {
      for (const hit of comment.text.matchAll(/\[`([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)(?:\(\))?`\]/g)) {
        links++
        const last = hit[1].split("::").pop() ?? hit[1]
        if (!new RegExp(`\\b${last}\\b`).test(CODE_TEXT)) {
          bad.push(`${comment.file}:${comment.line} links to ${hit[1]}, which no source declares`)
        }
      }
    }
    expect(bad).toEqual([])
    // The pattern's own guard: a link form that stopped matching would report no bad link for the
    // same reason a tree with no comments would.
    expect(links).toBeGreaterThan(500)
  })
})
