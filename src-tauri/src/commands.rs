//! Command boundary — the single place the Svelte frontend reaches the Rust core (decision-1,
//! implements TASK-33). Every layer below (ledger, read, interpretation, Git/PR history, update
//! adapter, same-root freshness) is a plain Rust API; this module is what makes them callable over
//! Tauri's IPC, and nothing else in the crate knows Tauri exists.
//!
//! ## Referent table (doc term → identifier here)
//!
//! Fixed before naming, following the read/update/sync modules' convention of mapping each doc term
//! to one identifier instead of inventing parallel vocabulary.
//!
//! | term | here | is |
//! |---|---|---|
//! | doc-4 ドメインモデル + doc-7 §4 列対応・Type | [`ProjectSnapshot`] | one root's model plus each task's interpretation (canonical-column status, Type) — the read commands' return value |
//! | doc-7 §6 ルート読取不能 / 読めた行 | [`ProjectLoad`] | one ledger entry's read outcome: a model, or the reason its row shows no cards |
//! | doc-9 §4 読取版指標を保持する単位 | [`ProjectSession`] / [`Workspace`] | one open root's model + read-version index, and the set of them keyed by slug |
//! | doc-9 §3 継続検出の提示 | [`PROJECT_RELOADED_EVENT`] | the event carrying a watch-triggered re-read to the frontend |
//! | doc-9 §4/§5 更新の結末 | [`UpdateResult`] | 更新前競合 (CLI never launched) vs. the CLI ran and returned a verdict |
//! | doc-5 §5 / decision-7 縮退 | [`CliReadiness`] | whether a supported `backlog` exists, i.e. whether the UI may offer edits at all |
//! | every layer's failure type | [`CommandError`] | one error type that keeps the core's distinctions (root unreadable / 対象不在 / 縮退 / 拒否 / 照合不能) intact |
//!
//! ## Read and update stay separate paths (AC #2)
//!
//! decision-2 splits reading (file analysis) from updating (Backlog CLI). The boundary keeps that
//! split in its *signatures*, so it cannot be lost by accident:
//!
//! - Read commands ([`Workspace::open`], [`Workspace::history`], the ledger and cross-task-id
//!   commands) take a [`ScanSource`] — or, for Git history, read Git directly. None of them names
//!   [`BacklogCli`], so no read can travel through the CLI.
//! - The update command ([`Workspace::apply`]) is the only one that takes a [`CliCapability`], which
//!   only [`update::probe`] can produce. A missing or too-old CLI therefore cannot reach an update:
//!   it is refused with [`CommandError::UpdatesUnavailable`] before anything runs (doc-5 §5 縮退).
//!
//! ## Every command is `(async)`
//!
//! Tauri runs a plain `#[tauri::command]` on the main thread, which is also the thread driving the
//! WebView's event loop. Every command here blocks: the ledger ones read and write a file, the read
//! ones scan whole Backlog roots, [`task_history_read`] and [`update_apply`] wait on subprocesses,
//! and [`project_close`] / [`project_watch_stop`] join a watch thread. On a real repository with a
//! slow CLI that would freeze the UI for the duration of an `invoke`.
//!
//! `(async)` moves the body to the async runtime instead. It is applied uniformly rather than to a
//! chosen few, because the split would have to be re-justified every time a command gains a call —
//! and none of these is cheap enough to be worth an exception. The bodies stay synchronous and hold
//! no lock across an `await` (there is none), so [`Workspace`]'s serialization is unchanged: the
//! mutex still admits one command at a time. The thread joins are bounded by [`WATCH_POLL`].
//!
//! ## Typed results, including the failures (AC #3)
//!
//! Nothing here collapses into a bare string. [`CommandError`] carries one variant per failure the
//! core distinguishes, so the UI can tell 対象不在 from 該当なし (doc-6 §6), ルート読取不能 from an
//! empty root (doc-7 §6), and — the distinction doc-9 §5 insists on — 照合不能
//! ([`CommandError::UncheckableTarget`], "we have no way to check whether the version diverged")
//! from 更新前競合 ([`UpdateResult::Conflict`], "we checked and it did diverge").

use crate::domain::{Config, Decision, Document, Milestone, ProjectModel, Task};
use crate::history::{self, Commit, HistoryError, PullRequestRef, RemoteHost};
use crate::interpret::{interpret_task, TaskInterpretation};
use crate::ledger::{
    Ledger, LedgerError, LoadedLedger, ParsedTaskRef, ProjectEntry, RegisterRequest, UpdateRequest,
};
use crate::read::scan::{ScanSource, WorkingTree};
use crate::read::RootError;
use crate::sync::{
    FileVersions, FsVersions, GuardError, GuardedUpdate, ReloadReason, SyncState, WatchSession,
};
use crate::update::{
    self, BacklogCli, CliCapability, CliStatus, SystemBacklog, UpdateOperation, UpdateOutcome,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

// --- wire types (AC #3/#5) ----------------------------------------------------------------------

/// One task as the frontend receives it: the read layer's faithful record, plus Atlas's
/// interpretation of it (AC #5). The two are side by side, never merged — [`crate::interpret`]
/// fixes that separation because the interpretation depends on the ledger's 別名表 while the task
/// is only what the file says, and a user editing an alias must be able to change one without the
/// other being rewritten.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    pub task: Task,
    /// 正規化済み status (canonical column + declaration) and Type values — TASK-29's output, put on
    /// the boundary here so the swimlane's column placement (doc-7 §4) needs no second rule.
    pub interpretation: TaskInterpretation,
}

/// One project as the frontend receives it: [`ProjectModel`] with every task paired with its
/// interpretation. Mirrors the model field for field rather than nesting it, so the frontend reads
/// `snapshot.tasks[i].interpretation` instead of zipping two parallel arrays.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub slug: String,
    pub config: Config,
    pub tasks: Vec<TaskView>,
    pub milestones: Vec<Milestone>,
    pub documents: Vec<Document>,
    pub decisions: Vec<Decision>,
}

impl ProjectSnapshot {
    /// Pair a model with its interpretation under the given 別名表. Interpretation is computed here,
    /// at the boundary, rather than cached in a session: aliases are a ledger attribute the user can
    /// change at any time, and re-interpreting a model already in memory is cheaper — and always
    /// current — compared with re-reading the root to pick up a new alias (doc-7 §4).
    fn build(model: &ProjectModel, aliases: &BTreeMap<String, String>) -> Self {
        ProjectSnapshot {
            slug: model.slug.clone(),
            tasks: model
                .tasks
                .iter()
                .map(|task| TaskView {
                    interpretation: interpret_task(task, &model.config, aliases),
                    task: task.clone(),
                })
                .collect(),
            config: model.config.clone(),
            milestones: model.milestones.clone(),
            documents: model.documents.clone(),
            decisions: model.decisions.clone(),
        }
    }
}

