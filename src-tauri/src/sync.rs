//! Same-root freshness — keeps Atlas's domain model in step with a Backlog root's files while
//! another window, another process, or a bare `backlog` may be writing the same root (doc-9,
//! implements TASK-14's design). Atlas holds no cross-CLI lock; it reads the version it last saw
//! and checks, just before an update, that the file still matches — optimistic, best-effort
//! detection (doc-9 §4/§4.1).
//!
//! ## Referent table (doc-9 term → identifier here)
//!
//! Fixed before naming, per the read/update modules' convention of mapping each doc term to one
//! English identifier rather than inventing parallel vocabulary.
//!
//! | doc-9 term | here | is |
//! |---|---|---|
//! | 読取版指標 | [`VersionStamp`] / [`VersionIndex`] | the version (mtime, size, content hash) of a file at the moment it was last read |
//! | 外部変更 | — | any write to the root outside this Atlas's own update; observed, never assumed |
//! | 更新前競合 | [`ConflictCheck::Conflict`] | recorded stamp ≠ current file, checked *before* an update launches |
//! | 再読込契機 | [`ReloadReason`] + [`SyncState::reload`] | the one path every re-read funnels through (update success, external change, future branch switch — AC #6) |
//! | 再構築単位 | root (whole-root read via [`ScanSource`]) | doc-4's reconstruction unit; file-level is a forward refinement on the same method |
//! | ファイル監視 | [`WatchSession`] | the read-only OS-notification subscription (doc-9 §3) |
//! | デバウンス | [`Debouncer`] | coalescing a burst of notifications into one batch (AC #1) |
//! | 照合後競合窓 / best-effort | module docs below | the window a lock-free design cannot close (doc-9 §4.1) |
//!
//! ## What is and is not guaranteed (doc-9 §4.1, AC #5)
//!
//! The pre-update check ([`SyncState::check_conflict`]) is the **preventable** tier: any external
//! change that lands up to the moment of the check is caught, and the update is withheld rather than
//! overwriting it. It is *not* atomic with the CLI write — v1.47.1 offers no expected-version update
//! and no shared lock (doc-9 §4.1), so a change slipping in during the 照合後競合窓 (between the
//! check and the CLI's write) to the *same* file can still be overwritten. That loss is the
//! best-effort limit doc-9 fixes as the guarantee level; it is documented, not silently closed. This
//! module never writes managed files (the watch is read-only), so it cannot itself cause such loss —
//! only the CLI's read-modify-write can, and only inside that window.

use crate::domain::ProjectModel;
use crate::read::read_project;
use crate::read::scan::{ScanDir, ScanSource};
use crate::update::{
    self, BacklogCli, CliCapability, RejectReason, UpdateOperation, UpdateOutcome,
};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, BTreeSet};
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

// --- read-version index (doc-9 §4, AC #2) -------------------------------------------------------

/// 読取版指標 — the version of one file at the moment the read layer last read it (doc-9 §4).
///
/// `mtime` + `size` are the primary signal, matching doc-9 §4's "mtime・サイズ一次". `hash` is the
/// confirmation for the case that signal cannot settle on its own — an unchanged mtime with changed
/// content (coarse mtime granularity) or an mtime that moved backwards (§4). The index records it
/// eagerly (a Backlog file is a small Markdown file, so hashing it is cheap) so the pre-update check
/// can *confirm* identity when mtime disagrees, rather than being forced to treat every mtime change
/// as a conflict.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionStamp {
    /// Filesystem modification time, when the platform reports one.
    pub mtime: Option<SystemTime>,
    pub size: u64,
    /// Content hash. `None` on a stamp taken cheaply (metadata only, no read); the index stores a
    /// `Some` hash so [`SyncState::check_conflict`] can escalate to a content comparison (§4).
    pub hash: Option<u64>,
}

/// The recorded version of every managed file the model was built from (doc-9 §4). Keyed by the
/// path the [`ScanSource`] handed out, so a conflict check keys off a task's `source_path` directly.
pub type VersionIndex = BTreeMap<PathBuf, VersionStamp>;

/// Reads a file's version signals. The one place the freshness layer touches the filesystem, kept
/// behind a trait so the index / conflict / reload logic is unit-testable without real files — the
/// same seam the read layer draws with [`ScanSource`] and the update layer with `BacklogCli`.
pub trait FileVersions {
    /// Cheap stamp: mtime + size from metadata, no content read (`hash` is left `None`).
    /// [`io::ErrorKind::NotFound`] means the file is gone — a diverged version, not an I/O fault.
    fn stamp(&self, path: &Path) -> io::Result<VersionStamp>;

    /// Content hash, reading the file. Used only when the cheap stamp cannot decide (§4 必要時ハッシュ).
    fn hash(&self, path: &Path) -> io::Result<u64>;
}

/// [`FileVersions`] over the real filesystem — the counterpart of `WorkingTree` on the read side.
#[derive(Debug, Clone, Copy, Default)]
pub struct FsVersions;

