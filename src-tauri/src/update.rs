//! Backlog 更新アダプター — turns an Atlas 更新操作 into a Backlog CLI invocation run with the
//! target project as its working directory (doc-5). Implements doc-5 "Backlog 更新アダプター 設計".
//!
//! The adapter never rewrites managed Markdown; the Backlog CLI does (decision-2, doc-5 §2, AGENTS).
//! This module only maps operations to sub-commands, launches them, and reports success or failure
//! by exit code. The four seams doc-5 fixes map to the four public pieces here:
//!
//! - **操作写像** (doc-5 §3, AC #1): [`UpdateOperation`] → a plan of [`Invocation`]s, built by
//!   [`plan_operation`]. One operation is one sub-command call; `task edit`/`doc update` combine
//!   their fields into a single call rather than one call per field (doc-5 §3 bullet).
//! - **作業ディレクトリ + 引数配列渡し** (doc-5 §4, AC #2): [`run`] runs each invocation with
//!   `project_root` as `current_dir`, passing every argument as its own array element — never a
//!   shell string, so a value with spaces/newlines/metacharacters cannot word-split or inject.
//! - **CLI 失敗時の扱い** (doc-5 §5, AC #3/#4): the exit code decides success; a non-zero exit or a
//!   spawn failure yields [`UpdateOutcome::Failed`] carrying stderr as the failure reason, with the
//!   domain model left untouched. A plan of several invocations aborts on the first failure and
//!   reports how many already ran, so a partial application is observable by reload (doc-5 §6).
//! - **縮退** (doc-5 §3.1/§5, decision-7, AC #5/#6): [`probe`] reads `backlog --version` and only a
//!   version at or above the confirmed [`MIN_VERSION`] yields a [`CliCapability`]. [`run`] takes that
//!   capability by reference, so an update is unreachable without a supported CLI — a missing or
//!   too-old CLI degrades Atlas to read-only by construction, not by a flag a caller might forget.
//!   Operations v1.48.0 cannot perform (milestone description update, emptying references) are
//!   unrepresentable or refused *before* any process starts.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

// --- version probe / capability (doc-5 §3.2, decision-7, AC #6) ---------------------------------

