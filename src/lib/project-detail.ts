/**
 * プロジェクト詳細画面 (doc-10, TASK-55) as pure functions — the part that is about the project
 * itself. The forms for 文書・マイルストーン・新規タスク already have their rules in `manage.ts`, so
 * what is here is the screen's frame (区画切替 and the two 帯) and the 概要区画 (台帳エントリ).
 *
 * ## Referent table (doc-10 term → identifier here)
 *
 * Fixed before naming, following `ledger.ts` and `manage.ts`.
 *
 * | doc-10 | here | is |
 * |---|---|---|
 * | §1 区画切替 | [`DetailSection`] + [`DETAIL_SECTIONS`] | the four items 概要・文書・マイルストーン・新規タスク — a display change within one screen, not a screen transition |
 * | §3 区画ナビ | [`SECTION_NAV_WIDTH_REM`] | the 12rem column down the left that houses the 区画切替 — the place, where §1 is the choice |
 * | §1 一覧列 | [`LIST_COLUMN_WIDTH_REM`] | the 16rem column that keeps the selection — 文書一覧 (§5) and マイルストーン一覧 (§6) are its two instances; the pane right of it takes the remaining width, so only the list's width is a constant |
 * | §5 表示パス | [`displayPath`] | the read layer's `source_path` made project-relative for the pane's heading — display only, never the value `-p` takes |
 * | §3 台帳読取専用帯 | `band.ts`'s [`LEDGER_READ_ONLY_BAND`] | that the ledger file has degraded to read-only, and what still works |
 * | §3 CLI 縮退帯 | `band.ts`'s [`cliDegradedBand`] | that no supported CLI was found, and what still works |
 * | §4.1 送る属性を保存の直前に列挙する | [`SubmittedAttribute`] + [`submittedAttributes`] | 送信属性一覧: the attributes a save puts on `ledger_update`, as name, current value and value to send |
 * | §4.1 slug は編集手段を提供しない | [`SLUG_IMMUTABLE_NOTE`] | what changing it would take, and what that would break |
 * | §4.1 remote 現在値 | [`gitRemoteLine`] | the project root's Git remote as it reads now — one line, in decision-6's families. Never the ledger's recorded 有無属性 |
 * | §4.1 記録と検出の食い違い | [`gitRemoteDisagreement`] | 状態文: the recorded 有無属性 and the current read disagree — `null` while they agree |
 * | §4.1 再検出 | [`redetectBlocked`] | why the re-detection cannot be pressed, if it cannot |
 * | §4.1 ルートを変えたときは Backlog ルートも併せて送る | [`rootMoveNote`] | the note under the field saying which value will travel |
 * | §4.1 移動が成立すると編集セッションは閉じる | [`movesRoot`] | whether this update is a move — the trigger for closing |
 * | §8 台帳読取専用では概要区画の入力と登録解除を無効化する | [`OVERVIEW_READ_ONLY_NOTE`] | the sentence, near the controls, saying the inputs are stopped too |
 * | §4.2 別名が効くかの態 | [`ALIAS_EFFECT_NOTES`] | how one 別名表 row takes effect — four states, see below |
 * | §4.3 確認は slug の入力一致とする | [`unregisterBlocked`] | slug 入力一致: holds the action until the typed text matches, and says what is holding it |
 * | §8 台帳読取専用と CLI 縮退は独立 | [`overviewBlocked`] and `manage.ts`'s `issueAvailability` applying separately | one standing leaves the other's 区画 working |
 *
 * ## Why the 別名表 shows four states and not three
 *
 * doc-10 §4.2 used to list three (宣言あり / draft 専用 / 宣言なし → 効果なし), but
 * `interpret/status.rs`'s `StatusDeclaration` has a fourth, `NoDeclaredSet`: a root whose
 * `config.yml` declares no statuses at all (decision-4 measured `geomyth` in that state). There
 * `map_status` does not cut the column mapping, so the alias *does* apply — folding it into the
 * third would have put「効果なし」and the 不整合 colour on an alias that works. The doc was revised to
 * name the fourth state, and this module states one per row.
 *
 * Nothing here writes anything: the outputs are request values for the ledger commands and the
 * sentences the screen shows (doc-3 §2.1).
 */

import type { EntryEdit } from "./ledger";
import type { GitRemoteRead, ProjectEntry, UpdateRequest } from "./wire";

// --- 区画切替 (doc-10 §1/§3) -------------------------------------------------------------------

export type DetailSection = "overview" | "documents" | "milestones" | "newTask";

/** The four items down the left. Ordered as doc-10 §3's table is, not by how far each writes. */
export const DETAIL_SECTIONS: readonly { id: DetailSection; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "documents", label: "文書" },
  { id: "milestones", label: "マイルストーン" },
  { id: "newTask", label: "新規タスク" },
] as const;

