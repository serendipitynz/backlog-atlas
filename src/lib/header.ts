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
 * | doc-7 §5.1 行非表示 / doc-11 §4 ⑥ | [`SHOW_ALL_ROWS_LABEL`] + the `showRow` items | すべて戻す, and the per-row list doc-11 §4 puts in the menu rather than in the 帯 |
 * | doc-7 §2.1 群（項目の並びの単位） | [`MenuGroup`] + each item's `group` | which of the two 群 a line is in: `layer` raises a 被せ層, `rows` changes which rows the grid draws |
 * | doc-7 §2.1 区切り線 | [`startsGroup`] | メニューの群と群の境目に置く水平の線を指す。Where one is drawn — read from 群 alone, never from `held` |
 * | doc-11 §5 無効化提示 | [`showAllRowsHeld`] | 保留理由: why すべて戻す cannot be pressed, or `null` when it can |
 *
 * ## Why the 行非表示 items are here and not in the 帯
 *
 * doc-11 §4 caps every 上部帯 at one line and names this very case as its example of 縮約: 行非表示の帯
 * は「非表示のレーン n 件」に縮約し、個々のレーンはメニューの一覧から戻す. The same paragraph keeps the
 * band's *operation* in the band, so ⑥ still carries すべて戻す — what moves here is the per-row list,
 * which is the part that grew the band sideways.
 *
 * Nothing here reads or writes anything: the outputs are labels and 保留理由, and the shell decides what
 * a press does.
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

/** 行非表示をすべて戻す (doc-7 §5.1). The band's own operation, echoed here like the two 共通入口. */
export const SHOW_ALL_ROWS_LABEL = "行非表示をすべて戻す";

/**
 * 保留理由 for すべて戻す (AC #5 非表示が無いときは理由付きで無効化する), or `null` while there is
 * something to restore. A sentence rather than a boolean for the reason doc-11 §5 gives: 理由の無い
 * 無効化を置かない — an unpressable control with no reason cannot be told from a broken one.
 */
export function showAllRowsHeld(hiddenRowCount: number): string | null {
  return hiddenRowCount > 0
    ? null
    : "（対象行なし）";
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
  | { kind: "showAllRows"; key: string; group: MenuGroup; label: string; held: string | null }
  | { kind: "showRow"; key: string; group: MenuGroup; slug: string; label: string; held: null };

/**
 * 区切り線とは、メニューの群と群の境目に置く水平の線を指す。True for the line a 区切り線 is drawn above.
 *
 * It reads 群 and nothing else — in particular not `held`. Until TASK-130 the menu drew no 区切り線 at
 * all, and what a user saw at this very boundary was the 無効化提示 破線枠 of すべて戻す (doc-11 §5): a
 * line that appeared when there was nothing to restore and vanished when there was, which reads as the
 * menu's grouping coming and going. The 破線枠 is right and stays; what was missing is a mark of the
 * 群 that does not depend on whether the line below it can be pressed.
 */
export function startsGroup(items: readonly MenuItem[], index: number): boolean {
  return index > 0 && items[index - 1].group !== items[index].group;
}

/**
 * The menu in order: the 共通入口 first (they are what the header itself offers), then the line to the
 * 一覧モーダル, then 行非表示 — すべて戻す, then one line per hidden row.
 *
 * The 割り当て一覧 line sits above the 行非表示 group rather than at the end, because the group below it is
 * as long as the number of hidden rows: a fixed line placed after a variable list moves every time a row
 * is hidden, and the menu is walked with the keyboard.
 *
 * The 行非表示 lines are offered on both screens rather than only on the swimlane, unlike the 帯 ⑥ which
 * the shell raises for the grid alone. The band names rows on screen and has nothing to point at while
 * the grid is not up; a menu item is the opposite — it is how a row hidden earlier is found again, and
 * making it appear only after returning to the grid would be a control that hides when it is needed.
 * With no hidden rows it is present and held, which is the same shape doc-11 §5 asks for everywhere.
 */
export function headerMenu(hiddenRows: readonly string[]): MenuItem[] {
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
      kind: "showAllRows",
      key: "showAllRows",
      group: "rows",
      label: SHOW_ALL_ROWS_LABEL,
      held: showAllRowsHeld(hiddenRows.length),
    },
    ...hiddenRows.map((slug): MenuItem => ({
      kind: "showRow",
      key: `row:${slug}`,
      group: "rows",
      slug,
      label: `${slug} を戻す`,
      held: null,
    })),
  ];
}
