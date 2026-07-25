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
//! | 更新操作の対象（が属するファイル） | [`TargetResolution`] | which file an operation rewrites: checkable, none (a create), or unresolvable ⇒ refused (doc-9 §4) |
//! | 再読込契機 | [`ReloadReason`] + [`SyncState::reload`] | the one path every re-read funnels through (update success, external change, future branch switch — AC #6) |
//! | 再構築単位 | root (whole-root read via [`ScanSource`]) | doc-4's reconstruction unit; file-level is a forward refinement on the same method |
//! | ファイル監視 | [`WatchSession`] | the read-only OS-notification subscription (doc-9 §3) |
//! | デバウンス | [`Debouncer`] | coalescing a burst of notifications into one batch (AC #1) |
//! | 変化したファイル（不能ならルート） | [`WatchBatch`] | one batch: the changed files, or a whole-root [`WatchBatch::Rescan`] when they cannot be identified (doc-9 §3) |
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
use std::cell::RefCell;
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

/// A [`ScanSource`] decorator that records a version stamp for every file it hands to the read layer,
/// stamping from the *same* read that builds the model (doc-9 §4). The read layer reads each managed
/// file exactly once through [`ScanSource::read`]; capturing the stamp there — hashing the very bytes
/// returned to the parser — makes the recorded version identify the bytes last read into the model,
/// with no second listing/read that an external writer could slip between (which would leave the
/// model at one version and the index at another). This is the [`ScanSource`] seam doing exactly what
/// decision-3 built it for: interposing on where the read layer's bytes come from.
struct RecordingSource<'a> {
    inner: &'a dyn ScanSource,
    probe: &'a dyn FileVersions,
    index: RefCell<VersionIndex>,
}

impl<'a> RecordingSource<'a> {
    fn new(inner: &'a dyn ScanSource, probe: &'a dyn FileVersions) -> Self {
        RecordingSource {
            inner,
            probe,
            index: RefCell::new(VersionIndex::new()),
        }
    }
}

impl ScanSource for RecordingSource<'_> {
    fn read_config(&self) -> io::Result<String> {
        // config.yml is not an update target and carries no conflict index (updates are task / doc /
        // milestone), so it is passed through unstamped; the watch still covers it (doc-9 §3).
        self.inner.read_config()
    }

    fn list(&self, dir: ScanDir) -> io::Result<Vec<PathBuf>> {
        self.inner.list(dir)
    }

    fn root_dir_name(&self) -> Option<String> {
        self.inner.root_dir_name()
    }

    fn read(&self, path: &Path) -> io::Result<String> {
        let content = self.inner.read(path)?;
        // `size` and `hash` come from the exact bytes the model is parsed from, so the stamp cannot
        // disagree with the model. mtime is an auxiliary metadata read (it can never be atomic with
        // the content read) and is not gate-decisive — `same_version` confirms by hash. A file that
        // fails to read is simply not stamped: it has no baseline, so a later update to it is a
        // conflict, which is the safe verdict.
        let stamp = VersionStamp {
            mtime: self.probe.stamp(path).ok().and_then(|s| s.mtime),
            size: content.len() as u64,
            hash: Some(hash_bytes(content.as_bytes())),
        };
        self.index.borrow_mut().insert(path.to_path_buf(), stamp);
        Ok(content)
    }
}