// --- 画面の列幅 (doc-10 §3/§5, 画面設計案 07) --------------------------------------------------
//
// Held here rather than written into the SCSS so the number a test or a doc cites and the number
// the browser lays out are the same one (the placement.ts pattern, TASK-113). **Every rem here
// sizes a content box, not a footprint** (TASK-115): this repository has no global box-sizing
// reset, so padding and the 1px rule sit outside these values.

/** 区画ナビ (doc-10 §3): the column housing the 区画切替, design 07's 12rem. */
export const SECTION_NAV_WIDTH_REM = 12;

/**
 * 一覧列 (doc-10 §1): the column that keeps the selection, design 07's 16rem. One constant rather
 * than one per 区画 because doc-10 §1 makes it one column type with two instances — 文書一覧 (§5)
 * and マイルストーン一覧 (§6). Two constants holding 16 would let the two drift apart while the doc
 * still calls them the same column. The pane right of it has no constant — it takes what remains.
 */
export const LIST_COLUMN_WIDTH_REM = 16;

/**
 * 表示パス (doc-10 §5): the read layer's `source_path` made project-relative for the 編集ペイン's
 * heading. Display only — the update form's path field is a *move request* and never holds this
 * (doc-10 §5). A path not under the root is shown as read rather than guessed at, and both
 * separators are tried because `source_path` comes from the Rust side's scan on whatever OS runs.
 */
export function displayPath(sourcePath: string, projectRoot: string): string {
  for (const separator of ["/", "\\"]) {
    const prefix = projectRoot.endsWith(separator) ? projectRoot : projectRoot + separator;
    if (sourcePath.startsWith(prefix)) return sourcePath.slice(prefix.length);
  }
  return sourcePath;
}

// --- 概要区画: 送信属性一覧 (doc-10 §4.1) ------------------------------------------------------

/** One row of the 送信属性一覧. `from` is what the ledger holds, `to` is what the save sends. */
export interface SubmittedAttribute {
  /** The ledger's attribute name (doc-3 §3): the TOML key, not a heading word the screen invented. */
  attribute: string;
  from: string;
  to: string;
}

