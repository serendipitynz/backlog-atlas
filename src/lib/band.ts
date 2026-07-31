/**
 * 上部帯 (doc-11 §4, doc-7 §5.3) as one derivation: which bands stand, in which order, and which of
 * them may be closed. The shell used to decide all three by where each band's markup happened to sit,
 * which is exactly what doc-11 §4 rules out — 出現順にすると、帯が積まれるほど回答待ちの ① が通知 ⑤ の
 * 下へ押し出される.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `mark.ts` / `project-detail.ts`.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-11 §4 上部帯 | [`TopBand`] | one line under the filter bar, announcing a state of the whole screen |
 * | doc-11 §4 の 6 種 | [`BandKind`] | the closed set — 6 種以外に上部帯を作らない |
 * | doc-11 §4 重要度の固定順 ①〜⑥ | [`BAND_ORDER`] | the order they stack in, as data rather than as markup order |
 * | doc-11 §4 ⑤ だけが × で閉じられる | [`TopBand.closable`] | whether the band offers a close control |
 * | doc-11 §4 縮約 | the texts below | the one-line form; the full reason stays where the operation is |
 * | doc-10 §3 台帳読取専用帯 | [`LEDGER_READ_ONLY_BAND`] | the ledger file degraded to read-only (doc-3 §2.2) |
 * | doc-10 §3 CLI 縮退帯 | [`cliDegradedBand`] | no supported CLI, so nothing can be issued (doc-5 §5) |
 *
 * ## Why the texts here are shorter than the reasons elsewhere
 *
 * doc-11 §4 keeps every band to one line and forbids wrapping: 「フィルタ帯 1 行 ＋ 上部帯 6 本」で
 * 頭打ち という性質が、折り返しを許すと崩れる. So each band carries a 縮約 and the full reason stays
 * at the operation it is about — `readinessReason` beside every withheld operation for ②,
 * `OVERVIEW_READ_ONLY_NOTE` in the 概要区画 for ③, `UNWATCHED_MARK.detail` on the row's mark for ④,
 * and the 戻す chips themselves for ⑥. §4 asks for this duplication rather than a band that can only
 * be read by hovering.
 */

import { DISCARD_CONFIRM_QUESTION } from "./edit";
import type { CliReadiness } from "./wire";

/** The 6 種 doc-11 §4 allows, named after the doc's rows. Nothing else becomes a 上部帯. */
export type BandKind =
  | "confirm"
  | "cliDegraded"
  | "ledgerReadOnly"
  | "unwatched"
  | "notice"
  | "hiddenRows";

/**
 * 重要度の固定順 ①〜⑥ (doc-11 §4): 回答待ち → 発行できない → 表示が古いかもしれない → 済んだことの
 * 報告 → 自分で隠したもの. Held as data so the stack cannot pick up the order of the markup that
 * happens to draw it.
 */
export const BAND_ORDER: readonly BandKind[] = [
  "confirm",
  "cliDegraded",
  "ledgerReadOnly",
  "unwatched",
  "notice",
  "hiddenRows",
] as const;

/** One band as the screen draws it. The controls it carries are the caller's, the order is not. */
export interface TopBand {
  kind: BandKind;
  /** The one line, already 縮約 (doc-11 §4). */
  text: string;
  /**
   * Whether the band offers a × (doc-11 §4). 通知 alone: ①〜④ describe a state that is still true
   * after a click, so a close control would let the user keep working past a 回答待ち or an
   * 発行できない state by dismissing the only thing that says so. ⑥ ends by 戻す, not by dismissal.
   */
  closable: boolean;
}

/** What the shell knows that decides which bands stand. */
export interface BandInputs {
  /** A 破棄前確認 is waiting for an answer (doc-8 §6.3). */
  confirming: boolean;
  /** The CLI probe's answer, or `null` while it has not answered (doc-5 §5). */
  readiness: CliReadiness | null;
  /** The ledger file degraded to read-only (doc-3 §2.2). */
  ledgerReadOnly: boolean;
  /** Why 継続検出 is stopped (doc-9 §3), or `null` when every row is watched. */
  unwatchedReason: string | null;
  /** An action's own report, or `null`. */
  notice: string | null;
  /** How many rows the user has hidden (doc-7 §5.1). */
  hiddenRowCount: number;
}

