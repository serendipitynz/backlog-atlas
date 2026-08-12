//! Backlog 更新アダプター — turns an Atlas 更新操作 into a Backlog CLI invocation run with the
//! target project as its working directory (doc-5). Implements doc-5 "Backlog 更新アダプター 設計".
//!
//! The adapter rewrites managed Markdown only where doc-5 §1's 直接書き込み操作 says it does — one
//! operation, マイルストーン説明の更新, under decision-21. Everything else is the Backlog CLI's write
//! (decision-2, doc-5 §2, AGENTS), and this module maps operations to sub-commands, launches them,
//! and reports success or failure by exit code. The seams doc-5 fixes map to the public pieces here:
//!
//! - **操作写像** (doc-5 §3, AC #1): [`UpdateOperation`] → a plan of [`Mapped`]s, built by
//!   [`plan_operation`]. One operation is one sub-command call; `task edit`/`doc update` combine
//!   their fields into a single call rather than one call per field (doc-5 §3 bullet).
//! - **直接書き込み操作** (doc-5 §1, decision-21): the one 更新操作 whose 写像先 is not a sub-command.
//!   [`Mapped::WriteMilestoneDescription`] carries it, and [`DirectWriter`] — implemented by the
//!   freshness layer — performs it, because the file it writes is resolved from the domain model
//!   where its version was just checked. It is a step of the same plan as the CLI calls, so it
//!   cannot be reached around the pre-update check or fall silently out of an action.
//! - **実行ファイル解決の順序** (doc-5 §4, decision-16): [`resolve`] decides *which* executable the
//!   invocations run — アプリ設定 `backlog_cli`, then the プラットフォーム別実行ファイル reached from
//!   an npm shim on Windows, then the bare name `backlog`. It is the only part of this module that
//!   knows anything about how the CLI was installed; everything below it takes the answer as given.
//! - **作業ディレクトリ + 引数配列渡し** (doc-5 §4, AC #2): [`run`] runs each invocation with
//!   `project_root` as `current_dir`, passing every argument as its own array element — never a
//!   shell string, so a value with spaces/newlines/metacharacters cannot word-split or inject.
//! - **CLI 失敗時の扱い** (doc-5 §5, AC #3/#4): the exit code decides success; a non-zero exit, a
//!   spawn failure or a 期限到達 yields [`UpdateOutcome::Failed`] carrying the failure reason, with
//!   the domain model left untouched. A plan of several invocations aborts on the first failure and
//!   reports how many already ran, so what already landed is observable by reload (doc-5 §6).
//! - **CLI 終了期限** (doc-5 §5, decision-18): every launch is bounded by [`CLI_DEADLINE`]. A child
//!   still running at the deadline is killed and reported as [`FailureKind::TimedOut`] — which is
//!   always [`UpdateFailure::reload_required`], because a killed `backlog` may have written before
//!   it died.
//! - **縮退** (doc-5 §3.1/§5, decision-7, AC #5/#6): [`probe`] reads `backlog --version` and only a
//!   version at or above the confirmed [`MIN_VERSION`] yields a [`CliCapability`]. [`run`] takes that
//!   capability by reference, so an update is unreachable without a supported CLI — a missing or
//!   too-old CLI degrades Atlas to read-only by construction, not by a flag a caller might forget.
//!   Operations v1.49.3 cannot perform (emptying references, emptying dependencies, emptying the
//!   assignee list) are unrepresentable or refused *before* any process starts. One class is held
//!   a layer up instead: a comma inside one member of a comma-joined set would split into two
//!   members, and the frontend refuses it before the save is built (`comma.ts`, doc-5 §3 の
//!   制約の先取り) rather than this module rejecting it — the value is well-formed here, and the
//!   webview is the only caller. That refusal covers `--assignee` and `task create --labels`;
//!   `--add-label`/`--remove-label` and `--depends-on` are joined the same way and are not covered
//!   (TASK-155 for the labels), so this header's guarantee does not extend to them either.
//!   The 直接書き込み操作 is gated the same way even though it starts no process: a root Atlas
//!   cannot update through the CLI at all is not one where a single operation should still write.

use crate::read::parse::DescriptionOpener;
use crate::subprocess::{self, Cancel, Stopped};
use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

// --- version probe / capability (doc-5 §3.2, decision-7, AC #6) ---------------------------------

/// The Backlog CLI version the operation map and its option allowlist were fixed against
/// (decision-7 最低バージョン要件, doc-5 §3). This is the *minimum*; decision-7 fixes no upper
/// bound, so any version at or above it is supported and unknown higher versions degrade only when
/// the CLI itself rejects an option (surfaced here as an ordinary CLI failure, doc-5 §5).
pub const MIN_VERSION: Version = Version {
    major: 1,
    minor: 49,
    patch: 3,
};

/// A `major.minor.patch` version, ordered field-major so `>=` is semver comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Version {
    /// Parse `backlog --version` output. Tolerates a leading `v` and trailing text, and treats a
    /// missing minor/patch as 0, so a terse `1` or a decorated `v1.48.0` both parse. `None` when no
    /// leading integer is present at all — that output is not a version we can compare (AC #6).
    pub fn parse(text: &str) -> Option<Version> {
        let token = text.trim().trim_start_matches('v');
        // A version string may be embedded in other output; the version is the first whitespace
        // token, and its numeric head is the part we compare.
        let token = token.split_whitespace().next().unwrap_or(token);
        let mut parts = token.split('.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let patch = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        Some(Version {
            major,
            minor,
            patch,
        })
    }
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// What a `backlog --version` probe determined about the write-side CLI (doc-5 §3.2, decision-7,
/// AC #6). Only [`CliStatus::Supported`] enables updates; the other two mean Atlas runs read-only
/// (reading is file analysis and needs no CLI, decision-2).
#[derive(Debug)]
pub enum CliStatus {
    /// The `backlog` binary could not be run (not on PATH, not executable) or ran but exited
    /// non-zero for `--version`. Either way there is no usable write-side CLI.
    Unavailable { detail: String },
    /// The CLI ran but is below [`MIN_VERSION`], or reported a version we cannot parse. Its
    /// sub-commands/options are not the confirmed set, so updates are withheld (decision-7).
    Unsupported { version: String },
    /// The CLI is at or above [`MIN_VERSION`]; updates are enabled.
    Supported(CliCapability),
}

/// Proof the write-side CLI meets [`MIN_VERSION`] (AC #6). Constructed only by [`probe`] on a
/// supported version and required by [`run`], so an update cannot be planned or launched without
/// one — the read-only degradation for a missing/too-old CLI is enforced by this type.
#[derive(Debug, Clone)]
pub struct CliCapability {
    version: Version,
}

impl CliCapability {
    /// The confirmed CLI version behind this capability.
    pub fn version(&self) -> Version {
        self.version
    }
}

/// Read `backlog --version` and classify it (AC #6). `--version` is a fixed argument array, run
/// project-independently (no `current_dir`), following the same shell-non-concatenation rule as
/// every other call (doc-5 §4).
pub fn probe(cli: &dyn BacklogCli) -> CliStatus {
    let run = match cli.run(None, &["--version".to_string()]) {
        Ok(run) => run,
        // 起動失敗 (doc-5 §5): the binary is not there or not runnable → read-only.
        Err(e) => {
            return CliStatus::Unavailable {
                detail: e.to_string(),
            }
        }
    };
    if !run.success {
        return CliStatus::Unavailable {
            detail: format!(
                "`backlog --version` exited with failure: {}",
                run.stderr.trim()
            ),
        };
    }
    match Version::parse(&run.stdout) {
        Some(version) if version >= MIN_VERSION => CliStatus::Supported(CliCapability { version }),
        Some(version) => CliStatus::Unsupported {
            version: version.to_string(),
        },
        None => CliStatus::Unsupported {
            version: run.stdout.trim().to_string(),
        },
    }
}

// --- operation map (doc-5 §3, AC #1) ------------------------------------------------------------

/// One Atlas 更新操作 (doc-5 §1). Each variant maps to exactly one 写像先 — a Backlog CLI
/// sub-command, or, for the single 直接書き込み操作, Atlas's own write; the mapping is
/// [`plan_operation`]. Operations v1.49.3 cannot perform are absent by construction: there is no
/// single-option AC replace (only the composite [`AcEdit::Replace`]), and references cannot be
/// emptied ([`TaskEdit::references`] is refused when empty) — doc-5 §3.1.
///
/// [`UpdateOperation::MilestoneDescribe`] is the one that used to be absent for the same reason and
/// no longer is: decision-21 lets Atlas write 説明の本文範囲 itself, because re-creating a milestone
/// to change its description changes its id and detaches every task that referenced it.
//
// large_enum_variant is allowed rather than boxed: this is an IPC command type, deserialized from
// the frontend one value at a time and consumed immediately (doc-5 §2). It is never held in bulk
// collections, so the lint's stack-copy rationale does not apply here, and boxing the payloads
// would force `Box::new` on every construction site across the command layer (TASK-33) for no
// runtime benefit — the ergonomic construction of this public API is worth more than the size
// symmetry.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, Deserialize)]
// `Deserialize` makes this the type the command layer (TASK-33) deserializes the frontend's request
// straight into, rather than a parallel wire enum copied field-for-field into this one. That is what
// keeps AC #4 of TASK-33 structural: user input lands in the fixed interface below and reaches the
// CLI only as an argument-array element, with no boundary code in between that could concatenate it.
// Tagged `op` and camelCase because doc-4 §3.1's wire contract is camelCase throughout.
#[serde(tag = "op", rename_all = "camelCase")]
pub enum UpdateOperation {
    /// `task create` (doc-5 §3). The range Atlas passes at create time, narrower than what the CLI
    /// accepts — a product judgment, not a CLI limit (see [`TaskCreate`], doc-10 §7).
    TaskCreate(TaskCreate),
    /// `task edit` (doc-5 §3): all combinable content/metadata edits in one call.
    #[serde(rename_all = "camelCase")]
    TaskEdit { task_id: String, edit: TaskEdit },
    /// `draft promote <DRAFT-N>` — draft → active, re-numbered (doc-5 §3.3).
    #[serde(rename_all = "camelCase")]
    DraftPromote { draft_id: String },
    /// `draft archive <DRAFT-N>` — draft → archive, id/status kept (doc-5 §3.3).
    #[serde(rename_all = "camelCase")]
    DraftArchive { draft_id: String },
    /// `task demote <TASK-N>` — active → draft, status kept (doc-5 §3.3).
    #[serde(rename_all = "camelCase")]
    TaskDemote { task_id: String },
    /// `task archive <TASK-N>` — active → archive, succeeds regardless of status (doc-5 §3).
    #[serde(rename_all = "camelCase")]
    TaskArchive { task_id: String },
    /// `task complete <TASK-N>` — active → completed. The CLI succeeds only when the task's status
    /// is `Done`; a non-Done task fails with "is not Done" and is reported as a CLI failure
    /// (doc-5 §3/§5) — the adapter does not pre-judge status, the CLI owns that rule.
    #[serde(rename_all = "camelCase")]
    TaskComplete { task_id: String },
    /// `doc create` (doc-5 §3).
    DocCreate(DocCreate),
    /// `doc update` (doc-5 §3): title / whole-body / type / path / tags.
    #[serde(rename_all = "camelCase")]
    DocUpdate { doc_id: String, update: DocUpdate },
    /// `milestone add` (doc-5 §3).
    #[serde(rename_all = "camelCase")]
    MilestoneAdd {
        name: String,
        #[serde(default)]
        description: Option<String>,
    },
    /// マイルストーン説明の更新 — the 直接書き込み操作 (doc-5 §1/§3, decision-21). No sub-command:
    /// v1.49.3's `milestone` has no `update`/`edit`, so this one replaces 説明の本文範囲 of the
    /// milestone's management file and nothing else.
    ///
    /// `description` is a plain `String` rather than an `Option`, because "no description" is a
    /// value here and not an absent field: the empty string empties the range, which doc-10 §6
    /// offers deliberately (the CLI's own `-d`-less creation writes a placeholder instead, so a
    /// description the user wrote has no other way of being taken back).
    #[serde(rename_all = "camelCase")]
    MilestoneDescribe { name: String, description: String },
    /// `milestone rename` (doc-5 §3). `update_tasks` false adds `--no-update-tasks`.
    #[serde(rename_all = "camelCase")]
    MilestoneRename {
        from: String,
        to: String,
        update_tasks: bool,
    },
    /// `milestone remove` (doc-5 §3), with how referencing tasks are handled.
    #[serde(rename_all = "camelCase")]
    MilestoneRemove {
        name: String,
        task_handling: MilestoneTaskHandling,
    },
    /// `milestone archive` (doc-5 §3).
    #[serde(rename_all = "camelCase")]
    MilestoneArchive { name: String },
}

/// `task create` fields — the range Atlas passes at create time (doc-5 §3, doc-10 §7).
///
/// Narrower than what the CLI accepts, by product judgment rather than by capability: v1.49.3's
/// `task create` also takes `-a`/`--plan`/`--notes`/`--ref`/`--depends-on` and stores every one of
/// them in the created file (measured 2026-08-12 on v1.49.3, doc-5 §3). What Atlas passes here is what
/// identifies and classifies a task at the moment it is created; plan・notes・references・
/// dependencies accrue while the work runs and are edited through [`TaskEdit`] (doc-8 §6), so
/// offering them at create time would only move the same input earlier. assignee is the one
/// omission with no create-time substitute, and is closed on the edit side instead
/// ([`TaskEdit::assignee`], TASK-57) — assignment changes over a task's life, and a create-only
/// route would set it once and never again.
#[derive(Debug, Clone, Default, Deserialize)]
// Only `title` is required — `task create` needs a title and nothing else (doc-5 §3). The rest
// default so the frontend sends just what the user filled in, rather than a full null-padded record.
#[serde(rename_all = "camelCase")]
pub struct TaskCreate {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub milestone: Option<String>,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
}

