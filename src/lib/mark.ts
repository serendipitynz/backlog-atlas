/**
 * The one vocabulary for "nothing is here, or what is here cannot be trusted" (decision-6,
 * decision-22). Every screen draws these states, and decision-6's operative rule is negative —
 * 族を同じ印へ混ぜない — so the families have to be a closed set defined in one place rather than a
 * colour chosen per component. `MarkKind` is that set; `app.scss` gives each member its own custom
 * property, and a component picks a kind instead of a colour.
 *
 * **decision-22 turned two of those families into one.** 判別できなかった項目・参照欠損 (doc-4 §5)
 * and バージョン不整合 (doc-9, 旧称 版ずれ) say the same thing about a task — その表示をそのまま信じて
 * よいかどうか — so they are bundled as **不整合** and drawn as a single ⚠️, with no family name and no
 * 由来名 on the card. What decision-6 still forbids is bundling anything *else* in: 読取不能 is about a
 * root rather than a task, and 照合不能・継続検出停止 are the absence of a way to look rather than a
 * finding.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `swimlane.ts` / `detail.ts` and the Rust modules' convention. The
 * full table this task worked from is `_sandbox/handoff/referent-table-task-77.md` 第 2 版.
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-6 正常な不在（空セル・コミット該当なし） | `MarkKind` `"neutral"` | the user's work is simply not there yet |
 * | decision-6 未設定（Git 対象不在・Git remote 不在） | `MarkKind` `"setting"` | a ledger attribute or environment the user can configure |
 * | decision-22 不整合 | `MarkKind` `"inconsistent"` | this one management file has at least one reason not to be trusted as shown (decision-24 widened it past tasks) |
 * | decision-24 写せなかったファイル | [`unmappedFileReason`] | a non-task file that never reached its collection — path and reason, no id |
 * | doc-9 §4.2 照合不能 / §3 継続検出停止 | `MarkKind` `"undetectable"` | there is no way to look for a divergence — not a divergence |
 * | decision-6 エラー提示（ルート読取不能・破損） | `MarkKind` `"unreadable"` | the read itself does not succeed |
 * | doc-9 §5 防げる競合（更新前競合） | [`VersionConflict`] `"preUpdate"` | caught by the pre-update check; no CLI ran |
 * | doc-9 §5 防げない喪失の事後通知 | [`VersionConflict`] `"postWindow"` | observed afterwards, as the re-read disagreeing with what was submitted |
 * | decision-22 理由行 | [`inconsistencyReasons`] | one line per reason, the only place a 由来 is named |
 * | doc-11 §3 印チップ | [`TaskMark`] | one chip carrying a word — what is left of the old marks |
 *
 * **The reasons are derived once and read twice** (decision-22): the card puts them in the ⚠️'s
 * accessible name, and the detail's 不整合区画 draws them as its lines. Two derivations would let the
 * card and the panel disagree about what is wrong with the same task, which is the cross-cutting
 * failure decision-6 was written against.
 */

import type {
  ConflictSet,
  FileHealth,
  ReferenceKind,
  RequiredField,
  TaskView,
  UnmappedFile,
} from "./wire";

/**
 * The presentation families decision-6 keeps apart, as decision-22 left them. Ordered from "normal"
 * to "broken", which is also the order a screen showing more than one of them reads in.
 */
export type MarkKind =
  | "neutral"
  | "setting"
  | "inconsistent"
  | "undetectable"
  | "unreadable";

/**
 * バージョン不整合 (doc-9, 旧称 版ずれ): a divergence Atlas *observed*, in the two stages doc-9 §5
 * splits the presentation into. Kept as one value with a kind rather than two booleans, because a
 * task is in one of them at a time and the two carry different evidence — the file whose version
 * moved, or the fields the re-read disagreed about.
 */
export type VersionConflict =
  | ({ kind: "preUpdate" } & ConflictSet)
  | { kind: "postWindow"; fields: string[] };

/**
 * One 印チップ (doc-11 §3): which family it belongs to, its word, and the reason behind it. 不整合 no
 * longer uses this — decision-22 draws it as a 印グリフ carrying no word — so what is left are the
 * marks whose object is not a single task (継続検出停止) and the two places in the detail heading
 * where a field itself could not be read.
 */
export interface TaskMark {
  kind: MarkKind;
  label: string;
  /** The full reason, for a `title` / `aria-label` — the chip itself stays one word. */
  detail: string;
}

