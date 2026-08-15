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

/** Whether this is Linux — WebKitGTK reports `X11; Linux` whichever session type is running. */
const LINUX = typeof navigator === "undefined" ? false : /Linux/.test(navigator.userAgent);

/** Whether chords are spelled the macOS way. */
export const MAC_KEYBOARD = MAC;

/**
 * タイトルバーの帯 (decision-31, その Linux の改訂): whether Atlas draws the bar at all. macOS and
 * Linux do; Windows leaves it to the OS and reads 総件数 from the window's own title.
 *
 * **Separate from `OVERLAY_TITLE_BAR` because the two questions came apart.** They were one fact until
 * Linux turned out to need a bar *and* keep writing the title: with a single value, either Linux takes
 * macOS's traffic-light inset or Windows grows a bar it has no use for.
 */
export const DRAWN_TITLE_BAR = MAC || LINUX;

/**
 * 重ね型 (decision-31): whether the 帯 is drawn *over* the OS's own title bar rather than under it. True
 * on macOS, where `titleBarStyle: "Overlay"` makes that bar transparent and hands the page the window's
 * full height. It decides two things and nothing else — whether the 帯 leaves room for the 信号機帯 on
 * its left, and whether the window's own title is written (macOS leaves it as `tauri.conf.json` set it,
 * which is what Mission Control shows).
 *
 * **A value rather than a `cfg`-shaped branch** (m-1 TASK-44): the halves are one decision read in one
 * place, so neither screen can be built for a platform the other half was not.
 *
 * Read from the same user agent `MAC_KEYBOARD` is, and it is the same fact — but named separately
 * because a misread costs something different here. A chord that spells `Ctrl` on a Mac still works; an
 * inset taken where there are no traffic lights is 78px of blank, and the title written on macOS would
 * be written where nothing draws it. That is why `titleBarStyle` in `tauri.conf.json` and this value
 * have to be changed together.
 */
export const OVERLAY_TITLE_BAR = MAC;
