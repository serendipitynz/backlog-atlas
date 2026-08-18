//! 窓の航行ゲート (decision-37): the one place a 航行の試み is admitted or refused.
//!
//! **This exists because the window has no way back.** Atlas keeps no 戻る控え of its own, so a window
//! that has left the app is a window a user has to recover with the engine's own affordances — and on
//! 2026-08-18 those turned out not to be uniform: a dropped `.png` left a context menu with no back
//! item at all (⌘← still worked), while a dropped URL and a dropped `.md` left one that had it.
//! doc-8 §9.3 closed the 本文リンク half by never writing an `href`; this closes the half that survives
//! a 本文 carrying no links.
//!
//! **The route was measured before it was closed.** With a probe at this same gate that refused
//! nothing, six operations on macOS produced three 航行の試み: a URL dragged in from a browser, a
//! `.png` dragged in from Finder, and a `.md` dragged in from Finder. The two gestures that stay
//! inside the webview — dragging a 添付画像, dragging a task card onto something that is not a
//! 受け先 — and dragging selected text produced **no line at all**, which is a stronger statement than
//! the screen not changing: the attempt was never made, rather than made and cancelled.
//!
//! **What made the route reachable is TASK-81's `dragDropEnabled: false`** (decision-34). wry only
//! takes the drop away from the engine when a handler is installed, and tauri installs one only when
//! that flag is set; with it cleared, each engine's default drop handling runs, and all three of them
//! treat a dropped URL or file as something to load. So the app was closed by accident until then,
//! and the accident is not one to restore — decision-34 records what the flag is load-bearing for.
//!
//! **The gate learns the app's own origin rather than naming it.** The first navigation a window ever
//! performs is the app loading itself: nothing can be dropped on a window that does not exist yet. So
//! the first URL through here *is* the origin, and spelling it instead would mean writing
//! `tauri://localhost`, `http://tauri.localhost` and the dev server's address in a fourth place and
//! keeping them in step with `tauri.conf.json` and two platform conventions.
//!
//! **Origin, not URL.** A reload and a dev-server URL carrying a query are the same document; only
//! scheme, host and port decide whether a navigation is Atlas's own. [`Url::origin`] is not what
//! compares them — for `tauri://localhost` it yields an opaque origin, and two opaque origins are
//! never equal, so the app's own reload would be refused.

use std::sync::OnceLock;

use tauri::Url;

/// The origin Atlas itself was loaded from, and the gate that admits navigations to it.
///
/// Learned from the first navigation rather than given: see this module's comment.
#[derive(Default)]
pub struct WindowOrigin {
    app: OnceLock<Url>,
}

impl WindowOrigin {
    /// Whether this 航行の試み may proceed. The first call always admits, and is what fixes the origin
    /// every later call is compared against.
    pub fn admit(&self, url: &Url) -> bool {
        same_origin(self.app.get_or_init(|| url.clone()), url)
    }
}

fn same_origin(app: &Url, candidate: &Url) -> bool {
    app.scheme() == candidate.scheme()
        && app.host_str() == candidate.host_str()
        && app.port_or_known_default() == candidate.port_or_known_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).expect("test URL parses")
    }

    #[test]
    fn the_first_navigation_is_admitted_and_becomes_the_origin() {
        let gate = WindowOrigin::default();

        assert!(gate.admit(&url("tauri://localhost/")));
        assert!(gate.admit(&url("tauri://localhost/index.html")));
    }

    #[test]
    fn a_reload_carrying_a_query_or_fragment_is_the_same_document() {
        let gate = WindowOrigin::default();
        gate.admit(&url("http://localhost:1420/"));

        assert!(gate.admit(&url("http://localhost:1420/?reload=1#top")));
    }

    #[test]
    fn a_url_dragged_in_from_a_browser_is_refused() {
        let gate = WindowOrigin::default();
        gate.admit(&url("tauri://localhost/"));

        assert!(!gate.admit(&url("https://github.com/serendipitynz/backlog-atlas")));
    }

    #[test]
    fn a_file_dragged_in_from_the_file_manager_is_refused() {
        let gate = WindowOrigin::default();
        gate.admit(&url("tauri://localhost/"));

        assert!(!gate.admit(&url("file:///Users/someone/a.png")));
        assert!(!gate.admit(&url("file:///Users/someone/a.md")));
    }

    /// The scheme is the only thing separating these two, and deliberately so: `http` vs `https` on
    /// the same host would be caught by the port comparison alone (80 against 443), which leaves the
    /// scheme unheld. Both of these are `tauri`'s own custom protocols on the same host, and neither
    /// carries a port, so nothing else can decide it.
    #[test]
    fn another_scheme_on_the_same_host_is_refused() {
        let gate = WindowOrigin::default();
        gate.admit(&url("tauri://localhost/"));

        assert!(!gate.admit(&url("asset://localhost/anything")));
    }

    /// Windows loads the app over `http` on a host of its own rather than over the `tauri` scheme,
    /// so the origin the gate learns there is this one.
    #[test]
    fn the_windows_origin_admits_itself_and_refuses_the_web() {
        let gate = WindowOrigin::default();
        gate.admit(&url("http://tauri.localhost/"));

        assert!(gate.admit(&url("http://tauri.localhost/index.html")));
        assert!(!gate.admit(&url("https://tauri.localhost/")));
    }

    /// Scheme and port alone do not identify the app: the dev server's address differs from another
    /// host's only in the host, and that is the comparison a URL dragged in over plain `http` tests.
    #[test]
    fn another_host_under_the_same_scheme_and_port_is_refused() {
        let gate = WindowOrigin::default();
        gate.admit(&url("http://localhost:1420/"));

        assert!(!gate.admit(&url("http://example.test:1420/")));
    }

    #[test]
    fn another_port_on_the_same_host_is_refused() {
        let gate = WindowOrigin::default();
        gate.admit(&url("http://localhost:1420/"));

        assert!(!gate.admit(&url("http://localhost:8080/")));
    }
}
