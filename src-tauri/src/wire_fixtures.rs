//! Recorded wire payloads (TASK-91). Test-only.
//!
//! `wire.ts` mirrors this crate's serde output by hand. The compiler on neither side checks the
//! other: TypeScript never sees a runtime payload, and the Rust JSON tests never read the
//! TypeScript declarations. So a renamed field, a variant tag that moved, or a `skip_serializing_if`
//! that started firing changes what the frontend receives while both sides still build.
//!
//! What closes that is a recorded artefact with the Rust side as its source. Each test below builds
//! one payload, serializes it, and compares it with the file under `wire-fixtures/`. A shape change
//! fails here until the file is re-recorded, and the re-recorded file then reaches
//! `src/lib/wire-fixture.test.ts`, which reads it *as* the `wire.ts` type and runs the frontend's own
//! functions over it. One side cannot move without the other failing.
//!
//! Re-record with `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test`. The result has to be committed — the
//! frontend test reads the file, not this module.
//!
//! Absolute paths are deliberately fabricated rather than taken from a temp dir: a recorded fixture
//! has to be identical on every machine, and `TempDir` names contain a pid and a timestamp.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::commands::{
    CliReadiness, CommandError, CommitSearch, LedgerRefusal, LedgerResponse, ProjectLoad,
    ProjectSnapshot, RegisterResponse, ReloadEvent, TaskHistory, TaskView, UpdateResult,
};
use crate::domain::{
    AcceptanceCriterion, Config, Decision, DegradeEvent, Document, FileHealth, ManagedFileKind,
    Milestone, ReferenceKind, RequiredField, StorageState, Task, UnknownSection, UnmappedFile,
};
use crate::editor::{
    ConfiguredEditor, EditorCommand, EditorLaunch, EditorReadiness, EditorSource, LaunchMethod,
};
use crate::history::{
    Commit, GitRemoteRead, LookupFailure, PrRelation, RelationOutcome, RemoteHost, RemoteHostKind,
};
use crate::interpret::status::{StatusColumn, StatusDeclaration, StatusMapping};
use crate::interpret::type_value::derive_types;
use crate::ledger::{Ledger, ProjectEntry};
use crate::settings::{
    AppSettings, CardDensity, CardOrder, DetailPlacement, LoadedSettings, SettingsStatus,
    StorageSelection, KNOWN_SCHEMA_VERSION,
};
use crate::update::{FailureKind, UpdateFailure, UpdateOutcome};

/// Where the recorded payloads live, relative to `src-tauri/`.
fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("wire-fixtures")
}

/// Compare `value`'s JSON with the file recorded under `name`, or record it when asked.
///
/// A missing file is recorded *and* failed rather than accepted silently: the frontend test reads the
/// committed file, so a fixture that exists only on the machine that generated it fixes nothing.
fn recorded<T: serde::Serialize>(name: &str, value: &T) {
    let json = serde_json::to_string_pretty(value).expect("wire payloads serialize");
    let path = fixture_dir().join(name);

    if std::env::var_os("ATLAS_RECORD_WIRE_FIXTURES").is_some() {
        std::fs::create_dir_all(fixture_dir()).expect("the fixture dir is writable");
        std::fs::write(&path, format!("{json}\n")).expect("the fixture is writable");
        return;
    }

    let found = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) => panic!(
            "{name} has never been recorded ({error}). \
             Run `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` and commit wire-fixtures/{name}."
        ),
    };
    assert_eq!(
        found.trim_end(),
        json,
        "the wire shape of {name} moved. If the change is intended, re-record with \
         `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test`, commit the file, and update `src/lib/wire.ts` \
         to match — `src/lib/wire-fixture.test.ts` reads the same file and will say what broke."
    );
}

// --- the values the payloads are built from -----------------------------------------------------

fn config() -> Config {
    Config {
        project_name: Some("Atlas".to_string()),
        task_prefix: "TASK".to_string(),
        statuses: vec![
            "To Do".to_string(),
            "In Progress".to_string(),
            "In Review".to_string(),
            "Done".to_string(),
        ],
        default_status: Some("To Do".to_string()),
        date_format: None,
    }
}

/// A task with every optional field populated, so a field that stops being serialized shows up.
fn task() -> Task {
    Task {
        source_path: PathBuf::from("/repos/atlas/backlog/tasks/task-1 - a.md"),
        project: "atlas".to_string(),
        storage_state: Some(StorageState::Active),
        id: Some("TASK-1".to_string()),
        title: Some("A task".to_string()),
        status: Some("In Progress".to_string()),
        type_candidates: vec!["feature".to_string()],
        labels: vec!["ui".to_string()],
        assignee: vec!["someone".to_string()],
        priority: Some("high".to_string()),
        ordinal: Some(1000),
        milestone: Some("m-1".to_string()),
        created_date: Some("2026-07-01 10:00".to_string()),
        updated_date: Some("2026-07-20 11:00".to_string()),
        dependencies: vec!["TASK-2".to_string()],
        documentation: vec!["doc-7".to_string()],
        references: vec!["https://example.test/pull/1".to_string()],
        description: Some("What it is for.".to_string()),
        acceptance_criteria: vec![AcceptanceCriterion {
            number: 1,
            text: "It works".to_string(),
            checked: true,
        }],
        implementation_plan: Some("Do it.".to_string()),
        implementation_notes: Some("Done it.".to_string()),
        unknown_sections: vec![UnknownSection {
            name: "REVIEW".to_string(),
            body: "Kept rather than dropped.".to_string(),
        }],
        health: FileHealth::Degraded {
            events: vec![DegradeEvent::DanglingReference {
                kind: ReferenceKind::Documentation,
                target: "doc-99".to_string(),
            }],
        },
    }
}

