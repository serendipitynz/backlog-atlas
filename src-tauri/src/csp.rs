//! Test-only: the policy `tauri.conf.json` ships as `app.security.csp` (decision-28, TASK-98).
//!
//! **Only one line of this policy announces its own loss, and it is the newest.** Deleting any of the
//! others only ever *widens* what the webview may do, and nothing about a widening is observable:
//! drop `object-src 'none'` and it falls back to `default-src`, drop `default-src` and the fetch
//! directives stop being restricted at all — the app looks the same either way. `base-uri` and
//! `form-action` do not even fall back; absent, they are simply unrestricted. The relaxations can be
//! *seen*, and mostly only indirectly: without `'unsafe-inline'` the diagram loses its colours and
//! the promoted editor its layout, and a rejected IPC request falls back to `window.ipc.postMessage`
//! and keeps working while the console alone says so. **`img-src blob:` is the exception** — remove it
//! and every 本文画像 falls to its 状態の印 (doc-8 §9.2), which is a difference a reader sees without
//! opening a console. It is also the only line whose removal *tightens* the policy.
//!
//! So there is no subset of this policy worth testing over the rest — the config's shape *is* the
//! contract, and this module is what makes changing it deliberate. A failure here is not "the
//! string moved"; each line carries what moves it and what its loss costs, so the message points
//! at the half of decision-28 that has to be revisited before the change lands.

use std::collections::{BTreeMap, BTreeSet};
use tauri::utils::config::Csp;

/// What moves a line — decision-28 §2 sorts the policy this way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Moves {
    /// A measurement put the source there; only a re-measurement takes it away.
    Measurement,
    /// Tauri's IPC transport needs it, and it changes when that transport does.
    Transport,
    /// Atlas has no such capability; a feature that adds one widens this line (decision-28 §3).
    Absence,
    /// Atlas itself makes values of this scheme, and the line goes when that feature does
    /// (decision-28 §2 機能の source). Neither a measurement nor the transport put it there — the
    /// feature did — so re-measuring says nothing about whether it may be removed.
    Feature,
}

/// Every directive of the shipped policy, its sources, and what its loss would cost.
const EXPECTED: &[(&str, &[&str], Moves, &str)] = &[
    (
        "default-src",
        &["'self'"],
        Moves::Absence,
        "the fallback every directive below leans on; absent, the ones not spelled out stop restricting anything",
    ),
    (
        "script-src",
        &["'self'"],
        Moves::Absence,
        "the bundle, the vendored ace.js and the lazy mermaid chunks are all same-origin; nothing else may run",
    ),
    (
        "style-src",
        &["'self'", "'unsafe-inline'"],
        Moves::Measurement,
        "mermaid's SVG <style> and Ace's importCssString; without it the diagram is drawn colourless and .ace_editor falls to position: static",
    ),
    (
        "img-src",
        &["blob:"],
        Moves::Feature,
        "the images a management file's body names (doc-8 §9.2), which arrive as bytes over IPC and are drawn from a Blob URL; without it none of them draws and the reader is left with the mark that stands in for one",
    ),
    (
        "connect-src",
        &["ipc:", "http://ipc.localhost"],
        Moves::Transport,
        "ipc://localhost on macOS and Linux, http://ipc.localhost on Windows; blocked, every command still works over the postMessage fallback and only the console says otherwise",
    ),
    (
        "object-src",
        &["'none'"],
        Moves::Absence,
        "Atlas embeds no plugin content",
    ),
    (
        "frame-src",
        &["'none'"],
        Moves::Absence,
        "Atlas has no iframe; mermaid's securityLevel is 'strict', not 'sandbox' (decision-25)",
    ),
    (
        "worker-src",
        &["'none'"],
        Moves::Absence,
        "no Web Worker; Editor.svelte passes setUseWorker(false)",
    ),
    (
        "base-uri",
        &["'none'"],
        Moves::Absence,
        "no <base>, and this one does not fall back to default-src — absent, any base URI is allowed",
    ),
    (
        "form-action",
        &["'none'"],
        Moves::Absence,
        "no form submits anywhere; this one does not fall back either",
    ),
];

/// Directives deliberately left out (decision-28 §2 書かない宣言): `'self'` would only restate what
/// `default-src` already says, and a line that changes nothing hides the ones that do.
///
/// **`img-src` was one of these until 添付画像 landed** (TASK-186). It is in [`EXPECTED`] now, and it
/// is not `'self' blob:` — Atlas ships no image of its own (0 `<img>`, 0 `url(` outside the vendored
/// `ace.js`), so the one source it needs is the one it makes.
const ABSENT: &[&str] = &["font-src"];

fn policy() -> String {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri.conf.json is valid JSON");
    config["app"]["security"]["csp"]
        .as_str()
        .expect("app.security.csp is a string, not null (TASK-98 AC #1)")
        .to_owned()
}

/// The directive → sources map Tauri will serialize into the response header.
///
/// Parsed by Tauri's own `Csp`, not by a parser written here: what reaches the webview is whatever
/// the framework makes of this string, and a second parser could agree with the config while the
/// framework disagreed with both.
fn directives() -> BTreeMap<String, Vec<String>> {
    let map: std::collections::HashMap<String, tauri::utils::config::CspDirectiveSources> =
        Csp::Policy(policy()).into();
    map.into_iter()
        .map(|(directive, sources)| (directive, Vec::<String>::from(sources)))
        .collect()
}

#[test]
fn the_policy_names_exactly_the_directives_the_decision_justifies() {
    let found: BTreeSet<String> = directives().keys().cloned().collect();
    let expected: BTreeSet<String> = EXPECTED
        .iter()
        .map(|(name, ..)| (*name).to_owned())
        .collect();
    assert_eq!(
        found, expected,
        "a directive was added or dropped — decision-28 §2 sorts these by what moves them, so say there which one this is"
    );
}

#[test]
fn each_directive_carries_exactly_the_sources_the_decision_justifies() {
    let found = directives();
    for (name, sources, moves, cost) in EXPECTED {
        let actual = found
            .get(*name)
            .unwrap_or_else(|| panic!("{name} is missing: {cost}"));
        let actual: BTreeSet<&str> = actual.iter().map(String::as_str).collect();
        let expected: BTreeSet<&str> = sources.iter().copied().collect();
        assert_eq!(
            actual, expected,
            "{name} changed ({moves:?}-driven). What this line holds up: {cost}"
        );
    }
}

#[test]
fn the_directives_the_decision_leaves_out_stay_out() {
    let found = directives();
    for name in ABSENT {
        assert!(
            !found.contains_key(*name),
            "{name} was added; if a feature now needs it, decision-28 §3 is where that is recorded — \
             writing it as 'self' alone only restates the default-src fallback"
        );
    }
}

#[test]
fn no_directive_parses_with_an_empty_source() {
    // Tauri splits each directive on a single space, so a double space or a trailing `;` becomes an
    // empty source rather than an error — and an empty token in a source list is ignored by the
    // engine, which is exactly the kind of change nothing else here would catch.
    for (name, sources) in directives() {
        assert!(
            !sources.iter().any(String::is_empty),
            "{name} parsed to {sources:?} — the policy string has a double space or a stray `;`"
        );
        assert!(!sources.is_empty(), "{name} carries no source at all");
    }
}
