/**
 * 詳細配置 (doc-8 §2–§3), as pure functions: which of the three ways the task detail is placed, what
 * that placement does to every 区画 of doc-8 §3's assignment table, and the geometry the 中央モーダル
 * is built from. `TaskDetail.svelte` is markup over these values, so the table can be checked against
 * the document without mounting a component.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `detail.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §2.1 詳細配置 | [`DetailPlacement`] (`wire.ts`) | 併置サイドバー / 中央モーダル / 全面シングルビュー |
 * | doc-8 §3 区画 | [`DetailSection`] | one row of the assignment table — one block of the panel |
 * | doc-8 §3 常設 | [`Disposition`] `"always"` | 開いたまま置く状態。利用者に閉じる手段は無い |
 * | doc-8 §3 折畳み | [`Disposition`] `"foldOpen"` / `"foldClosed"`, [`isFold`] | 利用者が開閉できる状態 |
 * | doc-8 §3 既定開閉 | [`startsOpen`] | 折畳みの区画がその配置で開いて始まるか閉じて始まるか |
 * | doc-8 §2.1 主列 / 脇列 | [`SectionColumn`] `"main"` / `"side"` | the two columns of 中央モーダル and 全面 |
 * | doc-8 §3 2 列にまたがる | [`SectionColumn`] `"wide"` | 見出し and 編集卓 only — they sit above the columns |
 * | doc-8 §3.1 区画の並び | [`MAIN_COLUMN_ORDER`] / [`SIDE_COLUMN_ORDER`] / [`SINGLE_COLUMN_ORDER`] | the 正本 transcribed from 画面設計案 02 |
 * | doc-8 §2.1 1 行の長さの上限 | [`PROSE_MAX_WIDTH_REM`] + [`PROSE_SECTIONS`] | 48rem; [`PROSE_SECTIONS`] names the four タスク詳細 区画 it binds *here*, while the number itself is the screen-independent one other screens borrow |
 * | doc-8 §5 配置ごとの粒度 | [`HistoryDetail`] | how much of the Git 履歴欄 this placement shows |
 * | doc-8 §2.1 1280×800 でも 2 列 | [`modalMainColumnRem`] | what is left for the 主列 once the 脇列 is taken |
 * | doc-8 §2.1 中央モーダルの幅 | [`modalContentWidthRem`] | the box the two columns divide — content, not footprint (TASK-115) |
 * | doc-8 §2.2 既定の永続 | [`placementPersistence`] | whether the chosen placement could be stored, and why not |
 * | doc-8 §2.2 既定印 | [`DEFAULT_PLACEMENT_MARK`] + [`placementSwitchName`] | the mark on the switch for the placement stored as the 既定 |
 * | doc-8 §2.2 切替が刷る図形 | [`PLACEMENT_ICON`] | which lucide figure stands for each placement |
 *
 * Two rules run through the module:
 *
 * - **The table is data, not markup** (doc-8 §3). One placement decides every 区画's disposition at
 *   once, so a placement cannot half-apply — which is what a per-section `{#if placement === …}` in
 *   the component would eventually become.
 * - **A 区画 borrows no other 区画's row.** Every row doc-8 §3 has is a key here, even where two rows
 *   currently carry the same three values: the day the document moves one of them, the borrower moves
 *   with it silently. `assignee` was such a borrower until TASK-73 (it read `labels`).
 * - **不整合区画 is never collapsible** (doc-8 §3). It is `"always"` in all three placements, and the
 *   panel draws it as a plain section rather than a foldable one: doc-8 gives the reason — 折畳みへ
 *   落とすと問題のあるタスクが正常に見える — and an openable fold would still start closed once the
 *   user had closed it on the previous task.
 */

import type { IconName } from "./icons/lucide";
import { msg } from "./messages";
import type { DetailPlacement } from "./wire";

/**
 * The 区画 doc-8 §3's assignment table has rows for, in the table's own order — **which is not the
 * order they are drawn in** (doc-8 §3.1 says so outright: the table is an index, and the 並び is
 * transcribed from 画面設計案 02 into [`MAIN_COLUMN_ORDER`] / [`SIDE_COLUMN_ORDER`]).
 */
