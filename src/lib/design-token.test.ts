/**
 * doc-11 §2.5 as a check over the source.
 *
 * **Nothing else in this tree looks at a reference at all.** Neither the type check nor the linter
 * reaches inside CSS (decision-32), so if this scan stops, that ground goes back to being watched by
 * no one — which is how TASK-83 left two names there.
 *
 * Sources come through `import.meta.glob` rather than `node:fs`, for the reason `text-scale.test.ts`
 * and `third-party-licenses.test.ts` both give: `node:fs` would pull in `@types/node`, and the
 * dependency budget for the `unit` project is nothing at all.
 *
 * **`?raw` reads not one byte of a `.scss` file.** `app.scss` and both partials go through vite's CSS
 * pipeline, so the key is there and the contents are empty (measured 2026-09-20: all three come back
 * as a `string` of length 0, which means **a check on `typeof` passes straight over it**). So both the
 * `<style>` blocks and `app.scss` are read **as sass compiled them** — what `@use` pulled in, what a
 * mixin expanded to, and the names interpolation assembled are all there. Reading the raw text
 * instead would leave a reference like `var(--#{$name})` with no name to extract; compiling resolves
 * it first, so that hole does not exist here.
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

/** The markup is everything before `<style>`, which is the only place a `style` attribute can sit. */
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
  // `loadPaths` is the component's own directory — where Svelte itself resolves `@use "./shared"`.
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
 * **A separator is required in front of the name.** `var(--x)` carries no `:` after `--x`, so the bare
 * name form would not mistake a reference for a declaration either — but once a `content` string or a
 * `data:` URL in this tree spells `--name:`, demanding a separator is the narrower of the two.
 */
const DECLARATION = /(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/g;

/**
 * The **contents** of `style="…"` / `style='…'`. A Svelte `{expression}` sits inside the attribute
 * value, so the pair of quotes is enough to cut it out.
 *
 * **The quotes are left outside the capture.** The version that kept them dropped the declaration
 * written first in each attribute: `DECLARATION` demands a separator (`{`, `;`, whitespace) in front
 * of the name, and `"` is none of those. That lost 5 of the 13 names, and **the remaining 8 resolved,
 * so the check itself still looked green.**
 */
const STYLE_ATTRIBUTE = /style=(?:"([^"]*)"|'([^']*)')/g;

const namesIn = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]);

/**
 * The `style` attribute contents of each file, joined into one text per file.
 *
 * **An attribute is a declaration site and a reference site at once.**
 * `style="--title-lines: var(--missing)"` gives one name while reading another, and the first version
 * collected only the giving half (raised in the review of PR #163). An attribute's contents are a
 * declaration list, so the same two patterns that read a `<style>` block apply unchanged — which is
 * why this is one more text to scan rather than one more code path.
 */
const INLINE: Scanned[] = Object.entries(SOURCES).flatMap(([path, source]) => {
  const values = [...markup(source).matchAll(STYLE_ATTRIBUTE)].map(([, doubled, singled]) => doubled ?? singled);
  return values.length === 0 ? [] : [{ path: `${path} (style 属性)`, css: values.join(";\n"), loaded: [] }];
});

/** Every text a reference is looked for in: the CSS that ships, and the markup's `style` attributes. */
const REFERENCED_IN: Scanned[] = [...SCANNED, ...INLINE];

/** The `--name: value` an attribute writes — doc-11 §2.5's インライン宣言. */
function inlineDeclarations(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const { path, css } of INLINE) {
    for (const name of namesIn(css, DECLARATION)) {
      found.set(name, [...(found.get(name) ?? []), path]);
    }
  }
  return found;
}

/** The declarations `app.scss` and the components' `<style>` blocks write. */
function styleDeclarations(): Set<string> {
  return new Set(SCANNED.flatMap(({ css }) => namesIn(css, DECLARATION)));
}

