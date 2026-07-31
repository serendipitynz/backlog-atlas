/**
 * The one place the running platform is read (TASK-56). doc-7 §2.1 maps the 共通修飾キー to Command on
 * macOS and to Control on Windows・Linux, and that mapping decides which press *matches* as well as how the
 * chord is printed (`shortcuts.ts`) — the other platform's modifier is left to whatever it already does
 * there, which on macOS is caret movement inside a text field.
 *
 * Read once at import rather than per press: it cannot change while the app runs, and every match and
 * every printed hint would otherwise re-derive it. Kept out of `shortcuts.ts` so that module stays free
 * of the DOM and testable as a pure contract.
 *
 * Not a new production dependency and not a boundary command: `@tauri-apps/plugin-os` or a Rust probe
 * would be a lot of machinery for a string a WebView reports deterministically per platform, and
 * AGENTS.md wants a reason before either. `isMacUserAgent` says what a misread costs.
 */

import { isMacUserAgent } from "./shortcuts";

/** Whether chords are spelled the macOS way. False anywhere without a user agent to read. */
export const MAC_KEYBOARD =
  typeof navigator === "undefined" ? false : isMacUserAgent(navigator.userAgent);
