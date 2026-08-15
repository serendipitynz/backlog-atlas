import { describe, expect, it } from "vitest";
import { APP_NAME, windowTitle } from "./title";
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
