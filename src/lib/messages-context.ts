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
 * other state. **The two accessors are not two sources** — both index `CATALOGS`, and the shell's
 * effect calls `setLanguage` so `msg()` answers with the same catalog this one returns.
 *
 * A component that words a sentence through a pure module (`edit.ts`, `settings.ts`) still gets the
 * right language without doing anything: those modules call `msg()`, and the effect has already run.
 * What it does **not** get is a redraw when the language changes, so a component whose text comes
 * only from such a module reads the accessor once to depend on it.
 *
 * Separate file from `messages.ts` because this one imports `svelte`, and `messages.ts` is imported
 * by modules the `node` project runs.
 */
import { getContext, setContext } from "svelte";
import { CATALOGS, type Catalog, type Language } from "./messages";

const KEY = Symbol("messages");

/** Called by the shell, once, with a getter for its own 表示言語. */
export function provideMessages(language: () => Language): void {
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
