/**
 * 固定ヘッダの入口とメニュー (doc-7 §2.1, TASK-56) as one derivation. doc-7 §2.1 puts two rules on
 * this header that only hold if one list feeds both places:
 *
 * - **ヘッダに出している操作はメニューにも同じものを置く** (so a narrow window still reaches them).
 *   [`HEADER_ENTRIES`] is that list, and the header and the menu each draw *it* rather than their own
 *   copy — with two literals, adding a third entry to the header and forgetting the menu is a diff that
 *   compiles and looks finished.
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
 * | doc-7 §2.1 全プロジェクトに効く入口 | [`HEADER_ENTRIES`] | 共通入口: the entries the fixed header and the menu both show — 登録 and 設定 |
 * | doc-7 §2.1 メニュー | [`MenuItem`] + [`headerMenu`] | メニュー項目: one line of the menu, and the whole list in order |
 * | doc-7 §5.1 行非表示 / doc-11 §4 ⑥ | [`SHOW_ALL_ROWS_LABEL`] + the `showRow` items | すべて戻す, and the per-row list doc-11 §4 puts in the menu rather than in the 帯 |
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
  /** The assignment that opens it, so the header button and the menu item print the same hint. */
  action: ShortcutAction;
  /** What the entry reaches, in one line — the `title` on the header button. */
  note: string;
}

/**
 * 共通入口とは、固定ヘッダとメニューの両方に必ず現れる入口 (プロジェクトを登録・設定) の列を指す。
 * Ordered as doc-7 §2.1 lists them: 登録 (台帳全体) then 設定 (アプリ設定).
 */
export const HEADER_ENTRIES: readonly HeaderEntry[] = [
  {
    id: "register",
    label: "プロジェクトを登録",
    action: "openRegister",
    note: "台帳へエントリを 1 件足します（doc-3 §4.1）。グリッドの末尾に行が 1 本増えます。",
  },
  {
    id: "settings",
    label: "設定",
    action: "openSettings",
    note: "アプリ設定を開きます（decision-13）。",
  },
] as const;

// --- メニュー項目 (doc-7 §2.1, doc-11 §4 ⑥) ----------------------------------------------------

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
    : "非表示にしている行がありません。戻す行が無いため、この操作はできません。";
}

/** One line of the menu. `held` is the 保留理由 (doc-11 §5), or `null` when the line is pressable. */
export type MenuItem =
  | { kind: "entry"; entry: HeaderEntry; held: null }
  | { kind: "showAllRows"; label: string; held: string | null }
  | { kind: "showRow"; slug: string; label: string; held: null };

/**
 * The menu in order: the 共通入口 first (they are what the header itself offers), then 行非表示 — すべて
 * 戻す, then one line per hidden row.
 *
 * The 行非表示 lines are offered on both screens rather than only on the swimlane, unlike the 帯 ⑥ which
 * the shell raises for the grid alone. The band names rows on screen and has nothing to point at while
 * the grid is not up; a menu item is the opposite — it is how a row hidden earlier is found again, and
 * making it appear only after returning to the grid would be a control that hides when it is needed.
 * With no hidden rows it is present and held, which is the same shape doc-11 §5 asks for everywhere.
 */
export function headerMenu(hiddenRows: readonly string[]): MenuItem[] {
  return [
    ...HEADER_ENTRIES.map((entry): MenuItem => ({ kind: "entry", entry, held: null })),
    {
      kind: "showAllRows",
      label: SHOW_ALL_ROWS_LABEL,
      held: showAllRowsHeld(hiddenRows.length),
    },
    ...hiddenRows.map((slug): MenuItem => ({
      kind: "showRow",
      slug,
      label: `${slug} を戻す`,
      held: null,
    })),
  ];
}
