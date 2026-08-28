import { describe, expect, it } from "vitest";
import {
  externalOpenEntry,
  HEADER_ENTRIES,
  headerEntryView,
  noProjectsReason,
  shortcutHelpLabel,
  showAllProjectsHeldReason,
  showAllProjectsLabel,
  releaseNoticeText,
  releasePageLabel,
  headerMenu,
  menuName,
  omitsSentence,
  projectMenuLabel,
  showAllProjectsAvailability,
  startsGroup,
  type MenuItem,
  type MenuProject,
} from "./header";
import { shortcuts } from "./shortcuts";

/**
 * 外部で開く as one entry, with a target selected — the ordinary case. Built once here because every
 * assertion below is about the *rest* of the menu: the group's own rules are `external-editor.test.ts`'s.
 */
const EXTERNAL_OPEN = externalOpenEntry(
  { configured: null, methods: [{ method: "association", program: "open", product: "", edits: true }] },
  {
    target: { slug: "atlas", sourcePath: "/repos/atlas/backlog/tasks/task-1 - a.md" },
    fileMissing: false,
    watchStopped: false,
    hasUnsavedInput: false,
    noticeSuppressed: false,
  },
);


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
   * 新規タスク作成）は共通入口に置かず、プロジェクト詳細画面へ集める。The menu behind the ☰ draws this
   * list and only this list, so the check is that the list stays the two ledger-wide entries.
   */
  it("holds the two 全プロジェクトに効く入口 and nothing per-project", () => {
    expect(HEADER_ENTRIES.map((entry) => entry.id)).toEqual(["register", "settings"]);
  });

  it("points every entry at an assignment that exists in the 割り当て一覧", () => {
    for (const entry of HEADER_ENTRIES) {
      expect(shortcuts().some((binding) => binding.action === entry.action)).toBe(true);
    }
  });
});