impl FileVersions for FsVersions {
    fn stamp(&self, path: &Path) -> io::Result<VersionStamp> {
        let meta = std::fs::metadata(path)?;
        Ok(VersionStamp {
            // modified() is unsupported on a few platforms; a None mtime just forces the hash path
            // in a conflict check rather than failing it.
            mtime: meta.modified().ok(),
            size: meta.len(),
            hash: None,
        })
    }

    fn hash(&self, path: &Path) -> io::Result<u64> {
        Ok(hash_bytes(&std::fs::read(path)?))
    }
}

/// Hash file bytes for change detection. `DefaultHasher` (SipHash) is not stable across Rust
/// releases, which is fine: a stamp is only ever compared against another stamp taken in the same
/// process run, never persisted, so cross-version stability is not required — only that identical
/// bytes hash identically within one run.
fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

/// Stamp every managed file the read layer would scan, recording a hashed stamp for each (AC #2).
/// Best-effort by design: a file that vanishes or fails to stat between listing and stamping is
/// skipped, not fatal — the read layer ([`read_project`]) is the authority on whether the root is
/// readable, and this index is only an observation of versions layered on top of a successful read.
fn build_index(source: &dyn ScanSource, probe: &dyn FileVersions) -> VersionIndex {
    let mut index = VersionIndex::new();
    for dir in ScanDir::ALL {
        let Ok(paths) = source.list(dir) else {
            continue;
        };
        for path in paths {
            let Ok(mut stamp) = probe.stamp(&path) else {
                continue;
            };
            match probe.hash(&path) {
                Ok(hash) => stamp.hash = Some(hash),
                Err(_) => continue,
            }
            index.insert(path, stamp);
        }
    }
    index
}

// --- conflict detection (doc-9 §4, AC #3) -------------------------------------------------------

/// The pre-update verdict for one file (doc-9 §4). Binary because the update decision is binary: an
/// [`InSync`](ConflictCheck::InSync) file may be updated, a [`Conflict`](ConflictCheck::Conflict)
/// file must not be (the CLI is not launched — doc-9 §4.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictCheck {
    /// The recorded version still matches the file on disk; the screen and the file agree.
    InSync,
    /// The file changed since it was read (external change), or has no recorded baseline, or is
    /// gone. The update is withheld and the caller re-reads before retrying (doc-9 §5).
    Conflict,
}

/// Whether a file still holds the version we recorded (doc-9 §4). Size is the cheap reject — a
/// differing size is a change outright, no read needed. A *matching* size is only provisionally
/// "same" and is confirmed by content hash before returning [`InSync`](ConflictCheck::InSync),
/// because equal size with equal-or-coarse mtime can still hide a same-length edit (§4 時刻粒度の粗さ /
/// mtime 巻き戻し). mtime is recorded as the primary signal but is deliberately *not* trusted to
/// declare in-sync at this gate: a false "unchanged" here would let the CLI overwrite an external
/// change, so the safe direction is to confirm by content and accept a harmless false conflict
/// (which only prompts a reload) rather than risk a silent overwrite.
fn same_version(
    recorded: &VersionStamp,
    current: &VersionStamp,
    path: &Path,
    probe: &dyn FileVersions,
) -> io::Result<bool> {
    if recorded.size != current.size {
        return Ok(false);
    }
    // Size matches — confirm by content (§4 必要時ハッシュ). The index always carries a hash; if it
    // somehow does not, we cannot prove sameness and treat the file as changed, erring toward
    // withholding the update rather than overwriting it.
    let Some(recorded_hash) = recorded.hash else {
        return Ok(false);
    };
    Ok(recorded_hash == probe.hash(path)?)
}

// --- reload trigger (doc-9 §3/§4, doc-5 §6, AC #4/#6) -------------------------------------------

/// Why a re-read is happening (doc-9 §3). Every reason funnels through the one [`SyncState::reload`]
/// method, which is the structural point of AC #6: a new trigger — a branch switch (decision-3), a
/// manual refresh — is added as a variant here and reuses the same reconstruction path, not a
/// parallel one. CLI-driven and externally-driven changes are already the same reload (doc-5 §6).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReloadReason {
    /// After a Backlog CLI update succeeded, its result is read back into the model (doc-5 §6).
    UpdateApplied,
    /// A partial multi-invocation update failed midway; on-disk state moved, so the root is re-read
    /// to reflect what actually landed (doc-5 §6 部分適用).
    PartialUpdateFailed,
    /// The file watch reported an external change to the root (doc-9 §3 継続検出).
    ExternalChange,
}