/// Read a root and record its version index in one pass (AC #2, doc-9 §4). The [`RecordingSource`]
/// stamps each file as the read layer reads it, so the returned model and the index are built from
/// the same reads.
fn read_and_index(
    slug: &str,
    source: &dyn ScanSource,
    probe: &dyn FileVersions,
) -> Result<(ProjectModel, VersionIndex), crate::read::RootError> {
    let recorder = RecordingSource::new(source, probe);
    let model = read_project(slug, &recorder)?;
    Ok((model, recorder.index.into_inner()))
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
    /// The user asked for the root to be re-read. This is the fallback for when 継続検出 is not
    /// running: doc-9 §3 does not treat the watch as guaranteed (it is why a post-update reload
    /// exists at all, and why a batch can arrive as a whole-root rescan), and a watch that fails to
    /// start leaves a user-initiated re-read as the only way to pick external change up. Added as a
    /// variant reusing this one path rather than as a second read path — the structure AC #6 fixes.
    ManualRefresh,
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
    /// A reload could not read the root (doc-4 §5 ルート読取不能). `applied` records whether the CLI had
    /// *already* changed disk before the reload failed, which the caller must know to act safely
    /// (doc-5 §6): `None` means the reload was the post-conflict re-read, so no CLI ran and a retry is
    /// safe; `Some(outcome)` means the update already landed (a success, or a partial application), so
    /// the caller must report "update applied, refresh failed" and must not blindly retry — a retry
    /// could duplicate a create or re-apply a transition.
    Reload {
        error: crate::read::RootError,
        applied: Option<UpdateOutcome>,
    },
    /// A target's version could not be read for a reason other than "gone" (which is itself a
    /// conflict) — e.g. a permission fault. Not a version verdict, so it is surfaced rather than
    /// silently treated as either outcome.
    Probe(io::Error),
    /// A mutating operation's target could not be version-checked, so the action was refused **before
    /// any CLI launched** — nothing ran and nothing changed. This is what keeps "no CLI launch without
    /// a version check" total (doc-9 §4): an operation Atlas cannot vouch for is not run rather than
    /// run unchecked. See [`operation_target`] for which operations land here and why.
    UncheckableTarget { what: &'static str, detail: String },
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
        let (model, index) = read_and_index(slug, source, probe)?;
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
        let (model, index) = read_and_index(&self.slug, source, probe)?;
        self.index = index;
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
    /// the CLI only if all are in sync, then reload. The targets are derived *inside* this boundary
    /// from `model` (which the caller holds paired with this state from [`initialize`](Self::initialize)
    /// or [`reload`](Self::reload)), so the "no CLI launch on conflict" guarantee cannot be bypassed
    /// by a caller pairing a wrong or empty target list with the action. Every operation ends up in
    /// exactly one of three states, never silently skipped: checked ([`TargetResolution::Checkable`]),
    /// legitimately unchecked because it creates a new file ([`TargetResolution::NoExistingFile`]), or
    /// **refused before launch** because its target cannot be checked
    /// ([`GuardError::UncheckableTarget`] — see [`operation_target`]).
    ///
    /// - **Conflict (AC #3)**: if any target diverged, the CLI is *not* launched. The root is
    ///   reloaded to show the external change (doc-9 §5) and [`GuardedUpdate::Conflict`] is returned.
    /// - **Ran**: with every target in sync the action runs (doc-5). On success, and on a partial
    ///   failure (on-disk state moved mid-sequence), the model is reloaded so the returned model
    ///   reflects what actually landed (doc-5 §6, AC #4); a failure that changed nothing reloads
    ///   nothing. A reload that then fails carries the applied outcome in [`GuardError::Reload`].
    ///
    /// The `capability` requirement is inherited from [`update::run`]: an update is unreachable
    /// without a supported CLI, so read-only degradation stays structural (doc-5 AC #6).
    #[allow(clippy::too_many_arguments)]
    pub fn guarded_update(
        &mut self,
        action: &[UpdateOperation],
        model: &ProjectModel,
        project_root: &Path,
        capability: &CliCapability,
        cli: &dyn BacklogCli,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<GuardedUpdate, GuardError> {
        // Pre-update check (AC #3): each operation's target is resolved from the model here, not
        // supplied by the caller, so the check cannot be skipped. A single diverged target withholds
        // the whole launch, matching the adapter's all-or-nothing planning (doc-5 §5).
        for op in action {
            let path = match operation_target(op, model) {
                TargetResolution::Checkable(path) => path,
                // A create has no version Atlas has read, so there is nothing to conflict with — the
                // only case that may legitimately pass through unchecked.
                TargetResolution::NoExistingFile => continue,
                // Cannot be checked ⇒ must not run. Refused here, before any launch, so nothing ran
                // and nothing changed (doc-9 §4).
                TargetResolution::Unresolvable { what, detail } => {
                    return Err(GuardError::UncheckableTarget { what, detail })
                }
            };
            if self
                .check_conflict(&path, probe)
                .map_err(GuardError::Probe)?
                == ConflictCheck::Conflict
            {
                // The post-conflict reload is a re-read only; no CLI ran, so a retry stays safe.
                let model = self
                    .reload(ReloadReason::ExternalChange, source, probe)
                    .map_err(|error| GuardError::Reload {
                        error,
                        applied: None,
                    })?;
                return Ok(GuardedUpdate::Conflict { path, model });
            }
        }

        // Every target still matches what we read: run the action (doc-9 §4 step 2).
        let outcome =
            update::run(project_root, action, capability, cli).map_err(GuardError::Rejected)?;
        let reloaded = match &outcome {
            UpdateOutcome::Succeeded => Some(ReloadReason::UpdateApplied),
            // A partial (mid-sequence) failure already moved on-disk state, so a reload is mandatory
            // to reflect what landed (doc-5 §6); a non-partial failure changed nothing, so skip it.
            UpdateOutcome::Failed(failure) if failure.partial => {
                Some(ReloadReason::PartialUpdateFailed)
            }
            UpdateOutcome::Failed(_) => None,
        };
        let model = match reloaded {
            Some(reason) => Some(self.reload(reason, source, probe).map_err(|error| {
                // The CLI already changed disk; carry the outcome so the caller reports
                // "applied, refresh failed" instead of treating it as a safe-to-retry no-op.
                GuardError::Reload {
                    error,
                    applied: Some(outcome.clone()),
                }
            })?),
            None => None,
        };
        Ok(GuardedUpdate::Ran { outcome, model })
    }
}

/// What the pre-update check could determine about an operation's target (doc-9 §4).
///
/// The three cases are kept apart because two of them used to collapse into one `None`, which is what
/// let a mutating operation reach the CLI unchecked (review round 2): "a create has no file to check"
/// and "this mutation's file cannot be checked" are opposite situations, and only the first is safe to
/// pass through. Distinct variants are what turn "no CLI launch on conflict" into a structural
/// guarantee — every operation is either checked or refused, never silently skipped.
#[derive(Debug, Clone, PartialEq, Eq)]
enum TargetResolution {
    /// A create: it writes a new file, so there is no version Atlas has read to conflict with (doc-9
    /// §4 governs rewrites of files already read). Safe to pass through unchecked.
    NoExistingFile,
    /// The file this operation will rewrite. Its recorded version is checked before launch.
    Checkable(PathBuf),
    /// A mutation whose target cannot be version-checked here. Refused before launch rather than let
    /// through: an unchecked read-modify-write is exactly the overwrite doc-9 §4.1 exists to prevent.
    Unresolvable { what: &'static str, detail: String },
}

/// Resolve the file an operation will rewrite, for the pre-update conflict check (doc-9 §4).
///
/// Tasks, drafts and documents resolve to their `source_path` from the model. Milestone rename /
/// remove / archive are deliberately *not* checkable here: `milestone rename` (without
/// `--no-update-tasks`) and `milestone remove --task-handling clear|reassign` rewrite every task file
/// referencing the milestone (doc-5 §3), so their real target set is the milestone file *plus* an
/// unbounded set of task files. doc-9 §4 defines the check for 更新操作の対象 file, not for that
/// fan-out, and inventing a rule for it here would add an undocumented decision to a contract that
/// has none. Refusing is the safe reading — nothing is overwritten unchecked — and extending doc-9 to
/// cover the fan-out is what would enable them.
fn operation_target(op: &UpdateOperation, model: &ProjectModel) -> TargetResolution {
    let (kind, id) = match op {
        // A create writes a file that does not exist yet: nothing read, nothing to conflict with.
        UpdateOperation::TaskCreate(_)
        | UpdateOperation::DocCreate(_)
        | UpdateOperation::MilestoneAdd { .. } => return TargetResolution::NoExistingFile,

        UpdateOperation::TaskEdit { task_id, .. }
        | UpdateOperation::TaskComplete { task_id }
        | UpdateOperation::TaskArchive { task_id }
        | UpdateOperation::TaskDemote { task_id } => ("task", task_id),
        UpdateOperation::DraftPromote { draft_id } | UpdateOperation::DraftArchive { draft_id } => {
            ("draft", draft_id)
        }
        UpdateOperation::DocUpdate { doc_id, .. } => ("document", doc_id),

        UpdateOperation::MilestoneRename { from, .. } => {
            return TargetResolution::Unresolvable {
                what: "milestone rename",
                detail: format!(
                    "renaming `{from}` also rewrites every task referencing it, and doc-9 §4 does \
                     not define the check for that fan-out"
                ),
            }
        }
        UpdateOperation::MilestoneRemove { name, .. } => {
            return TargetResolution::Unresolvable {
                what: "milestone remove",
                detail: format!(
                    "removing `{name}` also rewrites every task referencing it, and doc-9 §4 does \
                     not define the check for that fan-out"
                ),
            }
        }
        UpdateOperation::MilestoneArchive { name } => {
            return TargetResolution::Unresolvable {
                what: "milestone archive",
                detail: format!("the model carries no source path for milestone `{name}`"),
            }
        }
    };

    let path = match kind {
        "document" => model.document(id).map(|d| d.source_path.clone()),
        // Tasks and drafts share the task collection, keyed by their own id prefix.
        _ => model.task(id).map(|t| t.source_path.clone()),
    };
    match path {
        Some(path) => TargetResolution::Checkable(path),
        // The id is absent from the model this state was built with, so there is no recorded version
        // to compare and the operation would run unchecked. Refuse it: the CLI would probably fail on
        // the id too, but that must not be the thing upholding the guarantee.
        None => TargetResolution::Unresolvable {
            what: "update",
            detail: format!("{kind} `{id}` is not in the model this sync state was built from"),
        },
    }
}

// --- debounce (doc-9 §3, AC #1) -----------------------------------------------------------------

/// One reconstruction's worth of observed change (doc-9 §3). Two shapes, because doc-9 §3 puts them
/// side by side: the changed files when they can be identified, and the whole root when they cannot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchBatch {
    /// The managed files that changed. Reload these — or, at the root reconstruction unit, reload the
    /// root; either way the changed set is known.
    Changed(Vec<PathBuf>),
    /// The changed files could *not* be identified, so the whole root must be re-read (doc-9 §3
    /// "変化したファイル（不能ならルート）"). Raised when notify reports `need_rescan()` — events were
    /// dropped and any file in the tree may have changed — or when the watcher reports an error, which
    /// equally means the notification stream cannot be trusted to have been complete.
    Rescan { reason: RescanReason },
}

/// Why the changed files could not be identified (doc-9 §3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescanReason {
    /// notify signalled `need_rescan()`: the backend dropped events (queue overflow, watch
    /// invalidation), so no path list can be complete.
    EventsDropped,
    /// The watcher reported an error. The stream may have gaps, so the root is re-read rather than
    /// silently treating the error as "no change".
    WatcherError(String),
}

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
    /// A rescan seen during this window. It subsumes the pending paths — once any events were lost,
    /// the path list cannot be trusted to be complete — so the batch degrades to a whole-root re-read
    /// rather than reporting a partial set as if it were the full change.
    rescan: Option<RescanReason>,
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
            rescan: None,
            deadline: None,
        }
    }

    /// Record a changed path seen at `now`, (re)arming the quiet window from `now`.
    pub fn record(&mut self, path: PathBuf, now: T) {
        self.pending.insert(path);
        self.deadline = Some(now + self.window);
    }

    /// Record that the changed files cannot be identified and the root must be re-read (doc-9 §3),
    /// (re)arming the quiet window. A first reason wins: both mean "re-read everything", and keeping
    /// the earliest keeps the reported cause the one that actually broke the stream.
    pub fn record_rescan(&mut self, reason: RescanReason, now: T) {
        self.rescan.get_or_insert(reason);
        self.deadline = Some(now + self.window);
    }

    /// When the current batch becomes due, if a batch is pending.
    pub fn deadline(&self) -> Option<T> {
        if self.pending.is_empty() && self.rescan.is_none() {
            None
        } else {
            self.deadline
        }
    }

    /// Whether the quiet window has elapsed and a batch is waiting.
    pub fn ready(&self, now: T) -> bool {
        matches!(self.deadline(), Some(d) if now >= d)
    }

    /// Take the coalesced batch and re-arm empty. A rescan seen in this window wins over the path
    /// list (see [`Debouncer::rescan`]); otherwise the paths come back sorted and de-duplicated.
    /// Callers gate this on [`Debouncer::ready`]; taking early returns what has accumulated so far.
    pub fn take(&mut self) -> WatchBatch {
        self.deadline = None;
        let paths = std::mem::take(&mut self.pending);
        match self.rescan.take() {
            Some(reason) => WatchBatch::Rescan { reason },
            None => WatchBatch::Changed(paths.into_iter().collect()),
        }
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
    batches: std::sync::mpsc::Receiver<WatchBatch>,
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

        let (batch_tx, batch_rx) = std::sync::mpsc::channel::<WatchBatch>();
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

    /// The channel of debounced batches. Each item is one reconstruction's worth of observed change
    /// (AC #1): the changed managed files, or a [`WatchBatch::Rescan`] telling the caller to re-read
    /// the whole root because the changed set could not be identified (doc-9 §3).
    pub fn batches(&self) -> &std::sync::mpsc::Receiver<WatchBatch> {
        &self.batches
    }
}

