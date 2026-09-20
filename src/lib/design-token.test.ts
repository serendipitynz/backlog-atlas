/**
 * doc-11 §2.5 as a check over the source: every `var(--…)` reference resolves to a declaration.
 *
 * **解決しない参照は、画面にも検査にも何も出さない。** CSS は値が無効な宣言を宣言ごと捨てるので、
 * `border: 1px solid var(--border)` は枠を 1 本も描かない — 画面は「不自然」に見えるだけである。
 * `pnpm run check` は `<style>` の中の CSS を型検査せず、`pnpm run lint` は CSS を読まない
 * (decision-32)。TASK-83 はその 2 つを実際に残し、オーナーが実機を目で見るまで誰も気づかなかった。
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason `text-scale.test.ts`
 * and `third-party-licenses.test.ts` both give: `node:fs` would pull in `@types/node`, and the
 * dependency budget for the `unit` project is nothing at all.
 *
 * **`?raw` では `.scss` を 1 バイトも読めない。** `app.scss` も 2 つの partial も vite の CSS 経路を
 * 通り、キーは在るのに中身が 0 バイトになる (実測 2026-09-20。3 ファイルとも `string` の長さ 0 で、
 * **`typeof` を見る検査は素通りする**)。だから `.svelte` の `<style>` も `app.scss` も **sass に
 * 通した結果**を読む — `@use` の先も、mixin が展開した宣言も、補間が組み立てた名前もそこに出ている。
 * 補間を素の文面で読もうとすると `var(--#{$name})` のような参照は名前として取り出せないが、sass を
 * 通した側には解決済みの名前が在るので、その穴はここには無い。
 *
 * No DOM here, so this runs in the `node` project.
 */
import { describe, expect, it } from "vitest";
import * as sass from "sass";

const SOURCES: Record<string, string> = import.meta.glob("../**/*.svelte", {
  eager: true,
  query: "?raw",
  import: "default",
});

function styleBlock(source: string): string {
  const start = source.indexOf("<style");
  if (start === -1) {
    return "";
  }
  const open = source.indexOf(">", start);
  const end = source.indexOf("</style>", open);
  return open === -1 || end === -1 ? "" : source.slice(open + 1, end);
}

/** マークアップは `<style>` の手前までである — `style` 属性を探すのはここだけでよい。 */
function markup(source: string): string {
  const start = source.indexOf("<style");
  return start === -1 ? source : source.slice(0, start);
}

type Scanned = { path: string; css: string; loaded: string[] };

const COMPONENTS: Scanned[] = Object.entries(SOURCES).flatMap(([path, source]) => {
  const scss = styleBlock(source);
  if (scss.trim() === "") {
    return [];
  }
  // `loadPaths` はそのコンポーネント自身のディレクトリで、Svelte が `@use "./shared"` を解く先と同じ。
  const directory = path.replace(/^\.\.\//, "src/").replace(/\/[^/]+$/, "");
  const result = sass.compileString(scss, { loadPaths: [directory] });
  return [{ path, css: result.css, loaded: result.loadedUrls.map((url) => url.href) }];
});

const GROUND = sass.compile("src/app.scss");

const SCANNED: Scanned[] = [
  ...COMPONENTS,
  { path: "src/app.scss", css: GROUND.css, loaded: GROUND.loadedUrls.map((url) => url.href) },
];

const REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)/g;

/**
 * `--name:` in declaration position.
 *
 * **先行する 1 文字を要求する。** `var(--x)` は `--x` の直後に `:` を持たないので素の名前の形だけでも
 * 参照を宣言と取り違えはしないが、`content` の文字列や `data:` URL の中に `--name:` を書いた版が
 * 将来現れたときに、区切りを要求する形のほうが拾う範囲が狭い。
 */
