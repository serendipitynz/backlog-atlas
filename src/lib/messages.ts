/**
 * 表示言語 と 文言表 (decision-35). Every string a user reads from Atlas itself comes from here.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `settings.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-35 表示言語 | [`Language`] / [`activeLanguage`] | which of the two languages the screen is drawn in right now |
 * | decision-35 言語未選択 | [`resolveLanguage`] called with `null` | no choice stored, so the OS's language decides |
 * | decision-35 文言表 | [`Catalog`] / [`CATALOGS`] | one language's whole set of strings |
 * | decision-35 文言鍵 | the property path into [`Catalog`] (`settings.languageHeading`) | what a screen indexes the 文言表 with — **no type names it**, and `keyof Catalog` would be the group name alone |
 *
 * ## Why a plain module and not a rune
 *
 * The `unit` Vitest project runs in `node` with no Svelte compiler (`vitest.config.ts`), and most of
 * the modules that word a sentence are tested there. A `$state` in a `.svelte.ts` would put the whole
 * pure-logic half of the suite behind the compiler. So the language this module answers with is a
 * plain module-level value — until a shell says otherwise.
 *
 * ## 言語の出どころ (`languageSource`), and why a plain value was not enough
 *
 * A plain value cannot be depended on, so a reactive scope that words a sentence through a pure
 * module would keep the language it first drew in. TASK-183 left every `.svelte` reading the context
 * accessor, which redraws; TASK-187 moved the pure modules' sentences here too, and those are read
 * from inside `$derived` values and template expressions that call **no** accessor — `topBands`,
 * `headerMenu`, `transitionOffers`, the ten 並び順 `<option>`s, and so on.
 *
 * **Measured rather than reasoned about** (TASK-187): the 並び順 `<option>`s came out in English in a
 * Japanese session, because the shell's language resolves to the OS's until the settings read
 * answers and nothing re-worded them afterwards. That is one site of many, and no check could have
 * named the rest.
 *
 * So the shell hands this module a *reader* over its own 表示言語 ([`provideLanguageSource`], called
 * by `provideMessages`). [`msg`] calls it, so a `$derived` that reaches a pure module depends on the
 * language through that call and redraws with it — no per-call-site accessor read, and nothing for a
 * later session to remember to add. With no shell — the `node` project, and a component mounted on
 * its own — there is no reader, and [`setLanguage`]'s plain value answers exactly as before.
 *
 * **Re-keying the shell's tree is the rejected alternative**, not the mechanism: it would destroy
 * every component's state, so changing the language mid-edit would discard the detail panel's
 * 編集セッション, which doc-8 §6.4 forbids for the same reason.
 *
 * ## Why the catalog is data with typed shape, not `t("some.key")`
 *
 * [`Catalog`] is `typeof ja` — so the Japanese catalog *is* the key set, and the English one is
 * declared against that type. A missing key, a spare key, and a parameter list that drifted are all
 * `pnpm run check` failures rather than a blank on screen (decision-35 §4, first of the two stages).
 * A string-keyed `t()` could not do that: its argument is a string, and every string type-checks.
 */

import { EN } from "./messages/en";
import { ja } from "./messages/ja";

/** The two languages decision-35 fixes. The values are BCP 47 primary subtags. */
export type Language = "ja" | "en";

export const LANGUAGES: Language[] = ["ja", "en"];

/**
 * One language's 文言表. Derived from the Japanese one rather than declared separately, so there is
 * no third place for the shape to be written — and no way to add a key to the type without adding
 * the Japanese string that key stands for.
 */
export type Catalog = typeof ja;

export const CATALOGS: Record<Language, Catalog> = { ja, en: EN };

/**
 * 言語未選択 (decision-35): with no stored choice, the OS's language decides, and Japanese is taken
 * only when the OS asks for Japanese. Anything else — including a language Atlas has no catalog for
 * — gets English, because English is the one of the two more readers of an unlisted language can
 * read.
 *
 * `stored` is the `language` item of アプリ設定 as it comes off the wire: `null` for 言語未選択, and
 * a value this build does not recognise is treated the same way rather than failing, which is
 * decision-13's rule for a settings value it cannot honour.
 */
export function resolveLanguage(stored: string | null, osLanguage: string): Language {
  if (stored !== null && isLanguage(stored)) {
    return stored;
  }
  return osLanguage.toLowerCase().split("-")[0] === "ja" ? "ja" : "en";
}

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as string[]).includes(value);
}

/**
 * The OS's language as the webview reports it. Kept behind a function so tests can state the value
 * they mean: `navigator` is absent in the `node` project and is not writable in `jsdom`.
 */
export function osLanguage(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language;
}

let active: Language = "ja";

/**
 * The shell's own 表示言語, while a shell is up. `null` where none is — the `node` project, and a
 * component mounted without one — and then [`setLanguage`]'s plain value answers instead.
 */
let languageSource: (() => Language) | null = null;

/**
 * The language every call below answers with. Reading the shell's reader here is what makes [`msg`]
 * depend on the 表示言語 wherever it is called from a reactive scope (see the header).
 */
function currentLanguage(): Language {
  return languageSource === null ? active : languageSource();
}

/**
 * The 文言表 in force. Screens and the modules that word a sentence call this rather than holding a
 * string, which is what lets a pure function keep its signature: `edit.ts` still returns a sentence,
 * it just no longer spells one.
 */
export function msg(): Catalog {
  return CATALOGS[currentLanguage()];
}

export function activeLanguage(): Language {
  return currentLanguage();
}

/**
 * Hand this module the shell's 表示言語, so that wording a sentence *is* a read of it.
 *
 * **It has to be installed during initialisation, before the first render**, and `provideMessages` is
 * what does that. An effect alone would not: effects run after their subtree is created, so through
 * the whole first render pass this module would still answer with its initialiser, and a sentence
 * worded in that pass would come from the wrong catalog.
 */
export function provideLanguageSource(read: () => Language): void {
  languageSource = read;
}

/**
 * Take a reader back when the shell that installed it goes away, so a mounted-then-destroyed shell
 * does not leave this module reading a language nothing owns. A no-op for any other reader, which is
 * what keeps a second shell's install from being undone by the first one's teardown.
 */
export function clearLanguageSource(read: () => Language): void {
  if (languageSource === read) {
    languageSource = null;
  }
}

/**
 * Set the 表示言語 for the case where no shell has provided one — the `node` project's tests, and a
 * component mounted on its own. While a reader is installed this value is not what is read.
 */
export function setLanguage(language: Language): void {
  active = language;
}

/**
 * Pick a form by count (decision-35 §1). Japanese selects `other` for every number — `Intl` says so,
 * rather than this module assuming it — so a Japanese entry writes `other` alone and an English one
 * adds `one`.
 */
export function pluralize(
  count: number,
  forms: { one?: string; other: string },
  language: Language = active,
): string {
  const rule = new Intl.PluralRules(language).select(count);
  return (rule === "one" ? forms.one : undefined) ?? forms.other;
}