/** The 別名表 on one line. An empty table is「なし」, not "" — blank would make the diff unreadable. */
export function aliasSummary(table: Record<string, string> | undefined): string {
  const entries = Object.entries(table ?? {});
  if (entries.length === 0) return "なし";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key} → ${value}`)
    .join(" / ");
}

/**
 * The attributes a save puts on `ledger_update` (doc-10 §4.1 送る属性を明示する). Built from the
 * request itself, so what is listed is what will actually travel rather than what the screen thinks
 * it changed — `toUpdateRequest` carrying both roots on a move shows up here. An empty list is
 * 変更なし.
 */
export function submittedAttributes(
  entry: ProjectEntry,
  request: UpdateRequest,
): SubmittedAttribute[] {
  const attributes: SubmittedAttribute[] = [];
  if (request.project_root !== undefined) {
    attributes.push({
      attribute: "project_root",
      from: entry.project_root,
      to: request.project_root,
    });
  }
  if (request.backlog_root !== undefined) {
    attributes.push({
      attribute: "backlog_root",
      from: entry.backlog_root,
      to: request.backlog_root,
    });
  }
  // `redetect_git_remote` is deliberately absent: since TASK-124 the re-detection is its own control
  // that issues on press (doc-10 §4.1), so it never rides on a save and has nothing to list here.
  if (request.status_aliases !== undefined) {
    attributes.push({
      attribute: "status_aliases",
      from: aliasSummary(entry.status_aliases),
      to: aliasSummary(request.status_aliases),
    });
  }
  return attributes;
}

/**
 * Whether this update moves the project (doc-3 §4.3). A move closes the project's open 編集セッション
 * (doc-10 §4.1) — not because the session would hold a stale version, but because it would name
 * files in *another root*. A 文書更新 travels as a document id, so if the new root holds the same id
 * the 実行前照合 succeeds against that root's own fresh read and the old root's body replaces it
 * whole (`--content` is a full replacement).
 *
 * `toUpdateRequest` carries both roots on a move, and a `backlog_root`-only change moves what is
 * read as well, so either field being present counts.
 */
export function movesRoot(request: UpdateRequest): boolean {
  return request.project_root !== undefined || request.backlog_root !== undefined;
}

/** Why slug has no field, and what changing it would take instead (doc-10 §4.1, doc-3 §3.1). */
export const SLUG_IMMUTABLE_NOTE =
  "slug は横断タスクID の左辺として全タスクの参照に使われるため、変更手段を提供しません。" +
  "別の slug にするには登録を解除して登録し直すことになり、そのとき Git 履歴表示の同一性は切れます。";

/**
 * The note under the project-root field once it differs (doc-10 §4.1). The default would be
 * `<new root>/backlog`, but what travels is the value in the field, so the note names that value.
 * `null` while this is not a move.
 */
export function rootMoveNote(entry: ProjectEntry, edit: EntryEdit): string | null {
  const projectRoot = edit.projectRoot.trim();
  if (projectRoot === "" || projectRoot === entry.project_root) return null;
  const backlogRoot = edit.backlogRoot.trim();
  return (
    `同一プロジェクトの移動として扱い、slug ${entry.slug} を保ったまま project_root と backlog_root の` +
    `両方を送ります。backlog_root は既定の <新ルート>/backlog ではなく、いま欄にある ` +
    `${backlogRoot === "" ? "（空）" : backlogRoot} を送ります。` +
    "移動が成立すると、このプロジェクトについて開いている編集セッションは閉じます。"
  );
}

// --- 概要区画: remote 現在値と再検出 (doc-10 §4.1, decision-6) ---------------------------------

/**
 * The value line under the 概要区画's Git remote label — its remote 現在値 (doc-10 §4.1).
 *
 * `kind` is decision-6's three families, the same ones `detail.ts`'s `HistoryLine` uses: 正常な不在
 * は中立、設定で解消できるものは中間、失敗だけが族の色. The type is not shared with that module because
 * this line is about a project root rather than about one task's Git 履歴欄 — what is shared is the
 * decision, and restating the union here is what keeps the 概要区画 from importing タスク詳細's model.
 */
export interface GitRemoteLine {
  text: string;
  kind: "neutral" | "setting" | "failure";
  /**
   * Which remote the address came from, when there is one. Shown because Atlas picks `origin`, or
   * the first configured remote when there is no `origin` — a URL alone would read as *the* remote's
   * address in a repository that has several.
   */
  name: string | null;
  /** True when `text` is an address rather than a sentence, so the screen can set it in code type. */
  address: boolean;
}

/** `null` for a read that has not landed yet — 未取得 is not 不在 (decision-6). */
export function gitRemoteLine(read: GitRemoteRead | null): GitRemoteLine {
  if (read === null) {
    return { text: "読み込み中…", kind: "neutral", name: null, address: false };
  }
  switch (read.state) {
    case "configured":
      return { text: read.url, kind: "neutral", name: read.name, address: true };
    case "remoteAbsent":
      return {
        text: "Git remote 不在（このリポジトリに remote が構成されていません）",
        kind: "setting",
        name: null,
        address: false,
      };
    case "noRepository":
      return {
        text: "Git 対象不在（プロジェクトルートが Git リポジトリではありません）",
        kind: "setting",
        name: null,
        address: false,
      };
    case "unreadable":
      return { text: `remote を読めません: ${read.detail}`, kind: "failure", name: null, address: false };
  }
}

/**
 * 状態文 (doc-11 §8): what the ledger recorded and what Git says now disagree. `null` while they
 * agree, and while the read is `unreadable` — a failed read says nothing about whether a remote
 * exists, so treating it as 不在 would report a disagreement that has not been observed.
 *
 * The sentence states the two values and stops there. Which one to move is the 再検出する control's
 * business, and it sits beside this line already; doc-11 §8 keeps a 状態文 to what is there.
 */
export function gitRemoteDisagreement(
  entry: ProjectEntry,
  read: GitRemoteRead | null,
): string | null {
  if (read === null || read.state === "unreadable") return null;
  const found = read.state === "configured";
  if (found === entry.git_remote_present) return null;
  return found
    ? "台帳が記録している Git remote 有無属性は「なし」で、いまの検出と食い違っています。"
    : "台帳が記録している Git remote 有無属性は「あり」で、いまの検出と食い違っています。";
}

/**
 * Why 再検出 is held, if it is (doc-10 §4.1, doc-11 §5). The re-detection writes the entry's Git
 * remote 有無属性, so a read-only ledger stops it for the same reason it stops the save — which is
 * why this is `overviewBlocked` with the operation named, not a rule of its own.
 */
export function redetectBlocked(context: { readOnly: boolean; busy: boolean }): string | null {
  if (context.readOnly) {
    return "台帳が読み取り専用のため、Git remote の再検出はできません。";
  }
  return overviewBlocked(context);
}

// --- 概要区画: status 別名表の効き方 (doc-10 §4.2) ---------------------------------------------

/** The four states `aliasKeyEffect` returns — one per `interpret::status`'s `StatusDeclaration`. */
export type AliasEffect = "declared" | "draft" | "noDeclaredSet" | "undeclared";

export interface AliasEffectNote {
  label: string;
  note: string;
  /**
   * Whether an alias here changes nothing. doc-10 §4.2 gives the 不整合 colour to this one state only,
   * which is what keeps `noDeclaredSet` — where the alias works, just without a declaration behind
   * it — out of the same mark.
   */
  ineffective: boolean;
}

export const ALIAS_EFFECT_NOTES: Record<AliasEffect, AliasEffectNote> = {
  declared: {
    label: "宣言あり",
    note: "config.yml の statuses にある status です。別名が効きます。",
    ineffective: false,
  },
  draft: {
    label: "draft 専用",
    note:
      "config.yml は宣言していませんが、既知の draft 状態として扱う値です。別名が効きます。",
    ineffective: false,
  },
  noDeclaredSet: {
    label: "宣言集合なし",
    note:
      "config.yml が statuses を 1 つも宣言していないため、宣言済みかを判定できません" +
      "（statuses を 1 つも宣言していない未初期化のルート）。宣言が矛盾しないので別名は効きます。",
    ineffective: false,
  },
  undeclared: {
    label: "宣言なし → 効果なし",
    note:
      "どこにも宣言が無い status です。別名を書いてもこの status のタスクは未分類区画に残ります。" +
      "台帳からは削除しません。",
    ineffective: true,
  },
};

// --- 概要区画: 登録解除 (doc-10 §4.3) ----------------------------------------------------------

/**
 * Why every 区画 stops issuing while this screen's own ledger write is in flight (review [P1]).
 * A save may be a move, and a move changes which files this screen's ids name: the boundary detaches
 * the old session and reopens the slug against the new root, so an issue made in that window arrives
 * after the reopen and is checked against the *new* root's read. It would pass, and `--content`
 * replaces a document whole. Distinct from `ISSUE_BUSY_REASON`, which is about another 発行 running.
 */
export const LEDGER_WRITE_IN_FLIGHT_REASON =
  "台帳エントリの更新を実行中です。ルートが変わることがあるため、完了するまで発行できません";

/**
 * The sentence that says a read-only ledger stops the 概要区画's *inputs* as well (doc-10 §8). Placed
 * apart from the band at the top of the screen: doc-11 §5 allows `disabled` when a 常時表示する補助文
 * sits near the control, and the top band is not near it. The same section allows the duplication.
 *
 * It carries the *cause* as well, because the 上部帯 ③ is 縮約 to one line (doc-11 §4) and states only
 * the consequence — this is the 別の場所 that clause sends the user to for the rest.
 *
 * The inputs are stopped, and not only the save, because an unpressable save over editable fields
 * lets the user change values that can never be written — and that input then counts as 未保存入力,
 * so they are later asked whether to discard changes that were never saveable.
 */
export const OVERVIEW_READ_ONLY_NOTE =
  "台帳ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。" +
  "この区画の入力・保存・登録解除はすべてできません。" +
  "文書・マイルストーン・新規タスクは台帳を書かないので、そちらは操作できます。";

/** What 登録解除 removes and what it leaves (doc-3 §4.2). Body text, not a note beside the button. */
export const UNREGISTER_SCOPE_NOTE =
  "登録解除は台帳エントリを 1 件消し、スイムレーンからこの行を外します。" +
  "対象プロジェクトの Backlog ルート・管理ファイル・Git リポジトリには触れません。" +
  "タスクの正本はそのまま残ります。";

/**
 * Why the 概要区画's update is held, if it is (doc-11 §5). Only 台帳読取専用 counts, never CLI 縮退:
 * a ledger operation runs no Backlog CLI (doc-10 §3/§8).
 */
export function overviewBlocked(context: { readOnly: boolean; busy: boolean }): string | null {
  if (context.readOnly) {
    return "台帳が読み取り専用のため、台帳エントリの更新はできません。";
  }
  return context.busy ? "台帳の更新を実行中です。完了するまで次の操作は始められません。" : null;
}

/**
 * Why 登録解除 is held, if it is (doc-10 §4.3, doc-11 §5). Ordered as the obstacles are: a ledger
 * that cannot be written stops it whatever else is true, an action in flight is next, and the slug
 * match is last. The comparison trims surrounding space — refusing over whitespace that came along
 * with a paste is not a confirmation of anything — but keeps case: a slug is lowercase letters,
 * digits and hyphens only (doc-3 §3.1), so a case difference is a typo.
 */
export function unregisterBlocked(
  typed: string,
  slug: string,
  context: { readOnly: boolean; busy: boolean },
): string | null {
  const blocked = overviewBlocked(context);
  if (blocked !== null) {
    return context.readOnly
      ? "台帳が読み取り専用のため、登録解除はできません。"
      : blocked;
  }
  return typed.trim() === slug
    ? null
    : `確認のため、この欄に slug「${slug}」をそのまま入力してください。一致するまで実行できません。`;
}