export type DetailSection =
  | "heading"
  | "assignee"
  | "editConsole"
  | "type"
  | "labels"
  | "description"
  | "ac"
  | "dod"
  | "plan"
  | "notes"
  | "comments"
  | "finalSummary"
  | "dependencies"
  | "references"
  | "pullRequest"
  | "gitHistory"
  | "inconsistency"
  /** 状態遷移・外部エディタ — one row of doc-8 §3, so one key here. */
  | "transitions";

/**
 * 割当表の 1 セルが取る値 (doc-8 §3). Three rather than two because the cell says two independent
 * things — whether the user can close the 区画 at all, and whether it starts open — and doc-8 used to
 * bundle the second into the definition of 折畳み ("既定で閉じた状態"). 画面設計案 02 draws the same
 * four 区画 as folds in all three figures and varies only the direction of the 開閉印, so the bundled
 * form could not be transcribed at all (TASK-114).
 *
 * Read them through [`isFold`] and [`startsOpen`] rather than by comparing strings: those are the two
 * questions the markup actually asks, and each has to keep giving one answer for 常設.
 */
export type Disposition = "always" | "foldOpen" | "foldClosed";

/** Whether the user can close this 区画 — the half of the cell the 区画見出し's 体裁 states (doc-8 §3). */
export function isFold(disposition: Disposition): boolean {
  return disposition !== "always";
}

/**
 * Whether this 区画 is open when the placement is first drawn (doc-8 §3 既定開閉). True for 常設 as
 * well: 常設 is open and stays open, so the one question "is it open right now, at the start" has the
 * same answer for both, and the markup needs no third branch.
 */
export function startsOpen(disposition: Disposition): boolean {
  return disposition !== "foldClosed";
}

/**
 * Where a 区画 sits in the two columns (doc-8 §2.1). Read by 中央モーダル and 全面シングルビュー;
 * 併置サイドバー has no columns and reads [`SINGLE_COLUMN_ORDER`] instead.
 */
export type SectionColumn = "main" | "side" | "wide";

/** How much of the Git 履歴欄 a placement shows (doc-8 §5 配置ごとの粒度). */
export type HistoryDetail =
  /** 件数と全面表示への導線だけ (併置サイドバー). */
  | "count"
  /** 直近 2 件と残り件数 (中央モーダル). */
  | "recent"
  /** 全件と関連解決の状態 (全面シングルビュー). */
  | "full";

/** 直近 n 件 (doc-8 §5): the 中央モーダル's commit budget. */
export const RECENT_COMMIT_LIMIT = 2;

export interface PlacementLayout {
  sections: Record<DetailSection, Disposition>;
  history: HistoryDetail;
  /** How many columns the panel lays its 区画 out in — 1 only for the 併置サイドバー (doc-8 §2.1). */
  columns: 1 | 2;
}

/** 切替の並び (doc-8 §2.1's own order: narrowest first). */
export const PLACEMENTS: readonly DetailPlacement[] = ["sidebar", "modal", "full"] as const;

/**
 * doc-8 §3 の割当表, transcribed. All three placements are written out. `full` used to be derived from
 * a rule instead — 全区画を常設 (doc-8 §2.1) — and the rule was wrong: 画面設計案 02's 全面 figure draws
 * five 区画 with 開閉印 (TASK-114). A rule is only worth the row it replaces while the document states
 * one, and this table no longer has one to state.
 *
 * **Which 区画 are folds does not vary by placement** — the four rows below that leave `"always"` are
 * folds in all three, exactly as the three figures draw them. Only 既定開閉 varies. That is what lets
 * doc-8 §3 fix the 区画見出し's 体裁 to the 区画 rather than to the placement.
 */