/// What became of one ledger entry when the workspace tried to read it. doc-7 §6 requires the row to
/// stay in place when its root cannot be read, showing the reason instead of cards — so a failing
/// root is a *value* in the list, not an error that replaces the whole list.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ProjectLoad {
    /// The root was read; `project.slug` names the row.
    Loaded { project: ProjectSnapshot },
    /// The root could not be read (doc-4 §5 ルート読取不能, or the entry itself was unusable).
    Unreadable { slug: String, error: CommandError },
}

/// Whether the write-side CLI can serve updates at all (doc-5 §5, decision-7). The frontend needs
/// this before it offers an edit control: without a supported `backlog`, Atlas is read-only, and
/// that is a normal degraded mode rather than an error to report after an edit fails.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum CliReadiness {
    Ready { version: String },
    Unavailable { detail: String },
    Unsupported { version: String, minimum: String },
}

impl From<CliStatus> for CliReadiness {
    fn from(status: CliStatus) -> Self {
        match status {
            CliStatus::Supported(capability) => CliReadiness::Ready {
                version: capability.version().to_string(),
            },
            CliStatus::Unavailable { detail } => CliReadiness::Unavailable { detail },
            CliStatus::Unsupported { version } => CliReadiness::Unsupported {
                version,
                minimum: update::MIN_VERSION.to_string(),
            },
        }
    }
}

/// One task's Git・Pull Request 履歴 (doc-6). `commits` empty means 該当なし — the repo was searched
/// and nothing matched — which [`CommandError::NotAGitRepo`] keeps distinct from 対象不在 (doc-6 §6).
///
/// `remote` is the owning project's determined remote host, i.e. the gate doc-6 §5/§6 puts in front
/// of commit⇄PR relation resolution. The relations themselves are absent on purpose: resolution needs
/// a `PrCommitSource`, and doc-6 §6 fixes only its *structure*, leaving each host's concrete
/// reference means (its API, auth, offline behaviour) to a later per-kind addition with its own
/// dependency decision. Exposing a relation list that is always empty would report "no shared commit"
/// (a resolved state) for a lookup that never happened, so the field arrives with the source.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskHistory {
    pub commits: Vec<Commit>,
    pub pull_requests: Vec<PullRequestRef>,
    pub remote: Option<RemoteHost>,
}

/// What became of one update request (doc-9 §4). Mirrors [`GuardedUpdate`]: the two states are kept
/// apart because doc-9 §5 presents them differently — a conflict is "your screen is stale, here is
/// the current root", a run is "the CLI answered".
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateResult {
    /// 更新前競合: a target diverged from the version Atlas read, so the CLI was never launched
    /// (doc-9 §4.1). `project` is the re-read root — an ordinary reload, not 縮退 (doc-9 §5).
    Conflict {
        path: PathBuf,
        project: ProjectSnapshot,
    },
    /// The CLI ran. `outcome` is its verdict (success, or a failure carrying stderr). `project` is
    /// present exactly when on-disk state moved and was re-read — a success, or a partial failure
    /// (doc-5 §6); a failure that changed nothing leaves it absent.
    Ran {
        outcome: UpdateOutcome,
        project: Option<ProjectSnapshot>,
    },
}

/// Every failure the boundary can return, with the core's distinctions preserved (AC #3). One
/// variant per failure case the layers below already keep apart; nothing is flattened into a string
/// the frontend would have to pattern-match on.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CommandError {
    /// The ledger file could not be located, read, or written, or an operation on it was refused
    /// (doc-3 §2.2 — includes the read-only guard on an unknown newer `schema_version`).
    Ledger { detail: String },
    /// ルート読取不能 (doc-4 §5): the root as a whole has no model. Per doc-7 §6 the project's row
    /// survives this, which is why it also appears as a [`ProjectLoad`] value.
    RootUnreadable { slug: String, detail: String },
    /// The slug is not in the ledger.
    UnknownProject { slug: String },
    /// The slug is registered but no session is open for it, so there is no model to read a task
    /// from and no read-version index to check an update against. The frontend opens it first.
    ProjectNotOpen { slug: String },
    /// The id is absent from the open model — including a 解析不能 file, which has no id to match.
    TaskNotFound { slug: String, task_id: String },
    /// Git 対象不在 (doc-6 §6): the project root is not a Git repository. Distinct from an empty
    /// commit list, which means the repo was searched and nothing matched (該当なし).
    NotAGitRepo { project_root: PathBuf },
    /// `git` could not be run, or a Git read failed for another reason.
    GitFailed { detail: String },
    /// 縮退 (doc-5 §5, decision-7): no supported `backlog`, so updates are not offered. Carries the
    /// probe result so the UI can say which of "not installed" and "too old" it is.
    UpdatesUnavailable { readiness: CliReadiness },
    /// The update adapter refused the action before launch — outside the confirmed CLI's capability,
    /// or nothing to change (doc-5 §5). Nothing ran and nothing changed.
    UpdateRejected { detail: String },
    /// 照合不能 (doc-9 §4.2): the operation rewrites a set of files whose check doc-9 does not
    /// define (the milestone 参照追随書き換え fan-out), so it is refused before launch. doc-9 §5
    /// requires this to be presented *differently* from a conflict: no version divergence was
    /// observed here — there is no defined way to look for one.
    UncheckableTarget { what: String, detail: String },
    /// A re-read failed. `applied` is the crux (doc-5 §6): `None` means no CLI ran and a retry is
    /// safe; `Some` means the update already landed and only the refresh failed, so a blind retry
    /// could duplicate a create or re-apply a transition.
    ReloadFailed {
        detail: String,
        applied: Option<UpdateOutcome>,
    },
    /// A target's version could not be read for a reason other than "gone" (e.g. a permission
    /// fault). Not a version verdict, so it is surfaced rather than assumed either way.
    VersionProbeFailed { detail: String },
    /// The file watch could not be started or is unavailable for this root; 継続検出 (doc-9 §3) is
    /// off for it until it is started again.
    WatchFailed { slug: String, detail: String },
}

impl From<LedgerError> for CommandError {
    fn from(error: LedgerError) -> Self {
        CommandError::Ledger {
            detail: error.to_string(),
        }
    }
}

impl CommandError {
    fn root_unreadable(slug: &str, error: RootError) -> Self {
        CommandError::RootUnreadable {
            slug: slug.to_string(),
            detail: error.to_string(),
        }
    }

