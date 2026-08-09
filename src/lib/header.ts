/**
 * 固定ヘッダの入口とメニュー (doc-7 §2.1, TASK-56) as one derivation.
 *
 * - **The menu is where the 共通入口 are.** TASK-66 folded the header's per-entry buttons away, so
 *   [`HEADER_ENTRIES`] now has exactly one place that draws it. §2.1's ヘッダに出している操作はメニューに
 *   も同じものを置く still holds — nothing is on the header that the menu lacks — and the list stays a
 *   list rather than two literals because the chord for each entry has to name the same operation the
 *   menu line does, and the 割り当て一覧 check below is what keeps those in step.
 * - **1 プロジェクトに閉じた操作を置かない** (they belong to プロジェクト詳細画面, doc-10). Being a
 *   closed list of two is what makes that checkable at all: a per-project entry cannot appear in the
 *   header without appearing here first.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `band.ts` / `project-detail.ts`.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-7 §2.1 全プロジェクトに効く入口 | [`HEADER_ENTRIES`] | 共通入口: the entries the fixed header offers through its メニュー — 登録 and 設定 |
 * | doc-7 §2.1 メニュー | [`MenuItem`] + [`headerMenu`] | メニュー項目: one line of the menu, and the whole list in order |
 * | doc-7 §2.1 キーボード操作一覧（メニュー内） | [`SHORTCUT_HELP_LABEL`] + the `shortcutHelp` item | the menu line that opens the 一覧モーダル, where the 割り当て一覧's 画面に出す列 are drawn. The 一覧 itself is `shortcuts.ts`, which §2.1 holds apart from that table |
 * | doc-7 §2.1 プロジェクト一覧（メニュー内） | [`MenuProject`] + the `toggleProject` items | 登録済みプロジェクトを台帳の並び順に 1 行ずつ並べた群 |
 * | doc-7 §2.1 表示切替行 | one `toggleProject` item | 一覧の 1 行。押すとそのプロジェクト行の表示・非表示が入れ替わる |
 * | doc-7 §2.1 表示中の印 | `MenuItem.shown` on a `toggleProject` item | whether that project's row is on screen — the figure `HeaderMenu.svelte` draws from it |
 * | doc-7 §2.1 すべてのプロジェクトを表示 | [`SHOW_ALL_PROJECTS_LABEL`] + the `showAllProjects` item | 一覧の先頭に置く、全行を表示へ戻す行 |
 * | doc-7 §2.1 群（項目の並びの単位） | [`MenuGroup`] + each item's `group` | which of the two 群 a line is in: `layer` raises a 被せ層, `rows` changes which rows the grid draws |
 * | doc-7 §2.1 区切り線 | [`startsGroup`] | メニューの群と群の境目に置く水平の線を指す。Where one is drawn — read from 群 alone, never from `held` |
 * | doc-11 §5 無効化提示 | [`showAllProjectsHeld`] | 保留理由: why すべてのプロジェクトを表示 cannot be pressed, or `null` when it can — [`SHOW_ALL_PROJECTS_HELD_REASON`] when every row is shown, [`NO_PROJECTS_REASON`] when the ledger is empty |
 * | doc-11 §8 可視の文を省いてよい理由 | [`omitsSentence`] | which 保留理由 is drawn without a visible sentence, because the 区画 states it (licence ①) |
 *
 * ## Why the whole project list is here
 *
 * 行非表示 was reached from three places until TASK-131 — the レーンヘッダ行's 隠す, the 上部帯 ⑥, and a
 * menu list that named the hidden rows alone. The user asked for one place (2026-08-09), and the menu
 * is the one that works while the grid is not up: a band names rows on screen and a lane header exists
 * only inside the grid, whereas a row hidden earlier has to be findable from either screen. So the two
 * others went, and what was a list of what is *missing* became a list of what is *registered*, with
 * each line saying which state its row is in.
 *
 * Nothing here reads or writes anything: the outputs are labels, a 表示中の印, and 保留理由 — the shell
 * decides what a press does.
 */

import type { ShortcutAction } from "./shortcuts";

// --- 共通入口 (doc-7 §2.1) ---------------------------------------------------------------------

/** The two 共通入口. Closed: a third would have to be ledger-wide to belong here at all. */
export type HeaderEntryId = "register" | "settings";

export interface HeaderEntry {
  id: HeaderEntryId;
  label: string;
  /** The assignment that opens it, so the chord and the menu item name the same operation. */
  action: ShortcutAction;
  /**
   * What the entry reaches, in one line — the `title` on the menu line. It sat on the header button
   * until TASK-66 folded that button away; moving it rather than dropping it is why the entries can
   * lose their buttons without the screen losing what they said.
   */
  note: string;
}

/**
 * 共通入口とは、固定ヘッダのメニューに必ず現れる入口 (プロジェクトを登録・設定) の列を指す。
 * Ordered as doc-7 §2.1 lists them: 登録 (台帳全体) then 設定 (アプリ設定).
 */