/// A second task carrying the 解析不能 side: no id, no status, and a degrade event.
fn degraded_task() -> Task {
    Task {
        source_path: PathBuf::from("/repos/atlas/backlog/tasks/task-broken.md"),
        project: "atlas".to_string(),
        storage_state: None,
        id: None,
        title: None,
        status: None,
        type_candidates: Vec::new(),
        labels: Vec::new(),
        assignee: Vec::new(),
        priority: None,
        ordinal: None,
        milestone: None,
        created_date: None,
        updated_date: None,
        dependencies: Vec::new(),
        documentation: Vec::new(),
        references: Vec::new(),
        description: None,
        acceptance_criteria: Vec::new(),
        implementation_plan: None,
        implementation_notes: None,
        unknown_sections: Vec::new(),
        health: FileHealth::Degraded {
            events: vec![DegradeEvent::Unparseable {
                missing_required: vec![RequiredField::Id, RequiredField::Title],
                detail: Some("mapping values are not allowed in this context".to_string()),
            }],
        },
    }
}

fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot {
        slug: "atlas".to_string(),
        config: config(),
        tasks: vec![
            TaskView {
                task: task(),
                interpretation: crate::interpret::TaskInterpretation {
                    status: Some(StatusMapping {
                        raw: "In Progress".to_string(),
                        column: Some(StatusColumn::InProgress),
                        declaration: StatusDeclaration::Declared,
                    }),
                    // Built through the real derivation so the recorded array is the one
                    // `kind:feature` actually produces — `TypeValues` is a transparent newtype and
                    // its inner `Vec` is private, which is what keeps that the only way in.
                    types: derive_types(&["feature".to_string()]),
                    pull_requests: vec![crate::history::PullRequestRef {
                        url: "https://example.test/pull/1".to_string(),
                        host: Some(RemoteHostKind::GitHub),
                        owner: Some("serendipitynz".to_string()),
                        repo: Some("backlog-atlas".to_string()),
                        number: Some(1),
                    }],
                },
            },
            TaskView {
                task: degraded_task(),
                interpretation: crate::interpret::TaskInterpretation {
                    status: None,
                    types: derive_types(&[]),
                    pull_requests: Vec::new(),
                },
            },
        ],
        milestones: vec![Milestone {
            source_path: PathBuf::from("/repos/atlas/backlog/milestones/m-1 - phase.md"),
            id: "m-1".to_string(),
            title: "Phase one".to_string(),
            description: Some("The first phase.".to_string()),
            health: FileHealth::Ok,
        }],
        documents: vec![Document {
            source_path: PathBuf::from("/repos/atlas/backlog/docs/doc-7 - screen.md"),
            id: "doc-7".to_string(),
            title: "Screen design".to_string(),
            doc_type: Some("specification".to_string()),
            tags: vec!["ui".to_string()],
            created_date: Some("2026-07-01 10:00".to_string()),
            updated_date: Some("2026-07-20 11:00".to_string()),
            body: Some("The screen.".to_string()),
            // Degraded on purpose: a document keeps its id/title/body when only an optional
            // field is out of range (AC #3), and this is the sample that carries a non-task
            // `FileHealth::Degraded` across the wire.
            health: FileHealth::Degraded {
                events: vec![DegradeEvent::UnexpectedSchema {
                    detail: "frontmatter `tags` is not a list".to_string(),
                }],
            },
        }],
        decisions: vec![Decision {
            source_path: PathBuf::from("/repos/atlas/backlog/decisions/decision-12 - colours.md"),
            id: "decision-12".to_string(),
            title: "Colour tokens".to_string(),
            status: Some("accepted".to_string()),
            date: Some("2026-07-10".to_string()),
            body: Some("The tokens.".to_string()),
            health: FileHealth::Ok,
        }],
        unmapped_files: vec![UnmappedFile {
            source_path: PathBuf::from("/repos/atlas/backlog/docs/doc-9 - broken.md"),
            kind: ManagedFileKind::Document,
            missing_required: vec![RequiredField::Id, RequiredField::Title],
            detail: Some("no closing frontmatter fence".to_string()),
        }],
        create_status_candidates: crate::interpret::status::create_status_candidates(
            &config(),
            &BTreeMap::new(),
        ),
    }
}

