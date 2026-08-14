/**
 * 編集部品の Ace 昇格 (doc-8 §6.1). Ace is vendored, not an npm dependency (decision-8): the copy
 * under `public/vendor/ace/` is served verbatim, loaded by a script tag at runtime, and is not part
 * of the bundle — so a build that cannot find it still produces a working app, which is the whole
 * point of the fallback below.
 *
 * The load is *allowed* to fail. Every caller treats a rejection as "stay on the textarea"
 * (doc-8 §6.1: Ace の読込に失敗しても textarea のまま編集不能にしない), so nothing here retries or
 * escalates — it resolves once, and the same promise answers every later editor.
 */

/** The slice of Ace's API the editor uses. Hand-written: typing the vendored file is not possible
 * without the npm package this project deliberately does not take (decision-8). */
export interface AceEditor {
  getValue(): string;
  setValue(text: string, cursorPos?: number): void;
  on(event: "change" | "blur", handler: () => void): void;
  destroy(): void;
  resize(force?: boolean): void;
  setTheme(theme: string): void;
  setOptions(options: Record<string, unknown>): void;
  session: {
    setMode(mode: string): void;
    setUseWorker(use: boolean): void;
    setUseWrapMode(use: boolean): void;
  };
  // `commands.addCommand` is deliberately absent. Ace's own binding table was a second place that
  // assigned a key, which doc-7 §2.1 rules out (割り当て一覧を 1 箇所に持つ) — and Ace's table cannot see
  // the composition guard the list applies, so the promoted editor answered a chord under conditions the
  // fallback textarea refused. `Editor.svelte` listens for the key instead, once, for both forms.
}

export interface AceApi {
  edit(element: HTMLElement): AceEditor;
  config: { set(key: string, value: string): void };
}

/** Where the vendored copy sits. Relative to the app's base so a non-root base still resolves. */
const ACE_SRC = `${import.meta.env.BASE_URL}vendor/ace/ace.js`;

let pending: Promise<AceApi> | null = null;

/**
 * Load Ace once per session. Concurrent callers — one per editor on the panel — share the single
 * script insertion; a rejection is remembered too, so a missing vendored file is not re-requested
 * for every field the user opens.
 */
export function loadAce(): Promise<AceApi> {
  if (pending !== null) {
    return pending;
  }
  pending = new Promise<AceApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ACE_SRC;
    script.onload = () => {
      const ace = (window as unknown as { ace?: AceApi }).ace;
      if (ace === undefined) {
        reject(new Error("ace.js loaded but defined no `ace` global"));
        return;
      }
      // Only needed for lazily fetched modes/themes; the vendored ace.js already carries
      // `ace/mode/text` and `ace/theme/textmate`, so nothing is fetched at runtime.
      ace.config.set("basePath", `${import.meta.env.BASE_URL}vendor/ace/`);
      resolve(ace);
    };
    script.onerror = () => reject(new Error(`failed to load ${ACE_SRC}`));
    document.head.appendChild(script);
  });
  return pending;
}
