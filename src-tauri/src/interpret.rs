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

pub mod status;
pub mod type_value;

use crate::domain::{Config, Task};
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
        // The task's `type` slot already holds the text after `kind:` (split at the read
        // boundary); this only classifies it against 既知 Type 集合.
        types: derive_types(&task.type_labels),
    }
}

#[cfg(test)]
mod tests {
    use super::status::{StatusColumn, StatusDeclaration};
    use super::*;
    use crate::domain::{DegradeEvent, RequiredField, StorageState, TaskHealth};
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

    fn task(status: Option<&str>, type_labels: &[&str], labels: &[&str]) -> Task {
        Task {
            source_path: PathBuf::from("tasks/task-1.md"),
            project: "atlas".into(),
            storage_state: Some(StorageState::Active),
            id: Some("TASK-1".into()),
            title: Some("a title".into()),
            status: status.map(Into::into),
            type_labels: type_labels.iter().map(|s| (*s).to_string()).collect(),
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
            unknown_sections: vec![],
            health: TaskHealth::Ok,
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

    // A 解析不能 task has no status to map; it must not be handed a column by default.
    #[test]
    fn task_without_status_has_no_mapping() {
        let mut t = task(None, &[], &[]);
        t.id = None;
        t.health = TaskHealth::Degraded {
            events: vec![DegradeEvent::Unparseable {
                missing_required: vec![RequiredField::Status],
                detail: None,
            }],
        };
        let interpreted = interpret_task(&t, &config(), &BTreeMap::new());
        assert!(interpreted.status.is_none());
        assert!(interpreted.types.is_unset());
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
        // does not rescue a status absent from config.yml (that stays 未対応).
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
