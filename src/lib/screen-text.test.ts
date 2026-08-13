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
 * A `major.minor.patch` spelled out, with or without the `v`. Both forms are forbidden: `CliReadiness`
 * carries the version bare, so a string built around「1.48.0 の CLI に…」would break decision-27 §2
 * while a `v`-only pattern passed it. This is **not** `DESIGN_REFERENCE`'s trade — a bare `doc-1` is a
 * legal Backlog 文書 id and is why that one requires the `§`, whereas no bare version is legal here.
 *
 * All three parts are required and the left boundary excludes a word character or dot, so `doc-11 §2.4`
 * and prose like「2 件目」stay legal. A version arriving through `${…}` interpolation also stays legal —
 * that is the only way one may reach the screen (decision-27 §2).
 */
const SPELLED_VERSION = /(?<![\w.])v?\d+\.\d+\.\d+(?!\w)/;

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

  it("finds a version planted in a screen string, with or without the v", () => {
    const planted = 'export const R = "最後の 1 件は消せません（v1.48.0 の CLI に手段が無いため）";\n';
    expect(screenText(planted, false).some((line) => SPELLED_VERSION.test(line))).toBe(true);
    // Bare, as `CliReadiness` carries it — the form a `v`-only pattern would have let through.
    const bare = 'export const R = "1.48.0 の CLI に空集合化の手段がありません";\n';
    expect(screenText(bare, false).some((line) => SPELLED_VERSION.test(line))).toBe(true);
    const markup = "<p>v1.48.0 の改称は id を変えません。</p>\n";
    expect(screenText(markup, true).some((line) => SPELLED_VERSION.test(line))).toBe(true);
    // The legal shape stays legal: the difference between two versions, read off the payload.
    const interpolated = "  return `backlog CLI ${r.version} は範囲外（必要: ${r.minimum} 以上）`;\n";
    expect(screenText(interpolated, false).some((line) => SPELLED_VERSION.test(line))).toBe(false);
    // A doc section number is not a version: two parts, and the dot-prefixed part must not match.
    const section = '<p title="doc-11 §2.4">アイコンのみ</p>\n';
    expect(screenText(section, true).some((line) => SPELLED_VERSION.test(line))).toBe(false);
  });

  // --- 設計語と画面語 (doc-1 追補, doc-10 §10) ---------------------------------------------------
  //
  // The third kind decidable from the text alone. Some objects have two words: one the design
  // documents settled on, one a user reads. Each split holds only while the design word stays off the
  // screen — a screen carrying both would be asking the reader to decide whether they name the same
  // thing.
  //
  // **A list, because there is more than one such word now.** TASK-118 added the first (意思決定) and
  // recorded that it was the only pair, so naming the one word was cheaper than deriving a rule.
  // TASK-158 made that false: 台帳 and 正本 joined it, and a rule still cannot be derived — the other
  // 管理ファイル nouns (タスク・マイルストーン・文書) have design and screen words that coincide, and
  // nothing to keep apart. What generalises is the *form*, so each entry carries the word together with
  // what a user reads instead, and a failure names both. **The list's home is doc-1's 追補**, which is
  // where a session adding a fourth pair records why — this is a copy of that table's first two columns.
  const DESIGN_ONLY_WORDS = [
    // doc-4 §1 calls one `backlog/decisions/` file 意思決定; the screen uses the word the owner used.
    { word: "意思決定", instead: "決定事項" },
    // doc-3 §1's three words for Atlas's own registry. 台帳 covers all three (プロジェクト台帳・
    // 台帳ファイル・台帳エントリ), so one entry catches every form.
    { word: "台帳", instead: "登録 / 登録内容 / 登録ファイル" },
    // doc-2・doc-3's word for the target project's own Backlog.md files. The screen names the files.
    { word: "正本", instead: "対象を書き下す（管理ファイル・タスク）" },
  ];
  /** The one matcher both tests below use, so the planted mutation exercises what the scan runs. */
  const designOnlyHit = (line: string) => DESIGN_ONLY_WORDS.find((e) => line.includes(e.word));

  /**
   * The crate's sources, scanned by this one check and by nothing else in this file.
   *
   * **A user reads Japanese that this crate builds**, not only Japanese from the frontend:
   * `editor.rs` hands back its own 失敗の理由 (「アプリ設定の外部エディタ指定・VISUAL・EDITOR のいずれも
   * 設定されていません」and the SE_ERR set), and those are printed beside the control that asked. A word
   * banned from the screen has to be banned there too, or the next such reason may carry it.
   *
   * **Separate from `scanned` on purpose.** The two checks above must not reach this set: `update.rs`'s
   * `MIN_VERSION` is the one legal home for a spelled version (decision-27 §1), so the 版表記 scan would
   * fail on the very constant it exists to protect. `//`-stripping is shared — Rust's `///` and `//!`
   * start with it — but a `//` after a string literal on the same line survives, as in the frontend.
   */
  const CRATE: Record<string, string> = import.meta.glob("../../src-tauri/src/**/*.rs", {
    eager: true,
    query: "?raw",
    import: "default",
  });

  /**
   * The two titles no code builds: the document's (`index.html`) and the native window's
   * (`tauri.conf.json`). Both are read — one in the window frame, one by the OS — and neither is
   * reachable from `SOURCES` or `CRATE`, so without them the scan would pass while a title said
   * プロジェクト台帳. **A title is exactly the string a session would spell out rather than derive**,
   * which is what makes the gap worth closing rather than noting (raised in review on PR #111).
   *
   * Scanned by this check alone, for `CRATE`'s reason turned around: `tauri.conf.json` carries the
   * app `version`, which the 版表記 scan forbids.
   */
  const STATIC_UI: Record<string, string> = import.meta.glob(
    ["../../index.html", "../../src-tauri/tauri.conf.json"],
    { eager: true, query: "?raw", import: "default" },
  );

  it("keeps the 設計語 out of what a user reads", () => {
    const found: string[] = [];
    const sources = { ...SOURCES, ...CRATE, ...STATIC_UI };
    const everywhere = [...scanned, ...Object.keys(CRATE).sort(), ...Object.keys(STATIC_UI).sort()];
    for (const path of everywhere) {
      // `index.html` takes the markup branch for its `<!-- -->`; the JSON has neither form of comment.
      screenText(sources[path], /\.(svelte|html)$/.test(path)).forEach((line, index) => {
        const hit = designOnlyHit(line);
        if (hit !== undefined) {
          found.push(`${path}:${index + 1}: ${hit.word} → ${hit.instead}: ${line.trim()}`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it("scans the crate and both titles too, so nothing a user reads is outside the check", () => {
    expect(Object.keys(CRATE).some((path) => path.endsWith("/editor.rs"))).toBe(true);
    expect(Object.keys(CRATE).length).toBeGreaterThan(5);
    for (const name of ["/index.html", "/tauri.conf.json"]) {
      expect(Object.keys(STATIC_UI).some((path) => path.endsWith(name))).toBe(true);
    }
    // The titles are what the scan is here for, so prove the stripper leaves them readable rather
    // than trusting the glob: a `screenText` that swallowed them would pass by scanning nothing.
    expect(screenText(STATIC_UI[Object.keys(STATIC_UI).find((p) => p.endsWith("/index.html"))!], true)
      .some((line) => line.includes("<title>"))).toBe(true);
    expect(screenText(STATIC_UI[Object.keys(STATIC_UI).find((p) => p.endsWith("/tauri.conf.json"))!], false)
      .some((line) => line.includes('"title"'))).toBe(true);
  });

  it("finds each design word planted in a screen string, and leaves them in comments", () => {
    for (const { word } of DESIGN_ONLY_WORDS) {
      const planted = `export const EMPTY = "${word}はありません。";\n`;
      expect(screenText(planted, false).some((line) => designOnlyHit(line))).toBeTruthy();
      const markup = `<h2>${word} {n} 件</h2>\n`;
      expect(screenText(markup, true).some((line) => designOnlyHit(line))).toBeTruthy();
      // Comments keep them: they are where the two words are related to each other (`mark.ts` and
      // `band.ts` both do this, and TASK-107 is what reduces doc citations in comments).
      const comment = `  // ${word} (doc-4 §1) is the 設計語 for this.\n`;
      expect(screenText(comment, false).some((line) => designOnlyHit(line))).toBe(false);
    }
  });
});
