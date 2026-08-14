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
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  CliReadiness,
  CommandError,
  EditorLaunch,
  ExternalProgramReport,
  EditorReadiness,
  GitRemoteRead,
  LaunchMethod,
  LedgerResponse,
  LoadedSettings,
  ProjectLoad,
  ProjectSnapshot,
  RegisterRequest,
  RegisterResponse,
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
  if (isCommandError(value)) {
    return value;
  }
  return { kind: "ledger", detail: String(value) };
}

/**
 * The OS folder picker for a project root or a Backlog root (doc-3 §4.1 step 1). Not one of the
 * boundary's own commands — it is the dialog plugin — but it is IPC all the same, so it sits with
 * them rather than inside a component. Resolves to `null` when the user cancels.
 *
 * Nothing is read or written through it: the answer is a path *string*, which then travels to the
 * ledger commands. Atlas still writes only the ledger file (doc-3 §2.1).
 */
export async function pickDirectory(title: string): Promise<string | null> {
  const picked = await openFileDialog({ directory: true, multiple: false, title });
  // Narrowed rather than trusted: the plugin's signature admits a list, and only one directory was
  // asked for.
  return typeof picked === "string" ? picked : null;
}

/** The registered projects, in ledger order — the swimlane's default row order (doc-7 §5). */
export function ledgerList(): Promise<LedgerResponse> {
  return invoke<LedgerResponse>("ledger_list");
}

/**
 * Where the ledger file is (doc-3 §2.1). Shown by the 設定モーダル's ファイルの場所 区画 — the one place
 * that says where Atlas's own files live — so the user can hand-edit it, which doc-3 §2.2 keeps
 * supported.
 */
export function ledgerLocation(): Promise<string> {
  return invoke<string>("ledger_location");
}

/**
 * The slug a project root would get by default (doc-3 §3.1), or `null` when its directory name
 * yields none. Asked of the boundary rather than derived here: one implementation of the rule, and
 * it is the one that actually registers. Uniqueness is not part of the answer — `ledgerRegister` is
 * the authority on that.
 */
export function ledgerDefaultSlug(projectRoot: string): Promise<string | null> {
  return invoke<string | null>("ledger_default_slug", { projectRoot });
}

/**
 * Register a project (doc-3 §4.1). Writes only the ledger file: the target project's Backlog root,
 * management files and Git repository are untouched (doc-3 §2.1/§4). A refusal — root not readable,
 * slug collision or invalid slug — arrives as a typed `ledgerRefused` the form recovers from.
 */
export function ledgerRegister(request: RegisterRequest): Promise<RegisterResponse> {
  return invoke<RegisterResponse>("ledger_register", { request });
}

/**
 * Remove one entry (doc-3 §4.2). Ledger-only: Atlas stops reading the project, and its tasks stay
 * where they are. The boundary also closes the open session and its watch, so the caller re-syncs
 * its rows from the returned ledger.
 */
export function ledgerRemove(slug: string): Promise<LedgerResponse> {
  return invoke<LedgerResponse>("ledger_remove", { slug });
}

/**
 * Update one entry (doc-3 §4.3): `backlog_root`, a same-project move (both roots), a `git_remote`
 * re-detection, the status 別名表, or the display order. `slug` only selects the entry — it is
 * immutable, and the request has no way to change it.
 *
 * A move closes the project's open session on the Rust side, because the model and the read-version
 * index it was paired with belong to the old roots; the caller reopens the project afterwards.
 */
export function ledgerUpdate(request: UpdateRequest): Promise<LedgerResponse> {
  return invoke<LedgerResponse>("ledger_update", { request });
}

/**
 * The entry's remote 現在値 (doc-10 §4.1): what Git reports for its project root right now. Reads
 * nothing of the ledger but the root, and writes nothing — the recorded Git remote 有無属性 moves
 * only through {@link ledgerUpdate} with `redetect_git_remote`.
 */
export function gitRemoteRead(slug: string): Promise<GitRemoteRead> {
  return invoke<GitRemoteRead>("git_remote_read", { slug });
}

