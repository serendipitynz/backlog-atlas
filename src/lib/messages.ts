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
 * pure-logic half of the suite behind the compiler. So the active language is a plain module-level
 * value.
 *
 * Being plain, it is not what redraws a component — `messages-context.ts` is, through an accessor
 * over the shell's own derived language. **Re-keying the shell's tree is the rejected alternative**,
 * not the mechanism: it would destroy every component's state, so changing the language mid-edit
 * would discard the detail panel's 編集セッション, which doc-8 §6.4 forbids for the same reason.
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
 * The 文言表 in force. Screens and the modules that word a sentence call this rather than holding a
 * string, which is what lets a pure function keep its signature: `edit.ts` still returns a sentence,
 * it just no longer spells one.
 */
export function msg(): Catalog {
  return CATALOGS[active];
}

export function activeLanguage(): Language {
  return active;
}

/**
 * Set the 表示言語; nothing outside the shell should call it.
 *
 * **It has to be called during initialisation, before the first render**, and `provideMessages` is
 * what does that. An effect alone would not: effects run after their subtree is created, so through
 * the whole first render pass this module would still answer with its initialiser — and a sentence a
 * pure module worded in that pass would keep the wrong language, since `msg()` is not reactive and
 * nothing would recompute the `$derived` holding it. The shell's effect covers the *later* changes.
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