fn entry() -> ProjectEntry {
    ProjectEntry {
        slug: "atlas".to_string(),
        project_root: PathBuf::from("/repos/atlas"),
        backlog_root: PathBuf::from("/repos/atlas/backlog"),
        git_remote_present: true,
        status_aliases: BTreeMap::from([("Doing".to_string(), "inProgress".to_string())]),
    }
}

// --- the payloads -------------------------------------------------------------------------------

#[test]
fn project_load_loaded_is_recorded() {
    // The largest payload by far, and the one every screen reads: it carries `Config`, `Task`,
    // `TaskInterpretation`, `StatusMapping`, `TypeValue`, `PullRequestRef`, `Milestone`, `Document`,
    // `Decision` and `ColumnCreateStatuses` in one value.
    recorded(
        "project_load_loaded.json",
        &ProjectLoad::Loaded {
            project: snapshot(),
        },
    );
}

#[test]
fn project_load_unreadable_is_recorded() {
    // doc-7 §6: a failing root is a *value* in the workspace list, so its error shape is as much a
    // wire contract as a successful read's.
    recorded(
        "project_load_unreadable.json",
        &ProjectLoad::Unreadable {
            slug: "gone".to_string(),
            error: CommandError::RootUnreadable {
                slug: "gone".to_string(),
                detail: "config.yml not found".to_string(),
            },
        },
    );
}

#[test]
fn task_history_is_recorded() {
    recorded(
        "task_history.json",
        &TaskHistory {
            commits: CommitSearch::Searched {
                commits: vec![Commit {
                    id: "0123456789abcdef0123456789abcdef01234567".to_string(),
                    short_id: "0123456".to_string(),
                    summary: "TASK-1: do it".to_string(),
                    date: "2026-07-20T10:00:00+09:00".to_string(),
                    author: "Someone".to_string(),
                }],
            },
            remote: Some(RemoteHost {
                kind: RemoteHostKind::GitHub,
                owner: "serendipitynz".to_string(),
                repo: "backlog-atlas".to_string(),
            }),
            relations: vec![
                PrRelation {
                    pull_request: "https://example.test/pull/1".to_string(),
                    outcome: RelationOutcome::Resolved {
                        commit_ids: vec!["0123456789abcdef0123456789abcdef01234567".to_string()],
                    },
                },
                PrRelation {
                    pull_request: "https://example.test/pull/2".to_string(),
                    outcome: RelationOutcome::HostUnsupported,
                },
            ],
        },
    );
}

#[test]
fn commit_search_degrades_are_recorded() {
    // The two non-`Searched` states are what doc-8 §5 forbids the screen from reporting as
    // 関連が無い, so the frontend has to be able to tell them apart — which means their tags matter.
    recorded(
        "commit_search_no_repository.json",
        &CommitSearch::NoRepository {
            project_root: PathBuf::from("/repos/atlas"),
        },
    );
    recorded(
        "commit_search_unreadable.json",
        &CommitSearch::Unreadable {
            detail: "git not found on PATH".to_string(),
        },
    );
}

#[test]
fn update_result_conflict_is_recorded() {
    recorded(
        "update_result_conflict.json",
        &UpdateResult::Conflict {
            diverged: vec![PathBuf::from("tasks/task-1 - a.md")],
            unread: vec![PathBuf::from("tasks/task-9 - new.md")],
            project: snapshot(),
        },
    );
}

#[test]
fn update_result_ran_is_recorded() {
    recorded(
        "update_result_ran_failed.json",
        &UpdateResult::Ran {
            outcome: UpdateOutcome::Failed(UpdateFailure {
                command: "task edit".to_string(),
                kind: FailureKind::NonZero { code: Some(1) },
                stderr: "no such task".to_string(),
                completed_before: 1,
                reload_required: true,
            }),
            project: None,
        },
    );
}

/// 期限到達 gets its own recording rather than riding on the one above: `after_ms` appears in no
/// other payload, so without a sample carrying it the frontend's value-type check has nothing to
/// compare and a change from a number to a string on this side would pass (decision-18).
#[test]
fn update_result_timed_out_is_recorded() {
    recorded(
        "update_result_ran_timed_out.json",
        &UpdateResult::Ran {
            outcome: UpdateOutcome::Failed(UpdateFailure {
                command: "task edit".to_string(),
                kind: FailureKind::TimedOut { after_ms: 30_000 },
                stderr: "the backlog CLI did not finish within 30 seconds, so Atlas stopped waiting for it"
                    .to_string(),
                completed_before: 0,
                reload_required: true,
            }),
            project: None,
        },
    );
}

