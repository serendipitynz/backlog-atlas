/**
 * doc-11 §2.2 文字寸法段階 as a check over the source.
 *
 * Before TASK-164 the app had 186 `font-size` declarations across 18 files spelling 18 different rem
 * values, `app.scss` had none of them, and not one declaration shared a variable with another. §2.2
 * named seven sizes the whole time — **a table nothing read**. The 画面見出し row said `.92rem / 650`
 * while `App.svelte` drew its `h1` at `1rem` and left the weight at the UA's 700, and neither the doc
 * nor the code could tell you that, because no third thing compared them.
 *
 * So the point of this file is not tidiness. It is that 段階 の置き場が 1 か所である という主張は、
 * 2 つ目の置き場を作った回に落ちなければ主張ではない — the lesson the 引き継ぎ指示書 states as
 * 「『契約を固定した』と書いたら、壊して落ちることを実際に確かめる」.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason `screen-text.test.ts`
 * and `wire-fixture.test.ts` both give: `node:fs` would pull in `@types/node`, and the dependency
 * budget for the `unit` project is nothing at all. The glob also makes the scanned set observable,
 * which the first test uses — **a glob that matched nothing would otherwise pass every case here**,
 * which is the 「0 件が正常でありうるかを先に決める」 failure this repository has hit before.
 */
import { describe, expect, it } from "vitest";
import * as sass from "sass";

