//! Domain model — the in-memory types that mirror one Backlog root's management files
//! (doc-4 §3). Tasks, config, milestones and documents.
//!
//! This module is *types only* (TASK-27). It defines the shape the read layer (TASK-28)
//! fills in and never parses files itself. Two design rules from doc-4 §3 drive the shapes
//! here:
//!
//! 1. "判別できた事実" and "未確定・不足の明示" live side by side, so nothing is dropped and
//!    a task can always be pushed to 縮退表示 (§5). That is why a [`Task`]'s required
//!    identity fields are optional and every task carries [`FileHealth`]: a file that failed
//!    required-field parsing is still represented, with the gap named explicitly rather than
//!    discarded.
//! 2. Facets Backlog stores mixed together are split at the type level so the UI can never
//!    reassemble them wrongly: `kind:` labels vs. normal labels (§3.3), and storage state
//!    (where the file sits) vs. status (frontmatter work state) (§3.4).
//!
//! Types are Tauri-independent and `Serialize` so the command layer can hand a whole
//! [`ProjectModel`] to the frontend. Field names serialize as the camelCase used in doc-4
//! §3.1 (`storageState`, `acceptanceCriteria`, …) — the doc's referent table is the wire
//! contract, so the names match it rather than Rust's snake_case.

use serde::Serialize;
use std::path::PathBuf;

/// Where a task file physically sits, which fixes its storage state independently of the
/// frontmatter `status` (doc-4 §3.4). A `Done` task in `tasks/` is still `Active`; a `To Do`
/// task in `completed/` is `Completed`. Keeping the two axes apart is the whole point — mixing
/// them leaks completed/archived/draft tasks into the normal progress view (doc-7).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageState {
    /// `tasks/` — the day-to-day progress set.
    Active,
    /// `drafts/` — a draft; its id is `DRAFT-N` (§3.4).
    Draft,
    /// `completed/` — filed as finished.
    Completed,
    /// `archive/tasks/` or `archive/drafts/` — archived task or draft (§3.4).
    Archive,
}

/// Resolved `config.yml` (doc-4 §3.2). Built before any task is parsed because it is the
/// resolution basepoint (status set, task prefix). `config.yml` carries no Backlog version
/// field (measured on v1.48.0), so nothing here records a generator version — reads are
/// version-independent by schema-capability probing, not version branching (doc-4 §4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub project_name: Option<String>,
    /// Task id prefix, e.g. `TASK`. The normal (non-draft) counterpart of `DRAFT-N` (§3.4).
    pub task_prefix: String,
    /// Canonical status set declared in `config.yml`. Note `Draft` may be absent here yet is
    /// a known status for drafts (§3.4); status normalization is TASK-29, not this layer.
    pub statuses: Vec<String>,
    pub default_status: Option<String>,
    pub date_format: Option<String>,
}

/// A milestone (`milestones/m-N`) — the resolution target of a task's `milestone` reference
/// (doc-4 §3.2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    /// Source file path, the same facet [`Task::source_path`] and [`Document::source_path`] carry.
    /// Present because doc-9 §4.2.2 puts this file in the 書き換え対象集合 of all six milestone
    /// operations, and three of them (`rename --no-update-tasks`, `remove --task-handling keep`,
    /// `archive`) rewrite nothing else — without the path they could only run *unchecked*. Not a
    /// frontmatter field.
    pub source_path: PathBuf,
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    /// 想定外スキーマ found while mapping this milestone's optional fields (doc-4 §5,
    /// decision-24). A milestone whose required fields failed is not here at all — it is an
    /// [`UnmappedFile`].
    pub health: FileHealth,
}

/// A document (`docs/doc-N`) — the resolution target of a task's documentation reference
/// (doc-4 §3.2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    /// Source file path, the same facet [`Task::source_path`] carries. Present because doc-9 §4's
    /// pre-update conflict check needs the file a `doc update` will rewrite: without it a document
    /// could only be updated *unchecked*, and `doc update --content` full-replaces the body (doc-5
    /// §3.1), so an externally edited document would be silently overwritten. Not a frontmatter field.
    pub source_path: PathBuf,
    pub id: String,
    pub title: String,
    /// frontmatter `type`, e.g. `specification`.
    #[serde(rename = "type")]
    pub doc_type: Option<String>,
    pub tags: Vec<String>,
    pub created_date: Option<String>,
    pub updated_date: Option<String>,
    pub body: Option<String>,
    /// 想定外スキーマ found while mapping this document's optional fields (doc-4 §5,
    /// decision-24) — a `type` written as a list, say. `id`, `title` and `body` are kept as
    /// read; only the out-of-range field is left unset (AC #3).
    pub health: FileHealth,
}