/** Move a row in the ledger's display order (doc-3 §4.3). Refused on a read-only ledger. */
export function ledgerReorder(slug: string, newIndex: number): Promise<LedgerResponse> {
  return ledgerUpdate({ slug, new_index: newIndex });
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
 *
 * `readId` is the 読取識別子 (decision-19): the caller's own name for this call, which
 * `taskHistoryCancel` names to stop it. Rejects with a `historyCancelled` error when it is
 * cancelled — there is no answer then, and the caller that cancelled has stopped waiting for one.
 */
export function taskHistoryRead(
  slug: string,
  taskId: string,
  readId: string,
): Promise<TaskHistory> {
  return invoke<TaskHistory>("task_history_read", { slug, taskId, readId });
}

/**
 * 履歴読取の取消 (decision-19): stop the read `readId` names and end the `gh` 照会 it has in flight.
 * Never rejects and never reports whether anything was running — a read that finished on its own
 * between the screen deciding and this arriving is not a failure of either side.
 */
export function taskHistoryCancel(readId: string): Promise<void> {
  return invoke<void>("task_history_cancel", { readId });
}

/**
 * アプリ設定 と、それが既定値かどうか (decision-13). Never rejects for a missing, unreadable or too-new
 * file: those arrive as the defaults plus a `status`, because decision-13 forbids stopping the screen
 * over settings it could not read.
 */
export function settingsRead(): Promise<LoadedSettings> {
  return invoke<LoadedSettings>("settings_read");
}

/**
 * Persist アプリ設定 (decision-13). Rejects with a `settings` error when the file on disk is a newer
 * schema version than this build understands — it is left untouched rather than overwritten.
 */
export function settingsSave(settings: AppSettings): Promise<LoadedSettings> {
  return invoke<LoadedSettings>("settings_save", { settings });
}

/** Where the settings file is (decision-13), for the 設定画面 to name — it is hand-editable. */
export function settingsLocation(): Promise<string> {
  return invoke<string>("settings_location");
}

/**
 * Whether the アプリ設定ディレクトリ is there yet (doc-3 §2.1) — what withholds 場所を開く, since that
 * control opens the folder and not either file. Asked separately from `settingsLocation` because the
 * answers have different lifetimes: a path is resolved once and cannot change while the app runs,
 * while this turns true the first time either file is saved.
 */
export function settingsDirectoryPresent(): Promise<boolean> {
  return invoke<boolean>("settings_directory_present");
}

/**
 * Open the アプリ設定ディレクトリ in the OS's file manager (TASK-75). The directory the settings file is
 * in, not the file: opening a `.toml` by association starts a text editor, which is not what 場所を開く
 * asks for. 台帳ファイル is in the same directory (decision-13), so this one call is its 場所を開く too.
 */
export function settingsLocationOpen(): Promise<EditorLaunch> {
  return invoke<EditorLaunch>("settings_location_open");
}

/**
 * Whether a supported `backlog` can be run (doc-5 §5 縮退) — the 縮退帯's own question, and the reason
 * edit controls are withheld with a stated cause rather than offered and refused.
 *
 * Read at startup **and after every settings save**: `backlog_cli` is the first step of the same
 * resolution (doc-5 §4 順序 1, decision-29), so a save can turn 発行不能 into 発行できる and back. Not
 * once per run — that was true only while the setting had no control on any screen.
 *
 * Not the same question as `externalProgramsProbe`, whose `backlog` row says whether the program
 * started; this says whether its version meets `MIN_VERSION` (decision-7).
 */
export function cliProbe(): Promise<CliReadiness> {
  return invoke<CliReadiness>("cli_probe");
}

/**
 * 解決結果の表示 (decision-29): which executable each 外部コマンド would launch, and whether it
 * starts. All three — `backlog`, `git`, `gh`.
 *
 * Read when the 設定画面 opens rather than at startup: it spawns three processes to fill one panel —
 * one `--version` per command, each bounded at 5 s — and every other screen gets on without the
 * answer. Re-read after a save, so the panel
 * reports the 外部コマンド指定 just written rather than the one it replaced.
 *
 * Not the same question as `cliProbe`, which asks whether `backlog`'s *version* meets the minimum
 * (decision-7). Both are re-read after a save; neither is derived from the other.
 */
export function externalProgramsProbe(): Promise<ExternalProgramReport[]> {
  return invoke<ExternalProgramReport[]>("external_programs_probe");
}

/**
 * Which 外部エディタ経路 launch methods this environment has (doc-8 §7). Read at startup so the panel
 * can name the editor it would start and withhold the method it cannot offer.
 */
export function editorProbe(): Promise<EditorReadiness> {
  return invoke<EditorReadiness>("editor_probe");
}

/**
 * Open one task's management file in the user's editor (doc-8 §7). Atlas starts a process and writes
 * nothing; the editor's save arrives through the ordinary file watch, so there is nothing to await
 * beyond the launch. `sourcePath` must be one the boundary's own read produced — it is checked against
 * the open model, and anything else is refused with `unknownTaskFile`.
 */
export function taskFileOpen(
  slug: string,
  sourcePath: string,
  method: LaunchMethod,
): Promise<EditorLaunch> {
  return invoke<EditorLaunch>("task_file_open", { slug, sourcePath, method });
}

/**
 * Open one 本文リンク with whatever the OS registered for its scheme (doc-8 §9.3 既定ブラウザ起動).
 *
 * The URL is the only value this frontend hands to a launch — every other one echoes a path the
 * boundary itself produced — so the boundary checks the scheme rather than trusting the classification
 * the screen already made (doc-8 §9.3). Nothing comes back on success: the browser coming forward is
 * the result, and doc-11 §4 keeps that off the 上部帯.
 */
export function bodyLinkOpen(url: string): Promise<void> {
  return invoke<void>("body_link_open", { url });
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
