import { describe, expect, it } from "vitest";
import {
  HEADER_ENTRIES,
  SHORTCUT_HELP_LABEL,
  SHOW_ALL_PROJECTS_LABEL,
  headerMenu,
  projectMenuLabel,
  showAllProjectsHeld,
  startsGroup,
  type MenuItem,
  type MenuProject,
} from "./header";
import { SHORTCUTS } from "./shortcuts";

function kinds(items: MenuItem[]): string[] {
  return items.map((item) => item.kind);
}

/** One registered project with a name, shown unless told otherwise. */
function project(slug: string, shown = true, name: string | null = `${slug} プロジェクト`): MenuProject {
  return { slug, name, shown };
}

describe("共通入口 (doc-7 §2.1)", () => {
  /**
   * doc-7 §2.1: 1 プロジェクトに閉じた操作（台帳エントリの編集・登録解除・文書・マイルストーン・詳細な
   * 新規タスク作成）は固定ヘッダに置かず、プロジェクト詳細画面へ集める。The header's メニュー draws this
   * list and only this list, so the check is that the list stays the two ledger-wide entries.
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

describe("メニュー項目 (doc-7 §2.1)", () => {
  /** doc-7 §2.1: メニューが 共通入口 を全部持つ — since TASK-66 it is the only place they are drawn. */
  it("carries every 共通入口, in the order 共通入口 are listed", () => {
    const entries = headerMenu([]).flatMap((item) => (item.kind === "entry" ? [item.entry] : []));
    expect(entries).toEqual([...HEADER_ENTRIES]);
  });

  /**
   * The 割り当て一覧 line sits above the プロジェクト一覧 and not at the end of the menu: the group's
   * length is the size of the ledger, so a fixed line placed after it would be at a different position
   * once a project is registered. Checked against the group rather than at an index, so the intent
   * survives a new line.
   */
  it("puts the 割り当て一覧 line above the プロジェクト一覧, whatever its length", () => {
    for (const projects of [[], [project("atlas")], [project("atlas"), project("kanri")]]) {
      const order = kinds(headerMenu(projects));
      expect(order.indexOf("shortcutHelp")).toBeLessThan(order.indexOf("showAllProjects"));
    }
    expect(headerMenu([]).find((item) => item.kind === "shortcutHelp")?.label).toBe(
      SHORTCUT_HELP_LABEL,
    );
  });

  /**
   * AC #1: 登録済みプロジェクトが常に 1 行ずつ並び、表示中の行にだけチェックが付いている。The list is the
   * ledger, not the hidden set — a hidden project is present here precisely because it is absent from
   * the grid — and the order is the ledger's, which is the order the grid draws its rows in.
   */
  it("lists every registered project in ledger order, marking the shown ones (AC #1)", () => {
    const items = headerMenu([project("atlas"), project("kanri", false), project("mallow")]);
    expect(kinds(items)).toEqual([
      "entry",
      "entry",
      "shortcutHelp",
      "showAllProjects",
      "toggleProject",
      "toggleProject",
      "toggleProject",
    ]);
    const rows = items.flatMap((item) => (item.kind === "toggleProject" ? [item] : []));
    expect(rows.map((row) => row.slug)).toEqual(["atlas", "kanri", "mallow"]);
    expect(rows.map((row) => row.shown)).toEqual([true, false, true]);
  });

  /**
   * AC #3 の無効化側. すべてのプロジェクトを表示 is offered whether or not it has anything to do, and says
   * why when it has not — 理由の無い無効化を置かない (doc-11 §5). The reason is read off the list rather
   * than from a separate count, so the line cannot disagree with the ticks below it.
   */
  it("holds すべてのプロジェクトを表示 exactly while every row is shown (AC #3)", () => {
    const allShown = headerMenu([project("atlas"), project("kanri")]);
    const some = headerMenu([project("atlas"), project("kanri", false)]);
    const held = allShown.find((item) => item.kind === "showAllProjects");
    const free = some.find((item) => item.kind === "showAllProjects");
    expect(held?.label).toBe(SHOW_ALL_PROJECTS_LABEL);
    expect(held?.held).not.toBeNull();
    expect(free?.held).toBeNull();
  });

  /**
   * AC #1 の語の側. The name is what the user asked each line to carry (2026-08-09), and the slug is
   * what a row without one falls back to — a root that could not be read has no `config.yml` to take a
   * name from (doc-7 §6), and a line with no word at all would name no row.
   */
  it("names each 表示切替行 by its project name, falling back to the slug", () => {
    const items = headerMenu([project("atlas", true, "Backlog Atlas"), project("kanri", true, null)]);
    const labels = items.flatMap((item) => (item.kind === "toggleProject" ? [item.label] : []));
    expect(labels).toEqual(["Backlog Atlas", "kanri"]);
  });

  /**
   * The menu is drawn as a keyed `{#each}`, and Svelte treats a duplicate key as a runtime error — so a
   * key that repeats does not degrade the menu, it stops the menu rendering at all. That is how the two
   * 共通入口 (which share a `kind`) took the whole menu down once: nothing but opening it noticed. The
   * keys are data now, so this is the check that would have. Two projects sharing a *name* is the case
   * this list added: the key has to come from the slug, which the ledger keeps unique (doc-3 §3.1).
   */
  it("gives every line a key of its own, even when two projects share a name", () => {
    const keys = headerMenu([
      project("atlas", true, "同じ名前"),
      project("kanri", false, "同じ名前"),
    ]).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("保留理由 (doc-11 §5)", () => {
  it("holds すべてのプロジェクトを表示 at 0 hidden rows only", () => {
    expect(showAllProjectsHeld(0)).not.toBeNull();
    expect(showAllProjectsHeld(1)).toBeNull();
  });

  /**
   * The fallback is the slug and never an empty label: an unnamed line names no row, and a name that
   * is present but empty leaves the line just as unnamed as a missing one.
   */
  it("never labels a 表示切替行 with nothing", () => {
    expect(projectMenuLabel({ slug: "atlas", name: null, shown: true })).toBe("atlas");
    expect(projectMenuLabel({ slug: "atlas", name: "", shown: true })).toBe("atlas");
  });
});

describe("区切り線 (doc-7 §2.1)", () => {
  /** Every index a 区切り線 is drawn above, for a given project list. */
  function rules(projects: readonly MenuProject[]): number[] {
    const items = headerMenu(projects);
    return items.flatMap((_, index) => (startsGroup(items, index) ? [index] : []));
  }

  /**
   * AC #2 の肯定形 of TASK-130, still held here. Stated as "the mark does not appear and disappear",
   * which a menu with no mark at all satisfies vacuously — so the check has to be that a mark is there
   * and at the same index in both conditions. The two conditions are the two the user saw: nothing to
   * restore (すべてのプロジェクトを表示 held, 破線枠 up) and something to restore (pressable, no frame).
   * doc-11 §5 keeps drawing that frame; what must not move with it is this.
   */
  it("draws one 区切り線, at the same place whether or not the すべて line is held", () => {
    const shown = [project("atlas")];
    const hidden = [project("atlas", false)];
    expect(headerMenu(shown).find((item) => item.kind === "showAllProjects")?.held).not.toBeNull();
    expect(headerMenu(hidden).find((item) => item.kind === "showAllProjects")?.held).toBeNull();

    expect(rules([])).toEqual([3]);
    expect(rules(shown)).toEqual([3]);
    expect(rules([project("atlas"), project("kanri", false)])).toEqual([3]);
  });

  /**
   * The 群 is what pressing the line does, not where the line sits: `layer` lines raise a 被せ層 and
   * `rows` lines change which rows the grid draws. Checked as a partition rather than at indices, so a
   * line added to either 群 keeps the boundary meaningful.
   */
  it("puts every 被せ層 line in one 群 and every プロジェクト一覧 line in the other", () => {
    const items = headerMenu([project("atlas")]);
    const groups = Object.fromEntries(items.map((item) => [item.key, item.group]));
    expect(groups).toEqual({
      "entry:register": "layer",
      "entry:settings": "layer",
      shortcutHelp: "layer",
      showAllProjects: "rows",
      "project:atlas": "rows",
    });
  });

  it("draws no 区切り線 above the first line", () => {
    expect(startsGroup(headerMenu([]), 0)).toBe(false);
  });
});

describe("画面に出る語", () => {
  /**
   * Both words came from the user (2026-08-09 のフィードバック原文) and nothing in the build derives
   * either, so they are recorded the way a wire payload and a measured number are — by equality. Each
   * is checked against its literal here because every other place that prints it takes these constants,
   * which means no other test would notice the word changing.
   */
  it("names the 一覧 line and the すべて line in the user's words", () => {
    expect(SHORTCUT_HELP_LABEL).toBe("キーボード操作一覧");
    expect(SHOW_ALL_PROJECTS_LABEL).toBe("すべてのプロジェクトを表示");
  });

  /**
   * The line is named for the layer it opens, as 登録 and 設定 already are. Held here rather than left to
   * the component test: the ellipsis this word lost in TASK-130 was the whole of what once told the two
   * apart, so a `…` added back to either would be the same drift returning.
   */
  it("names the 一覧 line for the layer, with nothing trailing", () => {
    expect(SHORTCUT_HELP_LABEL).not.toMatch(/[…．.]+$/);
  });
});
