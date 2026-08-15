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
 * Whether the window's title reached anything that was asked for. `null` means it did; a string is the
 * title actually found once the waits above ran out, which is what the user is told.
 *
 * **The question is whether writing works, not whether the newest write has landed yet.** So every
 * title `wanted` reports along the way is kept, and seeing *any* of them in the window ends the check:
 * the window carrying a title this app asked for is the whole of what the ⑤ 通知 would have denied.
 *
 * That is what makes a moving target harmless. 総件数 changes with every 絞り込み keystroke and again
 * when the workspace read lands, so a check that matched only the newest value would fail an older
 * write that was applied correctly a moment later — and giving each new value a fresh budget instead
 * would let a user typing steadily keep the check running with no bound at all. Here the budget is
 * fixed and the answer only gets easier to satisfy.
 *
 * It can miss one case, and that direction is deliberate: a window whose title already equals a value
 * this app would ask for reads as applied without anything having been written. The first check runs at
 * startup on スイムレーン, where the line carries 総件数 and the window's title is the bare app name, so
 * the two differ — and a missed report is a smaller wrong than a warning about a write that worked.
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
  const asked = new Set<string>([wanted()]);
  let found = await read();
  if (asked.has(found)) {
    return null;
  }
  for (const ms of waits) {
    await wait(ms);
    asked.add(wanted());
    found = await read();
    if (asked.has(found)) {
      return null;
    }
  }
  return found;
}
