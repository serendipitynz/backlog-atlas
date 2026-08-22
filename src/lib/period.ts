/**
 * 更新期間の暦日 (doc-7 §5.2). The one place that turns a frontmatter timestamp — and a 相対指定 —
 * into the `YYYY-MM-DD` a 期間の端 is compared against. What the ends then *do* to a card is
 * `filter.ts`; how they are shown and taken back is `token.ts`.
 *
 * ## Referent table (doc-7 §5.2 term → identifier here)
 *
 * | doc-7 §5.2 | here | is |
 * |---|---|---|
 * | 暦日 | a `YYYY-MM-DD` string | one day, with no instant in it |
 * | 基準時間帯 | [`ZoneOffset`] / [`SYSTEM_ZONE`] | the zone a written timestamp is read in |
 * | 相対指定 | [`relativeStart`] | いまから X 日 / 週 / 月 → a 始端 |
 * | 解決時点 | the `now` argument | the instant a 相対指定 is turned into a 暦日 at |
 * | 解析できない値 | `localDay` returning `null` | a value in neither accepted form |
 *
 * **Why this module reads the machine's zone at all**, when 並び順 has the opposite rule
 * (doc-7 §5.4's 「日付を文字列のまま比べる」, and doc-4 §7's 「比較は locale を読まない」 — the
 * second moved there with TASK-165): a 並び順 only needs the
 * *relative* order of two values, and a uniform shift leaves that untouched, so the sort can stay on
 * the raw strings. A 期間 compares each value against an *absolute* boundary the user named, and the
 * boundary is a day on the user's own calendar — 「今日更新したもの」 is a question whose answer
 * depends on where the person asking is. The shift therefore lands directly on which cards survive,
 * and refusing to apply it would not make the screen zone-independent; it would only make it read
 * every timestamp in a zone nobody is in.
 *
 * **Measured, not assumed**: Backlog CLI v1.50.1 writes `created_date` / `updated_date` in **UTC**
 * (measured 2026-08-22 on v1.50.1, TASK-153: a clock reading `2026-08-22 10:27` NZST produced
 * `'2026-08-21 22:27'`). The observation that established this was made on v1.48.0
 * (2026-08-10, TASK-133: `2026-08-10 10:46` NZST → `'2026-08-09 22:46'`) and is kept because it is
 * where the rule came from; the version this note asserts about is the one above it.
 * Reading such a value as local wall clock would put a task updated a minute ago outside 「今日」
 * by twelve hours.
 */

import { msg } from "./messages";

/**
 * Minutes **east** of UTC at a given instant — the sign convention of the offset as it is written
 * (`+12:00` → `720`), which is the opposite of `Date.prototype.getTimezoneOffset`.
 *
 * Injectable because it is the only thing in this module the environment decides, and a test that
 * had to arrange the machine's zone to state a rule would be testing the machine.
 */
export type ZoneOffset = (instant: Date) => number;

/** The zone the app actually runs in. The only caller that reads it is a default argument below. */
export const SYSTEM_ZONE: ZoneOffset = (instant) => -instant.getTimezoneOffset();

/** The units 相対指定 offers, in the order the control lists them. */
export type PeriodUnit = "day" | "week" | "month";

export const PERIOD_UNITS: readonly PeriodUnit[] = ["day", "week", "month"];

/** The screen's word for each unit. */
export function periodUnitLabel(unit: PeriodUnit): string {
  return msg().filter.periodUnit[unit];
}

/**
 * The largest 相対指定 the control takes: four digits, which is 27 years in 日, 191 in 週 and 833 in
 * 月 — past any ledger's life, and every unit still resolves to a real day well inside what `Date`
 * can hold. **This is the width of the field, not a limit of the calendar**: `relativeStart` answers
 * `null` for anything it cannot resolve whether or not it came through this control.
 */
export const MAX_RELATIVE_COUNT = 9999;

/** Whether a 相対指定 count is one the control offers — 1〜`MAX_RELATIVE_COUNT`, whole. */
export function usableCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_RELATIVE_COUNT;
}

/**
 * The two forms a `created_date` / `updated_date` is accepted in. Both occur in real ledgers: this
 * repository's own `backlog/tasks/` holds nine tasks whose `updated_date` is a bare `2026-07-22`
 * alongside the timestamped ones the current CLI writes.
 *
 * Seconds are allowed even though v1.50.1 writes none, because a value carrying them still names one
 * instant unambiguously and the cost of refusing it is a card silently vanishing while the 期間 is on.
 * Anything else — an ISO `T` separator, a trailing `Z`, an explicit `+09:00` — is 解析できない rather
 * than guessed at: a written offset would contradict the 基準時間帯 this module applies, and
 * accepting it as if it agreed is exactly the invention doc-7 §5.4 refuses.
 */
