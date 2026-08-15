/**
 * 総件数 as the タイトルバー carries it (decision-31, doc-7 §2.1).
 *
 * One rule for both halves of that decision's OS split: on macOS the string is what the 帯 Atlas draws
 * prints (`TitleBar.svelte`), on Windows・Linux it is what the window's own title is set to. Writing it
 * once is the point — both platforms show the same sentence, and a screen assembling its own would be a
 * second place for the wording to drift.
 */

import { totalsLabel, type SwimlaneTotals } from "./swimlane";

/**
 * The application's name, as the title bar prints it.
 *
 * **The third of three spellings, and `title.test.ts` holds them together.** The other two are
 * `tauri.conf.json`'s window `title` — the OS's, applied before any page exists — and `index.html`'s
 * `<title>`, which is the document's. Neither can stand in for this one: the first is not readable from
 * the page, and the second names a different thing. So the copy is real, and what keeps it from drifting
 * is a check rather than this sentence.
 */
export const APP_NAME = "Backlog Atlas";

/**
 * The title bar's whole line. `null` totals is プロジェクト詳細画面 — the name alone, because both
 * ratios describe the グリッド and doc-7 §2.1 keeps 総件数 to the screen that has one.
 *
 * The em dash is the separator rather than a colon or a bracket: what follows is not a value belonging
 * to the name, it is what this window is showing right now.
 */
export function windowTitle(totals: SwimlaneTotals | null): string {
  if (totals === null) {
    return APP_NAME;
  }
  return `${APP_NAME} — ${totalsLabel(totals)}`;
}

/**
 * How long to keep asking, in milliseconds between reads. Five tries over about 1.5 s.
 *
 * **A write that has been accepted is not a title that has been applied.** On Linux tao's `set_title`
 * puts a `WindowRequest::Title` on a channel and returns, so the setter resolves while GTK still has
 * the request queued — a single immediate read there would report the old title as the window
 * manager's answer and raise a warning about a write that was about to land.
 */
export const TITLE_CONFIRM_WAITS: readonly number[] = [50, 100, 200, 400, 800];

/**
 * Whether the window's title reached what was asked for. `null` means it did; a string is the title
 * actually found once the waits above ran out, which is what the user is told.
 *
 * `wanted` is re-read on every attempt rather than captured, so a newer title landing mid-check ends
 * the check on its own terms instead of failing the older one — the 総件数 changes with every 絞り込み
 * keystroke, and a captured value would report a stale mismatch as a broken window manager.
 *
 * The reader, the clock and the wanted value are all parameters: what this holds is the rule, and a
 * rule about waiting cannot be tested against a real one.
 */
export async function confirmTitleApplied(
  read: () => Promise<string>,
  wanted: () => string,
  wait: (ms: number) => Promise<void>,
  waits: readonly number[] = TITLE_CONFIRM_WAITS,
): Promise<string | null> {
  let found = await read();
  if (found === wanted()) {
    return null;
  }
  for (const ms of waits) {
    await wait(ms);
    found = await read();
    if (found === wanted()) {
      return null;
    }
  }
  return found;
}
