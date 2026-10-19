//! タスクリンク (doc-3 §8, decision-49) — one URL naming one task, handed to Atlas by the OS.
//!
//! ## Referent table (doc term → identifier here)
//!
//! | term | here | is |
//! |---|---|---|
//! | doc-3 §8 Atlas の URL スキーム | [`SCHEME`] | the scheme `tauri.conf.json` asks the bundlers to associate |
//! | doc-3 §8 タスクリンク | [`TaskLink`] / [`parse`] | the URL's two values, or nothing when it is not of the form |
//! | doc-3 §8 指すルート | [`TaskLink::root`] | the absolute path matched against a ledger entry's two roots |
//! | doc-3 §8 受け取り待ちのリンク | [`PendingTaskLink`] | the one URL received and not yet taken by the screen |
//! | doc-3 §8 リンクを開けない理由 (the Rust half) | [`TaskLinkResolution`] | how far the URL resolved against the ledger |
//!
//! The task half — finding the id in the project's read — is the screen's: it already holds every
//! root's read, and a second read here would answer from a different moment than the grid draws.

use crate::ledger::Ledger;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Url;

pub const SCHEME: &str = "backlog-atlas";

const ACTION: &str = "task";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskLink {
    pub root: PathBuf,
    pub task_id: String,
}

/// `None` for anything that is not exactly the doc-3 §8 form.
///
/// **Strict on purpose**: an unknown or repeated parameter is refused rather than ignored, so a
/// generator that drifts from the form hears about it on the first click instead of opening
/// something the URL did not mean.
pub fn parse(url: &str) -> Option<TaskLink> {
    let url = Url::parse(url).ok()?;
    if url.scheme() != SCHEME || url.host_str() != Some(ACTION) {
        return None;
    }
    // A browser or shell may normalise `scheme://task?…` to `scheme://task/?…` on the way.
    if !(url.path().is_empty() || url.path() == "/") || url.fragment().is_some() {
        return None;
    }
    let mut root = None;
    let mut task_id = None;
    for (key, value) in url.query_pairs() {
        let slot = match key.as_ref() {
            "root" => &mut root,
            "id" => &mut task_id,
            _ => return None,
        };
        if slot.replace(value.into_owned()).is_some() {
            return None;
        }
    }
    let root = PathBuf::from(root?);
    let task_id = task_id?;
    if !root.is_absolute() || task_id.is_empty() {
        return None;
    }
    Some(TaskLink { root, task_id })
}

/// Only the latest URL is kept: two clicks before the screen is ready mean the second one.
#[derive(Default)]
pub struct PendingTaskLink(Mutex<Option<String>>);

impl PendingTaskLink {
    pub fn put(&self, url: String) {
        *self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(url);
    }

    pub fn take(&self) -> Option<String> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }
}

/// Every variant carries the URL as received, so the screen can name what it was given — the
/// person reading a refusal is often the one who wrote the generator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TaskLinkResolution {
    #[serde(rename_all = "camelCase")]
    Resolved {
        url: String,
        slug: String,
        task_id: String,
    },
    Malformed {
        url: String,
    },
    Unregistered {
        url: String,
        root: PathBuf,
    },
}

pub fn resolve(url: String, ledger: &Ledger) -> TaskLinkResolution {
    let Some(link) = parse(&url) else {
        return TaskLinkResolution::Malformed { url };
    };
    match ledger.slug_for_root(&link.root) {
        Some(slug) => TaskLinkResolution::Resolved {
            url,
            slug,
            task_id: link.task_id,
        },
        None => TaskLinkResolution::Unregistered {
            url,
            root: link.root,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(root: &str, task_id: &str) -> Option<TaskLink> {
        Some(TaskLink {
            root: PathBuf::from(root),
            task_id: task_id.to_string(),
        })
    }

    #[cfg(unix)]
    #[test]
    fn parses_the_documented_form() {
        assert_eq!(
            parse("backlog-atlas://task?root=%2Fhome%2Fme%2Fatlas&id=TASK-206"),
            link("/home/me/atlas", "TASK-206"),
        );
        assert_eq!(
            parse("backlog-atlas://task/?id=DRAFT-3&root=/home/me/atlas"),
            link("/home/me/atlas", "DRAFT-3"),
        );
    }

    #[cfg(unix)]
    #[test]
    fn decodes_both_spellings_of_a_space_and_keeps_a_literal_plus() {
        assert_eq!(
            parse("backlog-atlas://task?root=/a%20b+c%2Bd&id=TASK-1"),
            link("/a b c+d", "TASK-1"),
        );
    }

    #[cfg(windows)]
    #[test]
    fn parses_a_windows_root() {
        assert_eq!(
            parse("backlog-atlas://task?root=C%3A%5CUsers%5Cme%5Catlas&id=TASK-206"),
            link(r"C:\Users\me\atlas", "TASK-206"),
        );
    }

    #[test]
    fn refuses_anything_off_the_form() {
        for url in [
            "",
            "not a url",
            "https://task?root=/a&id=TASK-1",
            "backlog-atlas://open?root=/a&id=TASK-1",
            "backlog-atlas://task/extra?root=/a&id=TASK-1",
            "backlog-atlas://task?root=/a&id=TASK-1#frag",
            "backlog-atlas://task?root=/a",
            "backlog-atlas://task?id=TASK-1",
            "backlog-atlas://task?root=/a&id=",
            "backlog-atlas://task?root=relative/a&id=TASK-1",
            "backlog-atlas://task?root=/a&id=TASK-1&id=TASK-2",
            "backlog-atlas://task?root=/a&id=TASK-1&slug=atlas",
        ] {
            assert_eq!(parse(url), None, "{url}");
        }
    }

    #[test]
    fn pending_keeps_only_the_latest_and_empties_on_take() {
        let pending = PendingTaskLink::default();
        pending.put("first".into());
        pending.put("second".into());
        assert_eq!(pending.take().as_deref(), Some("second"));
        assert_eq!(pending.take(), None);
    }

    /// The scheme the bundlers associate and the one [`parse`] accepts are written in two files that
    /// no compiler compares.
    #[test]
    fn the_configured_scheme_is_the_parsed_one() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(
            config["plugins"]["deep-link"]["desktop"]["schemes"],
            serde_json::json!([SCHEME]),
        );
    }

    /// The bundler's own `.desktop` template writes `Exec=<bin>` with no field code, so a Linux
    /// package associated the scheme and then launched Atlas without the URL (measured on WSL Ubuntu
    /// 24.04 on 2026-10-20, tauri-bundler 2.10.3). The `.deb` and the `.rpm` each name a template, and
    /// a package left on the default would lose the URL again with nothing else to say so.
    #[test]
    fn both_linux_packages_hand_the_url_to_the_binary() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let template = include_str!("../linux/main.desktop");
        assert!(
            template.lines().any(|line| line == "Exec={{exec}} %u"),
            "{template}"
        );
        for package in ["deb", "rpm"] {
            assert_eq!(
                config["bundle"]["linux"][package]["desktopTemplate"], "linux/main.desktop",
                "{package}",
            );
        }
    }
}
