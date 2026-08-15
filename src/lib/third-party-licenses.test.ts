/**
 * One 出荷物の契約 (TASK-159): whether `THIRD-PARTY-LICENSES.txt` still describes the dependencies
 * this tree resolves.
 *
 * The notice that ships inside a bundle is generated from the two lockfiles by
 * `scripts/generate-third-party-licenses.mjs` and committed, because `tauri.conf.json` lists it
 * under `bundle.resources` — a resource that only exists on a CI runner breaks `pnpm tauri build`
 * for anyone following README's "Building from source". Committing it is what creates the failure
 * this file exists to catch: a dependency moves, nobody re-runs the generator, and the bundle ships
 * a notice describing the previous tree. Nothing about that is visible in a diff, and no other test
 * reads either lockfile.
 *
 * Re-running the generator here is not an option: it needs a populated `node_modules`, a cargo
 * registry cache holding every crate for five target triples, and the network to fill them. So the
 * generator records a digest of each of its in-repo inputs in the file's own header, and this
 * compares those against the inputs as they are now. That covers a dependency bump (either
 * lockfile), an edit to the vendored notices, a new or changed standard licence text, and a change
 * to the generator itself — the last one because a change to how the output is shaped stales it
 * just as surely as a change to what goes into it.
 *
 * Files come through `import.meta.glob` rather than `node:fs`, for the reason
 * `wire-fixture.test.ts` gives: `node:fs` would pull in `@types/node`, and the dependency budget is
 * `jsdom` alone. Hashing therefore goes through Web Crypto, which is a global rather than an
 * import. That the digests match at all is also what proves `?raw` hands back the bytes on disk
 * unaltered — a transformed read would fail every one of them at once.
 *
 * No DOM here, so this runs in the `node` project.
 */

import { describe, expect, it } from "vitest";

const OUTPUT_KEY = "../../THIRD-PARTY-LICENSES.txt";

/**
 * The generated notice and every in-repo input it is generated from. The set is spelled here as
 * well as in the generator, and the first test below fails when the two stop agreeing — otherwise
 * an input added to the generator would be recorded in the header and never checked against
 * anything.
 */
const FILES: Record<string, string> = import.meta.glob(
  [
    "../../THIRD-PARTY-LICENSES.txt",
    "../../scripts/generate-third-party-licenses.mjs",
    "../../pnpm-lock.yaml",
    "../../src-tauri/Cargo.lock",
    "../../THIRD-PARTY-NOTICES.md",
    "../../scripts/spdx/*.txt",
  ],
  { eager: true, query: "?raw", import: "default" },
);

const NOTICES_KEY = "../../THIRD-PARTY-NOTICES.md";
const GENERATED = FILES[OUTPUT_KEY];

const pathOf = (key: string) => key.replace("../../", "");
const keyOf = (path: string) => `../../${path}`;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The generator's own normalization, so a comparison against a source file is like for like. */
const normalize = (text: string) =>
  text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+$/, "");

/**
 * The `  <path>  sha256 <digest>` lines the generator writes into the header.
 *
 * Empty is an error rather than a result. A parser that matches nothing would otherwise leave the
 * staleness test comparing an empty list against an empty list and passing — which is what a CRLF
 * checkout produced before `.gitattributes` existed: the one check that reads every input agreed
 * that nothing had gone stale, having read none of them.
 */
function recordedInputs(): Map<string, string> {
  const recorded = new Map<string, string>();
  for (const line of GENERATED.split("\n")) {
    const match = line.match(/^ {2}(\S+) +sha256 ([0-9a-f]{64})$/);
    if (match) {
      recorded.set(match[1], match[2]);
    }
    if (line.startsWith("SECTION 1")) {
      break;
    }
  }
  if (recorded.size === 0) {
    throw new Error(
      "THIRD-PARTY-LICENSES.txt records no input digests in its header. Either it was not written " +
        "by scripts/generate-third-party-licenses.mjs, or the checkout altered it — see the line-ending test below.",
    );
  }
  return recorded;
}

describe("THIRD-PARTY-LICENSES.txt", () => {
  /**
   * The digests are over the bytes on disk, so the whole scheme rests on every checkout producing
   * the same bytes — which is `.gitattributes`' `eol=lf`, against git's default core.autocrlf=true
   * on Windows. This is what fails when that pin stops working: a converted checkout changes all
   * nine digests at once and leaves the header unparseable, and the tests below would then be
   * reporting on a file nobody wrote.
   */
  it("holds its inputs and itself as LF, which is what makes the digests reproducible", () => {
    const converted = Object.entries(FILES)
      .filter(([, text]) => text.includes("\r"))
      .map(([key]) => pathOf(key));

    expect(
      converted,
      "these files were checked out with converted line endings, so their bytes are not the ones " +
        "THIRD-PARTY-LICENSES.txt was generated over. Confirm .gitattributes is present and re-clone " +
        "(or `git add --renormalize .`).",
    ).toEqual([]);
  });

  it("records a digest for every input this test can see, and no other", () => {
    const expected = Object.keys(FILES)
      .filter((key) => key !== OUTPUT_KEY)
      .map(pathOf)
      .sort();

    expect([...recordedInputs().keys()].sort()).toEqual(expected);
  });

  it("was generated from the inputs as they are now", async () => {
    const stale: string[] = [];
    for (const [path, digest] of recordedInputs()) {
      const source = FILES[keyOf(path)];
      expect(source, `${path} is recorded in the notice but missing from this test's glob`).toBeTypeOf("string");
      if ((await sha256(source)) !== digest) {
        stale.push(path);
      }
    }

    expect(
      stale,
      "THIRD-PARTY-LICENSES.txt no longer describes this tree. Regenerate it: " +
        "`pnpm install`, then `cargo fetch --manifest-path src-tauri/Cargo.toml` for the four " +
        "release targets, then `node scripts/generate-third-party-licenses.mjs`, and commit the result.",
    ).toEqual([]);
  });

  /**
   * AC #3's contract, held by construction rather than by a rule at bundling time: the generated
   * inventory opens with the hand-written notices reproduced in full, so there is no arrangement in
   * which the lockfile-derived list ships and Ace's and Lucide's notices do not.
   */
  it("reproduces THIRD-PARTY-NOTICES.md in full as its first section", () => {
    const body = GENERATED.split(/^SECTION 2 — NPM PACKAGES /m)[0];
    const section = body.split(/^SECTION 1 — .*\n=+\n/m)[1];

    expect(section).toBeTypeOf("string");
    expect(normalize(section)).toContain(normalize(FILES[NOTICES_KEY]));
  });
});
