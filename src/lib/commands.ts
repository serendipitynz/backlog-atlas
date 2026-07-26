/**
 * Typed calls into the Tauri command boundary (TASK-33). One function per command the
 * swimlane uses; no screen builds an `invoke` string of its own, so the set of commands the
 * frontend depends on is readable in one place.
 *
 * A rejected `invoke` carries the boundary's `CommandError` value, not an `Error`. That is
 * the whole point of TASK-33's typed failures (doc-6 §6 対象不在 vs 該当なし, doc-7 §6
 * ルート読取不能 vs an empty root), so `asCommandError` keeps the value instead of
 * stringifying it, and only falls back to a synthetic variant for a genuinely unexpected
 * throw (a dropped IPC channel, say).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CliReadiness,
  CommandError,
  LedgerResponse,
  ProjectLoad,
  ProjectSnapshot,
  ReloadEvent,
  TaskHistory,
  UpdateOperation,
  UpdateRequest,
  UpdateResult,
} from "./wire";

/** The event a watch-triggered re-read arrives on (`commands::PROJECT_RELOADED_EVENT`). */
const PROJECT_RELOADED_EVENT = "project-reloaded";

/** True when a rejection value is one of the boundary's typed failures. */
export function isCommandError(value: unknown): value is CommandError {
  return typeof value === "object" && value !== null && "kind" in value;
}

/** A rejection as a `CommandError`, wrapping anything that is not already one. */
export function asCommandError(value: unknown): CommandError {
  if (isCommandError(value)) return value;
  return { kind: "ledger", detail: String(value) };
}

/** The registered projects, in ledger order — the swimlane's default row order (doc-7 §5). */
export function ledgerList(): Promise<LedgerResponse> {
  return invoke<LedgerResponse>("ledger_list");
}

/** Move a row in the ledger's display order (doc-3 §4.3). Refused on a read-only ledger. */
export function ledgerReorder(slug: string, newIndex: number): Promise<LedgerResponse> {
  const request: UpdateRequest = { slug, new_index: newIndex };
  return invoke<LedgerResponse>("ledger_update", { request });
}

/** Open every registered project. A root that cannot be read yields its own unreadable row. */
export function workspaceOpen(): Promise<ProjectLoad[]> {
  return invoke<ProjectLoad[]>("workspace_open");
}

/** Read one root and keep it open — also the retry for a row that failed to read (doc-7 §6). */
export function projectOpen(slug: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>("project_open", { slug });
}

/** Start 継続検出 for one root (doc-9 §3). Idempotent, so it is safe to call after every open. */
export function projectWatchStart(slug: string): Promise<void> {
  return invoke<void>("project_watch_start", { slug });
}

export function projectWatchStop(slug: string): Promise<void> {
  return invoke<void>("project_watch_stop", { slug });
}

/**
 * One task's コミット一覧・Pull Request URL・remote ホスト (doc-6). Read-only, and it does not fail
 * for Git reasons — Git 対象不在 arrives inside `commits` so the PR 区画 survives it (decision-6).
 * The project must be open: the References it extracts PR URLs from come from the read model.
 */
export function taskHistoryRead(slug: string, taskId: string): Promise<TaskHistory> {
  return invoke<TaskHistory>("task_history_read", { slug, taskId });
}

/**
 * Whether a supported `backlog` is on PATH (doc-5 §5 縮退). Read once at startup so the screen can
 * withhold edit controls with a reason instead of offering an action that cannot be issued.
 */
export function cliProbe(): Promise<CliReadiness> {
  return invoke<CliReadiness>("cli_probe");
}

/**
 * Issue one screen action (doc-5 §3, doc-9 §4). The boundary derives each operation's target from
 * its own read model and runs the 更新前競合検出 before launching anything, so a `conflict` result
 * means the CLI never ran — the caller keeps its 未保存入力 and chooses a path (doc-9 §5).
 */
export function updateApply(slug: string, action: UpdateOperation[]): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_apply", { slug, action });
}

/** Subscribe to watch-triggered re-reads. Resolves to the unsubscribe function. */
export function onProjectReloaded(
  handler: (event: ReloadEvent) => void,
): Promise<UnlistenFn> {
  return listen<ReloadEvent>(PROJECT_RELOADED_EVENT, (event) => handler(event.payload));
}
