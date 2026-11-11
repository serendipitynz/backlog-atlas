import { describe, expect, it } from "vitest";
import {
  dateSortKey,
  localDay,
  relativeStart,
  todayLocal,
  usableCount,
  MAX_RELATIVE_COUNT,
  PERIOD_UNITS,
  type ZoneOffset,
} from "./period";

/**
 * 基準時間帯 is injected in every case here (doc-7 §5.2). The machine's own zone is the one thing
 * these rules must not depend on: a test that arranged `process.env.TZ` to state them would be
 * checking the runner, and would state a different rule on a machine that ran it differently.
 */
const UTC: ZoneOffset = () => 0;
/** The measured case (TASK-133): the CLI writes UTC and this repository's reader is at +12. */
const NZST: ZoneOffset = () => 12 * 60;
const HAWAII: ZoneOffset = () => -10 * 60;
/** A zone whose offset is not a whole hour, so the shift cannot be done in hours. */
const CHATHAM: ZoneOffset = () => 12 * 60 + 45;

describe("基準時間帯 (doc-7 §5.2)", () => {
  it("reads a written timestamp as UTC and answers with the reader's own 暦日", () => {
    // 2026-08-09 22:46 UTC — what the CLI wrote while the machine's clock read 2026-08-10 10:46.
    const written = "2026-08-09 22:46";
    expect(localDay(written, UTC)).toBe("2026-08-09");
    expect(localDay(written, NZST)).toBe("2026-08-10");
    expect(localDay(written, HAWAII)).toBe("2026-08-09");
    expect(localDay(written, CHATHAM)).toBe("2026-08-10");
  });

  it("moves a value backwards over a day boundary as readily as forwards", () => {
    // 03:20 UTC is still the previous day in Hawaii, and the next day nowhere.
    expect(localDay("2026-08-10 03:20", UTC)).toBe("2026-08-10");
    expect(localDay("2026-08-10 03:20", HAWAII)).toBe("2026-08-09");
    expect(localDay("2026-08-10 03:20", NZST)).toBe("2026-08-10");
  });

  it("leaves a value carrying no time alone, in every zone", () => {
    // Nine tasks in this repository's own backlog carry exactly this shape. There is no instant in
    // such a value to move, and inventing one is what the whole module is written to avoid.
    for (const zone of [UTC, NZST, HAWAII, CHATHAM]) {
      expect(localDay("2026-07-22", zone)).toBe("2026-07-22");
    }
  });

  it("accepts seconds, which name the same instant", () => {
    expect(localDay("2026-08-09 22:46:30", UTC)).toBe("2026-08-09");
  });

  it("reads the form v1.55.0 and later write as the UTC instant it names (TASK-214)", () => {
    // The same instant as the measured case above, written the way the CLI writes it now.
    const written = "2026-08-09T22:46:00Z";
    expect(localDay(written, UTC)).toBe("2026-08-09");
    expect(localDay(written, NZST)).toBe("2026-08-10");
    expect(localDay(written, HAWAII)).toBe("2026-08-09");
    expect(localDay("2026-08-09T22:46Z", NZST)).toBe("2026-08-10");
  });

  it("moves a written offset to UTC before reading the 暦日 (TASK-214)", () => {
    // 07:46 at +09:00 is 22:46 UTC the day before — the measured instant once more.
    expect(localDay("2026-08-10T07:46:00+09:00", UTC)).toBe("2026-08-09");
    expect(localDay("2026-08-10T07:46:00+09:00", NZST)).toBe("2026-08-10");
    // A negative offset moves the other way: 20:00 at -05:00 is 01:00 UTC the next day.
    expect(localDay("2026-08-09T20:00-05:00", UTC)).toBe("2026-08-10");
    // An offset that is not a whole hour moves by its minutes too.
    expect(localDay("2026-08-10T12:44+12:45", UTC)).toBe("2026-08-09");
    expect(localDay("2026-08-10T12:45+12:45", UTC)).toBe("2026-08-10");
  });

  it("reads nothing beyond the four accepted forms", () => {
    for (const value of [
      "",
      // A `T` value that names no zone: ISO 8601 reads it as local time, and the file no longer says
      // whose.
      "2026-08-09T22:46:00",
      // An offset on a space-separated value, a compact offset, and fractional seconds.
      "2026-08-09 22:46 +09:00",
      "2026-08-09 22:46Z",
      "2026-08-09T22:46:00+0900",
      "2026-08-09T22:46:00.123Z",
      "2026-08-09t22:46:00z",
      "2026-8-9",
      "2026-08-09 22",
      "yesterday",
    ]) {
      expect(localDay(value, UTC)).toBeNull();
    }
  });

  it("refuses an offset no clock has", () => {
    expect(localDay("2026-08-09T22:46:00+24:00", UTC)).toBeNull();
    expect(localDay("2026-08-09T22:46:00+09:60", UTC)).toBeNull();
    expect(localDay("2026-08-09T24:00:00Z", UTC)).toBeNull();
    expect(localDay("2026-02-31T10:00:00Z", UTC)).toBeNull();
  });

  it("refuses an offset that carries the instant past year 9999", () => {
    // 23:00 at -05:00 is 04:00 UTC on 10000-01-01, which no four-digit form can name.
    expect(localDay("9999-12-31T23:00:00-05:00", UTC)).toBeNull();
    expect(localDay("9999-12-31T18:59:59-05:00", UTC)).toBe("9999-12-31");
  });

  it("refuses a value whose date or time does not exist", () => {
    expect(localDay("2026-02-31", UTC)).toBeNull();
    expect(localDay("2026-13-01", UTC)).toBeNull();
    expect(localDay("2026-08-09 24:00", UTC)).toBeNull();
    expect(localDay("2026-08-09 22:60", UTC)).toBeNull();
    // A two-digit year would mean 1926 to `Date.UTC`; the round trip is what rejects it.
    expect(localDay("0026-08-09 22:46", UTC)).toBeNull();
  });

  it("has no 暦日 for a task that carries no updated_date", () => {
    expect(localDay(null, UTC)).toBeNull();
  });

  it("reads 今日 in the same zone the values are read in", () => {
    const now = new Date("2026-08-09T22:46:00Z");
    expect(todayLocal(now, UTC)).toBe("2026-08-09");
    expect(todayLocal(now, NZST)).toBe("2026-08-10");
  });
});