const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WITH_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;

const MINUTE_MS = 60_000;

/**
 * 実在する暦日・時刻としての値、または `null`. `Date.UTC` normalises overflow (2026-02-31 becomes
 * 2026-03-03), so the round trip is what rejects a date that does not exist rather than a range check
 * per field — and it is also what rejects a two-digit year, since `Date.UTC(26, …)` means 1926.
 */
function utcInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | null {
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(ms);
  const real =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day;
  return real ? ms : null;
}

function formatDay(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** The 暦日 an instant falls on in the given zone. */
function dayAt(instantMs: number, zone: ZoneOffset): string {
  const shifted = new Date(instantMs + zone(new Date(instantMs)) * MINUTE_MS);
  return formatDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * The 暦日 one `updated_date` falls on, or `null` for a missing or 解析できない value (doc-7 §5.2).
 *
 * **A value carrying no time is returned as it stands.** It is already a 暦日, and there is no
 * instant in it to move: converting it would mean choosing an hour for it first, which is the one
 * thing this module is written not to do. So a bare `2026-07-22` names 2026-07-22 in every zone,
 * while `2026-07-22 22:46` names the day it falls on where the reader is.
 */
export function localDay(value: string | null, zone: ZoneOffset = SYSTEM_ZONE): string | null {
  if (value === null) {
    return null;
  }

  const plain = DAY_ONLY.exec(value);
  if (plain !== null) {
    const [, year, month, day] = plain;
    const real = utcInstant(Number(year), Number(month), Number(day), 0, 0, 0);
    return real === null ? null : value;
  }

  const stamped = WITH_TIME.exec(value);
  if (stamped === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = stamped;
  const instant = utcInstant(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );
  return instant === null ? null : dayAt(instant, zone);
}

/** 今日の暦日 in the reader's zone — the latest day a 端 can usefully name. */
export function todayLocal(now: Date, zone: ZoneOffset = SYSTEM_ZONE): string {
  return dayAt(now.getTime(), zone);
}

/**
 * 相対指定 → 始端 (doc-7 §5.2): the 暦日 that is `count` 日 / 週 / 月 back from 今日, resolved at
 * `now` and returned as an absolute day. `null` for a `count` outside `usableCount` — which includes
 * the state the control offers it in before anything is typed — and for one that resolves to no real
 * day at all.
 *
 * 週 is seven 日; 月 is a 暦月, clamped to the end of the shorter month — 2026-03-31 の 1 か月前 is
 * 2026-02-28. The arithmetic runs on the *calendar* components rather than by subtracting a duration,
 * so a daylight-saving transition inside the span cannot move the answer by a day.
 */
export function relativeStart(
  count: number,
  unit: PeriodUnit,
  now: Date,
  zone: ZoneOffset = SYSTEM_ZONE,
): string | null {
  if (!usableCount(count)) {
    return null;
  }
  const [year, month, day] = todayLocal(now, zone).split("-").map(Number);

  if (unit === "month") {
    const anchor = new Date(Date.UTC(year, month - 1 - count, 1));
    if (Number.isNaN(anchor.getTime())) {
      return null;
    }
    const targetYear = anchor.getUTCFullYear();
    const targetMonth = anchor.getUTCMonth() + 1;
    // Day 0 of the following month is the last day of this one.
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return formatDay(targetYear, targetMonth, Math.min(day, lastDay));
  }

  const back = unit === "week" ? count * 7 : count;
  const shifted = new Date(Date.UTC(year, month - 1, day - back));
  // A count far enough back leaves the range `Date` can hold (±273,790 years), and every component
  // of an invalid `Date` reads `NaN` — which `formatDay` would happily render as `0NaN-NaN-NaN` and
  // install as a 始端, giving a token that names a day nobody can read beside a condition that no
  // longer says what the token says. `MAX_RELATIVE_COUNT` keeps the control away from here; this is
  // what makes a value that reached the function anyway produce no 始端 rather than a nonsense one.
  if (Number.isNaN(shifted.getTime())) {
    return null;
  }
  return formatDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}