#[test]
fn command_errors_are_recorded() {
    // One file holding the variants whose *payload* the screens read — the ones a form has to send
    // the user back to a field over (doc-3 §3.1), and 縮退, whose payload is a nested enum.
    recorded(
        "command_errors.json",
        &vec![
            CommandError::LedgerRefused {
                reason: LedgerRefusal::DuplicateSlug {
                    slug: "atlas".to_string(),
                },
                detail: "slug already registered".to_string(),
            },
            CommandError::LedgerRefused {
                reason: LedgerRefusal::InvalidStatusAlias {
                    key: "Doing".to_string(),
                    value: "nope".to_string(),
                },
                detail: "not a canonical column".to_string(),
            },
            CommandError::UpdatesUnavailable {
                readiness: CliReadiness::Unsupported {
                    version: "1.20.0".to_string(),
                    minimum: "1.48.0".to_string(),
                },
            },
            CommandError::TaskNotFound {
                slug: "atlas".to_string(),
                task_id: "TASK-99".to_string(),
            },
            CommandError::UnknownTaskFile {
                slug: "atlas".to_string(),
                path: PathBuf::from("/elsewhere/evil.md"),
            },
            // 履歴読取の取消 (decision-19). Its payload is the 読取識別子: the screen's loader
            // generation and call number, which is a *string* precisely because a bare number is
            // only unique within one loader.
            CommandError::HistoryCancelled {
                read_id: "3f2a1c-7".to_string(),
            },
            CommandError::EditorLaunchFailed {
                method: LaunchMethod::Configured,
                program: "code".to_string(),
                detail: "No such file or directory".to_string(),
            },
        ],
    );
}

#[test]
fn ledger_response_is_recorded() {
    // snake_case on purpose (doc-3 §2.2): the ledger types are the TOML's shape, and `wire.ts`
    // mirrors them as-is rather than "correcting" them to camelCase.
    recorded(
        "ledger_response.json",
        &LedgerResponse {
            ledger: Ledger {
                schema_version: 1,
                projects: vec![entry()],
            },
            read_only: false,
        },
    );
}

#[test]
fn git_remote_read_is_recorded() {
    // The 現在値 the 概要区画 shows (doc-10 §4.1). `Configured` is the sample because it is the only
    // variant carrying fields; the other three reach the frontend through `wire_tokens.json`.
    recorded(
        "git_remote_read.json",
        &GitRemoteRead::Configured {
            name: "origin".to_string(),
            url: "git@github.com:serendipitynz/backlog-atlas.git".to_string(),
        },
    );
}

#[test]
fn loaded_settings_is_recorded() {
    recorded(
        "loaded_settings.json",
        &LoadedSettings {
            settings: AppSettings {
                schema_version: KNOWN_SCHEMA_VERSION,
                theme: Some("nord".to_string()),
                card_density: CardDensity::L,
                default_storage_filter: vec![
                    StorageSelection::Active,
                    StorageSelection::Indeterminate,
                ],
                default_detail_placement: DetailPlacement::Modal,
                default_card_order: CardOrder::UpdatedDesc,
                watch_external_changes: false,
                backlog_cli: Some(PathBuf::from("/opt/backlog/backlog")),
                external_editor: Some(EditorCommand {
                    program: "code".to_string(),
                    args: vec!["-w".to_string()],
                }),
            },
            status: SettingsStatus::ReadOnly {
                version: KNOWN_SCHEMA_VERSION + 1,
            },
        },
    );
}

#[test]
fn editor_payloads_are_recorded() {
    recorded(
        "editor_readiness.json",
        &EditorReadiness {
            configured: Some(ConfiguredEditor {
                source: EditorSource::AppSettings,
                program: "code".to_string(),
                args: vec!["-w".to_string()],
            }),
            association: "open".to_string(),
        },
    );
    recorded(
        "editor_launch.json",
        &EditorLaunch {
            method: LaunchMethod::Association,
            program: "open".to_string(),
            args: vec!["/repos/atlas/backlog/tasks/task-1 - a.md".to_string()],
        },
    );
}

#[test]
fn register_response_is_recorded() {
    // Recorded as its own payload and not left to `LedgerResponse` alone: this is the one command
    // whose answer names the entry it created, because doc-3 §3.1 lets the slug be derived from the
    // project-root directory name — so the caller reads `entry` rather than assuming what it asked
    // for. A rename of the outer pair appears in no other recording.
    recorded(
        "register_response.json",
        &RegisterResponse {
            entry: entry(),
            ledger: LedgerResponse {
                ledger: Ledger {
                    schema_version: 1,
                    projects: vec![entry()],
                },
                read_only: false,
            },
        },
    );
}

#[test]
fn reload_event_is_recorded() {
    // The `project-reloaded` payload. No command returns it, so it is the one wire shape that would
    // otherwise never be recorded — and the shell keys the new load by `slug`, so a rename of either
    // field stops every watch-triggered re-read from reaching a row, silently.
    recorded(
        "reload_event.json",
        &ReloadEvent {
            slug: "atlas".to_string(),
            load: ProjectLoad::Loaded {
                project: snapshot(),
            },
        },
    );
}

