//! Interpretation layer — Atlas's own reading of a task's status and Type, laid over the read
//! layer's faithful mirror of the Markdown (decision-4, decision-5).
//!
//! Kept out of [`crate::read`] on purpose. The read layer answers "what does the file say" and
//! knows nothing about the ledger; 列対応規則 needs the ledger entry's 別名表, and the whole
//! point of putting that table in Atlas's ledger is that the target Markdown is never rewritten
//! to suit Atlas (doc-2 boundary). Interpretation is therefore a pure function of
//! (task, config, aliases) computed alongside the model, not a mutation of it — the same root
//! read once can be interpreted differently after the user edits an alias, with no re-read.
//!
//! The one part that does live in the read layer is splitting `labels` into kind and normal
//! labels, because doc-4 §3.3 fixes that separation at the read boundary. The *rule* still lives
//! here ([`type_value::split_labels`]); `read` calls it so there is a single definition.
//!
//! Pull Request URL extraction is here for the mirror-image reason. Its rule is doc-6 §4's and
//! stays defined once, in [`crate::history`]; what this layer fixes is *when* it is applied —
//! alongside every task read, because its only input is that task's References. Deriving it here
//! rather than inside the Git・PR history command is what lets doc-8 §4's PR ↔ References
//! separation hold for a task the commit search cannot even key on: a 解析不能 file has no
//! TASK-ID (doc-4 §5), but its References are still read, and doc-4 §5 keeps every field it could
//! discern.

pub mod status;
pub mod type_value;

use crate::domain::{Config, Task};
use crate::history::{extract_pull_requests, PullRequestRef};
use serde::Serialize;
use status::{map_status, StatusMapping};
use std::collections::BTreeMap;
use type_value::{derive_types, TypeValues};

/// One task's interpreted facets, alongside (never inside) the task itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInterpretation {
    /// `None` when the task carries no status at all — a 解析不能 file (doc-4 §5). There is
    /// nothing to map, and defaulting it to a column would drop a broken file into a real lane
    /// as though it were healthy.
    pub status: Option<StatusMapping>,
    /// Zero or more Type values (decision-5).
    pub types: TypeValues,
    /// The task's References that are Pull Request URLs (doc-6 §4). A view of `task.references`,
    /// never a rewrite of it (doc-8 §4): the screen shows these in their own 区画 and the
    /// remaining references in theirs, while the 正本 keeps one list.
    pub pull_requests: Vec<PullRequestRef>,
}

/// Interpret one task against its project's `config.yml` and ledger 別名表.
pub fn interpret_task(
    task: &Task,
    config: &Config,
    aliases: &BTreeMap<String, String>,
) -> TaskInterpretation {
    TaskInterpretation {
        status: task
            .status
            .as_deref()
            .map(|raw| map_status(raw, config, aliases)),
        // The task's `type` slot already holds the Type 候補 both 導出元 gave, in order (collected
        // at the read boundary); this classifies them against 既知 Type 集合 and folds 同値の重複.
        types: derive_types(&task.type_candidates),
        pull_requests: extract_pull_requests(&task.references),
    }
}

#[cfg(test)]
mod tests {
    use super::status::{StatusColumn, StatusDeclaration};
    use super::*;
    use crate::domain::{DegradeEvent, FileHealth, RequiredField, StorageState};
    use std::path::PathBuf;