/**
 * 台帳読取専用 (doc-3 §2.2), 縮約. Names what still works, because doc-10 §3 requires the two 縮退 帯
 * to be told apart: side by side they would otherwise read as one general failure.
 */
export const LEDGER_READ_ONLY_BAND =
  "台帳が読み取り専用です。台帳エントリの更新・登録解除・行の並べ替えはできません" +
  "（文書・マイルストーン・新規タスクの発行は影響を受けません）。";

/**
 * The CLI state in as few words as the band has room for. Deliberately not `readinessReason`'s
 * sentence: that one is the 無効化理由 shown beside a withheld operation, where it has a line of its
 * own, and appending this band's scope to it would put two clauses on a line that must not wrap.
 * The three states stay apart for the reason `readinessReason` keeps them apart — 確認中 and
 * 検出できない lead the user to different acts.
 */
function cliDegradedSummary(readiness: CliReadiness | null): string | null {
  if (readiness === null) return "backlog CLI を確認中です";
  switch (readiness.state) {
    case "ready":
      return null;
    case "unavailable":
      return "PATH 上に backlog CLI が見つかりません";
    case "unsupported":
      return `backlog CLI ${readiness.version} は動作確認範囲外です（必要: ${readiness.minimum} 以上）`;
  }
}

/** CLI 縮退 (doc-5 §5), 縮約. `null` means issuing is possible, so no band stands. */
export function cliDegradedBand(readiness: CliReadiness | null): string | null {
  const summary = cliDegradedSummary(readiness);
  if (summary === null) return null;
  return `${summary}。作成・更新は発行できません（台帳エントリの更新は影響を受けません）。`;
}

/**
 * 継続検出停止 (doc-9 §3), 縮約 — the reason and what it costs. The 再読込 itself stays *in* the band
 * (doc-11 §4: 帯が持つ操作は縮約しても帯に残し、操作へ到達するために別の場所を開かせない), so the
 * text does not send the user to a row's mark to resolve the state — a row that may be scrolled out
 * of view. The per-row mark keeps `UNWATCHED_MARK.detail`, which is the rest of the explanation.
 */
export function unwatchedBand(reason: string): string {
  return `${reason}（表示が実ファイルより古い可能性があります）。`;
}

/**
 * 行非表示 (doc-7 §5.1), 縮約 to a count. The 戻す controls stay in the band beside it (doc-11 §4:
 * 帯が持つ操作は縮約しても帯に残す), so nothing has to be opened to undo a hide.
 */
export function hiddenRowsBand(count: number): string {
  return `非表示の行 ${count} 件`;
}

/**
 * The bands that stand, in doc-11 §4's fixed order. Every kind is answered here — the record is keyed
 * by `BandKind`, so a seventh band cannot be added without the compiler asking what it says, which is
 * the closed set §4 requires (この 6 種以外に上部帯を作らない).
 */
export function topBands(inputs: BandInputs): TopBand[] {
  const texts: Record<BandKind, string | null> = {
    confirm: inputs.confirming ? DISCARD_CONFIRM_QUESTION : null,
    cliDegraded: cliDegradedBand(inputs.readiness),
    ledgerReadOnly: inputs.ledgerReadOnly ? LEDGER_READ_ONLY_BAND : null,
    unwatched: inputs.unwatchedReason === null ? null : unwatchedBand(inputs.unwatchedReason),
    notice: inputs.notice,
    hiddenRows: inputs.hiddenRowCount > 0 ? hiddenRowsBand(inputs.hiddenRowCount) : null,
  };
  return BAND_ORDER.flatMap((kind) => {
    const text = texts[kind];
    return text === null ? [] : [{ kind, text, closable: kind === "notice" }];
  });
}