/// The Backlog CLI version the operation map and its option allowlist were fixed against
/// (decision-7 最低バージョン要件, doc-5 §3). This is the *minimum*; decision-7 fixes no upper
/// bound, so any version at or above it is supported and unknown higher versions degrade only when
/// the CLI itself rejects an option (surfaced here as an ordinary CLI failure, doc-5 §5).
pub const MIN_VERSION: Version = Version {
    major: 1,
    minor: 48,
    patch: 0,
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

/// One Atlas 更新操作 (doc-5 §1). Each variant maps to exactly one Backlog CLI sub-command; the
/// mapping is [`plan_operation`]. Operations v1.48.0 cannot perform are absent by construction:
/// there is no milestone-description edit (only [`UpdateOperation::MilestoneAdd`] sets a
/// description, at creation), no single-option AC replace (only the composite [`AcEdit::Replace`]),
/// and references cannot be emptied ([`TaskEdit::references`] is refused when empty) — doc-5 §3.1.
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
    /// `milestone add` (doc-5 §3). Description is set only here — v1.48.0 has no update path (§3.1).
    #[serde(rename_all = "camelCase")]
    MilestoneAdd {
        name: String,
        #[serde(default)]
        description: Option<String>,
    },
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
/// Narrower than what the CLI accepts, by product judgment rather than by capability: v1.48.0's
/// `task create` also takes `-a`/`--plan`/`--notes`/`--ref`/`--depends-on` and stores every one of
/// them in the created file (measured 2026-07-29, doc-5 §3). What Atlas passes here is what
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
    /// `--assignee` (doc-5 §3). One value rather than a set, and the whole GUI route for assignee
    /// (TASK-57): v1.48.0 takes a single assignee — a repeated `-a` keeps only the last, a
    /// comma-separated value lands as one literal entry, and the write replaces the whole
    /// frontmatter list however many entries it had (measured 2026-07-29). `Some(blank)` is refused
    /// — `-a ""` exits 0 without clearing (measured), the same silent-no-op as `--ref ""`, so
    /// unassigning is not a capability the CLI offers ([`RejectReason::EmptyAssignee`]).
    pub assignee: Option<String>,
    pub plan: Option<String>,
    pub notes: NoteEdit,
    pub add_labels: Vec<String>,
    pub remove_labels: Vec<String>,
    /// `--depends-on` sets the whole dependency set (doc-5 §3). `None` leaves it untouched;
    /// `Some(empty)` is refused — `--depends-on ""` exits 0 without clearing anything in v1.48.0
    /// (measured), the same silent-no-op trap as `--ref ""`, so clearing all dependencies is not a
    /// capability the CLI offers and must not be reported as a success ([`RejectReason::EmptyDependencies`]).
    pub dependencies: Option<Vec<String>>,
    /// `--ref` full-replaces with a *non-empty* set (doc-5 §3, §3.1). `Some(empty)` is refused —
    /// v1.48.0 cannot empty references (doc-5 §3.1). `None` leaves references untouched.
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
/// ones by their new index — all in one `task edit` call. v1.48.0's single-option
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

/// The option flags each sub-command accepts in the confirmed version (v1.48.0 `--help`, doc-5 §3).
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
    /// `references` was `Some(empty)`. v1.48.0 cannot empty references (doc-5 §3.1); the last one
    /// must be removed through the external-editor path (doc-8), not here.
    EmptyReferences,
    /// `dependencies` was `Some(empty)`. `--depends-on ""` exits 0 without clearing (measured), the
    /// same silent-no-op as `--ref ""`, so clearing all dependencies is not offered — refused rather
    /// than reported as a success (doc-5 §5 縮退).
    EmptyDependencies,
    /// `assignee` was `Some(blank)`. `-a ""` exits 0 without clearing (measured), the same
    /// silent-no-op as `--ref ""`, so unassigning is not offered — refused rather than reported as
    /// a success (doc-5 §5 縮退).
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
                "references cannot be emptied through the CLI (v1.48.0); keep at least one reference"
            ),
            RejectReason::EmptyDependencies => write!(
                f,
                "dependencies cannot be cleared through the CLI (v1.48.0); keep at least one dependency"
            ),
            RejectReason::EmptyAssignee => write!(
                f,
                "assignee cannot be cleared through the CLI (v1.48.0); pass a non-blank assignee"
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

/// Map one operation to its plan of invocations (doc-5 §3, AC #1). Most operations are a single
/// invocation; the plan is a `Vec` so a future screen action that must split across sub-commands
/// gets the abort-on-failure execution (AC #4) without a special case. Every emitted option is
/// validated against the confirmed version's allowlist here, so an out-of-capability operation is
/// refused before launch (AC #5).
pub fn plan_operation(op: &UpdateOperation) -> Result<Vec<Invocation>, RejectReason> {
    let invocations = match op {
        UpdateOperation::TaskCreate(c) => vec![plan_task_create(c)],
        UpdateOperation::TaskEdit { task_id, edit } => vec![plan_task_edit(task_id, edit)?],
        UpdateOperation::DraftPromote { draft_id } => {
            vec![Invocation::new(&["draft", "promote"]).positional(draft_id)]
        }
        UpdateOperation::DraftArchive { draft_id } => {
            vec![Invocation::new(&["draft", "archive"]).positional(draft_id)]
        }
        UpdateOperation::TaskDemote { task_id } => {
            vec![Invocation::new(&["task", "demote"]).positional(task_id)]
        }
        UpdateOperation::TaskArchive { task_id } => {
            vec![Invocation::new(&["task", "archive"]).positional(task_id)]
        }
        UpdateOperation::TaskComplete { task_id } => {
            vec![Invocation::new(&["task", "complete"]).positional(task_id)]
        }
        UpdateOperation::DocCreate(c) => vec![plan_doc_create(c)],
        UpdateOperation::DocUpdate { doc_id, update } => vec![plan_doc_update(doc_id, update)?],
        UpdateOperation::MilestoneAdd { name, description } => {
            vec![Invocation::new(&["milestone", "add"])
                .positional(name)
                .opt_if("--description", description)]
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
            vec![inv]
        }
        UpdateOperation::MilestoneRemove {
            name,
            task_handling,
        } => vec![plan_milestone_remove(name, task_handling)],
        UpdateOperation::MilestoneArchive { name } => {
            vec![Invocation::new(&["milestone", "archive"]).positional(name)]
        }
    };
    for inv in &invocations {
        validate_options(inv)?;
    }
    Ok(invocations)
}

fn plan_task_create(c: &TaskCreate) -> Invocation {
    let mut inv = Invocation::new(&["task", "create"])
        .positional(&c.title)
        .opt_if("--description", &c.description)
        .opt_if("--status", &c.status)
        .opt_if("--priority", &c.priority)
        .opt_if("--milestone", &c.milestone);
    if !c.labels.is_empty() {
        // v1.48.0 `task create --labels` takes one comma-separated value (doc-5 §3 create row).
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
        // 解除は不可 (measured): `-a ""` exits 0 without clearing, so a blank value is refused
        // rather than reported as a success (doc-5 §5 縮退, same trap as `--ref ""`). Whitespace is
        // refused with it — the CLI would write it as the assignee, and could not then clear it.
        if assignee.trim().is_empty() {
            return Err(RejectReason::EmptyAssignee);
        }
        inv = inv.opt("--assignee", assignee.clone());
    }

    inv = match &edit.notes {
        NoteEdit::Keep => inv,
        NoteEdit::Set(text) => inv.opt("--notes", text.clone()),
        NoteEdit::Append(text) => inv.opt("--append-notes", text.clone()),
    };

    // Labels are comma-joined into a single `--add-label`/`--remove-label`, not repeated per label:
    // a comma-separated value applies to every label in both v1.48.0 and v1.48.0, whereas repeating
    // the flag does not — v1.48.0 keeps only the last value and v1.48.0 accumulates (both measured).
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
        // 参照の全置換は非空集合のみ (doc-5 §3.1): emptying is impossible in v1.48.0.
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
/// §4, decision-7): [`SystemBacklog`] resolves `backlog` on PATH now, and a sidecar implementation
/// would swap only this trait's impl, leaving the operation map, working directory, and argument
/// arrays unchanged (TASK-15).
pub trait BacklogCli {
    /// Run `backlog <args>` with `current_dir` as the working directory (doc-5 §4). `None` runs in
    /// the inherited directory — used only by the version probe, which is project-independent. An
    /// `Err` is a spawn failure (起動失敗, doc-5 §5); a process that ran, at any exit code, is
    /// `Ok(CliRun)` for the executor to judge.
    fn run(&self, current_dir: Option<&Path>, args: &[String]) -> std::io::Result<CliRun>;
}

/// The PATH-resolved `backlog` (doc-5 §4). Passes each argument as its own array element and never
/// through a shell (AC #2), so a value with whitespace or shell metacharacters cannot word-split,
/// expand, or inject.
pub struct SystemBacklog;

impl BacklogCli for SystemBacklog {
    fn run(&self, current_dir: Option<&Path>, args: &[String]) -> std::io::Result<CliRun> {
        let mut cmd = Command::new("backlog");
        if let Some(dir) = current_dir {
            cmd.current_dir(dir);
        }
        let out = cmd.args(args).output()?;
        Ok(CliRun {
            success: out.status.success(),
            code: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }
}

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
/// reconcile (doc-5 §6). `completed_before` and `partial` exist for the multi-invocation case
/// (AC #4): when an earlier invocation of the same action already ran, the reload is mandatory
/// because on-disk state moved even though the action as a whole failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFailure {
    /// The sub-command that failed, e.g. `"task edit"`.
    pub command: String,
    /// Why it failed, and its stderr as the failure reason shown to the user (doc-5 §5).
    pub kind: FailureKind,
    pub stderr: String,
    /// How many invocations in the plan succeeded before this one failed.
    pub completed_before: usize,
    /// `completed_before > 0`: earlier invocations already changed on-disk state, so a reload is
    /// required to observe the partial application (AC #4, doc-5 §6).
    pub partial: bool,
}

/// How a CLI invocation failed (doc-5 §5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FailureKind {
    /// The process could not be started (起動失敗): binary missing or not executable.
    Spawn,
    /// The process ran and exited non-zero; `code` is its exit code when known.
    NonZero { code: Option<i32> },
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
) -> Result<UpdateOutcome, RejectReason> {
    // Plan every operation before launching any, so an out-of-capability operation refuses the
    // whole action before a single process starts (AC #5, doc-5 §5).
    let mut plan: Vec<Invocation> = Vec::new();
    for op in action {
        plan.extend(plan_operation(op)?);
    }
    Ok(execute(project_root, &plan, cli))
}

/// Run a planned sequence, aborting on the first failure (doc-5 §5, AC #4). Split from [`run`] so
/// execution is testable with a hand-built plan and so the abort-on-failure contract is in one place.
fn execute(project_root: &Path, plan: &[Invocation], cli: &dyn BacklogCli) -> UpdateOutcome {
    for (i, inv) in plan.iter().enumerate() {
        let argv = inv.to_argv();
        match cli.run(Some(project_root), &argv) {
            // 起動失敗 (doc-5 §5): the binary could not start. Abort with what ran so far.
            Err(e) => {
                return UpdateOutcome::Failed(UpdateFailure {
                    command: inv.command_name(),
                    kind: FailureKind::Spawn,
                    stderr: e.to_string(),
                    completed_before: i,
                    partial: i > 0,
                })
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
                    partial: i > 0,
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
                version: "1.48.0".to_string(),
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
        fn run(&self, current_dir: Option<&Path>, args: &[String]) -> std::io::Result<CliRun> {
            self.calls
                .borrow_mut()
                .push((current_dir.map(Path::to_path_buf), args.to_vec()));
            if args == ["--version"] {
                if self.spawn_error {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "backlog not found",
                    ));
                }
                return Ok(CliRun {
                    success: self.version_ok,
                    code: Some(if self.version_ok { 0 } else { 1 }),
                    stdout: self.version.clone(),
                    stderr: String::new(),
                });
            }
            if self.spawn_error {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "backlog not found",
                ));
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
        run(&root(), std::slice::from_ref(&op), &capability(), cli)
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
        assert_eq!(Version::parse("1.48.0").unwrap(), MIN_VERSION);
        assert_eq!(Version::parse("v1.48.0\n").unwrap(), MIN_VERSION);
        assert_eq!(
            Version::parse("1.48").unwrap(),
            Version {
                major: 1,
                minor: 48,
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
        // The range is Atlas's, not the CLI's: v1.48.0 `task create` also accepts `-a`/`--plan`/
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
        // per version — v1.48.0 keeps only the last value, v1.48.0 accumulates (both measured) — so
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

    // --- AC #5: operations outside v1.48.0's capability are refused before launch ---------------

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
    fn task_edit_sets_the_assignee_as_one_value() {
        // The GUI route for assignee is the edit side (TASK-57): one value, since a repeated `-a`
        // keeps only the last and a comma-separated value becomes one literal entry (measured).
        let cli = FakeCli::supported();
        run_one(
            UpdateOperation::TaskEdit {
                task_id: "TASK-1".to_string(),
                edit: TaskEdit {
                    assignee: Some("@takkyun".to_string()),
                    ..Default::default()
                },
            },
            &cli,
        )
        .unwrap();
        assert_eq!(
            cli.calls(),
            vec![vec!["task", "edit", "TASK-1", "--assignee", "@takkyun"]]
        );
    }

    #[test]
    fn a_blank_assignee_is_refused_rather_than_silently_ignored() {
        // `-a ""` exits 0 without clearing (measured), so issuing it would report an unassignment
        // that never happened. Whitespace is refused with it — the CLI would write it verbatim.
        let cli = FakeCli::supported();
        for blank in ["", "   "] {
            let err = run_one(
                UpdateOperation::TaskEdit {
                    task_id: "TASK-1".to_string(),
                    edit: TaskEdit {
                        assignee: Some(blank.to_string()),
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
                    assignee: Some("@takkyun".to_string()),
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
                assert!(!f.partial);
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
        )
        .unwrap();
        match outcome {
            UpdateOutcome::Failed(f) => {
                assert_eq!(f.command, "task complete");
                assert_eq!(f.completed_before, 1);
                assert!(f.partial);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
        // Both were attempted in order; nothing after the failure would run (only two here).
        assert_eq!(cli.calls().len(), 2);
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
            partial: true,
        }))
        .unwrap();
        assert_eq!(failed["state"], "failed");
        assert_eq!(failed["command"], "task edit");
        assert_eq!(failed["completedBefore"], 1);
        assert_eq!(failed["partial"], true);
        assert_eq!(failed["kind"]["kind"], "nonZero");
        assert_eq!(failed["kind"]["code"], 1);
        // snake_case field names must not leak to the wire.
        assert!(failed.get("completed_before").is_none());
    }
}
