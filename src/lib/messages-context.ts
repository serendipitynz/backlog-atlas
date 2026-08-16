/**
 * How a component reads the 文言表 (decision-35) so that a 表示言語 change redraws it.
 *
 * ## Why this is not just `msg()`
 *
 * `messages.ts` keeps the active language in a plain module-level value, which is what lets the
 * modules tested in the `node` project call it without the Svelte compiler. A plain value is not
 * reactive, so a template calling `msg()` directly would keep the language it first drew in.
 *
 * The shell therefore puts an accessor in context that closes over its own `$derived` language, and
 * a component calling that accessor in its markup depends on the language the way it depends on any
 * other state.
 *
 * **The two accessors are not two sources.** [`provideMessages`] hands the *same* getter to
 * `messages.ts` as its 言語の出どころ, so `msg()` reads the shell's `$derived` too — which is what
 * makes a sentence worded by a pure module (`edit.ts`, `swimlane.ts`, `band.ts`) both come out in the
 * right language and redraw when that language changes, without the component that draws it doing
 * anything. `messages.ts`'s header has the measurement that established this was needed.
 *
 * **Installing it here rather than in the shell's effect is what makes it true of the first render
 * pass** — an effect runs after its subtree is created, so a sentence worded during that pass would
 * otherwise come from whatever this module had been left with.
 *
 * Separate file from `messages.ts` because this one imports `svelte`, and `messages.ts` is imported
 * by modules the `node` project runs.
 */
import { getContext, onDestroy, setContext } from "svelte";
import {
  CATALOGS,
  clearLanguageSource,
  provideLanguageSource,
  type Catalog,
  type Language,
} from "./messages";

const KEY = Symbol("messages");

/**
 * Called by the shell, once, with a getter for its own 表示言語.
 *
 * The getter goes to `messages.ts` as well as into the context, so the pure modules' `msg()` reads
 * the same 表示言語 this accessor returns — one source, read two ways. It is taken back on teardown,
 * so a shell that has been unmounted (which happens once per component test) leaves `messages.ts`
 * answering from its own value again.
 */
export function provideMessages(language: () => Language): void {
  provideLanguageSource(language);
  onDestroy(() => clearLanguageSource(language));
  setContext(KEY, () => CATALOGS[language()]);
}

/**
 * The 文言表 accessor, for use in markup. Falls back to `CATALOGS.ja` when no shell provided one,
 * which is what a component mounted on its own in a test gets — a missing provider is a test's
 * setup, not a state the app can reach, so this returns text rather than throwing.
 */
export function messages(): () => Catalog {
  return getContext<() => Catalog>(KEY) ?? (() => CATALOGS.ja);
}
