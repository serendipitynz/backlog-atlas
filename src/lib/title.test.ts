import { describe, expect, it } from "vitest";
import { APP_NAME, TITLE_CONFIRM_WAITS, confirmTitleApplied, windowTitle } from "./title";
import type { SwimlaneTotals } from "./swimlane";

const TOTALS: SwimlaneTotals = {
  shownCards: 4,
  totalCards: 7,
  shownLanes: 2,
  totalLanes: 3,
};

describe("windowTitle", () => {
  it("puts 総件数 after the app's name on the swimlane", () => {
    expect(windowTitle(TOTALS)).toBe("Backlog Atlas — 表示 4 / 7 件 ・ 2 / 3 プロジェクト");
  });

  it("prints the name alone where there is no グリッド to count", () => {
    // プロジェクト詳細画面 (doc-7 §2.1 keeps 総件数 to the screen the two ratios describe).
    expect(windowTitle(null)).toBe(APP_NAME);
  });
});

/**
 * The name exists in three files and no code can derive one of them from another (`title.ts` says why),
 * so what keeps them in step is this check. It reads the two others as text rather than importing them:
 * `tauri.conf.json` is the OS's copy and `index.html` the document's, and neither is a module.
 */
describe("APP_NAME", () => {
  const STATIC: Record<string, string> = import.meta.glob(
    ["../../index.html", "../../src-tauri/tauri.conf.json"],
    { eager: true, query: "?raw", import: "default" },
  );

  const read = (suffix: string): string => {
    const path = Object.keys(STATIC).find((name) => name.endsWith(suffix));
    expect(path, `${suffix} is not reachable from this test`).toBeDefined();
    return STATIC[path!];
  };

  it("is the window title `tauri.conf.json` gives the OS", () => {
    const config = JSON.parse(read("/src-tauri/tauri.conf.json"));
    expect(config.app.windows[0].title).toBe(APP_NAME);
  });

  it("is the document title `index.html` carries", () => {
    expect(read("/index.html")).toContain(`<title>${APP_NAME}</title>`);
  });
});

/**
 * The rule that says whether a title write landed (decision-31, PR #124 の 3R [P2]). Held as a pure
 * function with its reader and its clock passed in, because what it is about is *waiting* — a check
 * written against the real ones would either sleep for seconds or prove nothing.
 */
describe("confirmTitleApplied", () => {
  /** A clock that runs no timer: the rule is the sequence of reads, not how long each wait was. */
  const noWait = (): Promise<void> => Promise.resolve();

  it("answers at once when the title is already what was asked for", async () => {
    const reads: string[] = [];
    const read = (): Promise<string> => {
      reads.push("read");
      return Promise.resolve("Backlog Atlas — 表示 1 / 1 件 ・ 1 / 1 プロジェクト");
    };

    expect(
      await confirmTitleApplied(read, () => "Backlog Atlas — 表示 1 / 1 件 ・ 1 / 1 プロジェクト", noWait),
    ).toBeNull();
    expect(reads).toHaveLength(1);
  });

  it("waits out a write that is still queued rather than calling it a failure", async () => {
    // tao's Linux `set_title` resolves while GTK still holds the request, so the first reads answer
    // with the title the window opened on. Nothing is wrong here and nothing may be reported.
    const answers = ["Backlog Atlas", "Backlog Atlas", "Backlog Atlas — 表示 2 / 2 件 ・ 1 / 1 プロジェクト"];
    let index = 0;
    const read = (): Promise<string> => Promise.resolve(answers[Math.min(index++, answers.length - 1)]);

    expect(
      await confirmTitleApplied(read, () => "Backlog Atlas — 表示 2 / 2 件 ・ 1 / 1 プロジェクト", noWait),
    ).toBeNull();
    expect(index).toBe(3);
  });

  it("follows a newer title that landed mid-check instead of failing the older one", async () => {
    // 総件数 moves with every 絞り込み keystroke. A wanted value captured at the first read would see
    // the newer title in the window and report the window manager as broken.
    let asked = "Backlog Atlas — 表示 9 / 9 件 ・ 1 / 1 プロジェクト";
    let round = 0;
    const read = (): Promise<string> => {
      round += 1;
      if (round === 1) {
        return Promise.resolve("Backlog Atlas");
      }
      asked = "Backlog Atlas — 表示 3 / 9 件 ・ 1 / 1 プロジェクト";
      return Promise.resolve(asked);
    };

    expect(await confirmTitleApplied(read, () => asked, noWait)).toBeNull();
  });

  it("reports the title actually found once the waits run out", async () => {
    const read = (): Promise<string> => Promise.resolve("Backlog Atlas");

    expect(await confirmTitleApplied(read, () => "Backlog Atlas — 表示 5 / 5 件 ・ 2 / 2 プロジェクト", noWait))
      .toBe("Backlog Atlas");
  });

  it("accepts an earlier title that lands after the wanted one moved on", async () => {
    // The shape a fresh budget per change was meant to fix, without the unbounded chase it brings:
    // the target moves on the second-to-last attempt, and the write from *before* it lands on the
    // last read. What that read proves is that writing works, so nothing may be reported.
    const early = "Backlog Atlas — 表示 0 / 0 件 ・ 0 / 0 プロジェクト";
    const late = "Backlog Atlas — 表示 7 / 7 件 ・ 2 / 2 プロジェクト";
    let asked = early;
    let round = 0;
    const read = (): Promise<string> => {
      round += 1;
      // Every read but the last answers with the title the window opened on.
      return Promise.resolve(round <= TITLE_CONFIRM_WAITS.length ? "Backlog Atlas" : early);
    };
    const wait = (): Promise<void> => {
      if (round === TITLE_CONFIRM_WAITS.length - 1) {
        asked = late;
      }
      return Promise.resolve();
    };

    expect(await confirmTitleApplied(read, () => asked, wait)).toBeNull();
  });

  it("asks once per wait and no more", async () => {
    let reads = 0;
    const read = (): Promise<string> => {
      reads += 1;
      return Promise.resolve("そのまま");
    };
    const waited: number[] = [];
    const wait = (ms: number): Promise<void> => {
      waited.push(ms);
      return Promise.resolve();
    };

    await confirmTitleApplied(read, () => "別の題", wait);
    expect(waited).toEqual([...TITLE_CONFIRM_WAITS]);
    expect(reads).toBe(TITLE_CONFIRM_WAITS.length + 1);
  });
});
