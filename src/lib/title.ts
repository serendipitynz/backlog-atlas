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