/// The result of a guarded update (doc-9 §4). The pre-update check, the CLI run, and the reload are
/// one unit ([`SyncState::guarded_update`]) so "on conflict, the CLI is not launched" (AC #3) is a
/// structural guarantee, not an ordering a caller has to get right.
#[derive(Debug)]
pub enum GuardedUpdate {
    /// A target diverged from its recorded version, so the CLI was never launched (AC #3). `model`
    /// is the reload that surfaces the external change (doc-9 §5 — a normal re-read, not 縮退), and
    /// `path` names the file that diverged.
    Conflict { path: PathBuf, model: ProjectModel },
    /// The action was launched. `outcome` is the adapter's verdict (doc-5 §5). `model` is `Some`
    /// exactly when on-disk state moved and was reloaded — a success, or a partial (mid-sequence)
    /// failure; it is `None` for a failure that changed nothing (doc-5 §5/§6).
    Ran {
        outcome: UpdateOutcome,
        model: Option<ProjectModel>,
    },
}

/// A guarded update that could not reach a verdict (doc-9 §4). Distinct from a [`GuardedUpdate`]:
/// these are failures of the guard itself, not of the update.
#[derive(Debug)]
pub enum GuardError {
    /// The update adapter refused the action before launch — out of the confirmed CLI's capability,
    /// or nothing to change (doc-5 §5). Nothing ran and nothing changed.
    Rejected(RejectReason),
    /// A reload (after a conflict, a success, or a partial failure) could not read the root
    /// (doc-4 §5 ルート読取不能).
    Reload(crate::read::RootError),
    /// A target's version could not be read for a reason other than "gone" (which is itself a
    /// conflict) — e.g. a permission fault. Not a version verdict, so it is surfaced rather than
    /// silently treated as either outcome.
    Probe(io::Error),
}

/// Tracks one Backlog root's recorded versions and drives every re-read of it (doc-9 §4). Holds the
/// read-version index; the domain model itself is returned to and owned by the caller, so the model
/// and its index refresh together on every reload.
#[derive(Debug, Clone)]
pub struct SyncState {
    slug: String,
    index: VersionIndex,
}