/**
 * Which task a バージョン不整合 belongs to. Carried as a value so it can be captured *before* an
 * update is awaited: the screen's selection can move while the CLI runs, and a record filed against
 * "whatever is open when the answer arrives" would mark the wrong card.
 */
export interface ConflictTarget {
  slug: string;
  sourcePath: string;
}

/**
 * The identity of a task for the shell's バージョン不整合 record. `sourcePath` rather than the
 * TASK-ID: a 解析不能 task has no id (doc-4 §5) and can still be edited into a conflict. Serialized
 * rather than concatenated, so no two (slug, path) pairs can collide into one key.
 */
export function conflictKeyOf(slug: string, sourcePath: string): string {
  return JSON.stringify([slug, sourcePath]);
}

/**
 * Which files broke 全件一致, as one sentence (doc-9 §4.2.3-3). Every member is named, never just the
 * first: a list that stops at one entry makes the user re-read one file per retry, which is exactly
 * what §4.2.3-3 rules out. The two lists are worded apart because they call for different acts —
 * a diverged file is re-read, whereas an unread active task means the 書き換え対象集合 itself was
 * computed from a model that no longer describes the root (doc-9 §4.2.3-2).
 */
export function conflictSetDetail(set: ConflictSet): string {
  const parts: string[] = [];
  if (set.diverged.length > 0) {
    parts.push(`読み取り後に外部で変わったファイル: ${set.diverged.join("・")}`);
  }
  if (set.unread.length > 0) {
    parts.push(
      `読み取り後に増えたタスクファイル: ${set.unread.join("・")}` +
        "（書き換え対象集合が読取時点と違いうるため、照合できません）",
    );
  }
  // Neither list populated cannot happen — the boundary only reports a conflict when one of them is
  // non-empty — but the screen must still say something rather than render an empty reason.
  return parts.length > 0 ? parts.join(" / ") : "照合対象の版が確かめられませんでした";
}

/**
 * How a 参照欠損 names the kind of reference that did not resolve. Here rather than in the component
 * that draws the panel, because the same words now travel to the card's accessible name — the label
 * is part of the reason, not part of the panel.
 */
const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  milestone: "milestone",
  documentation: "documentation",
  reference: "references",
};

/**
 * 不整合の理由行 (decision-22): one line per reason, in the order 判別できなかった項目・参照欠損 →
 * バージョン不整合. Empty means the task is not 不整合.
 *
 * Each line names its 由来 and then the finding — 「参照欠損: documentation …」 — and nothing here
 * emits the word 不整合 itself: the total is what the ⚠️ already says, and repeating it per line
 * would put the family name back on screen one row at a time.
 *
 * `conflict` is passed in rather than read off the task: a バージョン不整合 is not a property of the
 * file (it reads perfectly well), it is what the shell observed about a save against it.
 *
 * **Every event yields at least one line.** An `unparseable` carrying neither a field list nor a
 * detail would otherwise leave a task marked ⚠️ whose panel says nothing, and a ⚠️ with no reason is
 * indistinguishable from a bug in this function.
 */
export function inconsistencyReasons(
  view: TaskView,
  conflict: VersionConflict | null,
): string[] {
  const reasons = healthReasons(view.task.health, "タスク");
  if (conflict !== null) reasons.push(versionConflictReason(conflict));
  return reasons;
}

/**
 * 不整合の理由行 for a management file that is not a task (decision-24): マイルストーン・文書・
 * 意思決定. Only 想定外スキーマ can reach here — a non-task file that fails 解析不能 never enters its
 * collection and becomes a 写せなかったファイル instead (doc-4 §5) — but the derivation is the shared
 * one, because「同じ理由を 2 か所で組み立てない」is what keeps the ⚠️ and the lines agreeing.
 *
 * There is no `conflict` parameter: doc-9's バージョン不整合 is recorded against a task's save, and
 * these three kinds have no such record to consult.
 */
export function fileInconsistencyReasons(health: FileHealth, kind: ManagedFileNoun): string[] {
  return healthReasons(health, kind);
}

/**
 * 写せなかったファイル as one 理由行 (decision-24). The same wording as an `unparseable` event's,
 * because it *is* one — the record just carries the payload without the tag (doc-4 §5).
 */
export function unmappedFileReason(file: UnmappedFile): string {
  return unparseableReasons(
    file.missingRequired,
    file.detail,
    MANAGED_FILE_NOUN[file.kind],
  ).join(" / ");
}

