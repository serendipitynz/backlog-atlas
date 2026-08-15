/**
 * 列間ドロップ (doc-7 §4.2) as data: which レーンセル takes a card, which status the drop would pass,
 * and when the passing has to be asked about first. The components are markup over these values, so
 * every rule below is testable without a mounted grid, a pointer device or a CLI.
 *
 * ## Referent table (doc-7 §4.2 term → identifier here)
 *
 * Fixed before naming, following `lane-create.ts` and `swimlane.ts`.
 *
 * | doc-7 §4.2 | here | is |
 * |---|---|---|
 * | 列間ドロップ | [`laneDrop`] | what one drop resolves to: issue, ask, or nothing |
 * | 受け先 | [`laneDropTarget`] | whether one cell takes the card being dragged |
 * | 渡る status | `LaneDrop.status` / `LaneDrop.candidates` | the one raw status `-s` carries |
 * | 候補選択の問い | `{ state: "ask" }` | the layer a 2-candidate 受け先 raises |
 * | つまめないカード | [`laneDragHold`] | why no card may be picked up at all |
 * | 行またぎのドロップ | `{ state: "ignored" }` via the slug comparison | the drop that is not an operation |
 * | 発行中のカード | [`DragSource`] held by the shell while the CLI runs | the card whose issue has not returned |
 *
 * Two rules this module holds to:
 *
 * - **The candidates are 列の作成時 status 候補, never re-derived here.** `columnCandidates` is the one
 *   lookup (doc-7 §4.2: the set is read by both operations), and the set itself is the boundary's.
 * - **A refused drop is not a 無効化** (doc-11 §5). Nothing here produces a disabled control: a cell
 *   that is not a 受け先 simply does not take the card. The one sentence on screen belongs to the
 *   候補 0 件 column and is already there for the 入口 (`lane-create.ts`), which is why this module
 *   returns no reason string for any refusal.
 */

import { columnCandidates } from "./lane-create";
import { issueAvailability } from "./manage";
import type { CliReadiness, ColumnCreateStatuses, StatusColumn, UpdateOperation } from "./wire";

/**
 * The card being dragged, as the whole reference it was picked up from. 行またぎのドロップ and a drop
 * back into the card's own column are both decided by comparing this against the cell under the
 * pointer, so it carries the row and the column rather than the task alone.
 *
 * `column` is `null` for a card in the 未分類区画: it sits in no 正準ステータス列, which makes every
 * canonical column a real move for it rather than a no-op.
 */
export interface DragSource {
  slug: string;
  taskId: string;
  sourcePath: string;
  column: StatusColumn | null;
}

/** What one 列間ドロップ resolves to (doc-7 §4.2). */
export type LaneDrop =
  /** 候補が 1 件の受け先 — the value is determined, so nothing is asked. */
  | { state: "issue"; status: string }
  /** 候補が 2 件以上の受け先 — 候補選択の問い, because a drop has no 入力欄 to read the value from. */
  | { state: "ask"; candidates: string[] }
  /** Not a 受け先: another row, the card's own column, 候補 0 件, or the 未分類列. */
  | { state: "ignored" };

/**
 * Whether one cell is a 受け先 for the card being dragged (doc-7 §4.2).
 *
 * The four refusals are one state on purpose. doc-7 §4.2 gives them different reasons but the same
 * presentation — the cell does not take the card — and only one of them puts a sentence on screen
 * (候補 0 件, already written by the 入口). Splitting them here would invite a caller to draw three
 * more, which is the 無効化 doc-11 §5 keeps separate from 提供しない.
 */
export function laneDropTarget(
  source: DragSource | null,
  slug: string,
  column: StatusColumn,
  candidates: readonly ColumnCreateStatuses[],
): boolean {
  if (source === null || source.slug !== slug || source.column === column) {
    return false;
  }
  return columnCandidates(candidates, column).length > 0;
}