/// The combinable `task edit` fields (doc-5 §3 edit rows). A single `task edit` call carries every
/// field set here (doc-5 §3 bullet "1 呼び出しにまとめられる範囲でまとめる"); an edit that sets
/// nothing is refused before launch ([`RejectReason::NothingToEdit`]).
#[derive(Debug, Clone, Default, Deserialize)]
// Every field is optional by construction (an unset field leaves that facet untouched), so the whole
// struct defaults: the frontend sends only the facets the user actually changed.
#[serde(rename_all = "camelCase", default)]
pub struct TaskEdit {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub milestone: Option<String>,
    /// `--assignee` sets the whole assignee set (doc-5 §3), and is the whole GUI route for assignee
    /// (TASK-57). `task edit -a` reads its value as a comma-separated set and replaces the
    /// frontmatter list with it, however many entries either side had (measured 2026-08-12 on
    /// v1.49.3; `task create -a` does *not* split, which is what doc-5 §3 recorded for both until
    /// TASK-151 measured them apart). `None` leaves it untouched; `Some(empty)` is refused — `-a ""`
    /// exits 0 without clearing (measured), the same silent-no-op as `--ref ""`, so emptying the
    /// list is not a capability the CLI offers ([`RejectReason::EmptyAssignee`]).
    pub assignee: Option<Vec<String>>,
    pub plan: Option<String>,
    pub notes: NoteEdit,
    pub add_labels: Vec<String>,
    pub remove_labels: Vec<String>,
    /// `--depends-on` sets the whole dependency set (doc-5 §3). `None` leaves it untouched;
    /// `Some(empty)` is refused — `--depends-on ""` exits 0 without clearing anything in v1.49.3
    /// (measured), the same silent-no-op trap as `--ref ""`, so clearing all dependencies is not a
    /// capability the CLI offers and must not be reported as a success ([`RejectReason::EmptyDependencies`]).
    pub dependencies: Option<Vec<String>>,
    /// `--ref` full-replaces with a *non-empty* set (doc-5 §3, §3.1). `Some(empty)` is refused —
    /// v1.49.3 cannot empty references (doc-5 §3.1). `None` leaves references untouched.
    pub references: Option<Vec<String>>,
    pub ac: AcEdit,
}

/// Implementation-notes edit (doc-5 §3 "実装計画・ノート"). `--notes` replaces, `--append-notes`
/// appends; the two are distinct CLI options, so they are distinct here rather than a bool flag.
#[derive(Debug, Clone, Default, Deserialize)]
// Adjacently tagged rather than internally tagged: `Set`/`Append` carry a bare string, which an
// internal tag cannot represent (it needs the payload to be a map). `{"mode":"set","text":"…"}` /
// `{"mode":"keep"}` is the resulting wire shape.
#[serde(tag = "mode", content = "text", rename_all = "camelCase")]
pub enum NoteEdit {
    #[default]
    Keep,
    Set(String),
    Append(String),
}

/// Acceptance-criteria edit (doc-5 §3). The per-item deltas ([`AcEdit::Delta`]) and the whole-set
/// replacement ([`AcEdit::Replace`]) are kept apart because doc-5 §3/§3.1 require it: a replace is
/// the composite of removing every existing index, adding the new items, and checking the completed
/// ones by their new index — all in one `task edit` call. v1.49.3's single-option
/// `--acceptance-criteria` does replace the whole set, but it refuses to run alongside `--ac`,
/// `--remove-ac`, `--check-ac` or `--uncheck-ac` ("Cannot combine …", measured), so it cannot carry
/// the checked state of the new items. The composite can, and one call keeps the replace atomic.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum AcEdit {
    #[default]
    Keep,
    /// Per-item add/remove/check/uncheck. Indices are 1-based, matching the CLI and the read model.
    #[serde(rename_all = "camelCase")]
    Delta {
        #[serde(default)]
        add: Vec<String>,
        #[serde(default)]
        remove: Vec<u32>,
        #[serde(default)]
        check: Vec<u32>,
        #[serde(default)]
        uncheck: Vec<u32>,
    },
    /// Whole-set replacement (doc-5 §3 composite). `existing` is the current AC count (from the read
    /// layer): indices `1..=existing` are removed, `items` are added, and each checked item is
    /// checked at its new 1-based position.
    #[serde(rename_all = "camelCase")]
    Replace { existing: u32, items: Vec<AcItem> },
}

/// One acceptance criterion for [`AcEdit::Replace`].
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcItem {
    pub text: String,
    pub checked: bool,
}

/// `doc create` fields (doc-5 §3).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocCreate {
    pub title: String,
    #[serde(default)]
    pub doc_type: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

/// `doc update` fields (doc-5 §3). `content` replaces the whole body (doc-5 §3.1 — no partial
/// update). Every field is optional; an update that sets nothing is refused before launch.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocUpdate {
    pub title: Option<String>,
    pub content: Option<String>,
    pub doc_type: Option<String>,
    pub path: Option<String>,
    /// `None` is 未タッチの tags — the flag is not emitted, so tags stay as the file has them.
    /// `Some(empty)` is 空集合の tags: タグ全消し (doc-10 §5), emitted as `--tags ""`. The two are
    /// not interchangeable, which is why this is an `Option<Vec<_>>` and not a `Vec<_>`.
    pub tags: Option<Vec<String>>,
}

/// `milestone remove --task-handling` (doc-5 §3). `Reassign` carries the required target so a
/// reassign without `--reassign-to` is unrepresentable.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum MilestoneTaskHandling {
    Clear,
    Keep,
    #[serde(rename_all = "camelCase")]
    Reassign {
        to: String,
    },
}

// --- planning: operation → invocations (doc-5 §3, AC #1/#5) --------------------------------------

/// One Backlog CLI invocation: a fixed sub-command path plus its arguments (doc-5 §3, §4). Held as
/// structured [`Arg`]s rather than a flat string list so options can be validated against the
/// confirmed version's allowlist before rendering to argv (AC #5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    /// The sub-command words, e.g. `["task", "edit"]`. `'static` because the map is fixed.
    command: &'static [&'static str],
    args: Vec<Arg>,
}

/// One argument of an [`Invocation`]. Rendering keeps an option name and its value as two separate
/// argv elements (never `--name=value`, never a joined string), which is the shell-non-concatenation
/// guarantee at the token level (doc-5 §4, AC #2).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Arg {
    /// A positional operand: taskId, title, milestone name, ….
    Positional(String),
    /// A valueless flag, e.g. `--no-update-tasks`.
    Flag(&'static str),
    /// An option and its value, rendered as two argv elements.
    Opt(&'static str, String),
}

impl Invocation {
    fn new(command: &'static [&'static str]) -> Self {
        Invocation {
            command,
            args: Vec::new(),
        }
    }

    fn positional(mut self, value: impl Into<String>) -> Self {
        self.args.push(Arg::Positional(value.into()));
        self
    }

    fn flag(mut self, name: &'static str) -> Self {
        self.args.push(Arg::Flag(name));
        self
    }

    fn opt(mut self, name: &'static str, value: impl Into<String>) -> Self {
        self.args.push(Arg::Opt(name, value.into()));
        self
    }

    /// Add `--<name> <value>` for an `Option`, leaving the invocation unchanged when `None`.
    fn opt_if(self, name: &'static str, value: &Option<String>) -> Self {
        match value {
            Some(v) => self.opt(name, v.clone()),
            None => self,
        }
    }

    /// Whether any option/flag (not a positional) has been added — the test for "an edit that
    /// changes nothing", which must be refused rather than launched (doc-5 §5).
    fn has_options(&self) -> bool {
        self.args
            .iter()
            .any(|a| matches!(a, Arg::Flag(_) | Arg::Opt(_, _)))
    }

    /// The full argv: sub-command words followed by each argument as its own element (AC #2).
    fn to_argv(&self) -> Vec<String> {
        let mut argv: Vec<String> = self.command.iter().map(|s| s.to_string()).collect();
        for arg in &self.args {
            match arg {
                Arg::Positional(v) => argv.push(v.clone()),
                Arg::Flag(name) => argv.push(name.to_string()),
                Arg::Opt(name, v) => {
                    argv.push(name.to_string());
                    argv.push(v.clone());
                }
            }
        }
        argv
    }

    /// Human-readable sub-command name for failure/reject messages ("task edit").
    fn command_name(&self) -> String {
        self.command.join(" ")
    }
}

/// The option flags each sub-command accepts in the confirmed version (v1.49.3 `--help`, doc-5 §3).
/// This is the single source of truth for AC #5's "未知オプションは起動前に拒否する": every option
/// [`plan_operation`] emits is checked against this set, so a flag the confirmed version does not
/// define is refused before any process starts rather than passed to a CLI that may reject it.
fn allowed_options(command: &[&str]) -> &'static [&'static str] {
    match command {
        ["task", "create"] => &[
            "--description",
            "--status",
            "--labels",
            "--priority",
            "--milestone",
            "--ac",
        ],
        ["task", "edit"] => &[
            "--title",
            "--description",
            "--status",
            "--priority",
            "--milestone",
            "--assignee",
            "--add-label",
            "--remove-label",
            "--ac",
            "--remove-ac",
            "--check-ac",
            "--uncheck-ac",
            "--ref",
            "--plan",
            "--notes",
            "--append-notes",
            "--depends-on",
        ],
        ["doc", "create"] => &["--type", "--path"],
        ["doc", "update"] => &["--title", "--content", "--type", "--path", "--tags"],
        ["milestone", "add"] => &["--description"],
        ["milestone", "rename"] => &["--no-update-tasks"],
        ["milestone", "remove"] => &["--task-handling", "--reassign-to"],
        // draft promote/archive, task demote/archive/complete, milestone archive: positional only.
        _ => &[],
    }
}

/// Refusal to run an operation, decided *before* any CLI launches (doc-5 §5 縮退, AC #5). A refusal
/// is not a CLI failure — no process ran, nothing changed — so it is a separate type from
/// [`UpdateFailure`], surfaced to the caller as `Err` from [`run`].
#[derive(Debug, PartialEq, Eq)]
pub enum RejectReason {
    /// `references` was `Some(empty)`. v1.49.3 cannot empty references (doc-5 §3.1); the last one
    /// must be removed through the external-editor path (doc-8), not here.
    EmptyReferences,
    /// `dependencies` was `Some(empty)`. `--depends-on ""` exits 0 without clearing (measured), the
    /// same silent-no-op as `--ref ""`, so clearing all dependencies is not offered — refused rather
    /// than reported as a success (doc-5 §5 縮退).
    EmptyDependencies,
    /// `assignee` was `Some(empty)`. `-a ""` exits 0 without clearing (measured), and so does a
    /// value whose parse is empty, so emptying the list is not offered — refused rather than
    /// reported as a success (doc-5 §5 縮退).
    EmptyAssignee,
    /// A `task edit` that would set no field. `task edit` with only a taskId changes nothing, so it
    /// is refused instead of launched (doc-5 §5).
    NothingToEdit,
    /// A `doc update` that would set no field.
    NothingToUpdate,
    /// An emitted option is not in the confirmed version's allowlist for its sub-command (AC #5).
    /// Defense in depth: [`plan_operation`] only emits allowlisted options, so this guards against
    /// a future map change or version drift reaching the CLI unchecked.
    UnknownOption {
        command: String,
        option: &'static str,
    },
}

impl std::fmt::Display for RejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RejectReason::EmptyReferences => write!(
                f,
                "references cannot be emptied through the CLI (v1.49.3); keep at least one reference"
            ),
            RejectReason::EmptyDependencies => write!(
                f,
                "dependencies cannot be cleared through the CLI (v1.49.3); keep at least one dependency"
            ),
            RejectReason::EmptyAssignee => write!(
                f,
                "assignee cannot be cleared through the CLI (v1.49.3); keep at least one assignee"
            ),
            RejectReason::NothingToEdit => write!(f, "task edit was requested with no field to change"),
            RejectReason::NothingToUpdate => {
                write!(f, "doc update was requested with no field to change")
            }
            RejectReason::UnknownOption { command, option } => {
                write!(f, "`{command}` does not accept `{option}` in the supported CLI version")
            }
        }
    }
}

impl std::error::Error for RejectReason {}

/// What one 更新操作's 写像先 is (doc-5 §3). Almost every operation is a Backlog CLI invocation;
/// [`Mapped::WriteMilestoneDescription`] is the 直接書き込み操作 (doc-5 §1, decision-21) — the one
/// whose 写像先 is Atlas's own write.
///
/// Both kinds are steps of the same plan rather than two paths a caller chooses between, which is
/// what keeps the write inside every guarantee the CLI calls already have: the pre-update version
/// check runs over the plan's targets, execution aborts on the first failure, and an operation
/// cannot be dropped from an action without the match below ceasing to compile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mapped {
    Invoke(Invocation),
    /// マイルストーン説明の更新. The file to write is **not** named here. It is resolved from the
    /// domain model by [`DirectWriter`]'s implementor inside the freshness boundary — the same
    /// place that just checked its version — so a path never travels from the frontend, and the
    /// target of the write is the target that was checked.
    WriteMilestoneDescription {
        name: String,
        description: String,
    },
}