describe("メニュー項目 (doc-7 §2.1)", () => {
  /** doc-7 §2.1: メニューが 共通入口 を全部持つ — since TASK-66 it is the only place they are drawn. */
  it("carries every 共通入口, in the order 共通入口 are listed", () => {
    const entries = headerMenu([], null, EXTERNAL_OPEN).flatMap((item) =>
      item.kind === "entry" ? [item.entry] : [],
    );
    expect(entries).toEqual(HEADER_ENTRIES.map((entry) => headerEntryView(entry)));
    // The 語 come from the 文言表 since TASK-187, so the check is that each entry got its own pair
    // rather than another's — a `headerEntryView` keyed wrong would still return two views.
    for (const entry of entries) {
      expect(entry.label).not.toBe("");
      expect(entry.note).not.toBe("");
    }
    expect(entries.map((entry) => entry.label)).toEqual(["プロジェクトを登録", "設定"]);
  });

  /**
   * The 割り当て一覧 line sits above the プロジェクト一覧 and not at the end of the menu: the group's
   * length is the size of the ledger, so a fixed line placed after it would be at a different position
   * once a project is registered. Checked against the group rather than at an index, so the intent
   * survives a new line.
   */
  it("puts the 割り当て一覧 line above the プロジェクト一覧, whatever its length", () => {
    for (const projects of [[], [project("atlas")], [project("atlas"), project("kanri")]]) {
      const order = kinds(headerMenu(projects, null, EXTERNAL_OPEN));
      expect(order.indexOf("shortcutHelp")).toBeLessThan(order.indexOf("showAllProjects"));
    }
    expect(headerMenu([], null, EXTERNAL_OPEN).find((item) => item.kind === "shortcutHelp")?.label).toBe(
      shortcutHelpLabel(),
    );
  });

  /**
   * AC #1: 登録済みプロジェクトが常に 1 行ずつ並び、表示中の行にだけチェックが付いている。The list is the
   * ledger, not the hidden set — a hidden project is present here precisely because it is absent from
   * the grid — and the order is the ledger's, which is the order the grid draws its rows in.
   */
  it("lists every registered project in ledger order, marking the shown ones (AC #1)", () => {
    const items = headerMenu([project("atlas"), project("kanri", false), project("mallow")], null, EXTERNAL_OPEN);
    expect(kinds(items)).toEqual([
      "externalOpen",
      "entry",
      "entry",
      "shortcutHelp",
      "releasePage",
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
    const allShown = headerMenu([project("atlas"), project("kanri")], null, EXTERNAL_OPEN);
    const some = headerMenu([project("atlas"), project("kanri", false)], null, EXTERNAL_OPEN);
    const held = allShown.find((item) => item.kind === "showAllProjects");
    const free = some.find((item) => item.kind === "showAllProjects");
    expect(held?.label).toBe(showAllProjectsLabel());
    // Which reason, not merely that there is one: `showAllProjectsAvailability` takes two counts of the same
    // type, so a call site that passed them the wrong way round would withhold a full ledger with
    // 登録済みプロジェクトがありません — a sentence that is off the licence and would therefore be both
    // printed and spoken. `not.toBeNull()` cannot see that; naming the reason can.
    expect(held?.availability).toEqual({ state: "withheld", reason: showAllProjectsHeldReason() });
    expect(free?.availability).toEqual({ state: "ready" });
  });

  /**
   * AC #1 の語の側. The name is what the user asked each line to carry (2026-08-09), and the slug is
   * what a row without one falls back to — a root that could not be read has no `config.yml` to take a
   * name from (doc-7 §6), and a line with no word at all would name no row.
   */
  it("names each 表示切替行 by its project name, falling back to the slug", () => {
    const items = headerMenu(
      [project("atlas", true, "Backlog Atlas"), project("kanri", true, null)],
      null,
      EXTERNAL_OPEN,
    );
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
    const keys = headerMenu(
      [project("atlas", true, "同じ名前"), project("kanri", false, "同じ名前")],
      null,
      EXTERNAL_OPEN,
    ).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("保留理由 (doc-11 §5)", () => {
  it("holds すべてのプロジェクトを表示 at 0 hidden rows only", () => {
    expect(showAllProjectsAvailability(3, 0)).toEqual({
      state: "withheld",
      reason: showAllProjectsHeldReason(),
    });
    expect(showAllProjectsAvailability(3, 1)).toEqual({ state: "ready" });
  });

  /**
   * An empty ledger withholds the line for a different fact, and the difference matters because of
   * doc-11 §8: the all-shown reason is omitted from the screen on the grounds that the list states
   * it, and an empty list states nothing. So the two reasons are told apart here, and only one of
   * them is on the licence — otherwise a fresh install draws a held line with no reason at all.
   */
  it("gives an empty ledger its own reason, and prints that one", () => {
    expect(showAllProjectsAvailability(0, 0)).toEqual({
      state: "withheld",
      reason: noProjectsReason(),
    });
    expect(omitsSentence(noProjectsReason())).toBe(false);
    expect(omitsSentence(showAllProjectsHeldReason())).toBe(true);
    expect(
      headerMenu([], null, EXTERNAL_OPEN).find((item) => item.kind === "showAllProjects")?.availability,
    ).toEqual({
      state: "withheld",
      reason: noProjectsReason(),
    });
  });

  /**
   * The reason is spoken rather than printed (doc-11 §8 の licence ①), so nothing on screen would
   * show it changing — which is the same argument the 画面に出る語 block below makes for words the
   * user chose. `manage.ts`'s own `omitsSentence` is pinned this way in `project-detail.test.ts`.
   */
  it("words the spoken reason as a sentence", () => {
    expect(showAllProjectsHeldReason()).toBe("すべてのプロジェクトが表示されています。");
    expect(noProjectsReason()).toBe("登録済みプロジェクトがありません。");
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
    const items = headerMenu(projects, null, EXTERNAL_OPEN);
    return items.flatMap((_, index) => (startsGroup(items, index) ? [index] : []));
  }

  /**
   * AC #2 の肯定形 of TASK-130, still held here. Stated as "the mark does not appear and disappear",
   * which a menu with no mark at all satisfies vacuously — so the check has to be that the marks are
   * there and at the same indices in both conditions. The two conditions are the two the user saw:
   * nothing to restore (すべてのプロジェクトを表示 held, 破線枠 up) and something to restore (pressable,
   * no frame). doc-11 §5 keeps drawing that frame; what must not move with it is this.
   *
   * **Two boundaries since 版の告知** (decision-44 §3): リリースページを開く is its own 群, so the marks
   * fall on either side of it. The count is asserted with the indices rather than separately — it is
   * the 群 partition below that says which 群 exist.
   */
  it("draws its 区切り線 at the same places whether or not the すべて line is held", () => {
    const shown = [project("atlas")];
    const hidden = [project("atlas", false)];
    expect(
      headerMenu(shown, null, EXTERNAL_OPEN).find((item) => item.kind === "showAllProjects")?.availability.state,
    ).toBe("withheld");
    expect(
      headerMenu(hidden, null, EXTERNAL_OPEN).find((item) => item.kind === "showAllProjects")?.availability.state,
    ).toBe("ready");

    // 4 群 since 2026-08-25 (decision-45 §2): 外部で開く | 被せ層 | Atlas の外 | グリッドの行.
    expect(rules([])).toEqual([1, 4, 5]);
    expect(rules(shown)).toEqual([1, 4, 5]);
    expect(rules([project("atlas"), project("kanri", false)])).toEqual([1, 4, 5]);
  });

  /**
   * The 群 is what pressing the line does, not where the line sits: `externalOpen` hands a file out of
   * Atlas, `layer` lines raise a 被せ層, `rows` lines change which rows the grid draws, and `external`
   * leaves for a fixed destination. Checked as a partition rather than at indices, so a line added to
   * any 群 keeps the boundaries meaningful.
   */
  it("puts every 被せ層 line in one 群 and every プロジェクト一覧 line in the other", () => {
    const items = headerMenu([project("atlas")], null, EXTERNAL_OPEN);
    const groups = Object.fromEntries(items.map((item) => [item.key, item.group]));
    expect(groups).toEqual({
      externalOpen: "externalOpen",
      "entry:register": "layer",
      "entry:settings": "layer",
      shortcutHelp: "layer",
      releasePage: "external",
      showAllProjects: "rows",
      "project:atlas": "rows",
    });
  });

  it("draws no 区切り線 above the first line", () => {
    expect(startsGroup(headerMenu([], null, EXTERNAL_OPEN), 0)).toBe(false);
  });
});

describe("版の告知 (decision-44 §3)", () => {
  const notice = { version: "0.2.0" };

  /**
   * AC #1 の一部: the line is on the menu whether or not a 新しい版 exists, so the user reaches
   * リリースページ either way and the menu is the same length at every start. What changes with the
   * 照会's answer is the line's own 語, not the set of lines.
   */
  it("keeps the リリースページ line on the menu, with or without a 新しい版", () => {
    for (const answer of [null, notice]) {
      const line = headerMenu([project("atlas")], answer, EXTERNAL_OPEN)?.find(
        (item) => item.kind === "releasePage",
      );
      expect(line?.label).toBe(releasePageLabel());
      expect(line?.availability).toEqual({ state: "ready" });
    }
    expect(kinds(headerMenu([], null, EXTERNAL_OPEN))).toEqual(kinds(headerMenu([], notice, EXTERNAL_OPEN)));
  });

  /** AC #1: 新しい版 があることは、その行の可視の語が述べる。 */
  it("states the 版 on the line when one is published, and nothing when none is", () => {
    const withNotice = headerMenu([], notice, EXTERNAL_OPEN).find((item) => item.kind === "releasePage");
    expect(withNotice?.kind === "releasePage" && withNotice.notice).toContain("0.2.0");
    const without = headerMenu([], null, EXTERNAL_OPEN).find((item) => item.kind === "releasePage");
    expect(without?.kind === "releasePage" && without.notice).toBeNull();
  });

  /**
   * AC #5 の一部: 照会の縮退 と「公開されている版 が利用中の版と同じ」は同じ `null` で来るので、
   * 画面はどちらでも同じものを出す。**この 1 本が主張するのは、`null` に分岐が無いこと**である。
   */
  it("says nothing at all for the answer that covers 照会の縮退", () => {
    expect(releaseNoticeText(null)).toBeNull();
    expect(releaseNoticeText(notice)).not.toBeNull();
  });

  /**
   * doc-11 §2.4: アイコンのみのボタンが持続する状態の印を持つとき、同じことを `aria-label` にも語で
   * 足す。The ☰ carries the mark as a fill, which reaches the eye alone — so the name has to say it
   * too, and has to stop saying it when the 版 is no longer new.
   */
  it("puts the state in the ☰'s own name, and takes it out again", () => {
    expect(menuName("メニュー", true)).toContain("メニュー");
    expect(menuName("メニュー", true)).not.toBe("メニュー");
    expect(menuName("メニュー", false)).toBe("メニュー");
  });

  /**
   * decision-44 §3: which 版 it is belongs to the line and not to the ☰ — the button's name answers
   * only whether to open the menu, and a version in it would be read out on every focus.
   */
  it("keeps the 版 out of the ☰'s name", () => {
    expect(menuName("メニュー", true)).not.toContain("0.2.0");
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
    expect(shortcutHelpLabel()).toBe("キーボード操作一覧");
    expect(showAllProjectsLabel()).toBe("すべてのプロジェクトを表示");
  });

  /**
   * decision-44 §3: the リリースページ line is named for where it goes, not for what it might
   * announce. Recorded by equality like the two above, because a name about 更新の確認 would describe
   * a 照会 that has already happened by the time the line is on screen.
   */
  it("names the リリースページ line for the page it opens", () => {
    expect(releasePageLabel()).toBe("リリースページを開く");
  });

  /**
   * The line is named for the layer it opens, as 登録 and 設定 already are. Held here rather than left to
   * the component test: the ellipsis this word lost in TASK-130 was the whole of what once told the two
   * apart, so a `…` added back to either would be the same drift returning.
   */
  it("names the 一覧 line for the layer, with nothing trailing", () => {
    expect(shortcutHelpLabel()).not.toMatch(/[…．.]+$/);
  });
});
