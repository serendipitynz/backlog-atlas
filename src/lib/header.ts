/**
 * 共通入口とメニュー (doc-7 §2.1, TASK-56) as one derivation.
 *
 * - **The menu is where the 共通入口 are.** TASK-66 folded the header's per-entry buttons away, so
 *   [`HEADER_ENTRIES`] now has exactly one place that draws it. §2.1's ヘッダに出している操作はメニューに
 *   も同じものを置く still holds — nothing is on the 帯 that the menu lacks — and the list stays a
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
 * | doc-7 §2.1 全プロジェクトに効く入口 | [`HEADER_ENTRIES`] | 共通入口: the entries the ☰'s メニュー offers — 登録 and 設定 |
 * | doc-7 §2.1 メニュー | [`MenuItem`] + [`headerMenu`] | メニュー項目: one line of the menu, and the whole list in order |
 * | doc-7 §2.1 キーボード操作一覧（メニュー内） | [`shortcutHelpLabel`] + the `shortcutHelp` item | the menu line that opens the 一覧モーダル, where the 割り当て一覧's 画面に出す列 are drawn. The 一覧 itself is `shortcuts.ts`, which §2.1 holds apart from that table |
 * | decision-44 告知の出し先（メニューの行） | [`releasePageLabel`] + the `releasePage` item | the line that opens リリースページ, there whether or not a 新しい版 exists |
 * | decision-44 告知の出し先（☰ の印） | [`menuName`] | the ☰'s own name while a 新しい版 stands — the word beside the mark |
 * | decision-44 新しい版 | [`releaseNoticeText`] | what the line adds when one is published |
 * | doc-7 §2.1 プロジェクト一覧（メニュー内） | [`MenuProject`] + the `toggleProject` items | 登録済みプロジェクトを台帳の並び順に 1 行ずつ並べた群 |
 * | doc-7 §2.1 表示切替行 | one `toggleProject` item | 一覧の 1 行。押すとそのプロジェクト行の表示・非表示が入れ替わる |
 * | doc-7 §2.1 表示中の印 | `MenuItem.shown` on a `toggleProject` item | whether that project's row is on screen — the figure `HeaderMenu.svelte` draws from it |
 * | doc-7 §2.1 すべてのプロジェクトを表示 | [`showAllProjectsLabel`] + the `showAllProjects` item | 一覧の先頭に置く、全行を表示へ戻す行 |
 * | doc-7 §2.1 群（項目の並びの単位） | [`MenuGroup`] + each item's `group` | which of the two 群 a line is in: `layer` raises a 被せ層, `rows` changes which rows the grid draws |
 * | doc-7 §2.1 区切り線 | [`startsGroup`] | メニューの群と群の境目に置く水平の線を指す。Where one is drawn — read from 群 alone, never from `availability` |
 * | doc-11 §5 無効化提示 | [`showAllProjectsAvailability`] | 保留判定 と 保留理由 as one value: whether すべてのプロジェクトを表示 may be pressed, and — when it may not — [`showAllProjectsHeldReason`] if every row is shown, [`noProjectsReason`] if the ledger is empty |
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

import type { Availability } from "./availability";
import { AVAILABLE, withheld } from "./availability";
import { msg } from "./messages";
import type { ShortcutAction } from "./shortcuts";
import type { ReleaseNotice } from "./wire";

// --- 共通入口 (doc-7 §2.1) ---------------------------------------------------------------------

/** The two 共通入口. Closed: a third would have to be ledger-wide to belong here at all. */
export type HeaderEntryId = "register" | "settings";

export interface HeaderEntry {
  id: HeaderEntryId;
  /** The assignment that opens it, so the chord and the menu item name the same operation. */
  action: ShortcutAction;
}

/**
 * One 共通入口 with the words the menu draws it with.
 *
 * `note` is what the entry reaches, in one line — the `title` on the menu line. It sat on the entry's
 * own button until TASK-66 folded that button away; moving it rather than dropping it is why the
 * entries can lose their buttons without the screen losing what they said.
 */
export interface HeaderEntryView extends HeaderEntry {
  label: string;
  note: string;
}

/**
 * 共通入口とは、☰ のメニューに必ず現れる入口 (プロジェクトを登録・設定) の列を指す。
 * Ordered as doc-7 §2.1 lists them: 登録 (台帳全体) then 設定 (アプリ設定).
 */
export const HEADER_ENTRIES: readonly HeaderEntry[] = [
  { id: "register", action: "openRegister" },
  { id: "settings", action: "openSettings" },
] as const;