#[test]
fn cli_readiness_is_recorded() {
    recorded(
        "cli_readiness.json",
        &CliReadiness::Ready {
            version: "1.48.0".to_string(),
        },
    );
}

// --- every serde token, so an unrecorded variant is anchored too -------------------------------
//
// A payload sample only exercises the variants it happens to carry: the recordings serialize
// `StatusDeclaration::Declared` and never `Draft`, so renaming `Draft`'s token on this side moved
// nothing the frontend compares. Recording the *complete* token set closes that — every member of
// every union `wire.ts` declares is then anchored to what serde actually emits.
//
// Nothing below spells a token. Each list holds one value per variant and serde produces the strings,
// so this cannot agree with a stale `wire.ts` by being edited. What keeps a list complete is the
// exhaustive `match` beside it: adding a variant to the enum stops that match compiling, which is the
// prompt to add the sample.

/// The token a unit-like enum serializes to.
fn unit_tokens<T: serde::Serialize>(values: &[T]) -> Vec<String> {
    values
        .iter()
        .map(
            |value| match serde_json::to_value(value).expect("serializes") {
                serde_json::Value::String(token) => token,
                other => panic!("expected a bare string token, got {other}"),
            },
        )
        .collect()
}

/// The value of `tag` in a tagged enum's serialized form.
fn tag_tokens<T: serde::Serialize>(values: &[T], tag: &str) -> Vec<String> {
    values
        .iter()
        .map(|value| {
            let json = serde_json::to_value(value).expect("serializes");
            json.get(tag)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_else(|| panic!("no `{tag}` tag in {json}"))
                .to_string()
        })
        .collect()
}

fn every_storage_state() -> Vec<StorageState> {
    let all = vec![
        StorageState::Active,
        StorageState::Draft,
        StorageState::Completed,
        StorageState::Archive,
    ];
    for value in &all {
        match value {
            StorageState::Active
            | StorageState::Draft
            | StorageState::Completed
            | StorageState::Archive => {}
        }
    }
    all
}

fn every_storage_selection() -> Vec<StorageSelection> {
    let all = vec![
        StorageSelection::Active,
        StorageSelection::Draft,
        StorageSelection::Completed,
        StorageSelection::Archive,
        StorageSelection::Indeterminate,
    ];
    for value in &all {
        match value {
            StorageSelection::Active
            | StorageSelection::Draft
            | StorageSelection::Completed
            | StorageSelection::Archive
            | StorageSelection::Indeterminate => {}
        }
    }
    all
}

fn every_status_column() -> Vec<StatusColumn> {
    let all = vec![
        StatusColumn::ToDo,
        StatusColumn::InProgress,
        StatusColumn::InReview,
        StatusColumn::Done,
    ];
    for value in &all {
        match value {
            StatusColumn::ToDo
            | StatusColumn::InProgress
            | StatusColumn::InReview
            | StatusColumn::Done => {}
        }
    }
    all
}

fn every_status_declaration() -> Vec<StatusDeclaration> {
    let all = vec![
        StatusDeclaration::Declared,
        StatusDeclaration::Draft,
        StatusDeclaration::Undeclared,
        StatusDeclaration::NoDeclaredSet,
    ];
    for value in &all {
        match value {
            StatusDeclaration::Declared
            | StatusDeclaration::Draft
            | StatusDeclaration::Undeclared
            | StatusDeclaration::NoDeclaredSet => {}
        }
    }
    all
}

fn every_managed_file_kind() -> Vec<ManagedFileKind> {
    let all = vec![
        ManagedFileKind::Milestone,
        ManagedFileKind::Document,
        ManagedFileKind::Decision,
    ];
    for value in &all {
        match value {
            ManagedFileKind::Milestone | ManagedFileKind::Document | ManagedFileKind::Decision => {}
        }
    }
    all
}

fn every_reference_kind() -> Vec<ReferenceKind> {
    let all = vec![
        ReferenceKind::Milestone,
        ReferenceKind::Documentation,
        ReferenceKind::Reference,
    ];
    for value in &all {
        match value {
            ReferenceKind::Milestone | ReferenceKind::Documentation | ReferenceKind::Reference => {}
        }
    }
    all
}

fn every_required_field() -> Vec<RequiredField> {
    let all = vec![
        RequiredField::Id,
        RequiredField::Title,
        RequiredField::Status,
    ];
    for value in &all {
        match value {
            RequiredField::Id | RequiredField::Title | RequiredField::Status => {}
        }
    }
    all
}

fn every_remote_host_kind() -> Vec<RemoteHostKind> {
    let all = vec![RemoteHostKind::GitHub];
    for value in &all {
        match value {
            RemoteHostKind::GitHub => {}
        }
    }
    all
}

fn every_lookup_failure() -> Vec<LookupFailure> {
    let all = vec![
        LookupFailure::ToolMissing,
        LookupFailure::InvalidReference,
        LookupFailure::QueryFailed,
        LookupFailure::TimedOut,
    ];
    for value in &all {
        match value {
            LookupFailure::ToolMissing
            | LookupFailure::InvalidReference
            | LookupFailure::QueryFailed
            | LookupFailure::TimedOut => {}
        }
    }
    all
}