/// Map one operation to its plan (doc-5 §3, AC #1). Most operations are a single step; the plan is
/// a `Vec` so a screen action that must split across sub-commands gets the abort-on-failure
/// execution (AC #4) without a special case. Every emitted option is validated against the
/// confirmed version's allowlist here, so an out-of-capability operation is refused before launch
/// (AC #5) — a 直接書き込み操作 has no options to validate, having no sub-command.
pub fn plan_operation(op: &UpdateOperation) -> Result<Vec<Mapped>, RejectReason> {
    // Each arm names its own 写像先 kind rather than defaulting to a CLI call, so adding an
    // operation is a decision about which kind it is (doc-5 §1) instead of an omission.
    let mapped: Vec<Mapped> = match op {
        UpdateOperation::TaskCreate(c) => invoked([plan_task_create(c)]),
        UpdateOperation::TaskEdit { task_id, edit } => invoked([plan_task_edit(task_id, edit)?]),
        UpdateOperation::DraftPromote { draft_id } => {
            invoked([Invocation::new(&["draft", "promote"]).positional(draft_id)])
        }
        UpdateOperation::DraftArchive { draft_id } => {
            invoked([Invocation::new(&["draft", "archive"]).positional(draft_id)])
        }
        UpdateOperation::TaskDemote { task_id } => {
            invoked([Invocation::new(&["task", "demote"]).positional(task_id)])
        }
        UpdateOperation::TaskArchive { task_id } => {
            invoked([Invocation::new(&["task", "archive"]).positional(task_id)])
        }
        UpdateOperation::TaskComplete { task_id } => {
            invoked([Invocation::new(&["task", "complete"]).positional(task_id)])
        }
        UpdateOperation::DocCreate(c) => invoked([plan_doc_create(c)]),
        UpdateOperation::DocUpdate { doc_id, update } => {
            invoked([plan_doc_update(doc_id, update)?])
        }
        UpdateOperation::MilestoneAdd { name, description } => {
            invoked([Invocation::new(&["milestone", "add"])
                .positional(name)
                .opt_if("--description", description)])
        }
        UpdateOperation::MilestoneDescribe { name, description } => {
            vec![Mapped::WriteMilestoneDescription {
                name: name.clone(),
                description: description.clone(),
            }]
        }
        UpdateOperation::MilestoneRename {
            from,
            to,
            update_tasks,
        } => {
            let mut inv = Invocation::new(&["milestone", "rename"])
                .positional(from)
                .positional(to);
            if !update_tasks {
                inv = inv.flag("--no-update-tasks");
            }
            invoked([inv])
        }
        UpdateOperation::MilestoneRemove {
            name,
            task_handling,
        } => invoked([plan_milestone_remove(name, task_handling)]),
        UpdateOperation::MilestoneArchive { name } => {
            invoked([Invocation::new(&["milestone", "archive"]).positional(name)])
        }
    };
    for step in &mapped {
        if let Mapped::Invoke(inv) = step {
            validate_options(inv)?;
        }
    }
    Ok(mapped)
}

/// The arms' common tail: CLI invocations as plan steps.
fn invoked<const N: usize>(invocations: [Invocation; N]) -> Vec<Mapped> {
    invocations.into_iter().map(Mapped::Invoke).collect()
}

fn plan_task_create(c: &TaskCreate) -> Invocation {
    let mut inv = Invocation::new(&["task", "create"])
        .positional(&c.title)
        .opt_if("--description", &c.description)
        .opt_if("--status", &c.status)
        .opt_if("--priority", &c.priority)
        .opt_if("--milestone", &c.milestone);
    if !c.labels.is_empty() {
        // v1.49.3 `task create --labels` takes one comma-separated value (doc-5 §3 create row).
        inv = inv.opt("--labels", c.labels.join(","));
    }
    for ac in &c.acceptance_criteria {
        inv = inv.opt("--ac", ac.clone());
    }
    inv
}

fn plan_task_edit(task_id: &str, edit: &TaskEdit) -> Result<Invocation, RejectReason> {
    let mut inv = Invocation::new(&["task", "edit"])
        .positional(task_id)
        .opt_if("--title", &edit.title)
        .opt_if("--description", &edit.description)
        .opt_if("--status", &edit.status)
        .opt_if("--priority", &edit.priority)
        .opt_if("--milestone", &edit.milestone)
        .opt_if("--plan", &edit.plan);

    if let Some(assignee) = &edit.assignee {
        // 空集合でのクリアは不可 (measured): `-a ""` exits 0 without clearing, so an empty set is
        // refused rather than reported as a success (doc-5 §5 縮退, same trap as `--ref ""`).
        // Blank members are refused with it: the CLI drops them when it splits the value, so a set
        // that is blank throughout would reach the CLI as the empty value it exits 0 on.
        if assignee.iter().all(|one| one.trim().is_empty()) {
            return Err(RejectReason::EmptyAssignee);
        }
        // `-a` sets the whole set from one comma-separated value, as `--depends-on` does.
        inv = inv.opt("--assignee", assignee.join(","));
    }

    inv = match &edit.notes {
        NoteEdit::Keep => inv,
        NoteEdit::Set(text) => inv.opt("--notes", text.clone()),
        NoteEdit::Append(text) => inv.opt("--append-notes", text.clone()),
    };

    // Labels are comma-joined into a single `--add-label`/`--remove-label`, not repeated per label:
    // a comma-separated value applies to every label in both v1.47.1 and v1.48.0, whereas repeating
    // the flag does not — v1.47.1 keeps only the last value and v1.48.0 accumulates (both measured).
    // Comma-joining is the one form that means the same thing on either version.
    if !edit.add_labels.is_empty() {
        inv = inv.opt("--add-label", edit.add_labels.join(","));
    }
    if !edit.remove_labels.is_empty() {
        inv = inv.opt("--remove-label", edit.remove_labels.join(","));
    }

    if let Some(deps) = &edit.dependencies {
        // 空集合でのクリアは不可 (measured): `--depends-on ""` exits 0 without clearing, so an empty
        // set is refused rather than reported as a success (doc-5 §5 縮退, same trap as `--ref ""`).
        if deps.is_empty() {
            return Err(RejectReason::EmptyDependencies);
        }
        // `--depends-on` sets the whole set from one comma-separated value.
        inv = inv.opt("--depends-on", deps.join(","));
    }

    if let Some(refs) = &edit.references {
        // 参照の全置換は非空集合のみ (doc-5 §3.1): emptying is impossible in v1.49.3.
        if refs.is_empty() {
            return Err(RejectReason::EmptyReferences);
        }
        for r in refs {
            inv = inv.opt("--ref", r.clone());
        }
    }

    inv = apply_ac_edit(inv, &edit.ac);

    // `task edit <id>` with no option changes nothing (doc-5 §5) — refuse before launch.
    if !inv.has_options() {
        return Err(RejectReason::NothingToEdit);
    }
    Ok(inv)
}

/// Append the AC edit's options to a `task edit` invocation (doc-5 §3). The replace case is the
/// composite doc-5 §3/§3.1 prescribe — remove every existing index, add the new items, check the
/// completed ones at their new position — all within this one invocation.
fn apply_ac_edit(mut inv: Invocation, ac: &AcEdit) -> Invocation {
    match ac {
        AcEdit::Keep => inv,
        AcEdit::Delta {
            add,
            remove,
            check,
            uncheck,
        } => {
            for text in add {
                inv = inv.opt("--ac", text.clone());
            }
            for i in remove {
                inv = inv.opt("--remove-ac", i.to_string());
            }
            for i in check {
                inv = inv.opt("--check-ac", i.to_string());
            }
            for i in uncheck {
                inv = inv.opt("--uncheck-ac", i.to_string());
            }
            inv
        }
        AcEdit::Replace { existing, items } => {
            // Remove all existing indices (1-based), then add the replacements. doc-5 §3 fixes this
            // ordering and that removals reference the *original* indices 1..=existing.
            for i in 1..=*existing {
                inv = inv.opt("--remove-ac", i.to_string());
            }
            for item in items {
                inv = inv.opt("--ac", item.text.clone());
            }
            // Checked items are checked by their *new* 1-based index (position among the additions).
            for (idx, item) in items.iter().enumerate() {
                if item.checked {
                    inv = inv.opt("--check-ac", (idx + 1).to_string());
                }
            }
            inv
        }
    }
}

fn plan_doc_create(c: &DocCreate) -> Invocation {
    Invocation::new(&["doc", "create"])
        .positional(&c.title)
        .opt_if("--type", &c.doc_type)
        .opt_if("--path", &c.path)
}

fn plan_doc_update(doc_id: &str, update: &DocUpdate) -> Result<Invocation, RejectReason> {
    let mut inv = Invocation::new(&["doc", "update"])
        .positional(doc_id)
        .opt_if("--title", &update.title)
        .opt_if("--content", &update.content)
        .opt_if("--type", &update.doc_type)
        .opt_if("--path", &update.path);
    if let Some(tags) = &update.tags {
        // `opt`, not a skip-if-empty: an empty list joins to `""` and `--tags ""` is タグ全消し
        // (doc-10 §5), which v1.49.3 performs. Contrast `--ref ""`/`--depends-on ""` below, which
        // exit 0 having cleared nothing and are refused instead.
        inv = inv.opt("--tags", tags.join(","));
    }
    if !inv.has_options() {
        return Err(RejectReason::NothingToUpdate);
    }
    Ok(inv)
}

fn plan_milestone_remove(name: &str, handling: &MilestoneTaskHandling) -> Invocation {
    let inv = Invocation::new(&["milestone", "remove"]).positional(name);
    match handling {
        MilestoneTaskHandling::Clear => inv.opt("--task-handling", "clear"),
        MilestoneTaskHandling::Keep => inv.opt("--task-handling", "keep"),
        MilestoneTaskHandling::Reassign { to } => inv
            .opt("--task-handling", "reassign")
            .opt("--reassign-to", to.clone()),
    }
}

/// Refuse any emitted option outside the confirmed version's allowlist (AC #5).
fn validate_options(inv: &Invocation) -> Result<(), RejectReason> {
    let allowed = allowed_options(inv.command);
    for arg in &inv.args {
        let name = match arg {
            Arg::Flag(name) | Arg::Opt(name, _) => *name,
            Arg::Positional(_) => continue,
        };
        if !allowed.contains(&name) {
            return Err(RejectReason::UnknownOption {
                command: inv.command_name(),
                option: name,
            });
        }
    }
    Ok(())
}

// --- execution (doc-5 §4/§5, AC #2/#3/#4) -------------------------------------------------------

/// The reduced result of one CLI invocation — success by exit code, plus stderr for the failure
/// reason (doc-5 §5). This is what [`BacklogCli`] returns instead of [`std::process::Output`], so
/// the executor stays off platform-specific `ExitStatus` and tests can supply results directly.
#[derive(Debug, Clone)]
pub struct CliRun {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// The write-side CLI, abstracted so the executable resolution is the only swappable part (doc-5
/// §4, decision-7): [`SystemBacklog`] runs whatever the 実行ファイル解決の順序 settled on
/// (decision-16), and a sidecar implementation would swap only this trait's impl, leaving the
/// operation map, working directory, and argument arrays unchanged (TASK-99).
pub trait BacklogCli {
    /// Run `backlog <args>` with `current_dir` as the working directory (doc-5 §4). `None` runs in
    /// the inherited directory — used only by the version probe, which is project-independent. An
    /// `Err` is a launch that produced no verdict — 起動失敗 or 期限到達 (doc-5 §5); a process that
    /// ran to exit, at any exit code, is `Ok(CliRun)` for the executor to judge.
    fn run(&self, current_dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError>;
}

/// A launch that produced no exit code (doc-5 §5). Separate from [`CliRun`] because neither case
/// leaves the CLI's own verdict behind: there is no exit code to judge and no stderr the CLI wrote
/// about *this* failure.
#[derive(Debug)]
pub enum RunError {
    /// 起動失敗 (doc-5 §5): the process could not be started at all.
    Spawn(std::io::Error),
    /// 期限到達 (doc-5 §5, decision-18): the child was still running when [`CLI_DEADLINE`] elapsed,
    /// so Atlas killed it. `detail` names what was observed while waiting — normally nothing, but a
    /// wait that itself kept failing is the one thing a reader would otherwise have no trace of.
    TimedOut {
        after: Duration,
        detail: Option<String>,
    },
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunError::Spawn(error) => write!(f, "{error}"),
            RunError::TimedOut { after, detail } => {
                // "Atlas stopped waiting", not "the process is gone": the kill is attempted, not
                // guaranteed, and a kill that failed is named in `detail` rather than contradicted
                // here.
                write!(
                    f,
                    "the backlog CLI did not finish within {} seconds, so Atlas stopped waiting for it",
                    after.as_secs()
                )?;
                match detail {
                    Some(detail) => write!(f, " ({detail})"),
                    None => Ok(()),
                }
            }
        }
    }
}

// --- 実行ファイル解決の順序 (doc-5 §4, decision-16) ---------------------------------------------

/// The platform/architecture pair naming backlog.md's プラットフォーム別サブパッケージ, spelled the
/// way the package's own `resolveBinary.cjs` spells it (`win32` → `windows`, `x86_64` → `x64`).
///
/// Carried as a value rather than read from `cfg!` at the point of use, so a macOS host can drive the
/// Windows resolution in a test — a `cfg`-only branch is checked by nothing until it ships, which is
/// the rule m-1 TASK-44 fixed for platform branching.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SubPackage {
    /// npm's `process.platform`, as the sub-package names it: `windows`, `darwin`, `linux`.
    platform: &'static str,
    /// npm's `process.arch`: `x64`, `arm64`.
    arch: &'static str,
}

impl SubPackage {
    /// What this build targets. The one place the build's own target is read.
    pub const fn current() -> SubPackage {
        SubPackage {
            #[cfg(target_os = "windows")]
            platform: "windows",
            #[cfg(not(target_os = "windows"))]
            platform: std::env::consts::OS,
            #[cfg(target_arch = "x86_64")]
            arch: "x64",
            #[cfg(target_arch = "aarch64")]
            arch: "arm64",
            // Any other architecture keeps Rust's spelling. It will not name a real sub-package, so
            // the resolution falls through to the bare name — the same place macOS・Linux land.
            #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
            arch: std::env::consts::ARCH,
        }
    }

    /// Windows is the only platform whose npm install leaves no directly runnable executable on PATH
    /// (decision-16), so it is the only one whose resolution walks to the sub-package.
    fn is_windows(&self) -> bool {
        self.platform == "windows"
    }

    /// `resolveBinary.cjs`'s `binary`: the file name inside the sub-package.
    fn executable(&self) -> &'static str {
        if self.is_windows() {
            "backlog.exe"
        } else {
            "backlog"
        }
    }

    /// `resolveBinary.cjs`'s `getPackageName`.
    fn package(&self) -> String {
        format!("backlog.md-{}-{}", self.platform, self.arch)
    }
}

/// The three shims npm leaves on PATH (decision-16). None is launched: finding one only says "an npm
/// install of backlog.md is on PATH, and its directory is where to start walking".
const SHIM_NAMES: [&str; 3] = ["backlog", "backlog.cmd", "backlog.ps1"];

/// What the 実行ファイル解決の順序 settled on — what gets handed to `Command::new` (doc-5 §4,
/// decision-16). A value rather than a `PathBuf` alone so the resolution can be asserted without
/// launching anything, and so the failure message can say which step produced the program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliProgram {
    /// 順序 1 — アプリ設定 `backlog_cli`, used as written.
    Configured(PathBuf),
    /// 順序 2 — the プラットフォーム別実行ファイル reached from an npm shim's directory.
    SubPackage(PathBuf),
    /// 順序 3 — the bare name, left for the OS to resolve on PATH. What every platform did before
    /// decision-16, and what macOS・Linux still do.
    OnPath,
}