const DISPOSITIONS: Record<DetailSection, Record<DetailPlacement, Disposition>> = {
  heading: { sidebar: "always", modal: "always", full: "always" },
  assignee: { sidebar: "always", modal: "always", full: "always" },
  editConsole: { sidebar: "always", modal: "always", full: "always" },
  type: { sidebar: "always", modal: "always", full: "always" },
  labels: { sidebar: "always", modal: "always", full: "always" },
  description: { sidebar: "always", modal: "always", full: "always" },
  ac: { sidebar: "always", modal: "always", full: "always" },
  // The three 区画 TASK-185 added are folds in all three placements, and 中央モーダル opens none of
  // them: doc-8 §3's 筋 opens 読み物 and 参照先 there, and these are a checklist and two records of
  // work already finished. 実装ノート's row is the one they follow for exactly that reason.
  dod: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
  plan: { sidebar: "foldClosed", modal: "foldOpen", full: "foldOpen" },
  notes: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
  comments: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
  finalSummary: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
  dependencies: { sidebar: "always", modal: "always", full: "always" },
  references: { sidebar: "foldClosed", modal: "foldOpen", full: "foldOpen" },
  pullRequest: { sidebar: "always", modal: "always", full: "always" },
  // The Git 履歴欄's own row is a granularity rather than a fold (`HistoryDetail`); the section
  // itself stays open in all three, since even 件数のみ is something to read.
  gitHistory: { sidebar: "always", modal: "always", full: "always" },
  inconsistency: { sidebar: "always", modal: "always", full: "always" },
  transitions: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
};

/**
 * Which column each 区画 takes (doc-8 §2.1・§3). Used by both two-column placements. Only 見出し and
 * 編集卓 are `"wide"`: they are fixed rows above the columns (doc-8 §2.2), so they are not in either
 * column's order below. **不整合区画 is `"main"`** — it used to span both columns on the grounds that
 * one column's reader would otherwise miss it, but doc-8 §3.1 puts it at the *head* of the 主列,
 * which is above both columns' contents and so is passed before either is read.
 */
export const SECTION_COLUMN: Record<DetailSection, SectionColumn> = {
  heading: "wide",
  editConsole: "wide",
  inconsistency: "main",
  description: "main",
  ac: "main",
  dod: "main",
  plan: "main",
  notes: "main",
  comments: "main",
  finalSummary: "main",
  gitHistory: "main",
  assignee: "side",
  type: "side",
  labels: "side",
  dependencies: "side",
  references: "side",
  pullRequest: "side",
  transitions: "side",
};

// --- 区画の並び (doc-8 §3.1) ------------------------------------------------------------------
//
// The 正本 is 画面設計案 02, transcribed into doc-8 §3.1 and then to here. Held as data for the same
// reason the assignment table is: an order spelled out in markup is an order no test can read, and
// this one has to agree with `SECTION_COLUMN` (checked in the tests) and hold for three placements.

/** 主列の並び (doc-8 §3.1). 不整合区画 leads — see [`SECTION_COLUMN`]. */
export const MAIN_COLUMN_ORDER: readonly DetailSection[] = [
  "inconsistency",
  "description",
  "ac",
  // 画面設計案 02 has no row for these three, so their positions come from the managed file's own
  // order — which is where 原文 already agrees with it for the four it does draw (Description, AC,
  // Plan, Notes appear in the file in that order too). A reader with the file open beside the panel
  // then meets the 区画 in one order rather than two (doc-8 §3.1).
  "dod",
  "plan",
  "notes",
  "comments",
  "finalSummary",
  "gitHistory",
] as const;

/**
 * 脇列の並び (doc-8 §3.1). `assignee` sits after 通常ラベル by a decision recorded in doc-8 §3.1 —
 * 画面設計案 02 has no assignee 区画 at all (it keeps the value in the 属性表), so the original settles
 * every other position here but not this one.
 */
export const SIDE_COLUMN_ORDER: readonly DetailSection[] = [
  "type",
  "labels",
  "assignee",
  "dependencies",
  "pullRequest",
  "references",
  "transitions",
] as const;

/**
 * What 併置サイドバー draws, top to bottom (doc-8 §3.1): the 主列's order with the 脇列's appended.
 * Not a third order — 画面設計案 02's 併置 figure *is* the two columns run together, which is why one
 * 正本 covers all three placements.
 */
export const SINGLE_COLUMN_ORDER: readonly DetailSection[] = [
  ...MAIN_COLUMN_ORDER,
  ...SIDE_COLUMN_ORDER,
] as const;

const HISTORY_DETAIL: Record<DetailPlacement, HistoryDetail> = {
  sidebar: "count",
  modal: "recent",
  full: "full",
};

