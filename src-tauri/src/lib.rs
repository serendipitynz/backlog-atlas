// Test-only: the parts of `tauri.conf.json`'s CSP that break silently (decision-28). Not a layer —
// it holds no logic, only the assertions that a later tightening of that one config line cannot
// pass while the app quietly loses its IPC transport or its drawn styles.
#[cfg(test)]
mod csp;
// Public: the Tauri command boundary (TASK-33) — the one module that knows Tauri exists. Every
// layer below is a plain Rust API; this is what makes them callable from the frontend, and where
// the read path (file analysis) and the update path (Backlog CLI) are kept apart at the seam
// decision-2 draws.
pub mod commands;
// Public: the domain model is the shared read-side vocabulary the read layer (TASK-28) and
// command layer build on. Exposing it as crate API is also what keeps the types from
// tripping dead_code before their consumers land.
pub mod domain;
// Public: the 外部エディタ経路 (TASK-37 / doc-8 §7). Neither a read nor a CLI update — it starts the
// user's editor on a management file and writes nothing itself, so it sits beside `update` as its own
// layer rather than inside it: the write that follows is the user's, and it arrives through `sync`.
pub mod editor;
// Public: the Git・Pull Request 履歴参照系 (TASK-30 / doc-6). A read-only, ledger-aware sibling
// of the read layer: given a task id and its owning ledger entry it finds commits, extracts PR
// URLs, and (remote permitting) relates them. Exposed as crate API for the command layer to call.
pub mod history;
// Public: 列対応規則 and Type 導出 (TASK-29) are the read side's interpretation half — the
// command layer computes them next to the model it returns, and the swimlane's column
// placement is defined by them.
pub mod interpret;
mod ledger;
// Public alongside the domain model: the read layer is the other half of the read-side API the
// command layer will call, and its scan-source boundary (decision-3) is meant to be
// implementable from outside this module.
pub mod read;
// Public: アプリ設定 (TASK-46 / decision-13). The ledger's sibling under the app-config dir — the
// ledger defines what Atlas reads, this holds how it is shown — kept a separate file so the ledger's
// read-only degrade cannot also freeze the display defaults.
pub mod settings;
// Public: how Atlas's own two files reach the disk — 一時ファイル置換 (decision-17). Not a layer of
// its own but the one write path `ledger` and `settings` share, so neither can be made durable
// without the other. Public because `settings::save_with` names its boundary in a public signature.
pub mod store;
// Public: 期限付きの子プロセス実行 (decision-18, decision-19). Not a layer either — the one place
// that launches an external program and waits for it, shared by the Backlog CLI (`update`) and the
// `gh` 照会 (`history`) so that the bound on the wait, and the two cleanups that could each hand
// that wait straight back, exist once rather than once per caller.
pub mod subprocess;
// Public: same-root freshness — file watch, read-version index, pre-update conflict detection, and
// the shared reload path (TASK-32 / doc-9). The read/update layers' freshness counterpart: it keeps
// the domain model in step with a Backlog root other processes may also write, detecting external
// change optimistically (best-effort, no cross-CLI lock). Driven by the command layer, which owns
// the sessions that pair a model with its read-version index.
pub mod sync;
// Public: the Backlog 更新アダプター (TASK-31 / doc-5). The write-side counterpart to the read
// layer — it maps 更新操作 to Backlog CLI invocations, runs them with the project root as the
// working directory, and degrades to read-only when no supported CLI is present. Called by the
// command layer through `sync`, which wraps every launch in the doc-9 §4 pre-update check.
pub mod update;
// Test-only: the recorded wire payloads `src/lib/wire.ts` mirrors. Not a layer — it holds no logic,
// only the samples whose serialized form is committed under `wire-fixtures/` for the frontend test to
// read back (TASK-91).
#[cfg(test)]
mod wire_fixtures;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The OS folder picker for 台帳への登録 (doc-3 §4.1). Only the dialog is the plugin's: the
        // chosen path comes back as a string and is registered through the ledger commands, so the
        // ledger stays the only thing Atlas writes (doc-3 §2.1).
        .plugin(tauri_plugin_dialog::init())
        // The command boundary's own state: the open roots and their running file watches. Managed
        // here because a Tauri command reaches it through `State`, and it must outlive any one call.
        .manage(commands::AtlasState::default())
        .invoke_handler(tauri::generate_handler![
            // Ledger and cross-task-id (doc-3).
            commands::ledger_list,
            commands::ledger_location,
            commands::ledger_default_slug,
            commands::ledger_register,
            commands::ledger_remove,
            commands::ledger_update,
            commands::git_remote_read,
            commands::cross_task_id_generate,
            commands::cross_task_id_parse,
            // Read path: file analysis only, no CLI (decision-2).
            commands::workspace_open,
            commands::project_open,
            commands::project_close,
            commands::project_watch_start,
            commands::project_watch_stop,
            commands::task_history_read,
            commands::task_history_cancel,
            // アプリ設定 (decision-13): display defaults, in Atlas's own config dir.
            commands::settings_read,
            commands::settings_save,
            commands::settings_location,
            commands::settings_directory_present,
            commands::settings_location_open,
            // 外部エディタ経路 (doc-8 §7): neither path — Atlas starts an editor and writes nothing.
            commands::editor_probe,
            commands::task_file_open,
            // 本文リンク (doc-8 §9.3): the same association launcher, with a URL from a 本文.
            commands::body_link_open,
            // Update path: guarded by the pre-update version check and a probed CLI capability.
            commands::cli_probe,
            commands::update_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