/** One 共通入口 as the menu draws it, worded where it is read. */
export function headerEntryView(entry: HeaderEntry): HeaderEntryView {
  return { ...entry, ...msg().shell.headerEntry[entry.id] };
}

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
export function shortcutHelpLabel(): string {
  return msg().shell.shortcutHelpLabel;
}

/**
 * 告知の出し先 の行 (decision-44 §3): the line that opens リリースページ.
 *
 * **Named for where it goes, not for what it announces.** It is on the menu whether or not a
 * 新しい版 exists — a line that appeared and vanished would make the menu a different length at
 * different starts — so a name like 更新を確認 would also be wrong about what pressing it does
 * (it opens a page; the 照会 already happened at startup).
 */
export function releasePageLabel(): string {
  return msg().shell.releasePageLabel;
}

/**
 * What the リリースページ line adds while a 新しい版 stands (decision-44 §3), and `null` when none
 * does — 照会の縮退 included, which is why one absent value covers both.
 *
 * Visible rather than a figure: the line has a label of its own, so an icon stating the state beside
 * it would be a second name for the same control (doc-11 §2.4 可視の文言を持つ控えの中のアイコン).
 */
export function releaseNoticeText(notice: ReleaseNotice | null): string | null {
  return notice === null ? null : msg().shell.releaseNoticeAvailable(notice.version);
}

/**
 * The name the ☰ announces (decision-44 §3, doc-11 §2.4).
 *
 * The ☰ is an アイコンのみのボタン, so its 印 is a fill and reaches the eye alone; §2.4 asks for the
 * same state in the name, which is the shape `placementSwitchName` takes for the 既定印. The version
 * is not in it — the line inside the menu carries which one, and this answers only whether to open the
 * menu at all.
 */
export function menuName(label: string, hasNotice: boolean): string {
  return hasNotice ? msg().shell.menuHasReleaseNotice(label) : label;
}

/**
 * The line that puts every project row back on screen (doc-7 §2.1), in the user's own words
 * (2026-08-09). It read 行非表示をすべて戻す until TASK-131, when the group below it stopped being a list
 * of hidden rows: a line named for the state it undoes belongs above a list of what is undone, and the
 * list now names every registered project whichever state it is in.
 */
export function showAllProjectsLabel(): string {
  return msg().shell.showAllProjectsLabel;
}

/**
 * 保留理由 for すべてのプロジェクトを表示 while every registered row is on screen. Written as a sentence
 * rather than as parenthetical shorthand because nothing prints it — it is read aloud or not at all
 * (see [`omitsSentence`]), and brackets that kept a visible note short only become noise in speech.
 */
export function showAllProjectsHeldReason(): string {
  return msg().shell.showAllProjectsHeld;
}

/**
 * 保留理由 for the same line when the ledger holds nothing at all. A second reason rather than the one
 * above, because the two are withheld by different facts and only one of them is stated by the 区画:
 * an all-ticked list says 表示されています by itself, while an *empty* list says nothing, and doc-11 §8's
 * licence turns on the 区画 having said it. So this one is printed (it is not in [`omitsSentence`]) —
 * otherwise the first thing a new install shows in its menu is a held line with no reason anywhere,
 * which is exactly what doc-11 §5 refuses (故障と区別できない).
 */
export function noProjectsReason(): string {
  return msg().shell.noProjectsRegistered;
}

/**
 * Whether すべてのプロジェクトを表示 may be pressed, and why not while every row is already on screen.
 * 保留判定 and 保留理由 travel as one value for the reason doc-11 §5 gives twice over: 理由の無い無効化
 * を置かない — an unpressable control with no reason cannot be told from a broken one — and the reason
 * is not the judgement, so dropping the sentence cannot quietly make the line pressable.
 */
export function showAllProjectsAvailability(
  projectCount: number,
  hiddenCount: number,
): Availability {
  if (projectCount === 0) {
    return withheld(noProjectsReason());
  }
  return hiddenCount > 0 ? AVAILABLE : withheld(showAllProjectsHeldReason());
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
  return reason === showAllProjectsHeldReason();
}

/**
 * Which 群 a line belongs to (doc-7 §2.1). `layer` lines raise a 被せ層 and leave the grid as it is;
 * `rows` lines change which rows the grid draws and raise nothing; `external` lines leave Atlas
 * altogether — they hand a URL to the OS and change nothing on screen. That is the axis, not the
 * position: a line's 群 is a property of what pressing it does, so it is decided here and cannot drift
 * with how the menu happens to be laid out.
 *
 * `external` arrived with 版の告知 (decision-44 §3), which is neither of the first two: pressing it
 * raises no layer and moves no row.
 */