export function layoutFor(placement: DetailPlacement): PlacementLayout {
  const sections = {} as Record<DetailSection, Disposition>;
  for (const [section, byPlacement] of Object.entries(DISPOSITIONS)) {
    sections[section as DetailSection] = byPlacement[placement];
  }
  return {
    sections,
    history: HISTORY_DETAIL[placement],
    // 全面 joined 中央モーダル at two columns in TASK-113 (doc-8 §2.1): what the 全面 gains from a
    // wide window is a wide 主列, and the 脇列's short values do not get longer with it.
    columns: placement === "sidebar" ? 1 : 2,
  };
}

// --- 中央モーダルの寸法 (doc-8 §2.1) ---------------------------------------------------------
//
// Held here rather than only in the component's SCSS because doc-8 §2.1 makes one of them a
// requirement with a number in it — 1280×800 でも 2 列を保つ（脇列 18rem は確保できる）— and a
// requirement stated as a number is one a test can hold. The component reads these out as custom
// properties, so the CSS and the check below cannot disagree.
//
// **Every rem here sizes a content box, not a footprint** (TASK-115). This repository has no global
// `box-sizing` reset, so the `width` the component writes is the box the two columns divide, and the
// padding and the border are laid outside it. Naming the content box is what lets the geometry below
// be exact: a footprint would also have to carry the panel's 1px border, and a border given in px
// does not follow the `rootFontPx` these functions take.

/** 併置サイドバー の幅 (doc-8 §2.1: 幅 30rem 固定). Held here for the same reason the modal's are. */
export const SIDEBAR_WIDTH_REM = 30;

/** 脇列 (doc-8 §2.1). The width the requirement names. */
export const MODAL_SIDE_COLUMN_REM = 18;
/** Gap between the two columns. */
export const MODAL_COLUMN_GAP_REM = 0.75;
/**
 * The panel's left+right padding, together — `.detail`'s, in all three placements rather than the
 * 中央モーダル's alone (measured: 12px a side in each of them). It lies **outside** the widths below,
 * so nothing here subtracts it; the component needs the number because the 固定 見出し band pulls
 * itself back out to the panel's edges by exactly this much.
 */
export const PANEL_PADDING_REM = 1.5;
/**
 * Taken off the viewport before the modal's content box is sized, left+right together. What reaches
 * the eye is narrower by the padding and the border: at the default root font size this 4rem leaves
 * 2.375rem of window (19px a side, measured at 1000×800 in both engines).
 */
export const MODAL_INSET_REM = 4;
/** The modal's content box stops growing here: past this, lines get too long to read. */
export const MODAL_MAX_WIDTH_REM = 68;
/**
 * The narrowest 主列 that still holds a body of text beside the 脇列. Not a breakpoint — nothing
 * stacks the columns (doc-8 §2.1 狭いからといって縦積みへ落とさない) — but the floor the geometry above
 * has to clear at the size doc-8 names.
 */
export const MODAL_MIN_MAIN_COLUMN_REM = 22;

/** The window width doc-8 §2.1's 2 列 requirement is stated at. */
export const MODAL_REQUIRED_VIEWPORT_PX = 1280;

/**
 * Browser default root font size — what `rem` means when the user has not changed it. Exported so a
 * test converting a recorded pixel measurement back to rem takes the same number these functions
 * default to, rather than writing 16 down a second time.
 */
export const ROOT_FONT_PX = 16;

/**
 * The modal's content box at a given viewport width, in rem — the width its two columns divide, and
 * the value the component writes as `width`. The modal's footprint on screen is this plus
 * [`PANEL_PADDING_REM`] plus its 1px border a side.
 */
export function modalContentWidthRem(
  viewportWidthPx: number,
  rootFontPx: number = ROOT_FONT_PX,
): number {
  return Math.min(MODAL_MAX_WIDTH_REM, viewportWidthPx / rootFontPx - MODAL_INSET_REM);
}

