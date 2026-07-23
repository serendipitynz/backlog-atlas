//! Read layer — turns one Backlog root's management files into a [`ProjectModel`] (doc-4 §2).
//! Read-only by construction: updates go through the Backlog CLI adapter (decision-2), and
//! nothing here writes.
//!
//! Order follows doc-4 §2: resolve `config.yml` first (it is the resolution basepoint), scan
//! the declared directories, parse frontmatter and `SECTION`/`AC` bodies, then attach the two
//! facets that live outside frontmatter — the owning project and the storage state implied by
//! the scan directory (§3.4).
//!
//! Failure handling is the other half of the job (§5). Four events are kept apart:
//!
//! | event | scope | representation |
//! |---|---|---|
//! | 解析不能 | one file | [`DegradeEvent::Unparseable`] on that task |
//! | 想定外スキーマ | one field/section | [`DegradeEvent::UnexpectedSchema`] on that task |
//! | 参照欠損 | one reference | [`DegradeEvent::DanglingReference`] on that task |
//! | ルート読取不能 | the whole root | [`RootError`] returned instead of a model |
//!
//! Only the last aborts a read. Everything else is confined to the one task it came from, so
//! a single broken file never costs the rest of the root.

pub mod parse;
pub mod scan;

use crate::domain::{
    Config, Decision, DegradeEvent, Document, Milestone, ProjectModel, ReferenceKind,
    RequiredField, StorageState, Task, TaskHealth,
};
use scan::{ScanDir, ScanSource};
use serde_yaml_ng::Value;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

/// The `Draft` status a `draft create` writes is a known status even when `config.yml` does
/// not list it, so it must not be read as an unknown value (doc-4 §3.4).
const DRAFT_STATUS: &str = "Draft";

/// Id prefix reserved for drafts, independent of `config.yml`'s `task_prefix` (doc-4 §3.1).
const DRAFT_ID_PREFIX: &str = "DRAFT";

/// Fallback task prefix when `config.yml` omits `task_prefix`. Matches the Backlog CLI's own
/// default (measured on v1.47.1); a missing optional key must not make the root unreadable.
const DEFAULT_TASK_PREFIX: &str = "TASK";

/// ルート読取不能 (doc-4 §5): the root as a whole cannot be read, so no model exists for it.
/// Reported per ledger entry and never mixed into a task's health — one project failing here
/// must not affect the others.
#[derive(Debug)]
pub enum RootError {
    /// `config.yml` is missing or unreadable — the resolution basepoint (doc-4 §3.2).
    ConfigUnreadable { detail: String },
    /// `config.yml` is present but not valid YAML.
    ConfigInvalid { detail: String },
    /// `tasks/` is absent. Every other scanned directory is optional.
    TasksDirMissing,
    /// A scanned directory exists but could not be listed (permissions, I/O).
    DirUnreadable { dir: &'static str, detail: String },
}

impl fmt::Display for RootError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RootError::ConfigUnreadable { detail } => {
                write!(f, "config.yml could not be read: {detail}")
            }
            RootError::ConfigInvalid { detail } => {
                write!(f, "config.yml is not valid YAML: {detail}")
            }
            RootError::TasksDirMissing => write!(f, "the Backlog root has no tasks/ directory"),
            RootError::DirUnreadable { dir, detail } => {
                write!(f, "{dir}/ could not be listed: {detail}")
            }
        }
    }
}

impl std::error::Error for RootError {}

/// Read one Backlog root into a [`ProjectModel`]. `slug` is the ledger slug of the root, which
/// becomes each task's `project` — the owning project comes from the scan root, never from
/// frontmatter (doc-4 §3.1, TASK-4).
pub fn read_project(slug: &str, source: &dyn ScanSource) -> Result<ProjectModel, RootError> {
    let config = read_config(source)?;

    // Milestones and documents are read before tasks because they are the resolution targets
    // for a task's references; without them every reference would look dangling.
    let milestones = read_milestones(source)?;
    let documents = read_documents(source)?;
    let decisions = read_decisions(source)?;
    let mut tasks = read_tasks(source, slug, &config)?;

    resolve_references(
        &mut tasks,
        &milestones,
        &documents,
        &decisions,
        &config,
        source.root_dir_name().as_deref(),
    );

    Ok(ProjectModel {
        slug: slug.to_string(),
        config,
        tasks,
        milestones,
        documents,
        decisions,
    })
}

fn read_config(source: &dyn ScanSource) -> Result<Config, RootError> {
    let text = source
        .read_config()
        .map_err(|e| RootError::ConfigUnreadable {
            detail: e.to_string(),
        })?;
    let value =
        parse::parse_frontmatter(&text).map_err(|detail| RootError::ConfigInvalid { detail })?;

    // An *absent* key is fine — every field below has a usable fallback, and doc-4 §4 makes
    // absence normal. A key that is present in an unsupported shape is not: config.yml is the
    // root's resolution basepoint and has no health channel to carry a partial failure, so
    // falling back silently would hide the gap. `statuses: To Do` is the case that matters —
    // it would yield an empty status set, which switches the unknown-status check off and
    // reports every task healthy while AC #1 never obtained a usable status definition.
    let mut events = Vec::new();
    let config = Config {
        project_name: parse::string_field(&value, "project_name", &mut events),
        task_prefix: parse::string_field(&value, "task_prefix", &mut events)
            .unwrap_or_else(|| DEFAULT_TASK_PREFIX.to_string()),
        statuses: parse::string_list_field(&value, "statuses", &mut events),
        default_status: parse::string_field(&value, "default_status", &mut events),
        date_format: parse::string_field(&value, "date_format", &mut events),
    };
    if !events.is_empty() {
        return Err(RootError::ConfigInvalid {
            detail: describe_events(&events),
        });
    }
    Ok(config)
}