fn every_launch_method() -> Vec<LaunchMethod> {
    let all = vec![LaunchMethod::Configured, LaunchMethod::Association];
    for value in &all {
        match value {
            LaunchMethod::Configured | LaunchMethod::Association => {}
        }
    }
    all
}

fn every_editor_source() -> Vec<EditorSource> {
    let all = vec![
        EditorSource::AppSettings,
        EditorSource::Visual,
        EditorSource::Editor,
    ];
    for value in &all {
        match value {
            EditorSource::AppSettings | EditorSource::Visual | EditorSource::Editor => {}
        }
    }
    all
}

fn every_card_density() -> Vec<CardDensity> {
    let all = vec![CardDensity::S, CardDensity::M, CardDensity::L];
    for value in &all {
        match value {
            CardDensity::S | CardDensity::M | CardDensity::L => {}
        }
    }
    all
}

fn every_detail_placement() -> Vec<DetailPlacement> {
    let all = vec![
        DetailPlacement::Sidebar,
        DetailPlacement::Modal,
        DetailPlacement::Full,
    ];
    for value in &all {
        match value {
            DetailPlacement::Sidebar | DetailPlacement::Modal | DetailPlacement::Full => {}
        }
    }
    all
}

fn every_card_order() -> Vec<CardOrder> {
    let all = vec![
        CardOrder::PriorityAsc,
        CardOrder::PriorityDesc,
        CardOrder::TaskIdAsc,
        CardOrder::TaskIdDesc,
        CardOrder::UpdatedAsc,
        CardOrder::UpdatedDesc,
        CardOrder::CreatedAsc,
        CardOrder::CreatedDesc,
        CardOrder::MilestoneAsc,
        CardOrder::MilestoneDesc,
    ];
    for value in &all {
        match value {
            CardOrder::PriorityDesc
            | CardOrder::PriorityAsc
            | CardOrder::TaskIdAsc
            | CardOrder::TaskIdDesc
            | CardOrder::UpdatedAsc
            | CardOrder::UpdatedDesc
            | CardOrder::CreatedAsc
            | CardOrder::CreatedDesc
            | CardOrder::MilestoneAsc
            | CardOrder::MilestoneDesc => {}
        }
    }
    all
}

fn every_file_health() -> Vec<FileHealth> {
    let all = vec![FileHealth::Ok, FileHealth::Degraded { events: Vec::new() }];
    for value in &all {
        match value {
            FileHealth::Ok | FileHealth::Degraded { .. } => {}
        }
    }
    all
}

fn every_degrade_event() -> Vec<DegradeEvent> {
    let all = vec![
        DegradeEvent::Unparseable {
            missing_required: Vec::new(),
            detail: None,
        },
        DegradeEvent::UnexpectedSchema {
            detail: String::new(),
        },
        DegradeEvent::DanglingReference {
            kind: ReferenceKind::Milestone,
            target: String::new(),
        },
    ];
    for value in &all {
        match value {
            DegradeEvent::Unparseable { .. }
            | DegradeEvent::UnexpectedSchema { .. }
            | DegradeEvent::DanglingReference { .. } => {}
        }
    }
    all
}

fn every_project_load() -> Vec<ProjectLoad> {
    let all = vec![
        ProjectLoad::Loaded {
            project: snapshot(),
        },
        ProjectLoad::Unreadable {
            slug: String::new(),
            error: CommandError::UnknownProject {
                slug: String::new(),
            },
        },
    ];
    for value in &all {
        match value {
            ProjectLoad::Loaded { .. } | ProjectLoad::Unreadable { .. } => {}
        }
    }
    all
}

fn every_commit_search() -> Vec<CommitSearch> {
    let all = vec![
        CommitSearch::Searched {
            commits: Vec::new(),
        },
        CommitSearch::NoRepository {
            project_root: PathBuf::new(),
        },
        CommitSearch::Unreadable {
            detail: String::new(),
        },
    ];
    for value in &all {
        match value {
            CommitSearch::Searched { .. }
            | CommitSearch::NoRepository { .. }
            | CommitSearch::Unreadable { .. } => {}
        }
    }
    all
}

fn every_git_remote_read() -> Vec<GitRemoteRead> {
    let all = vec![
        GitRemoteRead::Configured {
            name: String::new(),
            url: String::new(),
        },
        GitRemoteRead::RemoteAbsent,
        GitRemoteRead::NoRepository,
        GitRemoteRead::Unreadable {
            detail: String::new(),
        },
    ];
    for value in &all {
        match value {
            GitRemoteRead::Configured { .. }
            | GitRemoteRead::RemoteAbsent
            | GitRemoteRead::NoRepository
            | GitRemoteRead::Unreadable { .. } => {}
        }
    }
    all
}