    fn history(error: HistoryError, project_root: &Path) -> Self {
        match error {
            HistoryError::NotAGitRepo => CommandError::NotAGitRepo {
                project_root: project_root.to_path_buf(),
            },
            other => CommandError::GitFailed {
                detail: other.to_string(),
            },
        }
    }

    fn guard(error: GuardError) -> Self {
        match error {
            GuardError::Rejected(reason) => CommandError::UpdateRejected {
                detail: reason.to_string(),
            },
            GuardError::Reload { error, applied } => CommandError::ReloadFailed {
                detail: error.to_string(),
                applied,
            },
            GuardError::Probe(error) => CommandError::VersionProbeFailed {
                detail: error.to_string(),
            },
            GuardError::UncheckableTarget { what, detail } => CommandError::UncheckableTarget {
                what: what.to_string(),
                detail,
            },
        }
    }
}

// --- open projects (doc-9 §4) -------------------------------------------------------------------

/// One open Backlog root: the model the screen is showing, and the read-version index it was built
/// from. The two are kept together because doc-9 §4 only works when they refresh as a unit — a model
/// paired with a stale index would let a pre-update check pass against bytes nobody read.
#[derive(Debug)]
struct ProjectSession {
    model: ProjectModel,
    sync: SyncState,
}

/// Every open root, keyed by ledger slug. Holds no ledger state of its own: each method takes the
/// [`ProjectEntry`] the caller just read, so a root moved or re-aliased through the ledger commands
/// takes effect on the next call rather than needing the session to be invalidated.
#[derive(Debug, Default)]
pub struct Workspace {
    sessions: BTreeMap<String, ProjectSession>,
}

