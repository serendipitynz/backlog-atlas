/**
 * The one vocabulary for "nothing is here, or what is here is incomplete" (decision-6). Every
 * screen draws these states, and decision-6's operative rule is negative — 三者を同じ印へ混ぜない —
 * so the families have to be a closed set defined in one place rather than a colour chosen per
 * component. `MarkKind` is that set; `app.scss` gives each member its own custom property, and a
 * component picks a kind instead of a colour.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `swimlane.ts` / `detail.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-6 正常な不在（空セル・コミット該当なし） | `MarkKind` `"neutral"` | the user's work is simply not there yet |
 * | decision-6 未設定（Git 対象不在・Git remote 不在） | `MarkKind` `"setting"` | a ledger attribute or environment the user can configure |
 * | doc-4 §5 縮退（解析起因） | `MarkKind` `"degraded"` | the file could not be parsed in full |
 * | doc-9 競合（版ずれ） | `MarkKind` `"versionConflict"` | the file reads fine and its version was *observed* to have moved |
 * | doc-9 §4.2 照合不能 / §3 継続検出停止 | `MarkKind` `"undetectable"` | there is no way to look for a divergence — not a divergence |
 * | decision-6 エラー提示（ルート読取不能・破損） | `MarkKind` `"unreadable"` | the read itself does not succeed |
 * | doc-9 §5 防げる競合（更新前競合） | [`VersionConflict`] `"preUpdate"` | caught by the pre-update check; no CLI ran |
 * | doc-9 §5 防げない喪失の事後通知 | [`VersionConflict`] `"postWindow"` | observed afterwards, as the re-read disagreeing with what was submitted |
 * | decision-6 縮退印 / doc-7 §3 カードの印 | [`TaskMark`] | one chip on a card or in the detail heading |
 *
 * `undetectable` exists because doc-9 §5 requires 照合不能 not to read as a conflict: 版がずれている
 * とは限らず、確かめる方法が無い. Folding it into `versionConflict` would tell the user a divergence
 * was found, which is the misreading that clause forbids. The same applies to 継続検出停止 (doc-9 §3
 * の継続検出が動いておらず、外部変更が画面へ届かない状態) — the display may be behind the file, and
 * Atlas cannot say whether it is.
 */

import type { TaskView } from "./wire";

/**
 * The presentation families decision-6 keeps apart. Ordered from "normal" to "broken", which is
 * also the order [`taskMarks`] emits in, so a card reads the same way every time.
 */
export type MarkKind =
  | "neutral"
  | "setting"
  | "degraded"
  | "versionConflict"
  | "undetectable"
  | "unreadable";

/**
 * 版ずれ (doc-9): a divergence Atlas *observed*, in the two stages doc-9 §5 splits the presentation
 * into. Kept as one value with a kind rather than two booleans, because a task is in one of them at
 * a time and the two carry different evidence — the file whose version moved, or the fields the
 * re-read disagreed about.
 */
export type VersionConflict =
  | { kind: "preUpdate"; path: string }
  | { kind: "postWindow"; fields: string[] };

/** One chip: which family it belongs to, its word, and the reason behind it. */
export interface TaskMark {
  kind: MarkKind;
  label: string;
  /** The full reason, for a `title` / `aria-label` — the chip itself stays one word. */
  detail: string;
}

/**
 * The identity of a task for the shell's 版ずれ record. `sourcePath` rather than the TASK-ID: a
 * 解析不能 task has no id (doc-4 §5) and can still be edited into a conflict. Serialized rather
 * than concatenated, so no two (slug, path) pairs can collide into one key.
 */
export function conflictKeyOf(slug: string, sourcePath: string): string {
  return JSON.stringify([slug, sourcePath]);
}

/** 版ずれ as one chip's worth of text (doc-9 §5). Both stages are 版ずれ; the reason differs. */
export function versionConflictMark(conflict: VersionConflict): TaskMark {
  return {
    kind: "versionConflict",
    label: "版ずれ",
    detail:
      conflict.kind === "preUpdate"
        ? `更新前競合: ${conflict.path} が読み取り後に外部で変わったため、CLI を起動せずに保存を止めました（doc-9 §5）`
        : `照合後競合窓の事後通知: 再読込した内容が送信した内容と一致しません（${conflict.fields.join(
            "・",
          )}）。窓内の外部更新が上書きで失われた可能性があります（doc-9 §4.1）`,
  };
}

/** 解析縮退 as one chip (doc-4 §5). The events themselves stay in the detail's 縮退区画. */
export function degradeMark(view: TaskView): TaskMark | null {
  const health = view.task.health;
  if (health.state !== "degraded") return null;
  return {
    kind: "degraded",
    label: "縮退",
    detail: health.events
      .map((event) => {
        switch (event.event) {
          case "unparseable":
            return `解析不能: ${event.missingRequired.join("・")} が読めない`;
          case "unexpectedSchema":
            return `想定外スキーマ: ${event.detail}`;
          case "danglingReference":
            return `参照欠損: ${event.kind} ${event.target}`;
        }
      })
      .join(" / "),
  };
}

/**
 * Every chip one task carries, in `MarkKind` order (decision-6). The single derivation both the
 * card (doc-7 §3) and the detail heading (doc-8 §3) call, so the two screens cannot end up
 * disagreeing about which marks a task has or what each one is called — which is the whole of
 * AC #4's 横断的に適用する.
 *
 * `conflict` is passed in rather than read off the task: a 版ずれ is not a property of the file
 * (it reads perfectly well), it is what the shell observed about a save against it.
 */
export function taskMarks(view: TaskView, conflict: VersionConflict | null): TaskMark[] {
  const marks: TaskMark[] = [];
  const degrade = degradeMark(view);
  if (degrade !== null) marks.push(degrade);
  if (conflict !== null) marks.push(versionConflictMark(conflict));
  return marks;
}

/** 継続検出停止 (doc-9 §3) as the row's own chip — `undetectable`, never 版ずれ (doc-9 §5). */
export const UNWATCHED_MARK: TaskMark = {
  kind: "undetectable",
  label: "継続検出停止",
  detail:
    "ファイル監視または変更通知の購読が動いていないため、外部変更が画面へ届きません。" +
    "表示が実ファイルより古い可能性がありますが、版がずれているとは限りません（doc-9 §3）。" +
    "再読込で現在の内容を読み直せます。",
};