/// An architecture decision record (`decisions/decision-N`). doc-4 §2 has the read layer scan
/// `decisions/`, but §3.2 defines 文書 as `docs/doc-N` only — the resolution target of a task's
/// documentation reference. Decisions are therefore kept in their own collection rather than
/// folded into [`Document`]: they carry `status`/`date` instead of `type`/`tags`, and mixing
/// them would let `decision-N` answer a documentation lookup that can only mean `doc-N`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    /// Source file path, the same facet the other three kinds carry. Added by TASK-88: naming
    /// which file is 不整合 needs it, and the read layer has no other handle on a decision file
    /// (there is no `decision update` to give it a second use — v1.48.0 has `create` only).
    pub source_path: PathBuf,
    pub id: String,
    pub title: String,
    /// frontmatter `status`, e.g. `accepted` / `proposed`. Unrelated to a task's status.
    pub status: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
    /// 想定外スキーマ found while mapping this decision's optional fields (doc-4 §5,
    /// decision-24). No screen reads it yet — プロジェクト詳細 has no decisions 区画 until
    /// TASK-118 — but the read layer records all three kinds alike (doc-10 §9).
    pub health: FileHealth,
}

/// A body fragment under a `SECTION:NAME` this layer does not know. doc-4 §4 requires such a
/// fragment be *kept* (not dropped) while also being a degradation trigger, so the text lands
/// here and the matching [`DegradeEvent::UnexpectedSchema`] lands in [`Task::health`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnknownSection {
    /// The `NAME` in `<!-- SECTION:NAME:BEGIN -->`.
    pub name: String,
    pub body: String,
}

/// One acceptance-criterion item parsed from the `AC:BEGIN`…`AC:END` block, kept as the
/// `#N` number, its body text, and its checked state — the triple required by AC #4 and
/// doc-4 §4 "番号・本文・checked 状態の並び".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AcceptanceCriterion {
    /// The `N` in `#N`.
    pub number: u32,
    pub text: String,
    /// `[x]` → true, `[ ]` → false.
    pub checked: bool,
}

/// A required identity field (doc-4 §4). Its absence makes a task 解析不能 (§5), which is why
/// the corresponding [`Task`] field is optional and the gap is named here rather than guessed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RequiredField {
    Id,
    Title,
    Status,
}

/// Which kind of reference failed to resolve within the root, for a 参照欠損 event (doc-4 §5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReferenceKind {
    Milestone,
    Documentation,
    Reference,
}

/// A single degradation event on a task (doc-4 §5). A degraded task is kept, not dropped, so
/// each event carries enough to explain the gap in 縮退表示. `ルート読取不能` is *not* here: it
/// is a root-level failure (whole Backlog root), reported per ledger entry, not per task (§5).
// Tagged as "event" rather than "kind": DanglingReference already has a `kind` field
// (the reference kind), and an internal tag named `kind` would collide with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum DegradeEvent {
    /// 解析不能: the frontmatter is not valid YAML, or a required field (id/title/status) is
    /// missing, so the file cannot be fully mapped. `missing_required` names which required
    /// fields were absent; `detail` optionally carries a YAML parse message.
    #[serde(rename_all = "camelCase")]
    Unparseable {
        missing_required: Vec<RequiredField>,
        detail: Option<String>,
    },
    /// 想定外スキーマ: frontmatter reads, but a value or structure is out of range — an unknown
    /// status value, an unknown SECTION, a `BEGIN`/`END` pair that does not close, or an AC
    /// numbering that cannot be read. Discernible fields are kept; only the out-of-range part
    /// degrades. `Draft` is a *known* status and never triggers this (§3.4).
    UnexpectedSchema { detail: String },
    /// 参照欠損: a referenced milestone / document / reference target was not found in the root.
    /// The task body is kept intact; only the reference is marked unresolved.
    #[serde(rename_all = "camelCase")]
    DanglingReference { kind: ReferenceKind, target: String },
}