export const HEADER_ENTRIES: readonly HeaderEntry[] = [
  {
    id: "register",
    label: "プロジェクトを登録",
    action: "openRegister",
    note: "台帳へエントリを 1 件足します。グリッドの末尾に行が 1 本増えます。",
  },
  {
    id: "settings",
    label: "設定",
    action: "openSettings",
    note: "アプリ設定を開きます。",
  },
] as const;

// --- メニュー項目 (doc-7 §2.1, doc-11 §4 ⑥) ----------------------------------------------------

/**
 * The line that opens the 一覧モーダル (doc-7 §2.1), named for the thing it opens — the same string the
 * modal carries as its `Modal label` and its `<h2>`, which is already how the two 共通入口 above work
 * (プロジェクトを登録・設定 name both the line and the layer, and `shortcuts.ts` gives those two the same
 * word again as their `operation`).
 *
 * It read キーボード操作表示… until TASK-130, where the `…` said the line led to the list rather than being
 * it. The user's word replaced that (2026-08-09), and with the ellipsis gone the distinction it drew has
 * nothing left to stand on — so the 呼び名 of the modal came to this word too rather than staying one
 * character away from it. What stays apart is the 割り当て一覧 itself: `shortcuts.ts` holds the five-欄
 * record, and doc-7 §2.1 keeps that word for the record and never for what is drawn (TASK-125).
 */
export const SHORTCUT_HELP_LABEL = "キーボード操作一覧";

/**
 * The line that puts every project row back on screen (doc-7 §2.1), in the user's own words
 * (2026-08-09). It read 行非表示をすべて戻す until TASK-131, when the group below it stopped being a list
 * of hidden rows: a line named for the state it undoes belongs above a list of what is undone, and the
 * list now names every registered project whichever state it is in.
 */
export const SHOW_ALL_PROJECTS_LABEL = "すべてのプロジェクトを表示";

/**
 * 保留理由 for すべてのプロジェクトを表示 while every registered row is on screen. Written as a sentence
 * rather than as parenthetical shorthand because nothing prints it — it is read aloud or not at all
 * (see [`omitsSentence`]), and brackets that kept a visible note short only become noise in speech.
 */
export const SHOW_ALL_PROJECTS_HELD_REASON = "すべてのプロジェクトが表示されています。";

/**
 * 保留理由 for the same line when the ledger holds nothing at all. A second reason rather than the one
 * above, because the two are withheld by different facts and only one of them is stated by the 区画:
 * an all-ticked list says 表示されています by itself, while an *empty* list says nothing, and doc-11 §8's
 * licence turns on the 区画 having said it. So this one is printed (it is not in [`omitsSentence`]) —
 * otherwise the first thing a new install shows in its menu is a held line with no reason anywhere,
 * which is exactly what doc-11 §5 refuses (故障と区別できない).
 */
export const NO_PROJECTS_REASON = "登録済みプロジェクトがありません。";

/**
 * 保留理由 for すべてのプロジェクトを表示, or `null` while at least one row is hidden. A sentence rather
 * than a boolean for the reason doc-11 §5 gives: 理由の無い無効化を置かない — an unpressable control with
 * no reason cannot be told from a broken one.
 */
export function showAllProjectsHeld(projectCount: number, hiddenCount: number): string | null {
  if (projectCount === 0) return NO_PROJECTS_REASON;
  return hiddenCount > 0
    ? null
    : SHOW_ALL_PROJECTS_HELD_REASON;
}

/**
 * Whether this 保留理由 is drawn without a visible sentence (doc-11 §8), following `manage.ts`'s
 * `omitsSentence`. Enumerated rather than ruled over every reason, and for that module's stated
 * reason: which licence a reason has is a fact about its 区画, so adding one means opening that 区画.
 *
 * The one entry is on **licence ①** — the 区画 states the reason itself. The プロジェクト一覧 sits
 * directly under this line with a 表示中の印 on every row it draws, so a menu in which すべての
 * プロジェクトを表示 is held is a menu the user is looking at all-ticked. What is omitted is the visible
 * sentence and nothing else: doc-7 §2.1 keeps the reason in the accessibility tree.
 */
export function omitsSentence(reason: string): boolean {
  return reason === SHOW_ALL_PROJECTS_HELD_REASON;
}

/**
 * Which 群 a line belongs to (doc-7 §2.1). `layer` lines raise a 被せ層 and leave the grid as it is;
 * `rows` lines change which rows the grid draws and raise nothing. That is the axis, not the position:
 * a line's 群 is a property of what pressing it does, so it is decided here and cannot drift with how
 * the menu happens to be laid out.
 */
export type MenuGroup = "layer" | "rows";