/// Join the `detail` text of schema events into one root-level message.
fn describe_events(events: &[DegradeEvent]) -> String {
    events
        .iter()
        .map(|e| match e {
            DegradeEvent::UnexpectedSchema { detail } => detail.clone(),
            other => format!("{other:?}"),
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// List one scan directory, treating an absent directory as empty. Only `tasks/` is mandatory
/// (doc-4 §5); a root with no `drafts/` or `archive/` is ordinary, not degraded.
fn list_dir(source: &dyn ScanSource, dir: ScanDir) -> Result<Vec<PathBuf>, RootError> {
    match source.list(dir) {
        Ok(paths) => Ok(paths),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if dir == ScanDir::Tasks {
                Err(RootError::TasksDirMissing)
            } else {
                Ok(Vec::new())
            }
        }
        Err(e) => Err(RootError::DirUnreadable {
            dir: dir.rel_path(),
            detail: e.to_string(),
        }),
    }
}

fn read_tasks(
    source: &dyn ScanSource,
    slug: &str,
    config: &Config,
) -> Result<Vec<Task>, RootError> {
    let mut tasks = Vec::new();
    for dir in ScanDir::ALL.into_iter().filter(|d| d.holds_tasks()) {
        for path in list_dir(source, dir)? {
            let task = match source.read(&path) {
                Ok(text) => parse_task(&path, &text, slug, dir, config),
                // A file that cannot be read is 解析不能 for that file alone: it is kept as a
                // degraded task so 縮退表示 can name it, and the scan continues (doc-4 §5).
                Err(e) => unreadable_task(&path, slug, dir, &e.to_string()),
            };
            tasks.push(task);
        }
    }
    Ok(tasks)
}

/// Map one task file to a [`Task`], applying doc-4 §4's three-way schema-capability check:
/// required fields (`id`/`title`/`status`) gate 解析不能, optional fields are absent-is-normal,
/// and structure is checked only where it is present.
fn parse_task(path: &Path, text: &str, slug: &str, dir: ScanDir, config: &Config) -> Task {
    let storage_state = dir.storage_state();
    let mut task = empty_task(path, slug, storage_state);

    if dir == ScanDir::ArchiveRoot {
        // A task-like file outside the five recognized locations: read what we can, but leave
        // the storage state indeterminate rather than guessing one (doc-4 §3.4 last bullet).
        task.health = degraded(vec![DegradeEvent::UnexpectedSchema {
            detail: format!(
                "task file outside the recognized scan locations: {}",
                dir.rel_path()
            ),
        }]);
    }

    let Some((yaml, body)) = parse::split_frontmatter(text) else {
        return with_event(
            task,
            DegradeEvent::Unparseable {
                missing_required: vec![
                    RequiredField::Id,
                    RequiredField::Title,
                    RequiredField::Status,
                ],
                detail: Some("no closing frontmatter fence".to_string()),
            },
        );
    };

    let front = match parse::parse_frontmatter(yaml) {
        Ok(v) => v,
        Err(detail) => {
            return with_event(
                task,
                DegradeEvent::Unparseable {
                    // Which required fields are present is unknowable when the YAML itself does
                    // not parse, so the list stays empty and `detail` carries the reason.
                    missing_required: Vec::new(),
                    detail: Some(detail),
                },
            );
        }
    };

    let mut events = Vec::new();
    let mut missing = Vec::new();
    task.id = required_string(&front, "id", RequiredField::Id, &mut missing, &mut events);
    task.title = required_string(
        &front,
        "title",
        RequiredField::Title,
        &mut missing,
        &mut events,
    );
    task.status = required_string(
        &front,
        "status",
        RequiredField::Status,
        &mut missing,
        &mut events,
    );

    if let Some(id) = &task.id {
        check_task_id(id, dir, config, &mut events);
    }

    let (type_labels, labels) =
        split_labels(parse::string_list_field(&front, "labels", &mut events));
    task.type_labels = type_labels;
    task.labels = labels;
    task.assignee = parse::string_list_field(&front, "assignee", &mut events);
    task.priority = parse::string_field(&front, "priority", &mut events);
    task.ordinal = parse::int_field(&front, "ordinal", &mut events);
    task.milestone = parse::string_field(&front, "milestone", &mut events);
    task.created_date = parse::string_field(&front, "created_date", &mut events);
    task.updated_date = parse::string_field(&front, "updated_date", &mut events);
    task.dependencies = parse::string_list_field(&front, "dependencies", &mut events);
    task.documentation = parse::string_list_field(&front, "documentation", &mut events);
    task.references = parse::string_list_field(&front, "references", &mut events);

    // Unknown frontmatter keys are deliberately not collected and not degraded: doc-4 §4 puts
    // them under 保持または無視, unlike an unknown SECTION which §4 makes a degrade trigger.

    if let Some(status) = &task.status {
        if !is_known_status(status, config) {
            events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("status `{status}` is not declared in config.yml"),
            });
        }
    }

    let body = parse::parse_body(body);
    task.description = body.description;
    task.implementation_plan = body.implementation_plan;
    task.implementation_notes = body.implementation_notes;
    task.unknown_sections = body.unknown_sections;
    task.acceptance_criteria = body.acceptance_criteria;
    for url in body.references {
        if !task.references.contains(&url) {
            task.references.push(url);
        }
    }
    events.extend(body.events);

    if !missing.is_empty() {
        events.insert(
            0,
            DegradeEvent::Unparseable {
                missing_required: missing,
                detail: None,
            },
        );
    }

    task.health = merge_health(task.health, events);
    task
}

/// Check the id against the two shapes doc-4 §3.1/§3.4 allow in this root — `<task_prefix>-N`
/// and `DRAFT-N` — and against the location's expected prefix. An id that contradicts its
/// location means the file and its storage state disagree, and since storage state is decided
/// by location alone (§3.4), the disagreement would otherwise be invisible: a `DRAFT-1` sitting
/// in `tasks/` would enter the active-only default swimlane as an ordinary task (doc-7).
///
/// Prefix matching is case-insensitive. `backlog init --defaults` writes `task_prefix: "task"`
/// while the ids it then generates are `TASK-N` (measured on v1.47.1), so a case-sensitive
/// comparison would degrade every task in a default-initialized root.
fn check_task_id(id: &str, dir: ScanDir, config: &Config, events: &mut Vec<DegradeEvent>) {
    let is_draft = is_prefixed_number(id, DRAFT_ID_PREFIX);
    let is_task = is_prefixed_number(id, &config.task_prefix);
    if !is_draft && !is_task {
        events.push(DegradeEvent::UnexpectedSchema {
            detail: format!(
                "id `{id}` matches neither the configured task prefix `{}` nor `{DRAFT_ID_PREFIX}`",
                config.task_prefix
            ),
        });
        return;
    }
    let Some(expects_draft) = dir.expects_draft_id() else {
        return;
    };
    if is_draft != expects_draft {
        events.push(DegradeEvent::UnexpectedSchema {
            detail: format!(
                "id `{id}` does not match the id prefix `{}/` holds",
                dir.rel_path()
            ),
        });
    }
}

/// True when `s` is `<prefix>-N` with one or more digits, compared case-insensitively.
fn is_prefixed_number(s: &str, prefix: &str) -> bool {
    let Some(rest) = s.get(..prefix.len()) else {
        return false;
    };
    if !rest.eq_ignore_ascii_case(prefix) {
        return false;
    }
    let Some(digits) = s[prefix.len()..].strip_prefix('-') else {
        return false;
    };
    !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
}

/// A status is known when `config.yml` declares it, plus `Draft` (doc-4 §3.4). An empty
/// `statuses` list disables the check entirely: with no declared set there is nothing to
/// contradict, and flagging every task would degrade a whole root over a config omission.
fn is_known_status(status: &str, config: &Config) -> bool {
    config.statuses.is_empty()
        || status == DRAFT_STATUS
        || config.statuses.iter().any(|s| s == status)
}

/// Split `labels` into the kind-derived Type slot and normal labels — the separation doc-4
/// §3.3 fixes at this boundary. The Type *value* rule is TASK-29's; here the raw text after
/// `kind:` is carried as a candidate and simply kept out of `labels`.
fn split_labels(labels: Vec<String>) -> (Vec<String>, Vec<String>) {
    let mut kinds = Vec::new();
    let mut normal = Vec::new();
    for label in labels {
        match label.strip_prefix("kind:") {
            Some(kind) => kinds.push(kind.trim().to_string()),
            None => normal.push(label),
        }
    }
    (kinds, normal)
}