impl SyncState {
    /// First read of a root: build the model and record its version index (AC #2). The model is
    /// returned for the caller to own and display; the [`SyncState`] retains only the index.
    pub fn initialize(
        slug: &str,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<(ProjectModel, SyncState), crate::read::RootError> {
        let model = read_project(slug, source)?;
        let index = build_index(source, probe);
        Ok((
            model,
            SyncState {
                slug: slug.to_string(),
                index,
            },
        ))
    }

    /// Re-read the whole root and refresh both the model and the recorded index (AC #4). This is the
    /// single reconstruction path all triggers share (AC #6): the `reason` records who asked, and the
    /// `source` is a parameter so a future branch switch reloads through here with a different source
    /// rather than a separate code path. The reconstruction unit is the root (decision-3 reads the
    /// whole current checkout); a file-level unit would refine this method, not replace it.
    pub fn reload(
        &mut self,
        reason: ReloadReason,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<ProjectModel, crate::read::RootError> {
        // reason is retained in the signature so every call site names its trigger; behaviour is
        // one shared re-read today, and per-reason handling (should it arise) branches here.
        let _ = reason;
        let model = read_project(&self.slug, source)?;
        self.index = build_index(source, probe);
        Ok(model)
    }

    /// The recorded version of a file, if it was read into this state's index.
    pub fn recorded(&self, path: &Path) -> Option<&VersionStamp> {
        self.index.get(path)
    }

    /// Pre-update conflict check for one target file (doc-9 §4, AC #3). Called just before an update
    /// launches; a [`ConflictCheck::Conflict`] means the CLI must not run (doc-9 §4.1). A file with
    /// no recorded baseline is a conflict — we cannot vouch that the screen matches a file we never
    /// read — and a file that has been deleted externally ([`io::ErrorKind::NotFound`]) is a conflict
    /// too. Any other I/O error is returned, since it is not a version verdict.
    pub fn check_conflict(
        &self,
        path: &Path,
        probe: &dyn FileVersions,
    ) -> io::Result<ConflictCheck> {
        let Some(recorded) = self.index.get(path) else {
            return Ok(ConflictCheck::Conflict);
        };
        let current = match probe.stamp(path) {
            Ok(current) => current,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(ConflictCheck::Conflict),
            Err(e) => return Err(e),
        };
        if same_version(recorded, &current, path, probe)? {
            Ok(ConflictCheck::InSync)
        } else {
            Ok(ConflictCheck::Conflict)
        }
    }

    /// Run an update under the doc-9 §4 sequence as one unit: check every target's version, launch
    /// the CLI only if all are in sync, then reload. `targets` are the existing files the action will
    /// modify, resolved by the caller from the model it owns (an operation names a task/doc/milestone,
    /// not a path); a create names no existing target and passes none.
    ///
    /// - **Conflict (AC #3)**: if any target diverged, the CLI is *not* launched. The root is
    ///   reloaded to show the external change (doc-9 §5) and [`GuardedUpdate::Conflict`] is returned.
    /// - **Ran**: with every target in sync the action runs (doc-5). On success, and on a partial
    ///   failure (on-disk state moved mid-sequence), the model is reloaded so the returned model
    ///   reflects what actually landed (doc-5 §6, AC #4); a failure that changed nothing reloads
    ///   nothing.
    ///
    /// The `_capability` requirement is inherited from [`update::run`]: an update is unreachable
    /// without a supported CLI, so read-only degradation stays structural (doc-5 AC #6).
    #[allow(clippy::too_many_arguments)]
    pub fn guarded_update(
        &mut self,
        targets: &[PathBuf],
        project_root: &Path,
        action: &[UpdateOperation],
        capability: &CliCapability,
        cli: &dyn BacklogCli,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<GuardedUpdate, GuardError> {
        // Pre-update check (AC #3): a single diverged target withholds the whole launch, matching
        // the update adapter's own all-or-nothing planning (doc-5 §5).
        for path in targets {
            if self
                .check_conflict(path, probe)
                .map_err(GuardError::Probe)?
                == ConflictCheck::Conflict
            {
                let model = self
                    .reload(ReloadReason::ExternalChange, source, probe)
                    .map_err(GuardError::Reload)?;
                return Ok(GuardedUpdate::Conflict {
                    path: path.clone(),
                    model,
                });
            }
        }

        // Every target still matches what we read: run the action (doc-9 §4 step 2).
        let outcome =
            update::run(project_root, action, capability, cli).map_err(GuardError::Rejected)?;
        let model = match &outcome {
            UpdateOutcome::Succeeded => Some(
                self.reload(ReloadReason::UpdateApplied, source, probe)
                    .map_err(GuardError::Reload)?,
            ),
            // A partial (mid-sequence) failure already moved on-disk state, so a reload is mandatory
            // to reflect what landed (doc-5 §6); a non-partial failure changed nothing, so skip it.
            UpdateOutcome::Failed(failure) if failure.partial => Some(
                self.reload(ReloadReason::PartialUpdateFailed, source, probe)
                    .map_err(GuardError::Reload)?,
            ),
            UpdateOutcome::Failed(_) => None,
        };
        Ok(GuardedUpdate::Ran { outcome, model })
    }
}

// --- debounce (doc-9 §3, AC #1) -----------------------------------------------------------------

/// Coalesces a burst of change notifications into one batch (doc-9 §3 デバウンス). A single Backlog
/// operation rewrites several files, and the OS delivers those notifications separately and
/// repeatedly; batching within a quiet window turns one operation's flurry into one reconstruction
/// (AC #1). The type is pure — time is passed in, never read from a clock — so the batching rule is
/// unit-testable; the concrete watcher drives it with a real clock.
///
/// The window is a *quiet* window: each recorded change resets the deadline, so the batch is emitted
/// only after changes stop for the window's length, keeping a long write burst in one batch.
#[derive(Debug)]
pub struct Debouncer<T = std::time::Instant> {
    window: Duration,
    pending: BTreeSet<PathBuf>,
    deadline: Option<T>,
}

impl<T> Debouncer<T>
where
    T: Copy + Ord + std::ops::Add<Duration, Output = T>,
{
    pub fn new(window: Duration) -> Self {
        Debouncer {
            window,
            pending: BTreeSet::new(),
            deadline: None,
        }
    }

    /// Record a changed path seen at `now`, (re)arming the quiet window from `now`.
    pub fn record(&mut self, path: PathBuf, now: T) {
        self.pending.insert(path);
        self.deadline = Some(now + self.window);
    }

    /// When the current batch becomes due, if a batch is pending.
    pub fn deadline(&self) -> Option<T> {
        if self.pending.is_empty() {
            None
        } else {
            self.deadline
        }
    }

    /// Whether the quiet window has elapsed and a batch is waiting.
    pub fn ready(&self, now: T) -> bool {
        matches!(self.deadline(), Some(d) if now >= d)
    }

    /// Take the coalesced batch, sorted and de-duplicated, and re-arm empty. Callers gate this on
    /// [`Debouncer::ready`]; taking early simply returns whatever has accumulated so far.
    pub fn take(&mut self) -> Vec<PathBuf> {
        self.deadline = None;
        std::mem::take(&mut self.pending).into_iter().collect()
    }
}

// --- managed-path filter (doc-9 §3) -------------------------------------------------------------

/// Whether a path the watcher reported is one of the root's managed files (doc-9 §3): `config.yml`
/// at the root, or a file under one of the scanned directories (`tasks`/`drafts`/`completed`/
/// `archive`/`milestones`/`docs`/`decisions`). A recursive watch on the root also surfaces unrelated
/// files (an editor swap file, a `.git` write); filtering to the managed set keeps those from
/// forcing a reconstruction. `backlog_root` must be in the same canonical form as the reported paths.
pub fn is_managed_path(path: &Path, backlog_root: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(backlog_root) else {
        return false;
    };
    let mut components = rel.components();
    let Some(first) = components.next() else {
        return false;
    };
    let first = first.as_os_str();
    // config.yml sits directly at the root and has no following component.
    if first == "config.yml" {
        return components.next().is_none();
    }
    // Otherwise the first component must be a scanned top-level directory. archive/tasks, docs/…
    // and the rest are all covered by their top-level name, so nested archives need no special case.
    let managed_dirs = [
        "tasks",
        "drafts",
        "completed",
        "archive",
        "milestones",
        "docs",
        "decisions",
    ];
    managed_dirs.iter().any(|d| first == *d) && components.next().is_some()
}

// --- file watch (doc-9 §3, AC #1/#5) ------------------------------------------------------------

/// A read-only subscription to a Backlog root's OS change notifications, delivering debounced
/// batches of changed managed files (doc-9 §3, AC #1). The watch never writes (AC #5): it only
/// observes. A batch is the caller's cue to [`SyncState::reload`] with [`ReloadReason::ExternalChange`].
///
/// The `notify` watcher and the debounce thread are owned here and torn down on drop; dropping the
/// session stops the subscription. Wiring a batch to a UI refresh is the command layer's job
/// (TASK-33), the same way the update adapter maps to no Tauri command of its own yet.
pub struct WatchSession {
    // Kept alive for the session's lifetime: dropping the notify watcher ends the subscription.
    _watcher: notify::RecommendedWatcher,
    batches: std::sync::mpsc::Receiver<Vec<PathBuf>>,
    // The debounce thread exits when the notify watcher above is dropped (its sender disconnects).
    _thread: std::thread::JoinHandle<()>,
}

impl WatchSession {
    /// Start watching `backlog_root` recursively, coalescing notifications with the given quiet
    /// `window` (doc-9 §3). The root is canonicalized so reported paths (which platforms such as
    /// macOS return through resolved symlinks) match the managed-path filter.
    pub fn start(backlog_root: impl AsRef<Path>, window: Duration) -> notify::Result<WatchSession> {
        use notify::{RecursiveMode, Watcher};

        let root = backlog_root
            .as_ref()
            .canonicalize()
            .unwrap_or_else(|_| backlog_root.as_ref().to_path_buf());

        let (raw_tx, raw_rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = notify::recommended_watcher(move |res| {
            // A disconnected receiver only means the session is shutting down; drop the event.
            let _ = raw_tx.send(res);
        })?;
        watcher.watch(&root, RecursiveMode::Recursive)?;

        let (batch_tx, batch_rx) = std::sync::mpsc::channel::<Vec<PathBuf>>();
        let filter_root = root.clone();
        let thread = std::thread::spawn(move || {
            debounce_loop(&raw_rx, &batch_tx, &filter_root, window);
        });

        Ok(WatchSession {
            _watcher: watcher,
            batches: batch_rx,
            _thread: thread,
        })
    }

    /// The channel of debounced batches. Each item is one reconstruction's worth of changed managed
    /// files (AC #1); receive from it and reload.
    pub fn batches(&self) -> &std::sync::mpsc::Receiver<Vec<PathBuf>> {
        &self.batches
    }
}

/// Drive the [`Debouncer`] from raw notify events with a real clock (doc-9 §3). Blocks until an
/// event arrives when nothing is pending, and otherwise waits only until the pending batch is due,
/// so a burst is emitted exactly once the window goes quiet. Exits when the notify sender disconnects
/// (the session's watcher was dropped) or the batch receiver is gone (the consumer left).
fn debounce_loop(
    raw_rx: &std::sync::mpsc::Receiver<notify::Result<notify::Event>>,
    batch_tx: &std::sync::mpsc::Sender<Vec<PathBuf>>,
    filter_root: &Path,
    window: Duration,
) {
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::Instant;

    let mut debouncer: Debouncer<Instant> = Debouncer::new(window);
    loop {
        let now = Instant::now();
        let received = match debouncer.deadline() {
            // Nothing pending: block for the next event rather than spin.
            None => raw_rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            // A batch is pending: wait only until it is due, then flush below.
            Some(deadline) => raw_rx.recv_timeout(deadline.saturating_duration_since(now)),
        };
        match received {
            Ok(Ok(event)) => {
                for path in event.paths {
                    if is_managed_path(&path, filter_root) {
                        debouncer.record(path, Instant::now());
                    }
                }
            }
            // A watcher-level error is not a change; keep watching (doc-9 §3 best-effort observation).
            Ok(Err(_)) => {}
            Err(RecvTimeoutError::Timeout) => {}
            // The notify watcher was dropped: the session is over.
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if debouncer.ready(Instant::now()) {
            // A gone consumer means the session is over; stop rather than accumulate forever.
            if batch_tx.send(debouncer.take()).is_err() {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::read::scan::WorkingTree;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Instant;

    const CONFIG: &str = "project_name: \"Test\"\n\
default_status: \"To Do\"\n\
statuses: [\"To Do\", \"In Progress\", \"Done\"]\n\
task_prefix: \"TASK\"\n";

    fn task_file(id: &str, status: &str) -> String {
        format!(
            "---\nid: {id}\ntitle: Task {id}\nstatus: {status}\nassignee: []\nlabels: []\n---\n\nbody\n"
        )
    }

    /// A self-cleaning temp dir, mirroring the read layer's test helper so these tests need no
    /// `tempfile` dependency either.
    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new() -> Self {
            static CTR: AtomicU64 = AtomicU64::new(0);
            let n = CTR.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "atlas-sync-test-{}-{nanos}-{n}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            TempDir { path }
        }

        fn write(&self, rel: &str, text: &str) {
            let path = self.path.join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    /// A minimal root that reads cleanly: a config and one active task.
    fn minimal_root() -> TempDir {
        let temp = TempDir::new();
        temp.write("config.yml", CONFIG);
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "To Do"));
        temp
    }

    fn task_path(root: &TempDir) -> PathBuf {
        root.path.join("tasks").join("task-1 - a.md")
    }

    // --- AC #2: the read-version index is recorded on read -------------------------------------

    #[test]
    fn initialize_records_a_stamp_for_every_managed_file() {
        let temp = minimal_root();
        temp.write("docs/doc-1 - d.md", "---\nid: doc-1\ntitle: d\n---\n");
        let source = WorkingTree::new(&temp.path);
        let (model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();

        assert_eq!(model.tasks.len(), 1);
        // Both the task file and the doc file are stamped, each with a content hash (AC #2).
        let task_stamp = state
            .recorded(&task_path(&temp))
            .expect("task file is indexed");
        assert!(task_stamp.hash.is_some());
        assert!(task_stamp.size > 0);
        let doc_path = temp.path.join("docs").join("doc-1 - d.md");
        assert!(state.recorded(&doc_path).is_some());
    }

    // --- AC #3: the pre-update conflict check --------------------------------------------------

    #[test]
    fn an_unchanged_file_is_in_sync() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::InSync
        );
    }

    #[test]
    fn an_externally_changed_file_is_a_conflict() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();

        // Rewrite the file with different content and a different size — an external change.
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::Conflict
        );
    }

    #[test]
    fn a_same_size_content_change_is_caught_by_the_hash() {
        // A one-character change that keeps the byte length identical: size cannot tell, and an
        // in-place rewrite can leave mtime coarse — the content hash is what catches it (doc-9 §4).
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let recorded = state.recorded(&task_path(&temp)).unwrap().clone();

        // Same status length ("To Do" → "To Da") keeps size equal; force mtime equal too so only
        // the hash can distinguish the two versions.
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "To Da"));
        let stale_mtime = FsVersions.stamp(&task_path(&temp)).unwrap();
        assert_eq!(
            stale_mtime.size, recorded.size,
            "the change must keep size equal for this test"
        );

        // A probe that reports the recorded mtime for the current file (mtime says "unchanged")
        // yet hashes the real, changed bytes — exactly the coarse-mtime case §4 anticipates.
        struct FrozenMtime {
            mtime: Option<SystemTime>,
            path: PathBuf,
        }
        impl FileVersions for FrozenMtime {
            fn stamp(&self, path: &Path) -> io::Result<VersionStamp> {
                let mut s = FsVersions.stamp(path)?;
                if path == self.path {
                    s.mtime = self.mtime;
                }
                Ok(s)
            }
            fn hash(&self, path: &Path) -> io::Result<u64> {
                FsVersions.hash(path)
            }
        }
        let probe = FrozenMtime {
            mtime: recorded.mtime,
            path: task_path(&temp),
        };
        assert_eq!(
            state.check_conflict(&task_path(&temp), &probe).unwrap(),
            ConflictCheck::Conflict
        );
    }

    #[test]
    fn a_deleted_file_is_a_conflict() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        std::fs::remove_file(task_path(&temp)).unwrap();
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::Conflict
        );
    }

