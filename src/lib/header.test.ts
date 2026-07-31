import { describe, expect, it } from "vitest";
import {
  HEADER_ENTRIES,
  SHOW_ALL_ROWS_LABEL,
  headerMenu,
  showAllRowsHeld,
  type MenuItem,
} from "./header";
import { SHORTCUTS } from "./shortcuts";

function kinds(items: MenuItem[]): string[] {
  return items.map((item) => item.kind);
}

describe("共通入口 (doc-7 §2.1)", () => {
  /**
   * doc-7 §2.1: 1 プロジェクトに閉じた操作（台帳エントリの編集・登録解除・文書・マイルストーン・詳細な
   * 新規タスク作成）は固定ヘッダに置かず、プロジェクト詳細画面へ集める。The header draws this list and
   * only this list, so the check is that the list stays the two ledger-wide entries.
   */
  it("holds the two 全プロジェクトに効く入口 and nothing per-project", () => {
    expect(HEADER_ENTRIES.map((entry) => entry.id)).toEqual(["register", "settings"]);
  });

  it("points every entry at an assignment that exists in the 割り当て一覧", () => {
    for (const entry of HEADER_ENTRIES) {
      expect(SHORTCUTS.some((binding) => binding.action === entry.action)).toBe(true);
    }
  });
});

describe("メニュー項目 (doc-7 §2.1, doc-11 §4 ⑥)", () => {
  /** doc-7 §2.1: ヘッダに出している操作はメニューにも同じものを置く。 */
  it("repeats every 共通入口, in the header's order", () => {
    const entries = headerMenu([]).flatMap((item) => (item.kind === "entry" ? [item.entry] : []));
    expect(entries).toEqual([...HEADER_ENTRIES]);
  });

  it("offers すべて戻す with a 保留理由 while nothing is hidden (AC #5)", () => {
    const items = headerMenu([]);
    expect(kinds(items)).toEqual(["entry", "entry", "showAllRows"]);
    const all = items.find((item) => item.kind === "showAllRows");
    expect(all?.label).toBe(SHOW_ALL_ROWS_LABEL);
    // 理由の無い無効化を置かない (doc-11 §5): the control is present, held, and says why.
    expect(all?.held).not.toBeNull();
  });

  /** doc-11 §4: 個々のレーンはメニューの一覧から戻す — the part the 帯 hands over. */
  it("lists one line per hidden row, in the order they were hidden", () => {
    const items = headerMenu(["atlas", "kanri"]);
    expect(kinds(items)).toEqual(["entry", "entry", "showAllRows", "showRow", "showRow"]);
    expect(items.filter((item) => item.kind === "showRow").map((item) => item.slug)).toEqual([
      "atlas",
      "kanri",
    ]);
    expect(items.find((item) => item.kind === "showAllRows")?.held).toBeNull();
  });

  it("names the row in each 戻す line, so the menu is readable without the grid", () => {
    const row = headerMenu(["atlas"]).find((item) => item.kind === "showRow");
    expect(row?.label).toContain("atlas");
  });

  /**
   * The menu is drawn as a keyed `{#each}`, and Svelte treats a duplicate key as a runtime error — so a
   * key that repeats does not degrade the menu, it stops the menu rendering at all. That is how the two
   * 共通入口 (which share a `kind`) took the whole menu down once: nothing but opening it noticed. The
   * keys are data now, so this is the check that would have.
   */
  it("gives every line a key of its own", () => {
    const keys = headerMenu(["atlas", "kanri"]).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("保留理由 (doc-11 §5)", () => {
  it("holds すべて戻す at 0 hidden rows only", () => {
    expect(showAllRowsHeld(0)).not.toBeNull();
    expect(showAllRowsHeld(1)).toBeNull();
  });
});
