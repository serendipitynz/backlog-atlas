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
 * prose like「doc-5 の全置換」would pass. That is the deliberate trade: 文書 id reach real screen
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
        if (DESIGN_REFERENCE.test(line)) {
          found.push(`${path}:${index + 1}: ${line.trim()}`);
        }
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
        if (SPELLED_VERSION.test(line)) {
          found.push(`${path}:${index + 1}: ${line.trim()}`);
        }
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
   * The crate's sources, read by the 設計語 scan and the 抽出漏れ scan, and by neither of the two above.
   *
   * **The crate is in range because it must build no Japanese — not because it does.** This note used
   * to say the opposite, and named a sentence `editor.rs` handed back
   * (「アプリ設定の外部エディタ指定・VISUAL・EDITOR のいずれも設定されていません」). decision-35 §3 moved
   * those onto 失敗理由符号: `editor.rs` now returns `LaunchRefusal` variants and a `detail` the OS wrote,
   * and the frontend words them. The sentence is gone; the reason for scanning survived it inverted, so
   * what these two scans hold is that the crate stays wordless.
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
   * Read by the same two scans as `CRATE` and by neither of the first two, for `CRATE`'s reason:
   * `tauri.conf.json` carries the app `version`, which the 版表記 scan forbids.
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

  // --- 抽出漏れ (decision-35 §4) ----------------------------------------------------------------
  //
  // The fourth kind, and the one that is not about a word but about a language. Every sentence Atlas
  // draws now comes from the 文言表 (TASK-183 moved the components', TASK-187 the pure modules'), and
  // what holds it there is that a source carrying Japanese fails here. The alternative — re-reading 46
  // files whenever a sentence is added — is the one-time sweep decision-35 §4 declined.
  //
  // **The range is the four 源泉, the same set the 設計語 scan reaches.** The crate is in it the other way
  // round from that scan's reason: decision-35 §3 took the Japanese *out* of the crate — the failure
  // reasons it used to spell now travel as 失敗理由符号 — so this scan is what keeps §3 true, not a
  // concession that the crate still builds sentences. The crate needs one thing the frontend does not,
  // below.

  /**
   * Japanese: kana, kanji, and the punctuation a Japanese sentence is set with.
   *
   * **The punctuation is in the class on purpose** — a leftover need not carry a kana. A template like
   * 「`${slug}（${detail}）`」 is a Japanese sentence with every word interpolated out of it, and a
   * kana-and-kanji class would pass it. Nothing outside the 文言表 uses these characters (measured
   * 2026-08-16 over all four 源泉: zero lines), so the wider class buys the reach for no exception.
   *
   * Written as escapes, not as literals: the endpoints (`〿`, `ゟ`, `゠`, `䶿`, `鿿`, `ﾟ`) are characters
   * a reader cannot check by eye, and each range here is a named Unicode block — CJK punctuation,
   * hiragana, katakana, CJK ideographs and their extension A, then the full-width and half-width forms.
   */
  const JAPANESE =
    /[\u3000-\u303f\u3041-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff9f]/;

  /**
   * The one exception decision-35 §4 allows, by file rather than by word: `ja.ts` holds Japanese as its
   * whole job, and `en.ts` carries `languageName.ja`, a value decided against translating rather than
   * one left untranslated. `excludes the two 文言表 and nothing else` requires both to still need it.
   */
  const MESSAGE_TABLE = /\/messages\/(ja|en)\.ts$/;

  /**
   * Blank out `#[cfg(test)] mod` blocks, keeping the line count so a failure still names its line.
   *
   * Rust puts a file's tests beside the code it tests, so the frontend's file-level `SKIPPED` has no
   * counterpart here — decision-35 §4 records this as the source set's edge rather than an exception to
   * it. Without it the scan reports assert prose and 試験関数名 such as
   * `an_unset_指定_leaves_the_bare_name_for_the_os`, which no user reads.
   *
   * **The close is found by rustfmt's indentation, not by counting braces.** A counter would have to
   * know which braces sit inside string literals (`"{forbidden} is …"` appears in `settings.rs`), and
   * `cargo fmt --check` runs in CI, so the module's `}` is the first line equal to the attribute's
   * indent plus `}`. **A module whose close is not found is left in place rather than stripped to the
   * end of the file** — over-stripping would hide real screen text, and `closes every crate test module
   * it opens` is what notices instead.
   */
  function withoutTestModules(source: string): { text: string; opened: number; closed: number } {
    const lines = source.split("\n");
    const kept = [...lines];
    let opened = 0;
    let closed = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const attribute = /^(\s*)#\[cfg\(test\)\]$/.exec(lines[index]);
      const opens = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*\{$/.test(lines[index + 1] ?? "");
      if (attribute === null || !opens) {
        continue;
      }
      opened += 1;
      const end = lines.indexOf(`${attribute[1]}}`, index + 2);
      if (end === -1) {
        continue;
      }
      closed += 1;
      for (let line = index; line <= end; line += 1) {
        kept[line] = "";
      }
    }
    return { text: kept.join("\n"), opened, closed };
  }

  /** The scanned 源泉 as `[path, lines]`, with the two 文言表 and the crate's test modules taken out. */
  function screenLines(): [string, string[]][] {
    return [
      ...scanned
        .filter((path) => !MESSAGE_TABLE.test(path))
        .map(
          (path): [string, string[]] => [path, screenText(SOURCES[path], path.endsWith(".svelte"))],
        ),
      ...Object.keys(CRATE)
        .sort()
        .map((path): [string, string[]] => [
          path,
          screenText(withoutTestModules(CRATE[path]).text, false),
        ]),
      ...Object.keys(STATIC_UI)
        .sort()
        .map((path): [string, string[]] => [
          path,
          screenText(STATIC_UI[path], path.endsWith(".html")),
        ]),
    ];
  }

  it("assembles all four 源泉, so the scan cannot pass by reading less", () => {
    // `scans every screen source` and `scans the crate and both titles too` hold the three globs; this
    // holds what `screenLines` does with them. Dropping one of its arms leaves both of those passing —
    // and the scan below then finds nothing because it looks at nothing.
    const paths = screenLines().map(([path]) => path);
    expect(paths.filter((path) => /\.(ts|svelte)$/.test(path)).length).toBeGreaterThan(20);
    expect(paths.filter((path) => path.endsWith(".rs")).length).toBeGreaterThan(5);
    for (const name of ["/index.html", "/tauri.conf.json"]) {
      expect(paths.some((path) => path.endsWith(name))).toBe(true);
    }
    // A statement about what the scan reads, where the test below is one about the regex.
    expect(paths.filter((path) => MESSAGE_TABLE.test(path))).toEqual([]);
  });

  it("keeps Japanese out of every 源泉 but the 文言表", () => {
    const found: string[] = [];
    for (const [path, lines] of screenLines()) {
      lines.forEach((line, index) => {
        if (JAPANESE.test(line)) {
          found.push(`${path}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it("excludes the two 文言表 and nothing else, and both still need excluding", () => {
    const excluded = scanned.filter((path) => MESSAGE_TABLE.test(path));
    expect(excluded.map((path) => path.replace(/^.*\//, "")).sort()).toEqual(["en.ts", "ja.ts"]);
    // Not a formality: an exclusion nothing would trip over is one the scan could drop, and the two
    // trip over it for different reasons (decision-35 §4).
    for (const path of excluded) {
      expect(screenText(SOURCES[path], false).some((line) => JAPANESE.test(line))).toBe(true);
    }
  });

  it("finds Japanese planted in each of the four 源泉", () => {
    const planted: [string, boolean][] = [
      ['export const EMPTY = "タスクはありません。";\n', false],
      ["<p>{shown} 件を表示しています</p>\n", true],
      ['const REASON: &str = "外部エディタを起動できません";\n', false],
      ["  <title>アトラス</title>\n", true],
      ['        "title": "アトラス",\n', false],
      // No kana and no kanji: the shape the punctuation range is in the class for.
      ["  return `${slug}（${detail}）`;\n", false],
    ];
    for (const [source, svelte] of planted) {
      expect(screenText(source, svelte).some((line) => JAPANESE.test(line))).toBe(true);
    }
    // English screen text is what the extraction produced, so it has to stay legal.
    const english = 'export const EMPTY = "No tasks yet.";\n';
    expect(screenText(english, false).some((line) => JAPANESE.test(line))).toBe(false);
    // So do the Japanese 領域語 in comments: AGENTS allows them, and TASK-107 is what reduces prose there.
    const comment = "  // 保存区分 is the directory the CLI puts a task in.\n";
    expect(screenText(comment, false).some((line) => JAPANESE.test(line))).toBe(false);
  });

  it("blanks a crate test module and nothing past its close", () => {
    const source = [
      'const REASON: &str = "editor unset";',
      "#[cfg(test)]",
      "mod tests {",
      "    #[test]",
      "    fn an_unset_指定_leaves_the_bare_name() {",
      '        assert_eq!(reason(), "起動失敗", "{} は理由を述べない", 1);',
      "    }",
      "}",
      'const AFTER: &str = "この行は読まれる";',
      "",
    ].join("\n");
    const { text, opened, closed } = withoutTestModules(source);
    expect([opened, closed]).toEqual([1, 1]);
    const lines = screenText(text, false);
    // The line after the close survives, so the stripper is not "from the attribute to end of file";
    // the unbalanced `{}` inside the module's format string is why braces are not counted.
    expect(lines.filter((line) => JAPANESE.test(line))).toEqual([
      'const AFTER: &str = "この行は読まれる";',
    ]);
    expect(lines.length).toBe(source.split("\n").length);
  });

  it("closes every crate test module it opens", () => {
    let opened = 0;
    let closed = 0;
    for (const source of Object.values(CRATE)) {
      const counted = withoutTestModules(source);
      opened += counted.opened;
      closed += counted.closed;
    }
    // A matcher that stopped matching would leave the scan reading the tests again, and the count is
    // what says it still matches — `closed === opened` alone holds at zero.
    expect(opened).toBeGreaterThan(10);
    expect(closed).toBe(opened);
  });
});