    #[test]
    fn a_file_with_no_recorded_baseline_is_a_conflict() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        // A path we never read has no baseline to vouch for — treated as a conflict, not in-sync.
        let unknown = temp.path.join("tasks").join("task-99 - new.md");
        assert_eq!(
            state.check_conflict(&unknown, &FsVersions).unwrap(),
            ConflictCheck::Conflict
        );
    }

    // --- AC #4: reload refreshes both the model and the recorded index -------------------------

    #[test]
    fn reload_refreshes_the_model_and_clears_the_stale_conflict() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        assert_eq!(
            model.task("TASK-1").unwrap().status.as_deref(),
            Some("To Do")
        );

        // External change, then reload through the shared path (doc-5 §6 / doc-9 §3).
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "Done"));
        temp.write("tasks/task-2 - b.md", &task_file("TASK-2", "To Do"));
        let reloaded = state
            .reload(ReloadReason::ExternalChange, &source, &FsVersions)
            .unwrap();

        // The model reflects the new content …
        assert_eq!(
            reloaded.task("TASK-1").unwrap().status.as_deref(),
            Some("Done")
        );
        assert_eq!(reloaded.tasks.len(), 2);
        // … and the refreshed index makes the once-stale file in-sync again (AC #4).
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::InSync
        );
    }

    #[test]
    fn every_reload_reason_uses_the_same_path() {
        // AC #6: update-success, partial-failure, and external-change all reload through the one
        // method — proven by all three producing the same refreshed model.
        for reason in [
            ReloadReason::UpdateApplied,
            ReloadReason::PartialUpdateFailed,
            ReloadReason::ExternalChange,
        ] {
            let temp = minimal_root();
            let source = WorkingTree::new(&temp.path);
            let (_model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
            temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "Done"));
            let reloaded = state.reload(reason, &source, &FsVersions).unwrap();
            assert_eq!(
                reloaded.task("TASK-1").unwrap().status.as_deref(),
                Some("Done")
            );
        }
    }

    // --- AC #1: the debouncer coalesces a burst into one batch ----------------------------------

    #[test]
    fn a_burst_within_the_window_becomes_one_batch() {
        let window = Duration::from_millis(50);
        let mut deb: Debouncer<Instant> = Debouncer::new(window);
        let base = Instant::now();

        // Three changes inside the window, the last resetting the quiet timer each time.
        deb.record(PathBuf::from("tasks/a.md"), base);
        deb.record(
            PathBuf::from("tasks/b.md"),
            base + Duration::from_millis(10),
        );
        deb.record(
            PathBuf::from("tasks/a.md"),
            base + Duration::from_millis(20),
        );

        // Not due until the window has been quiet from the last change (base+20+window).
        assert!(!deb.ready(base + Duration::from_millis(40)));
        assert!(deb.ready(base + Duration::from_millis(20) + window));

        // One batch, de-duplicated and sorted; the repeated path appears once.
        let batch = deb.take();
        assert_eq!(
            batch,
            vec![PathBuf::from("tasks/a.md"), PathBuf::from("tasks/b.md")]
        );
        // Drained: nothing pending afterward.
        assert!(deb.deadline().is_none());
    }

    #[test]
    fn a_quiet_debouncer_has_no_deadline() {
        let deb: Debouncer<Instant> = Debouncer::new(Duration::from_millis(50));
        assert!(deb.deadline().is_none());
        assert!(!deb.ready(Instant::now()));
    }

    // --- doc-9 §3: only managed files pass the filter -------------------------------------------

    #[test]
    fn the_managed_path_filter_admits_only_root_managed_files() {
        let root = Path::new("/projects/app/backlog");
        // Managed: config.yml and files under each scanned directory, including nested archives.
        assert!(is_managed_path(&root.join("config.yml"), root));
        assert!(is_managed_path(&root.join("tasks/task-1 - a.md"), root));
        assert!(is_managed_path(
            &root.join("archive/tasks/task-9 - old.md"),
            root
        ));
        assert!(is_managed_path(
            &root.join("decisions/decision-1 - x.md"),
            root
        ));
        // Not managed: an unrelated dir, a bare directory event, a file outside the root, and a
        // stray file directly at the root that is not config.yml.
        assert!(!is_managed_path(&root.join(".git/index"), root));
        assert!(!is_managed_path(&root.join("tasks"), root));
        assert!(!is_managed_path(&root.join("README.md"), root));
        assert!(!is_managed_path(
            Path::new("/somewhere/else/tasks/a.md"),
            root
        ));
    }

    // --- AC #1/#5: the real watcher delivers a debounced batch, read-only -----------------------

    #[test]
    fn the_watch_session_delivers_a_batch_for_an_external_change() {
        let temp = minimal_root();
        let session = WatchSession::start(&temp.path, Duration::from_millis(80))
            .expect("watch session starts");

        // An external write to a managed file (as a bare `backlog` or another window would do).
        // A brief settle keeps the create from racing the watcher's registration.
        std::thread::sleep(Duration::from_millis(150));
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));

        // The debounced batch must arrive and name the changed managed file. FS-event latency
        // varies by platform, so allow a generous ceiling; the assertion is on content, not timing.
        let batch = session
            .batches()
            .recv_timeout(Duration::from_secs(5))
            .expect("a debounced batch arrives for the change");
        let changed = task_path(&temp).canonicalize().unwrap();
        assert!(
            batch
                .iter()
                .any(|p| p.canonicalize().map(|c| c == changed).unwrap_or(false)),
            "batch {batch:?} should include the changed task file {changed:?}"
        );

        // The watch never wrote: the file still holds exactly what the external change put there.
        let on_disk = std::fs::read_to_string(task_path(&temp)).unwrap();
        assert_eq!(on_disk, task_file("TASK-1", "In Progress"));
    }

    // --- AC #3/#4: the guarded update ties check → run → reload into one unit --------------------

    use crate::update::{probe, CliRun, CliStatus, TaskEdit};
    use std::cell::RefCell;
    use std::collections::VecDeque;

    /// A scriptable [`BacklogCli`] answering `--version` as the confirmed version and popping scripted
    /// results for every other call, recording each argv so the tests can assert whether the CLI was
    /// launched at all (the AC #3 guarantee).
    struct FakeCli {
        results: RefCell<VecDeque<CliRun>>,
        calls: RefCell<Vec<Vec<String>>>,
    }

    impl FakeCli {
        fn new() -> Self {
            FakeCli {
                results: RefCell::new(VecDeque::new()),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn push_success(&self) {
            self.results.borrow_mut().push_back(CliRun {
                success: true,
                code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            });
        }

        fn push_failure(&self, code: i32, stderr: &str) {
            self.results.borrow_mut().push_back(CliRun {
                success: false,
                code: Some(code),
                stdout: String::new(),
                stderr: stderr.to_string(),
            });
        }

        /// Recorded calls other than the version probe — i.e. actual action launches.
        fn action_calls(&self) -> Vec<Vec<String>> {
            self.calls
                .borrow()
                .iter()
                .filter(|argv| argv.as_slice() != ["--version"])
                .cloned()
                .collect()
        }
    }

    impl BacklogCli for FakeCli {
        fn run(&self, _dir: Option<&Path>, args: &[String]) -> io::Result<CliRun> {
            self.calls.borrow_mut().push(args.to_vec());
            if args == ["--version"] {
                return Ok(CliRun {
                    success: true,
                    code: Some(0),
                    stdout: "1.47.1".to_string(),
                    stderr: String::new(),
                });
            }
            Ok(self.results.borrow_mut().pop_front().unwrap_or(CliRun {
                success: true,
                code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            }))
        }
    }

    fn capability(cli: &FakeCli) -> CliCapability {
        match probe(cli) {
            CliStatus::Supported(cap) => cap,
            other => panic!("expected a supported CLI, got {other:?}"),
        }
    }

    fn status_edit(status: &str) -> UpdateOperation {
        UpdateOperation::TaskEdit {
            task_id: "TASK-1".to_string(),
            edit: TaskEdit {
                status: Some(status.to_string()),
                ..Default::default()
            },
        }
    }

    #[test]
    fn guarded_update_launches_when_targets_are_in_sync() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        let result = state
            .guarded_update(
                &[task_path(&temp)],
                &temp.path,
                &[status_edit("Done")],
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Ran { outcome, model } => {
                assert_eq!(outcome, UpdateOutcome::Succeeded);
                assert!(model.is_some(), "a success reloads the model (AC #4)");
            }
            other => panic!("expected Ran, got {other:?}"),
        }
        // The CLI was actually launched with the edit — the in-sync path runs it (doc-9 §4 step 2).
        assert_eq!(
            cli.action_calls(),
            vec![vec!["task", "edit", "TASK-1", "--status", "Done"]]
        );
    }

    #[test]
    fn guarded_update_does_not_launch_the_cli_on_conflict() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        // An external change after the read makes the target diverge from its recorded version.
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));

        let result = state
            .guarded_update(
                &[task_path(&temp)],
                &temp.path,
                &[status_edit("Done")],
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Conflict { path, model } => {
                assert_eq!(path, task_path(&temp));
                // doc-9 §5: the reload surfaces the external content, not the discarded edit.
                assert_eq!(
                    model.task("TASK-1").unwrap().status.as_deref(),
                    Some("In Progress")
                );
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
        // AC #3, the core guarantee: no CLI process was launched for the action.
        assert!(
            cli.action_calls().is_empty(),
            "the CLI must not launch on a conflict"
        );
        // The refreshed index now matches the external content, so a retry would be in sync.
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::InSync
        );
    }

    #[test]
    fn guarded_update_reloads_after_a_partial_failure() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        // First invocation succeeds, the second fails: a partial application (doc-5 §6).
        cli.push_success();
        cli.push_failure(1, "second failed");

        let result = state
            .guarded_update(
                &[task_path(&temp)],
                &temp.path,
                &[
                    status_edit("Done"),
                    UpdateOperation::TaskComplete {
                        task_id: "TASK-1".to_string(),
                    },
                ],
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Ran { outcome, model } => {
                assert!(matches!(outcome, UpdateOutcome::Failed(ref f) if f.partial));
                assert!(
                    model.is_some(),
                    "a partial failure reloads to reflect what landed (doc-5 §6)"
                );
            }
            other => panic!("expected Ran, got {other:?}"),
        }
    }

    #[test]
    fn guarded_update_does_not_reload_after_a_clean_failure() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (_model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        // A single-invocation failure changes nothing on disk (doc-5 §5).
        cli.push_failure(1, "task complete: task is not Done");

        let result = state
            .guarded_update(
                &[task_path(&temp)],
                &temp.path,
                &[UpdateOperation::TaskComplete {
                    task_id: "TASK-1".to_string(),
                }],
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Ran { outcome, model } => {
                assert!(matches!(outcome, UpdateOutcome::Failed(ref f) if !f.partial));
                assert!(
                    model.is_none(),
                    "a failure that changed nothing reloads nothing (doc-5 §5)"
                );
            }
            other => panic!("expected Ran, got {other:?}"),
        }
    }
}
