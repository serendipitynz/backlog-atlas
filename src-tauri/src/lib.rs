// Public: the domain model is the shared read-side vocabulary the read layer (TASK-28) and
// command layer build on. Exposing it as crate API is also what keeps the types from
// tripping dead_code before their consumers land.
pub mod domain;
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
// Public: the Backlog 更新アダプター (TASK-31 / doc-5). The write-side counterpart to the read
// layer — it maps 更新操作 to Backlog CLI invocations, runs them with the project root as the
// working directory, and degrades to read-only when no supported CLI is present. Exposed as crate
// API for the command layer (TASK-33) to call; it wires no Tauri command of its own yet, matching
// how `history` is exposed.
pub mod update;

use ledger::{Ledger, LoadedLedger, ParsedTaskRef, RegisterRequest, UpdateRequest};
use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

/// What every ledger command returns to the frontend: the ledger plus its compatibility
/// state. `read_only` is true when the on-disk `schema_version` is newer than this build
/// understands (AC #1) — the UI must disable edits in that case, so the flag has to travel
/// with the ledger, not be discoverable only after a save fails.
#[derive(Debug, Clone, Serialize)]
struct LedgerResponse {
    ledger: Ledger,
    read_only: bool,
}

impl From<LoadedLedger> for LedgerResponse {
    fn from(loaded: LoadedLedger) -> Self {
        LedgerResponse {
            ledger: loaded.ledger,
            read_only: loaded.read_only,
        }
    }
}

// Smoke-test command that proves the frontend<->Rust IPC bridge works end to end.
// It is intentionally trivial and will be replaced by the real read commands in later
// tasks; keeping it here gives the UI something to exercise.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

/// Resolve the single ledger file under the OS app-config dir (doc-3 §2.1). The ledger is
/// Atlas's own config and never lives inside any project's Backlog root.
fn ledger_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("projects.toml"))
}

/// Load the ledger, apply `op` to it, save, and return the resulting state. The read-only
/// guard in `LoadedLedger::save` (AC #1) keeps an unknown newer file from being clobbered —
/// a mutating command against a read-only ledger therefore fails at save rather than here.
fn mutate_ledger<F>(app: &tauri::AppHandle, op: F) -> Result<LedgerResponse, String>
where
    F: FnOnce(&mut Ledger) -> Result<(), ledger::LedgerError>,
{
    let path = ledger_path(app)?;
    let mut loaded = LoadedLedger::load(&path).map_err(|e| e.to_string())?;
    op(&mut loaded.ledger).map_err(|e| e.to_string())?;
    loaded.save(&path).map_err(|e| e.to_string())?;
    Ok(loaded.into())
}

#[tauri::command]
fn ledger_list(app: tauri::AppHandle) -> Result<LedgerResponse, String> {
    let path = ledger_path(&app)?;
    Ok(LoadedLedger::load(&path).map_err(|e| e.to_string())?.into())
}

#[tauri::command]
fn ledger_register(
    app: tauri::AppHandle,
    request: RegisterRequest,
) -> Result<LedgerResponse, String> {
    mutate_ledger(&app, |l| l.register(&request).map(|_| ()))
}

#[tauri::command]
fn ledger_remove(app: tauri::AppHandle, slug: String) -> Result<LedgerResponse, String> {
    mutate_ledger(&app, |l| l.remove(&slug).map(|_| ()))
}

#[tauri::command]
fn ledger_update(app: tauri::AppHandle, request: UpdateRequest) -> Result<LedgerResponse, String> {
    mutate_ledger(&app, |l| l.update(&request).map(|_| ()))
}

/// Build a cross-task-id `<slug>:<TASK-ID>` for display (doc-3 §5.1). Validates the slug
/// against the live ledger and the id against `task_prefix` so it can only produce ids the
/// parser accepts (AC #7); `task_prefix` is resolved by the caller from the referenced
/// project's config.yml.
#[tauri::command]
fn cross_task_id_generate(
    app: tauri::AppHandle,
    slug: String,
    task_id: String,
    task_prefix: String,
) -> Result<String, String> {
    let path = ledger_path(&app)?;
    let loaded = LoadedLedger::load(&path).map_err(|e| e.to_string())?;
    loaded
        .ledger
        .generate_cross_task_id(&slug, &task_id, &task_prefix)
        .map_err(|e| e.to_string())
}

/// Parse a cross-task-id (doc-3 §5.2). Validates the left slug against the live ledger and
/// the right side against `task_prefix` (which the caller resolves from the referenced
/// project's config.yml); `context_slug` permits a bare id in a single-project context.
#[tauri::command]
fn cross_task_id_parse(
    app: tauri::AppHandle,
    input: String,
    task_prefix: String,
    context_slug: Option<String>,
) -> Result<ParsedTaskRef, String> {
    let path = ledger_path(&app)?;
    let loaded = LoadedLedger::load(&path).map_err(|e| e.to_string())?;
    loaded
        .ledger
        .parse_cross_task_id(&input, &task_prefix, context_slug.as_deref())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            ledger_list,
            ledger_register,
            ledger_remove,
            ledger_update,
            cross_task_id_generate,
            cross_task_id_parse
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_includes_the_name() {
        assert!(greet("Atlas").contains("Atlas"));
    }
}