impl CliProgram {
    /// The program `Command::new` receives.
    fn program(&self) -> &Path {
        match self {
            CliProgram::Configured(path) | CliProgram::SubPackage(path) => path,
            CliProgram::OnPath => Path::new("backlog"),
        }
    }
}

/// Where npm's global prefix keeps `node_modules` relative to the directory holding the shims: beside
/// them (npm's Windows prefix, `%APPDATA%\npm`) and one level up under `lib` (its POSIX prefix, whose
/// `bin` and `lib` are siblings). Both are tried whatever the platform — probing a path that does not
/// exist costs one `stat`, and pinning a layout per platform would be a second fact to keep true.
fn node_modules_roots(shim_dir: &Path) -> Vec<PathBuf> {
    let mut roots = vec![shim_dir.join("node_modules")];
    if let Some(parent) = shim_dir.parent() {
        roots.push(parent.join("lib").join("node_modules"));
    }
    roots
}

/// 実行ファイル解決の順序 (doc-5 §4, decision-16). `exists` reports whether a path is a file the way
/// the filesystem would; it is a parameter so the whole order — including the Windows steps — is
/// decided by pure inputs and can be asserted on any host.
///
/// Step 2 runs only when PATH holds no directly runnable executable: a `backlog.exe` placed there by
/// Scoop or by a future sidecar is the OS's to resolve, and must not be overridden by npm's layout.
pub fn resolve(
    configured: Option<&Path>,
    path_var: Option<&OsStr>,
    target: SubPackage,
    exists: &dyn Fn(&Path) -> bool,
) -> CliProgram {
    if let Some(path) = configured {
        return CliProgram::Configured(path.to_path_buf());
    }
    if target.is_windows() {
        let dirs: Vec<PathBuf> = path_var
            .map(|v| env::split_paths(v).collect())
            .unwrap_or_default();
        let runnable_on_path = dirs
            .iter()
            .any(|dir| exists(&dir.join(target.executable())));
        if !runnable_on_path {
            if let Some(found) = sub_package_executable(&dirs, target, exists) {
                return CliProgram::SubPackage(found);
            }
        }
    }
    CliProgram::OnPath
}