/// Read a required identity field. An absent field *and* a present-but-blank one both count as
/// missing: a blank `id` cannot take part in id cross-reference any more than no `id` can.
fn required_string(
    front: &Value,
    key: &str,
    field: RequiredField,
    missing: &mut Vec<RequiredField>,
    events: &mut Vec<DegradeEvent>,
) -> Option<String> {
    match parse::string_field(front, key, events) {
        Some(s) if !s.trim().is_empty() => Some(s),
        _ => {
            missing.push(field);
            None
        }
    }
}

fn read_milestones(source: &dyn ScanSource) -> Result<Vec<Milestone>, RootError> {
    let mut out = Vec::new();
    for path in list_dir(source, ScanDir::Milestones)? {
        let Ok(text) = source.read(&path) else {
            continue;
        };
        let Some((front, body)) = identity(&text) else {
            continue;
        };
        let (id, title) = front;
        out.push(Milestone {
            id,
            title,
            description: section_or_heading(&body, "Description"),
        });
    }
    Ok(out)
}

fn read_documents(source: &dyn ScanSource) -> Result<Vec<Document>, RootError> {
    let mut out = Vec::new();
    for path in list_dir(source, ScanDir::Docs)? {
        let Ok(text) = source.read(&path) else {
            continue;
        };
        let Some((yaml, body)) = parse::split_frontmatter(&text) else {
            continue;
        };
        let Ok(front) = parse::parse_frontmatter(yaml) else {
            continue;
        };
        let mut ignored = Vec::new();
        let (Some(id), Some(title)) = (
            parse::string_field(&front, "id", &mut ignored),
            parse::string_field(&front, "title", &mut ignored),
        ) else {
            continue;
        };
        out.push(Document {
            id,
            title,
            doc_type: parse::string_field(&front, "type", &mut ignored),
            tags: parse::string_list_field(&front, "tags", &mut ignored),
            created_date: parse::string_field(&front, "created_date", &mut ignored),
            updated_date: parse::string_field(&front, "updated_date", &mut ignored),
            body: non_empty(body),
        });
    }
    Ok(out)
}

fn read_decisions(source: &dyn ScanSource) -> Result<Vec<Decision>, RootError> {
    let mut out = Vec::new();
    for path in list_dir(source, ScanDir::Decisions)? {
        let Ok(text) = source.read(&path) else {
            continue;
        };
        let Some((yaml, body)) = parse::split_frontmatter(&text) else {
            continue;
        };
        let Ok(front) = parse::parse_frontmatter(yaml) else {
            continue;
        };
        let mut ignored = Vec::new();
        let (Some(id), Some(title)) = (
            parse::string_field(&front, "id", &mut ignored),
            parse::string_field(&front, "title", &mut ignored),
        ) else {
            continue;
        };
        out.push(Decision {
            id,
            title,
            status: parse::string_field(&front, "status", &mut ignored),
            date: parse::string_field(&front, "date", &mut ignored),
            body: non_empty(body),
        });
    }
    Ok(out)
}

/// `(id, title)` plus the body, for the non-task files whose only required fields are those
/// two. A file missing either is skipped rather than degraded: milestones and documents have
/// no per-file health in the model (doc-4 §5 scopes degradation to tasks), and skipping makes
/// the omission visible where it matters — as a 参照欠損 on whichever task referenced it.
fn identity(text: &str) -> Option<((String, String), String)> {
    let (yaml, body) = parse::split_frontmatter(text)?;
    let front = parse::parse_frontmatter(yaml).ok()?;
    let mut ignored = Vec::new();
    let id = parse::string_field(&front, "id", &mut ignored)?;
    let title = parse::string_field(&front, "title", &mut ignored)?;
    Some(((id, title), body.to_string()))
}

/// A milestone's Description is written as a plain `## Description` heading, not a SECTION
/// pair (measured on v1.47.1), so accept either.
fn section_or_heading(body: &str, heading: &str) -> Option<String> {
    let parsed = parse::parse_body(body);
    if parsed.description.is_some() {
        return parsed.description;
    }
    let mut collected: Vec<&str> = Vec::new();
    let mut inside = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(name) = trimmed.strip_prefix("##") {
            if inside {
                break;
            }
            inside = name.trim().eq_ignore_ascii_case(heading);
            continue;
        }
        if inside {
            collected.push(line);
        }
    }
    non_empty(&collected.join("\n"))
}

