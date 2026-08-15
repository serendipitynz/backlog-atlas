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

  const APPLIED = "Backlog Atlas — 表示 1 / 1 件 ・ 1 / 1 プロジェクト";

  it("answers at once when the window already carries a title that was asked for", async () => {
    let reads = 0;
    const read = (): Promise<string> => {
      reads += 1;
      return Promise.resolve(APPLIED);
    };

    expect(await confirmTitleApplied(read, () => new Set([APPLIED]), noWait)).toBeNull();
    expect(reads).toBe(1);
  });

  it("waits out a write that is still queued rather than calling it a failure", async () => {
    // tao's Linux `set_title` resolves while GTK still holds the request, so the first reads answer
    // with the title the window opened on. Nothing is wrong here and nothing may be reported.
    const answers = ["Backlog Atlas", "Backlog Atlas", APPLIED];
    let index = 0;
    const read = (): Promise<string> =>
      Promise.resolve(answers[Math.min(index++, answers.length - 1)]);

    expect(await confirmTitleApplied(read, () => new Set([APPLIED]), noWait)).toBeNull();
    expect(index).toBe(3);
  });

  it("accepts any title that was asked for, not only the newest", async () => {
    // 総件数 moves with every 絞り込み keystroke and again when the workspace read lands. An older
    // write applying afterwards proves the window manager works, so it ends the check.
    const older = "Backlog Atlas — 表示 0 / 0 件 ・ 0 / 0 プロジェクト";
    const asked = new Set([older]);
    let round = 0;
    const read = (): Promise<string> => {
      round += 1;
      if (round === 1) {
        asked.add(APPLIED);
        return Promise.resolve("Backlog Atlas");
      }
      return Promise.resolve(older);
    };

    expect(await confirmTitleApplied(read, () => asked, noWait)).toBeNull();
  });

  it("recognises a title written between two of its own reads", async () => {
    // The writer fills the set, so a title issued while this function was waiting is in it even though
    // no read of its own ever sampled that moment. Under a queueing platform that is the very title a
    // later read returns.
    const between = "Backlog Atlas — 表示 4 / 9 件 ・ 2 / 2 プロジェクト";
    const asked = new Set(["Backlog Atlas — 表示 9 / 9 件 ・ 2 / 2 プロジェクト"]);
    let round = 0;
    const read = (): Promise<string> => {
      round += 1;
      return Promise.resolve(round <= 2 ? "Backlog Atlas" : between);
    };
    const wait = (): Promise<void> => {
      // Two writes land between the first and second read; only the later one would have been sampled.
      asked.add(between);
      asked.add("Backlog Atlas — 表示 1 / 9 件 ・ 2 / 2 プロジェクト");
      return Promise.resolve();
    };

    expect(await confirmTitleApplied(read, () => asked, wait)).toBeNull();
  });

  it("reports the title actually found once the waits run out", async () => {
    const read = (): Promise<string> => Promise.resolve("Backlog Atlas");

    expect(await confirmTitleApplied(read, () => new Set([APPLIED]), noWait)).toBe("Backlog Atlas");
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

    await confirmTitleApplied(read, () => new Set(["別の題"]), wait);
    expect(waited).toEqual([...TITLE_CONFIRM_WAITS]);
    expect(reads).toBe(TITLE_CONFIRM_WAITS.length + 1);
  });
});
