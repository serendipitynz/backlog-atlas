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

/** `--text-xs: 0.62rem;` and its five siblings, as written in `app.scss`. */
const STEP_DEFINITION = /--text-(xs|sm|md|lg|xl|2xl):\s*([\d.]+)rem;/g;

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

  it("は app.scss が 6 段を持ち、小さい順に並び、同じ値を 2 つ持たない", () => {
    expect(steps.map((s) => s.name)).toEqual(["--text-xs", "--text-sm", "--text-md", "--text-lg", "--text-xl", "--text-2xl"]);
    const values = steps.map((s) => s.rem);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  // **一定であることを見る。**「ある幅以上」にすると、置き換えた 18 値が持っていた .74/.75 (0.01 差) や
  // .92/.95 (0.03 差) のような、隣り合う 2 つを別の大きさとして読めない組がまた入りうる — 下限だけでは
  // 段の一部が詰まっている梯子を通してしまう。
  it("の隣り合う段の幅は一定である", () => {
    const gaps = steps.slice(1).map((step, i) => Math.round((step.rem - steps[i].rem) * 10000) / 10000);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThan(0);
  });

  // **これが「置き場は 1 か所」の全部である。** 段の値そのものはここでは検めない — 値は doc-11 §2.2 が
  // 持ち、上の 2 件がその形 (6 段・昇順・重複なし) を押さえる。ここが押さえるのは、どの画面も自分で
  // 数を決められないことである。
  it("の外で font-size に長さを書いた画面が 1 つも無い", () => {
    const offenders: string[] = [];
    for (const [path, source] of componentSources()) {
      for (const value of declarationsIn(source)) {
        if (value.startsWith("var(--")) continue;
        if (RELATIVE.test(value)) continue;
        offenders.push(`${path}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("だけが地の大きさを決める — 地の 1rem は app.scss の :root が 1 か所で持つ", () => {
    expect(declarationsIn(GROUND_CSS)).toEqual(["110%"]);
  });

  it("を引く別名も段を指す（`--frame-text` のように画面が置いた別名が数へ戻らない）", () => {
    const aliases: string[] = [];
    for (const [path, source] of componentSources()) {
      for (const [, name, value] of source.matchAll(/(--[a-z-]*text[a-z-]*):\s*([^;]+);/g)) {
        if (!value.trim().startsWith("var(--text-")) aliases.push(`${path}: ${name}: ${value.trim()}`);
      }
    }
    expect(aliases).toEqual([]);
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

  it("の中の見出しは、本文より大きく、タスク title とは競合しない (doc-11 §14.1)", () => {
    const body = SOURCES["../components/Body.svelte"];
    const step = (selector: RegExp) => {
      const match = body.match(selector);
      expect(match, `${selector} が Body.svelte に無い`).not.toBeNull();
      return match![1];
    };
    const rank = ["--text-xs", "--text-sm", "--text-md", "--text-lg", "--text-xl", "--text-2xl"];
    const prose = rank.indexOf(step(/\.body-block[\s\S]*?font-size:\s*var\((--text-[\w-]+)\);/));
    const upper = rank.indexOf(step(/:global\(h1\),\s*\n\s*:global\(h2\)\s*\{\s*\n\s*font-size:\s*var\((--text-[\w-]+)\);/));
    const lower = rank.indexOf(step(/:global\(h6\)\s*\{\s*\n\s*font-size:\s*var\((--text-[\w-]+)\);/));
    expect(prose).toBeGreaterThanOrEqual(0);
    // 段が 2 つで、どちらも本文より大きい。上段は タスク title (`--text-2xl`) に届かない。
    expect(upper).toBeGreaterThan(lower);
    expect(lower).toBeGreaterThan(prose);
    expect(upper).toBeLessThan(rank.indexOf("--text-2xl"));
  });
});