fn non_empty(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Attach 参照欠損 events for milestone, documentation and reference targets absent from the
/// root (doc-4 §5).
///
/// `references` is only partly decidable here, so only the decidable part is judged. Its values
/// mix in-root ids (`doc-3`), in-root file paths (`backlog/docs/doc-2 - Title.md`), paths
/// outside the Backlog root (`README.md`) and URLs. A value that normalizes to one of the
/// root's id shapes is resolved and flagged when missing; anything else is left alone, because
/// "absent from the root" is not a question the read layer can answer for it — the root is all
/// it can see (the scan-source boundary gives no access outside it), and Pull Request URLs
/// among them are TASK-30's input.
fn resolve_references(
    tasks: &mut [Task],
    milestones: &[Milestone],
    documents: &[Document],
    decisions: &[Decision],
    config: &Config,
    root_dir_name: Option<&str>,
) {
    let task_ids: Vec<String> = tasks.iter().filter_map(|t| t.id.clone()).collect();
    for task in tasks.iter_mut() {
        let mut events = Vec::new();
        if let Some(id) = &task.milestone {
            if !milestones.iter().any(|m| &m.id == id) {
                events.push(DegradeEvent::DanglingReference {
                    kind: ReferenceKind::Milestone,
                    target: id.clone(),
                });
            }
        }
        for raw in &task.documentation {
            let id = normalize_document_ref(raw);
            if !documents.iter().any(|d| d.id == id) {
                events.push(DegradeEvent::DanglingReference {
                    kind: ReferenceKind::Documentation,
                    target: raw.clone(),
                });
            }
        }
        for raw in &task.references {
            if reference_resolves(
                raw,
                milestones,
                documents,
                decisions,
                &task_ids,
                config,
                root_dir_name,
            ) == Some(false)
            {
                events.push(DegradeEvent::DanglingReference {
                    kind: ReferenceKind::Reference,
                    target: raw.clone(),
                });
            }
        }
        task.health = merge_health(std::mem::replace(&mut task.health, TaskHealth::Ok), events);
    }
}

/// Whether a `references` value points at something in this root: `Some(true)` resolved,
/// `Some(false)` an id shape this root does not contain, `None` not decidable here (a URL, or
/// a path that names no in-root id). Only `Some(false)` is a 参照欠損.
fn reference_resolves(
    raw: &str,
    milestones: &[Milestone],
    documents: &[Document],
    decisions: &[Decision],
    task_ids: &[String],
    config: &Config,
    root_dir_name: Option<&str>,
) -> Option<bool> {
    let id = in_root_reference_id(raw, root_dir_name)?;
    if is_prefixed_number(&id, "doc") {
        return Some(documents.iter().any(|d| d.id == id));
    }
    if is_prefixed_number(&id, "decision") {
        return Some(decisions.iter().any(|d| d.id == id));
    }
    if is_prefixed_number(&id, "m") {
        return Some(milestones.iter().any(|m| m.id == id));
    }
    if is_prefixed_number(&id, &config.task_prefix) || is_prefixed_number(&id, DRAFT_ID_PREFIX) {
        return Some(task_ids.iter().any(|t| t.eq_ignore_ascii_case(&id)));
    }
    None
}

/// The in-root id a `references` value names, or `None` when the value points outside the root
/// and is therefore not this layer's to judge.
///
/// The path shape has to be classified *before* the basename is normalized. Normalizing first
/// throws the directory away, which would turn an existing external file like
/// `/Users/someone/notes/doc-404.md` into the id `doc-404` and report it missing from a root
/// that was never supposed to contain it.
///
/// The directory part is matched against the root's own directory layout in full, not just by
/// its last segment: `docs/…` and `<root>/docs/…` are managed paths, while `vendor/docs/…` and
/// `../docs/…` name files somewhere else that merely end in a similarly named directory.
fn in_root_reference_id(raw: &str, root_dir_name: Option<&str>) -> Option<String> {
    let raw = raw.trim();
    // A URL, or an absolute path, names something outside the root by construction. Managed
    // files are always referenced root- or repo-relative.
    if raw.contains("://") || raw.starts_with('/') || raw.starts_with('\\') || has_drive_prefix(raw)
    {
        return None;
    }
    let Some((dir, name)) = raw.rsplit_once(['/', '\\']) else {
        // Bare form (`doc-3`, `README.md`): no directory to contradict the root. A name that is
        // not id-shaped is filtered out by the caller's shape checks.
        return Some(normalize_document_ref(raw));
    };
    let dir = dir.replace('\\', "/");
    let managed = ScanDir::ALL.iter().any(|d| {
        dir == d.rel_path()
            || root_dir_name.is_some_and(|root| dir == format!("{root}/{}", d.rel_path()))
    });
    managed.then(|| normalize_document_ref(name))
}

/// `C:\…` / `C:/…` — a Windows absolute path.
fn has_drive_prefix(raw: &str) -> bool {
    let mut chars = raw.chars();
    matches!((chars.next(), chars.next(), chars.next()),
        (Some(c), Some(':'), Some('/' | '\\')) if c.is_ascii_alphabetic())
}

/// `documentation` holds either a bare id (`doc-3`) or the managed file's path
/// (`backlog/docs/doc-2 - Title.md`) — both shapes occur in real roots. Reduce to the id so a
/// path-form reference is not misread as a missing document.
fn normalize_document_ref(raw: &str) -> String {
    let name = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let stem = name.strip_suffix(".md").unwrap_or(name);
    stem.split_once(" - ")
        .map_or(stem, |(id, _)| id)
        .trim()
        .to_string()
}

fn empty_task(path: &Path, slug: &str, storage_state: Option<StorageState>) -> Task {
    Task {
        source_path: path.to_path_buf(),
        project: slug.to_string(),
        storage_state,
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
        health: TaskHealth::Ok,
    }
}

fn unreadable_task(path: &Path, slug: &str, dir: ScanDir, detail: &str) -> Task {
    let task = empty_task(path, slug, dir.storage_state());
    with_event(
        task,
        DegradeEvent::Unparseable {
            missing_required: Vec::new(),
            detail: Some(format!("file could not be read: {detail}")),
        },
    )
}

fn with_event(mut task: Task, event: DegradeEvent) -> Task {
    task.health = merge_health(task.health, vec![event]);
    task
}

fn degraded(events: Vec<DegradeEvent>) -> TaskHealth {
    TaskHealth::Degraded { events }
}

/// Fold new events into an existing health value, keeping `Ok` only when nothing degraded.
fn merge_health(health: TaskHealth, mut events: Vec<DegradeEvent>) -> TaskHealth {
    let mut all = match health {
        TaskHealth::Ok => Vec::new(),
        TaskHealth::Degraded { events } => events,
    };
    all.append(&mut events);
    if all.is_empty() {
        TaskHealth::Ok
    } else {
        degraded(all)
    }
}

#[cfg(test)]
mod tests {
    use super::scan::WorkingTree;
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicU64, Ordering};

    const CONFIG: &str = "project_name: \"Test\"\n\
default_status: \"To Do\"\n\
statuses: [\"To Do\", \"In Progress\", \"Done\"]\n\
task_prefix: \"TASK\"\n\
date_format: yyyy-mm-dd\n";

    /// An in-memory [`ScanSource`]. Its existence is the standing evidence for AC #6: every
    /// test below drives the read layer without a filesystem, which is only possible because
    /// "where the bytes come from" is confined to the scan-source boundary. A branch-backed
    /// source (cross-branch, decision-3) plugs in the same way.
    #[derive(Default)]
    struct MemorySource {
        config: Option<String>,
        dirs: BTreeMap<&'static str, Vec<(PathBuf, String)>>,
    }

    impl MemorySource {
        /// A root with a config and an empty `tasks/` — the minimum that is not ルート読取不能.
        fn new() -> Self {
            let mut source = MemorySource {
                config: Some(CONFIG.to_string()),
                dirs: BTreeMap::new(),
            };
            source.dirs.insert(ScanDir::Tasks.rel_path(), Vec::new());
            source
        }

        fn file(mut self, dir: ScanDir, name: &str, text: &str) -> Self {
            self.dirs
                .entry(dir.rel_path())
                .or_default()
                .push((PathBuf::from(dir.rel_path()).join(name), text.to_string()));
            self
        }
    }

    impl ScanSource for MemorySource {
        fn read_config(&self) -> io::Result<String> {
            self.config
                .clone()
                .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "config.yml"))
        }

        fn list(&self, dir: ScanDir) -> io::Result<Vec<PathBuf>> {
            match self.dirs.get(dir.rel_path()) {
                Some(files) => Ok(files.iter().map(|(p, _)| p.clone()).collect()),
                None => Err(io::Error::new(io::ErrorKind::NotFound, dir.rel_path())),
            }
        }

        fn read(&self, path: &Path) -> io::Result<String> {
            self.dirs
                .values()
                .flatten()
                .find(|(p, _)| p == path)
                .map(|(_, text)| text.clone())
                .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no such file"))
        }

        // Mirrors a real root, whose directory is conventionally `<project>/backlog` — that is
        // the name the repo-relative reference form (`backlog/docs/doc-2 - …`) carries.
        fn root_dir_name(&self) -> Option<String> {
            Some("backlog".to_string())
        }
    }

    /// A task file as Backlog v1.47.1 writes one.
    fn task_file(id: &str, status: &str) -> String {
        format!(
            "---\n\
id: {id}\n\
title: Task {id}\n\
status: {status}\n\
assignee: []\n\
created_date: '2026-07-22 12:06'\n\
labels: []\n\
dependencies: []\n\
ordinal: 1000\n\
---\n\n"
        )
    }

    fn read(source: &MemorySource) -> ProjectModel {
        read_project("atlas", source).expect("root should be readable")
    }

    fn only_task(model: &ProjectModel) -> &Task {
        assert_eq!(model.tasks.len(), 1, "expected exactly one task");
        &model.tasks[0]
    }

    fn events(task: &Task) -> &[DegradeEvent] {
        match &task.health {
            TaskHealth::Degraded { events } => events,
            TaskHealth::Ok => &[],
        }
    }

    // --- AC #1: config.yml is resolved first ------------------------------------------------

    #[test]
    fn config_is_resolved_into_status_set_and_prefix() {
        let model = read(&MemorySource::new());
        assert_eq!(model.config.task_prefix, "TASK");
        assert_eq!(model.config.project_name.as_deref(), Some("Test"));
        assert_eq!(model.config.default_status.as_deref(), Some("To Do"));
        assert_eq!(model.config.statuses, ["To Do", "In Progress", "Done"]);
        assert_eq!(model.config.date_format.as_deref(), Some("yyyy-mm-dd"));
    }

    #[test]
    fn config_status_set_is_what_decides_an_unknown_status() {
        // "In Review" is absent from this root's config, so it is 想定外スキーマ — proof the
        // status check reads the resolved config rather than a hard-coded set.
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            &task_file("TASK-1", "In Review"),
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.status.as_deref(), Some("In Review"));
        assert!(matches!(
            events(task),
            [DegradeEvent::UnexpectedSchema { .. }]
        ));
    }

    #[test]
    fn draft_status_is_known_even_when_config_omits_it() {
        // doc-4 §3.4: `Draft` is not in `statuses` but is a legitimate draft status.
        let source = MemorySource::new().file(
            ScanDir::Drafts,
            "draft-1 - d.md",
            &task_file("DRAFT-1", "Draft"),
        );
        let model = read(&source);
        let draft = model.task("DRAFT-1").unwrap();
        assert!(!draft.health.is_degraded());
        assert_eq!(draft.storage_state, Some(StorageState::Draft));
    }

    #[test]
    fn missing_task_prefix_falls_back_instead_of_failing_the_root() {
        let mut source = MemorySource::new();
        source.config = Some("project_name: Test\n".to_string());
        let model = read(&source);
        assert_eq!(model.config.task_prefix, DEFAULT_TASK_PREFIX);
    }

    #[test]
    fn an_empty_status_set_disables_the_status_check() {
        // With nothing declared there is nothing to contradict; flagging every task would
        // degrade a whole root over one config omission (AC #4).
        let mut source = MemorySource::new();
        source.config = Some("project_name: Test\n".to_string());
        let source = source.file(
            ScanDir::Tasks,
            "task-1 - a.md",
            &task_file("TASK-1", "Whatever"),
        );
        let model = read(&source);
        assert!(!only_task(&model).health.is_degraded());
    }

    // --- AC #2: every declared directory is scanned, archive through its nesting -------------

    #[test]
    fn scans_all_task_locations_with_their_storage_state() {
        let source = MemorySource::new()
            .file(
                ScanDir::Tasks,
                "task-1 - a.md",
                &task_file("TASK-1", "To Do"),
            )
            .file(
                ScanDir::Drafts,
                "draft-1 - b.md",
                &task_file("DRAFT-1", "Draft"),
            )
            .file(
                ScanDir::Completed,
                "task-2 - c.md",
                &task_file("TASK-2", "Done"),
            )
            .file(
                ScanDir::ArchiveTasks,
                "task-3 - d.md",
                &task_file("TASK-3", "Done"),
            )
            .file(
                ScanDir::ArchiveDrafts,
                "draft-2 - e.md",
                &task_file("DRAFT-2", "To Do"),
            );

        let model = read(&source);
        assert_eq!(model.tasks.len(), 5);
        let state = |id: &str| model.task(id).unwrap().storage_state;
        assert_eq!(state("TASK-1"), Some(StorageState::Active));
        assert_eq!(state("DRAFT-1"), Some(StorageState::Draft));
        assert_eq!(state("TASK-2"), Some(StorageState::Completed));
        // archive/ is walked through tasks/ and drafts/, not flattened (doc-4 §3.4).
        assert_eq!(state("TASK-3"), Some(StorageState::Archive));
        assert_eq!(state("DRAFT-2"), Some(StorageState::Archive));
    }

    #[test]
    fn milestones_docs_and_decisions_are_scanned() {
        let source = MemorySource::new()
            .file(
                ScanDir::Milestones,
                "m-1 - impl.md",
                "---\nid: m-1\ntitle: \"impl\"\n---\n\n## Description\n\nphase two\n",
            )
            .file(
                ScanDir::Docs,
                "doc-4 - design.md",
                "---\nid: doc-4\ntitle: design\ntype: specification\ntags: [read]\n---\nbody text\n",
            )
            .file(
                ScanDir::Decisions,
                "decision-3 - branch.md",
                "---\nid: decision-3\ntitle: current checkout only\nstatus: accepted\ndate: '2026-07-21'\n---\n## Context\n",
            );

        let model = read(&source);
        assert_eq!(model.milestone("m-1").unwrap().title, "impl");
        assert_eq!(
            model.milestone("m-1").unwrap().description.as_deref(),
            Some("phase two")
        );
        let doc = model.document("doc-4").unwrap();
        assert_eq!(doc.doc_type.as_deref(), Some("specification"));
        assert_eq!(doc.tags, ["read"]);
        let decision = model.decision("decision-3").unwrap();
        assert_eq!(decision.status.as_deref(), Some("accepted"));
        // A decision must not answer a documentation lookup (doc-4 §3.2).
        assert!(model.document("decision-3").is_none());
    }

    #[test]
    fn absent_optional_directories_are_not_root_failures() {
        // MemorySource::new() declares only tasks/; nothing else exists.
        let model = read(&MemorySource::new());
        assert!(model.tasks.is_empty());
        assert!(model.milestones.is_empty());
        assert!(model.documents.is_empty());
        assert!(model.decisions.is_empty());
    }

    #[test]
    fn a_task_outside_the_recognized_locations_keeps_an_indeterminate_storage_state() {
        // A flat archive/*.md — not produced by v1.47.1, but reads must not depend on the
        // generating version (doc-4 §4), and guessing a storage state would leak the file into
        // the active-only default swimlane (§3.4 last bullet).
        let source = MemorySource::new().file(
            ScanDir::ArchiveRoot,
            "task-9 - old.md",
            &task_file("TASK-9", "Done"),
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.storage_state, None);
        assert!(task.health.is_degraded());
        // Everything discernible is still read (doc-4 §5).
        assert_eq!(task.id.as_deref(), Some("TASK-9"));
    }

    // --- AC #3: frontmatter + SECTION/AC parsing ---------------------------------------------

    #[test]
    fn parses_frontmatter_and_section_bodies() {
        let text = "---\n\
id: TASK-28\n\
title: read layer\n\
status: In Progress\n\
assignee: [takkyun]\n\
labels:\n  - 'kind:feature'\n  - ui\n\
dependencies: [TASK-27]\n\
documentation:\n  - doc-4\n\
references:\n  - https://example.test/pull/9\n\
milestone: m-1\n\
priority: high\n\
ordinal: 28000\n\
created_date: '2026-07-22 12:06'\n\
updated_date: '2026-07-22 12:25'\n\
---\n\n\
<!-- SECTION:DESCRIPTION:BEGIN -->\nthe description\n<!-- SECTION:DESCRIPTION:END -->\n\n\
<!-- AC:BEGIN -->\n- [x] #1 done item\n- [ ] #2 open item\n<!-- AC:END -->\n\n\
<!-- SECTION:PLAN:BEGIN -->\nthe plan\n<!-- SECTION:PLAN:END -->\n";
        let source = MemorySource::new()
            .file(ScanDir::Tasks, "task-28 - read.md", text)
            .file(
                ScanDir::Milestones,
                "m-1 - impl.md",
                "---\nid: m-1\ntitle: impl\n---\n",
            )
            .file(
                ScanDir::Docs,
                "doc-4 - design.md",
                "---\nid: doc-4\ntitle: design\n---\n",
            );

        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.id.as_deref(), Some("TASK-28"));
        assert_eq!(task.title.as_deref(), Some("read layer"));
        assert_eq!(task.status.as_deref(), Some("In Progress"));
        assert_eq!(task.assignee, ["takkyun"]);
        assert_eq!(task.priority.as_deref(), Some("high"));
        assert_eq!(task.ordinal, Some(28000));
        assert_eq!(task.milestone.as_deref(), Some("m-1"));
        assert_eq!(task.dependencies, ["TASK-27"]);
        assert_eq!(task.documentation, ["doc-4"]);
        assert_eq!(task.references, ["https://example.test/pull/9"]);
        assert_eq!(task.created_date.as_deref(), Some("2026-07-22 12:06"));
        assert_eq!(task.description.as_deref(), Some("the description"));
        assert_eq!(task.implementation_plan.as_deref(), Some("the plan"));
        assert!(task.implementation_notes.is_none());
        assert_eq!(task.acceptance_criteria.len(), 2);
        assert!(task.acceptance_criteria[0].checked);
        assert_eq!(task.acceptance_criteria[1].text, "open item");
        assert!(!task.health.is_degraded());
    }

    #[test]
    fn kind_labels_are_split_from_normal_labels() {
        let text =
            "---\nid: TASK-1\ntitle: t\nstatus: To Do\nlabels:\n  - 'kind:feature'\n  - ui\n---\n";
        let source = MemorySource::new().file(ScanDir::Tasks, "task-1 - a.md", text);
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.type_labels, ["feature"]);
        assert_eq!(task.labels, ["ui"]);
    }

    #[test]
    fn storage_state_is_taken_from_the_directory_not_the_status() {
        // A Done task still sitting in tasks/ is active (doc-4 §3.4).
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            &task_file("TASK-1", "Done"),
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.status.as_deref(), Some("Done"));
        assert_eq!(task.storage_state, Some(StorageState::Active));
    }

    // --- AC #4: three-way schema-capability check --------------------------------------------

    #[test]
    fn absent_optional_fields_do_not_degrade_a_task() {
        // Only the three required fields; no labels, milestone, priority, AC, PLAN or NOTES.
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: TASK-1\ntitle: minimal\nstatus: To Do\n---\n",
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.health, TaskHealth::Ok);
        assert!(task.acceptance_criteria.is_empty());
        assert!(task.implementation_plan.is_none());
        assert!(task.milestone.is_none());
    }

    #[test]
    fn a_missing_required_field_makes_the_task_unparseable() {
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\ntitle: no id here\n---\n",
        );
        let model = read(&source);
        let task = only_task(&model);
        assert!(task.id.is_none());
        assert_eq!(task.title.as_deref(), Some("no id here"));
        match events(task) {
            [DegradeEvent::Unparseable {
                missing_required, ..
            }] => assert_eq!(
                missing_required,
                &[RequiredField::Id, RequiredField::Status]
            ),
            other => panic!("expected one Unparseable event, got {other:?}"),
        }
        // The file is kept, and its path still names it for 縮退表示.
        assert!(task.source_path.ends_with("task-1 - a.md"));
    }

    #[test]
    fn a_blank_required_field_counts_as_missing() {
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: '  '\ntitle: t\nstatus: To Do\n---\n",
        );
        let model = read(&source);
        assert!(only_task(&model).id.is_none());
        assert!(model.task("TASK-1").is_none());
    }

    #[test]
    fn an_out_of_range_optional_field_degrades_only_itself() {
        // labels is a scalar rather than a list; id/title/status must still be read (doc-4 §5).
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: TASK-1\ntitle: t\nstatus: To Do\nlabels: ui\n---\n",
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.id.as_deref(), Some("TASK-1"));
        assert_eq!(task.status.as_deref(), Some("To Do"));
        assert!(task.labels.is_empty());
        assert!(matches!(
            events(task),
            [DegradeEvent::UnexpectedSchema { .. }]
        ));
    }

    #[test]
    fn a_broken_structure_degrades_while_the_rest_of_the_task_is_kept() {
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: TASK-1\ntitle: t\nstatus: To Do\n---\n\
<!-- SECTION:DESCRIPTION:BEGIN -->\nkept\n<!-- SECTION:DESCRIPTION:END -->\n\
<!-- AC:BEGIN -->\n- [ ] #1 fine\n",
        );
        let model = read(&source);
        let task = only_task(&model);
        assert_eq!(task.description.as_deref(), Some("kept"));
        assert!(matches!(
            events(task),
            [DegradeEvent::UnexpectedSchema { .. }]
        ));
    }

    // --- AC #5: the four events stay apart, and stay confined ---------------------------------

    #[test]
    fn invalid_yaml_is_unparseable_with_a_reason_and_no_field_list() {
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: TASK-1\n  bad: indent\n\t- tab\n---\n",
        );
        let model = read(&source);
        match events(only_task(&model)) {
            [DegradeEvent::Unparseable {
                missing_required,
                detail,
            }] => {
                // Which required fields exist is unknowable when the YAML itself does not parse.
                assert!(missing_required.is_empty());
                assert!(detail.is_some());
            }
            other => panic!("expected Unparseable, got {other:?}"),
        }
    }

    #[test]
    fn a_file_without_frontmatter_is_unparseable() {
        let source = MemorySource::new().file(ScanDir::Tasks, "notes.md", "just prose\n");
        let model = read(&source);
        assert!(matches!(
            events(only_task(&model)),
            [DegradeEvent::Unparseable { .. }]
        ));
    }

    #[test]
    fn dangling_milestone_and_document_references_are_marked() {
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nmilestone: m-9\ndocumentation:\n  - doc-4\n  - doc-404\n---\n";
        let source = MemorySource::new()
            .file(ScanDir::Tasks, "task-1 - a.md", text)
            .file(
                ScanDir::Docs,
                "doc-4 - design.md",
                "---\nid: doc-4\ntitle: design\n---\n",
            );
        let model = read(&source);
        let task = only_task(&model);
        // The task body is intact; only the references are flagged (doc-4 §5).
        assert_eq!(task.title.as_deref(), Some("t"));
        let targets: Vec<_> = events(task)
            .iter()
            .map(|e| match e {
                DegradeEvent::DanglingReference { kind, target } => (*kind, target.clone()),
                other => panic!("expected a dangling reference, got {other:?}"),
            })
            .collect();
        assert_eq!(
            targets,
            vec![
                (ReferenceKind::Milestone, "m-9".to_string()),
                (ReferenceKind::Documentation, "doc-404".to_string()),
            ]
        );
    }

    #[test]
    fn a_path_form_documentation_reference_resolves_to_its_id() {
        // Real roots hold both `doc-3` and `backlog/docs/doc-2 - Title.md` in `documentation`.
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\ndocumentation:\n  - backlog/docs/doc-2 - Backlog-Atlas-guide.md\n---\n";
        let source = MemorySource::new()
            .file(ScanDir::Tasks, "task-1 - a.md", text)
            .file(
                ScanDir::Docs,
                "doc-2 - guide.md",
                "---\nid: doc-2\ntitle: guide\n---\n",
            );
        let model = read(&source);
        assert!(!only_task(&model).health.is_degraded());
    }

    #[test]
    fn one_bad_file_degrades_one_task_and_no_other() {
        let source = MemorySource::new()
            .file(
                ScanDir::Tasks,
                "task-1 - good.md",
                &task_file("TASK-1", "To Do"),
            )
            .file(ScanDir::Tasks, "task-2 - broken.md", "---\nnot: a task\n")
            .file(
                ScanDir::Tasks,
                "task-3 - good.md",
                &task_file("TASK-3", "Done"),
            );

        let model = read(&source);
        assert_eq!(model.tasks.len(), 3);
        assert!(!model.task("TASK-1").unwrap().health.is_degraded());
        assert!(!model.task("TASK-3").unwrap().health.is_degraded());
        let broken: Vec<_> = model
            .tasks
            .iter()
            .filter(|t| t.health.is_degraded())
            .collect();
        assert_eq!(broken.len(), 1);
        assert!(broken[0].source_path.ends_with("task-2 - broken.md"));
    }

    #[test]
    fn a_missing_config_is_a_root_failure_not_a_task_failure() {
        let mut source = MemorySource::new();
        source.config = None;
        assert!(matches!(
            read_project("atlas", &source),
            Err(RootError::ConfigUnreadable { .. })
        ));
    }

    #[test]
    fn an_invalid_config_is_a_root_failure() {
        let mut source = MemorySource::new();
        source.config = Some("statuses: [unterminated\n".to_string());
        assert!(matches!(
            read_project("atlas", &source),
            Err(RootError::ConfigInvalid { .. })
        ));
    }

    // --- review round 1: [P2] config structural errors must not be swallowed -----------------

    #[test]
    fn a_wrong_shaped_config_field_is_a_root_failure() {
        // `statuses: To Do` would otherwise yield an empty status set, switch the unknown-status
        // check off, and report every task healthy while AC #1 never got a status definition.
        let mut source = MemorySource::new();
        source.config = Some("project_name: Test\nstatuses: To Do\n".to_string());
        match read_project("atlas", &source) {
            Err(RootError::ConfigInvalid { detail }) => assert!(detail.contains("statuses")),
            other => panic!("expected ConfigInvalid, got {other:?}"),
        }
    }

    #[test]
    fn an_absent_config_key_is_still_a_normal_fallback() {
        // Absence stays normal (doc-4 §4); only a present-but-wrong shape fails the root.
        let mut source = MemorySource::new();
        source.config = Some("project_name: Test\n".to_string());
        let model = read(&source);
        assert_eq!(model.config.task_prefix, DEFAULT_TASK_PREFIX);
        assert!(model.config.statuses.is_empty());
    }

    // --- review round 1: [P2] task id must agree with prefix and location --------------------

    #[test]
    fn an_id_matching_no_known_prefix_degrades() {
        let source = MemorySource::new().file(
            ScanDir::Tasks,
            "task-1 - a.md",
            "---\nid: THING-1\ntitle: t\nstatus: To Do\n---\n",
        );
        let model = read(&source);
        let task = only_task(&model);
        // Everything discernible is still read; only the id shape is flagged.
        assert_eq!(task.id.as_deref(), Some("THING-1"));
        assert!(matches!(
            events(task),
            [DegradeEvent::UnexpectedSchema { .. }]
        ));
    }

    #[test]
    fn an_id_contradicting_its_location_degrades() {
        // Storage state is decided by location alone (doc-4 §3.4), so without this check a
        // DRAFT sitting in tasks/ would enter the active-only default swimlane silently.
        let source = MemorySource::new()
            .file(
                ScanDir::Tasks,
                "task-1 - a.md",
                &task_file("DRAFT-1", "To Do"),
            )
            .file(
                ScanDir::Drafts,
                "draft-2 - b.md",
                &task_file("TASK-2", "Draft"),
            );
        let model = read(&source);
        for id in ["DRAFT-1", "TASK-2"] {
            let task = model.task(id).unwrap();
            assert!(
                matches!(events(task), [DegradeEvent::UnexpectedSchema { .. }]),
                "{id} should be flagged, got {:?}",
                task.health
            );
        }
    }

    #[test]
    fn the_task_prefix_is_matched_case_insensitively() {
        // `backlog init --defaults` writes task_prefix: "task" while generating TASK-N ids
        // (measured on v1.47.1); a case-sensitive check would degrade every task in such a root.
        let mut source = MemorySource::new();
        source.config = Some("statuses: [\"To Do\"]\ntask_prefix: \"task\"\n".to_string());
        let source = source.file(
            ScanDir::Tasks,
            "task-1 - a.md",
            &task_file("TASK-1", "To Do"),
        );
        let model = read(&source);
        assert!(!only_task(&model).health.is_degraded());
    }

    #[test]
    fn an_archive_root_task_is_not_judged_against_a_location_prefix() {
        // Its storage state is already indeterminate, so there is no location to contradict —
        // it must not collect a second, misleading event.
        let source = MemorySource::new().file(
            ScanDir::ArchiveRoot,
            "draft-9 - old.md",
            &task_file("DRAFT-9", "To Do"),
        );
        let model = read(&source);
        assert_eq!(events(only_task(&model)).len(), 1);
    }

    // --- review round 1: [P2] references resolution where it is decidable ---------------------

    #[test]
    fn a_reference_naming_an_absent_in_root_id_is_marked() {
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nreferences:\n  - doc-404\n  - backlog/decisions/decision-9 - gone.md\n---\n";
        let source = MemorySource::new().file(ScanDir::Tasks, "task-1 - a.md", text);
        let model = read(&source);
        let targets: Vec<_> = events(only_task(&model))
            .iter()
            .map(|e| match e {
                DegradeEvent::DanglingReference {
                    kind: ReferenceKind::Reference,
                    target,
                } => target.clone(),
                other => panic!("expected a reference dangling event, got {other:?}"),
            })
            .collect();
        assert_eq!(
            targets,
            vec![
                "doc-404".to_string(),
                "backlog/decisions/decision-9 - gone.md".to_string()
            ]
        );
    }

    #[test]
    fn a_reference_resolving_inside_the_root_is_not_marked() {
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nreferences:\n  - doc-4\n  - decision-3\n  - m-1\n  - TASK-2\n---\n";
        let source = MemorySource::new()
            .file(ScanDir::Tasks, "task-1 - a.md", text)
            .file(
                ScanDir::Tasks,
                "task-2 - b.md",
                &task_file("TASK-2", "Done"),
            )
            .file(
                ScanDir::Docs,
                "doc-4 - d.md",
                "---\nid: doc-4\ntitle: d\n---\n",
            )
            .file(
                ScanDir::Decisions,
                "decision-3 - d.md",
                "---\nid: decision-3\ntitle: d\n---\n",
            )
            .file(
                ScanDir::Milestones,
                "m-1 - m.md",
                "---\nid: m-1\ntitle: m\n---\n",
            );
        let model = read(&source);
        assert!(!model.task("TASK-1").unwrap().health.is_degraded());
    }

    #[test]
    fn an_undecidable_reference_is_left_alone() {
        // A URL and a path outside the Backlog root name things the read layer cannot see; the
        // scan-source boundary gives it no access there, so it must not claim they are missing.
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nreferences:\n  - https://example.test/pull/9\n  - README.md\n  - /Users/someone/projects/thing\n---\n";
        let source = MemorySource::new().file(ScanDir::Tasks, "task-1 - a.md", text);
        let model = read(&source);
        assert!(!only_task(&model).health.is_degraded());
    }

    // Review round 2 [P2]: an out-of-root path whose basename happens to be id-shaped must stay
    // undecidable. Normalizing before classifying threw the directory away and reported an
    // existing external file as missing from a root that never held it.
    #[test]
    fn an_id_shaped_path_outside_the_root_stays_undecidable() {
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nreferences:\n  - /Users/someone/notes/doc-404.md\n  - ../elsewhere/decision-404.md\n  - notes/m-404.md\n  - ../docs/doc-404.md\n  - vendor/docs/doc-404.md\n  - ../backlog/docs/doc-404.md\n---\n";
        let source = MemorySource::new().file(ScanDir::Tasks, "task-1 - a.md", text);
        let model = read(&source);
        assert!(
            !only_task(&model).health.is_degraded(),
            "external paths must not be reported missing: {:?}",
            only_task(&model).health
        );
    }

    #[test]
    fn a_managed_path_is_still_decidable() {
        // The in-root shape must keep working — this is the case the round-1 fix was for.
        let text = "---\nid: TASK-1\ntitle: t\nstatus: To Do\nreferences:\n  - backlog/docs/doc-404 - gone.md\n---\n";
        let source = MemorySource::new().file(ScanDir::Tasks, "task-1 - a.md", text);
        let model = read(&source);
        assert!(matches!(
            events(only_task(&model)),
            [DegradeEvent::DanglingReference {
                kind: ReferenceKind::Reference,
                ..
            }]
        ));
    }

    #[test]
    fn a_missing_tasks_directory_is_a_root_failure() {
        let mut source = MemorySource::new();
        source.dirs.remove(ScanDir::Tasks.rel_path());
        assert!(matches!(
            read_project("atlas", &source),
            Err(RootError::TasksDirMissing)
        ));
    }

    // --- AC #6: the scan source is the only thing that knows where files live ------------------

    /// Minimal self-cleaning temp directory so tests need no `tempfile` dependency.
    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new() -> Self {
            static CTR: AtomicU64 = AtomicU64::new(0);
            let n = CTR.fetch_add(1, Ordering::Relaxed);
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "atlas-read-test-{}-{nanos}-{n}",
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

    #[test]
    fn the_same_content_reads_identically_through_either_scan_source() {
        let files = [
            (
                ScanDir::Tasks,
                "task-1 - a.md",
                task_file("TASK-1", "To Do"),
            ),
            (
                ScanDir::Drafts,
                "draft-1 - b.md",
                task_file("DRAFT-1", "Draft"),
            ),
            (
                ScanDir::ArchiveTasks,
                "task-2 - c.md",
                task_file("TASK-2", "Done"),
            ),
        ];

        let mut memory = MemorySource::new();
        let temp = TempDir::new();
        temp.write("config.yml", CONFIG);
        std::fs::create_dir_all(temp.path.join("tasks")).unwrap();
        for (dir, name, text) in &files {
            memory = memory.file(*dir, name, text);
            temp.write(&format!("{}/{name}", dir.rel_path()), text);
        }

        let from_memory = read_project("atlas", &memory).unwrap();
        let from_disk = read_project("atlas", &WorkingTree::new(&temp.path)).unwrap();

        assert_eq!(from_memory.config, from_disk.config);
        // Everything except the source path — which is the one thing a scan source may differ
        // on — must match, including scan order and storage state.
        let facts = |m: &ProjectModel| -> Vec<(Option<String>, Option<StorageState>, TaskHealth)> {
            m.tasks
                .iter()
                .map(|t| (t.id.clone(), t.storage_state, t.health.clone()))
                .collect()
        };
        assert_eq!(facts(&from_memory), facts(&from_disk));
        assert_eq!(from_disk.tasks.len(), 3);
    }

    #[test]
    fn the_working_tree_source_reads_a_real_root() {
        let temp = TempDir::new();
        temp.write("config.yml", CONFIG);
        temp.write("tasks/task-1 - a.md", &task_file("TASK-1", "To Do"));
        temp.write("archive/tasks/task-2 - b.md", &task_file("TASK-2", "Done"));
        temp.write(
            "docs/doc-1 - d.md",
            "---\nid: doc-1\ntitle: d\ntype: other\n---\n",
        );
        // A stray non-Markdown file and a nested directory must not become tasks.
        temp.write("tasks/README.txt", "ignore me");

        let model = read_project("atlas", &WorkingTree::new(&temp.path)).unwrap();
        assert_eq!(model.tasks.len(), 2);
        assert_eq!(
            model.task("TASK-2").unwrap().storage_state,
            Some(StorageState::Archive)
        );
        assert!(model.tasks[0].source_path.is_absolute());
        assert_eq!(model.document("doc-1").unwrap().title, "d");
    }

    #[test]
    fn a_missing_tasks_directory_on_disk_is_a_root_failure() {
        let temp = TempDir::new();
        temp.write("config.yml", CONFIG);
        assert!(matches!(
            read_project("atlas", &WorkingTree::new(&temp.path)),
            Err(RootError::TasksDirMissing)
        ));
    }
}