const DECLARATION = /(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/g;

/**
 * `style="…"` / `style='…'` の**中身**。Svelte の `{式}` は属性値の中に入るので、引用符の対で切り出せる。
 *
 * **引用符を取り込まない形で切る。** 取り込んだ版は、属性の先頭に書かれた宣言を 1 つずつ落とした —
 * `DECLARATION` が名前の手前に区切り (`{`・`;`・空白) を要求するのに対し、`"` はそのどれでもない。
 * 落ちたのは 13 個のうち 5 個で、**残る 8 個が通っていたので検査そのものは緑に見えた。**
 */
const STYLE_ATTRIBUTE = /style=(?:"([^"]*)"|'([^']*)')/g;

const namesIn = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]);

/** マークアップの `style` 属性が書く `--名前: 値` — doc-11 §2.5 の インライン宣言。 */
function inlineDeclarations(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [path, source] of Object.entries(SOURCES)) {
    for (const [, doubled, singled] of markup(source).matchAll(STYLE_ATTRIBUTE)) {
      for (const name of namesIn(doubled ?? singled, DECLARATION)) {
        found.set(name, [...(found.get(name) ?? []), path]);
      }
    }
  }
  return found;
}

/** `app.scss` とコンポーネントの `<style>` が書く宣言。 */
function styleDeclarations(): Set<string> {
  return new Set(SCANNED.flatMap(({ css }) => namesIn(css, DECLARATION)));
}

/**
 * 解決しない参照を `場所: 名前` で返す。
 *
 * 宣言の集合を引数に取るのは、**実物の集合に対して「戻ってきた 2 つ」を測れるようにする**ためである
 * (受入条件 #2)。名前で選ぶ判定をどこにも持たないので、`--border` が特別なのではなく、木に無いことが
 * 特別である。
 */
function unresolved(sources: readonly { path: string; css: string }[], declared: ReadonlySet<string>): string[] {
  const offenders: string[] = [];
  for (const { path, css } of sources) {
    for (const name of namesIn(css, REFERENCE)) {
      if (declared.has(name)) {
        continue;
      }
      offenders.push(`${path}: ${name}`);
    }
  }
  return [...new Set(offenders)];
}

const declaredEverywhere = () => new Set([...styleDeclarations(), ...inlineDeclarations().keys()]);