/// Walk from the first PATH directory holding a shim to the プラットフォーム別実行ファイル
/// (decision-16 順序 2). Two nestings are tried under each `node_modules` root: npm keeps the
/// sub-package under `backlog.md`, and an install that hoisted it puts it at the root.
fn sub_package_executable(
    dirs: &[PathBuf],
    target: SubPackage,
    exists: &dyn Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let package = target.package();
    let binary = target.executable();
    for dir in dirs {
        if !SHIM_NAMES.iter().any(|name| exists(&dir.join(name))) {
            continue;
        }
        for root in node_modules_roots(dir) {
            let nested = root
                .join("backlog.md")
                .join("node_modules")
                .join(&package)
                .join(binary);
            let hoisted = root.join(&package).join(binary);
            for candidate in [nested, hoisted] {
                if exists(&candidate) {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// The resolved `backlog` (doc-5 §4). Passes each argument as its own array element and never through
/// a shell (AC #2), so a value with whitespace or shell metacharacters cannot word-split, expand, or
/// inject. The program is resolved once, at construction, so one screen action cannot run two
/// different executables.
pub struct SystemBacklog {
    program: CliProgram,
    /// CLI 終了期限 (doc-5 §5, decision-18). A field rather than a constant read at the point of use
    /// so a test can state a deadline it can actually reach — a test that had to outlive the shipped
    /// 30 seconds would either not be written or be written as a 30-second test.
    deadline: Duration,
}

impl SystemBacklog {
    /// Resolve against this machine: アプリ設定, the process's `PATH`, and this build's target.
    pub fn resolve(configured: Option<&Path>) -> SystemBacklog {
        SystemBacklog {
            program: resolve(
                configured,
                env::var_os("PATH").as_deref(),
                SubPackage::current(),
                &|path| path.is_file(),
            ),
            deadline: CLI_DEADLINE,
        }
    }

    /// Which step of the order produced the program in hand.
    pub fn program(&self) -> &CliProgram {
        &self.program
    }

    /// The same executor against a stated program and deadline, for the deadline's own tests.
    #[cfg(test)]
    fn with_deadline(program: CliProgram, deadline: Duration) -> SystemBacklog {
        SystemBacklog { program, deadline }
    }
}

impl BacklogCli for SystemBacklog {
    fn run(&self, current_dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
        let program = self.program.program();
        let mut cmd = Command::new(program);
        if let Some(dir) = current_dir {
            cmd.current_dir(dir);
        }
        cmd.args(args);
        // Nothing here can be cancelled: the handle is made on this line and never leaves it, so the
        // deadline is this launch's only bound. An 更新操作 has no caller waiting to change its mind
        // — the screen that issued it is blocked on the answer — which is what separates this from
        // the `gh` 照会 (decision-19 履歴読取の取消).
        match subprocess::launch(&mut cmd, self.deadline, &Cancel::new()) {
            Ok(completed) => Ok(CliRun {
                success: completed.status.success(),
                code: completed.status.code(),
                stdout: completed.stdout,
                stderr: completed.stderr,
            }),
            // `std::io::Error` from a spawn names the errno and nothing else. Naming what we tried to
            // run is what makes a mistyped `backlog_cli` fixable: decision-16 uses that setting as
            // written, so the path in it is exactly the thing the user has to correct.
            Err(Stopped::Spawn(e)) => Err(RunError::Spawn(std::io::Error::new(
                e.kind(),
                format!("{}: {e}", program.display()),
            ))),
            // The only bound in force is the deadline, so reaching this arm means it elapsed.
            Err(Stopped::Ended { detail }) => Err(RunError::TimedOut {
                after: self.deadline,
                detail,
            }),
        }
    }
}

/// CLI 終了期限 (doc-5 §5, decision-18): how long one launch may take before Atlas stops waiting and
/// kills it. 30 seconds is ~100× the slowest steady-state invocation measured for decision-18
/// (`backlog task list` at 288 ms on a 110-task root) and ~30× the slowest cold one (1037 ms), so a
/// merely slow machine cannot reach it, while an unresponsive CLI can hold one project's backend for
/// at most this long.
pub const CLI_DEADLINE: Duration = Duration::from_secs(30);

/// What became of a screen action's plan (doc-5 §5). `Succeeded` means every invocation exited 0.
/// `Failed` carries which sub-command failed, its stderr, and how much of the plan already ran so a
/// partial application is visible and can be reconciled by reload (AC #3/#4, doc-5 §6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateOutcome {
    Succeeded,
    #[serde(rename_all = "camelCase")]
    Failed(UpdateFailure),
}

/// A CLI failure (doc-5 §5). The domain model is not touched by a failure; the caller reloads to
/// reconcile (doc-5 §6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFailure {
    /// The 写像先 that failed — a sub-command name like `"task edit"`, or [`MILESTONE_DESCRIBE`] for
    /// the 直接書き込み操作, which has no sub-command to name (doc-5 §1/§3).
    pub command: String,
    /// Why it failed, and its stderr as the failure reason shown to the user (doc-5 §5).
    pub kind: FailureKind,
    pub stderr: String,
    /// How many invocations in the plan succeeded before this one failed.
    pub completed_before: usize,
    /// 要再読込 (doc-5 §5): Atlas cannot say the managed files are as they were before the call, so
    /// the root must be re-read (doc-5 §6, AC #4). Two failures qualify, and the name says what they
    /// have in common rather than how they arose: an invocation after the first (an earlier one
    /// already wrote — 部分適用), and a 期限到達 (the killed invocation may have written, and
    /// `SIGKILL`/`TerminateProcess` runs nothing that could have told us — decision-18).
    pub reload_required: bool,
}

/// How a CLI invocation failed (doc-5 §5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FailureKind {
    /// The process could not be started (起動失敗): binary missing or not executable.
    Spawn,
    /// The process ran and exited non-zero; `code` is its exit code when known.
    NonZero { code: Option<i32> },
    /// 期限到達 (decision-18): the process was still running at [`CLI_DEADLINE`] and Atlas killed it.
    /// Kept apart from [`FailureKind::NonZero`] because no exit code was observed — the process did
    /// not decide anything, Atlas did — and apart from [`FailureKind::Spawn`] because it did start,
    /// which is why this one is always 要再読込.
    // The container's `rename_all` renames variants, not the fields inside them, so the one
    // multi-word field on this enum needs the attribute of its own that `code` never revealed.
    #[serde(rename_all = "camelCase")]
    TimedOut { after_ms: u64 },
    /// The 直接書き込み操作 could not write (doc-5 §5, decision-21). No process ran, so there is no
    /// exit code and no deadline to report; the reason travels in
    /// [`UpdateFailure::stderr`] like a CLI's does. Distinct from the three above because it is the
    /// only failure that is *never* 要再読込 on its own — 一時ファイル置換 leaves the old file whole.
    Write,
}

/// What [`UpdateFailure::command`] says when the 直接書き込み操作 fails. Named after the doc-5 §3
/// operation rather than invented, and Japanese because the screen reads it in a Japanese sentence
/// (`… が失敗しました`) exactly where a sub-command name would go.
pub const MILESTONE_DESCRIBE: &str = "マイルストーン説明の更新";

/// The seam the 直接書き込み操作 reaches the disk through (doc-5 §1, decision-21).
///
/// Implemented by the freshness layer (`sync`), not here, and for one reason: the file to write is
/// the milestone's management file as the domain model knows it, and that is also the file whose
/// version was checked a moment earlier. Resolving it there makes "what was checked is what is
/// written" hold by construction. Taking a path as a parameter instead would let a caller — the
/// command layer, or a future one — hand in a path the check never saw.
pub trait DirectWriter {
    /// Replace 説明の本文範囲 of the milestone `name` identifies, leaving every other byte of its
    /// file as it was. `Ok(())` means the whole new file is under the destination's name; every
    /// `Err` means the whole old file still is (decision-17).
    fn write_milestone_description(
        &self,
        name: &str,
        description: &str,
    ) -> Result<(), WriteFailure>;
}

/// Why a 直接書き込み操作 did not write (doc-5 §5). One string rather than an enum of causes: it
/// occupies the place a CLI's stderr does, and the screen states it the same way. The distinctions
/// that matter to the code — refused before writing versus failed while writing — do not change
/// what the user is told or what the model does, because either way nothing was written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteFailure {
    pub detail: String,
}

/// 説明の本文範囲 replaced in the text of a milestone file (decision-21), or `Err` when the file has
/// no Description to replace.
///
/// The range comes from [`crate::read::parse::description_span`] — the same function the read layer
/// takes [`crate::domain::Milestone::description`] from — so what is replaced is exactly what the
/// screen was showing. Everything outside it, frontmatter and file name included, is carried over
/// byte for byte: this function only ever concatenates the untouched head, the new description, and
/// the untouched tail.
///
/// A file whose Description is opened any other way is refused rather than written. Two cases, one
/// reason: a file with no Description at all would have to be given a heading, and a file whose
/// Description is a `SECTION:DESCRIPTION` pair — a task file's shape, reachable in a milestone only
/// by hand-editing — would have Atlas writing into a shape v1.49.3's `milestone add` never produces.
/// Either is Atlas deciding what a milestone file looks like, which is decision-21's first condition
/// in reverse: the CLI defines the format, and Atlas writes into the shape the CLI already wrote.
///
/// The SECTION case is where the read is deliberately wider than the write. Such a milestone still
/// shows its description on screen and saving it is refused with the reason said — the refusal
/// decision-21 provides for, not a silent divergence: what the third condition forbids is the range
/// moving, and the range is the same one either way.
pub fn milestone_text_with_description(
    text: &str,
    description: &str,
) -> Result<String, WriteFailure> {
    let Ok((_, body)) = crate::read::parse::split_frontmatter(text) else {
        return Err(WriteFailure {
            detail: "the milestone file does not open with a frontmatter block".to_string(),
        });
    };
    // `body` is a suffix of `text` (`split_frontmatter` returns sub-slices, and a BOM can only sit
    // at the front), so its start is what is left of the file once the body is taken off the end.
    let body_at = text.len() - body.len();
    let Some(found) = crate::read::parse::description_span(body) else {
        return Err(WriteFailure {
            detail: "the milestone file has no `## Description` section to update".to_string(),
        });
    };
    if found.opener != DescriptionOpener::Heading {
        return Err(WriteFailure {
            detail: "the milestone file's Description is a SECTION marker pair, which \
                     `milestone add` does not write; Atlas updates only a `## Description` section"
                .to_string(),
        });
    }
    let span = found.range;
    let mut out = String::with_capacity(text.len() + description.len());
    out.push_str(&text[..body_at + span.start]);
    out.push_str(&filled(&body[span.clone()], description));
    out.push_str(&text[body_at + span.end..]);
    Ok(out)
}

/// The bytes to put in 説明の本文範囲 for `description`, given what the range holds now.
///
/// The range starts at the line *after* the heading and ends at the line before whatever closes it,
/// so its content is `\n` + the text + whatever blank lines separated it from the next section. The
/// description alone cannot be written into it: `## Notes` would end up on the same line as the last
/// word, and a `##` that no longer starts a line stops closing the range — the next read would take
/// the rest of the file as the description.
///
/// So the line structure is rebuilt: a leading newline, the text, and the whitespace that closed the
/// range before (a single newline when there was none to keep, as at end of file). Keeping the old
/// trailing run is what leaves a blank line before the next heading exactly as it was; it is inside
/// the range, so it is ours to write, but there is no reason to churn it. An empty description
/// collapses to the newline alone, which is the same shape `milestone add` leaves a description-less
/// heading in.
///
/// The text is trimmed because the read layer trims: writing untrimmed would put bytes in the file
/// that the next read discards, and the box would then differ from the file it was saved from.
fn filled(current: &str, description: &str) -> String {
    let description = description.trim();
    if description.is_empty() {
        return "\n".to_string();
    }
    let trailing = &current[current.trim_end().len()..];
    let trailing = if trailing.contains('\n') {
        trailing
    } else {
        "\n"
    };
    format!("\n{description}{trailing}")
}

/// Run one screen action — a sequence of operations executed as a unit (doc-5 §5) — against
/// `project_root` (AC #1/#2/#3/#4). Requires a [`CliCapability`], so it is unreachable without a
/// supported CLI (AC #6). Planning happens first for *all* operations: if any is out of capability,
/// `Err(RejectReason)` is returned and **nothing launches** (AC #5). Otherwise each invocation runs
/// with `project_root` as its working directory and arguments passed as array elements; the first
/// failure aborts the rest and is reported with how many already ran (AC #4). The `_capability`
/// is the gate, not a parameter to the CLI — its presence is the proof a supported version exists.
pub fn run(
    project_root: &Path,
    action: &[UpdateOperation],
    _capability: &CliCapability,
    cli: &dyn BacklogCli,
    writer: &dyn DirectWriter,
) -> Result<UpdateOutcome, RejectReason> {
    // Plan every operation before launching any, so an out-of-capability operation refuses the
    // whole action before a single process starts (AC #5, doc-5 §5).
    let mut plan: Vec<Mapped> = Vec::new();
    for op in action {
        plan.extend(plan_operation(op)?);
    }
    Ok(execute(project_root, &plan, cli, writer))
}

/// Run a planned sequence, aborting on the first failure (doc-5 §5, AC #4). Split from [`run`] so
/// execution is testable with a hand-built plan and so the abort-on-failure contract is in one place.
fn execute(
    project_root: &Path,
    plan: &[Mapped],
    cli: &dyn BacklogCli,
    writer: &dyn DirectWriter,
) -> UpdateOutcome {
    for (i, step) in plan.iter().enumerate() {
        let inv = match step {
            Mapped::Invoke(inv) => inv,
            // 直接書き込み操作 (doc-5 §1, decision-21). Reported like a CLI failure — same shape,
            // same abort — because from the screen's side it is the same event: the update did not
            // happen, and here is why (doc-5 §5).
            Mapped::WriteMilestoneDescription { name, description } => {
                if let Err(failure) = writer.write_milestone_description(name, description) {
                    return UpdateOutcome::Failed(UpdateFailure {
                        command: MILESTONE_DESCRIBE.to_string(),
                        kind: FailureKind::Write,
                        stderr: failure.detail,
                        // 一時ファイル置換 leaves the whole old file under the destination's name
                        // however it fails (decision-17), so this step on its own changed nothing.
                        // Only an earlier step in the plan can make the root need re-reading.
                        completed_before: i,
                        reload_required: i > 0,
                    });
                }
                continue;
            }
        };
        let argv = inv.to_argv();
        match cli.run(Some(project_root), &argv) {
            // A launch with no verdict (doc-5 §5). 起動失敗 put nothing of *this* invocation on
            // disk, so only an earlier one can make it 要再読込; 期限到達 did start the process, so
            // it is 要再読込 even as the first invocation — it may have written before Atlas killed
            // it, and nothing it could have run on the way out would have said so (decision-18).
            Err(error) => {
                let (kind, reload_required) = match &error {
                    RunError::Spawn(_) => (FailureKind::Spawn, i > 0),
                    RunError::TimedOut { after, .. } => (
                        FailureKind::TimedOut {
                            after_ms: after.as_millis() as u64,
                        },
                        true,
                    ),
                };
                return UpdateOutcome::Failed(UpdateFailure {
                    command: inv.command_name(),
                    kind,
                    stderr: error.to_string(),
                    completed_before: i,
                    reload_required,
                });
            }
            Ok(run) if !run.success => {
                // Non-zero exit: keep stderr as the failure reason and stop; the domain model is
                // left unchanged (doc-5 §5), and any earlier invocation's effect is reconciled by
                // reload (doc-5 §6).
                return UpdateOutcome::Failed(UpdateFailure {
                    command: inv.command_name(),
                    kind: FailureKind::NonZero { code: run.code },
                    stderr: run.stderr,
                    completed_before: i,
                    reload_required: i > 0,
                });
            }
            Ok(_) => {}
        }
    }
    UpdateOutcome::Succeeded
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::VecDeque;
    use std::path::PathBuf;
    use std::time::Instant;

    // --- 実行ファイル解決の順序 (doc-5 §4, decision-16) ------------------------------------------

    /// The two targets the order behaves differently for. Built here rather than from
    /// [`SubPackage::current`] so both branches are exercised on whichever host runs the tests —
    /// the reason the target is a value at all (m-1 TASK-44).
    const WINDOWS: SubPackage = SubPackage {
        platform: "windows",
        arch: "x64",
    };
    const MACOS: SubPackage = SubPackage {
        platform: "darwin",
        arch: "arm64",
    };

    /// Every path below is built by joining segments and every `PATH` by [`env::join_paths`], so the
    /// separators are the host's on whichever host runs the tests. Windows-shaped literals could not
    /// be used even for the Windows cases: a drive letter's colon is a `PATH` separator on Unix, so
    /// `join_paths` refuses it and `split_paths` would tear it in half. Path *syntax* is `std`'s
    /// concern anyway — what these fix is the order and the layout walk.
    fn path_var(dirs: &[&Path]) -> std::ffi::OsString {
        env::join_paths(dirs.iter().copied()).expect("joinable")
    }

    /// An `exists` that answers from a fixed list, so a candidate the resolution builds has to match
    /// the layout the test states.
    fn only(paths: Vec<PathBuf>) -> impl Fn(&Path) -> bool {
        move |candidate: &Path| paths.iter().any(|p| p == candidate)
    }

    /// npm's Windows prefix: the shims and `node_modules` sit in the same directory.
    fn npm_prefix() -> PathBuf {
        PathBuf::from("prefix").join("npm")
    }

    /// The nesting npm actually produces: the sub-package under `backlog.md`'s own `node_modules`.
    fn nested_under(node_modules: &Path) -> PathBuf {
        node_modules
            .join("backlog.md")
            .join("node_modules")
            .join("backlog.md-windows-x64")
            .join("backlog.exe")
    }

    #[test]
    fn without_a_setting_a_unix_host_still_gets_the_bare_name() {
        // AC #4, and the structural half of decision-16: macOS・Linux reach 順序 3, so what reaches
        // `Command::new` is the same `"backlog"` as before this change — whatever is on PATH.
        let bin = PathBuf::from("usr").join("local").join("bin");
        let resolved = resolve(
            None,
            Some(path_var(&[&bin]).as_os_str()),
            MACOS,
            &only(vec![bin.join("backlog")]),
        );
        assert_eq!(resolved, CliProgram::OnPath);
        assert_eq!(resolved.program(), Path::new("backlog"));
    }

    #[test]
    fn a_windows_host_walks_from_the_shim_to_the_sub_package() {
        // The defect TASK-60 reports: PATH holds the three shims and no `backlog.exe`, so 順序 3
        // alone finds nothing (Rust appends only `.exe`). 順序 2 reaches the real executable.
        let prefix = npm_prefix();
        let binary = nested_under(&prefix.join("node_modules"));
        let resolved = resolve(
            None,
            Some(path_var(&[&prefix, Path::new("windows")]).as_os_str()),
            WINDOWS,
            &only(vec![prefix.join("backlog.cmd"), binary.clone()]),
        );
        assert_eq!(resolved, CliProgram::SubPackage(binary));
    }

    #[test]
    fn a_hoisted_sub_package_is_found_too() {
        let prefix = npm_prefix();
        let hoisted = prefix
            .join("node_modules")
            .join("backlog.md-windows-x64")
            .join("backlog.exe");
        let resolved = resolve(
            None,
            Some(path_var(&[&prefix]).as_os_str()),
            WINDOWS,
            &only(vec![prefix.join("backlog.ps1"), hoisted.clone()]),
        );
        assert_eq!(resolved, CliProgram::SubPackage(hoisted));
    }

    #[test]
    fn a_prefix_that_keeps_bin_and_lib_apart_is_found_too() {
        // npm's other prefix layout: the shim in `bin` and the packages one level up under `lib`.
        let prefix = PathBuf::from("tools").join("node");
        let bin = prefix.join("bin");
        let binary = nested_under(&prefix.join("lib").join("node_modules"));
        let resolved = resolve(
            None,
            Some(path_var(&[&bin]).as_os_str()),
            WINDOWS,
            &only(vec![bin.join("backlog"), binary.clone()]),
        );
        assert_eq!(resolved, CliProgram::SubPackage(binary));
    }

    #[test]
    fn a_native_executable_on_path_outranks_the_npm_layout() {
        // decision-16 順序 2 の但し書き: a `backlog.exe` on PATH — Scoop's, or a future sidecar's —
        // is the OS's to resolve. Walking npm's layout anyway would run a different CLI than the one
        // the user put on PATH.
        let scoop = PathBuf::from("scoop").join("shims");
        let prefix = npm_prefix();
        let resolved = resolve(
            None,
            Some(path_var(&[&scoop, &prefix]).as_os_str()),
            WINDOWS,
            &only(vec![
                scoop.join("backlog.exe"),
                prefix.join("backlog.cmd"),
                nested_under(&prefix.join("node_modules")),
            ]),
        );
        assert_eq!(resolved, CliProgram::OnPath);
    }

    #[test]
    fn a_shim_with_no_sub_package_falls_through_rather_than_guessing() {
        let prefix = npm_prefix();
        let resolved = resolve(
            None,
            Some(path_var(&[&prefix]).as_os_str()),
            WINDOWS,
            &only(vec![prefix.join("backlog.cmd")]),
        );
        assert_eq!(resolved, CliProgram::OnPath);
    }

    #[test]
    fn an_absent_path_variable_resolves_to_the_bare_name() {
        assert_eq!(
            resolve(None, None, WINDOWS, &only(Vec::new())),
            CliProgram::OnPath
        );
    }

    #[test]
    fn the_setting_is_used_as_written_even_when_nothing_is_there() {
        // decision-16 順序 1: no existence check and no fall-back. A mistyped path has to surface as
        // its own 起動失敗 naming that path — falling through would hide the typo behind a CLI the
        // user did not name.
        let typo = PathBuf::from("opt").join("backlog").join("balcklog");
        let prefix = npm_prefix();
        let resolved = resolve(
            Some(&typo),
            Some(path_var(&[&prefix]).as_os_str()),
            WINDOWS,
            &only(vec![
                prefix.join("backlog.cmd"),
                nested_under(&prefix.join("node_modules")),
            ]),
        );
        assert_eq!(resolved, CliProgram::Configured(typo.clone()));
        assert_eq!(resolved.program(), typo);
    }

    #[test]
    fn a_spawn_failure_names_the_program_it_tried() {
        // Without this the 縮退 reason is a bare errno, which says nothing about *which* executable
        // was missing — the one actionable fact when 順序 1 holds a mistyped path.
        let missing = "/opt/backlog/does-not-exist";
        let cli = SystemBacklog::with_deadline(
            CliProgram::Configured(PathBuf::from(missing)),
            CLI_DEADLINE,
        );
        let CliStatus::Unavailable { detail } = probe(&cli) else {
            panic!("a missing executable is 起動失敗");
        };
        assert!(detail.contains(missing), "detail should name it: {detail}");
    }

    // --- CLI 終了期限 (doc-5 §5, decision-18, TASK-85 AC #3) ---------------------------------------

    /// A real process that outlives any deadline this test would set, and one that ends at once.
    ///
    /// Both are the host's own programs rather than a fixture built here: what is under test is that
    /// `SystemBacklog::run` bounds a *process*, so a fake `BacklogCli` would test nothing — there
    /// would be no child to kill. The pair is platform-specific because the programs are; the
    /// assertions below are not.
    #[cfg(unix)]
    fn hangs_forever() -> (&'static str, Vec<String>) {
        ("sleep", vec!["600".to_string()])
    }
    #[cfg(windows)]
    fn hangs_forever() -> (&'static str, Vec<String>) {
        // `ping` waits a second between echoes, so 600 of them outlast any deadline here. Chosen over
        // `timeout` because `timeout` refuses to run without a console.
        (
            "ping",
            vec!["-n".to_string(), "600".to_string(), "127.0.0.1".to_string()],
        )
    }

    #[cfg(unix)]
    fn exits_at_once() -> (&'static str, Vec<String>) {
        ("true", Vec::new())
    }
    #[cfg(windows)]
    fn exits_at_once() -> (&'static str, Vec<String>) {
        (
            "ping",
            vec!["-n".to_string(), "1".to_string(), "127.0.0.1".to_string()],
        )
    }

    fn bounded(program: &str, deadline: Duration) -> SystemBacklog {
        SystemBacklog::with_deadline(CliProgram::Configured(PathBuf::from(program)), deadline)
    }

    #[test]
    fn a_process_that_outlives_the_deadline_is_killed_and_reported_as_timed_out() {
        let (program, args) = hangs_forever();
        let deadline = Duration::from_millis(200);
        let started = Instant::now();
        let error = bounded(program, deadline)
            .run(None, &args)
            .expect_err("a process that never exits cannot produce a verdict");
        let elapsed = started.elapsed();

        assert!(
            matches!(error, RunError::TimedOut { after, .. } if after == deadline),
            "the deadline is what ended the wait: {error:?}"
        );
        // What this proves is the bound, and only that. Before returning, `run` attempts the `kill`
        // and the reaping `wait` — but neither is required to have succeeded (a failure is named in
        // the failure text instead), and the pipe readers are not waited on at all, since a
        // descendant can hold those open indefinitely. So a prompt return says the deadline ended
        // the wait; it does not say the process is gone, and it does not say EOF was reached.
        // Waiting the program out instead would take ten minutes.
        assert!(
            elapsed < Duration::from_secs(5),
            "the wait must end at the deadline, not at the program's own exit ({elapsed:?})"
        );
    }

    /// The positive counterpart. Without it the assertion above holds just as well for an executor
    /// that reports 期限到達 for everything, including a CLI that answered.
    #[test]
    fn a_process_that_finishes_inside_the_deadline_returns_its_exit() {
        let (program, args) = exits_at_once();
        let run = bounded(program, Duration::from_secs(30))
            .run(None, &args)
            .expect("a program that exits produces a verdict");
        assert!(run.success, "the program exits 0");
        assert_eq!(run.code, Some(0));
    }

    /// 512 KiB is past every platform's default pipe buffer (64 KiB on Linux and Windows; macOS grows
    /// to at most 64 KiB), so an undrained pipe would block the writer well before this much.
    const LARGE_OUTPUT: usize = 512 * 1024;

    /// A program whose *output* is large but whose command line is short. The payload has to be
    /// produced after startup rather than passed in: on Windows a process command line is capped at
    /// 32,767 characters and `cmd.exe`'s own limit is 8,191, so a 512 KiB argument fails at `spawn`
    /// and the test would never reach the pipe it is about.
    #[cfg(unix)]
    fn writes_large_output() -> (&'static str, Vec<String>) {
        (
            "sh",
            vec![
                "-c".to_string(),
                format!("yes 0123456789abcdefghijklmnopqrstuvwxyz | head -c {LARGE_OUTPUT}"),
            ],
        )
    }
    #[cfg(windows)]
    fn writes_large_output() -> (&'static str, Vec<String>) {
        // 16,384 lines of 32 characters plus CRLF — comfortably past `LARGE_OUTPUT`.
        (
            "cmd",
            vec![
                "/c".to_string(),
                "for /L %i in (1,1,16384) do @echo 01234567890123456789012345678901".to_string(),
            ],
        )
    }

    /// A CLI's output has to survive the bounded wait: the pipes are drained on their own threads
    /// precisely so a child writing more than one pipe buffer neither deadlocks nor loses its tail.
    /// Without draining, the assertion below is where a naive `try_wait` loop turns into a 期限到達.
    #[test]
    fn output_larger_than_a_pipe_buffer_comes_back_whole() {
        let (program, args) = writes_large_output();
        let run = bounded(program, Duration::from_secs(30))
            .run(None, &args)
            .expect("a program that exits produces a verdict");
        assert!(
            run.stdout.len() >= LARGE_OUTPUT,
            "the whole of a large stdout must come back, got {} bytes",
            run.stdout.len()
        );
    }

    /// The bound has to cover the *drain*, not just the child. A pipe reaches EOF only when every
    /// writer has closed it, so a descendant that inherited stdout keeps it open long after the direct
    /// child is gone — and waiting for EOF there hands back exactly the unbounded wait the deadline
    /// exists to remove. Both return paths are checked: the child that exits, and the child that is
    /// killed at the deadline.
    ///
    /// Unix only, because building such a descendant is the shell's business, not this code's, and a
    /// Windows equivalent written here could not be run on this host — a stated gap is worth more than
    /// an unverified branch. What is under test is platform-independent (`subprocess` bounds
    /// the drain everywhere); only the way to construct the situation is not.
    #[cfg(unix)]
    #[test]
    fn a_descendant_holding_the_pipes_does_not_extend_the_wait() {
        // The direct child exits at once, leaving `sleep 10` holding the stdout it inherited.
        let started = Instant::now();
        let run = bounded("sh", Duration::from_secs(30))
            .run(None, &["-c".to_string(), "sleep 10 & exit 0".to_string()])
            .expect("the direct child exited, so there is a verdict");
        let after_exit = started.elapsed();
        assert!(run.success, "the direct child's own exit is the verdict");
        assert!(
            after_exit < Duration::from_secs(5),
            "an exited child's output must be taken under the drain grace, not on the descendant's \
             schedule ({after_exit:?})"
        );

        // The direct child outlives the deadline and is killed; the descendant still holds stdout.
        let started = Instant::now();
        let error = bounded("sh", Duration::from_millis(200))
            .run(None, &["-c".to_string(), "sleep 10 & sleep 10".to_string()])
            .expect_err("the direct child never exits");
        let after_kill = started.elapsed();
        assert!(
            matches!(error, RunError::TimedOut { .. }),
            "the deadline ended the wait: {error:?}"
        );
        assert!(
            after_kill < Duration::from_secs(5),
            "a 期限到達 must not then wait on a descendant's pipe ({after_kill:?})"
        );
    }

    /// 期限到達 is 要再読込 even as the first invocation, and it is not reported as a non-zero exit —
    /// no exit code was observed (decision-18).
    #[test]
    fn a_timed_out_invocation_is_reload_required_from_the_first_call() {
        struct TimingOutCli;
        impl BacklogCli for TimingOutCli {
            fn run(&self, _dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
                if args == ["--version"] {
                    return Ok(CliRun {
                        success: true,
                        code: Some(0),
                        stdout: MIN_VERSION.to_string(),
                        stderr: String::new(),
                    });
                }
                Err(RunError::TimedOut {
                    after: Duration::from_secs(30),
                    detail: None,
                })
            }
        }
        let cli = TimingOutCli;
        let CliStatus::Supported(capability) = probe(&cli) else {
            panic!("the fake reports a supported version");
        };
        let outcome = run(
            Path::new("/projects/atlas"),
            &[UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    status: Some("Done".to_string()),
                    ..TaskEdit::default()
                },
            }],
            &capability,
            &cli,
            &FakeWriter::default(),
        )
        .expect("planning succeeds; the failure is at run time");
        let UpdateOutcome::Failed(failure) = outcome else {
            panic!("a timed-out invocation fails the action");
        };
        assert!(
            matches!(failure.kind, FailureKind::TimedOut { after_ms } if after_ms == 30_000),
            "kind must be 期限到達, got {:?}",
            failure.kind
        );
        assert_eq!(failure.completed_before, 0, "it was the first invocation");
        assert!(
            failure.reload_required,
            "a killed invocation may have written, so the root must be re-read (doc-5 §5)"
        );
    }

    #[test]
    fn this_build_targets_a_sub_package_the_package_actually_publishes() {
        // The tokens are `resolveBinary.cjs`'s, not Rust's: `windows` not `win32`, `x64` not
        // `x86_64`. A build whose target maps to neither still resolves — it lands on 順序 3.
        let current = SubPackage::current();
        assert!(current.package().starts_with("backlog.md-"));
        assert_eq!(
            current.executable(),
            if cfg!(target_os = "windows") {
                "backlog.exe"
            } else {
                "backlog"
            }
        );
        assert_eq!(current.is_windows(), cfg!(target_os = "windows"));
    }

    // --- a scriptable CLI so no real `backlog` is needed --------------------------------------

    /// A [`BacklogCli`] that records every call and replays scripted results. `--version` is
    /// answered from `version`/`version_ok`; every other call pops the next scripted `CliRun`,
    /// defaulting to success. Recording the full argv+cwd is what lets the tests assert AC #2
    /// (each argument is its own element, cwd is the project root).
    struct FakeCli {
        version: String,
        version_ok: bool,
        spawn_error: bool,
        results: RefCell<VecDeque<CliRun>>,
        calls: RefCell<Vec<(Option<PathBuf>, Vec<String>)>>,
    }

    impl FakeCli {
        fn supported() -> Self {
            FakeCli {
                version: MIN_VERSION.to_string(),
                version_ok: true,
                spawn_error: false,
                results: RefCell::new(VecDeque::new()),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn push_failure(&self, code: i32, stderr: &str) {
            self.results.borrow_mut().push_back(CliRun {
                success: false,
                code: Some(code),
                stdout: String::new(),
                stderr: stderr.to_string(),
            });
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.calls
                .borrow()
                .iter()
                .filter(|(_, argv)| argv != &vec!["--version".to_string()])
                .map(|(_, argv)| argv.clone())
                .collect()
        }

        fn cwds(&self) -> Vec<Option<PathBuf>> {
            self.calls
                .borrow()
                .iter()
                .filter(|(_, argv)| argv != &vec!["--version".to_string()])
                .map(|(dir, _)| dir.clone())
                .collect()
        }
    }

    impl BacklogCli for FakeCli {
        fn run(&self, current_dir: Option<&Path>, args: &[String]) -> Result<CliRun, RunError> {
            self.calls
                .borrow_mut()
                .push((current_dir.map(Path::to_path_buf), args.to_vec()));
            if args == ["--version"] {
                if self.spawn_error {
                    return Err(RunError::Spawn(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "backlog not found",
                    )));
                }
                return Ok(CliRun {
                    success: self.version_ok,
                    code: Some(if self.version_ok { 0 } else { 1 }),
                    stdout: self.version.clone(),
                    stderr: String::new(),
                });
            }
            if self.spawn_error {
                return Err(RunError::Spawn(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "backlog not found",
                )));
            }
            Ok(self.results.borrow_mut().pop_front().unwrap_or(CliRun {
                success: true,
                code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            }))
        }
    }

    fn capability() -> CliCapability {
        match probe(&FakeCli::supported()) {
            CliStatus::Supported(cap) => cap,
            other => panic!("expected supported, got {other:?}"),
        }
    }

    fn root() -> PathBuf {
        PathBuf::from("/projects/atlas")
    }

    fn run_one(op: UpdateOperation, cli: &FakeCli) -> Result<UpdateOutcome, RejectReason> {
        run(
            &root(),
            std::slice::from_ref(&op),
            &capability(),
            cli,
            &FakeWriter::default(),
        )
    }

    /// The 直接書き込み操作's writer, recorded rather than performed (doc-5 §1). `sync` owns the real
    /// one, because only it can resolve the milestone's file from the model; what this module's
    /// tests decide is that the operation reaches a writer at all, in the plan's order, and that a
    /// refusal from one is reported like a CLI failure.
    ///
    /// It records instead of doing nothing so a CLI-only test cannot pass while silently writing:
    /// `wrote()` is asserted empty where nothing should have been written.
    #[derive(Default)]
    struct FakeWriter {
        wrote: RefCell<Vec<(String, String)>>,
        refuses: Option<String>,
    }

    impl FakeWriter {
        fn refusing(detail: &str) -> Self {
            FakeWriter {
                wrote: RefCell::new(Vec::new()),
                refuses: Some(detail.to_string()),
            }
        }

        fn wrote(&self) -> Vec<(String, String)> {
            self.wrote.borrow().clone()
        }
    }

    impl DirectWriter for FakeWriter {
        fn write_milestone_description(
            &self,
            name: &str,
            description: &str,
        ) -> Result<(), WriteFailure> {
            self.wrote
                .borrow_mut()
                .push((name.to_string(), description.to_string()));
            match &self.refuses {
                Some(detail) => Err(WriteFailure {
                    detail: detail.clone(),
                }),
                None => Ok(()),
            }
        }
    }

    // --- AC #6: version probe decides read-only vs update-enabled -----------------------------

    #[test]
    fn a_supported_version_yields_a_capability() {
        assert!(matches!(
            probe(&FakeCli::supported()),
            CliStatus::Supported(_)
        ));
    }

    #[test]
    fn a_missing_cli_is_unavailable_not_a_panic() {
        let mut cli = FakeCli::supported();
        cli.spawn_error = true;
        assert!(matches!(probe(&cli), CliStatus::Unavailable { .. }));
    }

    #[test]
    fn a_too_old_version_is_unsupported() {
        let mut cli = FakeCli::supported();
        cli.version = "1.46.0".to_string();
        match probe(&cli) {
            CliStatus::Unsupported { version } => assert_eq!(version, "1.46.0"),
            other => panic!("expected Unsupported, got {other:?}"),
        }
    }

    #[test]
    fn the_boundary_sits_exactly_at_the_confirmed_floor() {
        // Both sides are derived from `MIN_VERSION` rather than spelled (decision-27 §1), so raising
        // the floor moves this boundary with it. A spelled pair would keep guarding the *old* floor
        // and still pass — and a version that used to be supported is precisely what needs a guard
        // once the floor moves past it (TASK-152: v1.48.0 was supported before this raise).
        // Borrow from the next place up, so a floor like `2.0.0` yields `1.MAX.MAX` rather than
        // panicking on a `0 - 1`: backlog.md is already publishing 1.50.x, so a major bump is a
        // reachable future for this constant and not a case worth calling impossible.
        let below = if MIN_VERSION.patch > 0 {
            Version {
                patch: MIN_VERSION.patch - 1,
                ..MIN_VERSION
            }
        } else if MIN_VERSION.minor > 0 {
            Version {
                minor: MIN_VERSION.minor - 1,
                patch: u32::MAX,
                ..MIN_VERSION
            }
        } else {
            Version {
                major: MIN_VERSION
                    .major
                    .checked_sub(1)
                    .expect("0.0.0 is the lowest version there is, so no floor sits below it"),
                minor: u32::MAX,
                patch: u32::MAX,
            }
        };
        let mut older = FakeCli::supported();
        older.version = below.to_string();
        match probe(&older) {
            CliStatus::Unsupported { version } => assert_eq!(version, below.to_string()),
            other => panic!("expected Unsupported for {below}, got {other:?}"),
        }

        let at_floor = FakeCli::supported();
        assert!(matches!(probe(&at_floor), CliStatus::Supported(_)));
    }

    #[test]
    fn a_newer_version_is_supported_no_upper_bound() {
        // decision-7 fixes no upper bound; a higher version is supported and degrades only if the
        // CLI later rejects an option (surfaced as an ordinary CLI failure).
        let mut cli = FakeCli::supported();
        cli.version = "2.0.0".to_string();
        assert!(matches!(probe(&cli), CliStatus::Supported(_)));
    }

    #[test]
    fn an_unparseable_version_is_unsupported() {
        let mut cli = FakeCli::supported();
        cli.version = "not-a-version".to_string();
        assert!(matches!(probe(&cli), CliStatus::Unsupported { .. }));
    }

    #[test]
    fn version_parse_tolerates_decoration() {
        // Round-tripped through `Display` rather than spelled, so the confirmed version lives only in
        // `MIN_VERSION` (decision-27). The decoration — a leading `v`, a trailing newline — is what
        // `backlog --version` actually emits, and is the part this test is about.
        assert_eq!(
            Version::parse(&MIN_VERSION.to_string()).unwrap(),
            MIN_VERSION
        );
        assert_eq!(
            Version::parse(&format!("v{MIN_VERSION}\n")).unwrap(),
            MIN_VERSION
        );
        // A version unrelated to MIN_VERSION: the missing-patch rule is the parser's, so tying it to
        // the floor would make raising the floor look like a change to this rule.
        assert_eq!(
            Version::parse("9.4").unwrap(),
            Version {
                major: 9,
                minor: 4,
                patch: 0
            }
        );
        assert!(Version::parse("").is_none());
    }

    // --- AC #2: working directory is the project root, args are array elements ------------------

    #[test]
    fn runs_in_the_project_root_with_arguments_as_elements() {
        let cli = FakeCli::supported();
        // A title with whitespace, a newline, and a shell metacharacter: if any of these split or
        // expanded, the recorded argv would show more than one element for the title.
        let title = "release: v2 & \"launch\"\nline two";
        let outcome = run_one(
            UpdateOperation::TaskCreate(TaskCreate {
                title: title.to_string(),
                ..Default::default()
            }),
            &cli,
        )
        .unwrap();
        assert_eq!(outcome, UpdateOutcome::Succeeded);
        assert_eq!(cli.cwds(), vec![Some(root())]);
        // The whole title is exactly one argv element, unsplit (AC #2).
        assert_eq!(cli.calls(), vec![vec!["task", "create", title]]);
    }

    #[test]
    fn an_option_and_its_value_are_two_separate_elements() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    status: Some("In Progress".to_string()),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        // `--status` and `In Progress` are distinct elements; the value is not joined to the flag.
        assert_eq!(
            cli.calls(),
            vec![vec!["task", "edit", "TASK-1", "--status", "In Progress"]]
        );
    }

    // --- AC #1: the operation map ------------------------------------------------------------

    #[test]
    fn task_create_maps_the_create_time_range_atlas_passes() {
        // The range is Atlas's, not the CLI's: v1.49.3 `task create` also accepts `-a`/`--plan`/
        // `--notes`/`--ref`/`--depends-on` (doc-5 §3). Every field this struct can hold reaches the
        // argv; the ones it cannot hold are a product judgment stated on [`TaskCreate`].
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskCreate(TaskCreate {
                title: "Add OAuth".to_string(),
                description: Some("context".to_string()),
                status: Some("To Do".to_string()),
                labels: vec!["ui".to_string(), "auth".to_string()],
                priority: Some("high".to_string()),
                milestone: Some("m-1".to_string()),
                acceptance_criteria: vec!["login works".to_string(), "logout works".to_string()],
            }),
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "create",
                "Add OAuth",
                "--description",
                "context",
                "--status",
                "To Do",
                "--priority",
                "high",
                "--milestone",
                "m-1",
                "--labels",
                "ui,auth",
                "--ac",
                "login works",
                "--ac",
                "logout works",
            ]]
        );
    }

    #[test]
    fn task_edit_combines_fields_into_one_call() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    title: Some("New title".to_string()),
                    milestone: Some("m-2".to_string()),
                    add_labels: vec!["ui".to_string()],
                    remove_labels: vec!["old".to_string()],
                    notes: NoteEdit::Append("progress".to_string()),
                    dependencies: Some(vec!["TASK-2".to_string(), "TASK-3".to_string()]),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--title",
                "New title",
                "--milestone",
                "m-2",
                "--append-notes",
                "progress",
                "--add-label",
                "ui",
                "--remove-label",
                "old",
                "--depends-on",
                "TASK-2,TASK-3",
            ]]
        );
    }

    #[test]
    fn multiple_labels_are_comma_joined_into_one_flag() {
        // Regression (review [P1]): repeating `--add-label`/`--remove-label` means different things
        // per version — v1.47.1 keeps only the last value, v1.48.0 accumulates (both measured) — so
        // multiple labels must go in one comma-separated value, the form both versions agree on.
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    add_labels: vec!["ui".to_string(), "auth".to_string()],
                    remove_labels: vec!["old".to_string(), "stale".to_string()],
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--add-label",
                "ui,auth",
                "--remove-label",
                "old,stale",
            ]]
        );
    }

    #[test]
    fn ac_delta_uses_single_purpose_options() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    ac: AcEdit::Delta {
                        add: vec!["new criterion".to_string()],
                        remove: vec![2],
                        check: vec![1],
                        uncheck: vec![3],
                    },
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--ac",
                "new criterion",
                "--remove-ac",
                "2",
                "--check-ac",
                "1",
                "--uncheck-ac",
                "3",
            ]]
        );
    }

    #[test]
    fn ac_replace_is_the_composite_remove_add_check() {
        // doc-5 §3/§3.1: whole-set replace is remove-all + add + check-by-new-index, one call.
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    ac: AcEdit::Replace {
                        existing: 2,
                        items: vec![
                            AcItem {
                                text: "first".to_string(),
                                checked: true,
                            },
                            AcItem {
                                text: "second".to_string(),
                                checked: false,
                            },
                        ],
                    },
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--remove-ac",
                "1",
                "--remove-ac",
                "2",
                "--ac",
                "first",
                "--ac",
                "second",
                "--check-ac",
                "1",
            ]]
        );
    }

    #[test]
    fn references_full_replace_repeats_ref_for_each() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    references: Some(vec![
                        "https://example.test/pull/1".to_string(),
                        "doc-4".to_string(),
                    ]),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--ref",
                "https://example.test/pull/1",
                "--ref",
                "doc-4",
            ]]
        );
    }

    #[test]
    fn draft_and_task_transitions_are_positional() {
        for (op, expected) in [
            (
                UpdateOperation::DraftPromote {
                    draft_id: "DRAFT-1".to_string(),
                },
                vec!["draft", "promote", "DRAFT-1"],
            ),
            (
                UpdateOperation::DraftArchive {
                    draft_id: "DRAFT-1".to_string(),
                },
                vec!["draft", "archive", "DRAFT-1"],
            ),
            (
                UpdateOperation::TaskDemote {
                    task_id: "TASK-1".to_string(),
                },
                vec!["task", "demote", "TASK-1"],
            ),
            (
                UpdateOperation::TaskArchive {
                    task_id: "TASK-1".to_string(),
                },
                vec!["task", "archive", "TASK-1"],
            ),
            (
                UpdateOperation::TaskComplete {
                    task_id: "TASK-1".to_string(),
                },
                vec!["task", "complete", "TASK-1"],
            ),
        ] {
            let cli = FakeCli::supported();
            run_one(op, &cli).unwrap();
            assert_eq!(cli.calls(), vec![expected]);
        }
    }

    #[test]
    fn doc_and_milestone_operations_map() {
        let cases: Vec<(UpdateOperation, Vec<&str>)> = vec![
            (
                UpdateOperation::DocCreate(DocCreate {
                    title: "Guide".to_string(),
                    doc_type: Some("guide".to_string()),
                    path: Some("sub".to_string()),
                }),
                vec!["doc", "create", "Guide", "--type", "guide", "--path", "sub"],
            ),
            (
                UpdateOperation::DocUpdate {
                    doc_id: "doc-4".to_string(),
                    update: DocUpdate {
                        content: Some("whole body".to_string()),
                        tags: Some(vec!["a".to_string(), "b".to_string()]),
                        ..Default::default()
                    },
                },
                vec![
                    "doc",
                    "update",
                    "doc-4",
                    "--content",
                    "whole body",
                    "--tags",
                    "a,b",
                ],
            ),
            (
                UpdateOperation::MilestoneAdd {
                    name: "Phase 2".to_string(),
                    description: Some("desc".to_string()),
                },
                vec!["milestone", "add", "Phase 2", "--description", "desc"],
            ),
            (
                UpdateOperation::MilestoneRename {
                    from: "m-1".to_string(),
                    to: "Phase 1".to_string(),
                    update_tasks: false,
                },
                vec!["milestone", "rename", "m-1", "Phase 1", "--no-update-tasks"],
            ),
            (
                UpdateOperation::MilestoneRemove {
                    name: "m-1".to_string(),
                    task_handling: MilestoneTaskHandling::Reassign {
                        to: "m-2".to_string(),
                    },
                },
                vec![
                    "milestone",
                    "remove",
                    "m-1",
                    "--task-handling",
                    "reassign",
                    "--reassign-to",
                    "m-2",
                ],
            ),
            (
                UpdateOperation::MilestoneArchive {
                    name: "m-1".to_string(),
                },
                vec!["milestone", "archive", "m-1"],
            ),
        ];
        for (op, expected) in cases {
            let cli = FakeCli::supported();
            run_one(op, &cli).unwrap();
            assert_eq!(cli.calls(), vec![expected]);
        }
    }

    #[test]
    fn empty_doc_tags_are_emitted_as_the_clear_request() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::DocUpdate {
                doc_id: "doc-4".to_string(),
                update: DocUpdate {
                    tags: Some(Vec::new()),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        // タグ全消し (doc-10 §5): `--tags ""` does clear them on v1.49.3, unlike the same-shaped
        // `--ref ""`/`--depends-on ""` above, which exit 0 having cleared nothing and are therefore
        // refused. An empty tag list is a request, so it is emitted — and it still counts as an
        // option, so this is not rejected as NothingToUpdate.
        assert_eq!(
            cli.calls(),
            vec![vec!["doc", "update", "doc-4", "--tags", ""]]
        );
    }

    #[test]
    fn milestone_rename_keeps_task_updates_by_default() {
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::MilestoneRename {
                from: "m-1".to_string(),
                to: "Phase 1".to_string(),
                update_tasks: true,
            },
            &cli,
        )
        .unwrap();
        // update_tasks true → no --no-update-tasks flag (the CLI default updates tasks).
        assert_eq!(
            cli.calls(),
            vec![vec!["milestone", "rename", "m-1", "Phase 1"]]
        );
    }

    // --- AC #5: operations outside v1.49.3's capability are refused before launch ---------------

    #[test]
    fn emptying_references_is_refused_without_launching() {
        let cli = FakeCli::supported();
        let err = run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    references: Some(Vec::new()),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap_err();
        assert_eq!(err, RejectReason::EmptyReferences);
        // Refusal is before launch: no process ran (doc-5 §5).
        assert!(cli.calls().is_empty());
    }

    #[test]
    fn clearing_dependencies_is_refused_without_launching() {
        // Regression (review [P1]): `--depends-on ""` exits 0 without clearing (measured), so an
        // empty set must be refused rather than launched and reported as a success.
        let cli = FakeCli::supported();
        let err = run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    dependencies: Some(Vec::new()),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap_err();
        assert_eq!(err, RejectReason::EmptyDependencies);
        assert!(cli.calls().is_empty());
    }

    #[test]
    fn task_edit_sets_the_whole_assignee_set_in_one_comma_separated_value() {
        // The GUI route for assignee is the edit side (TASK-57), where `-a` reads its value as a
        // comma-separated set and replaces the list with it (measured). Repeating the flag would
        // keep only the last value, so the set goes in one argument as `--depends-on` does.
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    assignee: Some(vec!["@takkyun".to_string(), "@someone".to_string()]),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec![
                "task",
                "edit",
                "TASK-1",
                "--assignee",
                "@takkyun,@someone"
            ]]
        );
    }

    #[test]
    fn an_empty_assignee_set_is_refused_rather_than_silently_ignored() {
        // `-a ""` exits 0 without clearing (measured), so issuing it would report an unassignment
        // that never happened. A set that is blank throughout is refused with it: `-a` drops blank
        // members when it splits, so `" , "` reaches the CLI as the value it exits 0 on.
        let cli = FakeCli::supported();
        for empty in [
            vec![],
            vec!["".to_string()],
            vec![" ".to_string(), "".to_string()],
        ] {
            let err = run_one(
                UpdateOperation::TaskEdit {
                    task_id: "TASK-1".to_string(),
                    edit: TaskEdit {
                        assignee: Some(empty),
                        ..Default::default()
                    },
                },
                &cli,
            )
            .unwrap_err();
            assert_eq!(err, RejectReason::EmptyAssignee);
        }
        assert!(cli.calls().is_empty());
    }

    #[test]
    fn an_empty_task_edit_is_refused() {
        let cli = FakeCli::supported();
        let err = run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit::default(),
            },
            &cli,
        )
        .unwrap_err();
        assert_eq!(err, RejectReason::NothingToEdit);
        assert!(cli.calls().is_empty());
    }

    #[test]
    fn an_empty_doc_update_is_refused() {
        let cli = FakeCli::supported();
        let err = run_one(
            UpdateOperation::DocUpdate {
                doc_id: "doc-1".to_string(),
                update: DocUpdate::default(),
            },
            &cli,
        )
        .unwrap_err();
        assert_eq!(err, RejectReason::NothingToUpdate);
    }

    #[test]
    fn an_unknown_option_is_refused_before_launch() {
        // Defense in depth for AC #5: a hand-built invocation carrying an option outside the
        // confirmed version's allowlist must be refused, proving the guard is not vacuous.
        let inv = Invocation::new(&["task", "edit"])
            .positional("TASK-1")
            .opt("--not-a-real-flag", "x");
        match validate_options(&inv) {
            Err(RejectReason::UnknownOption { command, option }) => {
                assert_eq!(command, "task edit");
                assert_eq!(option, "--not-a-real-flag");
            }
            other => panic!("expected UnknownOption, got {other:?}"),
        }
    }

    #[test]
    fn every_planned_operation_only_emits_allowlisted_options() {
        // The whole operation map must stay inside the confirmed capability (AC #5/#6): planning
        // any representable operation must never itself produce an UnknownOption.
        let ops = vec![
            UpdateOperation::TaskCreate(TaskCreate {
                title: "t".to_string(),
                description: Some("d".to_string()),
                status: Some("To Do".to_string()),
                labels: vec!["l".to_string()],
                priority: Some("high".to_string()),
                milestone: Some("m-1".to_string()),
                acceptance_criteria: vec!["a".to_string()],
            }),
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    title: Some("t".to_string()),
                    description: Some("d".to_string()),
                    status: Some("Done".to_string()),
                    priority: Some("low".to_string()),
                    milestone: Some("m-1".to_string()),
                    assignee: Some(vec!["@takkyun".to_string()]),
                    plan: Some("p".to_string()),
                    notes: NoteEdit::Set("n".to_string()),
                    add_labels: vec!["a".to_string()],
                    remove_labels: vec!["r".to_string()],
                    dependencies: Some(vec!["TASK-2".to_string()]),
                    references: Some(vec!["doc-4".to_string()]),
                    ac: AcEdit::Replace {
                        existing: 1,
                        items: vec![AcItem {
                            text: "x".to_string(),
                            checked: true,
                        }],
                    },
                },
            },
            UpdateOperation::DocUpdate {
                doc_id: "doc-1".to_string(),
                update: DocUpdate {
                    title: Some("t".to_string()),
                    content: Some("c".to_string()),
                    doc_type: Some("guide".to_string()),
                    path: Some("p".to_string()),
                    tags: Some(vec!["x".to_string()]),
                },
            },
        ];
        for op in ops {
            plan_operation(&op).expect("a representable operation must plan without rejection");
        }
    }

    // --- AC #3: CLI failure keeps the model unchanged and retains stderr -----------------------

    #[test]
    fn a_non_zero_exit_is_reported_with_stderr() {
        // task complete on a non-Done task fails with "is not Done" (doc-5 §5) — the adapter does
        // not pre-judge; it reports the CLI's failure verbatim.
        let cli = FakeCli::supported();
        cli.push_failure(1, "Task TASK-1 is not Done");
        let outcome = run_one(
            UpdateOperation::TaskComplete {
                task_id: "TASK-1".to_string(),
            },
            &cli,
        )
        .unwrap();
        match outcome {
            UpdateOutcome::Failed(f) => {
                assert_eq!(f.command, "task complete");
                assert_eq!(f.kind, FailureKind::NonZero { code: Some(1) });
                assert!(f.stderr.contains("is not Done"));
                assert_eq!(f.completed_before, 0);
                assert!(!f.reload_required);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn a_spawn_failure_is_reported_as_such() {
        let mut cli = FakeCli::supported();
        cli.spawn_error = true;
        // Capability comes from a separate healthy probe; the failure is at the update call.
        let outcome = run(
            &root(),
            &[UpdateOperation::TaskArchive {
                task_id: "TASK-1".to_string(),
            }],
            &capability(),
            &cli,
            &FakeWriter::default(),
        )
        .unwrap();
        assert!(matches!(
            outcome,
            UpdateOutcome::Failed(UpdateFailure {
                kind: FailureKind::Spawn,
                ..
            })
        ));
    }

    // --- AC #4: a multi-invocation action aborts on the first failure --------------------------

    #[test]
    fn a_sequence_aborts_on_first_failure_and_reports_partial() {
        // A screen action of two operations: the first succeeds, the second fails. The action as a
        // whole failed, but the first already changed on-disk state, so `partial` is set and
        // `completed_before` names how much ran (AC #4, doc-5 §6).
        let cli = FakeCli::supported();
        cli.results.borrow_mut().push_back(CliRun {
            success: true,
            code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        });
        cli.push_failure(1, "second failed");
        let outcome = run(
            &root(),
            &[
                UpdateOperation::TaskEdit {
                    task_id: "TASK-1".to_string(),
                    edit: TaskEdit {
                        status: Some("Done".to_string()),
                        ..Default::default()
                    },
                },
                UpdateOperation::TaskComplete {
                    task_id: "TASK-1".to_string(),
                },
            ],
            &capability(),
            &cli,
            &FakeWriter::default(),
        )
        .unwrap();
        match outcome {
            UpdateOutcome::Failed(f) => {
                assert_eq!(f.command, "task complete");
                assert_eq!(f.completed_before, 1);
                assert!(f.reload_required);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
        // Both were attempted in order; nothing after the failure would run (only two here).
        assert_eq!(cli.calls().len(), 2);
    }

    // --- 直接書き込み操作 (doc-5 §1/§3, decision-21) ------------------------------------------

    /// The shape v1.49.3's `milestone add -d` writes (measured 2026-08-12), with a section after
    /// the description so the replacement has something on both sides of it.
    const MILESTONE: &str =
        "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\nold\n\n## Notes\n\nkept\n";

    #[test]
    fn the_description_update_maps_to_a_write_and_not_a_sub_command() {
        // doc-5 §3's table: this is the one row whose 写像先 is not a sub-command.
        let plan = plan_operation(&UpdateOperation::MilestoneDescribe {
            name: "m-1".to_string(),
            description: "new".to_string(),
        })
        .expect("the 直接書き込み操作 plans without rejection");
        assert_eq!(
            plan,
            vec![Mapped::WriteMilestoneDescription {
                name: "m-1".to_string(),
                description: "new".to_string(),
            }]
        );
    }

    #[test]
    fn the_description_update_reaches_the_writer_and_launches_nothing() {
        let cli = FakeCli::supported();
        let writer = FakeWriter::default();
        let outcome = run(
            &root(),
            &[UpdateOperation::MilestoneDescribe {
                name: "m-1".to_string(),
                description: "new".to_string(),
            }],
            &capability(),
            &cli,
            &writer,
        )
        .unwrap();
        assert_eq!(outcome, UpdateOutcome::Succeeded);
        assert_eq!(writer.wrote(), vec![("m-1".to_string(), "new".to_string())]);
        assert!(cli.calls().is_empty(), "no process runs for a write");
    }

    #[test]
    fn a_cli_only_action_writes_nothing() {
        // The writer records rather than doing nothing, so an operation that quietly grew a write
        // side would show up here instead of passing.
        let cli = FakeCli::supported();
        let writer = FakeWriter::default();
        run(
            &root(),
            &[UpdateOperation::MilestoneArchive {
                name: "m-1".to_string(),
            }],
            &capability(),
            &cli,
            &writer,
        )
        .unwrap();
        assert!(writer.wrote().is_empty());
    }

    #[test]
    fn a_refused_write_is_reported_like_a_cli_failure() {
        let cli = FakeCli::supported();
        let writer = FakeWriter::refusing("no `## Description` section");
        let outcome = run(
            &root(),
            &[UpdateOperation::MilestoneDescribe {
                name: "m-1".to_string(),
                description: "new".to_string(),
            }],
            &capability(),
            &cli,
            &writer,
        )
        .unwrap();
        match outcome {
            UpdateOutcome::Failed(failure) => {
                assert_eq!(failure.command, MILESTONE_DESCRIBE);
                assert_eq!(failure.kind, FailureKind::Write);
                assert!(failure.stderr.contains("Description"));
                // 一時ファイル置換 leaves the old file whole, so a first-step write failure is not
                // 要再読込 — unlike a 期限到達, which is (doc-5 §5).
                assert!(!failure.reload_required);
                assert_eq!(failure.completed_before, 0);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn a_write_after_an_invocation_is_reload_required_when_it_fails() {
        // The rule is the plan's, not the write's: an earlier invocation already wrote, so the root
        // has to be re-read whatever stopped the step after it (doc-5 §5 要再読込).
        // FakeCli succeeds unless a failure is queued, so the first invocation lands.
        let cli = FakeCli::supported();
        let writer = FakeWriter::refusing("disk full");
        let outcome = run(
            &root(),
            &[
                UpdateOperation::MilestoneArchive {
                    name: "m-0".to_string(),
                },
                UpdateOperation::MilestoneDescribe {
                    name: "m-1".to_string(),
                    description: "new".to_string(),
                },
            ],
            &capability(),
            &cli,
            &writer,
        )
        .unwrap();
        match outcome {
            UpdateOutcome::Failed(failure) => {
                assert!(failure.reload_required);
                assert_eq!(failure.completed_before, 1);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn a_failed_write_stops_the_rest_of_the_plan() {
        let cli = FakeCli::supported();
        let writer = FakeWriter::refusing("disk full");
        run(
            &root(),
            &[
                UpdateOperation::MilestoneDescribe {
                    name: "m-1".to_string(),
                    description: "new".to_string(),
                },
                UpdateOperation::MilestoneArchive {
                    name: "m-1".to_string(),
                },
            ],
            &capability(),
            &cli,
            &writer,
        )
        .unwrap();
        assert!(
            cli.calls().is_empty(),
            "部分適用の回避 applies to a write as much as to an invocation"
        );
    }

    #[test]
    fn the_replacement_keeps_every_byte_outside_the_description() {
        let out = milestone_text_with_description(MILESTONE, "new").unwrap();
        assert_eq!(
            out,
            "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\nnew\n\n## Notes\n\nkept\n"
        );
    }

    #[test]
    fn the_replacement_keeps_the_next_heading_on_its_own_line() {
        // The range starts after the heading line, so writing the description alone into it would
        // put `## Notes` on the same line as the last word — and a `##` that no longer starts a
        // line no longer closes the range, so the next read would take the rest of the file.
        let out = milestone_text_with_description(MILESTONE, "new").unwrap();
        assert!(out.contains("\n## Notes\n"));
        assert_eq!(
            crate::read::parse::description_span(out.split_once("---\n\n").unwrap().1).map(
                |found| out.split_once("---\n\n").unwrap().1[found.range]
                    .trim()
                    .to_string()
            ),
            Some("new".to_string()),
            "the description reads back as what was written"
        );
    }

    #[test]
    fn an_empty_description_leaves_the_heading_and_the_rest() {
        assert_eq!(
            milestone_text_with_description(MILESTONE, "").unwrap(),
            "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\n## Notes\n\nkept\n"
        );
        // …and an emptied description can be filled again, from the shape emptying left behind.
        // The blank line that used to separate the description from `## Notes` does not come back:
        // it was inside the range and emptying took it with the text. An ATX heading needs no blank
        // line before it, so what is written still reads back as one description and one section —
        // which is what the assertion below is really about.
        let emptied = milestone_text_with_description(MILESTONE, "").unwrap();
        assert_eq!(
            milestone_text_with_description(&emptied, "back").unwrap(),
            "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\nback\n## Notes\n\nkept\n"
        );
    }

    #[test]
    fn a_description_at_the_end_of_the_file_keeps_its_final_newline() {
        let at_end = "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\nold\n";
        assert_eq!(
            milestone_text_with_description(at_end, "new").unwrap(),
            "---\nid: m-1\ntitle: \"P\"\n---\n\n## Description\n\nnew\n"
        );
    }

    #[test]
    fn a_file_without_a_description_section_is_refused() {
        let loose = "---\nid: m-1\ntitle: \"P\"\n---\n\nloose prose\n";
        let error = milestone_text_with_description(loose, "new").unwrap_err();
        assert!(error.detail.contains("Description"));
        let headless = "no frontmatter here\n";
        assert!(milestone_text_with_description(headless, "new").is_err());
    }

    #[test]
    fn a_section_pair_description_is_read_but_not_written() {
        // The read accepts a milestone hand-edited into a task file's shape (the span is there), but
        // `milestone add` never writes that shape, so writing into it would be Atlas deciding what a
        // milestone file looks like — decision-21's first condition in reverse. The read staying
        // wider than the write is deliberate: the description is still shown, and saving says why it
        // cannot be.
        let sectioned = "---\nid: m-1\ntitle: \"P\"\n---\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nold\n<!-- SECTION:DESCRIPTION:END -->\n";
        let body = sectioned.split_once("---\n\n").unwrap().1;
        assert!(
            crate::read::parse::description_span(body).is_some(),
            "the reader still finds it"
        );
        let error = milestone_text_with_description(sectioned, "new").unwrap_err();
        assert!(error.detail.contains("SECTION"), "{}", error.detail);
        assert!(error.detail.contains("## Description"), "{}", error.detail);
    }

    #[test]
    fn a_later_operation_does_not_run_after_an_earlier_failure() {
        let cli = FakeCli::supported();
        cli.push_failure(1, "first failed");
        run(
            &root(),
            &[
                UpdateOperation::TaskDemote {
                    task_id: "TASK-1".to_string(),
                },
                UpdateOperation::TaskArchive {
                    task_id: "TASK-2".to_string(),
                },
            ],
            &capability(),
            &cli,
            &FakeWriter::default(),
        )
        .unwrap();
        // Only the first invocation ran; the second was not launched (doc-5 §5 部分適用の回避).
        assert_eq!(cli.calls(), vec![vec!["task", "demote", "TASK-1"]]);
    }

    #[test]
    fn one_rejected_operation_refuses_the_whole_action_before_launch() {
        // Planning is for the whole action: a later out-of-capability operation must stop the
        // earlier, valid one from launching too (AC #5) — no partial application from a refusal.
        let cli = FakeCli::supported();
        let err = run(
            &root(),
            &[
                UpdateOperation::TaskArchive {
                    task_id: "TASK-1".to_string(),
                },
                UpdateOperation::TaskEdit {
                    task_id: "TASK-2".to_string(),
                    edit: TaskEdit {
                        references: Some(Vec::new()),
                        ..Default::default()
                    },
                },
            ],
            &capability(),
            &cli,
            &FakeWriter::default(),
        )
        .unwrap_err();
        assert_eq!(err, RejectReason::EmptyReferences);
        assert!(cli.calls().is_empty());
    }

    // --- wire shape (doc-4 §3.1 camelCase contract) --------------------------------------------

    #[test]
    fn outcome_serializes_in_camelcase_tagged_shape() {
        let ok = serde_json::to_value(UpdateOutcome::Succeeded).unwrap();
        assert_eq!(ok["state"], "succeeded");

        let failed = serde_json::to_value(UpdateOutcome::Failed(UpdateFailure {
            command: "task edit".to_string(),
            kind: FailureKind::NonZero { code: Some(1) },
            stderr: "boom".to_string(),
            completed_before: 1,
            reload_required: true,
        }))
        .unwrap();
        assert_eq!(failed["state"], "failed");
        assert_eq!(failed["command"], "task edit");
        assert_eq!(failed["completedBefore"], 1);
        assert_eq!(failed["reloadRequired"], true);
        assert_eq!(failed["kind"]["kind"], "nonZero");
        assert_eq!(failed["kind"]["code"], 1);
        // snake_case field names must not leak to the wire.
        assert!(failed.get("completed_before").is_none());
        assert!(failed.get("reload_required").is_none());

        let timed_out = serde_json::to_value(UpdateOutcome::Failed(UpdateFailure {
            command: "task edit".to_string(),
            kind: FailureKind::TimedOut { after_ms: 30_000 },
            stderr: "terminated".to_string(),
            completed_before: 0,
            reload_required: true,
        }))
        .unwrap();
        assert_eq!(timed_out["kind"]["kind"], "timedOut");
        assert_eq!(timed_out["kind"]["afterMs"], 30_000);
    }
}