fn every_relation_outcome() -> Vec<RelationOutcome> {
    let all = vec![
        RelationOutcome::Resolved {
            commit_ids: Vec::new(),
        },
        RelationOutcome::HostUnsupported,
        RelationOutcome::LookupFailed {
            reason: LookupFailure::ToolMissing,
            detail: String::new(),
        },
    ];
    for value in &all {
        match value {
            RelationOutcome::Resolved { .. }
            | RelationOutcome::HostUnsupported
            | RelationOutcome::LookupFailed { .. } => {}
        }
    }
    all
}

fn every_update_outcome() -> Vec<UpdateOutcome> {
    let all = vec![
        UpdateOutcome::Succeeded,
        UpdateOutcome::Failed(UpdateFailure {
            command: String::new(),
            kind: FailureKind::Spawn,
            stderr: String::new(),
            completed_before: 0,
            reload_required: false,
        }),
    ];
    for value in &all {
        match value {
            UpdateOutcome::Succeeded | UpdateOutcome::Failed(_) => {}
        }
    }
    all
}

fn every_failure_kind() -> Vec<FailureKind> {
    let all = vec![
        FailureKind::Spawn,
        FailureKind::NonZero { code: None },
        FailureKind::TimedOut { after_ms: 0 },
        FailureKind::Write,
    ];
    for value in &all {
        match value {
            FailureKind::Spawn
            | FailureKind::NonZero { .. }
            | FailureKind::TimedOut { .. }
            | FailureKind::Write => {}
        }
    }
    all
}

fn every_update_result() -> Vec<UpdateResult> {
    let all = vec![
        UpdateResult::Conflict {
            diverged: Vec::new(),
            unread: Vec::new(),
            project: snapshot(),
        },
        UpdateResult::Ran {
            outcome: UpdateOutcome::Succeeded,
            project: None,
        },
    ];
    for value in &all {
        match value {
            UpdateResult::Conflict { .. } | UpdateResult::Ran { .. } => {}
        }
    }
    all
}

fn every_cli_readiness() -> Vec<CliReadiness> {
    let all = vec![
        CliReadiness::Ready {
            version: String::new(),
        },
        CliReadiness::Unavailable {
            detail: String::new(),
        },
        CliReadiness::Unsupported {
            version: String::new(),
            minimum: String::new(),
        },
    ];
    for value in &all {
        match value {
            CliReadiness::Ready { .. }
            | CliReadiness::Unavailable { .. }
            | CliReadiness::Unsupported { .. } => {}
        }
    }
    all
}

fn every_settings_status() -> Vec<SettingsStatus> {
    let all = vec![
        SettingsStatus::Stored,
        SettingsStatus::Absent,
        SettingsStatus::Unreadable {
            detail: String::new(),
        },
        SettingsStatus::ReadOnly { version: 0 },
    ];
    for value in &all {
        match value {
            SettingsStatus::Stored
            | SettingsStatus::Absent
            | SettingsStatus::Unreadable { .. }
            | SettingsStatus::ReadOnly { .. } => {}
        }
    }
    all
}

fn every_ledger_refusal() -> Vec<LedgerRefusal> {
    let all = vec![
        LedgerRefusal::ReadOnly { schema_version: 0 },
        LedgerRefusal::BacklogRootInvalid {
            path: String::new(),
        },
        LedgerRefusal::InvalidSlug {
            slug: String::new(),
        },
        LedgerRefusal::DuplicateSlug {
            slug: String::new(),
        },
        LedgerRefusal::SlugNotFound {
            slug: String::new(),
        },
        LedgerRefusal::NonAbsoluteRoot {
            path: String::new(),
        },
        LedgerRefusal::DuplicateRoot {
            slug: String::new(),
        },
        LedgerRefusal::InvalidStatusAlias {
            key: String::new(),
            value: String::new(),
        },
    ];
    for value in &all {
        match value {
            LedgerRefusal::ReadOnly { .. }
            | LedgerRefusal::BacklogRootInvalid { .. }
            | LedgerRefusal::InvalidSlug { .. }
            | LedgerRefusal::DuplicateSlug { .. }
            | LedgerRefusal::SlugNotFound { .. }
            | LedgerRefusal::NonAbsoluteRoot { .. }
            | LedgerRefusal::DuplicateRoot { .. }
            | LedgerRefusal::InvalidStatusAlias { .. } => {}
        }
    }
    all
}