/**
 * What is left for the 主列 once the 脇列 and the gap are taken out of the content box (doc-8 §2.1).
 *
 * The padding is **not** subtracted: it lies outside the box the columns divide (see the note above).
 * Until TASK-115 this subtracted it and so read 1.5rem short of every layout it described — 47.75rem
 * against a 主列 both engines drew at 49.25rem (788px at 1280×800). Re-measured after the change at
 * 1280×800 and 1000×800, in WebKit and Chromium: 788px and 636px drawn against 49.25rem and 39.75rem
 * computed, agreeing to the pixel.
 *
 * Can go negative on an absurdly narrow window; the caller compares it against
 * [`MODAL_MIN_MAIN_COLUMN_REM`] rather than treating any positive number as a fit.
 */
export function modalMainColumnRem(
  viewportWidthPx: number,
  rootFontPx: number = ROOT_FONT_PX,
): number {
  return (
    modalContentWidthRem(viewportWidthPx, rootFontPx) -
    MODAL_COLUMN_GAP_REM -
    MODAL_SIDE_COLUMN_REM
  );
}

// --- 1 行の長さの上限 (doc-8 §2.1) -------------------------------------------------------------

/**
 * 行長上限 (doc-8 §2.1, TASK-113). The widest a body block may draw, whatever width the column
 * gives it.
 *
 * **Not private to タスク詳細**, though its measurements were taken there (doc-8 §2.1 as TASK-116
 * clarified it): any screen whose 本文ブロック sits in a column taking the remaining width borrows
 * this constant rather than deciding a second number, because 48rem comes from how reading works
 * and not from which screen is drawing. 閲覧 の本文 in the 文書ペイン (doc-10 §5) is the first
 * borrower. What stays local to doc-8 §2.1 is everything below — where the value came from, how it
 * bites in each 配置, and why only four 区画 there take it.
 *
 * The number is not invented here: it is the 主列 the 中央モーダル already has, once doc-8 §2.1's 脇列
 * 18rem is taken out of [`MODAL_MAX_WIDTH_REM`]. That 主列 is **49.25rem** at 1280×800 — one value
 * since TASK-115, computed by [`modalMainColumnRem`] and drawn by both engines at 788px. 48rem is a
 * whole rem that column already holds, so the cap commits to no width the design had not committed
 * to; it binds the modal's own 主列 by the remaining 1.25rem (the 20px TASK-113 measured).
 *
 * Measured at 1280×800 (TASK-113): 全面シングルビュー's 主列 is 956px and the cap takes the body to
 * 768px — the longest line falls from 1237.0px to 746.6px. 中央モーダル loses 20px. 併置サイドバー is
 * unaffected: its body block is 480px, six tenths of the cap, so the rule applies and never binds.
 */
export const PROSE_MAX_WIDTH_REM = 48;

/**
 * The **タスク詳細 区画** [`PROSE_MAX_WIDTH_REM`] applies to (doc-8 §2.1). Git 履歴欄 is deliberately
 * absent: 全面 is where the whole commit list is read (doc-8 §2.1), so narrowing it would cost the
 * placement its reason to exist.
 *
 * This list is this screen's answer, not the cap's whole reach — a screen with no `DetailSection`
 * could not appear in it, and doc-10 §5's 閲覧 の本文 takes the cap without being named here.
 */
export const PROSE_SECTIONS: readonly DetailSection[] = [
  "description",
  "ac",
  "dod",
  "plan",
  "notes",
  "comments",
  "finalSummary",
] as const;

// --- 既定の永続 (doc-8 §2.2) -----------------------------------------------------------------

/**
 * How the placement on screen stands to the one アプリ設定 holds as the 既定 (doc-8 §2.2). Three
 * states rather than a boolean, because they end differently: the usual case is that choosing a
 * placement stored it, a mere difference resolves itself on the next switch (the 設定画面 can move the
 * 既定 without moving the screen), and a refused write never resolves at all — decision-13 forbids
 * overwriting a settings file newer than this build.
 */
export type PlacementPersistence =
  | { state: "default" }
  | { state: "notDefault"; stored: DetailPlacement }
  | { state: "refused"; reason: string };

export function placementPersistence(
  current: DetailPlacement,
  stored: DetailPlacement,
  failure: string | null,
): PlacementPersistence {
  if (failure !== null) {
    return { state: "refused", reason: failure };
  }
  return current === stored ? { state: "default" } : { state: "notDefault", stored };
}