/**
 * What a file is called in a 理由行. Not a family name — the noun of the thing that failed.
 *
 * `decision` reads 決定事項, not doc-4 §1's 意思決定 (TASK-118). These nouns are printed for the
 * user, so they take the 画面に出る語; the read layer and the design documents keep 意思決定 for the
 * same object. The other three nouns are unaffected because their two words coincide.
 */
export type ManagedFileNoun = "タスク" | "マイルストーン" | "文書" | "決定事項";

const MANAGED_FILE_NOUN: Record<UnmappedFile["kind"], ManagedFileNoun> = {
  milestone: "マイルストーン",
  document: "文書",
  decision: "決定事項",
};

/** The one event→line mapping every 理由行 goes through (decision-22 「導出は 1 回」). */
function healthReasons(health: FileHealth, noun: ManagedFileNoun): string[] {
  if (health.state !== "degraded") return [];
  const reasons: string[] = [];
  for (const event of health.events) {
    switch (event.event) {
      case "unparseable":
        reasons.push(...unparseableReasons(event.missingRequired, event.detail, noun));
        break;
      case "unexpectedSchema":
        reasons.push(`想定外スキーマ: ${event.detail}`);
        break;
      case "danglingReference":
        reasons.push(`参照欠損: ${REFERENCE_KIND_LABEL[event.kind]} ${event.target}`);
        break;
    }
  }
  return reasons;
}

/**
 * 解析不能 as lines. Both say 解析不能, including the `detail` one: doc-4 §5 defines 想定外スキーマ as
 * 「frontmatter は読めるが」, and an 解析不能 is the case where it could not be read at all — labelling
 * its detail 想定外スキーマ would put a reason on screen under the name of the event that did not
 * happen.
 *
 * **Always at least one line.** A record carrying neither a field list nor a detail would otherwise
 * leave a ⚠️ whose panel says nothing, which is indistinguishable from a bug in this function.
 */
function unparseableReasons(
  missingRequired: readonly RequiredField[],
  detail: string | null,
  noun: ManagedFileNoun,
): string[] {
  const reasons: string[] = [];
  if (missingRequired.length > 0) {
    reasons.push(`解析不能: ${missingRequired.join("・")} を読めません`);
  }
  if (detail !== null) reasons.push(`解析不能: ${detail}`);
  if (reasons.length === 0) {
    reasons.push(`解析不能: このファイルを${noun}として写せませんでした`);
  }
  return reasons;
}

/**
 * バージョン不整合 as one 理由行 (doc-9 §5, decision-22). Both stages are バージョン不整合; the reason
 * differs. It reads as a line rather than as its own chip because decision-22 dropped the dedicated
 * one — the user's question is the same in both stages, and only the evidence differs.
 */
export function versionConflictReason(conflict: VersionConflict): string {
  return conflict.kind === "preUpdate"
    ? `バージョン不整合: 更新前競合 — ${conflictSetDetail(conflict)}。CLI を起動せずに保存を止めました`
    : `バージョン不整合: 照合後競合窓の事後通知 — 再読込した内容が送信した内容と一致しません（${conflict.fields.join(
        "・",
      )}）。窓内の外部更新が上書きで失われた可能性があります`;
}

/**
 * Is this task 不整合 (decision-22)? The single predicate both the card (doc-7 §3) and the detail
 * heading (doc-8 §3) call, so the two screens cannot disagree about whether a task carries the ⚠️.
 *
 * Read off the reasons rather than off `health.state` and `conflict` separately: what the ⚠️ promises
 * is that the panel has something to show, and deriving the mark from a different fact than the lines
 * is how a mark with an empty panel appears.
 */
export function isInconsistent(view: TaskView, conflict: VersionConflict | null): boolean {
  return inconsistencyReasons(view, conflict).length > 0;
}

/**
 * The ⚠️'s accessible name (doc-11 §2.4): the figure leaves nothing behind for a screen reader, so
 * the word and the reasons are given in text. One sentence rather than a list because it is read as
 * a label, and `title` carries the same string for the pointer.
 */
export function inconsistencyLabel(reasons: readonly string[]): string {
  return `不整合: ${reasons.join(" / ")}`;
}

/** 継続検出停止 (doc-9 §3) as the row's own 印チップ — `undetectable`, never 不整合 (doc-9 §5). */
export const UNWATCHED_MARK: TaskMark = {
  kind: "undetectable",
  label: "継続検出停止",
  detail:
    "ファイル監視または変更通知の購読が動いていないため、外部変更が画面へ届きません。" +
    "表示が実ファイルより古い可能性がありますが、版がずれているとは限りません。" +
    "再読込で現在の内容を読み直せます。",
};