/**
 * Resolve one drop onto a cell (doc-7 §4.2).
 *
 * Re-checks 受け先 rather than trusting the caller: the drop arrives from an event whose target the
 * shell did not choose, and a card released over a cell that stopped being a 受け先 mid-drag (the
 * project's `config.yml` can change under a 継続検出 re-read) must not issue a `-s` the project no
 * longer declares — which the CLI would refuse with exit code 1 anyway (doc-5 §3).
 */
export function laneDrop(
  source: DragSource | null,
  slug: string,
  column: StatusColumn,
  candidates: readonly ColumnCreateStatuses[],
): LaneDrop {
  if (!laneDropTarget(source, slug, column, candidates)) {
    return { state: "ignored" };
  }
  const statuses = columnCandidates(candidates, column);
  return statuses.length === 1
    ? { state: "issue", status: statuses[0] }
    : { state: "ask", candidates: statuses };
}

/**
 * The candidates a 候補選択の問い puts on screen for one drop (doc-7 §4.2).
 *
 * **An `issue` contributes its one status rather than nothing.** A column that falls to exactly one
 * candidate while the layer stands is still a valid 受け先 — [`laneDrop`] answers `issue` for it —
 * and returning `[]` there would leave the screen stating no candidate and showing an empty control
 * while [`laneDropStatus`] still passed that status: a value issued that the screen never showed,
 * which is what doc-7 §4.1's 渡す値は常に読める forbids. Only `ignored` is empty, and a caller
 * refuses the answer in that case.
 *
 * Held here rather than in the component so this stays one fact with [`laneDropStatus`]: what is
 * shown and what is passed are the same list read twice.
 */
export function laneDropOptions(drop: LaneDrop | null): string[] {
  if (drop === null || drop.state === "ignored") {
    return [];
  }
  return drop.state === "ask" ? [...drop.candidates] : [drop.status];
}

/**
 * The candidate a 候補選択の問い will pass, honouring the held choice only while it is still a
 * candidate — the same rule `laneCreateStatus` follows, and for the same reason: `config.yml` can be
 * edited outside Atlas while the layer is open (doc-9 継続検出), and a value the project no longer
 * declares would be refused by `-s` (doc-5 §3). `""` when there is nothing to pass.
 */
export function laneDropStatus(drop: LaneDrop, held: string): string {
  if (drop.state === "issue") {
    return drop.status;
  }
  if (drop.state !== "ask") {
    return "";
  }
  return drop.candidates.includes(held) ? held : drop.candidates[0];
}

/**
 * The 更新操作 one 列間ドロップ issues — doc-5 §3's タスク status 変更 row, unchanged. Built here rather
 * than at the call site so that the drop cannot grow a second field: doc-7 §4.2 maps the whole
 * operation to `task edit -s`, and an edit carrying anything else would be a different row of the
 * 操作写像 wearing this one's name.
 */
export function buildLaneStatusEdit(taskId: string, status: string): UpdateOperation[] {
  return [{ op: "taskEdit", taskId, edit: { status } }];
}

/**
 * Why no card may be picked up, or `null` — doc-7 §4.2's つまめないカード.
 *
 * Decided without any card, because it is about the CLI rather than about one task. Run through
 * [`issueAvailability`] with an empty action so doc-5 §5's obstacle order — no CLI first, then an
 * action in flight — is stated in one place and cannot drift from what the 入口 says.
 *
 * **The caller does not draw this string beside a card** (doc-7 §4.2): the reason is 画面全体に効く
 * and doc-11 §5 already puts it on the 上部帯. It is returned rather than a bare boolean so a caller
 * that does need to say why — a keyboard route, a future 発行中 notice — reads the same words.
 */
export function laneDragHold(context: {
  readiness: CliReadiness | null;
  busy: boolean;
}): string | null {
  const availability = issueAvailability({ state: "ready", action: [] }, context);
  return availability.state === "blocked" ? availability.reason : null;
}