    fn config() -> Config {
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
            date_format: None,
        }
    }

    fn task(status: Option<&str>, type_candidates: &[&str], labels: &[&str]) -> Task {
        Task {
            source_path: PathBuf::from("tasks/task-1.md"),
            project: "atlas".into(),
            storage_state: Some(StorageState::Active),
            id: Some("TASK-1".into()),
            title: Some("a title".into()),
            status: status.map(Into::into),
            type_candidates: type_candidates.iter().map(|s| (*s).to_string()).collect(),
            labels: labels.iter().map(|s| (*s).to_string()).collect(),
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
            final_summary: None,
            definition_of_done: vec![],
            comments: vec![],
            unknown_sections: vec![],
            health: FileHealth::Ok,
        }
    }

    // AC #1 / AC #4 / AC #5: a healthy task gets a column, its Type values, and normal labels
    // that stay free of kind labels.
    #[test]
    fn interprets_status_and_type_together() {
        let t = task(Some("In Progress"), &["feature"], &["ui"]);
        let interpreted = interpret_task(&t, &config(), &BTreeMap::new());
        let status = interpreted.status.unwrap();
        assert_eq!(status.column, Some(StatusColumn::InProgress));
        assert_eq!(status.declaration, StatusDeclaration::Declared);
        assert_eq!(interpreted.types.values()[0].value, "feature");
        assert!(!t.labels.iter().any(|l| l.starts_with("kind:")));
    }

    // decision-20: the interpretation is what the screen reads, so the two 導出元 have already
    // merged here and 同値の重複 is gone — the model's own slot still holds both (read.rs).
    #[test]
    fn the_interpretation_merges_both_type_origins_and_folds_repeats() {
        // As the read layer builds the slot: kind labels first, then the `type` field.
        let t = task(Some("In Progress"), &["research", "chore", "Research"], &[]);
        let interpreted = interpret_task(&t, &config(), &BTreeMap::new());
        assert_eq!(
            interpreted
                .types
                .values()
                .iter()
                .map(|v| &v.value)
                .collect::<Vec<_>>(),
            ["research", "chore"]
        );
        // `chore` is 既知 only because decision-20 widened the set to the CLI's vocabulary.
        assert!(!interpreted.types.has_unknown());
    }

    // A 解析不能 task has no status to map; it must not be handed a column by default.
    #[test]
    fn task_without_status_has_no_mapping() {
        let mut t = task(None, &[], &[]);
        t.id = None;
        t.health = FileHealth::Degraded {
            events: vec![DegradeEvent::Unparseable {
                missing_required: vec![RequiredField::Status],
                detail: None,
            }],
        };
        let interpreted = interpret_task(&t, &config(), &BTreeMap::new());
        assert!(interpreted.status.is_none());
        assert!(interpreted.types.is_unset());
    }

    // doc-8 §4 separates Pull Request URLs from References for *every* task, and doc-4 §5 keeps
    // whatever a degraded file could still be read for. A task with no TASK-ID cannot be keyed for
    // コミット検索 (doc-6 §3), but its References are read — so the separation still has to hold.
    #[test]
    fn a_task_without_an_id_still_has_its_pull_requests_separated() {
        let mut t = task(None, &[], &[]);
        t.id = None;
        t.references = vec![
            "https://github.com/serendipitynz/backlog-atlas/pull/11".into(),
            "https://example.com/spec".into(),
        ];
        let interpreted = interpret_task(&t, &config(), &BTreeMap::new());
        assert_eq!(interpreted.pull_requests.len(), 1);
        assert_eq!(interpreted.pull_requests[0].number, Some(11));
    }

    // AC #2: a draft keeps `Draft` as a known status through the whole interpretation.
    #[test]
    fn draft_task_is_not_degraded_by_interpretation() {
        let mut t = task(Some("Draft"), &[], &[]);
        t.id = Some("DRAFT-1".into());
        t.storage_state = Some(StorageState::Draft);
        let status = interpret_task(&t, &config(), &BTreeMap::new())
            .status
            .unwrap();
        assert_eq!(status.declaration, StatusDeclaration::Draft);
        assert!(!status.is_undeclared());
    }

    #[test]
    fn serializes_with_camel_case_names() {
        let t = task(Some("Doing"), &["feature"], &[]);
        // `Doing` must be a declared project-specific status for its alias to apply — an alias
        // does not rescue a status absent from config.yml (that stays 未分類).
        let mut config = config();
        config.statuses.push("Doing".into());
        let aliases: BTreeMap<String, String> =
            [("Doing".to_string(), "In Progress".to_string())].into();
        let json = serde_json::to_value(interpret_task(&t, &config, &aliases)).unwrap();
        assert_eq!(json["status"]["column"], "inProgress");
        assert_eq!(json["status"]["raw"], "Doing");
        assert_eq!(json["types"][0]["value"], "feature");
    }
}
