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
//! | doc-9 §4 読取版指標を保持する単位 | [`ProjectSession`] / [`ProjectState`] | one open root's model + read-version index, and the per-slug unit the プロジェクト単位ロック serializes (decision-18) |
//! | doc-9 §3 継続検出の提示 | [`PROJECT_RELOADED_EVENT`] | the event carrying a watch-triggered re-read to the frontend |
//! | doc-9 §4/§5 更新の結末 | [`UpdateResult`] | 更新前競合 (CLI never launched) vs. the CLI ran and returned a verdict |
//! | doc-5 §5 / decision-7 縮退 | [`CliReadiness`] | whether a supported `backlog` exists, i.e. whether the UI may offer edits at all |
//! | doc-6 §3/§6 コミット検索の結果・Git 対象不在 | [`CommitSearch`] | one task's commit search outcome: searched (possibly 該当なし) / 対象不在 / 読取不能 |
//! | doc-8 §7 外部エディタ経路 | [`task_file_open`] / [`ProjectState::open_in_editor`] | starting the user's editor on one task's management file, with the file resolved from this boundary's own model |
//! | doc-3 §4.1 登録を拒否し理由を示す | [`LedgerRefusal`] | which refusal a 登録・削除・更新 hit, as a value the screen branches on instead of a sentence it parses |
//! | doc-3 §2.1 台帳ファイル | [`ledger_location`] | the one file Atlas reads and writes, named so the screen can show where the registration lives |
//! | doc-3 §3.1 slug の既定値 | [`ledger_default_slug`] | the derivation from a project root, exposed so the screen previews the default instead of re-deriving it |
//! | decision-13 アプリ設定 | [`settings_read`] / [`settings_save`] | the display defaults, read and written as one value with the state that says whether saving is allowed |
//! | every layer's failure type | [`CommandError`] | one error type that keeps the core's distinctions (root unreadable / 縮退 / 拒否 / 照合不能) intact |
//!
//! ## Read and update stay separate paths (AC #2)
//!
//! decision-2 splits reading (file analysis) from updating (Backlog CLI). The boundary keeps that
//! split in its *signatures*, so it cannot be lost by accident:
//!
//! - Read commands ([`ProjectState::open`], [`read_history`], the ledger and cross-task-id
//!   commands) take a [`ScanSource`] — or, for Git history, read Git directly. None of them names
//!   [`BacklogCli`], so no read can travel through the CLI.
//! - The update command ([`ProjectState::apply`]) is the only one that takes a [`CliCapability`], which
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
//! and none of these is cheap enough to be worth an exception.
//!
//! Getting off the main thread also gives up the serialization the main thread was silently
//! providing: two invokes can now overlap. Where that would break something, [`AtlasState`] puts the
//! serialization back — but per project and per config file rather than over the whole boundary
//! (decision-18), because one lock over everything meant one stalled `backlog` stalled every project.
//! Read [`AtlasState`] for what breaks without it and for the lock order.
//!
//! ## Typed results, including the failures (AC #3)
//!
//! Nothing here collapses into a bare string. [`CommandError`] carries one variant per failure the
//! core distinguishes, so the UI can tell 対象不在 from 該当なし (doc-6 §6), ルート読取不能 from an
//! empty root (doc-7 §6), and — the distinction doc-9 §5 insists on — 照合不能
//! ([`CommandError::UncheckableTarget`], "we have no way to check whether the version diverged")
//! from 更新前競合 ([`UpdateResult::Conflict`], "we checked and it did diverge").

use crate::body_image::{self, ImageRefusal};
use crate::domain::{Config, Decision, Document, Milestone, ProjectModel, Task, UnmappedFile};
use crate::editor::{
    self, BodyLinkRefusal, EditorCommand, EditorError, EditorLaunch, EditorReadiness, Environment,
    LaunchMethod, LaunchRefusal, Launcher, SystemEnv, SystemLauncher,
};
use crate::external::{self, ExternalProgram, ExternalProgramReport, ExternalProgramSource};
use crate::history::{
    self, Cancelled, Commit, GitRemoteRead, HistoryError, PrCommitSource, PrRelation, RemoteHost,
};
use crate::interpret::status::{create_status_candidates, ColumnCreateStatuses};
use crate::interpret::{interpret_task, TaskInterpretation};
use crate::ledger::{
    Ledger, LedgerError, LoadedLedger, ParsedTaskRef, ProjectEntry, RegisterRequest, UpdateRequest,
};
use crate::read::scan::{ScanSource, WorkingTree};
use crate::read::RootError;
use crate::settings::{self, AppSettings, LoadedSettings, SettingsError};
use crate::store::{self, Files};
use crate::subprocess::Cancel;
use crate::sync::{
    FileVersions, FsVersions, GuardError, GuardedUpdate, ReloadReason, SyncState, WatchSession,
};
use crate::update::{
    self, BacklogCli, CliCapability, CliProgram, CliStatus, SystemBacklog, UpdateOperation,
    UpdateOutcome,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
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
    /// 写せなかったファイル (decision-24) — the `milestones/`, `docs/` and `decisions/` files the
    /// read layer could not assemble at all. Carried beside the three collections rather than
    /// inside them because these have no id to be listed or selected by; each 区画 filters this
    /// list to its own kind and draws it below its cards (doc-10 §5/§6/§10).
    pub unmapped_files: Vec<UnmappedFile>,
    /// 列の作成時 status 候補 (doc-7 §4.1) — which of this project's declared statuses the 列内新規
    /// タスク入力 may pass for each canonical column. Sent with the snapshot rather than derived on
    /// the frontend because its inputs are exactly the pair this constructor already holds
    /// (`config` and the 別名表), and reversing 列対応規則 a second time in TypeScript is how the
    /// column a task is *placed* in and the column it can be *created* in would drift apart.
    pub create_status_candidates: Vec<ColumnCreateStatuses>,
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
            create_status_candidates: create_status_candidates(&model.config, aliases),
            config: model.config.clone(),
            milestones: model.milestones.clone(),
            documents: model.documents.clone(),
            decisions: model.decisions.clone(),
            unmapped_files: model.unmapped_files.clone(),
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
///
/// `minimum` rides on `Unsupported` alone. It is there for the one sentence that states the
/// *difference* between the user's CLI and Atlas's 動作確認済み版; no other screen text names a version
/// (decision-27). Adding it to `Ready` would offer a value the reasons shown there must not use: those
/// reasons appear while readiness is `Unavailable` too, which the frontend constructs itself and has no
/// version to fill in, so they name what the CLI cannot do without dating it.
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

/// One task's Git 履歴 (doc-6 §2): the commit search's outcome and the owning project's determined
/// remote host — the two parts of doc-6's output that need Git.
///
/// The extracted Pull Request URLs are *not* here: their only input is the task's References
/// (doc-6 §4), so they are derived with the task itself ([`TaskInterpretation::pull_requests`]) and
/// arrive with the snapshot. That keeps doc-8 §4's PR ↔ References separation available for a task
/// this command cannot even be called for — a 解析不能 file has no TASK-ID to key on (doc-4 §5).
///
/// `remote` is the gate doc-6 §5/§6 puts in front of commit⇄PR relation resolution, and `relations`
/// is its result — one entry per Pull Request URL the task carries, each saying whether the PR was
/// resolved, is on a host Atlas cannot reference, or could not be looked up (doc-6 §6). The two travel
/// together on purpose: `relations` is only meaningful when `remote` is `Some`, because with the gate
/// shut nothing is queried and the list is empty.
///
/// It is also empty when `commits` is not [`CommitSearch::Searched`] — with no local commit list there
/// is nothing to intersect (doc-6 §6). So the two fields have to be read together: an empty list is
/// "this task has no Pull Request URL" only when the gate is open *and* the commit search produced a
/// list; otherwise it is "not compared", which the screen must not report as 関連が無い (doc-8 §5).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskHistory {
    pub commits: CommitSearch,
    pub remote: Option<RemoteHost>,
    pub relations: Vec<PrRelation>,
}

/// What became of コミット検索 for one task (doc-6 §3/§6). A `state`-tagged value rather than a
/// [`CommandError`], because a Git failure must not take the rest of the read with it: decision-6
/// degrades the Git 履歴欄 *alone* on Git 対象不在, while the Pull Request 区画 — derived from
/// References, not from Git — stays displayed beside it (doc-8 §4/§5). Failing the whole command
/// would strip a project whose root is not a Git repository of its PR/References separation too.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum CommitSearch {
    /// The repository was searched. An empty list is コミット該当なし (decision-6): a neutral state
    /// — nothing is committed yet — not a failure.
    Searched { commits: Vec<Commit> },
    /// Git 対象不在 (doc-6 §6): `project_root` is not a Git repository, so no local history exists.
    /// Independent of remote 不在, which leaves local history intact (decision-6).
    // Renamed per variant: the container's `rename_all` renames variants, not their fields.
    #[serde(rename_all = "camelCase")]
    NoRepository { project_root: PathBuf },
    /// The search could not run (`git` not on PATH, or a Git read failed). Distinct from both of the
    /// above: the target may well exist and simply could not be read.
    Unreadable { detail: String },
}

impl CommitSearch {
    /// Classify one [`history::search_commits`] result. `project_root` is the searched root, carried
    /// into 対象不在 so the screen can name the path the user has to fix (decision-6 asks for the
    /// hand-hold, not just the state).
    fn of(result: Result<Vec<Commit>, HistoryError>, project_root: &Path) -> Self {
        match result {
            Ok(commits) => CommitSearch::Searched { commits },
            Err(HistoryError::NotAGitRepo) => CommitSearch::NoRepository {
                project_root: project_root.to_path_buf(),
            },
            Err(other) => CommitSearch::Unreadable {
                detail: other.to_string(),
            },
        }
    }
}

/// What became of one update request (doc-9 §4). Mirrors [`GuardedUpdate`]: the two states are kept
/// apart because doc-9 §5 presents them differently — a conflict is "your screen is stale, here is
/// the current root", a run is "the CLI answered".
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateResult {
    /// 更新前競合: 全件一致 broke, so the CLI was never launched (doc-9 §4.1/§4.2.3). `project` is
    /// the re-read root — an ordinary reload, not 縮退 (doc-9 §5). The two lists stay apart because
    /// the screen has to say two different things: `diverged` members changed since Atlas read them,
    /// while `unread` names active task files Atlas never read, which makes the 参照追随書き換え's
    /// set itself untrustworthy rather than any one file stale (doc-9 §4.2.3-2).
    Conflict {
        diverged: Vec<PathBuf>,
        unread: Vec<PathBuf>,
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
    /// The ledger file could not be located, read, parsed, or written, or a cross-task-id was
    /// rejected (doc-3 §5.2). The plumbing failed or the input was not about editing the ledger —
    /// as opposed to [`CommandError::LedgerRefused`], which is a ledger *operation* turned down for
    /// a reason the 台帳管理画面 has to act on.
    Ledger { detail: String },
    /// A 登録・削除・更新 was refused, with which refusal it was (doc-3 §4.1 「登録を拒否し理由を
    /// 示す」). Typed rather than folded into [`CommandError::Ledger`]'s message: doc-3 §3.1 asks the
    /// screen to get the user *past* a 衝突・不正 by naming another slug, so the screen has to know
    /// which field to send them back to — and reading that out of an English `Display` string is
    /// exactly the string-matching this boundary exists to avoid. `detail` stays for diagnostics.
    LedgerRefused {
        reason: LedgerRefusal,
        detail: String,
    },
    /// アプリ設定ファイルへの書き込みが行われなかった (decision-13). Only saving can fail — a read
    /// degrades to the defaults and reports why through [`SettingsStatus`] instead (AC #6), so this
    /// variant means the settings on screen were *not* persisted.
    Settings { detail: String },
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
    // Git 対象不在 and a failed Git read are *not* here: they are states of one section of one
    // screen, not of the command, so they travel as [`CommitSearch`] values (decision-6, doc-8 §5).
    /// 縮退 (doc-5 §5, decision-7): no supported `backlog`, so updates are not offered. Carries the
    /// probe result so the UI can say which of "not installed" and "too old" it is.
    UpdatesUnavailable { readiness: CliReadiness },
    /// The update adapter refused the action before launch — outside the confirmed CLI's capability,
    /// or nothing to change (doc-5 §5). Nothing ran and nothing changed.
    UpdateRejected { detail: String },
    /// 照合不能 (doc-9 §4.2.4): the operation's 書き換え対象集合 has no check this design defines, so
    /// it is refused before launch. doc-9 §5 requires this to be presented *differently* from a
    /// conflict: no version divergence was observed here — there is no defined way to look for one.
    /// Since doc-9 §4.2 settled the 参照追随書き換え rule, what reaches this variant is an operand the
    /// open model does not carry, which leaves nothing to check the operation against.
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
    /// 外部エディタ経路 (doc-8 §7): the path named is not one of the open model's task files, so no
    /// program is started. The frontend echoes back a `sourcePath` it received from a read, so this is
    /// a stale screen (the file moved or the root was re-read) — or a path that never came from one,
    /// which is exactly what must not reach a process.
    UnknownTaskFile { slug: String, path: PathBuf },
    /// The chosen launch method has no launcher here (doc-8 §7): `VISUAL`/`EDITOR` are unset. Not a
    /// failure of the file or the project — the other method may still work.
    ///
    /// **Carries nothing**: 起動指定の解決順 has one way of coming up empty, so this token is the whole
    /// 失敗理由符号 and the screen words it from the token alone (decision-35 §3).
    EditorUnavailable,
    /// The launcher was reached and the OS refused (a missing program, a permission fault, no
    /// association for the extension). Names what was tried, and by which method — the correction is
    /// the 起動指定 for one and the OS's association for the other.
    EditorLaunchFailed {
        method: LaunchMethod,
        program: String,
        reason: LaunchRefusal,
        detail: String,
    },
    /// 履歴読取の取消 (decision-19): the screen cancelled this read, so there is no answer. Not a
    /// failure of the read — it is the caller's own decision coming back to it — and the screen it
    /// reaches has already stopped displaying that read, so it carries only the 読取識別子 and no
    /// sentence to show.
    HistoryCancelled { read_id: String },
    /// 既定ブラウザ起動 (doc-8 §9.3) did not open the 本文リンク: the URL was refused, or the OS call ran
    /// and opened nothing.
    ///
    /// **The causes used to be one variant with one sentence**, on the reasoning that typing a failure
    /// buys the screen a different action and there is none here — both reach ⑤ 通知 (doc-11 §4).
    /// decision-35 §3 ends that: the sentence is the screen's to write now, so the cause arrives as a
    /// [`BodyLinkRefusal`]. `program` rides inside it, on the one variant that has one, rather than
    /// beside it as a `null` the screen would branch on for the other two.
    BodyLinkFailed {
        reason: BodyLinkRefusal,
        detail: String,
    },
    /// One 添付画像 (doc-8 §9.2) was not read, so the 本文画像 that named it is not drawn.
    ///
    /// **Not a failure of the panel**: the screen draws the 状態の印 in its place and keeps everything
    /// around it, the way a 作図フェンス stays when mermaid will not draw it (doc-11 §14.5). The token
    /// is what selects the sentence beside that印, so it arrives typed rather than as a message
    /// (decision-35 §3).
    BodyImageRefused {
        reason: ImageRefusal,
        detail: String,
    },
}

/// Which ledger operation refusal happened (doc-3 §3.1/§3.3/§4). One variant per refusal
/// [`LedgerError`] already keeps apart, minus the plumbing failures — those stay
/// [`CommandError::Ledger`], because "the ledger file cannot be read at all" leaves the screen with
/// nothing to edit, while everything here is a form the user can correct and resubmit.
///
/// The payloads are the values the screen has to *show* to make the correction possible: the path
/// that is not a Backlog root, the slug that collided, the alias entry that is not a canonical
/// column. Nothing here carries the English sentence — the screen writes its own text (doc-3 §4.1
/// 理由付き提示 is a requirement on the screen, not on this enum).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum LedgerRefusal {
    /// doc-3 §2.2: the on-disk `schema_version` is newer than this build understands, so the write
    /// was refused to avoid destroying a format we cannot read. Every edit stays refused until the
    /// file is downgraded or this build is updated — the one refusal no form change gets past.
    ReadOnly { schema_version: u32 },
    /// doc-3 §4.1 step 2: the resolved Backlog root has no `config.yml` + `tasks/`, so it cannot be
    /// read (ルート読取不能 at registration time). Recovered by naming a different root.
    BacklogRootInvalid { path: String },
    /// doc-3 §3.1: the slug — given, or derived from the project-root directory name — does not
    /// match `[a-z0-9][a-z0-9-]*`. Recovered by naming a valid slug explicitly.
    InvalidSlug { slug: String },
    /// doc-3 §3.1: the slug is already in the ledger. Recovered by naming another slug.
    DuplicateSlug { slug: String },
    /// The slug selecting an entry to remove or update is not in the ledger — a stale screen.
    SlugNotFound { slug: String },
    /// doc-3 §3: a project/Backlog root was not an absolute path.
    NonAbsoluteRoot { path: String },
    /// doc-3 §3/§6: this project or Backlog root already belongs to another entry, which is the
    /// invariant that keeps one task source from being read twice under two slugs. `slug` is the
    /// entry that holds it — the screen names it, since the fix is to edit *that* entry.
    DuplicateRoot { slug: String },
    /// doc-3 §3.3: a status 別名表 value is not one of the canonical columns.
    InvalidStatusAlias { key: String, value: String },
}