/**
 * The references that do not resolve, as `where: name`.
 *
 * It takes the declaration set as an argument so that **the two names TASK-83 left can be measured
 * against the real set** (acceptance criterion #2). No branch here selects on a name, so `--border` is
 * not special — being absent from the tree is.
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
    // Judged on the length of the contents. **A key, or a `typeof`, is not enough** — "" is a string too.
    expect(GROUND.css.length).toBeGreaterThan(1000);
    expect(COMPONENTS.length).toBeGreaterThan(15);
    expect(COMPONENTS.every(({ css }) => css.length > 0)).toBe(true);
    expect(new Set(SCANNED.flatMap(({ css }) => namesIn(css, REFERENCE))).size).toBeGreaterThan(40);
    // **The `style` attributes are among the texts references are looked for in.** There is no `var()`
    // in one today, so a count of them would state nothing; what is held instead is that the texts grow
    // by exactly the files carrying an attribute.
    expect(INLINE.length).toBeGreaterThan(0);
    expect(REFERENCED_IN.length).toBe(SCANNED.length + INLINE.length);
  });

  it("には、区画が分け合う SCSS の中身も入っている", () => {
    // The two partials (TASK-106) cannot be read with `?raw`, so they enter the scan **as part of what
    // sass produced for the components that `@use` them**. `loadedUrls` is the only evidence of that.
    const loaded = new Set(SCANNED.flatMap(({ loaded }) => loaded));
    const partials = [...loaded].filter((url) => url.endsWith("/_shared.scss"));
    expect(partials.length).toBe(2);
    // And that the references inside a mixin are reached: **at least one component has more references
    // after compiling than its raw text carries.** Once that stops, the scan no longer reads shared SCSS.
    const reachedByCompiling = COMPONENTS.filter(({ path, css }) => {
      const raw = styleBlock(SOURCES[path]);
      return namesIn(css, REFERENCE).length > namesIn(raw, REFERENCE).length;
    });
    expect(reachedByCompiling.length).toBeGreaterThan(0);
  });

  it("の インライン宣言 は、マークアップの style 属性を 1 つも取りこぼさずに集めている", () => {
    // The extraction is checked by count. **Counting only the attributes holding `--` states nothing** —
    // an attribute that was missed cannot be known to hold one — so the total of `style=` is the compare.
    for (const [path, source] of Object.entries(SOURCES)) {
      const written = markup(source).match(/style=/g)?.length ?? 0;
      const captured = [...markup(source).matchAll(STYLE_ATTRIBUTE)].length;
      expect(captured, `${path} の style 属性を取りこぼしている`).toBe(written);
    }
    expect(INLINE.length, "style 属性を持つファイルが 1 つも集まっていない").toBe(
      Object.values(SOURCES).filter((source) => /style=/.test(markup(source))).length,
    );
    expect(inlineDeclarations().size).toBeGreaterThan(10);
  });

  it("に、名前そのものが実行時に決まる宣言・参照は 1 つも無い", () => {
    // Neither `style="--{name}: 1"` nor `var(--{name})` can be resolved statically, and **neither matches
    // the patterns above, so it would leave the scan silently.** Holding the count at zero reddens the first.
    for (const { path, css } of INLINE) {
      expect(css, `${path} が名前を実行時に組み立てている`).not.toMatch(/--\s*\{/);
    }
  });
});

describe("デザイントークンの参照 (doc-11 §2.5)", () => {
  it("はどれも app.scss・コンポーネント・インライン宣言 のいずれかに解決する", () => {
    expect(unresolved(REFERENCED_IN, declaredEverywhere())).toEqual([]);
  });

  // **Acceptance criterion #2.** The two names TASK-83 left, given against the real declaration set.
  // Synthetic CSS rather than a write-back into a component, so that the one function shows what the
  // verdict actually turns on: not where a reference sits, only whether the tree declares the name.
  it("は、TASK-83 が外していた 2 つが戻ってくれば落ちる", () => {
    const back = [{ path: "戻した版", css: "border: 1px solid var(--border); color: var(--warn);" }];
    expect(unresolved(back, declaredEverywhere())).toEqual(["戻した版: --border", "戻した版: --warn"]);
    // The same function passes a token that exists. **One half alone cannot be told from a scan that
    // always fails.**
    const token = [{ path: "実在するトークン", css: "color: var(--fg); border-color: var(--line);" }];
    expect(unresolved(token, declaredEverywhere())).toEqual([]);
  });

  // **An attribute is a declaration site and a reference site at once** (raised in the review of PR
  // #163). Collecting only declarations left the first version blind to the `--missing` in
  // `style="--title-lines: var(--missing)"` and to `style="color: var(--warn)"`, with all eight cases
  // green. `INLINE` is the attribute text unchanged, so the same function decides both.
  it("は、style 属性の中に書かれていても解決しなければ落ちる", () => {
    const alias = [{ path: "合成した属性", css: "--title-lines: var(--missing-title-lines)" }];
    expect(unresolved(alias, declaredEverywhere())).toEqual(["合成した属性: --missing-title-lines"]);
    const direct = [{ path: "合成した属性", css: "color: var(--warn)" }];
    expect(unresolved(direct, declaredEverywhere())).toEqual(["合成した属性: --warn"]);
    // An attribute reading a name it declares itself passes — the declaring half is still counted.
    const own = [{ path: "合成した属性", css: "--a: 1px; margin: var(--a)" }];
    expect(unresolved(own, new Set([...declaredEverywhere(), "--a"]))).toEqual([]);
  });

  // **Acceptance criterion #3**, held by removing the set: without インライン宣言 the 13 names become
  // false positives. "Everything resolves today" stays green even if the branch collecting them thins out.
  it("のうち インライン宣言 が与えている名前は、その宣言を数えなければ解決しない", () => {
    const inline = inlineDeclarations();
    const withoutInline = unresolved(REFERENCED_IN, styleDeclarations());
    const missed = new Set(withoutInline.map((offender) => offender.replace(/^.*: /, "")));
    expect(missed.size).toBeGreaterThan(10);
    // Every name that surfaced is one インライン宣言 gives — no other hole is mixed into the count.
    expect([...missed].filter((name) => !inline.has(name))).toEqual([]);
  });

  // doc-11 §2.5 resolves tree-wide. **Should this reach zero, the reason for that range has left this
  // tree** — and whether the scan may then be narrowed is a judgement someone has to make.
  it("は、与える側と読む側が別のファイルに居る形を持っている", () => {
    const inline = inlineDeclarations();
    const crossing = SCANNED.filter(({ path, css }) => {
      const own = new Set(namesIn(css, DECLARATION));
      return namesIn(css, REFERENCE).some((name) => {
        const givenInline = inline.get(name) ?? [];
        return !own.has(name) && givenInline.length > 0 && !givenInline.some((giver) => giver.startsWith(path));
      });
    });
    expect(crossing.length).toBeGreaterThan(0);
  });
});
