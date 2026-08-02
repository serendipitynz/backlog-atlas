/**
 * Sequencing for プロジェクトを登録's 既定 slug preview (doc-3 §3.1, doc-3 §4.1 step 1). The
 * derivation is asked of the boundary, so it is asynchronous while typing and picking a folder are
 * not: two roots named in quick succession put two answers in flight, and the one that arrives last
 * is not necessarily the one being asked about.
 *
 * What the screen promises is narrow and worth stating exactly: the sentence under the slug field
 * says which slug 登録 *will* use. A preview belonging to a root the form has left says that of a
 * registration that would not happen — the ledger derives the slug again from the request it
 * receives, so the screen would be the only place the wrong value ever existed.
 *
 * Kept out of the component for the same reason `history-read.ts` is: the ordering can only be
 * pinned by resolving two calls in a chosen order, and AGENTS' テスト節 holds component tests to
 * 画面横断契約 rather than per-screen coverage. The component supplies the display it lives in
 * through [`SlugPreviewPorts`].
 */

/**
 * What the screen knows about the 既定 slug for the root now in the field.
 *
 * Three states rather than the string-plus-flag pair the screen held before, because two of the
 * four combinations that pair can express are not states this can be in — and 未取得 with a slug
 * still in hand is exactly the one a stale response produced.
 */
export type SlugPreview =
  /** 未取得: no answer for the current root — nothing asked yet, or one is in flight. */
  | { state: "unknown" }
  /** 導出できた (doc-3 §3.1). */
  | { state: "derived"; slug: string }
  /** 導出できない: the directory name yields no usable characters, so the user has to name one. */
  | { state: "underivable" };

export interface SlugPreviewPorts {
  /** `ledgerDefaultSlug` — `null` when the directory name yields no slug. */
  derive: (projectRoot: string) => Promise<string | null>;
  /** Put a state on screen. There is nothing to read back: the token below is the whole record. */
  show: (preview: SlugPreview) => void;
}

export interface SlugPreviewLoader {
  /** Ask about a root — the field's onchange, and both 選択… buttons. */
  load: (projectRoot: string) => Promise<void>;
  /**
   * Go back to 未取得 without asking about anything, and supersede whatever is in flight. What a
   * completed registration does: it empties the form, and an answer for the root just registered
   * would otherwise arrive to describe the empty field it left behind.
   */
  clear: () => void;
}

/**
 * A loader that stamps every call and shows only the newest call's answer.
 *
 * The token is what decides, rather than comparing the answer against the root now in the field.
 * Both are permitted by the task's 受入条件 and they differ on one route: naming A, then B, then A
 * again puts two calls in flight that agree on the root, so a root comparison would accept the
 * first A's answer as the second's. The token is also the idiom `history-read.ts` already uses, so
 * "which response wins" has one answer in this codebase rather than two.
 *
 * No loader generation is stamped here, unlike `history-read.ts`. That value exists because the
 * backend keys a cancellation registry on the identifier and outlives a webview reload; this
 * derivation registers nothing and cannot be cancelled, so the token never leaves this closure and
 * a second loader's numbering cannot collide with this one's.
 */
export function createSlugPreviewLoader(ports: SlugPreviewPorts): SlugPreviewLoader {
  let calls = 0;

  /** Stamp a new call and put the screen back to 未取得 for the length of it. */
  function begin(): number {
    ports.show({ state: "unknown" });
    return ++calls;
  }

  return {
    async load(projectRoot: string): Promise<void> {
      const root = projectRoot.trim();
      // Before the empty-root return, not after: clearing the field while an answer is in flight is
      // one of the ways a stale answer used to land, and returning early without stamping would
      // leave that call still holding the newest token.
      const token = begin();
      if (root === "") return;

      let derived: string | null;
      try {
        derived = await ports.derive(root);
      } catch {
        // Stays 未取得. 導出できない would tell the user their directory name yields no slug, which
        // is a claim about the name — a call that failed says nothing about it. The registration
        // itself reports what is actually wrong with the root, with its own reason (doc-3 §4.1).
        return;
      }
      if (token !== calls) return;

      ports.show(derived === null ? { state: "underivable" } : { state: "derived", slug: derived });
    },
    clear(): void {
      begin();
    },
  };
}