/// Per-file parse health (doc-4 §5, AC #4). `Degraded` carries the events that explain what is
/// missing or out of range, so the UI can switch that one file to 不整合表示 on this evidence.
///
/// Named for a management file rather than a task because decision-24 widened 不整合's object
/// from タスク 1 件 to 管理ファイル 1 件: [`Task`], [`Milestone`], [`Document`] and [`Decision`]
/// all carry one. Only the Rust type name moved — `Degraded`, [`DegradeEvent`] and the wire
/// tokens stay as decision-22 left them, because what that decision froze was the word 縮退,
/// not the `Task` prefix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum FileHealth {
    /// Fully parsed, nothing degraded.
    Ok,
    /// One or more degradation events (§5); `events` is non-empty by construction.
    Degraded { events: Vec<DegradeEvent> },
}

impl FileHealth {
    /// True when this file must be shown in 不整合表示.
    pub fn is_degraded(&self) -> bool {
        matches!(self, FileHealth::Degraded { .. })
    }
}

/// Which non-task management file a [`UnmappedFile`] came from (doc-4 §3.2). Tasks are absent
/// by construction: a task that fails required-field parsing is still kept as a [`Task`], so it
/// never becomes 写せなかったファイル (doc-4 §5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ManagedFileKind {
    Milestone,
    Document,
    Decision,
}

/// 写せなかったファイル (doc-4 §1, decision-24): a `milestones/`, `docs/` or `decisions/` file
/// that 解析不能 kept out of its collection entirely, reduced to where it is, what it was meant
/// to be, and why it did not read.
///
/// The three non-task kinds cannot do what [`Task`] does with a failed required field — keep the
/// value with `id: None` — because an id-less entry can be neither ordered in a list nor named
/// as the target of a `doc update`. So the failure lands here instead of vanishing, which is the
/// whole of TASK-88.
///
/// The fields *are* [`DegradeEvent::Unparseable`]'s payload, held without the event tag: 解析不能
/// is the only event that can produce this record, since a file that got as far as 想定外スキーマ
/// has an id and is in its collection instead. Carrying the tag would imply the other two
/// variants can appear here, and they cannot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmappedFile {
    pub source_path: PathBuf,
    pub kind: ManagedFileKind,
    /// Which of the two required identity fields were absent. `status` never appears — doc-4
    /// §3.2 makes `id`/`title` the required set for these three kinds.
    pub missing_required: Vec<RequiredField>,
    /// The read or YAML error, when the failure was one. `None` when the file parsed but the
    /// required fields were the gap, matching [`DegradeEvent::Unparseable`]'s own convention.
    pub detail: Option<String>,
}

/// One task mirrored from a Backlog root (doc-4 §3.1). Holds discernible facts and explicit
/// gaps together (§3), so a 解析不能 file is represented here too — with `id`/`title`/`status`
/// `None` and the gap recorded in [`Task::health`] — instead of being dropped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    /// Source file path. Kept because a 解析不能 task may lack an `id`, and 縮退表示 still needs
    /// a stable way to name the offending file (§5). Not a frontmatter field.
    pub source_path: PathBuf,
    /// Owning project — the ledger slug of the scan-root this file came from (doc-4 §3.1,
    /// TASK-4). Never in frontmatter; assigned by the read layer from the scan root (AC #2).
    pub project: String,
    /// Storage state from the scan directory, independent of `status` (§3.4, AC #2). `None`
    /// means indeterminate: a task-like file found outside the five recognized scan locations
    /// is kept as 想定外スキーマ with its storage state unresolved (§3.4 last bullet), rather
    /// than being forced into one of the four states or dropped. A `None` here must never be
    /// treated as `Active` by the default swimlane filter (doc-7).
    pub storage_state: Option<StorageState>,
    /// Project-internal task id (`TASK-N`, or `DRAFT-N` for drafts). `None` when 解析不能 (§5);
    /// only tasks with `Some(id)` participate in id cross-reference (AC #1).
    pub id: Option<String>,
    /// `None` when the required field was absent (§4, §5).
    pub title: Option<String>,
    /// Raw frontmatter `status`; normalization against `config.yml` is TASK-29, not here.
    /// `None` when the required field was absent (§4, §5).
    pub status: Option<String>,
    /// Type 候補 — the strings the two Type 導出元 held, kind labels first (the text after
    /// `kind:`) then the frontmatter `type` field, held *separately* from normal labels so the
    /// two never mix (§3.3, AC #3). These are what the file said, not what the screen shows:
    /// classifying against 既知 Type 集合 and folding 同値の重複 belong to `interpret`
    /// (decision-5, decision-20), so this list can be longer than the displayed Type values.
    /// Serialized as `type`: doc-4 §3.1/§3.3 names this field `type` in the referent table
    /// that is the IPC wire contract, so it must not become `typeCandidates` under `rename_all`.
    #[serde(rename = "type")]
    pub type_candidates: Vec<String>,
    /// Normal (non-`kind:`) labels only — the display label list, never mixed with kind
    /// labels (§3.3, AC #3).
    pub labels: Vec<String>,
    pub assignee: Vec<String>,
    pub priority: Option<String>,
    pub ordinal: Option<i64>,
    /// Milestone id reference (resolved against [`ProjectModel::milestones`]).
    pub milestone: Option<String>,
    pub created_date: Option<String>,
    pub updated_date: Option<String>,
    /// Project-internal task ids this task depends on.
    pub dependencies: Vec<String>,
    /// Document ids referenced from frontmatter `documentation` (a real field on managed
    /// tasks, e.g. `doc-2`). Resolved against [`ProjectModel::document`]; a target absent from
    /// the root becomes a 参照欠損 ([`DegradeEvent::DanglingReference`] with
    /// [`ReferenceKind::Documentation`]) (doc-4 §3.2, §5). Without this the document
    /// cross-reference has no input.
    pub documentation: Vec<String>,
    /// URLs from frontmatter `references` and the body References section; PR-URL extraction
    /// (TASK-30) consumes these. This layer only holds them.
    pub references: Vec<String>,
    /// `SECTION:DESCRIPTION` body.
    pub description: Option<String>,
    /// `AC:BEGIN`…`AC:END` items in order (AC #4).
    pub acceptance_criteria: Vec<AcceptanceCriterion>,
    /// `SECTION:PLAN` body (optional).
    pub implementation_plan: Option<String>,
    /// `SECTION:NOTES` body (optional).
    pub implementation_notes: Option<String>,
    /// Bodies of SECTION names outside the known set, kept rather than dropped (§4).
    pub unknown_sections: Vec<UnknownSection>,
    /// Parse health and, when degraded, the missing/out-of-range account (§5, AC #4).
    pub health: FileHealth,
}

