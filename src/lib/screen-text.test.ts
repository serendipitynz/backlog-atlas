/**
 * doc-11 §8 画面に置く文 as a check over the source, not as a one-time sweep.
 *
 * TASK-79 removed 89 設計文書参照 from the screen. Without something that fails, the next screen to
 * gain a sentence gains a `（doc-N §X）` with it — that is how all 89 arrived, one contract-writing
 * session at a time. §8's other three kinds (状態の言い換え・設計文の写し・発行手段の記述) need a
 * reader's judgment and stay in review; this one is decidable from the text alone, so it is the one
 * a test can hold.
 *
 * **Scope is what a user reads.** Code comments are excluded deliberately: they cite doc sections on
 * purpose, and reducing *those* is TASK-107. That makes the comment stripping below part of the
 * contract rather than an implementation detail — a stripper that swallowed too much would pass this
 * file by testing nothing, so `finds a reference planted in a screen string` plants one and requires
 * the scan to see it — including one sitting after a URL, since the `//` in `https://` is the one
 * sequence that looks like a comment start and is not.
 *
 * `DESIGN_REFERENCE` requires the `§`, so a bare `doc-1` stays legal (it is a Backlog 文書 id) and
 * prose like「doc-5 の非空全置換」would pass. That is the deliberate trade: 文書 id reach real screen
 * text, section numbers do not.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason `wire-fixture.test.ts`
 * gives: `node:fs` would pull in `@types/node`, and the dependency budget is `jsdom` alone. The glob
 * also makes the scanned set observable, which the first test uses.
 */
import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../**/*.{ts,svelte}", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** `doc-N §X` and `decision-N`. A bare `doc-1` is a Backlog 文書 id and stays legal. */
const DESIGN_REFERENCE = /doc-\d+\s*§|decision-\d+/;

/**
 * A `major.minor.patch` spelled out. Requires all three parts and the `v`, so `doc-11 §2.4`, `-a ""`
 * and prose like「2 件目」stay legal, and so does a version arriving through `${…}` interpolation —
 * which is the only way one is allowed on screen (decision-27 §2).
 */
const SPELLED_VERSION = /v\d+\.\d+\.\d+/;

/** Not screen text: the recorded-payload helpers and every test file. */
const SKIPPED = /\.test\.|\/fixtures\.ts$|\/fake-boundary\.ts$/;

/** Blank out everything a user never reads, keeping line numbers so failures can name a line. */
function screenText(source: string, svelte: boolean): string[] {
  const blank = (match: string) => "\n".repeat((match.match(/\n/g) ?? []).length);
  // Neutralise `https://` before the comment pass: its `//` starts no comment, and stripping from
  // there would blank any reference later on the line — silently shrinking what this file checks.
  let text = source.replace(/https?:\/\//g, "https__");
  if (svelte) {
    text = text.replace(/<!--[\s\S]*?-->/g, blank);
    text = text.replace(/<style[\s\S]*?<\/style>/g, blank);
  }
  text = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  // Only a `//` that is not inside a string literal. Anchored on a prefix with no quote or backtick.
  text = text.replace(/^([^"'`\n]*?)\/\/.*$/gm, "$1");
  return text.split("\n");
}

describe("画面に置く文 (doc-11 §8)", () => {
  const scanned = Object.keys(SOURCES)
    .filter((path) => !SKIPPED.test(path))
    .sort();

  it("scans every screen source, so the check cannot pass by finding nothing", () => {
    expect(scanned.length).toBeGreaterThan(20);
    // Suffixes, not whole keys: the glob resolves same-directory files as `./manage.ts` and the rest
    // as `../components/…`, and which side of that a file lands on is not what this test is about.
    for (const name of [
      "/components/ProjectDetail.svelte",
      "/components/TaskDetail.svelte",
      "/manage.ts",
      "/App.svelte",
    ]) {
      expect(scanned.some((path) => path.endsWith(name))).toBe(true);
    }
  });

  it("carries no 設計文書参照 anywhere a user reads", () => {
    const found: string[] = [];
    for (const path of scanned) {
      screenText(SOURCES[path], path.endsWith(".svelte")).forEach((line, index) => {
        if (DESIGN_REFERENCE.test(line)) found.push(`${path}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it("finds a reference planted in a screen string", () => {
    // The mutation the check exists to catch, run against the stripper rather than trusted.
    const planted = 'export const NOTE = "台帳は読み取り専用です（doc-3 §2.2）。";\n';
    expect(screenText(planted, false).some((line) => DESIGN_REFERENCE.test(line))).toBe(true);
    const afterUrl = "<p>詳細は https://example.com を参照（doc-3 §2.2）。</p>\n";
    expect(screenText(afterUrl, true).some((line) => DESIGN_REFERENCE.test(line))).toBe(true);
  });

  it("leaves code comments alone, in both comment forms and in both file types", () => {
    const line = "  // 台帳読取専用 (doc-3 §2.2) is the 上部帯 ③.\n";
    const block = "/**\n * 破棄前確認 (doc-8 §6.3) は 5 経路。\n */\n";
    const markup = "<!-- 一覧見出し行 (doc-10 §1) -->\n<p>文書はありません。</p>\n";
    for (const [source, svelte] of [
      [line, false],
      [block, false],
      [markup, true],
    ] as const) {
      expect(screenText(source, svelte).some((text) => DESIGN_REFERENCE.test(text))).toBe(false);
    }
  });

  // --- 版表記 (doc-11 §8 設計文の写し, decision-27 §2) -------------------------------------------
  //
  // The second kind decidable from the text alone. Screen text names no 動作確認済み版: the version in
  // 「v1.48.0 の CLI に空集合化の手段がないため」 pointed at the doc's measurement, not at the user's
  // situation, and the same sentence is shown while `CliReadiness` is still `null` — so no version can
  // be named truthfully there. There is **no legal exception** to scan around: the one sentence that
  // does carry a version (the unsupported CLI 縮退 band) interpolates `readiness.version` and
  // `readiness.minimum`, so it spells no literal.
  it("names no 動作確認済み版 anywhere a user reads", () => {
    const found: string[] = [];
    for (const path of scanned) {
      screenText(SOURCES[path], path.endsWith(".svelte")).forEach((line, index) => {
        if (SPELLED_VERSION.test(line)) found.push(`${path}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it("finds a version planted in a screen string", () => {
    const planted = 'export const R = "最後の 1 件は消せません（v1.48.0 の CLI に手段が無いため）";\n';
    expect(screenText(planted, false).some((line) => SPELLED_VERSION.test(line))).toBe(true);
    const markup = "<p>v1.48.0 の改称は id を変えません。</p>\n";
    expect(screenText(markup, true).some((line) => SPELLED_VERSION.test(line))).toBe(true);
    // The legal shape stays legal: the difference between two versions, read off the payload.
    const interpolated = "  return `backlog CLI ${r.version} は範囲外（必要: ${r.minimum} 以上）`;\n";
    expect(screenText(interpolated, false).some((line) => SPELLED_VERSION.test(line))).toBe(false);
  });
});