describe("走査する対象", () => {
  it("は出荷される CSS ぜんぶである — ここが痩せると下の case はどれも何も見ずに通る", () => {
    // 中身の長さで見る。**キーの有無や `typeof` では足りない** — 空文字も string である。
    expect(GROUND.css.length).toBeGreaterThan(1000);
    expect(COMPONENTS.length).toBeGreaterThan(15);
    expect(COMPONENTS.every(({ css }) => css.length > 0)).toBe(true);
    expect(new Set(SCANNED.flatMap(({ css }) => namesIn(css, REFERENCE))).size).toBeGreaterThan(40);
  });

  it("には、区画が分け合う SCSS の中身も入っている", () => {
    // 2 つの partial (TASK-106) は `?raw` で読めないので、**それを `@use` したコンポーネントを
    // sass に通した結果として**走査へ入る。`loadedUrls` はそれが起きたことを言う唯一の証拠である。
    const loaded = new Set(SCANNED.flatMap(({ loaded }) => loaded));
    const partials = [...loaded].filter((url) => url.endsWith("/_shared.scss"));
    expect(partials.length).toBe(2);
    // mixin が持つ参照に届いていること。**素の文面には `var(` が 1 件も無く、sass を通した側には
    // 在るコンポーネントが 1 つ以上ある** — それが無くなったら、この走査は共有 SCSS を読めていない。
    const reachedByCompiling = COMPONENTS.filter(({ path, css }) => {
      const raw = styleBlock(SOURCES[path]);
      return namesIn(css, REFERENCE).length > namesIn(raw, REFERENCE).length;
    });
    expect(reachedByCompiling.length).toBeGreaterThan(0);
  });

  it("の インライン宣言 は、マークアップの style 属性を 1 つも取りこぼさずに集めている", () => {
    // 属性の切り出しを数で突き合わせる。**`--` を含む属性だけを数えても意味が無い** — 取りこぼした
    // 属性はそもそも `--` を持つかどうかが見えないので、`style=` の総数と比べる。
    for (const [path, source] of Object.entries(SOURCES)) {
      const written = markup(source).match(/style=/g)?.length ?? 0;
      const captured = [...markup(source).matchAll(STYLE_ATTRIBUTE)].length;
      expect(captured, `${path} の style 属性を取りこぼしている`).toBe(written);
    }
    expect(inlineDeclarations().size).toBeGreaterThan(10);
  });

  it("に、名前そのものが実行時に決まる宣言・参照は 1 つも無い", () => {
    // `style="--{name}: 1"` も `var(--{name})` も静的には解決できず、**上の正規表現にも当たらないので
    // 黙って走査の外へ出る。** 今 0 件であることをここで押さえて、1 件でも書かれたら赤くする。
    for (const [path, source] of Object.entries(SOURCES)) {
      for (const [, doubled, singled] of markup(source).matchAll(STYLE_ATTRIBUTE)) {
        expect(doubled ?? singled, `${path} が名前を実行時に組み立てている`).not.toMatch(/--\s*\{/);
      }
    }
  });
});

describe("デザイントークンの参照 (doc-11 §2.5)", () => {
  it("はどれも app.scss・コンポーネント・インライン宣言 のいずれかに解決する", () => {
    expect(unresolved(SCANNED, declaredEverywhere())).toEqual([]);
  });

  // **受入条件 #2。** 実物の宣言集合に対して、TASK-83 が残していた 2 つを与える。実物のコンポーネントへ
  // 書き戻す形ではなく合成した CSS を与えるのは、走査の判定が「どこに書かれたか」ではなく
  // 「木に宣言が在るか」だけを見ることを、同じ 1 つの関数の上で示すためである。
  it("は、TASK-83 が外していた 2 つが戻ってくれば落ちる", () => {
    const back = [{ path: "戻した版", css: "border: 1px solid var(--border); color: var(--warn);" }];
    expect(unresolved(back, declaredEverywhere())).toEqual(["戻した版: --border", "戻した版: --warn"]);
    // 同じ関数が、実在するトークンは通す。**片側だけを見る case は、常に落ちる走査と区別が付かない。**
    const token = [{ path: "実在するトークン", css: "color: var(--fg); border-color: var(--line);" }];
    expect(unresolved(token, declaredEverywhere())).toEqual([]);
  });

  // **受入条件 #3。** インライン宣言 を数えないと 13 個が偽陽性になることを、集合を外して確かめる。
  // 「今は全部解決する」だけでは、インライン宣言 を集める枝が痩せても緑のままになりうる。
  it("のうち インライン宣言 が与えている名前は、その宣言を数えなければ解決しない", () => {
    const inline = inlineDeclarations();
    const withoutInline = unresolved(SCANNED, styleDeclarations());
    const missed = new Set(withoutInline.map((offender) => offender.replace(/^.*: /, "")));
    expect(missed.size).toBeGreaterThan(10);
    // 外して出てきた名前は、すべて インライン宣言 が与えているものである — 別の穴が混ざっていない。
    expect([...missed].filter((name) => !inline.has(name))).toEqual([]);
  });

  // **範囲は木全体である** (doc-11 §2.5)。カスタムプロパティは DOM を通って子へ継承されるので、
  // 与える側と読む側が別ファイルに居るのが正しい形で、ファイル単位に絞るとそれが偽陽性になる。
  // ここが 0 になったら、範囲を木全体に取る理由が無くなったということである。
  it("は、与える側と読む側が別のファイルに居る形を持っている", () => {
    const inline = inlineDeclarations();
    const crossing = SCANNED.filter(({ path, css }) => {
      const own = new Set(namesIn(css, DECLARATION));
      return namesIn(css, REFERENCE).some((name) => {
        const givenInline = inline.get(name) ?? [];
        return !own.has(name) && givenInline.length > 0 && !givenInline.includes(path);
      });
    });
    expect(crossing.length).toBeGreaterThan(0);
  });
});