/// One project (one Backlog root) fully mirrored: its config plus tasks, milestones and
/// documents, cross-referenced by id within this project (doc-4 §3.2, AC #1). Ids are unique
/// only within a project; cross-project reference goes through the ledger's cross-task-id, not
/// this type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectModel {
    /// The owning project's ledger slug (matches each [`Task::project`]).
    pub slug: String,
    pub config: Config,
    pub tasks: Vec<Task>,
    pub milestones: Vec<Milestone>,
    pub documents: Vec<Document>,
    pub decisions: Vec<Decision>,
    /// 写せなかったファイル across all three non-task kinds, in scan order (decision-24). Held
    /// as one list rather than one per collection because the kind is already on the record and
    /// each screen filters to its own — splitting it would make the three lists disagree about
    /// what counts as a failure.
    pub unmapped_files: Vec<UnmappedFile>,
}

impl ProjectModel {
    /// Look up a task by its project-internal id (AC #1). Tasks that are 解析不能 and lack an
    /// id (`None`) never match, which is correct — an id-less task cannot be cross-referenced.
    pub fn task(&self, id: &str) -> Option<&Task> {
        self.tasks.iter().find(|t| t.id.as_deref() == Some(id))
    }

    /// Resolve a task's `milestone` reference within this project (AC #1). `None` means the id
    /// is unknown here — the caller records a 参照欠損 ([`DegradeEvent::DanglingReference`]).
    pub fn milestone(&self, id: &str) -> Option<&Milestone> {
        self.milestones.iter().find(|m| m.id == id)
    }

    /// Resolve a documentation reference within this project (AC #1).
    pub fn document(&self, id: &str) -> Option<&Document> {
        self.documents.iter().find(|d| d.id == id)
    }