impl Workspace {
    /// Read a root and keep it open (doc-9 §4). Reopening an already-open root re-reads it through
    /// [`SyncState::reload`] rather than standing up a second [`SyncState`] beside the live one:
    /// TASK-32 AC #6 makes a new trigger a [`ReloadReason`] variant, not a second read path.
    pub fn open(
        &mut self,
        entry: &ProjectEntry,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<ProjectSnapshot, CommandError> {
        if let Some(session) = self.sessions.get_mut(&entry.slug) {
            session.model = session
                .sync
                .reload(ReloadReason::ManualRefresh, source, probe)
                .map_err(|e| CommandError::root_unreadable(&entry.slug, e))?;
            return Ok(ProjectSnapshot::build(
                &session.model,
                &entry.status_aliases,
            ));
        }
        let (model, sync) = SyncState::initialize(&entry.slug, source, probe)
            .map_err(|e| CommandError::root_unreadable(&entry.slug, e))?;
        let snapshot = ProjectSnapshot::build(&model, &entry.status_aliases);
        self.sessions
            .insert(entry.slug.clone(), ProjectSession { model, sync });
        Ok(snapshot)
    }

    /// Re-read an open root and return the refreshed snapshot (doc-9 §3 継続検出 / doc-5 §6). The
    /// caller names the trigger; every one funnels through the same [`SyncState::reload`].
    pub fn reload(
        &mut self,
        entry: &ProjectEntry,
        reason: ReloadReason,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<ProjectSnapshot, CommandError> {
        let session = self.session_mut(&entry.slug)?;
        session.model = session
            .sync
            .reload(reason, source, probe)
            .map_err(|e| CommandError::root_unreadable(&entry.slug, e))?;
        Ok(ProjectSnapshot::build(
            &session.model,
            &entry.status_aliases,
        ))
    }

    /// Drop an open root. Returns whether one was open; closing a closed root is not an error.
    pub fn close(&mut self, slug: &str) -> bool {
        self.sessions.remove(slug).is_some()
    }

    /// One task's Git・Pull Request 履歴 (doc-6). The task's References come from the open model —
    /// PR URLs are read from the task, never guessed — and the commit search runs in the owning
    /// project's repository (doc-6 §3, AGENTS §"Git and Pull Request references").
    pub fn history(
        &self,
        entry: &ProjectEntry,
        task_id: &str,
    ) -> Result<TaskHistory, CommandError> {
        let session = self.session(&entry.slug)?;
        let task = session
            .model
            .task(task_id)
            .ok_or_else(|| CommandError::TaskNotFound {
                slug: entry.slug.clone(),
                task_id: task_id.to_string(),
            })?;
        let commits = history::search_commits(&entry.project_root, task_id)
            .map_err(|e| CommandError::history(e, &entry.project_root))?;
        Ok(TaskHistory {
            commits,
            pull_requests: history::extract_pull_requests(&task.references),
            remote: history::detect_remote_host(entry),
        })
    }

    /// Run one screen action against an open root (doc-5 §5, doc-9 §4). The only method here that
    /// names a CLI, and it cannot be called without a [`CliCapability`] — the type-level form of
    /// "no supported CLI, no updates" (doc-5 AC #6).
    ///
    /// The check → run → reload sequence itself lives in [`SyncState::guarded_update`], which derives
    /// each operation's target from the model rather than from the caller, so "on conflict the CLI is
    /// not launched" cannot be bypassed from here.
    #[allow(clippy::too_many_arguments)]
    pub fn apply(
        &mut self,
        entry: &ProjectEntry,
        action: &[UpdateOperation],
        capability: &CliCapability,
        cli: &dyn BacklogCli,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<UpdateResult, CommandError> {
        // An action with no operation would run no invocation and then be reported as a success
        // (doc-5 §5 judges an action by its invocations' exit codes). Refusing it keeps "succeeded"
        // meaning "the CLI applied something", which is what the reload after it is predicated on.
        if action.is_empty() {
            return Err(CommandError::UpdateRejected {
                detail: "an update action must contain at least one operation".to_string(),
            });
        }
        let session = self.session_mut(&entry.slug)?;
        // Destructured so the guarded update can borrow the index mutably and the model immutably;
        // they are disjoint fields of one session, and pairing *these two* is the doc-9 §4 invariant.
        let ProjectSession { model, sync } = session;
        let guarded = sync
            .guarded_update(
                action,
                model,
                &entry.project_root,
                capability,
                cli,
                source,
                probe,
            )
            .map_err(CommandError::guard)?;
        match guarded {
            GuardedUpdate::Conflict {
                path,
                model: reloaded,
            } => {
                *model = reloaded;
                Ok(UpdateResult::Conflict {
                    path,
                    project: ProjectSnapshot::build(model, &entry.status_aliases),
                })
            }
            GuardedUpdate::Ran {
                outcome,
                model: reloaded,
            } => {
                let project = reloaded.map(|fresh| {
                    *model = fresh;
                    ProjectSnapshot::build(model, &entry.status_aliases)
                });
                Ok(UpdateResult::Ran { outcome, project })
            }
        }
    }

    fn session(&self, slug: &str) -> Result<&ProjectSession, CommandError> {
        self.sessions
            .get(slug)
            .ok_or_else(|| CommandError::ProjectNotOpen {
                slug: slug.to_string(),
            })
    }

    fn session_mut(&mut self, slug: &str) -> Result<&mut ProjectSession, CommandError> {
        self.sessions
            .get_mut(slug)
            .ok_or_else(|| CommandError::ProjectNotOpen {
                slug: slug.to_string(),
            })
    }
}

// --- file watch → frontend (doc-9 §3) -----------------------------------------------------------

/// The event a watch-triggered re-read is delivered on. Payload is a [`ReloadEvent`].
pub const PROJECT_RELOADED_EVENT: &str = "project-reloaded";

/// Quiet window for coalescing a burst of OS notifications into one re-read (doc-9 §3 短い時間窓).
/// Long enough that one `backlog` invocation's several file writes land in a single batch, short
/// enough that an external edit shows up while the user is still looking at the screen.
const WATCH_WINDOW: Duration = Duration::from_millis(250);

/// How often the watch loop returns from waiting to notice a stop request. The receiver has no
/// select, so stopping is a flag checked between waits rather than an interrupt.
const WATCH_POLL: Duration = Duration::from_millis(200);

/// One root's re-read, pushed to the frontend after an external change (doc-9 §3 継続検出). Carries a
/// [`ProjectLoad`] rather than a snapshot alone because a root can become unreadable *by* the
/// external change — a config.yml saved mid-edit — and doc-7 §6 wants that shown on the row, not
/// dropped.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReloadEvent {
    pub slug: String,
    pub load: ProjectLoad,
}

/// A running watch. Dropping the handle does not stop the thread; [`stop_watch`] does, which is why
/// the registry hands the handle out rather than dropping it in place.
struct WatchHandle {
    stop: Arc<AtomicBool>,
    thread: std::thread::JoinHandle<()>,
}

/// Everything the boundary keeps between commands. Two independent locks: a watch thread needs the
/// workspace while it reloads, so holding the watch lock across a workspace lock (or the reverse)
/// would deadlock. Every call site takes one at a time — see [`project_close`].
#[derive(Default)]
pub struct AtlasState {
    workspace: Mutex<Workspace>,
    watches: Mutex<BTreeMap<String, WatchHandle>>,
}

/// Lock a state mutex, recovering a poisoned one. A panic in one command must not turn every later
/// command into a panic: what these mutexes guard is a registry of open roots, and the worst a
/// poisoned lock can leave behind is a model one reload out of date — which the next reload fixes.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Watch one root and push each debounced batch to the frontend as a re-read (doc-9 §3). Both batch
/// shapes lead to the same whole-root re-read: the reconstruction unit is the root (decision-3,
/// doc-4), so a known changed-file list and a `Rescan` differ only in what the watcher could tell us,
/// not in what must be re-read.
fn watch_loop(app: AppHandle, slug: String, session: WatchSession, stop: Arc<AtomicBool>) {
    use std::sync::mpsc::RecvTimeoutError;

    while !stop.load(Ordering::Relaxed) {
        match session.batches().recv_timeout(WATCH_POLL) {
            Ok(_batch) => {
                let load = reload_for_watch(&app, &slug);
                let event = ReloadEvent {
                    slug: slug.clone(),
                    load,
                };
                // A failed emit means the window is gone; there is nobody left to tell.
                let _ = app.emit(PROJECT_RELOADED_EVENT, event);
            }
            Err(RecvTimeoutError::Timeout) => continue,
            // The debounce thread ended (its watcher was dropped): no further batch can arrive.
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

/// Re-read a root for the watch, as a [`ProjectLoad`] so a root that just became unreadable is
/// reported on its row instead of silently ending the watch (doc-7 §6).
fn reload_for_watch(app: &AppHandle, slug: &str) -> ProjectLoad {
    // The ledger is re-read per batch rather than captured when the watch started: 別名表 is a ledger
    // attribute the user may change while the watch runs (doc-3 §3.3), and the interpretation this
    // event carries has to use the current table.
    let entry = match entry_for(app, slug) {
        Ok(entry) => entry,
        Err(error) => {
            return ProjectLoad::Unreadable {
                slug: slug.to_string(),
                error,
            }
        }
    };
    let source = WorkingTree::new(&entry.backlog_root);
    let state = app.state::<AtlasState>();
    let mut workspace = lock(&state.workspace);
    match workspace.reload(&entry, ReloadReason::ExternalChange, &source, &FsVersions) {
        Ok(project) => ProjectLoad::Loaded { project },
        Err(error) => ProjectLoad::Unreadable {
            slug: slug.to_string(),
            error,
        },
    }
}

/// Stop a watch and wait for its thread. Callers must not hold the workspace lock here: the thread
/// may be inside a reload that needs it, and joining while holding it would deadlock.
fn stop_watch(handle: WatchHandle) {
    handle.stop.store(true, Ordering::Relaxed);
    let _ = handle.thread.join();
}

// --- ledger plumbing ----------------------------------------------------------------------------

/// Resolve the single ledger file under the OS app-config dir (doc-3 §2.1). The ledger is Atlas's
/// own config and never lives inside any project's Backlog root.
fn ledger_path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::Ledger {
            detail: format!("the application config directory could not be resolved: {e}"),
        })?;
    Ok(dir.join("projects.toml"))
}

fn load_ledger(app: &AppHandle) -> Result<LoadedLedger, CommandError> {
    let path = ledger_path(app)?;
    Ok(LoadedLedger::load(&path)?)
}

/// The ledger entry for `slug`, cloned so no ledger borrow outlives the lookup.
fn entry_for(app: &AppHandle, slug: &str) -> Result<ProjectEntry, CommandError> {
    load_ledger(app)?
        .ledger
        .projects
        .iter()
        .find(|entry| entry.slug == slug)
        .cloned()
        .ok_or_else(|| CommandError::UnknownProject {
            slug: slug.to_string(),
        })
}

/// What every ledger command returns: the ledger plus its compatibility state. `read_only` is true
/// when the on-disk `schema_version` is newer than this build understands (doc-3 §2.2) — the UI must
/// disable ledger edits then, so the flag travels with the ledger rather than being discoverable
/// only after a save fails.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerResponse {
    pub ledger: Ledger,
    pub read_only: bool,
}

impl From<LoadedLedger> for LedgerResponse {
    fn from(loaded: LoadedLedger) -> Self {
        LedgerResponse {
            ledger: loaded.ledger,
            read_only: loaded.read_only,
        }
    }
}

/// Load the ledger, apply `op`, save, and return the resulting state. The read-only guard in
/// `LoadedLedger::save` keeps an unknown newer file from being clobbered, so a mutating command
/// against a read-only ledger fails at save rather than here.
/// `op` returns whatever the caller needs to observe about the mutation — the value comes back
/// alongside the saved state, so a command can compare the entry before and after without re-reading
/// the file it just wrote.
fn mutate_ledger<F, T>(app: &AppHandle, op: F) -> Result<(T, LedgerResponse), CommandError>
where
    F: FnOnce(&mut Ledger) -> Result<T, LedgerError>,
{
    let path = ledger_path(app)?;
    let mut loaded = LoadedLedger::load(&path)?;
    let observed = op(&mut loaded.ledger)?;
    loaded.save(&path)?;
    Ok((observed, loaded.into()))
}

// --- commands: ledger (doc-3) -------------------------------------------------------------------

#[tauri::command(async)]
pub fn ledger_list(app: AppHandle) -> Result<LedgerResponse, CommandError> {
    Ok(load_ledger(&app)?.into())
}

#[tauri::command(async)]
pub fn ledger_register(
    app: AppHandle,
    request: RegisterRequest,
) -> Result<LedgerResponse, CommandError> {
    Ok(mutate_ledger(&app, |ledger| ledger.register(&request).map(|_| ()))?.1)
}

/// Remove a project from the ledger and let go of it: an unregistered project must not keep a watch
/// running or a session open against a root Atlas no longer manages.
#[tauri::command(async)]
pub fn ledger_remove(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
) -> Result<LedgerResponse, CommandError> {
    let (_, response) = mutate_ledger(&app, |ledger| ledger.remove(&slug).map(|_| ()))?;
    close_project(&state, &slug);
    Ok(response)
}

/// The roots an open session and its watch are bound to. `None` when the ledger has no such entry —
/// which, compared against a post-update entry, reads as "moved" and is the safe answer either way.
fn entry_roots(ledger: &Ledger, slug: &str) -> Option<(PathBuf, PathBuf)> {
    ledger
        .projects
        .iter()
        .find(|entry| entry.slug == slug)
        .map(|entry| (entry.project_root.clone(), entry.backlog_root.clone()))
}

/// Update a ledger entry, and let go of the open root when the update moved it. A session pairs a
/// model with the read-version index it was built from (doc-9 §4), and both are bound to the roots
/// the entry had when it was opened — while a watch is bound to that `backlog_root`. `Ledger::update`
/// can change both roots at once (doc-3 §4.3), and the slug that keys the session stays the same, so
/// nothing else would notice: the next `update_apply` would version-check the *old* root's file and
/// then run the CLI in the *new* `project_root`, letting an edit pass the doc-9 §4 check against
/// unrelated bytes and overwrite a task that changed underneath it. The watch would likewise keep
/// reporting the root the project no longer lives in.
///
/// Closing is the honest response rather than re-initializing in place: a moved root is a different
/// set of files, so there is no model to refresh — the frontend reopens the project and gets a read
/// that never mixes the two. Only a move triggers it; an alias-only edit leaves the session alone,
/// because the interpretation is computed per call and picks the new table up without a re-read.
#[tauri::command(async)]
pub fn ledger_update(
    app: AppHandle,
    state: State<'_, AtlasState>,
    request: UpdateRequest,
) -> Result<LedgerResponse, CommandError> {
    let (moved, response) = mutate_ledger(&app, |ledger| {
        let before = entry_roots(ledger, &request.slug);
        let after = ledger.update(&request)?;
        Ok(before != Some((after.project_root, after.backlog_root)))
    })?;
    if moved {
        close_project(&state, &request.slug);
    }
    Ok(response)
}

/// Build a cross-task-id `<slug>:<TASK-ID>` for display (doc-3 §5.1). Validates the slug against the
/// live ledger and the id against `task_prefix`, so it can only produce ids the parser accepts;
/// `task_prefix` is resolved by the caller from the referenced project's config.yml.
#[tauri::command(async)]
pub fn cross_task_id_generate(
    app: AppHandle,
    slug: String,
    task_id: String,
    task_prefix: String,
) -> Result<String, CommandError> {
    Ok(load_ledger(&app)?
        .ledger
        .generate_cross_task_id(&slug, &task_id, &task_prefix)?)
}

/// Parse a cross-task-id (doc-3 §5.2). Validates the left slug against the live ledger and the right
/// side against `task_prefix`; `context_slug` permits a bare id in a single-project context.
#[tauri::command(async)]
pub fn cross_task_id_parse(
    app: AppHandle,
    input: String,
    task_prefix: String,
    context_slug: Option<String>,
) -> Result<ParsedTaskRef, CommandError> {
    Ok(load_ledger(&app)?.ledger.parse_cross_task_id(
        &input,
        &task_prefix,
        context_slug.as_deref(),
    )?)
}

// --- commands: read path (decision-2, AC #2/#5) -------------------------------------------------

/// Open every registered project (doc-7 §2: rows are projects). A root that cannot be read yields
/// [`ProjectLoad::Unreadable`] for its own row and leaves the others untouched — doc-7 §6 keeps the
/// row, and doc-4 §5 confines ルート読取不能 to the root it happened in.
#[tauri::command(async)]
pub fn workspace_open(
    app: AppHandle,
    state: State<'_, AtlasState>,
) -> Result<Vec<ProjectLoad>, CommandError> {
    let ledger = load_ledger(&app)?.ledger;
    let mut workspace = lock(&state.workspace);
    Ok(ledger
        .projects
        .iter()
        .map(|entry| {
            let source = WorkingTree::new(&entry.backlog_root);
            match workspace.open(entry, &source, &FsVersions) {
                Ok(project) => ProjectLoad::Loaded { project },
                Err(error) => ProjectLoad::Unreadable {
                    slug: entry.slug.clone(),
                    error,
                },
            }
        })
        .collect())
}

/// Read one root and keep it open. Also the retry path for a root that failed to read (doc-7 §6) and
/// the manual refresh for one already open.
#[tauri::command(async)]
pub fn project_open(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
) -> Result<ProjectSnapshot, CommandError> {
    let entry = entry_for(&app, &slug)?;
    let source = WorkingTree::new(&entry.backlog_root);
    lock(&state.workspace).open(&entry, &source, &FsVersions)
}

/// Close one root: stop its watch and drop its session and read-version index.
#[tauri::command(async)]
pub fn project_close(state: State<'_, AtlasState>, slug: String) {
    close_project(&state, &slug);
}

/// Stop the watch first, then drop the session — and never hold both locks at once, because the
/// watch thread takes the workspace lock while reloading (see [`AtlasState`]).
fn close_project(state: &AtlasState, slug: &str) {
    let handle = lock(&state.watches).remove(slug);
    if let Some(handle) = handle {
        stop_watch(handle);
    }
    lock(&state.workspace).close(slug);
}

/// Start 継続検出 for one root (doc-9 §3): subscribe to its OS change notifications and push each
/// debounced re-read to the frontend on [`PROJECT_RELOADED_EVENT`]. Read-only — the watch never
/// writes. Starting a watch that is already running is a no-op, so the frontend can call it
/// idempotently after an open.
#[tauri::command(async)]
pub fn project_watch_start(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
) -> Result<(), CommandError> {
    let entry = entry_for(&app, &slug)?;
    let mut watches = lock(&state.watches);
    if watches.contains_key(&slug) {
        return Ok(());
    }
    let session = WatchSession::start(&entry.backlog_root, WATCH_WINDOW).map_err(|e| {
        CommandError::WatchFailed {
            slug: slug.clone(),
            detail: e.to_string(),
        }
    })?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread = std::thread::spawn({
        let app = app.clone();
        let slug = slug.clone();
        let stop = Arc::clone(&stop);
        move || watch_loop(app, slug, session, stop)
    });
    watches.insert(slug, WatchHandle { stop, thread });
    Ok(())
}

/// Stop 継続検出 for one root, leaving its session open. The workspace lock is deliberately not held
/// while the thread is joined (see [`AtlasState`]).
#[tauri::command(async)]
pub fn project_watch_stop(state: State<'_, AtlasState>, slug: String) {
    let handle = lock(&state.watches).remove(&slug);
    if let Some(handle) = handle {
        stop_watch(handle);
    }
}

/// One task's commits and Pull Request URLs (doc-6). Read-only: `git log` and `git remote` with fixed
/// argument arrays, never a shell string (AGENTS).
#[tauri::command(async)]
pub fn task_history_read(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
    task_id: String,
) -> Result<TaskHistory, CommandError> {
    let entry = entry_for(&app, &slug)?;
    lock(&state.workspace).history(&entry, &task_id)
}

// --- commands: update path (decision-2, doc-5, AC #2/#4) ----------------------------------------

/// Probe the write-side CLI (doc-5 §3.2, decision-7). Probed on demand rather than cached at startup:
/// a `backlog` installed or upgraded while Atlas is running must take effect without a restart, and
/// the cost is one `--version` process.
#[tauri::command(async)]
pub fn cli_probe() -> CliReadiness {
    update::probe(&SystemBacklog).into()
}

/// Run one screen action against a project (doc-5 §5, doc-9 §4). `action` is a sequence of 更新操作
/// executed as a unit: it is deserialized straight into [`UpdateOperation`], the core's fixed
/// interface, and every user-supplied value reaches the CLI as one element of an argument array
/// (AC #4). No string is built here — there is no code path between the deserialized value and
/// `Command::args` that could concatenate one.
#[tauri::command(async)]
pub fn update_apply(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
    action: Vec<UpdateOperation>,
) -> Result<UpdateResult, CommandError> {
    let entry = entry_for(&app, &slug)?;
    let cli = SystemBacklog;
    // 縮退 (doc-5 §5): without a supported CLI there is no capability to hand `apply`, so the update
    // is refused here — the type below cannot be constructed any other way.
    let capability = match update::probe(&cli) {
        CliStatus::Supported(capability) => capability,
        other => {
            return Err(CommandError::UpdatesUnavailable {
                readiness: other.into(),
            })
        }
    };
    let source = WorkingTree::new(&entry.backlog_root);
    lock(&state.workspace).apply(&entry, &action, &capability, &cli, &source, &FsVersions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::status::StatusColumn;
    use crate::update::{CliRun, TaskCreate, TaskEdit};
    use std::cell::RefCell;
    use std::sync::atomic::AtomicU64;
    use std::time::SystemTime;

    // `Doing` is declared as a project-specific status: TASK-29 only lets a 別名表 entry map a
    // status config.yml actually declares, so an alias test needs it here.
    const CONFIG: &str = "project_name: Atlas\n\
statuses: [\"To Do\", \"Doing\", \"In Progress\", \"Done\"]\n\
task_prefix: \"TASK\"\n";

    /// A self-cleaning temp dir, mirroring the read and sync layers' helper so these tests need no
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
                "atlas-commands-test-{}-{nanos}-{n}",
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

    fn task_file(id: &str, status: &str, labels: &str) -> String {
        format!(
            "---\n\
id: {id}\n\
title: Task {id}\n\
status: {status}\n\
labels: {labels}\n\
ordinal: 1000\n\
---\n\n"
        )
    }

    /// A root with one active task, plus the ledger entry pointing at it.
    fn root() -> (TempDir, ProjectEntry) {
        let temp = TempDir::new();
        temp.write("backlog/config.yml", CONFIG);
        temp.write(
            "backlog/tasks/task-1 - a.md",
            &task_file("TASK-1", "Doing", "[\"kind:feature\", \"ui\"]"),
        );
        let entry = ProjectEntry {
            slug: "atlas".to_string(),
            project_root: temp.path.clone(),
            backlog_root: temp.path.join("backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };
        (temp, entry)
    }

    fn source(entry: &ProjectEntry) -> WorkingTree {
        WorkingTree::new(&entry.backlog_root)
    }

    /// A `BacklogCli` that records every argument array it is handed.
    #[derive(Default)]
    struct FakeCli {
        calls: RefCell<Vec<Vec<String>>>,
    }

    impl BacklogCli for FakeCli {
        fn run(&self, _dir: Option<&Path>, args: &[String]) -> std::io::Result<CliRun> {
            self.calls.borrow_mut().push(args.to_vec());
            let stdout = if args == ["--version"] { "1.47.1" } else { "" };
            Ok(CliRun {
                success: true,
                code: Some(0),
                stdout: stdout.to_string(),
                stderr: String::new(),
            })
        }
    }

    fn capability(cli: &FakeCli) -> CliCapability {
        match update::probe(cli) {
            CliStatus::Supported(capability) => capability,
            other => panic!("expected a supported CLI, got {other:?}"),
        }
    }

    // --- AC #5: normalized status and Type reach the boundary ----------------------------------

    #[test]
    fn snapshot_pairs_every_task_with_its_interpretation() {
        let (_temp, mut entry) = root();
        // `Doing` is a project-specific status declared in config.yml, mapped to the canonical
        // In Progress column by the ledger's 別名表 (decision-4).
        entry
            .status_aliases
            .insert("Doing".into(), "In Progress".into());
        let mut workspace = Workspace::default();
        let snapshot = workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        assert_eq!(snapshot.tasks.len(), 1);
        let view = &snapshot.tasks[0];
        assert_eq!(view.task.id.as_deref(), Some("TASK-1"));
        let status = view.interpretation.status.as_ref().unwrap();
        assert_eq!(status.column, Some(StatusColumn::InProgress));
        // Type is derived from the kind label and stays out of the normal label list (decision-5).
        assert_eq!(view.interpretation.types.values()[0].value, "feature");
        assert_eq!(view.task.labels, vec!["ui".to_string()]);
    }

    #[test]
    fn snapshot_reaches_the_wire_as_camel_case() {
        let (_temp, entry) = root();
        let mut workspace = Workspace::default();
        let snapshot = workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();
        let json = serde_json::to_value(&snapshot).unwrap();

        assert_eq!(json["slug"], "atlas");
        assert_eq!(json["config"]["taskPrefix"], "TASK");
        assert_eq!(json["tasks"][0]["task"]["storageState"], "active");
        assert_eq!(
            json["tasks"][0]["interpretation"]["types"][0]["value"],
            "feature"
        );
    }

    // --- reopening goes through the one reload path (TASK-32 AC #6) -----------------------------

    #[test]
    fn reopening_an_open_project_re_reads_it() {
        let (temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        temp.write(
            "backlog/tasks/task-2 - b.md",
            &task_file("TASK-2", "To Do", "[]"),
        );
        let snapshot = workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();
        assert_eq!(snapshot.tasks.len(), 2);
    }

    #[test]
    fn an_unreadable_root_is_reported_as_such() {
        let temp = TempDir::new();
        std::fs::create_dir_all(temp.path.join("backlog")).unwrap();
        let entry = ProjectEntry {
            slug: "broken".to_string(),
            project_root: temp.path.clone(),
            backlog_root: temp.path.join("backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };
        let error = Workspace::default()
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap_err();
        assert!(matches!(
            error,
            CommandError::RootUnreadable { ref slug, .. } if slug == "broken"
        ));
    }

    #[test]
    fn a_closed_project_cannot_be_updated_or_read_for_history() {
        let (_temp, entry) = root();
        let workspace = Workspace::default();
        assert!(matches!(
            workspace.history(&entry, "TASK-1").unwrap_err(),
            CommandError::ProjectNotOpen { .. }
        ));
    }

    // --- AC #4: user input travels as argument-array elements, never a shell string --------------

    #[test]
    fn user_input_reaches_the_cli_as_one_argument_element() {
        let (_temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // Everything a shell would act on, in one title: quoting, command substitution, a separator,
        // a newline, a glob.
        let hostile = "a\"; rm -rf / #\n$(whoami) `id` *";
        let cli = FakeCli::default();
        let capability = capability(&cli);
        let action = vec![UpdateOperation::TaskCreate(TaskCreate {
            title: hostile.to_string(),
            ..TaskCreate::default()
        })];
        workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap();

        let calls = cli.calls.borrow();
        let create = calls
            .iter()
            .find(|args| args.first().map(String::as_str) == Some("task"))
            .expect("the create was launched");
        // The title is exactly one element, verbatim — not spliced into a longer string, and no
        // element holds the whole command line.
        assert_eq!(create.iter().filter(|a| *a == hostile).count(), 1);
        assert!(create.iter().all(|a| a == hostile || !a.contains("rm -rf")));
    }

    #[test]
    fn an_operation_deserializes_from_the_frontend_wire_shape() {
        // The shape the frontend sends: tagged `op`, camelCase fields, only the facets it changed.
        let json = serde_json::json!({
            "op": "taskEdit",
            "taskId": "TASK-1",
            "edit": {
                "status": "In Progress",
                "notes": { "mode": "append", "text": "note\nwith newline" },
                "addLabels": ["kind:bug"],
                "ac": { "mode": "delta", "check": [1] }
            }
        });
        let op: UpdateOperation = serde_json::from_value(json).unwrap();
        let UpdateOperation::TaskEdit { task_id, edit } = op else {
            panic!("expected a task edit");
        };
        assert_eq!(task_id, "TASK-1");
        assert_eq!(edit.status.as_deref(), Some("In Progress"));
        assert_eq!(edit.add_labels, vec!["kind:bug".to_string()]);
        // Untouched facets stay untouched rather than becoming empty values.
        assert!(edit.title.is_none());
        assert!(edit.references.is_none());
    }

    // --- AC #3: conflict, refusal and 照合不能 are distinct typed results ------------------------

    #[test]
    fn a_diverged_target_withholds_the_cli_and_returns_a_conflict() {
        let (temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // An external write after the read: the recorded version no longer matches the file.
        temp.write(
            "backlog/tasks/task-1 - a.md",
            &task_file("TASK-1", "Done", "[\"kind:feature\", \"ui\"]"),
        );

        let cli = FakeCli::default();
        let capability = capability(&cli);
        let action = vec![UpdateOperation::TaskEdit {
            task_id: "TASK-1".to_string(),
            edit: TaskEdit {
                status: Some("Done".to_string()),
                ..TaskEdit::default()
            },
        }];
        let result = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap();

        let UpdateResult::Conflict { path, project } = result else {
            panic!("expected a conflict");
        };
        assert!(path.ends_with("task-1 - a.md"));
        // The conflict carries the re-read root, so the screen can show what is actually there.
        assert_eq!(project.tasks[0].task.status.as_deref(), Some("Done"));
        // Only the version probe ran; no `task edit` was launched (doc-9 §4.1).
        assert!(cli
            .calls
            .borrow()
            .iter()
            .all(|args| args == &["--version".to_string()]));
    }

    #[test]
    fn an_uncheckable_target_is_not_reported_as_a_conflict() {
        let (_temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let cli = FakeCli::default();
        let capability = capability(&cli);
        // A milestone rename rewrites every task referencing it, and doc-9 §4 defines no check for
        // that fan-out — refused before launch, and doc-9 §5 requires it to read differently from a
        // conflict: no divergence was observed, there is no defined way to look for one.
        let action = vec![UpdateOperation::MilestoneRename {
            from: "m-1".to_string(),
            to: "m-2".to_string(),
            update_tasks: true,
        }];
        let error = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap_err();

        assert!(matches!(error, CommandError::UncheckableTarget { .. }));
        assert!(cli
            .calls
            .borrow()
            .iter()
            .all(|args| args == &["--version".to_string()]));
    }

    #[test]
    fn a_refused_operation_reports_the_refusal_not_a_failure() {
        let (_temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let cli = FakeCli::default();
        let capability = capability(&cli);
        // Emptying references is not something v1.47.1 can do (doc-5 §3.1): refused before launch.
        let action = vec![UpdateOperation::TaskEdit {
            task_id: "TASK-1".to_string(),
            edit: TaskEdit {
                references: Some(Vec::new()),
                ..TaskEdit::default()
            },
        }];
        let error = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap_err();
        assert!(matches!(error, CommandError::UpdateRejected { .. }));

        // An action with nothing in it is refused the same way: it would otherwise launch no
        // invocation and still be reported as a success.
        let error = workspace
            .apply(&entry, &[], &capability, &cli, &source(&entry), &FsVersions)
            .unwrap_err();
        assert!(matches!(error, CommandError::UpdateRejected { .. }));
    }

    #[test]
    fn a_successful_update_returns_the_re_read_root() {
        let (temp, entry) = root();
        let mut workspace = Workspace::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // The fake CLI reports success without touching files; the reload afterwards is real, so
        // writing the file here stands in for what the CLI would have written.
        struct WritingCli {
            temp_path: PathBuf,
            calls: RefCell<Vec<Vec<String>>>,
        }
        impl BacklogCli for WritingCli {
            fn run(&self, _dir: Option<&Path>, args: &[String]) -> std::io::Result<CliRun> {
                self.calls.borrow_mut().push(args.to_vec());
                if args != ["--version"] {
                    std::fs::write(
                        self.temp_path.join("backlog/tasks/task-1 - a.md"),
                        "---\nid: TASK-1\ntitle: Task TASK-1\nstatus: Done\nlabels: []\n---\n\n",
                    )?;
                }
                let stdout = if args == ["--version"] { "1.47.1" } else { "" };
                Ok(CliRun {
                    success: true,
                    code: Some(0),
                    stdout: stdout.to_string(),
                    stderr: String::new(),
                })
            }
        }
        let cli = WritingCli {
            temp_path: temp.path.clone(),
            calls: RefCell::new(Vec::new()),
        };
        let capability = match update::probe(&cli) {
            CliStatus::Supported(capability) => capability,
            other => panic!("expected a supported CLI, got {other:?}"),
        };
        let action = vec![UpdateOperation::TaskEdit {
            task_id: "TASK-1".to_string(),
            edit: TaskEdit {
                status: Some("Done".to_string()),
                ..TaskEdit::default()
            },
        }];
        let result = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap();

        let UpdateResult::Ran { outcome, project } = result else {
            panic!("expected the action to run");
        };
        assert_eq!(outcome, UpdateOutcome::Succeeded);
        // doc-5 §6: the CLI's result enters the model only by re-reading, so a success carries one.
        let project = project.expect("a success reloads the root");
        assert_eq!(project.tasks[0].task.status.as_deref(), Some("Done"));

        // The next update is checked against the *reloaded* version, so it is not a stale conflict.
        let result = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
            )
            .unwrap();
        assert!(matches!(result, UpdateResult::Ran { .. }));
    }

    // --- 縮退 and error wire shapes -------------------------------------------------------------

    #[test]
    fn an_unsupported_cli_degrades_to_read_only() {
        let readiness: CliReadiness = CliStatus::Unsupported {
            version: "1.40.0".to_string(),
        }
        .into();
        let json = serde_json::to_value(CommandError::UpdatesUnavailable { readiness }).unwrap();
        assert_eq!(json["kind"], "updatesUnavailable");
        assert_eq!(json["readiness"]["state"], "unsupported");
        assert_eq!(
            json["readiness"]["minimum"],
            update::MIN_VERSION.to_string()
        );
    }

    #[test]
    fn errors_carry_a_kind_the_frontend_can_branch_on() {
        let json = serde_json::to_value(CommandError::NotAGitRepo {
            project_root: PathBuf::from("/tmp/x"),
        })
        .unwrap();
        assert_eq!(json["kind"], "notAGitRepo");

        // doc-5 §6: a reload failure must say whether the update already landed.
        let json = serde_json::to_value(CommandError::ReloadFailed {
            detail: "config.yml could not be read".to_string(),
            applied: Some(UpdateOutcome::Succeeded),
        })
        .unwrap();
        assert_eq!(json["kind"], "reloadFailed");
        assert_eq!(json["applied"]["state"], "succeeded");
    }

    #[test]
    fn a_project_load_keeps_the_row_when_the_root_is_unreadable() {
        let load = ProjectLoad::Unreadable {
            slug: "atlas".to_string(),
            error: CommandError::RootUnreadable {
                slug: "atlas".to_string(),
                detail: "the Backlog root has no tasks/ directory".to_string(),
            },
        };
        let json = serde_json::to_value(load).unwrap();
        assert_eq!(json["state"], "unreadable");
        assert_eq!(json["slug"], "atlas");
        assert_eq!(json["error"]["kind"], "rootUnreadable");
    }

    /// A move must be detected, because an open session keeps a model and a read-version index built
    /// from the *old* roots while `update_apply` would resolve the *new* `project_root` for the CLI —
    /// so the doc-9 §4 check would pass against unrelated bytes. An alias-only edit must not be
    /// detected: the interpretation is computed per call, so the session is still correct.
    #[test]
    fn only_a_root_move_invalidates_the_open_session() {
        let (from, entry) = root();
        // The destination has to be a valid Backlog root (config.yml + tasks/) for the ledger to
        // accept the move at all.
        let to = TempDir::new();
        to.write("backlog/config.yml", CONFIG);
        to.write(
            "backlog/tasks/task-1 - a.md",
            &task_file("TASK-1", "Doing", "[\"kind:feature\"]"),
        );
        let mut ledger = Ledger {
            schema_version: crate::ledger::KNOWN_SCHEMA_VERSION,
            projects: vec![entry],
        };

        // An alias-only update leaves both roots where they were.
        let before = entry_roots(&ledger, "atlas");
        let updated = ledger
            .update(&UpdateRequest {
                slug: "atlas".to_string(),
                project_root: None,
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: Some(BTreeMap::from([(
                    "Doing".to_string(),
                    "In Progress".to_string(),
                )])),
                new_index: None,
            })
            .unwrap();
        assert_eq!(
            before,
            Some((updated.project_root, updated.backlog_root)),
            "an alias edit must not be read as a move"
        );

        // A move changes both roots — project_root explicitly, backlog_root by defaulting under it.
        let before = entry_roots(&ledger, "atlas");
        let updated = ledger
            .update(&UpdateRequest {
                slug: "atlas".to_string(),
                project_root: Some(to.path.clone()),
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: None,
                new_index: None,
            })
            .unwrap();
        assert_ne!(
            before,
            Some((updated.project_root.clone(), updated.backlog_root.clone())),
            "a move must be detected so the stale session is closed"
        );
        assert_eq!(updated.project_root, to.path);
        assert_eq!(updated.backlog_root, to.path.join("backlog"));
        drop(from);
    }
}