impl From<LedgerError> for CommandError {
    fn from(error: LedgerError) -> Self {
        let detail = error.to_string();
        // Classified here, at the one place a ledger failure becomes a boundary value, so a new
        // `LedgerError` variant cannot quietly reach the frontend as an unclassified string: this
        // match is exhaustive and the compiler names the omission.
        let reason = match error {
            LedgerError::ReadOnly(schema_version) => LedgerRefusal::ReadOnly { schema_version },
            LedgerError::BacklogRootInvalid(path) => LedgerRefusal::BacklogRootInvalid { path },
            LedgerError::InvalidSlug(slug) => LedgerRefusal::InvalidSlug { slug },
            LedgerError::DuplicateSlug(slug) => LedgerRefusal::DuplicateSlug { slug },
            LedgerError::SlugNotFound(slug) => LedgerRefusal::SlugNotFound { slug },
            LedgerError::NonAbsoluteRoot(path) => LedgerRefusal::NonAbsoluteRoot { path },
            LedgerError::DuplicateRoot(slug) => LedgerRefusal::DuplicateRoot { slug },
            LedgerError::InvalidStatusAlias { key, value } => {
                LedgerRefusal::InvalidStatusAlias { key, value }
            }
            // Plumbing and cross-task-id failures: not a form the user can fix by editing a field,
            // so they keep the untyped variant rather than gaining a refusal reason that would
            // suggest one (doc-3 §5.2's id checks are not ledger edits at all).
            LedgerError::Io(_)
            | LedgerError::TomlDe(_)
            | LedgerError::TomlSer(_)
            | LedgerError::UnsupportedSchemaVersion(_)
            | LedgerError::UnknownProject(_)
            | LedgerError::InvalidTaskId(_)
            | LedgerError::BareIdNeedsContext => return CommandError::Ledger { detail },
        };
        CommandError::LedgerRefused { reason, detail }
    }
}

impl From<SettingsError> for CommandError {
    fn from(error: SettingsError) -> Self {
        CommandError::Settings {
            detail: error.to_string(),
        }
    }
}

impl From<editor::BrowserError> for CommandError {
    fn from(error: editor::BrowserError) -> Self {
        CommandError::BodyLinkFailed {
            reason: error.reason,
            detail: error.detail,
        }
    }
}