    /// Look up a decision record by id (`decision-N`).
    pub fn decision(&self, id: &str) -> Option<&Decision> {
        self.decisions.iter().find(|d| d.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> Config {
        Config {
            project_name: Some("Backlog Atlas".into()),
            task_prefix: "TASK".into(),
            statuses: vec![
                "To Do".into(),
                "In Progress".into(),
                "In Review".into(),
                "Done".into(),
            ],
            default_status: Some("To Do".into()),
            date_format: Some("yyyy-mm-dd".into()),
        }
    }

    fn task(id: Option<&str>, storage_state: Option<StorageState>, health: FileHealth) -> Task {
        Task {
            source_path: PathBuf::from(format!("tasks/{}.md", id.unwrap_or("unparseable"))),
            project: "atlas".into(),
            storage_state,
            id: id.map(Into::into),
            title: id.map(|_| "a title".into()),
            status: id.map(|_| "To Do".into()),
            type_candidates: vec![],
            labels: vec![],
            assignee: vec![],
            priority: None,
            ordinal: None,
            milestone: None,
            created_date: None,
            updated_date: None,
            dependencies: vec![],
            documentation: vec![],
            references: vec![],
            description: None,
            acceptance_criteria: vec![],
            implementation_plan: None,
            implementation_notes: None,
            unknown_sections: vec![],
            health,
        }
    }

    fn model(
        tasks: Vec<Task>,
        milestones: Vec<Milestone>,
        documents: Vec<Document>,
    ) -> ProjectModel {
        ProjectModel {
            slug: "atlas".into(),
            config: sample_config(),
            tasks,
            milestones,
            documents,
            decisions: vec![],
            unmapped_files: vec![],
        }
    }

    // AC #1: tasks/milestones/documents cross-reference by id within one project.
    #[test]
    fn cross_reference_by_id_resolves() {
        let m = model(
            vec![task(
                Some("TASK-1"),
                Some(StorageState::Active),
                FileHealth::Ok,
            )],
            vec![Milestone {
                source_path: PathBuf::from("milestones/m-1.md"),
                id: "m-1".into(),
                title: "impl".into(),
                description: None,
                health: FileHealth::Ok,
            }],
            vec![Document {
                source_path: PathBuf::from("docs/doc-4.md"),
                id: "doc-4".into(),
                title: "design".into(),
                doc_type: Some("specification".into()),
                tags: vec![],
                created_date: None,
                updated_date: None,
                body: None,
                health: FileHealth::Ok,
            }],
        );

        assert_eq!(m.task("TASK-1").unwrap().id.as_deref(), Some("TASK-1"));
        assert_eq!(m.milestone("m-1").unwrap().title, "impl");
        assert_eq!(
            m.document("doc-4").unwrap().doc_type.as_deref(),
            Some("specification")
        );
        assert!(m.task("TASK-404").is_none());
        assert!(m.milestone("m-404").is_none());
    }

    // Review [P2] §3.2/§5: a task holds its `documentation` ids; each resolves against the
    // project's documents, and an absent target is the input for a 参照欠損 degradation.
    #[test]
    fn task_documentation_references_resolve_or_dangle() {
        let mut t = task(Some("TASK-1"), Some(StorageState::Active), FileHealth::Ok);
        t.documentation = vec!["doc-2".into(), "doc-404".into()];
        let m = model(
            vec![t],
            vec![],
            vec![Document {
                source_path: PathBuf::from("docs/doc-2.md"),
                id: "doc-2".into(),
                title: "start".into(),
                doc_type: Some("guide".into()),
                tags: vec![],
                created_date: None,
                updated_date: None,
                body: None,
                health: FileHealth::Ok,
            }],
        );

        let refs = &m.task("TASK-1").unwrap().documentation;
        // Present target resolves through the id cross-reference (AC #1).
        assert_eq!(m.document(&refs[0]).unwrap().title, "start");
        // Missing target is unresolved — the read layer records it as a dangling reference.
        assert!(m.document(&refs[1]).is_none());
        let missing = DegradeEvent::DanglingReference {
            kind: ReferenceKind::Documentation,
            target: refs[1].clone(),
        };
        assert_eq!(
            missing,
            DegradeEvent::DanglingReference {
                kind: ReferenceKind::Documentation,
                target: "doc-404".into(),
            }
        );
    }

    // AC #2: storageState is an axis independent of frontmatter status. A Done task in tasks/
    // stays Active; a To Do task in completed/ is Completed.
    #[test]
    fn storage_state_is_independent_of_status() {
        let mut done_in_tasks = task(Some("TASK-1"), Some(StorageState::Active), FileHealth::Ok);
        done_in_tasks.status = Some("Done".into());
        assert_eq!(done_in_tasks.storage_state, Some(StorageState::Active));

        let mut todo_in_completed = task(
            Some("TASK-2"),
            Some(StorageState::Completed),
            FileHealth::Ok,
        );
        todo_in_completed.status = Some("To Do".into());
        assert_eq!(
            todo_in_completed.storage_state,
            Some(StorageState::Completed)
        );
    }

    // AC #2: project comes from the scan root, not frontmatter.
    #[test]
    fn task_carries_project_and_storage_state() {
        let t = task(Some("DRAFT-1"), Some(StorageState::Draft), FileHealth::Ok);
        assert_eq!(t.project, "atlas");
        assert_eq!(t.storage_state, Some(StorageState::Draft));
    }

    // Review [P2] §3.4: a task-like file outside the recognized scan locations is kept with an
    // indeterminate storage state (None) plus 想定外スキーマ — never silently made Active, or the
    // default swimlane (active-only) would show it (doc-7).
    #[test]
    fn indeterminate_storage_state_is_not_active() {
        let t = task(
            Some("TASK-9"),
            None,
            FileHealth::Degraded {
                events: vec![DegradeEvent::UnexpectedSchema {
                    detail: "task file outside known scan locations".into(),
                }],
            },
        );
        assert_eq!(t.storage_state, None);
        assert_ne!(t.storage_state, Some(StorageState::Active));
        assert!(t.health.is_degraded());
        // The active-only swimlane filter keys off Some(Active); None must not pass it.
        let shows_in_default_swimlane = t.storage_state == Some(StorageState::Active);
        assert!(!shows_in_default_swimlane);
    }

    // AC #3: kind-derived Type and normal labels are separate fields; raw labels never mix.
    #[test]
    fn type_and_normal_labels_are_separated() {
        let mut t = task(Some("TASK-1"), Some(StorageState::Active), FileHealth::Ok);
        t.type_candidates = vec!["feature".into()];
        t.labels = vec!["ui".into(), "backend".into()];
        assert_eq!(t.type_candidates, vec!["feature".to_string()]);
        assert!(!t.labels.contains(&"feature".to_string()));
    }

    // AC #4: AC items keep number / text / checked in order.
    #[test]
    fn acceptance_criteria_keep_number_text_checked() {
        let mut t = task(Some("TASK-1"), Some(StorageState::Active), FileHealth::Ok);
        t.acceptance_criteria = vec![
            AcceptanceCriterion {
                number: 1,
                text: "first".into(),
                checked: true,
            },
            AcceptanceCriterion {
                number: 2,
                text: "second".into(),
                checked: false,
            },
        ];
        assert_eq!(t.acceptance_criteria[0].number, 1);
        assert!(t.acceptance_criteria[0].checked);
        assert_eq!(t.acceptance_criteria[1].text, "second");
        assert!(!t.acceptance_criteria[1].checked);
    }

    // AC #4: a 解析不能 file is kept as a task with None identity + a health event naming the
    // missing required fields, not dropped.
    #[test]
    fn unparseable_task_is_kept_with_missing_fields() {
        let t = task(
            None,
            Some(StorageState::Active),
            FileHealth::Degraded {
                events: vec![DegradeEvent::Unparseable {
                    missing_required: vec![RequiredField::Id, RequiredField::Status],
                    detail: None,
                }],
            },
        );
        assert!(t.id.is_none());
        assert!(t.health.is_degraded());
        // An id-less degraded task is not reachable by id lookup (correct — it has none).
        let m = model(vec![t], vec![], vec![]);
        assert_eq!(m.tasks.len(), 1);
        assert!(m.task("TASK-1").is_none());
    }

    // Serialization uses doc-4 §3.1 camelCase names (the wire contract), and enums render as
    // the doc's lowercase tokens.
    #[test]
    fn serializes_with_doc_field_names() {
        let t = task(Some("TASK-1"), Some(StorageState::Active), FileHealth::Ok);
        let mut t = t;
        t.type_candidates = vec!["feature".into()];
        let json = serde_json::to_value(&t).unwrap();
        assert!(json.get("storageState").is_some());
        assert!(json.get("acceptanceCriteria").is_some());
        assert!(json.get("implementationPlan").is_some());
        assert_eq!(json["storageState"], "active");
        assert_eq!(json["health"]["state"], "ok");
        // Review [P2]: the kind-derived Type slot must be on the wire as `type` (doc-4 §3.1),
        // not `typeLabels`.
        assert!(json.get("typeLabels").is_none());
        assert_eq!(json["type"], serde_json::json!(["feature"]));
    }

    #[test]
    fn degraded_event_serializes_with_tag() {
        let health = FileHealth::Degraded {
            events: vec![DegradeEvent::DanglingReference {
                kind: ReferenceKind::Milestone,
                target: "m-9".into(),
            }],
        };
        let json = serde_json::to_value(&health).unwrap();
        assert_eq!(json["state"], "degraded");
        assert_eq!(json["events"][0]["event"], "danglingReference");
        assert_eq!(json["events"][0]["kind"], "milestone");
        assert_eq!(json["events"][0]["target"], "m-9");
    }
}
