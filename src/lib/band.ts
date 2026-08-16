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
 * | doc-11 §4 の帯の種別 | [`BandKind`] | the closed set — 本表に挙げた種以外に上部帯を作らない |
 * | doc-11 §4 重要度の固定順 | [`BAND_ORDER`] | the order they stack in, as data rather than as markup order |
 * | doc-11 §4 ⑤ だけが × で閉じられる | [`TopBand.closable`] | whether the band offers a close control |
 * | doc-11 §4 縮約 | the texts below | the one-line form; the full reason stays where the operation is |
 * | doc-10 §3 台帳読取専用帯 | [`ledgerReadOnlyBand`] | the ledger file degraded to read-only (doc-3 §2.2) |
 * | doc-10 §3 CLI 縮退帯 | [`cliDegradedBand`] | no supported CLI, so nothing can be issued (doc-5 §5) |
 *
 * ## Why the texts here are shorter than the reasons elsewhere
 *
 * doc-11 §4 keeps every band to one line and forbids wrapping: フィルタ帯 1 行 ＋ 本表の帯 で頭打ち
 * という性質が、折り返しを許すと崩れる. So each band carries a 縮約 and the full reason stays at the
 * operation it is about — `readinessReason` beside every withheld operation for ②,
 * `overviewReadOnlyNote()` in the 概要区画 for ③, and `unwatchedMark().detail` on the row's mark
 * for ④. §4 asks for this duplication rather than a band that can only be read by hovering.
 */

import { discardConfirmQuestion } from "./edit";
import { msg } from "./messages";
import type { CliReadiness } from "./wire";

/**
 * The kinds doc-11 §4 allows, named after the doc's rows. Nothing else becomes a 上部帯.
 *
 * 行非表示 was ⑥ until TASK-131 moved the whole operation into the menu's プロジェクト一覧: the band
 * announced a state the user had put the screen in themselves, and the count it carried is already said
 * by 総件数's プロジェクト数 ratio (doc-7 §2.1).
 */
export type BandKind =
  | "confirm"
  | "cliDegraded"
  | "ledgerReadOnly"
  | "unwatched"
  | "notice";

/**
 * 重要度の固定順 (doc-11 §4): 回答待ち → 発行できない → 表示が古いかもしれない → 済んだことの報告.
 * Held as data so the stack cannot pick up the order of the markup that happens to draw it.
 */
export const BAND_ORDER: readonly BandKind[] = [
  "confirm",
  "cliDegraded",
  "ledgerReadOnly",
  "unwatched",
  "notice",
] as const;

/** One band as the screen draws it. The controls it carries are the caller's, the order is not. */
export interface TopBand {
  kind: BandKind;
  /** The one line, already 縮約 (doc-11 §4). */
  text: string;
  /**
   * Whether the band offers a × (doc-11 §4). 通知 alone: ①〜④ describe a state that is still true
   * after a click, so a close control would let the user keep working past a 回答待ち or an
   * 発行できない state by dismissing the only thing that says so.
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
  /**
   * What ⑤ carries, or `null` (doc-11 §4, narrowed by TASK-134): an issue that did not go through, one
   * that was withheld, or a 帰結 the screen does not state itself. Never the bare fact that an issue
   * landed — the screen is already in that shape, and 発行の結果 belongs beside the control that issued
   * it (控えの隣の結果文) wherever that control is still up.
   */
  notice: string | null;
}

/**
 * 台帳読取専用 (doc-3 §2.2), 縮約. Names what still works, because doc-10 §3 requires the two 縮退 帯
 * to be told apart: side by side they would otherwise read as one general failure.
 *
 * The parenthetical names the three 区画 and not 「…の発行」 because this sentence sat on doc-11 §4's
 * one-line bound exactly (70) before TASK-158, and the screen word for the ledger file is four
 * characters longer than 台帳 was. 影響を受けません is what was kept in the trade: `cliDegradedBand`
 * hedges with the same verb, and both bands can stand at once — so neither may say the other's
 * operations *can* be issued.
 */
export function ledgerReadOnlyBand(): string {
  return msg().shell.ledgerReadOnlyBand;
}

/**
 * The CLI state in as few words as the band has room for. Deliberately not `readinessReason`'s
 * sentence: that one is the 無効化理由 shown beside a withheld operation, where it has a line of its
 * own, and appending this band's scope to it would put two clauses on a line that must not wrap.
 * The three states stay apart for the reason `readinessReason` keeps them apart — 確認中 and
 * 検出できない lead the user to different acts.
 */
function cliDegradedSummary(readiness: CliReadiness | null): string | null {
  const text = msg().shell;
  if (readiness === null) {
    return text.cliChecking;
  }
  switch (readiness.state) {
    case "ready":
      return null;
    // Not「PATH 上に見つかりません」: since decision-16 the resolution is アプリ設定 → npm の
    // サブパッケージ → PATH, so naming PATH alone would state a reason that is not the one that held.
    case "unavailable":
      return text.cliUnavailable;
    case "unsupported":
      return text.cliUnsupported(readiness.version, readiness.minimum);
  }
}

/** CLI 縮退 (doc-5 §5), 縮約. `null` means issuing is possible, so no band stands. */
export function cliDegradedBand(readiness: CliReadiness | null): string | null {
  const summary = cliDegradedSummary(readiness);
  if (summary === null) {
    return null;
  }
  return msg().shell.cliDegradedBand(summary);
}

/**
 * 継続検出停止 (doc-9 §3), 縮約 — the reason and what it costs. The 再読込 itself stays *in* the band
 * (doc-11 §4: 帯が持つ操作は縮約しても帯に残し、操作へ到達するために別の場所を開かせない), so the
 * text does not send the user to a row's mark to resolve the state — a row that may be scrolled out
 * of view. The per-row mark keeps `unwatchedMark().detail`, which is the rest of the explanation.
 */
export function unwatchedBand(reason: string): string {
  return msg().shell.unwatchedBand(reason);
}

/**
 * The bands that stand, in doc-11 §4's fixed order. Every kind is answered here — the record is keyed
 * by `BandKind`, so a further band cannot be added without the compiler asking what it says, which is
 * the closed set §4 requires (本表に挙げた種以外に上部帯を作らない).
 */
export function topBands(inputs: BandInputs): TopBand[] {
  const texts: Record<BandKind, string | null> = {
    confirm: inputs.confirming ? discardConfirmQuestion() : null,
    cliDegraded: cliDegradedBand(inputs.readiness),
    ledgerReadOnly: inputs.ledgerReadOnly ? ledgerReadOnlyBand() : null,
    unwatched: inputs.unwatchedReason === null ? null : unwatchedBand(inputs.unwatchedReason),
    notice: inputs.notice,
  };
  return BAND_ORDER.flatMap((kind) => {
    const text = texts[kind];
    return text === null ? [] : [{ kind, text, closable: kind === "notice" }];
  });
}
