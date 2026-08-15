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

/** Whether this is macOS. False anywhere without a user agent to read. */
const MAC = typeof navigator === "undefined" ? false : isMacUserAgent(navigator.userAgent);

/** Whether chords are spelled the macOS way. */
export const MAC_KEYBOARD = MAC;

/**
 * 重ね型 (decision-31): whether the タイトルバーの帯 is Atlas's to draw. True on macOS, where
 * `titleBarStyle: "Overlay"` makes the window's title bar transparent and hands the page the full
 * window height; false on Windows・Linux, where the OS draws the bar and 総件数 reaches the user as the
 * window's own title instead.
 *
 * **A value rather than a `cfg`-shaped branch** (m-1 TASK-44): the two halves are one decision read in
 * one place, so neither screen can be built for a platform the other half was not.
 *
 * Read from the same user agent `MAC_KEYBOARD` is, and it is the same fact — but named separately
 * because a misread costs something different here. A chord that spells `Ctrl` on a Mac still works;
 * a 帯 drawn where the OS is already drawing one would print the app name twice, and one drawn nowhere
 * would lose 総件数 altogether. That is why `titleBarStyle` in `tauri.conf.json` and this value have to
 * be changed together.
 */
export const OVERLAY_TITLE_BAR = MAC;
