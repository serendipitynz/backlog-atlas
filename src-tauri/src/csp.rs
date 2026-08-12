//! Test-only: the three parts of `tauri.conf.json`'s `app.security.csp` whose loss is **silent**
//! (decision-28, TASK-98).
//!
//! Everything else in that policy announces itself when it breaks — a blocked script leaves an empty
//! window. These three do not:
//!
//! - **The policy itself.** Back at `null` the app looks identical; nothing is enforced.
//! - **`connect-src ipc: http://ipc.localhost`.** Tauri's IPC posts through
//!   `fetch(convertFileSrc(cmd, 'ipc'))`, and on a CSP rejection its own script falls back to
//!   `window.ipc.postMessage` (`tauri/scripts/ipc-protocol.js`). Every command keeps working; the
//!   only trace is a console warning nobody sees in a shipped build.
//! - **`'unsafe-inline'` in `style-src`.** mermaid puts a `<style>` inside the SVG it draws and Ace
//!   injects its own CSS with `importCssString`; blocked, the diagram loses its colours and the
//!   editor keeps its text but not its layout (measured 2026-08-13: `.ace_editor` falls from
//!   `relative` to `static`). Nothing throws.
//!
//! The value itself is not asserted here. A test that spells the whole policy is a copy of the
//! config, and the config is already its own record — what is worth locking is the part a later
//! change can drop without seeing anything go wrong.

use serde_json::Value;

/// `app.security.csp` as the shipped config carries it.
fn policy() -> String {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri.conf.json is valid JSON");
    config["app"]["security"]["csp"]
        .as_str()
        .expect("app.security.csp is a string, not null (TASK-98 AC #1)")
        .to_owned()
}

/// The sources of one directive, or `None` when the policy does not name it.
fn directive(policy: &str, name: &str) -> Option<Vec<String>> {
    policy.split(';').map(str::trim).find_map(|part| {
        let rest = part.strip_prefix(name)?;
        // Guard against `script-src` matching `script-src-elem`: the name has to end the token.
        let sources = rest.strip_prefix(' ')?;
        Some(sources.split_whitespace().map(str::to_owned).collect())
    })
}

#[test]
fn the_policy_is_set_at_all() {
    assert!(!policy().is_empty());
}

#[test]
fn the_ipc_endpoint_stays_reachable() {
    let sources = directive(&policy(), "connect-src").expect("connect-src is named");
    // `ipc:` is macOS and Linux (`ipc://localhost/<cmd>`), the host form is Windows
    // (`http://ipc.localhost/<cmd>`) — `tauri/scripts/core.js` picks by OS, so both are needed.
    assert!(sources.contains(&"ipc:".to_owned()), "{sources:?}");
    assert!(
        sources.contains(&"http://ipc.localhost".to_owned()),
        "{sources:?}"
    );
}

#[test]
fn drawn_diagrams_and_the_promoted_editor_keep_their_styles() {
    let sources = directive(&policy(), "style-src").expect("style-src is named");
    assert!(
        sources.contains(&"'unsafe-inline'".to_owned()),
        "{sources:?}"
    );
}

#[test]
fn a_directive_name_is_not_matched_by_its_prefix() {
    let policy = "script-src-elem 'self'; connect-src ipc:";
    assert_eq!(directive(policy, "script-src"), None);
    assert_eq!(
        directive(policy, "connect-src"),
        Some(vec!["ipc:".to_owned()])
    );
}