describe("並び順の鍵 (doc-7 §5.4)", () => {
  it("spells every timestamped form of one instant the same way", () => {
    for (const value of [
      "2026-08-09 22:46",
      "2026-08-09 22:46:00",
      "2026-08-09T22:46:00Z",
      "2026-08-09T22:46Z",
      "2026-08-10T07:46:00+09:00",
      "2026-08-09T17:46-05:00",
    ]) {
      expect(dateSortKey(value)).toBe("2026-08-09 22:46:00");
    }
  });

  it("leaves a value with no time, and one it cannot read, as they stand", () => {
    expect(dateSortKey("2026-07-22")).toBe("2026-07-22");
    expect(dateSortKey("いつか")).toBe("いつか");
    expect(dateSortKey("2026-08-09T22:46:00")).toBe("2026-08-09T22:46:00");
  });

  it("spells a year below 1000 in four digits, so the key still orders as text", () => {
    // An offset can carry 0100-01-01 back into year 99.
    expect(dateSortKey("0100-01-01T00:30+01:00")).toBe("0099-12-31 23:30:00");
  });
});

describe("相対指定 (doc-7 §5.2)", () => {
  /** 2026-08-10 10:46 NZST — 2026-08-09 22:46 UTC. */
  const now = new Date("2026-08-09T22:46:00Z");

  it("counts 日 as calendar days back from 今日 in the reader's zone", () => {
    expect(relativeStart(1, "day", now, NZST)).toBe("2026-08-09");
    expect(relativeStart(7, "day", now, NZST)).toBe("2026-08-03");
    // 今日 is a different day in UTC, so every answer moves with it.
    expect(relativeStart(7, "day", now, UTC)).toBe("2026-08-02");
  });

  it("counts 週 as seven 日", () => {
    expect(relativeStart(1, "week", now, NZST)).toBe("2026-08-03");
    expect(relativeStart(2, "week", now, NZST)).toBe("2026-07-27");
  });

  it("counts 月 as 暦月, not as a number of days", () => {
    expect(relativeStart(1, "month", now, NZST)).toBe("2026-07-10");
    expect(relativeStart(3, "month", now, NZST)).toBe("2026-05-10");
    // Across the year boundary.
    expect(relativeStart(2, "month", new Date("2026-01-15T05:00:00Z"), UTC)).toBe("2025-11-15");
  });

  it("clamps 月 to the end of a shorter month", () => {
    const march31 = new Date("2026-03-31T05:00:00Z");
    expect(relativeStart(1, "month", march31, UTC)).toBe("2026-02-28");
    expect(relativeStart(1, "month", new Date("2024-03-31T05:00:00Z"), UTC)).toBe("2024-02-29");
  });

  it("crosses a month boundary by days without help", () => {
    expect(relativeStart(30, "day", new Date("2026-01-15T05:00:00Z"), UTC)).toBe("2025-12-16");
  });

  it("resolves at the moment it is asked, so the same 相対指定 answers differently later", () => {
    const later = new Date("2026-08-11T22:46:00Z");
    expect(relativeStart(1, "day", now, UTC)).toBe("2026-08-08");
    expect(relativeStart(1, "day", later, UTC)).toBe("2026-08-10");
  });

  it("has no answer for a count that is not a positive whole number", () => {
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(relativeStart(count, "day", now, UTC)).toBeNull();
    }
  });

  it("takes counts up to the control's cap and nothing past it", () => {
    expect(usableCount(1)).toBe(true);
    expect(usableCount(MAX_RELATIVE_COUNT)).toBe(true);
    expect(usableCount(MAX_RELATIVE_COUNT + 1)).toBe(false);
    expect(usableCount(0)).toBe(false);
    expect(usableCount(1.5)).toBe(false);

    // Every unit still lands on a real day at the cap, which is what makes it a width rather than a
    // place the arithmetic gives out.
    for (const unit of PERIOD_UNITS) {
      expect(relativeStart(MAX_RELATIVE_COUNT, unit, now, UTC)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("answers null rather than a nonsense day for a count no calendar can hold", () => {
    // A billion 日 leaves the range `Date` holds; every component of the result then reads NaN, and
    // formatting it would give `0NaN-NaN-NaN` — a 始端 that draws a token nobody can read beside a
    // condition that no longer means what the token says.
    for (const unit of PERIOD_UNITS) {
      expect(relativeStart(1_000_000_000, unit, now, UTC)).toBeNull();
    }
  });
});
