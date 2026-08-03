/**
 * 列内新規タスク入力 (doc-7 §4.1) as data: whether one レーンセル offers the entry, which value its
 * `-s` would carry, and — when it does not — the reason it is not there. The component
 * (`LaneCell.svelte`) is markup over these values, so every rule below is testable without a mounted
 * grid or a CLI.
 *
 * ## Referent table (doc-7 §4.1 term → identifier here)
 *
 * Fixed before naming, following `swimlane.ts` and `manage.ts`.
 *
 * | doc-7 §4.1 | here | is |
 * |---|---|---|
 * | 列の作成時 status 候補 | `ColumnCreateStatuses.statuses` (`wire.ts`) | the declared raw statuses 列対応規則 sends to one column, in `config.yml` order |
 * | 入口を置く／置かない | [`LaneCreate`] | one cell's entry: offered with its candidates, or absent with its reason |
 * | 渡す値は入力欄で読める | [`laneCreateStatus`] | the candidate the entry shows and will pass, for both the 1 件 and 複数件 cases |
 * | 候補 0 件の列には入口を置かない | [`NO_CANDIDATE_ABSENT_REASON`] | why a column this project declares nothing for has no entry |
 * | title は必須 | `TASK_TITLE_REQUIRED_REASON` (`manage.ts`) | the same requirement the 新規タスク区画 states, in the same words |
 * | 発行するのは同じ task create | [`buildLaneTaskCreate`] over `buildTaskCreate` | one `task create`, built by the 新規タスク区画's own builder |
 *
 * Two rules this module holds to:
 *
 * - **The candidates are the boundary's, never re-derived here.** Reversing 列対応規則 in TypeScript
 *   would let the column a task is *placed* in and the column it can be *created* in drift apart
 *   (`interpret::status::create_status_candidates` is the one definition).
 * - **置かない と 無効化 are different presentations** (doc-11 §5). A column with no candidate gets no
 *   control and a sentence saying why; the 未対応区画 gets no control and no sentence either, since the
 *   four columns having an entry while it has none is on screen already (doc-7 §4.1); a CLI 縮退 gets
 *   the control, disabled, with its reason (`issueAvailability`, doc-5 §5).
 */

import { EMPTY_TASK_CREATE, buildTaskCreate, issueAvailability, type IssuePlan } from "./manage";
import { CANONICAL_COLUMN_LABEL } from "./swimlane";
import type { CliReadiness, ColumnCreateStatuses, StatusColumn } from "./wire";

/**
 * Where 列内新規タスク入力 stands for one レーンセル. `absent` is doc-7 §4.1's 入口を置かない — not a
 * blocked entry: there is no control to disable, so the cell carries the reason on its own.
 */
export type LaneCreate =
  | { state: "offered"; candidates: string[] }
  | { state: "absent"; reason: string };

/**
 * Why a canonical column with no 作成時 status 候補 has no entry (doc-7 §4.1). Names the column, since
 * this is a per-project fact — the same column has candidates in a project that declares one.
 */
export function noCandidateAbsentReason(column: StatusColumn): string {
  return (
    `${CANONICAL_COLUMN_LABEL[column]} 列に対応する status をこのプロジェクトの config.yml が` +
    "宣言していないため、作成時の初期値を決められません。新規タスク入力は置きません（doc-7 §4.1）。"
  );
}

/**
 * Whether this cell's column offers the entry, and with which candidates (doc-7 §4.1).
 *
 * A column the payload has no entry for is read as 候補 0 件: the boundary sends all four
 * (`create_status_candidates`), so this can only be a payload that does not know the column — and
 * offering an entry whose `-s` value is unknown is the one thing doc-7 §4.1 rules out.
 */
export function laneCreate(
  candidates: readonly ColumnCreateStatuses[],
  column: StatusColumn,
): LaneCreate {
  const entry = candidates.find((candidate) => candidate.column === column);
  const statuses = entry?.statuses ?? [];
  return statuses.length === 0
    ? { state: "absent", reason: noCandidateAbsentReason(column) }
    : { state: "offered", candidates: [...statuses] };
}

/**
 * The candidate the entry shows and will pass — doc-7 §4.1's「どの値が渡るかは、候補の数によらず常に
 * 入力欄で読める状態を保つ」.
 *
 * `held` is what the user picked, and it is honoured only while it is still a candidate: `config.yml`
 * can be edited outside Atlas while the entry is open (doc-9 継続検出), and a held value the project
 * no longer declares would be refused by `-s` with exit code 1 (doc-5 §3). Falling back to the first
 * declared candidate — the same default a fresh entry starts on — keeps the shown value and the
 * issued value the same string, which is what makes the input readable as「渡す値」rather than as a
 * guess. `""` only for a cell with no entry, where nothing is passed at all.
 */
export function laneCreateStatus(entry: LaneCreate, held: string): string {
  if (entry.state !== "offered") return "";
  return entry.candidates.includes(held) ? held : entry.candidates[0];
}

/**
 * Why nothing is issued when the status has not resolved to a candidate. Reachable only through a
 * caller that issues from a cell with no entry, and kept for exactly that: an omitted `-s` is not a
 * neutral default but a create that lands in `default_status`'s column (doc-5 §3) — i.e. in a column
 * other than the one clicked, silently.
 */
export const NO_STATUS_TO_PASS_REASON =
  "この列で渡す status が決まっていないため発行しません（doc-7 §4.1）。";

/**
 * Turn one cell's entry into the `task create` doc-7 §4.1 maps it to. The 新規タスク区画's builder does
 * the work (doc-10 §7: 両者が発行するのは同じ `task create`), so the title requirement, the trim and the
 * omit-when-unset rule are stated once — this adds only what is specific to the lane: exactly two
 * values travel, and the status is the column's candidate rather than the canonical column's name.
 */
export function buildLaneTaskCreate(title: string, status: string): IssuePlan {
  if (status === "") return { state: "blocked", reason: NO_STATUS_TO_PASS_REASON };
  return buildTaskCreate({ ...EMPTY_TASK_CREATE, title, status });
}

/**
 * Why no cell may take input at all, or `null` — doc-7 §4.1's「CLI 縮退時は、入口を理由付きで無効化する」.
 *
 * Decided without any cell's input, because it is about the CLI rather than about a form: the *entry*
 * is what doc-7 §4.1 disables, so the closed ＋新規 has to carry the reason too. Blocking only the
 * 作成 inside an opened entry would invite a title to be typed that could never be issued.
 *
 * Run through [`issueAvailability`] with an empty action so doc-5 §5's obstacle order — no CLI first,
 * then an action in flight — is stated in one place and cannot drift from what the 新規タスク区画 says.
 */
export function laneCreateHold(context: {
  readiness: CliReadiness | null;
  busy: boolean;
}): string | null {
  const availability = issueAvailability({ state: "ready", action: [] }, context);
  return availability.state === "blocked" ? availability.reason : null;
}
