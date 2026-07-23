//! Scan-source boundary — the single place that decides *where* the read layer's bytes come
//! from (doc-4 §2 step 2, AC #6).
//!
//! decision-3 fixes the initial scope to the current checkout, and the cost of that limit is
//! meant to be paid once, here: [`ScanSource`] names the operations the read layer needs
//! (config, directory listing, file read) without saying whether they come from a working
//! tree, a `git show <branch>:<path>` reader, or an enumerated worktree. [`WorkingTree`] is
//! the current-checkout implementation and the only one for now; a branch-backed source
//! plugs in as a sibling and neither the domain model nor the display layer learns which is
//! in use. A branch switch then becomes just another reason to re-scan (TASK-32).

use crate::domain::StorageState;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// A directory the read layer scans inside a Backlog root (doc-4 §2). Scanning is enumerated
/// rather than discovered so that the directory a file came from — and therefore its storage
/// state (§3.4) — is known by construction and never inferred from the file itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanDir {
    Tasks,
    Drafts,
    Completed,
    ArchiveTasks,
    ArchiveDrafts,
    /// `archive/` itself. v1.47.1 nests archives under `tasks`/`drafts`/`milestones` and puts
    /// no task file directly here (doc-4 §3.4), but reads must not depend on the generating
    /// version (§4), so a flat `archive/*.md` written by some other version is still picked
    /// up — as a task with an indeterminate storage state (§3.4 last bullet).
    ArchiveRoot,
    Milestones,
    Docs,
    Decisions,
}

impl ScanDir {
    /// Every scanned directory. `ArchiveTasks`/`ArchiveDrafts` come before `ArchiveRoot` only
    /// for readability; listings do not overlap because `ArchiveRoot` takes files, not dirs.
    pub const ALL: [ScanDir; 9] = [
        ScanDir::Tasks,
        ScanDir::Drafts,
        ScanDir::Completed,
        ScanDir::ArchiveTasks,
        ScanDir::ArchiveDrafts,
        ScanDir::ArchiveRoot,
        ScanDir::Milestones,
        ScanDir::Docs,
        ScanDir::Decisions,
    ];

    /// Path relative to the Backlog root.
    pub fn rel_path(self) -> &'static str {
        match self {
            ScanDir::Tasks => "tasks",
            ScanDir::Drafts => "drafts",
            ScanDir::Completed => "completed",
            ScanDir::ArchiveTasks => "archive/tasks",
            ScanDir::ArchiveDrafts => "archive/drafts",
            ScanDir::ArchiveRoot => "archive",
            ScanDir::Milestones => "milestones",
            ScanDir::Docs => "docs",
            ScanDir::Decisions => "decisions",
        }
    }

    /// True when files here are read as tasks. `milestones`/`docs`/`decisions` are not tasks
    /// (doc-4 §3.4 last bullet).
    pub fn holds_tasks(self) -> bool {
        !matches!(
            self,
            ScanDir::Milestones | ScanDir::Docs | ScanDir::Decisions
        )
    }

    /// Storage state for a task found here (doc-4 §3.4). `None` on `ArchiveRoot` means
    /// *indeterminate*, not "unknown so assume active" — the file is outside the five
    /// recognized locations, so the read layer keeps it degraded rather than letting it into
    /// the active-only default swimlane (doc-7).
    pub fn storage_state(self) -> Option<StorageState> {
        match self {
            ScanDir::Tasks => Some(StorageState::Active),
            ScanDir::Drafts => Some(StorageState::Draft),
            ScanDir::Completed => Some(StorageState::Completed),
            ScanDir::ArchiveTasks | ScanDir::ArchiveDrafts => Some(StorageState::Archive),
            _ => None,
        }
    }
}

/// The read layer's view of a Backlog root's bytes. Implementors decide which revision of the
/// files the layer sees; the layer itself never touches the filesystem or Git (AC #6).
pub trait ScanSource {
    /// Contents of `config.yml`. Failure here is 根本的: it is the resolution basepoint, so the
    /// caller turns an error into ルート読取不能 rather than a per-task degradation (doc-4 §5).
    fn read_config(&self) -> io::Result<String>;

    /// Markdown files directly in `dir`, in a stable order. [`io::ErrorKind::NotFound`] means
    /// the directory is absent, which the caller distinguishes from "present but empty":
    /// a missing `tasks/` is ルート読取不能, a missing `drafts/` is ordinary.
    fn list(&self, dir: ScanDir) -> io::Result<Vec<PathBuf>>;

    /// Contents of a path previously returned by [`ScanSource::list`].
    fn read(&self, path: &Path) -> io::Result<String>;
}

/// The current checkout's working tree — the only scan source in the initial version
/// (decision-3). Paths handed out are absolute, so a task's `source_path` stays usable for
/// naming the offending file in 縮退表示 and, later, for opening it.
#[derive(Debug, Clone)]
pub struct WorkingTree {
    backlog_root: PathBuf,
}

impl WorkingTree {
    pub fn new(backlog_root: impl Into<PathBuf>) -> Self {
        WorkingTree {
            backlog_root: backlog_root.into(),
        }
    }
}

impl ScanSource for WorkingTree {
    fn read_config(&self) -> io::Result<String> {
        fs::read_to_string(self.backlog_root.join("config.yml"))
    }

    fn list(&self, dir: ScanDir) -> io::Result<Vec<PathBuf>> {
        let mut paths = Vec::new();
        for entry in fs::read_dir(self.backlog_root.join(dir.rel_path()))? {
            let entry = entry?;
            // Directory entries are skipped rather than recursed: archive/ is walked through
            // its declared nesting (ArchiveTasks/ArchiveDrafts), not flattened (doc-4 §3.4).
            if !entry.file_type()?.is_file() {
                continue;
            }
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                paths.push(path);
            }
        }
        // read_dir order is filesystem-dependent; sorting keeps the model reproducible so
        // tests and the UI see a stable task order.
        paths.sort();
        Ok(paths)
    }

    fn read(&self, path: &Path) -> io::Result<String> {
        fs::read_to_string(path)
    }
}
