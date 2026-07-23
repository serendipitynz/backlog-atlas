// Smoke-test command that proves the frontend<->Rust IPC bridge works end to end.
// It is intentionally trivial and will be replaced by the real ledger/read commands
// in later tasks; keeping it here gives the skeleton something for `cargo test` and
// the UI to exercise.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
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