/// Drive the [`Debouncer`] from raw notify events with a real clock (doc-9 §3). Blocks until an
/// event arrives when nothing is pending, and otherwise waits only until the pending batch is due,
/// so a burst is emitted exactly once the window goes quiet. Exits when the notify sender disconnects
/// (the session's watcher was dropped) or the batch receiver is gone (the consumer left).
fn debounce_loop(
    raw_rx: &std::sync::mpsc::Receiver<notify::Result<notify::Event>>,
    batch_tx: &std::sync::mpsc::Sender<WatchBatch>,
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
                if event.need_rescan() {
                    // Events were dropped, so `event.paths` cannot describe the full change — any
                    // file in the tree may have moved. Escalate to a whole-root re-read rather than
                    // reporting a partial path list as complete (doc-9 §3).
                    debouncer.record_rescan(RescanReason::EventsDropped, Instant::now());
                    continue;
                }
                for path in event.paths {
                    if is_managed_path(&path, filter_root) {
                        debouncer.record(path, Instant::now());
                    }
                }
            }
            // A watcher error means the stream may have gaps. Treating it as "no change" would leave
            // the model stale exactly when it is least trustworthy, so it becomes an observable
            // rescan instead of being discarded (doc-9 §3 — reload the root when the changed file
            // cannot be identified).
            Ok(Err(e)) => {
                debouncer.record_rescan(RescanReason::WatcherError(e.to_string()), Instant::now());
            }
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

    // --- review round 1 [P1]: the stamp must come from the read that built the model -------------

    #[test]
    fn the_stamp_identifies_the_bytes_the_model_was_built_from() {
        // A scan source that mutates the file right AFTER handing its content to the read layer —
        // the external writer that used to slip between read_project and a second indexing pass. The
        // model then holds version A; if the index recorded version B (the post-write bytes), a later
        // check would compare B with B, answer InSync, and let the CLI overwrite the external change.
        struct WritesAfterRead {
            inner: WorkingTree,
            target: PathBuf,
            written: std::cell::Cell<bool>,
            new_content: String,
        }
        impl ScanSource for WritesAfterRead {
            fn read_config(&self) -> io::Result<String> {
                self.inner.read_config()
            }
            fn list(&self, dir: ScanDir) -> io::Result<Vec<PathBuf>> {
                self.inner.list(dir)
            }
            fn root_dir_name(&self) -> Option<String> {
                self.inner.root_dir_name()
            }
            fn read(&self, path: &Path) -> io::Result<String> {
                let content = self.inner.read(path)?;
                if path == self.target && !self.written.get() {
                    self.written.set(true);
                    std::fs::write(path, &self.new_content)?;
                }
                Ok(content)
            }
        }

        let temp = minimal_root();
        let source = WritesAfterRead {
            inner: WorkingTree::new(&temp.path),
            target: task_path(&temp),
            written: std::cell::Cell::new(false),
            new_content: task_file("TASK-1", "In Progress"),
        };
        let (model, state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();

        // The model holds what was read (version A) …
        assert_eq!(
            model.task("TASK-1").unwrap().status.as_deref(),
            Some("To Do")
        );
        // … so the external change made after that read must be a conflict, not InSync.
        assert_eq!(
            state
                .check_conflict(&task_path(&temp), &FsVersions)
                .unwrap(),
            ConflictCheck::Conflict,
            "the stamp must describe the bytes the model was built from, not a later re-read"
        );
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
        // AC #6: update-success, partial-failure, external-change, and a user-initiated refresh all
        // reload through the one method — proven by all of them producing the same refreshed model.
        // A new trigger belongs in this list, not in a second read path; that is what makes adding
        // one a variant rather than a code path.
        for reason in [
            ReloadReason::UpdateApplied,
            ReloadReason::PartialUpdateFailed,
            ReloadReason::ExternalChange,
            ReloadReason::ManualRefresh,
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
            WatchBatch::Changed(vec![
                PathBuf::from("tasks/a.md"),
                PathBuf::from("tasks/b.md")
            ])
        );
        // Drained: nothing pending afterward.
        assert!(deb.deadline().is_none());
    }

    // --- review round 1 [P2]: a rescan signal must reach the caller as a whole-root re-read --------

    #[test]
    fn a_rescan_subsumes_the_pending_paths() {
        // notify's need_rescan() means events were dropped, so the path list cannot be complete —
        // reporting it as the full change would leave the model stale (doc-9 §3).
        let window = Duration::from_millis(50);
        let mut deb: Debouncer<Instant> = Debouncer::new(window);
        let base = Instant::now();

        deb.record(PathBuf::from("tasks/a.md"), base);
        deb.record_rescan(RescanReason::EventsDropped, base + Duration::from_millis(5));

        assert!(deb.ready(base + Duration::from_millis(5) + window));
        assert_eq!(
            deb.take(),
            WatchBatch::Rescan {
                reason: RescanReason::EventsDropped
            }
        );
        assert!(deb.deadline().is_none());
    }

    #[test]
    fn a_watcher_error_becomes_an_observable_rescan() {
        // A watcher error means the stream may have gaps; treating it as "no change" would leave the
        // model stale exactly when it is least trustworthy.
        let mut deb: Debouncer<Instant> = Debouncer::new(Duration::from_millis(50));
        let base = Instant::now();
        deb.record_rescan(
            RescanReason::WatcherError("queue overflow".to_string()),
            base,
        );

        // A rescan alone arms the window — it is a batch even with no paths recorded.
        assert!(deb.deadline().is_some());
        match deb.take() {
            WatchBatch::Rescan {
                reason: RescanReason::WatcherError(detail),
            } => assert!(detail.contains("queue overflow")),
            other => panic!("expected a WatcherError rescan, got {other:?}"),
        }
    }

    #[test]
    fn the_first_rescan_reason_is_kept() {
        // Both reasons mean "re-read everything"; keeping the earliest keeps the reported cause the
        // one that actually broke the stream.
        let mut deb: Debouncer<Instant> = Debouncer::new(Duration::from_millis(50));
        let base = Instant::now();
        deb.record_rescan(RescanReason::EventsDropped, base);
        deb.record_rescan(
            RescanReason::WatcherError("later".to_string()),
            base + Duration::from_millis(1),
        );
        assert_eq!(
            deb.take(),
            WatchBatch::Rescan {
                reason: RescanReason::EventsDropped
            }
        );
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

    /// End-to-end check that the real OS watcher reaches the debounced batch channel.
    ///
    /// `#[ignore]` by default: this asserts on OS file-change notifications actually being delivered,
    /// which a sandboxed environment can withhold entirely. On macOS the FSEvents stream is not
    /// delivered to processes under some sandbox profiles (observed in review: this test times out
    /// there while passing on the same machine outside the sandbox), so leaving it in the default run
    /// makes `cargo test` red for an environment property rather than a code defect. Everything that
    /// is Atlas's own logic — the managed-path filter, the debounce/rescan rules, the index, conflict
    /// detection and reload — is covered by the deterministic tests above, which need no real watcher.
    ///
    /// Run it explicitly where OS notifications are available:
    /// `cargo test --lib -- --ignored the_watch_session_delivers_a_batch_for_an_external_change`
    #[test]
    #[ignore = "requires OS file-change notifications; a sandboxed macOS FSEvents stream withholds them"]
    fn the_watch_session_delivers_a_batch_for_an_external_change() {
        let temp = minimal_root();
        let session = WatchSession::start(&temp.path, Duration::from_millis(80))
            .expect("watch session starts");

        // An external write to a managed file (as a bare `backlog` or another window would do).
        // A brief settle keeps the write from racing the watcher's registration.
        std::thread::sleep(Duration::from_millis(300));
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));

        // The debounced batch must arrive and account for the changed managed file. FS-event latency
        // varies by platform, so allow a generous ceiling; the assertion is on content, not timing.
        // A Rescan is also a pass: it is the documented "cannot identify the files, re-read the root"
        // outcome (doc-9 §3), which still tells the caller to reload.
        let batch = session
            .batches()
            .recv_timeout(Duration::from_secs(10))
            .expect("a debounced batch arrives for the change");
        match &batch {
            WatchBatch::Changed(paths) => {
                let changed = task_path(&temp).canonicalize().unwrap();
                assert!(
                    paths
                        .iter()
                        .any(|p| p.canonicalize().map(|c| c == changed).unwrap_or(false)),
                    "batch {paths:?} should include the changed task file {changed:?}"
                );
            }
            WatchBatch::Rescan { .. } => {}
        }

        // The watch never wrote: the file still holds exactly what the external change put there.
        let on_disk = std::fs::read_to_string(task_path(&temp)).unwrap();
        assert_eq!(on_disk, task_file("TASK-1", "In Progress"));
    }

    /// AC #5, without depending on OS notification delivery: starting a watch session must not modify
    /// the root. This runs in the default suite because it asserts *our* read-only property, whereas
    /// the test above asserts the platform's delivery.
    #[test]
    fn starting_a_watch_session_never_writes_to_the_root() {
        let temp = minimal_root();
        let before = std::fs::read_to_string(task_path(&temp)).unwrap();
        let listing_before = std::fs::read_dir(temp.path.join("tasks")).unwrap().count();

        let session = WatchSession::start(&temp.path, Duration::from_millis(50))
            .expect("watch session starts");
        std::thread::sleep(Duration::from_millis(100));
        drop(session);

        assert_eq!(std::fs::read_to_string(task_path(&temp)).unwrap(), before);
        assert_eq!(
            std::fs::read_dir(temp.path.join("tasks")).unwrap().count(),
            listing_before,
            "the watch must not add or remove files (AC #5)"
        );
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
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        let result = state
            .guarded_update(
                &[status_edit("Done")],
                &model,
                &temp.path,
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
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        // An external change after the read makes the target diverge from its recorded version.
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));

        let result = state
            .guarded_update(
                &[status_edit("Done")],
                &model,
                &temp.path,
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
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        // First invocation succeeds, the second fails: a partial application (doc-5 §6).
        cli.push_success();
        cli.push_failure(1, "second failed");

        let result = state
            .guarded_update(
                &[
                    status_edit("Done"),
                    UpdateOperation::TaskComplete {
                        task_id: "TASK-1".to_string(),
                    },
                ],
                &model,
                &temp.path,
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
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        // A single-invocation failure changes nothing on disk (doc-5 §5).
        cli.push_failure(1, "task complete: task is not Done");

        let result = state
            .guarded_update(
                &[UpdateOperation::TaskComplete {
                    task_id: "TASK-1".to_string(),
                }],
                &model,
                &temp.path,
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

    // --- review round 1 [P2]: targets are derived inside the boundary ----------------------------

    #[test]
    fn the_conflict_target_is_derived_from_the_operation_and_model() {
        let temp = minimal_root();
        temp.write("docs/doc-1 - d.md", "---\nid: doc-1\ntitle: d\n---\nbody\n");
        let source = WorkingTree::new(&temp.path);
        let (model, _state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();

        // An operation naming an existing task resolves to that task's file — the caller cannot
        // supply (or omit) it, so the check cannot be bypassed.
        assert_eq!(
            operation_target(&status_edit("Done"), &model),
            TargetResolution::Checkable(task_path(&temp))
        );
        assert_eq!(
            operation_target(
                &UpdateOperation::TaskArchive {
                    task_id: "TASK-1".to_string()
                },
                &model
            ),
            TargetResolution::Checkable(task_path(&temp))
        );
        // A document update resolves too, now that the model carries its path (round-2 fix): without
        // it, `doc update --content` would full-replace an externally edited document unchecked.
        assert_eq!(
            operation_target(
                &UpdateOperation::DocUpdate {
                    doc_id: "doc-1".to_string(),
                    update: crate::update::DocUpdate {
                        content: Some("replaced".to_string()),
                        ..Default::default()
                    },
                },
                &model
            ),
            TargetResolution::Checkable(temp.path.join("docs").join("doc-1 - d.md"))
        );
        // A create writes a new file: nothing read, nothing to conflict with.
        assert_eq!(
            operation_target(
                &UpdateOperation::TaskCreate(crate::update::TaskCreate {
                    title: "new".to_string(),
                    ..Default::default()
                }),
                &model
            ),
            TargetResolution::NoExistingFile
        );
        // An id absent from the model cannot be checked, so it must NOT look like a create.
        assert!(matches!(
            operation_target(
                &UpdateOperation::TaskEdit {
                    task_id: "TASK-404".to_string(),
                    edit: TaskEdit {
                        status: Some("Done".to_string()),
                        ..Default::default()
                    },
                },
                &model
            ),
            TargetResolution::Unresolvable { .. }
        ));
        // Milestone rename/remove fan out to every referencing task file, which doc-9 §4 does not
        // define a check for — refused rather than run unchecked.
        for op in [
            UpdateOperation::MilestoneRename {
                from: "m-1".to_string(),
                to: "Phase 1".to_string(),
                update_tasks: true,
            },
            UpdateOperation::MilestoneRemove {
                name: "m-1".to_string(),
                task_handling: crate::update::MilestoneTaskHandling::Clear,
            },
            UpdateOperation::MilestoneArchive {
                name: "m-1".to_string(),
            },
        ] {
            assert!(
                matches!(
                    operation_target(&op, &model),
                    TargetResolution::Unresolvable { .. }
                ),
                "{op:?} must not be treated as checkable or as a create"
            );
        }
    }

    // Round-2 [P2] regression: an unresolved *mutating* target must be refused before launch, not
    // waved through like a create.
    #[test]
    fn an_unknown_task_id_is_refused_without_launching_the_cli() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        let err = state
            .guarded_update(
                &[UpdateOperation::TaskEdit {
                    task_id: "TASK-404".to_string(),
                    edit: TaskEdit {
                        status: Some("Done".to_string()),
                        ..Default::default()
                    },
                }],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap_err();

        assert!(
            matches!(err, GuardError::UncheckableTarget { .. }),
            "got {err:?}"
        );
        assert!(
            cli.action_calls().is_empty(),
            "an unverifiable target must not reach the CLI"
        );
    }

    // Round-2 [P2] regression: the reviewer's concrete example — `doc update --content` full-replaces
    // a body, so an externally edited document must be a conflict, not an unchecked overwrite.
    #[test]
    fn an_externally_changed_document_is_a_conflict_and_does_not_launch_the_cli() {
        let temp = minimal_root();
        temp.write(
            "docs/doc-1 - d.md",
            "---\nid: doc-1\ntitle: d\n---\noriginal\n",
        );
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        // Someone edits the document after Atlas read it.
        temp.write(
            "docs/doc-1 - d.md",
            "---\nid: doc-1\ntitle: d\n---\nedited elsewhere\n",
        );

        let result = state
            .guarded_update(
                &[UpdateOperation::DocUpdate {
                    doc_id: "doc-1".to_string(),
                    update: crate::update::DocUpdate {
                        content: Some("my replacement".to_string()),
                        ..Default::default()
                    },
                }],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Conflict { path, .. } => {
                assert!(path.ends_with("doc-1 - d.md"), "got {path:?}");
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
        assert!(cli.action_calls().is_empty());
        // The external edit survives: nothing overwrote it.
        assert!(
            std::fs::read_to_string(temp.path.join("docs").join("doc-1 - d.md"))
                .unwrap()
                .contains("edited elsewhere")
        );
    }

    #[test]
    fn a_milestone_fanout_operation_is_refused_rather_than_run_unchecked() {
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        let err = state
            .guarded_update(
                &[UpdateOperation::MilestoneRename {
                    from: "m-1".to_string(),
                    to: "Phase 1".to_string(),
                    update_tasks: true,
                }],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap_err();

        assert!(
            matches!(err, GuardError::UncheckableTarget { .. }),
            "got {err:?}"
        );
        assert!(cli.action_calls().is_empty());
    }

    #[test]
    fn an_edit_to_a_diverged_task_is_guarded_even_across_several_operations() {
        // The guard walks every operation's derived target, so a diverged file named by the *second*
        // operation still withholds the launch (all-or-nothing, doc-5 §5).
        let temp = minimal_root();
        temp.write("tasks/task-2 - b.md", &task_file("TASK-2", "To Do"));
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        // Only the SECOND operation's target changes externally.
        temp.write("tasks/task-2 - b.md", &task_file("TASK-2", "In Progress"));

        let result = state
            .guarded_update(
                &[
                    status_edit("Done"),
                    UpdateOperation::TaskEdit {
                        task_id: "TASK-2".to_string(),
                        edit: TaskEdit {
                            status: Some("Done".to_string()),
                            ..Default::default()
                        },
                    },
                ],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap();

        match result {
            GuardedUpdate::Conflict { path, .. } => {
                assert!(path.ends_with("task-2 - b.md"), "got {path:?}");
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
        assert!(
            cli.action_calls().is_empty(),
            "no operation may launch when any target diverged"
        );
    }

    // --- review round 1 [P2]: a reload failure must keep "the CLI already changed disk" -----------

    #[test]
    fn a_reload_failure_after_a_successful_update_reports_the_applied_outcome() {
        // The CLI succeeded, then the reload fails (the root became unreadable). The caller must be
        // able to tell this from "no CLI ran", or a retry could re-apply the update (doc-5 §6).
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);

        // Make the post-update reload fail: removing tasks/ is ルート読取不能 (doc-4 §5).
        std::fs::remove_file(task_path(&temp)).unwrap();
        std::fs::remove_dir(temp.path.join("tasks")).unwrap();

        let err = state
            .guarded_update(
                &[UpdateOperation::TaskCreate(crate::update::TaskCreate {
                    title: "new".to_string(),
                    ..Default::default()
                })],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap_err();

        match err {
            GuardError::Reload { applied, .. } => assert_eq!(
                applied,
                Some(UpdateOutcome::Succeeded),
                "the applied outcome must survive the reload failure so a retry is not treated as safe"
            ),
            other => panic!("expected Reload, got {other:?}"),
        }
    }

    #[test]
    fn a_reload_failure_after_a_conflict_reports_that_nothing_was_applied() {
        // The counterpart: the post-conflict reload failed, but no CLI ran, so a retry stays safe.
        let temp = minimal_root();
        let source = WorkingTree::new(&temp.path);
        let (model, mut state) = SyncState::initialize("atlas", &source, &FsVersions).unwrap();
        let cli = FakeCli::new();
        let cap = capability(&cli);
        cli.calls.borrow_mut().clear();

        // Diverge the target, then make the reload fail as well.
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "In Progress"));
        std::fs::remove_file(task_path(&temp)).unwrap();
        std::fs::remove_dir(temp.path.join("tasks")).unwrap();

        let err = state
            .guarded_update(
                &[status_edit("Done")],
                &model,
                &temp.path,
                &cap,
                &cli,
                &source,
                &FsVersions,
            )
            .unwrap_err();

        match err {
            GuardError::Reload { applied, .. } => assert_eq!(
                applied, None,
                "no CLI ran, so the caller must see that nothing was applied"
            ),
            other => panic!("expected Reload, got {other:?}"),
        }
        assert!(cli.action_calls().is_empty());
    }
}