/**
 * 既定印 (doc-8 §2.2): the word that says a switch is the placement the next start will open in.
 *
 * **It is not printed on the button.** Since TASK-71 the three switches are アイコンのみのボタン
 * (doc-11 §2.4), which by definition carry no visible text, and the 既定印 the screen shows is the
 * underline 画面設計案 02 puts there (doc-12 §3). An underline reaches the eye and nothing else, so
 * this word is what carries the same fact into the accessible name — see [`placementSwitchName`].
 */
export function defaultPlacementMark(): string {
  return msg().taskDetail.placementDefaultMark;
}

/**
 * The name an アイコンのみのボタン for `placement` announces (doc-8 §2.2, doc-11 §2.4).
 *
 * One place decides it because the same string is the `aria-label` and the `title`, and because the
 * 既定 half of it has to appear wherever the underline does — a screen reader offered the name without
 * it would be told which placement the button chooses but never which one the app will open in.
 */
export function placementSwitchName(label: string, isDefault: boolean): string {
  return isDefault ? msg().taskDetail.placementIsDefault(label, defaultPlacementMark()) : label;
}

/**
 * 3 配置の切替が刷る図形 (doc-8 §2.2, TASK-71). The assignment is doc-8's, so it lives beside the rest
 * of doc-8's tables rather than in `lucide.ts`: that module holds figures and knows nothing about
 * placements, and this record is what makes a placement without a figure fail to compile.
 */
export const PLACEMENT_ICON: Record<DetailPlacement, IconName> = {
  sidebar: "panel-right",
  modal: "panel-top-dashed",
  full: "maximize",
};

/**
 * 開閉印 が刷る図形 (doc-8 §3, doc-12 §3, TASK-73). The mark points at **what the 区画 is**, not at what
 * pressing it would do: 画面設計案 02 draws `▼` on the expanded 実装計画 and `▶` on the folded 実装ノート.
 * That is doc-7 §2.3's convention (行折畳み) and the opposite of §2.2's (列折畳み), where no direction can
 * mean open or closed — so the axis is written down here rather than left to whoever reads the figure.
 *
 * Held beside the placement tables for the same reason as [`PLACEMENT_ICON`]: `lucide.ts` holds figures
 * and knows nothing about 区画, and one record is what keeps the 区画見出し and the 未知セクション inside
 * the 不整合区画 from drifting into two different pairs of chevrons.
 */
export const DISCLOSURE_ICON: Record<"open" | "closed", IconName> = {
  open: "chevron-down",
  closed: "chevron-right",
};

/**
 * 前後移動 が刷る図形 (doc-8 §2.2, TASK-139). Arrows, not the chevrons above: doc-11 §2.4's
 * 同じ図形を別の操作へ与えない makes chevron the 折畳み family and arrow the 移動 one, and a fold is
 * not a move.
 *
 * Here rather than inline in `TaskDetail.svelte` for the reason [`DISCLOSURE_ICON`] is here — but the
 * rule this one carries is **cross-screen**, so being reachable matters more than being tidy: 脇パネル
 * 配置 draws this pair beside the swimlane's own four figures, and `swimlane.test.ts` checks the two
 * screens' tables together. Left in the markup it was read by nothing, and giving it a chevron would
 * have collided with 行折畳み on that very placement with every test still passing.
 *
 * **The same pair is 行の並べ替え's** (`LANE_FIGURE`, `swimlane.ts`). §2.4 allows that: it bars sharing
 * between operations that point at different things, and both of these move one step up or down.
 */
export const STEP_ICON: Record<"previous" | "next", IconName> = {
  previous: "arrow-up",
  next: "arrow-down",
};

/**
 * What the switch says about the 既定 beyond the mark, or `null` when the placement on screen *is*
 * the 既定 and the mark alone says everything.
 */
export function placementPersistenceNote(
  persistence: PlacementPersistence,
  label: (placement: DetailPlacement) => string,
): string | null {
  switch (persistence.state) {
    case "default":
      return null;
    case "notDefault":
      return msg().taskDetail.placementStoredElsewhere(label(persistence.stored));
    case "refused":
      return msg().taskDetail.placementNotStored(persistence.reason);
  }
}
