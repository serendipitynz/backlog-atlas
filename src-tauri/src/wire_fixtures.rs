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
    ProjectSnapshot, TaskHistory, TaskView, UpdateResult,
};
use crate::domain::{
    AcceptanceCriterion, Config, Decision, DegradeEvent, Document, Milestone, ReferenceKind,
    RequiredField, StorageState, Task, TaskHealth, UnknownSection,
};
use crate::editor::{
    ConfiguredEditor, EditorCommand, EditorLaunch, EditorReadiness, EditorSource, LaunchMethod,
};
use crate::history::{Commit, PrRelation, RelationOutcome, RemoteHost, RemoteHostKind};
use crate::interpret::status::{StatusColumn, StatusDeclaration, StatusMapping};
use crate::interpret::type_value::derive_types;
use crate::ledger::{Ledger, ProjectEntry};
use crate::settings::{
    AppSettings, CardDensity, DetailPlacement, LoadedSettings, SettingsStatus, StorageSelection,
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
        type_labels: vec!["feature".to_string()],
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
        health: TaskHealth::Degraded {
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
        type_labels: Vec::new(),
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
        health: TaskHealth::Degraded {
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
        }],
        decisions: vec![Decision {
            id: "decision-12".to_string(),
            title: "Colour tokens".to_string(),
            status: Some("accepted".to_string()),
            date: Some("2026-07-10".to_string()),
            body: Some("The tokens.".to_string()),
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
                partial: true,
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
                    minimum: "1.47.0".to_string(),
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
fn loaded_settings_is_recorded() {
    recorded(
        "loaded_settings.json",
        &LoadedSettings {
            settings: AppSettings {
                schema_version: 1,
                theme: Some("nord".to_string()),
                card_density: CardDensity::L,
                default_storage_filter: vec![
                    StorageSelection::Active,
                    StorageSelection::Indeterminate,
                ],
                default_detail_placement: DetailPlacement::Modal,
                watch_external_changes: false,
                external_editor: Some(EditorCommand {
                    program: "code".to_string(),
                    args: vec!["-w".to_string()],
                }),
            },
            status: SettingsStatus::ReadOnly { version: 2 },
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
fn cli_readiness_is_recorded() {
    recorded(
        "cli_readiness.json",
        &CliReadiness::Ready {
            version: "1.47.1".to_string(),
        },
    );
}