export type MenuGroup = "layer" | "rows" | "external";

/**
 * One line of the menu. `availability` carries both halves of doc-11 §5's 無効化提示 — whether the line
 * is withheld and, when it is, what the menu says about it.
 *
 * `key` identifies the line for the markup that draws it. It is decided here rather than derived at the
 * `{#each}`, because deriving it from `kind` is wrong in a way nothing catches until the menu is opened:
 * the two 共通入口 share a `kind`, Svelte treats duplicate keys as a runtime error, and the whole menu
 * then fails to render. Neither `svelte-check` nor a unit test of this module saw that — only opening the
 * menu did. Keeping the key in the data makes uniqueness a property this module can be tested for.
 */
export type MenuItem =
  | { kind: "entry"; key: string; group: MenuGroup; entry: HeaderEntryView; availability: Availability }
  | { kind: "shortcutHelp"; key: string; group: MenuGroup; label: string; availability: Availability }
  | {
      kind: "releasePage";
      key: string;
      group: MenuGroup;
      label: string;
      /** 新しい版, as the line states it — `null` while none is published (decision-44 §5). */
      notice: string | null;
      availability: Availability;
    }
  | {
      kind: "showAllProjects";
      key: string;
      group: MenuGroup;
      label: string;
      availability: Availability;
    }
  | {
      kind: "toggleProject";
      key: string;
      group: MenuGroup;
      slug: string;
      label: string;
      /** 表示中の印 — true while that project's row is one the grid draws. */
      shown: boolean;
      availability: Availability;
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
 * It reads 群 and nothing else — in particular not `availability`. Until TASK-130 the menu drew no 区切り線 at
 * all, and what a user saw at this very boundary was the 無効化提示 破線枠 of the すべて line (doc-11 §5):
 * a line that appeared when there was nothing to restore and vanished when there was, which reads as the
 * menu's grouping coming and going. The 破線枠 is right and stays; what was missing is a mark of the
 * 群 that does not depend on whether the line below it can be pressed.
 */
export function startsGroup(items: readonly MenuItem[], index: number): boolean {
  return index > 0 && items[index - 1].group !== items[index].group;
}

/**
 * The menu in order: the 共通入口 first (they are what this list is about), then the line to the
 * 一覧モーダル, then リリースページを開く, then the プロジェクト一覧 — すべてのプロジェクトを表示, then one
 * line per registered project in ledger order (doc-3 §2.2, which is the order the grid draws its rows
 * in).
 *
 * The 割り当て一覧 and リリースページ lines sit above the プロジェクト一覧 rather than at the end, because
 * the group below them is as long as the ledger: a fixed line placed after a variable list moves
 * whenever a project is registered, and the menu is walked with the keyboard.
 *
 * The list is offered on both screens rather than only on the swimlane. A row hidden earlier is found
 * again here, and making the list appear only after returning to the grid would be a control that hides
 * when it is needed. With nothing hidden the すべて line is present and held, which is the shape
 * doc-11 §5 asks for everywhere.
 */
export function headerMenu(
  projects: readonly MenuProject[],
  releaseNotice: ReleaseNotice | null,
): MenuItem[] {
  const hiddenCount = projects.filter((project) => !project.shown).length;
  return [
    ...HEADER_ENTRIES.map(
      (entry): MenuItem => ({
        kind: "entry",
        key: `entry:${entry.id}`,
        group: "layer",
        entry: headerEntryView(entry),
        availability: AVAILABLE,
      }),
    ),
    {
      kind: "shortcutHelp",
      key: "shortcutHelp",
      group: "layer",
      label: shortcutHelpLabel(),
      availability: AVAILABLE,
    },
    {
      kind: "releasePage",
      key: "releasePage",
      group: "external",
      label: releasePageLabel(),
      notice: releaseNoticeText(releaseNotice),
      // Pressable whether or not a 新しい版 exists: what it opens is a page, and that page is there
      // either way. A held line would be doc-11 §5's shape for an operation Atlas cannot perform.
      availability: AVAILABLE,
    },
    {
      kind: "showAllProjects",
      key: "showAllProjects",
      group: "rows",
      label: showAllProjectsLabel(),
      availability: showAllProjectsAvailability(projects.length, hiddenCount),
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
      availability: AVAILABLE,
    })),
  ];
}
