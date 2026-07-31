/**
 * The one place the running platform is read (TASK-56). doc-7 §2.1 makes the OS decide how a 修飾キー is
 * *written* — Command on macOS, Control on Windows・Linux — while the assignment itself stays one chord
 * answered by either key (`shortcuts.ts`). So this value reaches only labels, and a wrong answer misprints
 * a hint rather than leaving an operation unreachable.
 *
 * Read once at import rather than per hint: it cannot change while the app runs, and every control that
 * prints a chord would otherwise re-derive it. Kept out of `shortcuts.ts` so that module stays free of
 * the DOM and testable as a pure contract.
 *
 * Not a new production dependency and not a boundary command: `@tauri-apps/plugin-os` or a Rust probe
 * would both be a lot of machinery for a fact that only spells a label, and AGENTS.md wants a reason
 * before either.
 */

import { isMacUserAgent } from "./shortcuts";

/** Whether chords are spelled the macOS way. False anywhere without a user agent to read. */
export const MAC_KEYBOARD =
  typeof navigator === "undefined" ? false : isMacUserAgent(navigator.userAgent);