impl From<EditorError> for CommandError {
    fn from(error: EditorError) -> Self {
        match error {
            EditorError::Unavailable => CommandError::EditorUnavailable,
            EditorError::LaunchFailed {
                method,
                program,
                reason,
                detail,
            } => CommandError::EditorLaunchFailed {
                method,
                program,
                reason,
                detail,
            },
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

/// One registered root's state, and the unit the プロジェクト単位ロック serializes (decision-18):
/// whether the root is open, and if so the session behind it. Holds no ledger state of its own —
/// each method takes the [`ProjectEntry`] the caller just read under the same lock, so a root moved
/// or re-aliased through the ledger commands takes effect on the next call rather than needing the
/// session to be invalidated.
#[derive(Debug, Default)]
pub struct ProjectState {
    session: Option<ProjectSession>,
}

impl ProjectState {
    /// Read a root and keep it open (doc-9 §4). Reopening an already-open root re-reads it through
    /// [`SyncState::reload`] rather than standing up a second [`SyncState`] beside the live one:
    /// TASK-32 AC #6 makes a new trigger a [`ReloadReason`] variant, not a second read path.
    pub fn open(
        &mut self,
        entry: &ProjectEntry,
        source: &dyn ScanSource,
        probe: &dyn FileVersions,
    ) -> Result<ProjectSnapshot, CommandError> {
        if let Some(session) = self.session.as_mut() {
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
        self.session = Some(ProjectSession { model, sync });
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
    pub fn close(&mut self) -> bool {
        self.session.take().is_some()
    }

    /// The only part of a Git 履歴 read that needs the open model: one task's References, doc-6 §4's
    /// input. Split out from [`read_history`] so the caller can drop its locks before any subprocess
    /// runs — see that function for why the split matters.
    ///
    /// The id is checked here, before anything is spawned, so a typo is reported as 対象不在 for the
    /// task rather than as an empty commit list (doc-6 §6 該当なし).
    pub fn task_references(
        &self,
        entry: &ProjectEntry,
        task_id: &str,
    ) -> Result<Vec<String>, CommandError> {
        let session = self.session(&entry.slug)?;
        match session.model.task(task_id) {
            Some(task) => Ok(task.references.clone()),
            None => Err(CommandError::TaskNotFound {
                slug: entry.slug.clone(),
                task_id: task_id.to_string(),
            }),
        }
    }

    /// 外部エディタ経路 (doc-8 §7): start the user's editor on one task's management file.
    ///
    /// Three properties this method is shaped by:
    ///
    /// - **Atlas writes nothing** (AC #1). The file is passed as an argument to a spawned program;
    ///   nothing here opens it. doc-2's invariant therefore holds, while the *route* is the exception
    ///   doc-8 §7 names — the bytes the editor writes never pass the CLI's schema checking, and a
    ///   broken frontmatter is received by doc-4's 縮退表示 on the next read.
    /// - **The path is resolved, not accepted.** Only a `source_path` the open model already holds can
    ///   be launched; anything else is [`CommandError::UnknownTaskFile`]. The frontend gets these
    ///   paths from its own read, so this is the same rule [`SyncState::guarded_update`] applies to
    ///   update targets: the boundary names the file from its model rather than trusting a caller.
    /// - **The 起動指定 is passed in, not read here.** `configured` is アプリ設定's 外部エディタ指定
    ///   (decision-13); the command reads it per launch so a setting changed in this session takes
    ///   effect without a restart, and [`editor::resolve`] is the one place doc-8 §7's order
    ///   (アプリ設定 → `$VISUAL` → `$EDITOR`) is applied.
    /// - **No CLI capability, no 保存区分 gate.** This is the route doc-8 §6.5 and doc-5 §3.1 point at
    ///   for what the CLI *cannot* do — a draft's or an archived task's content, emptying References —
    ///   so gating it on the CLI probe or the 保存区分 would remove it exactly where it is needed.
    ///   A 解析不能 file (no TASK-ID) is openable for the same reason: it is identified by its path.
    pub fn open_in_editor(
        &self,
        entry: &ProjectEntry,
        source_path: &Path,
        method: LaunchMethod,
        configured: Option<&EditorCommand>,
        env: &dyn Environment,
        launcher: &dyn Launcher,
    ) -> Result<EditorLaunch, CommandError> {
        let session = self.session(&entry.slug)?;
        // Compared as read, not canonicalized: these paths come from the model the frontend was drawn
        // from, so equality is the whole check — and a canonicalize here would resolve a path that has
        // not been shown to be a managed file yet, which is the wrong order.
        if !session
            .model
            .tasks
            .iter()
            .any(|task| task.source_path == source_path)
        {
            return Err(CommandError::UnknownTaskFile {
                slug: entry.slug.clone(),
                path: source_path.to_path_buf(),
            });
        }
        Ok(editor::open(
            configured,
            env,
            launcher,
            method,
            source_path,
        )?)
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
        files: &dyn Files,
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
                files,
            )
            .map_err(CommandError::guard)?;
        match guarded {
            GuardedUpdate::Conflict {
                diverged,
                unread,
                model: reloaded,
            } => {
                *model = reloaded;
                Ok(UpdateResult::Conflict {
                    diverged,
                    unread,
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
        self.session
            .as_ref()
            .ok_or_else(|| CommandError::ProjectNotOpen {
                slug: slug.to_string(),
            })
    }

    fn session_mut(&mut self, slug: &str) -> Result<&mut ProjectSession, CommandError> {
        self.session
            .as_mut()
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

/// A running watch. Dropping the handle does not stop the thread, which is why the registry hands it
/// out rather than dropping it in place. Stopping takes two steps at two different times:
/// [`detach_watch`] signals the thread and unregisters it while the lifecycle lock is held, and
/// [`join_watch`] waits for it to end once that lock is released.
struct WatchHandle {
    stop: Arc<AtomicBool>,
    thread: std::thread::JoinHandle<()>,
}

/// Everything the boundary keeps between commands.
///
/// Making the commands `(async)` took them off the main thread, and with that went the main thread's
/// incidental serialization: two invokes can now overlap. Two things break under that. Atlas's own
/// two files are each written by a load → mutate → save, so concurrent mutations would start from the
/// same bytes and the last save would discard the other's change. And publishing a moved entry has to
/// be indivisible from invalidating what the move stales: `ledger_update` writes the new roots and
/// then closes the session, and in between, an `update_apply` reading the fresh entry would find the
/// *old* model and read-version index still open — version-checking the old root's file and then
/// running the CLI in the new `project_root`, which is exactly the hazard closing the session exists
/// to prevent.
///
/// One lock over the whole boundary would restore both, and did — until `update_apply` held it across
/// a `backlog` that never finished, which stalled every other project too (decision-18). So the
/// serialization is restored per unit of the thing being protected instead:
///
/// - **プロジェクト単位ロック** — `projects` holds one lock per slug. A command that reads an entry
///   and then acts on that project's session holds its slug's lock for the whole body, the CLI run
///   included. Another slug's lock is a different lock, so a stalled update stalls one project.
/// - **設定ファイルロック** — `ledger_writes` and `settings_writes` serialize the load → mutate → save
///   of Atlas's own two files, and nothing else. A *read* of either file takes neither: decision-17
///   replaces both by rename, so a reader gets one whole version or the other and can no longer see
///   bytes mid-write. Never held across a subprocess, and never held at the same time as each other —
///   two locks nestable in both orders are a cycle waiting to be written, so nesting is banned rather
///   than ordered.
///
/// Lock order is `projects` (the registry, to take one slug's lock) → that slug's lock → a 設定
/// ファイルロック → `watches`, never the reverse. A watch thread takes the same order. The one rule
/// that keeps it that way: a watch thread is never *joined* while its project's lock is held — see
/// [`detach_project`].
///
/// `history_reads` is outside that order because it takes nothing while held: every use inserts,
/// removes, or sets a flag and returns. It is a registry, not a serializer — the reads it lists run
/// concurrently by design (decision-19), and what it exists for is to be reachable from the 取消
/// command while one of them is waiting on `gh`.
#[derive(Default)]
pub struct AtlasState {
    projects: Mutex<BTreeMap<String, Arc<Mutex<ProjectState>>>>,
    ledger_writes: Mutex<()>,
    settings_writes: Mutex<()>,
    watches: Mutex<BTreeMap<String, WatchHandle>>,
    /// 履歴読取の取消 (decision-19). Not a lock — nothing waits on it; it is held only long enough
    /// to insert, remove, or set a flag.
    history_reads: Mutex<HistoryReads>,
}

/// What the 取消 needs to reach a read, by 読取識別子.
///
/// The identifier is a *string* the screen mints, not a counter, and that is what makes both maps
/// safe to key on it. A bare per-call number is unique only within one loader: a webview reload
/// starts a fresh loader at 1 while `AtlasState` and a read still waiting on `gh` live on, so a new
/// read could register under a number an older one already held — replacing its entry, and then
/// being removed by the older read's guard ([P1], PR #44 round 2). The screen therefore stamps each
/// loader with a generation and names a read by generation *and* call, so no two reads this process
/// ever sees share an identifier.
#[derive(Default)]
struct HistoryReads {
    /// The [`Cancel`] of every read still running. A read registers on entry and removes itself on
    /// the way out, so what is in here is what a cancel can still reach *now*. Because identifiers
    /// are unique, an insert never replaces another read's entry and a guard only ever removes its
    /// own.
    running: BTreeMap<String, HistoryRead>,
    /// 読取識別子 whose 取消 arrived before the read itself registered, and when it arrived.
    ///
    /// `task_history_read` and `task_history_cancel` are separate `(async)` commands, so Tauri
    /// schedules them independently: closing the panel or switching task right after a read starts
    /// can run the cancel first. Dropping such an id would leave the read to register a fresh,
    /// uncancelled handle and wait out its deadline — and a switch to a *different* task has no
    /// 引き継ぎ to catch it ([P1], PR #44 round 1). So the cancel is kept, and the registration
    /// consumes it.
    early: BTreeMap<String, Instant>,
}

/// One history read in flight (decision-19). The key it is filed under is the frontend's 読取識別子;
/// `task` is what lets a newer read of the same task cancel it without the frontend having to ask.
struct HistoryRead {
    task: (String, String),
    cancel: Cancel,
}

/// How long an early 取消 is kept before it is discarded unconsumed.
///
/// This bounds memory, not correctness: identifiers are unique per read, so an entry nothing claims
/// can never be claimed by a *different* read however long it is kept — it would simply stay. What
/// it has to cover is the gap between two invokes dispatched back to back — scheduling latency, not
/// work, since registration is the first thing `task_history_read` does and sits ahead of every lock
/// it takes. Five seconds is far beyond that, and an id still unclaimed by then belongs to a read
/// that is not coming.
const EARLY_CANCEL_RETENTION: Duration = Duration::from_secs(5);

/// The プロジェクト単位ロック for one slug, held (decision-18). Carries the slug it was taken for, so
/// the ledger accessors below can read *that* project's entry and no other: pairing the wrong entry
/// with a locked session is the hazard the lock exists for, and it is now a missing argument rather
/// than a missing habit.
struct Project<'a> {
    slug: &'a str,
    state: &'a mut ProjectState,
}

/// Run `body` holding `slug`'s プロジェクト単位ロック, releasing it before returning.
///
/// The lock is created on first use and **never removed from the registry**, not even by
/// `ledger_remove`. Removing it would let a call that is already blocked on the old lock run
/// alongside a later call that found nothing and created a new one — two live locks for one slug,
/// which is no lock at all. What is retained is one empty mutex per slug seen in this run.
fn with_project<T>(state: &AtlasState, slug: &str, body: impl FnOnce(&mut Project<'_>) -> T) -> T {
    let handle = lock(&state.projects)
        .entry(slug.to_string())
        .or_default()
        .clone();
    let mut guard = lock(&handle);
    body(&mut Project {
        slug,
        state: &mut guard,
    })
}

/// Proof that the holder has the 設定ファイルロック for the ledger file. [`mutate_ledger`] takes one;
/// reading the ledger takes none (see [`AtlasState`]).
struct LedgerWrite<'a>(#[allow(dead_code)] MutexGuard<'a, ()>);

fn ledger_write(state: &AtlasState) -> LedgerWrite<'_> {
    LedgerWrite(lock(&state.ledger_writes))
}

/// Proof that the holder has the 設定ファイルロック for the settings file.
struct SettingsWrite<'a>(#[allow(dead_code)] MutexGuard<'a, ()>);

fn settings_write(state: &AtlasState) -> SettingsWrite<'_> {
    SettingsWrite(lock(&state.settings_writes))
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
/// shapes lead to the same whole-root re-read: the reconstruction unit is the root (decision-42), so
/// a known changed-file list and a `Rescan` differ only in what the watcher could tell us, not in
/// what must be re-read.
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
    let state = app.state::<AtlasState>();
    let files = match ConfigFiles::resolve(app) {
        Ok(files) => files,
        Err(error) => {
            return ProjectLoad::Unreadable {
                slug: slug.to_string(),
                error,
            }
        }
    };
    // Under this project's プロジェクト単位ロック like any other reader of it, so a batch landing
    // mid-move cannot pair a fresh entry with a session about to be closed. Safe from deadlock only
    // because nothing joins a watch thread while holding that lock (see [`detach_project`]) — that
    // is the invariant this line depends on.
    with_project(&state, slug, |project| {
        // The ledger is re-read per batch rather than captured when the watch started: 別名表 is a
        // ledger attribute the user may change while the watch runs (doc-3 §3.3), and the
        // interpretation this event carries has to use the current table.
        let entry = match entry_for(&files, project) {
            Ok(entry) => entry,
            Err(error) => {
                return ProjectLoad::Unreadable {
                    slug: slug.to_string(),
                    error,
                }
            }
        };
        let source = WorkingTree::new(&entry.backlog_root);
        match project
            .state
            .reload(&entry, ReloadReason::ExternalChange, &source, &FsVersions)
        {
            Ok(project) => ProjectLoad::Loaded { project },
            Err(error) => ProjectLoad::Unreadable {
                slug: slug.to_string(),
                error,
            },
        }
    })
}

/// Deregister a root's watch and signal it to stop, returning its thread for the caller to join.
///
/// The join deliberately does not happen here. A watch thread takes its project's プロジェクト単位
/// ロック to re-read, and every caller of this function holds that lock — joining under it would wait
/// forever for a thread that is itself waiting for the lock. So the thread is signalled and
/// unregistered while the lock is held (which is what makes it indivisible from the ledger write that
/// staled it), and [`join_watch`] finishes the job once the lock is released.
#[must_use = "the detached watch thread must be joined by the caller once the project lock is released"]
fn detach_watch(state: &AtlasState, project: &Project<'_>) -> Option<WatchHandle> {
    let handle = lock(&state.watches).remove(project.slug);
    if let Some(handle) = &handle {
        handle.stop.store(true, Ordering::Relaxed);
    }
    handle
}

/// [`detach_watch`] plus dropping the open session, for when the root itself is going away.
#[must_use = "the detached watch thread must be joined by the caller once the project lock is released"]
fn detach_project(state: &AtlasState, project: &mut Project<'_>) -> Option<WatchHandle> {
    let handle = detach_watch(state, project);
    project.state.close();
    handle
}

/// Wait for a detached watch thread. Must be called with the project's lock released; the command
/// still waits before it returns, so by the time the frontend has its answer the thread is gone.
fn join_watch(handle: Option<WatchHandle>) {
    if let Some(handle) = handle {
        let _ = handle.thread.join();
    }
}

// --- ledger plumbing ----------------------------------------------------------------------------

/// Atlas's own two files: the ledger (doc-3 §2.1) and the app settings (decision-13). Both live in
/// the OS app-config dir and in no project's Backlog root.
///
/// Resolved once per command into a value, rather than looked up from the [`AppHandle`] at each use.
/// That is what lets the lock structure be exercised without a Tauri app — TASK-85 AC #4 asks for a
/// test that one project's stalled update holds up neither another project's read nor the settings
/// read, and a test that cannot build the state cannot make that claim.
#[derive(Debug, Clone)]
pub struct ConfigFiles {
    /// The アプリ設定ディレクトリ both files are in (decision-13 台帳ファイルと同じ…ディレクトリ). Held
    /// rather than derived from either path, because it is what [`settings_location_open`] opens and
    /// what makes that one control the 場所を開く for both files (TASK-75 AC #4).
    directory: PathBuf,
    ledger: PathBuf,
    settings: PathBuf,
}

impl ConfigFiles {
    fn resolve(app: &AppHandle) -> Result<ConfigFiles, CommandError> {
        let dir = app
            .path()
            .app_config_dir()
            .map_err(|e| CommandError::Ledger {
                detail: format!("the application config directory could not be resolved: {e}"),
            })?;
        Ok(ConfigFiles {
            ledger: dir.join("projects.toml"),
            settings: dir.join("settings.toml"),
            directory: dir,
        })
    }
}

/// Read the ledger. Takes no 設定ファイルロック: decision-17 replaces the file by rename, so a read
/// concurrent with a save sees one whole version or the other (see [`AtlasState`]).
fn load_ledger(files: &ConfigFiles) -> Result<LoadedLedger, CommandError> {
    Ok(LoadedLedger::load(&files.ledger)?)
}

/// The ledger entry for the project whose プロジェクト単位ロック is held, cloned so no ledger borrow
/// outlives the lookup. Taking the guard rather than a slug is what ties "the entry we act on" to
/// "the session we hold the lock for" — the pairing doc-9 §4 checks against.
fn entry_for(files: &ConfigFiles, project: &Project<'_>) -> Result<ProjectEntry, CommandError> {
    load_ledger(files)?
        .ledger
        .projects
        .iter()
        .find(|entry| entry.slug == project.slug)
        .cloned()
        .ok_or_else(|| CommandError::UnknownProject {
            slug: project.slug.to_string(),
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
fn mutate_ledger<F, T>(
    files: &ConfigFiles,
    _write: &LedgerWrite<'_>,
    op: F,
) -> Result<(T, LedgerResponse), CommandError>
where
    F: FnOnce(&mut Ledger) -> Result<T, LedgerError>,
{
    let mut loaded = LoadedLedger::load(&files.ledger)?;
    let observed = op(&mut loaded.ledger)?;
    loaded.save(&files.ledger)?;
    Ok((observed, loaded.into()))
}

// --- commands: ledger (doc-3) -------------------------------------------------------------------

#[tauri::command(async)]
pub fn ledger_list(app: AppHandle) -> Result<LedgerResponse, CommandError> {
    Ok(load_ledger(&ConfigFiles::resolve(&app)?)?.into())
}

/// Where the ledger file is (doc-3 §2.1). Shown rather than kept internal because doc-3 §2.2 keeps
/// hand-editing a supported route, and a route to a file nothing names is one the user cannot take.
/// The one place that says it is the 設定モーダル's ファイルの場所 区画 (doc-3 §2.1); the 登録モーダル
/// said it until TASK-136, which is the screen that *writes* the ledger and not the one whose reader
/// needs the path. Resolving the path reads nothing, so this takes no lifecycle lock.
#[tauri::command(async)]
pub fn ledger_location(app: AppHandle) -> Result<PathBuf, CommandError> {
    Ok(ConfigFiles::resolve(&app)?.ledger)
}

/// The slug a project root would get by default (doc-3 §3.1). Exposed so the registration form can
/// show the default *before* submitting, while the derivation rule stays in one place: a second
/// implementation in the frontend would be free to disagree with the one that actually registers.
/// `None` when the directory name yields no valid slug — the user then has to name one (AC #6).
///
/// Uniqueness is deliberately not checked here. doc-3 §3.1 makes it a property of the ledger at
/// registration time, and a preview that reported "taken" would go stale the moment another window
/// registered something; [`Ledger::register`] is the authority.
#[tauri::command(async)]
pub fn ledger_default_slug(project_root: PathBuf) -> Option<String> {
    crate::ledger::derive_slug(&project_root)
}

/// What one 登録 produced: the entry, and the ledger it now sits in. The entry is returned rather
/// than left for the caller to spot in the list, because its slug may have been *derived* (doc-3
/// §3.1) — the screen cannot otherwise name what it just registered, and it needs the name to open
/// the project and to report the registration.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub entry: ProjectEntry,
    pub ledger: LedgerResponse,
}

#[tauri::command(async)]
pub fn ledger_register(
    app: AppHandle,
    state: State<'_, AtlasState>,
    request: RegisterRequest,
) -> Result<RegisterResponse, CommandError> {
    // No プロジェクト単位ロック: registration is the moment a slug starts existing, so there is no
    // session or watch of its own to pair with — and the slug is not known until `register` derives
    // it (doc-3 §3.1). A slug that is already taken is refused by the ledger, not by a lock.
    let files = ConfigFiles::resolve(&app)?;
    let write = ledger_write(&state);
    let git = ExternalProgram::git(current_settings(&app).git_cli.as_deref());
    let (entry, ledger) = mutate_ledger(&files, &write, |ledger| ledger.register(&git, &request))?;
    Ok(RegisterResponse { entry, ledger })
}

/// Remove a project from the ledger and let go of it: an unregistered project must not keep a watch
/// running or a session open against a root Atlas no longer manages.
#[tauri::command(async)]
pub fn ledger_remove(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
) -> Result<LedgerResponse, CommandError> {
    // The removal and the detach happen under this project's own lock, so no command can observe an
    // entry that is gone from the ledger while its session is still open.
    let files = ConfigFiles::resolve(&app)?;
    let (response, detached) = with_project(&state, &slug, |project| {
        let write = ledger_write(&state);
        let (_, response) =
            mutate_ledger(&files, &write, |ledger| ledger.remove(&slug).map(|_| ()))?;
        let detached = detach_project(&state, project);
        Ok::<_, CommandError>((response, detached))
    })?;
    join_watch(detached);
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
///
/// Writing the entry and detaching the session happen under this project's own lock. Splitting them
/// would leave a window in which the new roots are already published while the stale session is still
/// open — and an `update_apply` landing in that window is precisely the hazard above, now reachable
/// concurrently rather than only across calls. Taking the project's lock *before* the ledger's is
/// what makes the pairing hold: every command that reads this entry and then acts on this session
/// takes the same lock first (decision-18 fixes the order in that direction, not the other).
#[tauri::command(async)]
pub fn ledger_update(
    app: AppHandle,
    state: State<'_, AtlasState>,
    request: UpdateRequest,
) -> Result<LedgerResponse, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    let git = ExternalProgram::git(current_settings(&app).git_cli.as_deref());
    let (response, detached) = with_project(&state, &request.slug, |project| {
        let write = ledger_write(&state);
        let (moved, response) = mutate_ledger(&files, &write, |ledger| {
            let before = entry_roots(ledger, &request.slug);
            let after = ledger.update(&git, &request)?;
            Ok(before != Some((after.project_root, after.backlog_root)))
        })?;
        let detached = if moved {
            detach_project(&state, project)
        } else {
            None
        };
        Ok::<_, CommandError>((response, detached))
    })?;
    join_watch(detached);
    Ok(response)
}

/// One project's remote 現在値 (doc-10 §4.1): what `git` reports for the entry's project root right
/// now, as opposed to the Git remote 有無属性 the ledger recorded (doc-3 §3.2).
///
/// Read on demand rather than carried by [`ledger_list`]. The value is shown by one 概要区画 at a
/// time, while `ledger_list` runs at startup for every entry — putting two `git` invocations per
/// project there would make the startup cost scale with the ledger to fill a line nobody has opened.
///
/// Takes no プロジェクト単位ロック: it writes nothing and reads no session or Backlog root, only the
/// project root's Git config. The ledger read is the same one [`ledger_list`] does.
#[tauri::command(async)]
pub fn git_remote_read(app: AppHandle, slug: String) -> Result<GitRemoteRead, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    let entry = load_ledger(&files)?
        .ledger
        .projects
        .into_iter()
        .find(|entry| entry.slug == slug)
        .ok_or(CommandError::UnknownProject { slug })?;
    let git = ExternalProgram::git(current_settings(&app).git_cli.as_deref());
    Ok(crate::history::read_git_remote(&git, &entry.project_root))
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
    Ok(load_ledger(&ConfigFiles::resolve(&app)?)?
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
    Ok(load_ledger(&ConfigFiles::resolve(&app)?)?
        .ledger
        .parse_cross_task_id(&input, &task_prefix, context_slug.as_deref())?)
}

// --- commands: read path (decision-2, AC #2/#5) -------------------------------------------------

/// Open every registered project (doc-7 §2: rows are projects). A root that cannot be read yields
/// [`ProjectLoad::Unreadable`] for its own row and leaves the others untouched — doc-7 §6 keeps the
/// row, and doc-4 §5 confines ルート読取不能 to the root it happened in.
///
/// Each root is opened under its own プロジェクト単位ロック, taken and released one at a time
/// (decision-18): holding all of them at once would put this command back in the position of
/// blocking every project, and is the one shape the lock order does not cover. The entry is re-read
/// inside each lock rather than taken from the listing, so a root moved while this loop runs is
/// opened at the roots it has now, not the ones it had when the list was made.
#[tauri::command(async)]
pub fn workspace_open(
    app: AppHandle,
    state: State<'_, AtlasState>,
) -> Result<Vec<ProjectLoad>, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    let slugs: Vec<String> = load_ledger(&files)?
        .ledger
        .projects
        .iter()
        .map(|entry| entry.slug.clone())
        .collect();
    Ok(slugs
        .iter()
        .map(|slug| {
            with_project(&state, slug, |project| {
                let entry = match entry_for(&files, project) {
                    Ok(entry) => entry,
                    Err(error) => {
                        return ProjectLoad::Unreadable {
                            slug: slug.clone(),
                            error,
                        }
                    }
                };
                let source = WorkingTree::new(&entry.backlog_root);
                match project.state.open(&entry, &source, &FsVersions) {
                    Ok(project) => ProjectLoad::Loaded { project },
                    Err(error) => ProjectLoad::Unreadable {
                        slug: slug.clone(),
                        error,
                    },
                }
            })
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
    let files = ConfigFiles::resolve(&app)?;
    // This project's lock spans reading the entry and opening it, so the model and read-version index
    // this builds cannot come from an entry another command has already replaced.
    with_project(&state, &slug, |project| {
        let entry = entry_for(&files, project)?;
        let source = WorkingTree::new(&entry.backlog_root);
        project.state.open(&entry, &source, &FsVersions)
    })
}

/// Close one root: stop its watch and drop its session and read-version index.
#[tauri::command(async)]
pub fn project_close(state: State<'_, AtlasState>, slug: String) {
    let detached = with_project(&state, &slug, |project| detach_project(&state, project));
    join_watch(detached);
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
    let files = ConfigFiles::resolve(&app)?;
    with_project(&state, &slug, |project| {
        let entry = entry_for(&files, project)?;
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
        watches.insert(slug.clone(), WatchHandle { stop, thread });
        Ok(())
    })
}

/// Stop 継続検出 for one root, leaving its session open. The thread is joined after the project's lock
/// is released (see [`detach_watch`]).
#[tauri::command(async)]
pub fn project_watch_stop(state: State<'_, AtlasState>, slug: String) {
    let detached = with_project(&state, &slug, |project| detach_watch(&state, project));
    join_watch(detached);
}

/// The subprocess half of one task's Git・Pull Request 履歴 (doc-6): the commit search, the remote
/// host detection, and — behind that gate — the relation lookup. Takes the task's `references` (from
/// [`ProjectState::task_references`]) rather than a session, so it needs no lock and none is held while
/// it runs.
///
/// That is the point of the split. `gh` is waited on without a bound (decision-14), and every ledger
/// and workspace command takes the same lifecycle mutex for its whole body — so waiting on `gh` under
/// the lock would stall reloads, edits, open/close and even the user's own 再取得 behind one slow
/// network call. `#[tauri::command(async)]` keeps the WebView thread free but would not release a
/// backend lock, so the lock has to be dropped before this runs.
///
/// `source` is the remote-host reference means (doc-6 §6), injected for the same reason [`ScanSource`]
/// is: it is the one part of this read that leaves the machine, and tests must be able to exercise the
/// read without a network.
///
/// `cancel` is the 履歴読取の取消 handle (decision-19). Setting it ends the 照会 in flight and stops
/// the ones not yet started, and this returns [`Cancelled`] rather than a partial answer: the caller
/// that cancelled is by definition no longer displaying one.
pub fn read_history(
    git: &ExternalProgram,
    entry: &ProjectEntry,
    task_id: &str,
    references: &[String],
    source: &dyn PrCommitSource,
    cancel: &Cancel,
) -> Result<TaskHistory, Cancelled> {
    // A Git failure is a value here, not an error: the rest of the detail screen — including the
    // References-derived PR 区画 — must survive a root that is not a Git repository (decision-6,
    // doc-8 §5).
    let commits = CommitSearch::of(
        history::search_commits(git, &entry.project_root, task_id),
        &entry.project_root,
    );
    // The same 抽出規則 the interpretation applies (doc-6 §4, defined once in `history`), re-run here
    // rather than carried over: this command is keyed on a TASK-ID and needs the URLs of *that* task.
    let pull_requests = history::extract_pull_requests(references);
    let remote = history::detect_remote_host(git, entry);
    // Relation resolution intersects a PR's commit set with *this task's* commits (doc-6 §6), so a
    // commit search that did not produce a list leaves the intersection undefined rather than empty.
    // Resolving against a stand-in empty slice would spend a network lookup to report "no shared
    // commit" — a resolved state — for a comparison that never happened.
    let relations = match &commits {
        CommitSearch::Searched { commits } => history::resolve_task_relations(
            remote.as_ref(),
            commits,
            &pull_requests,
            source,
            cancel,
        )?,
        CommitSearch::NoRepository { .. } | CommitSearch::Unreadable { .. } => Vec::new(),
    };
    Ok(TaskHistory {
        commits,
        remote,
        relations,
    })
}

/// One task's commits, Pull Request URLs and their relation (doc-6). Read-only: `git log`,
/// `git remote` and `gh api` with fixed argument arrays, never a shell string (AGENTS).
#[tauri::command(async)]
pub fn task_history_read(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
    task_id: String,
    read_id: String,
) -> Result<TaskHistory, CommandError> {
    // Registered before anything runs, so a cancel arriving while the ledger lock below is still
    // held already has something to set (decision-19). The guard removes the registration on every
    // exit from this function, the `?` paths included.
    let (_registered, cancel) =
        begin_history_read(&state, &read_id, &slug, &task_id, Instant::now());
    // Everything that needs a lock happens in this block, and the guard is dropped at its end —
    // `read_history` below spawns `git` and `gh`, and must not do so holding it. decision-18 keeps
    // this split after the lock was narrowed to one project: a network wait has no more reason to sit
    // under one project's lock than under a global one.
    let files = ConfigFiles::resolve(&app)?;
    let (entry, references) = with_project(&state, &slug, |project| {
        let entry = entry_for(&files, project)?;
        let references = project.state.task_references(&entry, &task_id)?;
        Ok::<_, CommandError>((entry, references))
    })?;
    // Both 外部コマンド are resolved once, from the settings as they stand when the read starts —
    // one read must not launch two different executables because a save landed halfway through it.
    let settings = current_settings(&app);
    read_history(
        &ExternalProgram::git(settings.git_cli.as_deref()),
        &entry,
        &task_id,
        &references,
        &history::HostReferences::new(ExternalProgram::gh(settings.gh_cli.as_deref())),
        &cancel,
    )
    .map_err(|Cancelled| CommandError::HistoryCancelled { read_id })
}

/// 履歴読取の取消 (decision-19): stop waiting for a history read whose answer the screen no longer
/// wants, and end the `gh` 照会 it has in flight.
///
/// Takes no `slug`/`task_id`: the 読取識別子 names one call, and a screen that has moved on wants
/// *that* call stopped — not whatever read happens to be running for the same task now. Cancelling
/// an id that is not running is not an error; the read may have finished on its own between the
/// screen deciding and this arriving, and there is nothing to report about that.
#[tauri::command(async)]
pub fn task_history_cancel(state: State<'_, AtlasState>, read_id: String) {
    cancel_history_read(&state, &read_id, Instant::now());
}

/// The body of [`task_history_cancel`], reachable without Tauri so the 取消 can be tested against a
/// bare [`AtlasState`] — the same reason decision-18 moved the exclusion structure off `AppHandle`.
/// `now` is a parameter so a test can age an early 取消 without waiting for one.
fn cancel_history_read(state: &AtlasState, read_id: &str, now: Instant) {
    let mut reads = lock(&state.history_reads);
    // The registration is left in place: the read that owns it removes it on its way out, and
    // removing it here would let a *later* cancel for the same id find nothing while the read it
    // meant to stop is still going.
    if let Some(read) = reads.running.get(read_id) {
        read.cancel.cancel();
        return;
    }
    // Nothing is running under that id. Either it already finished — in which case the entry below
    // expires unread — or it has not registered yet, and this is the race the entry exists for.
    forget_stale_cancels(&mut reads, now);
    reads.early.insert(read_id.to_string(), now);
}

/// Drop early 取消 nothing came to claim. Called on both sides of the race, so the map cannot grow
/// with ids that never register whichever of the two runs.
fn forget_stale_cancels(reads: &mut HistoryReads, now: Instant) {
    reads
        .early
        .retain(|_, at| now.duration_since(*at) < EARLY_CANCEL_RETENTION);
}

/// Register a history read and hand back its [`Cancel`], plus a guard that unregisters it.
///
/// Registering is also where 引き継ぎ happens: a read that starts for a (slug, TASK-ID) cancels any
/// older read of the same task. That covers what the frontend's own cancel cannot be relied on for —
/// a route that forgets to send it, or one that never gets the chance — while the frontend's cancel
/// covers what this cannot see, namely a detail panel closing with no next read to supersede it.
fn begin_history_read<'a>(
    state: &'a AtlasState,
    read_id: &str,
    slug: &str,
    task_id: &str,
    now: Instant,
) -> (HistoryReadGuard<'a>, Cancel) {
    let task = (slug.to_string(), task_id.to_string());
    let cancel = Cancel::new();
    let mut reads = lock(&state.history_reads);
    for superseded in reads.running.values().filter(|read| read.task == task) {
        superseded.cancel.cancel();
    }
    // A 取消 that arrived before this line ran is this read's, and is honoured now. Without it the
    // read would start uncancelled and wait out its deadline for a screen that has already left.
    forget_stale_cancels(&mut reads, now);
    if reads.early.remove(read_id).is_some() {
        cancel.cancel();
    }
    reads.running.insert(
        read_id.to_string(),
        HistoryRead {
            task,
            cancel: cancel.clone(),
        },
    );
    drop(reads);
    (
        HistoryReadGuard {
            state,
            read_id: read_id.to_string(),
        },
        cancel,
    )
}

/// Removes a history read's registration however its command returns. A guard rather than a call at
/// the end, because the read has several `?` exits and an entry left behind would make a later
/// cancel set a flag nobody reads — harmless, but it would also grow the map for the life of the
/// process.
struct HistoryReadGuard<'a> {
    state: &'a AtlasState,
    read_id: String,
}

impl Drop for HistoryReadGuard<'_> {
    fn drop(&mut self) {
        // By identifier alone, which removes this read's own entry and no other — identifiers are
        // unique per read, so nothing else can be filed under it.
        lock(&self.state.history_reads)
            .running
            .remove(&self.read_id);
    }
}

// --- commands: アプリ設定 (decision-13) ------------------------------------------------------------

/// The settings in force, for this boundary's own use. A path that cannot be resolved is the one read
/// failure this returns rather than degrades, because the caller needs *some* settings either way —
/// so it is turned into the defaults here, and the screen learns of it through [`settings_read`].
fn current_settings(app: &AppHandle) -> AppSettings {
    match ConfigFiles::resolve(app) {
        Ok(files) => LoadedSettings::load(&files.settings).settings,
        Err(_) => AppSettings::default(),
    }
}

/// アプリ設定 and why they are what they are (decision-13, AC #2/#6). Reading never fails: a missing,
/// unreadable or too-new file yields the defaults with a `status` the screen states — decision-13 is
/// explicit that the screen must not stop because the settings could not be read.
///
/// Takes no lock at all. It used to take the boundary-wide one so that a read overlapping a save
/// could not see half-written bytes as 破損 — a reason decision-17 removed, since the file is now
/// replaced by rename and a reader gets one whole version or the other. Reading the settings while
/// another project's update is stalled is therefore not merely allowed but lock-free (decision-18).
#[tauri::command(async)]
pub fn settings_read(app: AppHandle) -> Result<LoadedSettings, CommandError> {
    Ok(read_settings(&ConfigFiles::resolve(&app)?))
}

/// [`settings_read`] without the Tauri handle, so the claim that this read is not behind any lock a
/// stalled update holds is testable rather than only stated (TASK-85 AC #4).
fn read_settings(files: &ConfigFiles) -> LoadedSettings {
    LoadedSettings::load(&files.settings)
}

/// Persist アプリ設定 (AC #2/#3). Refused when the on-disk `schema_version` is newer than this build
/// understands (AC #1) — checked against the file at write time, not against an earlier read, so a
/// file replaced while Atlas ran is still not clobbered.
#[tauri::command(async)]
pub fn settings_save(
    app: AppHandle,
    state: State<'_, AtlasState>,
    settings: AppSettings,
) -> Result<LoadedSettings, CommandError> {
    save_settings(&state, &ConfigFiles::resolve(&app)?, &settings)
}

/// [`settings_save`] without the Tauri handle — the 設定ファイルロック half of what TASK-85 AC #4
/// checks: even a settings *write* completes while another project's update is stalled.
fn save_settings(
    state: &AtlasState,
    files: &ConfigFiles,
    settings: &AppSettings,
) -> Result<LoadedSettings, CommandError> {
    let _write = settings_write(state);
    Ok(settings::save(&files.settings, settings)?)
}

/// Where the settings file is (decision-13). Shown for the same reason [`ledger_location`] is, and in
/// the same 区画 beside it: the file is Atlas's own, hand-editable, and the user is meant to be able to
/// find it. Resolving the path reads nothing, so this takes no lock.
#[tauri::command(async)]
pub fn settings_location(app: AppHandle) -> Result<PathBuf, CommandError> {
    Ok(ConfigFiles::resolve(&app)?.settings)
}

/// Whether the アプリ設定ディレクトリ is there yet (doc-3 §2.1). What withholds 場所を開く: the control
/// opens the *folder*, so the folder's absence is the only thing that can stop it — the settings
/// file's absence never could, and [`settings_location_open`] does not read it.
///
/// Its own read rather than part of [`settings_location`]: that one resolves a path and its answer
/// cannot change while the app runs, whereas this one is a filesystem fact that the first save turns
/// true (`store::replace` creates the destination's parent before it writes anything), so the two
/// have different lifetimes and only one of them can be resolved once at startup.
///
/// No lock: the directory is created before any 一時ファイル置換 and nothing here removes it, so a
/// concurrent save can only turn this answer from false to true.
#[tauri::command(async)]
pub fn settings_directory_present(app: AppHandle) -> Result<bool, CommandError> {
    directory_present(&ConfigFiles::resolve(&app)?)
}

/// [`settings_directory_present`] without the Tauri handle, so the folder-not-file rule can be
/// exercised against a real directory.
///
/// `metadata` rather than `try_exists`, which answers "an entry is there" and would say yes to a
/// plain file left at that path — the control would then be offered and hand a file to the
/// association launcher, which is the same 開く先 mix-up in the other direction. An undeterminable
/// answer stays an error rather than collapsing to `false`: the screen states this as the reason the
/// control is withheld, and "the folder is not there" is not something an `io::Error` establishes.
/// The variant is the one [`ConfigFiles::resolve`] already uses for a failure about this same
/// directory.
fn directory_present(files: &ConfigFiles) -> Result<bool, CommandError> {
    match files.directory.metadata() {
        Ok(metadata) => Ok(metadata.is_dir()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(CommandError::Ledger {
            detail: format!("the application config directory could not be examined: {e}"),
        }),
    }
}

/// Open the アプリ設定ディレクトリ in whatever the OS opens a directory with (TASK-75 AC #1). The
/// counterpart of [`settings_location`]: that one says where the file is, this one takes the user
/// there.
///
/// The directory rather than the file: the association launcher hands a `.toml` to a text editor,
/// which is not what a 場所を開く asks for, and the three platforms have no common way to *select* a
/// file in the file manager that does not go through a command line (`explorer /select,` is exactly
/// the shape decision-15 refused). The directory is opened on all three by the same one path, and
/// the file is not selected.
///
/// The path is Atlas's own — resolved here, never taken from the frontend — and reaches the OS as one
/// argv element or one `lpFile` (AGENTS: no shell string). Nothing is read or written, so no lock is
/// taken, and 台帳ファイル needs no control of its own: decision-13 puts it in this same directory.
#[tauri::command(async)]
pub fn settings_location_open(app: AppHandle) -> Result<EditorLaunch, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    Ok(editor::open_association(&SystemLauncher, &files.directory)?)
}

// --- commands: 外部エディタ経路 (doc-8 §7) --------------------------------------------------------

/// Which launch methods this environment offers (doc-8 §7). Probed on demand for the same reason as
/// [`cli_probe`]: the UI offers a control per available method and states why the other is missing, and
/// the answer is one environment read.
///
/// The アプリ設定 側 of 起動指定の解決順 is read here rather than passed from the frontend, so the panel
/// cannot show a different editor than the one a launch would start: both go through
/// [`editor::resolve`] with the same input.
#[tauri::command(async)]
pub fn editor_probe(app: AppHandle) -> EditorReadiness {
    let settings = current_settings(&app);
    editor::probe(settings.external_editor.as_ref(), &SystemEnv)
}

/// Open one task's management file in the user's editor (doc-8 §7). The write is the editor's; Atlas
/// starts a process and touches no file. The editor's save arrives like any other external change —
/// doc-9's watch picks it up and the root is re-read — so nothing here waits for or detects an exit.
///
/// `source_path` must be a task file of the open project: it is checked against the model rather than
/// used as given (see [`ProjectState::open_in_editor`]), and it reaches the process as one element of an
/// argument array, never as part of a string (AGENTS).
#[tauri::command(async)]
pub fn task_file_open(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
    source_path: PathBuf,
    method: LaunchMethod,
) -> Result<EditorLaunch, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    let settings = current_settings(&app);
    with_project(&state, &slug, |project| {
        let entry = entry_for(&files, project)?;
        project.state.open_in_editor(
            &entry,
            &source_path,
            method,
            settings.external_editor.as_ref(),
            &SystemEnv,
            &SystemLauncher,
        )
    })
}

// --- commands: 本文リンク (doc-8 §9.3) ------------------------------------------------------------

/// Open one 本文リンク with whatever the OS registered for its scheme (doc-8 §9.3 既定ブラウザ起動).
///
/// **The URL comes from the frontend, and that is what makes this launch unlike every other one here.**
/// The rest take a value this boundary resolved from its own read model — the註 on
/// [`settings_location_open`] states that as a property of the path it opens — whereas this one carries
/// what a user wrote in a 本文. So the scheme check runs *here* ([`editor::browser_url`]) and not only on
/// the screen: doc-8 §9.3 makes the screen's classification the second of the two, not the only one.
///
/// No project or task is named, because none is involved: the value is the whole of the input, and
/// nothing about which task the 本文 belonged to changes what may be opened.
///
/// Returns nothing on success. The browser coming forward is the result, and doc-11 §4 keeps a success
/// the screen already shows off the 上部帯.
#[tauri::command(async)]
pub fn body_link_open(url: String) -> Result<(), CommandError> {
    Ok(editor::open_url(&SystemLauncher, &url)?)
}

// --- commands: 添付画像 (doc-8 §9.2) --------------------------------------------------------------

/// The bytes of one 添付画像, so the screen can draw the 本文画像 that named it (doc-8 §9.2).
///
/// **`reference` comes from a 本文, like [`body_link_open`]'s URL** — the second value this boundary
/// takes that Atlas did not resolve itself — so the rule that turns it into a path runs here
/// ([`body_image::resolve`]) and not only on the screen. It is Backlog CLI's own rule, copied, so the
/// same 台帳 means the same thing in both tools (AGENTS).
///
/// **The project is named, and the reference alone is not enough to resolve anything**: `/assets/` is
/// relative to *a* Backlog root, and Atlas holds several at once (AGENTS の Project model). The root
/// comes from the ledger entry rather than from the caller, so no path the frontend could send
/// selects a directory.
///
/// Returns the bytes raw. There is no media type beside them: the screen holds the 媒体型表 and asks
/// only for references it has already found in it (see [`body_image`]'s comment).
#[tauri::command(async)]
pub fn body_image_read(
    app: AppHandle,
    state: State<'_, AtlasState>,
    slug: String,
    reference: String,
) -> Result<tauri::ipc::Response, CommandError> {
    let files = ConfigFiles::resolve(&app)?;
    let entry = with_project(&state, &slug, |project| entry_for(&files, project))?;
    body_image::read(&entry.backlog_root, &reference)
        .map(tauri::ipc::Response::new)
        .map_err(|(reason, detail)| CommandError::BodyImageRefused { reason, detail })
}

// --- commands: update path (decision-2, doc-5, AC #2/#4) ----------------------------------------

/// Probe the write-side CLI (doc-5 §3.2, decision-7). Probed on demand rather than cached at startup:
/// a `backlog` installed or upgraded while Atlas is running must take effect without a restart, and
/// the cost is one `--version` process.
///
/// The アプリ設定 side of 実行ファイル解決の順序 is read here rather than passed from the frontend, for
/// the same reason [`editor_probe`] reads it: the probe and the update must not be able to reach
/// different executables.
#[tauri::command(async)]
pub fn cli_probe(app: AppHandle) -> CliReadiness {
    let settings = current_settings(&app);
    update::probe(&SystemBacklog::resolve(settings.backlog_cli.as_deref())).into()
}

/// 解決結果の表示 (decision-29): what each 外部コマンド resolves to right now, and whether it starts.
///
/// **All three, `backlog` included.** The panel answers one question — did this program start — and
/// it answers it the same way for each. [`cli_probe`] answers a different one that only `backlog`
/// has: whether the version meets `MIN_VERSION` (decision-7), which is what the 縮退帯 states. The
/// two never contradict each other because they are not about the same thing: a CLI below the
/// minimum starts perfectly well, and the panel saying so while the band withholds updates is two
/// true facts, not two answers.
///
/// `backlog`'s row is built from [`SystemBacklog`]'s own resolution rather than from an
/// [`ExternalProgram`], so the path shown is the one an update would actually run, npm sub-package
/// step and all (doc-5 §4).
///
/// The three probes run in sequence, not in parallel: each is bounded, three of them are at most
/// fifteen seconds, and a thread per probe would be the only concurrency in this boundary.
#[tauri::command(async)]
pub fn external_programs_probe(app: AppHandle) -> Vec<ExternalProgramReport> {
    let settings = current_settings(&app);
    let backlog = SystemBacklog::resolve(settings.backlog_cli.as_deref());
    let resolved = backlog.program();
    vec![
        external::probe_program(
            "backlog",
            resolved.program(),
            match resolved {
                CliProgram::Configured(_) => ExternalProgramSource::Configured,
                CliProgram::SubPackage(_) => ExternalProgramSource::SubPackage,
                CliProgram::OnPath => ExternalProgramSource::OnPath,
            },
        ),
        external::probe(&ExternalProgram::git(settings.git_cli.as_deref())),
        external::probe(&ExternalProgram::gh(settings.gh_cli.as_deref())),
    ]
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
    let files = ConfigFiles::resolve(&app)?;
    let cli = SystemBacklog::resolve(current_settings(&app).backlog_cli.as_deref());
    // This project's lock is held across the whole update, not just the entry read: the pairing of
    // "this entry's roots" with "this session's model and read-version index" is what doc-9 §4 checks
    // against, and a ledger move landing between the two would break exactly that pairing. It is
    // *this* project's lock and no other — the probe and the CLI run below are the wait decision-18
    // exists to keep off every other project (TASK-85 AC #1/#2).
    with_project(&state, &slug, |project| {
        let entry = entry_for(&files, project)?;
        // 縮退 (doc-5 §5): without a supported CLI there is no capability to hand `apply`, so the
        // update is refused here — the type below cannot be constructed any other way.
        let capability = match update::probe(&cli) {
            CliStatus::Supported(capability) => capability,
            other => {
                return Err(CommandError::UpdatesUnavailable {
                    readiness: other.into(),
                })
            }
        };
        let source = WorkingTree::new(&entry.backlog_root);
        project.state.apply(
            &entry,
            &action,
            &capability,
            &cli,
            &source,
            &FsVersions,
            &store::SystemFiles,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::status::{StatusColumn, StatusDeclaration};
    use crate::update::{AcEdit, CliRun, NoteEdit, RunError, TaskCreate, TaskEdit};
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

    /// A [`PrCommitSource`] that fails the test if it is ever consulted. Every history read in this
    /// module runs behind a shut gate (`git_remote_present: false`), so reaching the network here
    /// would be the bug (doc-6 §6).
    struct NeverCalled;

    impl PrCommitSource for NeverCalled {
        fn commits_for_pull_request(
            &self,
            _target: &crate::history::PullRequestTarget,
            _cancel: &Cancel,
        ) -> Result<Vec<String>, crate::history::RelationError> {
            panic!("the reference means must not be reached with the remote gate shut");
        }
    }

    /// A `BacklogCli` that records every argument array it is handed.
    #[derive(Default)]
    struct FakeCli {
        calls: RefCell<Vec<Vec<String>>>,
    }

    impl BacklogCli for FakeCli {
        fn run(&self, _dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
            self.calls.borrow_mut().push(args.to_vec());
            let stdout = if args == ["--version"] {
                update::MIN_VERSION.to_string()
            } else {
                String::new()
            };
            Ok(CliRun {
                success: true,
                code: Some(0),
                stdout,
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
        let mut workspace = ProjectState::default();
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

    // TASK-42 AC #1/#3: the whole load→interpret path, driven from a hand-edited projects.toml
    // rather than from an entry built in the test. doc-3 §3.3 makes an alias whose value is not a
    // canonical column invalid *and* leaves the status it names 未分類; the bug this pins was in
    // what `LoadedLedger::load` handed over (it deleted the pair, so 名称一致 rescued `Done` into
    // the Done column), which no unit test of `map_status` alone could see.
    #[test]
    fn an_invalid_alias_in_the_ledger_file_leaves_that_status_unmapped() {
        let (temp, _) = root();
        temp.write(
            "backlog/tasks/task-2 - b.md",
            &task_file("TASK-2", "Done", "[]"),
        );
        let ledger_path = temp.path.join("projects.toml");
        // The temp path goes through `toml_path`, not into `"{}"`: on Windows the path is
        // `C:\Users\…`, whose `\U` is an invalid escape inside a basic string, and the parse would
        // fail before this reached the alias it is about. `join` for the same reason a `/` literal
        // is not appended — the value has to be the path this platform spells.
        std::fs::write(
            &ledger_path,
            format!(
                "schema_version = 1\n\
                 [[project]]\n\
                 slug = \"atlas\"\n\
                 project_root = {root}\n\
                 backlog_root = {backlog_root}\n\
                 git_remote_present = false\n\
                 [project.status_aliases]\n\
                 Done = \"Shipped\"\n",
                root = crate::ledger::toml_path(&temp.path),
                backlog_root = crate::ledger::toml_path(&temp.path.join("backlog")),
            ),
        )
        .unwrap();

        let loaded = LoadedLedger::load(&ledger_path).unwrap();
        let entry = &loaded.ledger.projects[0];
        let mut workspace = ProjectState::default();
        let snapshot = workspace.open(entry, &source(entry), &FsVersions).unwrap();

        let view = snapshot
            .tasks
            .iter()
            .find(|v| v.task.id.as_deref() == Some("TASK-2"))
            .expect("the Done task is in the snapshot");
        let status = view.interpretation.status.as_ref().unwrap();
        assert_eq!(
            status.column, None,
            "an invalid alias must not fall back to 名称一致"
        );
        assert_eq!(status.raw, "Done", "未分類区画 shows the original string");
        // `Done` is declared in config.yml, so this stays the ordinary 未分類 case: decision-4
        // reserves the stronger 想定外スキーマ mark for a status config.yml does not declare, and
        // the fault here is in Atlas's own ledger, not in the task file.
        assert_eq!(status.declaration, StatusDeclaration::Declared);
        assert!(!status.is_undeclared());
    }

    #[test]
    fn snapshot_reaches_the_wire_as_camel_case() {
        let (_temp, entry) = root();
        let mut workspace = ProjectState::default();
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
        let mut workspace = ProjectState::default();
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
        let error = ProjectState::default()
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap_err();
        assert!(matches!(
            error,
            CommandError::RootUnreadable { ref slug, .. } if slug == "broken"
        ));
    }

    // --- 履歴読取の取消 (decision-19, TASK-87 AC #1/#3) -------------------------------------------

    #[test]
    fn a_newer_read_of_the_same_task_cancels_the_one_before_it() {
        // AC #3 タスク切替と再取得: both arrive here as a *new* read of some task, and the 引き継ぎ is
        // what ends the previous one's `gh` — the frontend's own 取消 is a second route, not the only
        // one, so this must hold with no cancel command sent at all.
        let state = AtlasState::default();
        let now = Instant::now();
        let (_first, first) = begin_history_read(&state, "g1-1", "alpha", "TASK-1", now);
        assert!(!first.is_cancelled(), "a read starts uncancelled");

        // 再取得: the same task read again.
        let (_second, second) = begin_history_read(&state, "g1-2", "alpha", "TASK-1", now);
        assert!(first.is_cancelled(), "the older read of the task is ended");
        assert!(!second.is_cancelled(), "the read that replaced it is not");

        // タスク切替: a different task is a different read, and must not end this one.
        let (_other, other) = begin_history_read(&state, "g1-3", "alpha", "TASK-2", now);
        assert!(
            !second.is_cancelled(),
            "another task's read must not cancel this one"
        );
        // Nor must a different project's read of the same TASK-ID — ids repeat across projects.
        let (_elsewhere, _) = begin_history_read(&state, "g1-4", "beta", "TASK-2", now);
        assert!(
            !other.is_cancelled(),
            "a same-id read in another project is a different read"
        );
    }

    #[test]
    fn the_cancel_command_ends_the_read_it_names_and_no_other() {
        // AC #1 フロントエンドからの取消: the route the 引き継ぎ cannot cover — a detail panel closing,
        // where no next read arrives to supersede the one running.
        let state = AtlasState::default();
        let now = Instant::now();
        let (_a, a) = begin_history_read(&state, "g1-1", "alpha", "TASK-1", now);
        let (_b, b) = begin_history_read(&state, "g1-2", "alpha", "TASK-2", now);

        cancel_history_read(&state, "g1-1", now);
        assert!(a.is_cancelled(), "the named read is ended");
        assert!(!b.is_cancelled(), "another read is not");

        // Cancelling an id nobody is running is silent: the read may have finished on its own
        // between the screen deciding and this arriving.
        cancel_history_read(&state, "g1-9999", now);
    }

    #[test]
    fn a_finished_read_is_no_longer_cancellable() {
        // The guard is what keeps the registry to the reads still running. Without it a later cancel
        // would set a flag nobody reads, and the map would grow for the life of the process.
        let state = AtlasState::default();
        let now = Instant::now();
        let cancel = {
            let (_registered, cancel) = begin_history_read(&state, "g1-1", "alpha", "TASK-1", now);
            cancel
        };
        assert!(
            lock(&state.history_reads).running.is_empty(),
            "a read that returned is unregistered"
        );
        cancel_history_read(&state, "g1-1", now);
        assert!(
            !cancel.is_cancelled(),
            "a read that already finished cannot be cancelled after the fact"
        );
    }

    #[test]
    fn a_cancel_that_arrives_before_its_read_still_ends_it() {
        // [P1], PR #44 round 1. `task_history_read` and `task_history_cancel` are independent
        // `(async)` commands, so closing the panel right after a read starts can run the cancel
        // first. Dropping the unknown id would leave the read to register uncancelled and wait out
        // its deadline — and a switch to a different task has no 引き継ぎ to catch it.
        let state = AtlasState::default();
        let now = Instant::now();

        cancel_history_read(&state, "g1-1", now);
        let (_registered, cancel) = begin_history_read(&state, "g1-1", "alpha", "TASK-1", now);

        assert!(
            cancel.is_cancelled(),
            "a read whose 取消 got there first must start already cancelled"
        );
        // Consumed, not left behind: the registration took it, so nothing about this read is left
        // in the map for anything else to find.
        assert!(lock(&state.history_reads).early.is_empty());
        // And it is one read that was cancelled, not the registry as a whole.
        let (_other, other) = begin_history_read(&state, "g1-2", "alpha", "TASK-2", now);
        assert!(
            !other.is_cancelled(),
            "one early 取消 cancels one read, not every later one"
        );
    }

    #[test]
    fn two_loader_generations_reusing_a_call_number_stay_separate_reads() {
        // [P1], PR #44 round 2. A webview reload starts a fresh loader whose call counter is 1 again
        // while `AtlasState` and a read still waiting on `gh` live on. Were the identifier the bare
        // counter, the new read's registration would replace the old one's and the old guard would
        // then remove the *new* one — leaving a running `gh` nothing can reach.
        let state = AtlasState::default();
        let now = Instant::now();

        let (old_guard, old) = begin_history_read(&state, "gen-a-1", "alpha", "TASK-1", now);
        // The reload's first read: same call number, different generation, and here a different
        // task, which is the case with no 引き継ぎ behind it.
        let (new_guard, new) = begin_history_read(&state, "gen-b-1", "alpha", "TASK-2", now);
        assert_eq!(
            lock(&state.history_reads).running.len(),
            2,
            "neither registration may replace the other"
        );

        // The new panel closes. Its 取消 reaches its own read and leaves the other running.
        cancel_history_read(&state, "gen-b-1", now);
        assert!(new.is_cancelled());
        assert!(!old.is_cancelled(), "the older read is a different read");

        // The new read returns; its guard takes its own entry and leaves the older one reachable.
        drop(new_guard);
        cancel_history_read(&state, "gen-a-1", now);
        assert!(
            old.is_cancelled(),
            "the surviving read must still be reachable by its own identifier"
        );
        drop(old_guard);
        assert!(lock(&state.history_reads).running.is_empty());
    }

    #[test]
    fn an_early_cancel_nothing_claims_is_forgotten() {
        // The other half: an id that never registers must not stay, or the map grows for the life of
        // the process. What bounds the wait is the race's own scale — the gap between two invokes —
        // so an entry older than that belongs to a read that is not coming.
        let state = AtlasState::default();
        let arrived = Instant::now();
        cancel_history_read(&state, "g1-1", arrived);

        let much_later = arrived + EARLY_CANCEL_RETENTION + Duration::from_secs(1);
        let (_registered, cancel) =
            begin_history_read(&state, "g1-1", "alpha", "TASK-1", much_later);

        assert!(
            !cancel.is_cancelled(),
            "a stale 取消 must not end a read that had nothing to do with it"
        );
        assert!(
            lock(&state.history_reads).early.is_empty(),
            "and is dropped"
        );
    }

    #[test]
    fn a_closed_project_cannot_be_updated_or_read_for_history() {
        let (_temp, entry) = root();
        let workspace = ProjectState::default();
        assert!(matches!(
            workspace.task_references(&entry, "TASK-1").unwrap_err(),
            CommandError::ProjectNotOpen { .. }
        ));
    }

    // --- 外部エディタ経路 (doc-8 §7, TASK-37) ---------------------------------------------------

    struct FixedEnv(&'static str);

    impl Environment for FixedEnv {
        fn var(&self, name: &str) -> Option<String> {
            (name == "EDITOR").then(|| self.0.to_string())
        }
    }

    #[derive(Default)]
    struct RecordingLauncher {
        spawns: RefCell<Vec<(String, Vec<String>)>>,
    }

    impl Launcher for RecordingLauncher {
        fn spawn(&self, program: &str, args: &[String]) -> std::io::Result<()> {
            self.spawns
                .borrow_mut()
                .push((program.to_string(), args.to_vec()));
            Ok(())
        }

        /// The boundary's tests all use `LaunchMethod::Configured`, which is a spawn on every platform;
        /// which OS call the association method takes is `editor`'s decision and is asserted there.
        fn shell_execute(
            &self,
            _target: &std::ffi::OsStr,
        ) -> Result<(), crate::editor::LaunchFailure> {
            unreachable!("the boundary's tests launch the configured editor, which is a spawn")
        }

        /// Only 既定ブラウザ起動 observes its launch (doc-8 §9.3), and that command takes no project or
        /// task — so it needs none of this module's fixtures and is asserted in `editor`'s own tests.
        fn spawn_observed(
            &self,
            _program: &str,
            _args: &[String],
        ) -> std::io::Result<Option<String>> {
            unreachable!("the boundary's tests do not open a 本文リンク")
        }
    }

    #[test]
    fn the_editor_receives_the_task_file_and_atlas_writes_nothing() {
        let (temp, entry) = root();
        let mut workspace = ProjectState::default();
        let snapshot = workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();
        let path = snapshot.tasks[0].task.source_path.clone();
        let before = std::fs::read_to_string(&path).unwrap();

        let launcher = RecordingLauncher::default();
        let launch = workspace
            .open_in_editor(
                &entry,
                &path,
                LaunchMethod::Configured,
                None,
                &FixedEnv("my-editor"),
                &launcher,
            )
            .unwrap();

        assert_eq!(launch.program, "my-editor");
        assert_eq!(
            launcher.spawns.borrow().as_slice(),
            &[(
                "my-editor".to_string(),
                vec![path.to_string_lossy().into_owned()]
            )],
            "the management file itself is opened (doc-8 §7 直接開く方式)"
        );
        // AC #1: the only effect is a spawned process. Nothing in this path writes managed Markdown.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
        drop(temp);
    }

    #[test]
    fn a_path_the_model_does_not_hold_starts_nothing() {
        // The frontend echoes back a path it received from a read; anything else is a stale screen or
        // a value that never came from one, and either way it must not reach a process.
        let (temp, entry) = root();
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let launcher = RecordingLauncher::default();
        let outside = temp.path.join("backlog/../../etc/passwd");
        let error = workspace
            .open_in_editor(
                &entry,
                &outside,
                LaunchMethod::Configured,
                None,
                &FixedEnv("my-editor"),
                &launcher,
            )
            .unwrap_err();

        assert!(matches!(error, CommandError::UnknownTaskFile { .. }));
        assert!(launcher.spawns.borrow().is_empty(), "nothing was launched");
    }

    #[test]
    fn a_task_the_cli_cannot_edit_is_still_openable() {
        // doc-8 §6.5 / doc-5 §3.1 point at this route for exactly these tasks (`task edit` answers
        // "not found" for a completed one), so it must not be gated on 保存区分 or on the CLI probe.
        let (temp, entry) = root();
        temp.write(
            "backlog/completed/task-2 - done.md",
            &task_file("TASK-2", "Done", "[]"),
        );
        let mut workspace = ProjectState::default();
        let snapshot = workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();
        let completed = snapshot
            .tasks
            .iter()
            .find(|view| view.task.id.as_deref() == Some("TASK-2"))
            .expect("the completed task is in the model");
        assert_eq!(
            completed.task.storage_state,
            Some(crate::domain::StorageState::Completed)
        );

        let launcher = RecordingLauncher::default();
        workspace
            .open_in_editor(
                &entry,
                &completed.task.source_path,
                LaunchMethod::Configured,
                None,
                &FixedEnv("my-editor"),
                &launcher,
            )
            .unwrap();
        assert_eq!(launcher.spawns.borrow().len(), 1);
    }

    #[test]
    fn a_closed_project_cannot_open_an_editor() {
        let (_temp, entry) = root();
        let error = ProjectState::default()
            .open_in_editor(
                &entry,
                Path::new("/anywhere/task-1 - a.md"),
                LaunchMethod::Association,
                None,
                &FixedEnv("my-editor"),
                &RecordingLauncher::default(),
            )
            .unwrap_err();
        // Checked before anything is launched: without an open model there is no set of task files to
        // resolve the path against.
        assert!(matches!(error, CommandError::ProjectNotOpen { .. }));
    }

    #[test]
    fn the_editor_launch_wire_shape_matches_the_frontend() {
        // `src/lib/wire.ts` is hand-written, so a rename on either side would otherwise only surface
        // as a runtime failure inside the running app.
        let method: LaunchMethod = serde_json::from_value(serde_json::json!("configured")).unwrap();
        assert_eq!(method, LaunchMethod::Configured);
        let method: LaunchMethod =
            serde_json::from_value(serde_json::json!("association")).unwrap();
        assert_eq!(method, LaunchMethod::Association);

        let readiness = editor::probe(None, &FixedEnv("code -w"));
        let json = serde_json::to_value(&readiness).unwrap();
        assert_eq!(json["configured"]["source"], "editor");
        assert_eq!(json["configured"]["program"], "code");
        assert_eq!(json["configured"]["args"][0], "-w");
        // Always a string, never `null`: every platform has an association launcher (TASK-44), and the
        // frontend's `association: string` would read a `null` as the launcher's *name*.
        assert!(
            json["association"].is_string(),
            "expected a launcher name, got {}",
            json["association"]
        );

        let launch = editor::plan(
            None,
            &FixedEnv("code"),
            LaunchMethod::Configured,
            Path::new("/roots/p/tasks/task-1 - a.md"),
        )
        .unwrap();
        let json = serde_json::to_value(&launch).unwrap();
        assert_eq!(json["method"], "configured");
        assert_eq!(json["program"], "code");
        assert_eq!(json["args"][0], "/roots/p/tasks/task-1 - a.md");
    }

    /// アプリ設定 の wire 形 (decision-13, TASK-46 AC #2). `src/lib/wire.ts` is hand-written, so a
    /// renamed key would otherwise only surface inside the running app — and here the key names are
    /// also the *file's* keys, so a rename would silently orphan every saved settings file.
    #[test]
    fn the_settings_wire_shape_matches_the_frontend() {
        use crate::settings::SettingsStatus;

        let loaded = LoadedSettings {
            settings: AppSettings::default(),
            status: SettingsStatus::Absent,
        };
        let json = serde_json::to_value(&loaded).unwrap();
        assert_eq!(json["status"]["state"], "absent");
        assert_eq!(
            json["settings"]["schema_version"],
            crate::settings::KNOWN_SCHEMA_VERSION
        );
        assert_eq!(json["settings"]["card_density"], "m");
        assert_eq!(json["settings"]["default_storage_filter"][0], "active");
        assert_eq!(json["settings"]["default_detail_placement"], "sidebar");
        assert_eq!(json["settings"]["watch_external_changes"], true);
        assert!(json["settings"]["theme"].is_null());
        // 未設定 の外部エディタ指定 is absent from the payload, not `null`: the field is skipped so the
        // written file stays terse, and the frontend's optional field mirrors that.
        assert!(json["settings"].get("external_editor").is_none());

        let json = serde_json::to_value(SettingsStatus::ReadOnly { version: 2 }).unwrap();
        assert_eq!(json["state"], "readOnly");
        assert_eq!(json["version"], 2);

        // `settings_save` takes the same shape back from the frontend, so it must round-trip.
        let sent = AppSettings {
            external_editor: Some(EditorCommand {
                program: "code".into(),
                args: vec!["-w".into()],
            }),
            ..AppSettings::default()
        };
        let round: AppSettings =
            serde_json::from_value(serde_json::to_value(&sent).unwrap()).unwrap();
        assert_eq!(round, sent);
    }

    // --- AC #4: user input travels as argument-array elements, never a shell string --------------

    #[test]
    fn user_input_reaches_the_cli_as_one_argument_element() {
        let (_temp, entry) = root();
        let mut workspace = ProjectState::default();
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
                &store::SystemFiles,
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

    #[test]
    fn the_detail_screen_edit_shapes_deserialize() {
        // The remaining shapes タスク詳細の GUI 編集 (TASK-36) emits. The frontend's wire types are
        // hand-written (`src/lib/wire.ts`), so a rename on either side would otherwise only show up
        // as a runtime deserialization error inside the running app.
        let json = serde_json::json!({
            "op": "taskEdit",
            "taskId": "TASK-1",
            "edit": {
                "notes": { "mode": "set", "text": "replaced" },
                "removeLabels": ["ui"],
                "references": ["https://example.test/1", "https://example.test/pull/2"],
                "dependencies": ["TASK-2"],
                "ac": {
                    "mode": "replace",
                    "existing": 2,
                    "items": [{ "text": "first", "checked": true }]
                }
            }
        });
        let UpdateOperation::TaskEdit { edit, .. } = serde_json::from_value(json).unwrap() else {
            panic!("expected a task edit");
        };
        assert!(matches!(&edit.notes, NoteEdit::Set(text) if text == "replaced"));
        assert_eq!(edit.remove_labels, vec!["ui".to_string()]);
        assert_eq!(edit.references.as_ref().map(Vec::len), Some(2));
        assert_eq!(
            edit.dependencies.as_deref(),
            Some(["TASK-2".to_string()].as_slice())
        );
        let AcEdit::Replace { existing, items } = &edit.ac else {
            panic!("expected an AC replacement");
        };
        assert_eq!(*existing, 2);
        assert_eq!(items.len(), 1);
        assert!(items[0].checked);
    }

    /// End-to-end against the *real* `backlog` on PATH: the JSON タスク詳細 sends, through the
    /// operation map, into a file the read layer then re-reads. It is the only test that proves the
    /// composite AC replacement and the References 全置換 behave on v1.50.1 the way doc-5 §3 says
    /// they do — every other test stops at the argument array.
    ///
    /// `#[ignore]` by default for the same reason as the watch test in `sync.rs`: it asserts on an
    /// environment property (a supported `backlog` being installed), and a machine without one
    /// would go red for something that is not a code defect. Run it where the CLI is available:
    /// `cargo test --lib -- --ignored the_frontend_edit_reaches_the_real_cli`
    #[test]
    #[ignore = "requires a supported backlog CLI on PATH"]
    fn the_frontend_edit_reaches_the_real_cli() {
        let temp = TempDir::new();
        temp.write(
            "backlog/config.yml",
            "project_name: Atlas E2E\n\
statuses: [\"To Do\", \"In Progress\", \"Done\"]\n\
default_status: To Do\n\
task_prefix: \"TASK\"\n",
        );
        temp.write(
            "backlog/tasks/task-1 - sample.md",
            "---\n\
id: TASK-1\n\
title: sample\n\
status: To Do\n\
labels: []\n\
references:\n  - https://example.test/one\n\
---\n\n\
## Description\n\n\
<!-- SECTION:DESCRIPTION:BEGIN -->\nbefore\n<!-- SECTION:DESCRIPTION:END -->\n\n\
## Acceptance Criteria\n\
<!-- AC:BEGIN -->\n- [ ] #1 first\n- [ ] #2 second\n<!-- AC:END -->\n",
        );
        let entry = ProjectEntry {
            slug: "atlas".to_string(),
            project_root: temp.path.clone(),
            backlog_root: temp.path.join("backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };

        let cli = SystemBacklog::resolve(None);
        let CliStatus::Supported(capability) = update::probe(&cli) else {
            panic!("this test needs a supported backlog CLI on PATH");
        };
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // Exactly what `buildSave` emits for: a multi-line description, References 全置換 with
        // the existing URL kept, and AC 全体差し替え as the composite (doc-5 §3).
        let action: Vec<UpdateOperation> = serde_json::from_value(serde_json::json!([{
            "op": "taskEdit",
            "taskId": "TASK-1",
            "edit": {
                "description": "after\n二行目",
                "references": ["https://example.test/one", "https://example.test/pull/2"],
                "ac": {
                    "mode": "replace",
                    "existing": 2,
                    "items": [
                        { "text": "new one", "checked": false },
                        { "text": "new two", "checked": true }
                    ]
                }
            }
        }]))
        .unwrap();

        let result = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
                &store::SystemFiles,
            )
            .unwrap();
        let UpdateResult::Ran { outcome, project } = result else {
            panic!("expected the CLI to run");
        };
        assert_eq!(
            outcome,
            UpdateOutcome::Succeeded,
            "the CLI accepted the edit"
        );

        // The re-read (doc-5 §6) is what the panel then compares its submitted values against.
        let project = project.expect("a success re-reads the root");
        let task = &project
            .tasks
            .iter()
            .find(|view| view.task.id.as_deref() == Some("TASK-1"))
            .expect("the task is still there")
            .task;
        assert_eq!(task.description.as_deref(), Some("after\n二行目"));
        assert_eq!(
            task.references,
            vec![
                "https://example.test/one".to_string(),
                "https://example.test/pull/2".to_string()
            ]
        );
        let ac: Vec<(&str, bool)> = task
            .acceptance_criteria
            .iter()
            .map(|item| (item.text.as_str(), item.checked))
            .collect();
        assert_eq!(ac, vec![("new one", false), ("new two", true)]);
    }

    /// The per-item AC edit's index frames, end to end against the real CLI. One `task edit`
    /// resolves `--remove-ac` against the criteria as read but `--check-ac` against what is left
    /// after the removals (measured on v1.50.1), so a delta carrying the numbers the user pointed
    /// at would check a different criterion — silently, whenever the shifted index is still in
    /// range. The frontend renumbers before sending; this pins what the renumbered form does.
    ///
    /// `#[ignore]` for the same reason as the test above: it needs a supported `backlog` on PATH.
    /// `cargo test --lib -- --ignored the_renumbered_ac_delta_hits_the_intended_criterion`
    #[test]
    #[ignore = "requires a supported backlog CLI on PATH"]
    fn the_renumbered_ac_delta_hits_the_intended_criterion() {
        let temp = TempDir::new();
        temp.write(
            "backlog/config.yml",
            "project_name: Atlas E2E\n\
statuses: [\"To Do\", \"Done\"]\n\
default_status: To Do\n\
task_prefix: \"TASK\"\n",
        );
        temp.write(
            "backlog/tasks/task-1 - sample.md",
            "---\n\
id: TASK-1\n\
title: sample\n\
status: To Do\n\
labels: []\n\
---\n\n\
## Acceptance Criteria\n\
<!-- AC:BEGIN -->\n- [ ] #1 one\n- [ ] #2 two\n- [ ] #3 three\n<!-- AC:END -->\n",
        );
        let entry = ProjectEntry {
            slug: "atlas".to_string(),
            project_root: temp.path.clone(),
            backlog_root: temp.path.join("backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };

        let cli = SystemBacklog::resolve(None);
        let CliStatus::Supported(capability) = update::probe(&cli) else {
            panic!("this test needs a supported backlog CLI on PATH");
        };
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // The user marked #1 for removal and checked #2. `check: [1]` — not `[2]` — is what the
        // frontend sends, because #2 becomes the first criterion once #1 is gone.
        let action: Vec<UpdateOperation> = serde_json::from_value(serde_json::json!([{
            "op": "taskEdit",
            "taskId": "TASK-1",
            "edit": { "ac": { "mode": "delta", "remove": [1], "check": [1] } }
        }]))
        .unwrap();

        let UpdateResult::Ran { outcome, project } = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
                &store::SystemFiles,
            )
            .unwrap()
        else {
            panic!("expected the CLI to run");
        };
        assert_eq!(outcome, UpdateOutcome::Succeeded);
        let project = project.expect("a success re-reads the root");
        let task = &project
            .tasks
            .iter()
            .find(|view| view.task.id.as_deref() == Some("TASK-1"))
            .expect("the task is still there")
            .task;
        let ac: Vec<(&str, bool)> = task
            .acceptance_criteria
            .iter()
            .map(|item| (item.text.as_str(), item.checked))
            .collect();
        // `two` is checked and `three` is not: the check landed on the criterion the user pointed
        // at, not on whatever ended up at index 2 after the removal.
        assert_eq!(ac, vec![("two", true), ("three", false)]);
    }

    #[test]
    fn the_detail_screen_transition_shapes_deserialize() {
        // 状態遷移の入口 (doc-8 §6.5): each carries the id under the name its 保存区分 uses —
        // `taskId` for the active-side transitions, `draftId` for the draft-side ones (doc-5 §3.3).
        let of = |json: serde_json::Value| serde_json::from_value::<UpdateOperation>(json).unwrap();
        assert!(matches!(
            of(serde_json::json!({ "op": "taskComplete", "taskId": "TASK-1" })),
            UpdateOperation::TaskComplete { task_id } if task_id == "TASK-1"
        ));
        assert!(matches!(
            of(serde_json::json!({ "op": "taskDemote", "taskId": "TASK-1" })),
            UpdateOperation::TaskDemote { task_id } if task_id == "TASK-1"
        ));
        assert!(matches!(
            of(serde_json::json!({ "op": "taskArchive", "taskId": "TASK-1" })),
            UpdateOperation::TaskArchive { task_id } if task_id == "TASK-1"
        ));
        assert!(matches!(
            of(serde_json::json!({ "op": "draftPromote", "draftId": "DRAFT-1" })),
            UpdateOperation::DraftPromote { draft_id } if draft_id == "DRAFT-1"
        ));
        assert!(matches!(
            of(serde_json::json!({ "op": "draftArchive", "draftId": "DRAFT-1" })),
            UpdateOperation::DraftArchive { draft_id } if draft_id == "DRAFT-1"
        ));
    }

    // --- AC #3: conflict, refusal and 照合不能 are distinct typed results ------------------------

    #[test]
    fn a_diverged_target_withholds_the_cli_and_returns_a_conflict() {
        let (temp, entry) = root();
        let mut workspace = ProjectState::default();
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
                &store::SystemFiles,
            )
            .unwrap();

        let UpdateResult::Conflict {
            diverged, project, ..
        } = result
        else {
            panic!("expected a conflict");
        };
        assert_eq!(diverged.len(), 1, "got {diverged:?}");
        assert!(diverged[0].ends_with("task-1 - a.md"));
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
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let cli = FakeCli::default();
        let capability = capability(&cli);
        // The root carries no milestone `m-1`, so the rename has no file to check against — refused
        // before launch, and doc-9 §5 requires it to read differently from a conflict: no divergence
        // was observed, there is no defined way to look for one.
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
                &store::SystemFiles,
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
    fn a_milestone_rename_is_checked_and_launched_now_that_doc_9_defines_its_set() {
        // TASK-45: before doc-9 §4.2 fixed the 参照追随書き換え rule, this same action was refused at
        // the boundary. It now resolves to the milestone file plus its 参照タスク集合, and — every
        // member being in sync — reaches the CLI.
        let (temp, entry) = root();
        temp.write(
            "backlog/milestones/m-1 - phase-one.md",
            "---\nid: m-1\ntitle: Phase One\n---\n\n## Description\n\nd\n",
        );
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let cli = FakeCli::default();
        let capability = capability(&cli);
        let action = vec![UpdateOperation::MilestoneRename {
            from: "m-1".to_string(),
            to: "Phase 1".to_string(),
            update_tasks: true,
        }];
        let result = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
                &store::SystemFiles,
            )
            .unwrap();

        assert!(matches!(
            result,
            UpdateResult::Ran {
                outcome: UpdateOutcome::Succeeded,
                ..
            }
        ));
        assert!(cli
            .calls
            .borrow()
            .iter()
            .any(|args| args.first().map(String::as_str) == Some("milestone")));
    }

    #[test]
    fn a_refused_operation_reports_the_refusal_not_a_failure() {
        let (_temp, entry) = root();
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        let cli = FakeCli::default();
        let capability = capability(&cli);
        // A `task edit` that would set no field is refused before launch (doc-5 §5): the CLI would
        // exit 0 having changed nothing, so issuing it would report a save that did not happen.
        let action = vec![UpdateOperation::TaskEdit {
            task_id: "TASK-1".to_string(),
            edit: TaskEdit::default(),
        }];
        let error = workspace
            .apply(
                &entry,
                &action,
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
                &store::SystemFiles,
            )
            .unwrap_err();
        assert!(matches!(error, CommandError::UpdateRejected { .. }));

        // An action with nothing in it is refused the same way: it would otherwise launch no
        // invocation and still be reported as a success.
        let error = workspace
            .apply(
                &entry,
                &[],
                &capability,
                &cli,
                &source(&entry),
                &FsVersions,
                &store::SystemFiles,
            )
            .unwrap_err();
        assert!(matches!(error, CommandError::UpdateRejected { .. }));
    }

    #[test]
    fn a_successful_update_returns_the_re_read_root() {
        let (temp, entry) = root();
        let mut workspace = ProjectState::default();
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
            fn run(&self, _dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
                self.calls.borrow_mut().push(args.to_vec());
                if args != ["--version"] {
                    std::fs::write(
                        self.temp_path.join("backlog/tasks/task-1 - a.md"),
                        "---\nid: TASK-1\ntitle: Task TASK-1\nstatus: Done\nlabels: []\n---\n\n",
                    )
                    .map_err(RunError::Spawn)?;
                }
                let stdout = if args == ["--version"] {
                    update::MIN_VERSION.to_string()
                } else {
                    String::new()
                };
                Ok(CliRun {
                    success: true,
                    code: Some(0),
                    stdout,
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
                &store::SystemFiles,
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
                &store::SystemFiles,
            )
            .unwrap();
        assert!(matches!(result, UpdateResult::Ran { .. }));
    }

    // --- 縮退 and error wire shapes -------------------------------------------------------------

    // decision-6: コミット該当なし (searched, nothing matched) and Git 対象不在 must reach the screen
    // as different values, and neither may fail the read that carries the PR 区画 beside them.
    #[test]
    fn a_commit_search_keeps_該当なし_and_対象不在_apart() {
        let searched = CommitSearch::of(Ok(vec![]), Path::new("/tmp/x"));
        let json = serde_json::to_value(&searched).unwrap();
        assert_eq!(json["state"], "searched");
        assert_eq!(json["commits"].as_array().unwrap().len(), 0);

        let absent = CommitSearch::of(Err(HistoryError::NotAGitRepo), Path::new("/tmp/x"));
        let json = serde_json::to_value(&absent).unwrap();
        assert_eq!(json["state"], "noRepository");
        assert_eq!(json["projectRoot"], "/tmp/x");

        let unreadable = CommitSearch::of(
            Err(HistoryError::CommandFailed {
                args: vec!["log".to_string()],
                stderr: "fatal: bad revision".to_string(),
            }),
            Path::new("/tmp/x"),
        );
        assert_eq!(
            serde_json::to_value(&unreadable).unwrap()["state"],
            "unreadable"
        );
    }

    #[test]
    fn a_history_read_carries_relations_and_honors_the_remote_gate() {
        // The payload gains the relation list (AC #2), and with the project's Git remote 有無属性
        // false the gate stays shut — `NeverCalled` proves nothing left the machine even though the
        // task carries a well-formed GitHub PR URL (doc-6 §6 縮退).
        let temp = TempDir::new();
        temp.write("backlog/config.yml", CONFIG);
        temp.write(
            "backlog/tasks/task-1 - a.md",
            &format!(
                "{}\n## References\n\n- https://github.com/o/r/pull/5\n",
                task_file("TASK-1", "Doing", "[]")
            ),
        );
        let entry = ProjectEntry {
            slug: "atlas".to_string(),
            project_root: temp.path.clone(),
            backlog_root: temp.path.join("backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };
        let mut workspace = ProjectState::default();
        workspace
            .open(&entry, &source(&entry), &FsVersions)
            .unwrap();

        // The split the command performs: References under the lock, subprocesses with none held.
        let references = workspace.task_references(&entry, "TASK-1").unwrap();
        assert_eq!(
            references,
            vec!["https://github.com/o/r/pull/5".to_string()]
        );
        let history = read_history(
            &ExternalProgram::git(None),
            &entry,
            "TASK-1",
            &references,
            &NeverCalled,
            &Cancel::new(),
        )
        .expect("nothing cancelled this read");
        assert!(history.remote.is_none());
        assert!(history.relations.is_empty());
        let json = serde_json::to_value(&history).unwrap();
        assert!(
            json.get("relations").is_some(),
            "AC #2: relations は payload に載る"
        );
    }

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
        let json = serde_json::to_value(CommandError::TaskNotFound {
            slug: "atlas".to_string(),
            task_id: "TASK-404".to_string(),
        })
        .unwrap();
        assert_eq!(json["kind"], "taskNotFound");
        // The variant's fields stay snake_case: serde's container `rename_all` renames variants,
        // not their fields, and the frontend mirrors what is actually emitted.
        assert_eq!(json["task_id"], "TASK-404");

        // doc-5 §6: a reload failure must say whether the update already landed.
        let json = serde_json::to_value(CommandError::ReloadFailed {
            detail: "config.yml could not be read".to_string(),
            applied: Some(UpdateOutcome::Succeeded),
        })
        .unwrap();
        assert_eq!(json["kind"], "reloadFailed");
        assert_eq!(json["applied"]["state"], "succeeded");
    }

    // --- 台帳操作の拒否理由 (doc-3 §4, TASK-39) --------------------------------------------------

    /// The 台帳管理画面 has to send the user back to the field that will get them past a refusal
    /// (doc-3 §3.1 別 slug 指定で回復 / §4.1 理由付き提示), so every refusal has to arrive as a value
    /// with the offending input in it — not as a sentence the screen would have to parse.
    #[test]
    fn a_refused_ledger_operation_names_the_refusal_and_the_offending_value() {
        let cases: Vec<(LedgerError, &str, &str, &str)> = vec![
            (
                LedgerError::DuplicateSlug("geomyth".into()),
                "duplicateSlug",
                "slug",
                "geomyth",
            ),
            (
                LedgerError::InvalidSlug("Bad Slug".into()),
                "invalidSlug",
                "slug",
                "Bad Slug",
            ),
            (
                LedgerError::BacklogRootInvalid("/x/backlog".into()),
                "backlogRootInvalid",
                "path",
                "/x/backlog",
            ),
            (
                LedgerError::NonAbsoluteRoot("relative/path".into()),
                "nonAbsoluteRoot",
                "path",
                "relative/path",
            ),
            (
                // The *holder* of the root, since the fix is to edit that entry.
                LedgerError::DuplicateRoot("atlas".into()),
                "duplicateRoot",
                "slug",
                "atlas",
            ),
            (
                LedgerError::SlugNotFound("gone".into()),
                "slugNotFound",
                "slug",
                "gone",
            ),
        ];
        for (error, reason, field, value) in cases {
            let json = serde_json::to_value(CommandError::from(error)).unwrap();
            assert_eq!(json["kind"], "ledgerRefused", "for {reason}");
            assert_eq!(json["reason"]["reason"], reason);
            assert_eq!(json["reason"][field], value, "for {reason}");
            // `detail` is kept beside the reason for diagnostics, never as its substitute.
            assert!(json["detail"].as_str().is_some_and(|s| !s.is_empty()));
        }

        // doc-3 §3.3: an alias value that is not a canonical column names both halves, so the screen
        // can point at the row the user typed rather than at the table.
        let json = serde_json::to_value(CommandError::from(LedgerError::InvalidStatusAlias {
            key: "Weird".into(),
            value: "Nonsense".into(),
        }))
        .unwrap();
        assert_eq!(json["reason"]["reason"], "invalidStatusAlias");
        assert_eq!(json["reason"]["key"], "Weird");
        assert_eq!(json["reason"]["value"], "Nonsense");

        // doc-3 §2.2: the read-only guard carries the version, and it is the one refusal no field
        // change gets past — the screen withholds every edit rather than offering a correction.
        let json = serde_json::to_value(CommandError::from(LedgerError::ReadOnly(999))).unwrap();
        assert_eq!(json["reason"]["reason"], "readOnly");
        assert_eq!(json["reason"]["schema_version"], 999);
    }

    /// A ledger *file* failure is not a form the user can fix, and a cross-task-id rejection is not a
    /// ledger edit at all, so neither gains a refusal reason that would imply a correctable field.
    #[test]
    fn ledger_plumbing_and_task_ref_failures_stay_unclassified() {
        for error in [
            LedgerError::Io(std::io::Error::other("disk gone")),
            LedgerError::UnsupportedSchemaVersion(0),
            LedgerError::UnknownProject("nope".into()),
            LedgerError::InvalidTaskId("BUG-1".into()),
            LedgerError::BareIdNeedsContext,
        ] {
            let json = serde_json::to_value(CommandError::from(error)).unwrap();
            assert_eq!(json["kind"], "ledger");
            assert!(json["detail"].as_str().is_some_and(|s| !s.is_empty()));
        }
    }

    /// doc-3 §3.1: the slug default is derived from the project-root directory name, and the screen
    /// previews it through this command instead of re-implementing the rule.
    #[test]
    fn the_default_slug_command_answers_from_the_ledger_rule() {
        assert_eq!(
            ledger_default_slug(PathBuf::from("/x/Backlog Atlas")).as_deref(),
            Some("backlog-atlas")
        );
        // No usable characters: there is no default, and the user has to name one (AC #6).
        assert_eq!(ledger_default_slug(PathBuf::from("/x/___")), None);
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

    /// A watch thread takes its project's プロジェクト単位ロック to re-read, so a detach that joined
    /// while holding that lock would wait for a thread that is waiting for the lock — the deadlock the
    /// detach/join split exists to avoid. Here the thread stands in for that: it cannot finish until
    /// the lock is free, so the detach can only return promptly if it did not join.
    #[test]
    fn detaching_a_watch_does_not_join_it_under_the_project_lock() {
        let state = Arc::new(AtlasState::default());
        let stop = Arc::new(AtomicBool::new(false));

        let detached = with_project(&state, "atlas", |project| {
            // Spawned with the lock already held, so the thread is certain to find it taken — the
            // watch thread's own position inside `reload_for_watch`.
            let thread = std::thread::spawn({
                let state = Arc::clone(&state);
                move || {
                    // Gives up after a bounded wait so a regression fails the assertion below
                    // instead of hanging the suite.
                    let deadline = std::time::Instant::now() + Duration::from_secs(5);
                    while std::time::Instant::now() < deadline {
                        let held = lock(&state.projects).get("atlas").cloned();
                        if held.is_some_and(|lock| lock.try_lock().is_ok()) {
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
            });
            lock(&state.watches).insert(
                "atlas".to_string(),
                WatchHandle {
                    stop: Arc::clone(&stop),
                    thread,
                },
            );

            let started = std::time::Instant::now();
            let detached = detach_watch(&state, project);
            assert!(
                started.elapsed() < Duration::from_secs(1),
                "detach must not block on the watch thread while holding the project lock"
            );
            assert!(detached.is_some(), "the handle must come back to be joined");
            assert!(
                stop.load(Ordering::Relaxed),
                "the thread must be signalled while the lock is held, so the stale watch cannot \
                 outlive the ledger write that staled it"
            );
            assert!(
                lock(&state.watches).is_empty(),
                "a detached watch must be out of the registry before the lock is released"
            );
            detached
        });

        join_watch(detached);
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
            .update(
                &ExternalProgram::git(None),
                &UpdateRequest {
                    slug: "atlas".to_string(),
                    project_root: None,
                    backlog_root: None,
                    redetect_git_remote: false,
                    status_aliases: Some(BTreeMap::from([(
                        "Doing".to_string(),
                        "In Progress".to_string(),
                    )])),
                    new_index: None,
                },
            )
            .unwrap();
        assert_eq!(
            before,
            Some((updated.project_root, updated.backlog_root)),
            "an alias edit must not be read as a move"
        );

        // A move changes both roots — project_root explicitly, backlog_root by defaulting under it.
        let before = entry_roots(&ledger, "atlas");
        let updated = ledger
            .update(
                &ExternalProgram::git(None),
                &UpdateRequest {
                    slug: "atlas".to_string(),
                    project_root: Some(to.path.clone()),
                    backlog_root: None,
                    redetect_git_remote: false,
                    status_aliases: None,
                    new_index: None,
                },
            )
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

    // --- TASK-85 AC #2/#4: one stalled update stalls one project ---------------------------------

    /// A `BacklogCli` that reports it has started and then blocks until released — a `backlog` that
    /// has not exited, without a real process to leave behind if an assertion fails.
    struct StallingCli {
        started: std::sync::mpsc::Sender<()>,
        release: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
    }

    impl BacklogCli for StallingCli {
        fn run(&self, _dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
            // The probe must answer, or the update is refused before it ever reaches the CLI and the
            // test would measure nothing.
            if args == ["--version"] {
                return Ok(CliRun {
                    success: true,
                    code: Some(0),
                    stdout: update::MIN_VERSION.to_string(),
                    stderr: String::new(),
                });
            }
            self.started.send(()).expect("the test is still listening");
            if let Some(release) = self.release.lock().unwrap().take() {
                // Bounded, so a regression fails the assertions instead of hanging the suite.
                let _ = release.recv_timeout(Duration::from_secs(10));
            }
            Ok(CliRun {
                success: true,
                code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }

    /// Two registered projects and the two files Atlas owns, as one temp tree.
    fn two_projects() -> (TempDir, ConfigFiles, ProjectEntry, ProjectEntry) {
        let temp = TempDir::new();
        let mut entries = Vec::new();
        for slug in ["alpha", "beta"] {
            temp.write(&format!("{slug}/backlog/config.yml"), CONFIG);
            temp.write(
                &format!("{slug}/backlog/tasks/task-1 - a.md"),
                &task_file("TASK-1", "To Do", "[]"),
            );
            entries.push(ProjectEntry {
                slug: slug.to_string(),
                project_root: temp.path.join(slug),
                backlog_root: temp.path.join(slug).join("backlog"),
                git_remote_present: false,
                status_aliases: BTreeMap::new(),
            });
        }
        let files = ConfigFiles {
            directory: temp.path.clone(),
            ledger: temp.path.join("projects.toml"),
            settings: temp.path.join("settings.toml"),
        };
        let mut toml = String::from("schema_version = 1\n");
        for entry in &entries {
            // Through `toml_path` rather than `"{}"` for the reason TASK-59 fixed: a Windows path's
            // backslashes are invalid escapes inside a basic string.
            toml.push_str(&format!(
                "[[project]]\n\
                 slug = \"{slug}\"\n\
                 project_root = {root}\n\
                 backlog_root = {backlog_root}\n\
                 git_remote_present = false\n",
                slug = entry.slug,
                root = crate::ledger::toml_path(&entry.project_root),
                backlog_root = crate::ledger::toml_path(&entry.backlog_root),
            ));
        }
        std::fs::write(&files.ledger, toml).unwrap();
        let beta = entries.pop().unwrap();
        let alpha = entries.pop().unwrap();
        (temp, files, alpha, beta)
    }

    /// The whole point of decision-18: while `alpha`'s update sits inside a `backlog` that has not
    /// exited, `beta`'s read and both settings paths still complete. Under the single boundary-wide
    /// lock this replaced, every one of them would wait for that CLI.
    ///
    /// The waits below are bounded rather than unbounded so a regression fails here instead of
    /// hanging the suite, and the CLI announces itself before blocking so the measurement starts only
    /// once the update is provably inside `alpha`'s lock.
    #[test]
    fn a_stalled_update_holds_up_neither_another_project_nor_the_settings() {
        let (_temp, files, alpha, beta) = two_projects();
        let state = Arc::new(AtlasState::default());
        // Both open first: an update needs a session, and `beta`'s read below is then the ordinary
        // re-read a user or a watch would trigger, not a first open.
        for entry in [&alpha, &beta] {
            with_project(&state, &entry.slug, |project| {
                project.state.open(entry, &source(entry), &FsVersions)
            })
            .unwrap();
        }

        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let updating = std::thread::spawn({
            let state = Arc::clone(&state);
            let files = files.clone();
            move || {
                let cli = StallingCli {
                    started: started_tx,
                    release: Mutex::new(Some(release_rx)),
                };
                with_project(&state, "alpha", |project| {
                    let entry = entry_for(&files, project)?;
                    let capability = match update::probe(&cli) {
                        CliStatus::Supported(capability) => capability,
                        other => panic!("the stalling CLI reports a supported version: {other:?}"),
                    };
                    let action = vec![UpdateOperation::TaskEdit {
                        task_id: "TASK-1".to_string(),
                        edit: TaskEdit {
                            status: Some("Done".to_string()),
                            ..TaskEdit::default()
                        },
                    }];
                    project.state.apply(
                        &entry,
                        &action,
                        &capability,
                        &cli,
                        &source(&entry),
                        &FsVersions,
                        &store::SystemFiles,
                    )
                })
            }
        });
        started_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("the update reached the CLI");

        // From here on `alpha`'s lock is held by a call that cannot return until this thread lets it.
        let started = std::time::Instant::now();
        let reopened = with_project(&state, "beta", |project| {
            let entry = entry_for(&files, project)?;
            project.state.open(&entry, &source(&entry), &FsVersions)
        });
        assert_eq!(reopened.unwrap().slug, "beta", "beta's read must complete");
        assert!(
            load_ledger(&files).is_ok(),
            "the ledger read must complete while an update is stalled"
        );
        assert_eq!(
            read_settings(&files).status,
            crate::settings::SettingsStatus::Absent,
            "the settings read must complete while an update is stalled"
        );
        save_settings(&state, &files, &AppSettings::default())
            .expect("the settings save must complete while an update is stalled");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_secs(5),
            "none of these may wait on another project's CLI, but they took {elapsed:?}"
        );

        // The positive counterpart: `alpha` really was locked all along, so the four calls above did
        // not merely find a lock nobody was holding.
        let alpha_lock = lock(&state.projects).get("alpha").cloned().unwrap();
        assert!(
            alpha_lock.try_lock().is_err(),
            "alpha's own lock must be held by the stalled update"
        );

        release_tx.send(()).unwrap();
        updating.join().unwrap().expect("the update finishes");
    }

    /// TASK-144: what 場所を開く asks about is the **folder**, and the folder is there as soon as
    /// anything has been saved into it. `two_projects` is exactly the state a user reaches by
    /// registering one project — a written ledger, no settings file — and the control that opens the
    /// folder must not read the file's absence as the folder's.
    #[test]
    fn the_folder_is_there_once_either_file_has_been_written() {
        let (temp, files, _alpha, _beta) = two_projects();
        assert_eq!(
            read_settings(&files).status,
            crate::settings::SettingsStatus::Absent,
            "the state under test is a written ledger with no settings file beside it"
        );
        assert!(
            directory_present(&files).unwrap(),
            "the ledger's own save created the folder, so it is there"
        );

        let untouched = ConfigFiles {
            directory: temp.path.join("never-written"),
            ledger: temp.path.join("never-written").join("projects.toml"),
            settings: temp.path.join("never-written").join("settings.toml"),
        };
        assert!(
            !directory_present(&untouched).unwrap(),
            "a first run has written neither file, so there is no folder to open"
        );

        // A plain file at the directory's own path is not a folder to open: the control would
        // otherwise be offered and the association launcher handed a file (PR #92 の [P3]).
        temp.write("not-a-directory", "");
        let file_in_the_way = ConfigFiles {
            directory: temp.path.join("not-a-directory"),
            ledger: temp.path.join("not-a-directory").join("projects.toml"),
            settings: temp.path.join("not-a-directory").join("settings.toml"),
        };
        assert!(
            !directory_present(&file_in_the_way).unwrap(),
            "an entry that is not a directory is not a folder 場所を開く can open"
        );
    }

    /// The other half of the split (AC #2): what the one boundary-wide lock protected for a *single*
    /// project must still be protected. `ledger_update` writes the new roots and then closes the
    /// stale session, and a read of the same project must not land between the two — so it takes the
    /// same lock and waits. A read of a *different* project takes a different lock and does not.
    #[test]
    fn work_on_one_project_serializes_against_work_on_that_same_project_only() {
        let (_temp, files, alpha, _beta) = two_projects();
        let state = Arc::new(AtlasState::default());
        let (same_tx, same_rx) = std::sync::mpsc::channel();
        let (other_tx, other_rx) = std::sync::mpsc::channel();

        let (same, other) = with_project(&state, &alpha.slug, |_holding_alpha| {
            let same = std::thread::spawn({
                let state = Arc::clone(&state);
                let files = files.clone();
                move || {
                    with_project(&state, "alpha", |project| {
                        same_tx.send(entry_for(&files, project).is_ok()).unwrap();
                    });
                }
            });
            let other = std::thread::spawn({
                let state = Arc::clone(&state);
                let files = files.clone();
                move || {
                    with_project(&state, "beta", |project| {
                        other_tx.send(entry_for(&files, project).is_ok()).unwrap();
                    });
                }
            });

            assert_eq!(
                other_rx.recv_timeout(Duration::from_secs(5)),
                Ok(true),
                "another project's work must not wait on this one"
            );
            assert!(
                same_rx.recv_timeout(Duration::from_millis(300)).is_err(),
                "the same project's work must wait while this call holds its lock — without that, a \
                 ledger move could publish new roots while a stale session is still open"
            );
            (same, other)
        });

        // Released now: the same-project work must have been waiting, not refused.
        assert_eq!(
            same_rx.recv_timeout(Duration::from_secs(5)),
            Ok(true),
            "the same project's work runs once the lock is free"
        );
        same.join().unwrap();
        other.join().unwrap();
    }
}