const SOURCES: Record<string, string> = import.meta.glob("../**/*.svelte", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * doc-11 §2.2 の 文字寸法段階 の行。**この行が段の値の正本である。**
 *
 * The step values are not written into this file. They are the design document's, and a test that
 * spelled them would be a third copy of the values beside the doc and `app.scss` — the shape TASK-164
 * removed. Reading them out of the doc is instead what makes `app.scss` answer to it, which is the
 * form AGENTS gives the confirmed CLI version (one source, everything else derives from it).
 */
const DOC_11: Record<string, string> = import.meta.glob("../../backlog/docs/doc-11*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * `app.scss` は `?raw` では読めない — vite の CSS 経路を通るので、この glob に混ぜても既定の輸出は
 * 空文字になる (実測。**キーは在るのに中身が 0 バイトなので、`typeof` を見る検査は素通りする**)。
 * `theme.test.ts` と同じく sass に開かせて**出荷されるほうの CSS** を読む — 値がそこにしか無い点も
 * 同じで (decision-12・doc-11 §9)、こちらは `@types/node` も要らない。
 */
const GROUND_CSS = sass.compile("src/app.scss").css;

/**
 * `font-size: <value>;`, wherever it sits.
 *
 * **値は改行を跨がない。**跨げる形 (`[^;]+`) で書いた最初の版は、`;` を持たない註の中の `font-size:`
 * から次の `;` まで — 途中の宣言を丸ごと呑んで — 1 件の値として拾った。註は `;` で終わらないので、
 * その形では註が近くの実装を巻き込む。
 */
const DECLARATION = /font-size:\s*([^;\n]+);/g;

/** `--text-xs: 0.62rem;` and its six siblings, as written in `app.scss`. */
const STEP_DEFINITION = /--text-(xs|sm|md|lg|xl|2xl|3xl):\s*([\d.]+)rem;/g;

const STEP_NAMES = ["--text-xs", "--text-sm", "--text-md", "--text-lg", "--text-xl", "--text-2xl", "--text-3xl"];

/**
 * A value a declaration may hold besides a step.
 *
 * `em` は段ではなく、載っている箱に対する比である — アイコンの `1em` (doc-11 §2.4)、インラインコードの
 * `0.95em`、フェンスの中の `1em` (§14.2) の 3 つがこれで、**どれも段を選んでいない。**段の一つへ替えると、
 * 図形が隣の語から離れ、コードが本文から離れる。`inherit` も同じ理由で通す。
 */
const RELATIVE = /^(inherit|[\d.]+em)$/;

const componentSources = () => Object.entries(SOURCES);

const declarationsIn = (source: string) => [...source.matchAll(DECLARATION)].map((m) => m[1].trim());

/** Every `--name: value;` written anywhere in the components, so a `var()` can be followed to its end. */
const customProperties = () => {
  const defined = new Map<string, string[]>();
  for (const [, source] of componentSources()) {
    for (const [, name, value] of source.matchAll(/(--[a-z0-9-]+):\s*([^;\n]+);/g)) {
      defined.set(name, [...(defined.get(name) ?? []), value.trim()]);
    }
  }
  return defined;
};

/**
 * Whether a `font-size` value ends at a step, following `var()` through as many aliases as it takes.
 *
 * **Accepting any `var(--…)` was not enough**, which the review of PR #118 found: a component could
 * write `--caption-size: 0.5rem; font-size: var(--caption-size)` and hold a size of its own while the
 * check passed, because the alias case only looked at names containing `text`. A name is not what makes
 * a reference safe — where it leads is.
 */
const resolvesToAStep = (value: string, defined: Map<string, string[]>, seen: readonly string[] = []): boolean => {
  const reference = value.match(/^var\((--[a-z0-9-]+)(?:\s*,[\s\S]*)?\)$/);
  if (reference === null) {
    return false;
  }
  const name = reference[1];
  if (STEP_NAMES.includes(name)) {
    return true;
  }
  // A cycle cannot reach a step, and must not hang the test either.
  //
  // **`seen` is the current path, not everything visited.** A `Set` shared across the sibling calls
  // below made the second definition that routed through an already-crossed alias look like a cycle,
  // so two definitions both reaching a step by the same safe intermediate were rejected (found in the
  // 2R review of PR #118, and the case below is that shape).
  if (seen.includes(name)) {
    return false;
  }
  const path = [...seen, name];
  const definitions = defined.get(name) ?? [];
  // **Every** definition has to reach a step: one screen redefining the alias to a number is the hole.
  return definitions.length > 0 && definitions.every((next) => resolvesToAStep(next, defined, path));
};

describe("走査する対象", () => {
  it("scans the ground and every component, so no case below can pass by matching nothing", () => {
    // 中身の長さで見る。**キーの有無や `typeof` では足りない** — 空文字も string である。
    expect(GROUND_CSS.length).toBeGreaterThan(1000);
    expect(componentSources().length).toBeGreaterThan(15);
    const withFontSize = componentSources().filter(([, source]) => declarationsIn(source).length > 0);
    expect(withFontSize.length).toBeGreaterThan(15);
  });
});

describe("文字寸法段階 (doc-11 §2.2)", () => {
  const steps = [...GROUND_CSS.matchAll(STEP_DEFINITION)].map(([, name, value]) => ({
    name: `--text-${name}`,
    rem: Number(value),
  }));

  it("は app.scss が 7 段を持ち、小さい順に並び、同じ値を 2 つ持たない", () => {
    expect(steps.map((s) => s.name)).toEqual(STEP_NAMES);
    const values = steps.map((s) => s.rem);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  // **doc-11 §2.2 の値そのものと突き合わせる。** 昇順・幅一定・段の数だけを見ていた版は、梯子ごと平行移動
  // されても通り、そのとき doc-11 の表と、その表を基準に測った §13・§14.1 の実測がまとめて偽になる
  // (PR #118 のレビュー指摘)。**期待値はこのファイルに書かない** — 書けば doc と `app.scss` に並ぶ 3 つ目の
  // 写しになるので、doc の行から読んで比べる。
  it("は doc-11 §2.2 が書いている値と一致する", () => {
    const doc = Object.values(DOC_11)[0];
    expect(doc, "doc-11 が読めていない").toBeTypeOf("string");
    const row = doc.match(/^\|\s*文字寸法段階\s*\|([^|]+)\|/m);
    expect(row, "doc-11 §2.2 に 文字寸法段階 の行が無い").not.toBeNull();
    const documented = [...row![1].matchAll(/([\d.]+)(?:rem)?/g)].map(([, n]) => Number(n));
    expect(documented).toHaveLength(STEP_NAMES.length);
    expect(steps.map((s) => s.rem)).toEqual(documented);
  });

  // **一定であることを見る。**「ある幅以上」にすると、置き換えた 18 値が持っていた .74/.75 (0.01 差) や
  // .92/.95 (0.03 差) のような、隣り合う 2 つを別の大きさとして読めない組がまた入りうる — 下限だけでは
  // 段の一部が詰まっている梯子を通してしまう。
  it("の隣り合う段の幅は一定である", () => {
    const gaps = steps.slice(1).map((step, i) => Math.round((step.rem - steps[i].rem) * 10000) / 10000);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThan(0);
  });

  // **これが「置き場は 1 か所」の全部である。** ここが押さえるのは、どの画面も自分で数を決められない
  // ことだけで、段がどの値であるべきかは上の 3 件が doc-11 §2.2 に対して押さえる。
  it("の外で font-size に長さを書いた画面が 1 つも無い", () => {
    const defined = customProperties();
    const offenders: string[] = [];
    for (const [path, source] of componentSources()) {
      for (const value of declarationsIn(source)) {
        if (RELATIVE.test(value)) {
          continue;
        }
        if (resolvesToAStep(value, defined)) {
          continue;
        }
        offenders.push(`${path}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("だけが地の大きさを決める — 地の 1rem は app.scss の :root が 1 か所で持つ", () => {
    expect(declarationsIn(GROUND_CSS)).toEqual(["110%"]);
  });

  // 別名 (`TaskDetail.svelte` の `--frame-text`) を数へ戻す変更は、上の case が捕まえる — `resolvesToAStep`
  // が `var()` を辿るので、辿った先が数なら「長さを書いた」ことになる。**名前に `text` を含む別名だけを
  // 見ていた専用の case は落とした** — 名前で選ぶ形が PR #118 のレビューで見つかった穴そのもので、
  // 残しておくと、そちらが番をしているように読める。
  it("を引く別名は、名前ではなく辿った先で判定される", () => {
    const defined = customProperties();
    expect(resolvesToAStep("var(--frame-text)", defined)).toBe(true);
    expect(resolvesToAStep("var(--text-md)", defined)).toBe(true);
    // 未定義の名前、循環、数そのものはどれも段に届かない。
    expect(resolvesToAStep("var(--caption-size)", defined)).toBe(false);
    expect(resolvesToAStep("0.5rem", defined)).toBe(false);
    expect(resolvesToAStep("var(--a)", new Map([["--a", ["var(--b)"]], ["--b", ["var(--a)"]]]))).toBe(false);
    // 別名が 2 か所で定義され、片方だけが段を指す形も通さない。
    expect(resolvesToAStep("var(--a)", new Map([["--a", ["var(--text-md)", "0.5rem"]]]))).toBe(false);
    // **同じ安全な中継を 2 本とも通る形は通す。** `seen` を枝の間で共有していた版は、2 本目を循環と
    // 読んで false を返した — 正しい実装を落とす向きの誤りである (PR #118 の 2R)。
    expect(
      resolvesToAStep("var(--a)", new Map([["--a", ["var(--mid)", "var(--mid)"]], ["--mid", ["var(--text-md)"]]])),
    ).toBe(true);
    // 枝が別々に安全な中継を持つ形も通す。
    expect(
      resolvesToAStep(
        "var(--a)",
        new Map([
          ["--a", ["var(--m1)", "var(--m2)"]],
          ["--m1", ["var(--shared)"]],
          ["--m2", ["var(--shared)"]],
          ["--shared", ["var(--text-lg)"]],
        ]),
      ),
    ).toBe(true);
  });
});

// --- 整形表示 の 4 か所 (受入条件 #3) ----------------------------------------------------------
//
// タスク詳細・文書・マイルストーン・決定事項 が同じ基準を取ることを、**4 か所を横並びに測って一致を
// 見る形では押さえない** — 一致は 4 つが同じ 1 つの `Body.svelte` を描いていることの帰結であって、
// 帰結を測っても、次に 5 か所目が自前の本文を描いたときには何も起きないためである。押さえるのは
// 「本文を描く経路が 1 本しか無い」ことそのものである。
describe("整形表示 (doc-11 §14) の 4 か所", () => {
  const mounts = componentSources().flatMap(([path, source]) =>
    [...source.matchAll(/<Body\s+source=\{([^}]+)\}/g)].map(([, expression]) => ({ path, expression })),
  );

  it("はどれも Body.svelte を描く — 4 つの区画ぶんの本文がそこを通る", () => {
    const expressions = mounts.map((m) => m.expression);
    // タスク詳細は 3 区画 (doc-8 §3) を持つので、4 か所は 6 つの mount になる。
    expect(expressions).toContain("task.description");
    expect(expressions).toContain("task.implementationPlan");
    expect(expressions).toContain("task.implementationNotes");
    expect(expressions.some((e) => e.startsWith("document.body"))).toBe(true);
    expect(expressions.some((e) => e.startsWith("milestone.description"))).toBe(true);
    expect(expressions.some((e) => e.startsWith("decision.body"))).toBe(true);
  });

  it("の本文ブロックの見え方を書いている画面は Body.svelte だけである", () => {
    const drawers = componentSources()
      .filter(([, source]) => /\.body-block\s*\{/.test(source))
      .map(([path]) => path);
    expect(drawers).toEqual(["../components/Body.svelte"]);
  });

  it("の中の見出しは、本文より大きく、パネルの見出し とは競合しない (doc-11 §14.1)", () => {
    const body = SOURCES["../components/Body.svelte"];
    const step = (selector: RegExp) => {
      const match = body.match(selector);
      expect(match, `${selector} が Body.svelte に無い`).not.toBeNull();
      return match![1];
    };
    const rank = STEP_NAMES;
    const prose = rank.indexOf(step(/\.body-block[\s\S]*?font-size:\s*var\((--text-[\w-]+)\);/));
    const upper = rank.indexOf(step(/:global\(h1\),\s*\n\s*:global\(h2\)\s*\{\s*\n\s*font-size:\s*var\((--text-[\w-]+)\);/));
    const lower = rank.indexOf(step(/:global\(h6\)\s*\{\s*\n\s*font-size:\s*var\((--text-[\w-]+)\);/));
    expect(prose).toBeGreaterThanOrEqual(0);
    // 段が 2 つで、どちらも本文より大きい。上段は パネルの見出し (`--text-3xl`) に届かない。
    expect(upper).toBeGreaterThan(lower);
    expect(lower).toBeGreaterThan(prose);
    expect(upper).toBeLessThan(rank.indexOf("--text-3xl"));
  });
});