fn every_command_error() -> Vec<CommandError> {
    let blank = String::new;
    let all = vec![
        CommandError::Ledger { detail: blank() },
        CommandError::LedgerRefused {
            reason: LedgerRefusal::ReadOnly { schema_version: 0 },
            detail: blank(),
        },
        CommandError::Settings { detail: blank() },
        CommandError::RootUnreadable {
            slug: blank(),
            detail: blank(),
        },
        CommandError::UnknownProject { slug: blank() },
        CommandError::ProjectNotOpen { slug: blank() },
        CommandError::TaskNotFound {
            slug: blank(),
            task_id: blank(),
        },
        CommandError::UpdatesUnavailable {
            readiness: CliReadiness::Ready { version: blank() },
        },
        CommandError::UpdateRejected { detail: blank() },
        CommandError::UncheckableTarget {
            what: blank(),
            detail: blank(),
        },
        CommandError::ReloadFailed {
            detail: blank(),
            applied: None,
        },
        CommandError::VersionProbeFailed { detail: blank() },
        CommandError::WatchFailed {
            slug: blank(),
            detail: blank(),
        },
        CommandError::UnknownTaskFile {
            slug: blank(),
            path: PathBuf::new(),
        },
        CommandError::EditorUnavailable { detail: blank() },
        CommandError::EditorLaunchFailed {
            method: LaunchMethod::Configured,
            program: blank(),
            detail: blank(),
        },
        CommandError::HistoryCancelled { read_id: blank() },
        CommandError::BodyLinkFailed { detail: blank() },
    ];
    for value in &all {
        match value {
            CommandError::Ledger { .. }
            | CommandError::LedgerRefused { .. }
            | CommandError::Settings { .. }
            | CommandError::RootUnreadable { .. }
            | CommandError::UnknownProject { .. }
            | CommandError::ProjectNotOpen { .. }
            | CommandError::TaskNotFound { .. }
            | CommandError::UpdatesUnavailable { .. }
            | CommandError::UpdateRejected { .. }
            | CommandError::UncheckableTarget { .. }
            | CommandError::ReloadFailed { .. }
            | CommandError::VersionProbeFailed { .. }
            | CommandError::WatchFailed { .. }
            | CommandError::UnknownTaskFile { .. }
            | CommandError::EditorUnavailable { .. }
            | CommandError::EditorLaunchFailed { .. }
            | CommandError::HistoryCancelled { .. }
            | CommandError::BodyLinkFailed { .. } => {}
        }
    }
    all
}

#[test]
fn every_union_token_is_recorded() {
    // Keyed by the `wire.ts` type the tokens belong to, so `src/lib/wire-fixture.test.ts` can compare
    // each set with the `unionValues`-locked list for that type. The map's own key set is compared
    // there too, so an enum recorded here with no counterpart on that side is a failure rather than a
    // set nobody reads.
    let mut tokens: BTreeMap<&str, Vec<String>> = BTreeMap::new();

    tokens.insert("StorageState", unit_tokens(&every_storage_state()));
    tokens.insert("StorageSelection", unit_tokens(&every_storage_selection()));
    tokens.insert("StatusColumn", unit_tokens(&every_status_column()));
    tokens.insert(
        "StatusDeclaration",
        unit_tokens(&every_status_declaration()),
    );
    tokens.insert("ReferenceKind", unit_tokens(&every_reference_kind()));
    tokens.insert("RequiredField", unit_tokens(&every_required_field()));
    tokens.insert("ManagedFileKind", unit_tokens(&every_managed_file_kind()));
    tokens.insert("RemoteHostKind", unit_tokens(&every_remote_host_kind()));
    tokens.insert("LookupFailure", unit_tokens(&every_lookup_failure()));
    tokens.insert("LaunchMethod", unit_tokens(&every_launch_method()));
    tokens.insert("EditorSource", unit_tokens(&every_editor_source()));
    tokens.insert("CardDensity", unit_tokens(&every_card_density()));
    tokens.insert("DetailPlacement", unit_tokens(&every_detail_placement()));
    tokens.insert("CardOrder", unit_tokens(&every_card_order()));

    tokens.insert("FileHealth", tag_tokens(&every_file_health(), "state"));
    tokens.insert("DegradeEvent", tag_tokens(&every_degrade_event(), "event"));
    tokens.insert("ProjectLoad", tag_tokens(&every_project_load(), "state"));
    tokens.insert("CommitSearch", tag_tokens(&every_commit_search(), "state"));
    tokens.insert(
        "GitRemoteRead",
        tag_tokens(&every_git_remote_read(), "state"),
    );
    tokens.insert(
        "RelationOutcome",
        tag_tokens(&every_relation_outcome(), "state"),
    );
    tokens.insert("UpdateResult", tag_tokens(&every_update_result(), "state"));
    tokens.insert(
        "UpdateOutcome",
        tag_tokens(&every_update_outcome(), "state"),
    );
    tokens.insert("FailureKind", tag_tokens(&every_failure_kind(), "kind"));
    tokens.insert("CliReadiness", tag_tokens(&every_cli_readiness(), "state"));
    tokens.insert(
        "SettingsStatus",
        tag_tokens(&every_settings_status(), "state"),
    );
    tokens.insert("CommandError", tag_tokens(&every_command_error(), "kind"));
    tokens.insert(
        "LedgerRefusal",
        tag_tokens(&every_ledger_refusal(), "reason"),
    );

    recorded("wire_tokens.json", &tokens);
}