/**
 * One line of the menu. `held` is the 保留理由 (doc-11 §5), or `null` when the line is pressable.
 *
 * `key` identifies the line for the markup that draws it. It is decided here rather than derived at the
 * `{#each}`, because deriving it from `kind` is wrong in a way nothing catches until the menu is opened:
 * the two 共通入口 share a `kind`, Svelte treats duplicate keys as a runtime error, and the whole menu
 * then fails to render. Neither `svelte-check` nor a unit test of this module saw that — only opening the
 * menu did. Keeping the key in the data makes uniqueness a property this module can be tested for.
 */
export type MenuItem =
  | { kind: "entry"; key: string; group: MenuGroup; entry: HeaderEntry; held: null }
  | { kind: "shortcutHelp"; key: string; group: MenuGroup; label: string; held: null }
  | { kind: "showAllProjects"; key: string; group: MenuGroup; label: string; held: string | null }
  | {
      kind: "toggleProject";
      key: string;
      group: MenuGroup;
      slug: string;
      label: string;
      /** 表示中の印 — true while that project's row is one the grid draws. */
      shown: boolean;
      held: null;
    };

/**
 * One registered project, as the menu needs it: which row it is, what to call it, and whether that row
 * is on screen. `name` is `config.yml`'s project_name, which the read layer supplies and which is
 * absent for a row whose root could not be read (doc-7 §6) and for one not yet read at all.
 */
export interface MenuProject {
  slug: string;
  name: string | null;
  shown: boolean;
}

/**
 * What a 表示切替行 calls its project (doc-7 §2.1): the name, and the slug when there is no name.
 *
 * The name is what the user asked the list to carry (2026-08-09) and is the word the レーンヘッダ行
 * already leads with. It cannot be the only word, though — it comes from the project's own
 * `config.yml` rather than from the ledger, so a row whose root is unreadable has none, and a row that
 * has one is not guaranteed to have a *different* one from its neighbour. The slug is the ledger's
 * unique key (doc-3 §3.1), which is why it is what the fallback falls back to.
 *
 * An empty name falls back too, and not only a missing one: a line labelled with the empty string
 * names no row for either the eye or a screen reader, which is the whole of what the fallback is for.
 * The レーンヘッダ行 reads the same value the same way (`Swimlane.svelte`), so the two places that print
 * a project's name agree on which values count as one.
 */
export function projectMenuLabel(project: MenuProject): string {
  return project.name || project.slug;
}

/**
 * 区切り線とは、メニューの群と群の境目に置く水平の線を指す。True for the line a 区切り線 is drawn above.
 *
 * It reads 群 and nothing else — in particular not `held`. Until TASK-130 the menu drew no 区切り線 at
 * all, and what a user saw at this very boundary was the 無効化提示 破線枠 of the すべて line (doc-11 §5):
 * a line that appeared when there was nothing to restore and vanished when there was, which reads as the
 * menu's grouping coming and going. The 破線枠 is right and stays; what was missing is a mark of the
 * 群 that does not depend on whether the line below it can be pressed.
 */
export function startsGroup(items: readonly MenuItem[], index: number): boolean {
  return index > 0 && items[index - 1].group !== items[index].group;
}

/**
 * The menu in order: the 共通入口 first (they are what the header itself offers), then the line to the
 * 一覧モーダル, then the プロジェクト一覧 — すべてのプロジェクトを表示, then one line per registered project
 * in ledger order (doc-3 §2.2, which is the order the grid draws its rows in).
 *
 * The 割り当て一覧 line sits above the プロジェクト一覧 rather than at the end, because the group below it
 * is as long as the ledger: a fixed line placed after a variable list moves whenever a project is
 * registered, and the menu is walked with the keyboard.
 *
 * The list is offered on both screens rather than only on the swimlane. A row hidden earlier is found
 * again here, and making the list appear only after returning to the grid would be a control that hides
 * when it is needed. With nothing hidden the すべて line is present and held, which is the shape
 * doc-11 §5 asks for everywhere.
 */
export function headerMenu(projects: readonly MenuProject[]): MenuItem[] {
  const hiddenCount = projects.filter((project) => !project.shown).length;
  return [
    ...HEADER_ENTRIES.map(
      (entry): MenuItem => ({
        kind: "entry",
        key: `entry:${entry.id}`,
        group: "layer",
        entry,
        held: null,
      }),
    ),
    {
      kind: "shortcutHelp",
      key: "shortcutHelp",
      group: "layer",
      label: SHORTCUT_HELP_LABEL,
      held: null,
    },
    {
      kind: "showAllProjects",
      key: "showAllProjects",
      group: "rows",
      label: SHOW_ALL_PROJECTS_LABEL,
      held: showAllProjectsHeld(projects.length, hiddenCount),
    },
    ...projects.map((project): MenuItem => ({
      kind: "toggleProject",
      // The ledger's unique key (doc-3 §3.1), not the label: two projects may carry the same name,
      // and Svelte makes a duplicate key a runtime error that takes the whole menu down.
      key: `project:${project.slug}`,
      group: "rows",
      slug: project.slug,
      label: projectMenuLabel(project),
      shown: project.shown,
      held: null,
    })),
  ];
}
