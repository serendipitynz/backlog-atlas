//! Project ledger (projects.toml) — read/write and register/remove/update.
//!
//! Implements doc-3 "プロジェクト台帳と横断タスクID 設計". The ledger is Atlas's own
//! configuration, not the task source of truth: it lives in the OS app-config dir and
//! Atlas reads/writes it directly. That is outside the decision-2 boundary (Backlog
//! management files are parsed directly, updates delegate to the Backlog CLI), because
//! the ledger is not a Backlog.md file — so no target project's Backlog root, management
//! files, or Git repository are ever touched by any operation here.
//!
//! This module is deliberately Tauri-independent so it can be unit-tested without a
//! running app; the command layer in `lib.rs` resolves the on-disk ledger path via
//! `app_config_dir()` and calls into here.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::path::{Path, PathBuf};

/// The only schema version this build reads/writes. A file at exactly this version is
/// writable; an unknown *higher* version is degraded to read-only so we never overwrite
/// and destroy a newer format we do not understand (doc-3 §2.2, AC #1).
pub const KNOWN_SCHEMA_VERSION: u32 = 1;

/// Canonical status columns (decision-4). Fixed set; `status_aliases` values must be one
/// of these (doc-3 §3.3, AC #5).
pub const CANONICAL_STATUSES: [&str; 4] = ["To Do", "In Progress", "In Review", "Done"];

/// Right-hand-side prefix reserved for drafts in a cross-task-id (doc-3 §5.1).
const DRAFT_PREFIX: &str = "DRAFT";

/// The whole ledger file. `projects` order is the default display order (doc-3 §2.2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ledger {
    pub schema_version: u32,
    // Renamed to `project` so the TOML uses `[[project]]` array-of-tables (doc-3 §2.2).
    #[serde(default, rename = "project")]
    pub projects: Vec<ProjectEntry>,
}

/// One registered project (doc-3 §3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectEntry {
    /// project slug — unique in the ledger, immutable after registration (doc-3 §3.1).
    pub slug: String,
    /// Absolute project root; base for Git/PR resolution and Backlog-root defaulting.
    pub project_root: PathBuf,
    /// Absolute Backlog root; default `project_root/backlog`, explicit when it differs.
    pub backlog_root: PathBuf,
    /// Whether the project root's Git repo has at least one configured remote (doc-3 §3.2).
    pub git_remote_present: bool,
    // status_aliases must be the LAST field: TOML forbids a sub-table appearing before a
    // scalar key within the same `[[project]]` element, and this map serializes as the
    // `[project.status_aliases]` sub-table. Skipped when empty so aliasless entries stay
    // terse (doc-3 §3.3 "既定は空").
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub status_aliases: BTreeMap<String, String>,
}

/// A ledger loaded from disk, plus whether it must be treated as read-only because its
/// `schema_version` is an unknown higher version (AC #1).
#[derive(Debug, Clone)]
pub struct LoadedLedger {
    pub ledger: Ledger,
    pub read_only: bool,
}

/// Input for [`Ledger::register`] (doc-3 §4.1). Deserializable so the Tauri command can
/// take it straight from the frontend.
#[derive(Debug, Clone, Deserialize)]
pub struct RegisterRequest {
    /// Project root the user selected.
    pub project_root: PathBuf,
    /// Explicit Backlog root; when absent, defaults to `project_root/backlog`.
    #[serde(default)]
    pub backlog_root: Option<PathBuf>,
    /// Explicit slug; when absent, derived from the project-root directory name.
    #[serde(default)]
    pub slug: Option<String>,
}

/// Input for [`Ledger::update`] (doc-3 §4.3). `slug` only selects the entry — it is never
/// changed here, which is how "slug は不変" (AC #4) is enforced structurally.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRequest {
    /// Selects the entry to update. Immutable identity.
    pub slug: String,
    /// New project root. Present means a move: both roots are updated (doc-3 §4.3, AC #6).
    #[serde(default)]
    pub project_root: Option<PathBuf>,
    /// New Backlog root. On a move with this absent, defaults to `<new project_root>/backlog`.
    #[serde(default)]
    pub backlog_root: Option<PathBuf>,
    /// Re-run Git remote detection against the (possibly moved) project root.
    #[serde(default)]
    pub redetect_git_remote: bool,
    /// Replacement status-alias table. Every value must be a canonical status (AC #5).
    #[serde(default)]
    pub status_aliases: Option<BTreeMap<String, String>>,
    /// New position in the display order (doc-3 §4.3 "表示上の並び順").
    #[serde(default)]
    pub new_index: Option<usize>,
}

/// A parsed cross-task-id (doc-3 §5): a slug plus a project-internal task id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ParsedTaskRef {
    pub slug: String,
    pub task_id: String,
}

/// Errors surfaced by ledger operations. `Display` gives a user-facing reason; the Tauri
/// command layer maps these to strings.
#[derive(Debug)]
pub enum LedgerError {
    Io(std::io::Error),
    TomlDe(toml::de::Error),
    TomlSer(toml::ser::Error),
    /// schema_version is neither the known version nor a higher one we can read-only shim.
    UnsupportedSchemaVersion(u32),
    /// Save refused: the ledger was loaded read-only from an unknown higher version.
    ReadOnly(u32),
    /// Backlog root missing config.yml or tasks/ (doc-3 §4.1 step 2).
    BacklogRootInvalid(String),
    InvalidSlug(String),
    DuplicateSlug(String),
    SlugNotFound(String),
    /// A project_root/backlog_root is not absolute (doc-3 §3: roots are absolute paths).
    NonAbsoluteRoot(String),
    /// A project_root/backlog_root is already assigned to another entry — the ledger keeps
    /// one entry per project root (doc-3 §3, §6). Carries the conflicting entry's slug.
    DuplicateRoot(String),
    /// A status_aliases value is not one of the canonical columns (AC #5).
    InvalidStatusAlias {
        key: String,
        value: String,
    },
    /// Cross-task-id left side is not a registered slug (doc-3 §5.2).
    UnknownProject(String),
    /// Cross-task-id right side is not `<prefix>-N` nor `DRAFT-N` (doc-3 §5.2).
    InvalidTaskId(String),
    /// A bare id was given with no single-project context to attach it to (doc-3 §5.2/§5.3).
    BareIdNeedsContext,
}

impl fmt::Display for LedgerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LedgerError::Io(e) => write!(f, "ledger I/O error: {e}"),
            LedgerError::TomlDe(e) => write!(f, "ledger parse error: {e}"),
            LedgerError::TomlSer(e) => write!(f, "ledger serialize error: {e}"),
            LedgerError::UnsupportedSchemaVersion(v) => {
                write!(f, "unsupported ledger schema_version: {v}")
            }
            LedgerError::ReadOnly(v) => write!(
                f,
                "ledger is read-only: schema_version {v} is newer than this build supports \
                 (known {KNOWN_SCHEMA_VERSION}); refusing to overwrite"
            ),
            LedgerError::BacklogRootInvalid(p) => {
                write!(f, "not a readable Backlog root (need config.yml and tasks/): {p}")
            }
            LedgerError::InvalidSlug(s) => {
                write!(f, "invalid slug {s:?}: must match [a-z0-9][a-z0-9-]* (no ':' or spaces)")
            }
            LedgerError::DuplicateSlug(s) => write!(f, "slug already registered: {s:?}"),
            LedgerError::SlugNotFound(s) => write!(f, "no ledger entry with slug: {s:?}"),
            LedgerError::NonAbsoluteRoot(p) => write!(f, "root path must be absolute: {p}"),
            LedgerError::DuplicateRoot(s) => {
                write!(f, "this project/Backlog root is already registered to slug {s:?}")
            }
            LedgerError::InvalidStatusAlias { key, value } => write!(
                f,
                "invalid status alias {key:?} -> {value:?}: value must be one of {CANONICAL_STATUSES:?}"
            ),
            LedgerError::UnknownProject(s) => write!(f, "cross-task-id references unknown project: {s:?}"),
            LedgerError::InvalidTaskId(s) => write!(f, "invalid task id: {s:?}"),
            LedgerError::BareIdNeedsContext => {
                write!(f, "a bare task id is only allowed inside a single-project context")
            }
        }
    }
}

impl std::error::Error for LedgerError {}

impl From<std::io::Error> for LedgerError {
    fn from(e: std::io::Error) -> Self {
        LedgerError::Io(e)
    }
}
impl From<toml::de::Error> for LedgerError {
    fn from(e: toml::de::Error) -> Self {
        LedgerError::TomlDe(e)
    }
}
impl From<toml::ser::Error> for LedgerError {
    fn from(e: toml::ser::Error) -> Self {
        LedgerError::TomlSer(e)
    }
}

impl Ledger {
    /// An empty, writable ledger at the current schema version (first-run state).
    fn empty() -> Self {
        Ledger {
            schema_version: KNOWN_SCHEMA_VERSION,
            projects: Vec::new(),
        }
    }

    /// Register a project (doc-3 §4.1). Resolves the Backlog root, verifies it, derives or
    /// validates the slug and checks uniqueness, detects the Git remote, then appends.
    /// Touches nothing under the target project.
    pub fn register(&mut self, req: &RegisterRequest) -> Result<ProjectEntry, LedgerError> {
        // Step 2: resolve + verify the Backlog root.
        let backlog_root = req
            .backlog_root
            .clone()
            .unwrap_or_else(|| req.project_root.join("backlog"));
        require_absolute(&req.project_root)?;
        require_absolute(&backlog_root)?;
        verify_backlog_root(&backlog_root)?;

        // One entry per project root (doc-3 §3, §6): reject a root already mapped elsewhere,
        // otherwise the same task source would be read twice under two slugs.
        if let Some(conflict) = self.find_root_conflict(&req.project_root, &backlog_root, None) {
            return Err(LedgerError::DuplicateRoot(conflict));
        }

        // Steps 3 + slug contract (§3.1, AC #8): derive or take the user slug, validate shape,
        // then enforce ledger uniqueness.
        let slug = match &req.slug {
            Some(s) => {
                if !is_valid_slug(s) {
                    return Err(LedgerError::InvalidSlug(s.clone()));
                }
                s.clone()
            }
            None => derive_slug(&req.project_root)
                .ok_or_else(|| LedgerError::InvalidSlug(display_dir_name(&req.project_root)))?,
        };
        if self.projects.iter().any(|p| p.slug == slug) {
            return Err(LedgerError::DuplicateSlug(slug));
        }

        // Step 4: Git remote detection (§3.2).
        let git_remote_present = detect_git_remote(&req.project_root);

        // Step 5: append. status_aliases default empty (§3.3).
        let entry = ProjectEntry {
            slug,
            project_root: req.project_root.clone(),
            backlog_root,
            git_remote_present,
            status_aliases: BTreeMap::new(),
        };
        self.projects.push(entry.clone());
        Ok(entry)
    }

    /// Remove an entry by slug (doc-3 §4.2, AC #3). Ledger-only: the target project's
    /// Backlog root, management files, and Git repo are never touched.
    pub fn remove(&mut self, slug: &str) -> Result<ProjectEntry, LedgerError> {
        let idx = self
            .projects
            .iter()
            .position(|p| p.slug == slug)
            .ok_or_else(|| LedgerError::SlugNotFound(slug.to_string()))?;
        Ok(self.projects.remove(idx))
    }

    /// Update an entry (doc-3 §4.3, AC #4/#5/#6). slug is the immutable selector. Validates
    /// everything before mutating so a rejected request leaves the ledger unchanged.
    pub fn update(&mut self, req: &UpdateRequest) -> Result<ProjectEntry, LedgerError> {
        let idx = self
            .projects
            .iter()
            .position(|p| p.slug == req.slug)
            .ok_or_else(|| LedgerError::SlugNotFound(req.slug.clone()))?;

        // Validate status aliases first (AC #5) — fail before touching state.
        if let Some(aliases) = &req.status_aliases {
            for (k, v) in aliases {
                if !is_canonical_status(v) {
                    return Err(LedgerError::InvalidStatusAlias {
                        key: k.clone(),
                        value: v.clone(),
                    });
                }
            }
        }

        // Resolve the new Backlog root. A move (project_root present) updates both roots
        // (§4.3, AC #6); without an explicit backlog_root it defaults under the new root.
        let new_backlog_root = match (&req.project_root, &req.backlog_root) {
            (Some(pr), None) => Some(pr.join("backlog")),
            (_, Some(br)) => Some(br.clone()),
            (None, None) => None,
        };
        if let Some(pr) = &req.project_root {
            require_absolute(pr)?;
        }
        if let Some(br) = &new_backlog_root {
            require_absolute(br)?;
            verify_backlog_root(br)?;
        }

        // Re-check the one-entry-per-root invariant against the effective new roots, skipping
        // this same entry (doc-3 §3, §6). A move must not collide with another project.
        let effective_project_root = req
            .project_root
            .clone()
            .unwrap_or_else(|| self.projects[idx].project_root.clone());
        let effective_backlog_root = new_backlog_root
            .clone()
            .unwrap_or_else(|| self.projects[idx].backlog_root.clone());
        if let Some(conflict) = self.find_root_conflict(
            &effective_project_root,
            &effective_backlog_root,
            Some(&req.slug),
        ) {
            return Err(LedgerError::DuplicateRoot(conflict));
        }

        // Apply (all inputs already validated).
        {
            let entry = &mut self.projects[idx];
            if let Some(pr) = &req.project_root {
                entry.project_root = pr.clone();
            }
            if let Some(br) = new_backlog_root {
                entry.backlog_root = br;
            }
            if let Some(aliases) = &req.status_aliases {
                entry.status_aliases = aliases.clone();
            }
            if req.redetect_git_remote {
                entry.git_remote_present = detect_git_remote(&entry.project_root);
            }
        }

        // Reorder in the display list if requested (§4.3).
        if let Some(new_index) = req.new_index {
            let entry = self.projects.remove(idx);
            let target = new_index.min(self.projects.len());
            self.projects.insert(target, entry);
        }

        let final_idx = self
            .projects
            .iter()
            .position(|p| p.slug == req.slug)
            .expect("entry present after update");
        Ok(self.projects[final_idx].clone())
    }

    /// Parse a cross-task-id (doc-3 §5.2, AC #7). Splits on the FIRST `:`; the left side
    /// must be a registered slug and the right side must be `<task_prefix>-N` or `DRAFT-N`.
    /// A colon-free input is a bare id, allowed only when `context_slug` supplies the single
    /// project in context. `task_prefix` is the expected prefix for the referenced project
    /// (the caller resolves it from that project's config.yml).
    pub fn parse_cross_task_id(
        &self,
        input: &str,
        task_prefix: &str,
        context_slug: Option<&str>,
    ) -> Result<ParsedTaskRef, LedgerError> {
        match input.split_once(':') {
            Some((left, right)) => {
                // slug side is colon-free by construction, so the first-colon split is unique.
                if !self.projects.iter().any(|p| p.slug == left) {
                    return Err(LedgerError::UnknownProject(left.to_string()));
                }
                if !is_task_id(right, task_prefix) {
                    return Err(LedgerError::InvalidTaskId(right.to_string()));
                }
                Ok(ParsedTaskRef {
                    slug: left.to_string(),
                    task_id: right.to_string(),
                })
            }
            None => {
                let slug = context_slug.ok_or(LedgerError::BareIdNeedsContext)?;
                if !self.projects.iter().any(|p| p.slug == slug) {
                    return Err(LedgerError::UnknownProject(slug.to_string()));
                }
                if !is_task_id(input, task_prefix) {
                    return Err(LedgerError::InvalidTaskId(input.to_string()));
                }
                Ok(ParsedTaskRef {
                    slug: slug.to_string(),
                    task_id: input.to_string(),
                })
            }
        }
    }

    /// Build a cross-task-id `<slug>:<task_id>` for display (doc-3 §5.1). Validates the slug
    /// against the ledger and the id against `task_prefix`/`DRAFT` so the generate/parse pair
    /// round-trips: the generator can only produce ids the parser accepts (AC #7). This is why
    /// generation is a fallible ledger method, not a free string join — the public Tauri
    /// command feeds it arbitrary input.
    pub fn generate_cross_task_id(
        &self,
        slug: &str,
        task_id: &str,
        task_prefix: &str,
    ) -> Result<String, LedgerError> {
        if !self.projects.iter().any(|p| p.slug == slug) {
            return Err(LedgerError::UnknownProject(slug.to_string()));
        }
        if !is_task_id(task_id, task_prefix) {
            return Err(LedgerError::InvalidTaskId(task_id.to_string()));
        }
        Ok(format!("{slug}:{task_id}"))
    }

    /// Enforce the ledger's semantic contracts after deserialization (doc-3 §3). `toml`
    /// only checks Rust field shapes, so a hand-edited file could carry duplicate/invalid
    /// slugs, relative or duplicated roots, or non-canonical status aliases. Invalid alias
    /// values are dropped (the documented §3.3 "ignore" handling — the status then falls to
    /// the unmatched column); structural violations are hard errors so we never operate on,
    /// or re-save, an inconsistent ledger.
    pub fn validate_and_sanitize(&mut self) -> Result<(), LedgerError> {
        // Sanitize: drop alias values that are not canonical columns (doc-3 §3.3).
        for p in &mut self.projects {
            p.status_aliases.retain(|_, v| is_canonical_status(v));
        }
        // Structural invariants: slug shape + uniqueness, absolute + unique roots.
        let mut seen_slugs: Vec<&str> = Vec::new();
        let mut seen_roots: Vec<PathBuf> = Vec::new();
        for p in &self.projects {
            if !is_valid_slug(&p.slug) {
                return Err(LedgerError::InvalidSlug(p.slug.clone()));
            }
            if seen_slugs.contains(&p.slug.as_str()) {
                return Err(LedgerError::DuplicateSlug(p.slug.clone()));
            }
            seen_slugs.push(&p.slug);

            for root in [&p.project_root, &p.backlog_root] {
                if !root.is_absolute() {
                    return Err(LedgerError::NonAbsoluteRoot(root.display().to_string()));
                }
                let key = canonical_key(root);
                if seen_roots.contains(&key) {
                    return Err(LedgerError::DuplicateRoot(p.slug.clone()));
                }
                seen_roots.push(key);
            }
        }
        Ok(())
    }

    /// Return the slug of an existing entry whose project_root or backlog_root matches the
    /// given roots (by canonical path), skipping `skip_slug`. Used to keep one entry per
    /// project root (doc-3 §3, §6) on register and on move.
    fn find_root_conflict(
        &self,
        project_root: &Path,
        backlog_root: &Path,
        skip_slug: Option<&str>,
    ) -> Option<String> {
        let pr = canonical_key(project_root);
        let br = canonical_key(backlog_root);
        self.projects
            .iter()
            .filter(|p| skip_slug != Some(p.slug.as_str()))
            .find(|p| canonical_key(&p.project_root) == pr || canonical_key(&p.backlog_root) == br)
            .map(|p| p.slug.clone())
    }
}

impl LoadedLedger {
    /// Load the ledger from `path`. A missing file yields an empty writable ledger (first
    /// run). A known schema_version is writable; an unknown *higher* one is read-only
    /// (AC #1); anything else is unsupported.
    pub fn load(path: &Path) -> Result<Self, LedgerError> {
        if !path.exists() {
            return Ok(LoadedLedger {
                ledger: Ledger::empty(),
                read_only: false,
            });
        }
        let text = std::fs::read_to_string(path)?;
        let mut ledger: Ledger = toml::from_str(&text)?;
        let read_only = match ledger.schema_version {
            v if v == KNOWN_SCHEMA_VERSION => false,
            v if v > KNOWN_SCHEMA_VERSION => true,
            v => return Err(LedgerError::UnsupportedSchemaVersion(v)),
        };
        // Only validate a version we understand: an unknown higher version may use fields or
        // rules this build cannot judge, so we degrade it to read-only untouched (AC #1)
        // rather than reject it against v1 contracts.
        if !read_only {
            ledger.validate_and_sanitize()?;
        }
        Ok(LoadedLedger { ledger, read_only })
    }

    /// Persist the ledger to `path`, creating the parent directory as needed. Refuses when
    /// the ledger was loaded read-only, so an unknown newer file is never clobbered (AC #1).
    pub fn save(&self, path: &Path) -> Result<(), LedgerError> {
        if self.read_only {
            return Err(LedgerError::ReadOnly(self.ledger.schema_version));
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let text = toml::to_string_pretty(&self.ledger)?;
        std::fs::write(path, text)?;
        Ok(())
    }
}

/// True when `s` matches the slug grammar `[a-z0-9][a-z0-9-]*` (doc-3 §3.1).
pub fn is_valid_slug(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Derive a slug from a project-root directory name: lowercase, collapse runs of
/// non-`[a-z0-9]` into single `-`, trim trailing `-` (doc-3 §3.1). Returns `None` when the
/// result is empty/invalid, in which case the user must supply a slug explicitly.
pub fn derive_slug(project_root: &Path) -> Option<String> {
    let name = project_root.file_name()?.to_str()?;
    let normalized = normalize_slug(name);
    if is_valid_slug(&normalized) {
        Some(normalized)
    } else {
        None
    }
}

fn normalize_slug(name: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for c in name.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            // Only emit a separator once we have a real char to separate from, so the
            // result never gets a leading '-'.
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            out.push(c);
            pending_dash = false;
        } else {
            pending_dash = true;
        }
    }
    out
}

fn is_canonical_status(s: &str) -> bool {
    CANONICAL_STATUSES.contains(&s)
}

/// True when `s` is `<prefix>-N` or `DRAFT-N` with N one-or-more digits (doc-3 §5.2).
fn is_task_id(s: &str, task_prefix: &str) -> bool {
    is_prefixed_number(s, task_prefix) || is_prefixed_number(s, DRAFT_PREFIX)
}

fn is_prefixed_number(s: &str, prefix: &str) -> bool {
    let Some(rest) = s.strip_prefix(prefix) else {
        return false;
    };
    let Some(num) = rest.strip_prefix('-') else {
        return false;
    };
    !num.is_empty() && num.bytes().all(|b| b.is_ascii_digit())
}

/// Reject a non-absolute root (doc-3 §3: project/Backlog roots are absolute paths).
fn require_absolute(root: &Path) -> Result<(), LedgerError> {
    if root.is_absolute() {
        Ok(())
    } else {
        Err(LedgerError::NonAbsoluteRoot(root.display().to_string()))
    }
}

/// A canonical comparison key for a root path. `canonicalize` resolves `.`/`..`/symlinks and
/// trailing-slash differences so two spellings of the same directory collide; when it fails
/// (e.g. the path does not exist), fall back to the path as given so equal spellings still
/// match. Used only for equality checks, never stored — the entry keeps the caller's path.
fn canonical_key(root: &Path) -> PathBuf {
    std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf())
}

/// Verify a Backlog root is readable: it must contain `config.yml` and a `tasks/` dir
/// (doc-3 §4.1 step 2).
fn verify_backlog_root(backlog_root: &Path) -> Result<(), LedgerError> {
    let config_ok = backlog_root.join("config.yml").is_file();
    let tasks_ok = backlog_root.join("tasks").is_dir();
    if config_ok && tasks_ok {
        Ok(())
    } else {
        Err(LedgerError::BacklogRootInvalid(
            backlog_root.display().to_string(),
        ))
    }
}

/// Whether the Git repo at `project_root` has at least one configured remote (doc-3 §3.2).
/// Uses a fixed subcommand and argument array (never a shell string). A non-repo, or a
/// missing `git`, counts as no remote. The commit/PR resolution that consumes this value is
/// designed separately in TASK-10; here we only record the boolean.
fn detect_git_remote(project_root: &Path) -> bool {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(project_root)
        .arg("remote")
        .output();
    match output {
        Ok(out) if out.status.success() => !String::from_utf8_lossy(&out.stdout).trim().is_empty(),
        _ => false,
    }
}

fn display_dir_name(project_root: &Path) -> String {
    project_root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| project_root.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

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
                "atlas-ledger-test-{}-{nanos}-{n}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            TempDir { path }
        }

        /// Create a valid Backlog root (config.yml + tasks/) under this temp dir and return it.
        fn make_backlog_root(&self, name: &str) -> PathBuf {
            let project = self.path.join(name);
            let root = project.join("backlog");
            std::fs::create_dir_all(root.join("tasks")).unwrap();
            std::fs::write(root.join("config.yml"), "project_name: Test\n").unwrap();
            root
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn register(ledger: &mut Ledger, project_root: PathBuf, slug: Option<&str>) -> ProjectEntry {
        ledger
            .register(&RegisterRequest {
                project_root,
                backlog_root: None,
                slug: slug.map(str::to_string),
            })
            .expect("register should succeed")
    }

    // --- slug contract (AC #8, doc-3 §3.1) -------------------------------------------------

    #[test]
    fn slug_grammar() {
        assert!(is_valid_slug("geomyth"));
        assert!(is_valid_slug("backlog-atlas"));
        assert!(is_valid_slug("a1-b2"));
        assert!(is_valid_slug("9lives"));
        assert!(!is_valid_slug(""));
        assert!(!is_valid_slug("-leading"));
        assert!(!is_valid_slug("Upper"));
        assert!(!is_valid_slug("has space"));
        assert!(!is_valid_slug("has:colon"));
        assert!(!is_valid_slug("under_score"));
    }

    #[test]
    fn slug_derivation_normalizes() {
        assert_eq!(
            derive_slug(Path::new("/x/Backlog Atlas")).as_deref(),
            Some("backlog-atlas")
        );
        assert_eq!(
            derive_slug(Path::new("/x/_snz.geomyth_")).as_deref(),
            Some("snz-geomyth")
        );
        assert_eq!(
            derive_slug(Path::new("/x/geomyth")).as_deref(),
            Some("geomyth")
        );
        // A name with no alphanumerics cannot yield a slug.
        assert_eq!(derive_slug(Path::new("/x/___")), None);
    }

    // --- register (AC #2) ------------------------------------------------------------------

    #[test]
    fn register_derives_slug_and_defaults_backlog_root() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("geomyth");
        let project_root = backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        let entry = register(&mut ledger, project_root.clone(), None);

        assert_eq!(entry.slug, "geomyth");
        assert_eq!(entry.backlog_root, project_root.join("backlog"));
        assert!(entry.status_aliases.is_empty());
        // A fresh temp dir is not a git repo → no remote.
        assert!(!entry.git_remote_present);
        assert_eq!(ledger.projects.len(), 1);
    }

    #[test]
    fn register_rejects_missing_backlog_root() {
        let tmp = TempDir::new();
        let project_root = tmp.path.join("no-backlog");
        std::fs::create_dir_all(&project_root).unwrap();

        let mut ledger = Ledger::empty();
        let err = ledger
            .register(&RegisterRequest {
                project_root,
                backlog_root: None,
                slug: None,
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::BacklogRootInvalid(_)));
    }

    #[test]
    fn register_rejects_duplicate_slug() {
        let tmp = TempDir::new();
        // Two distinct roots so the duplicate-slug path is exercised, not duplicate-root.
        let first = tmp.make_backlog_root("dup-a");
        let second = tmp.make_backlog_root("dup-b");

        let mut ledger = Ledger::empty();
        register(
            &mut ledger,
            first.parent().unwrap().to_path_buf(),
            Some("shared"),
        );
        let err = ledger
            .register(&RegisterRequest {
                project_root: second.parent().unwrap().to_path_buf(),
                backlog_root: None,
                slug: Some("shared".into()),
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::DuplicateSlug(_)));
    }

    #[test]
    fn register_rejects_invalid_user_slug() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        let err = ledger
            .register(&RegisterRequest {
                project_root,
                backlog_root: None,
                slug: Some("Bad Slug".into()),
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::InvalidSlug(_)));
    }

    // --- remove (AC #3) --------------------------------------------------------------------

    #[test]
    fn remove_by_slug() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        register(&mut ledger, project_root, Some("proj"));
        let removed = ledger.remove("proj").unwrap();
        assert_eq!(removed.slug, "proj");
        assert!(ledger.projects.is_empty());
        assert!(matches!(
            ledger.remove("proj").unwrap_err(),
            LedgerError::SlugNotFound(_)
        ));
    }

    #[test]
    fn register_rejects_duplicate_root() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        register(&mut ledger, project_root.clone(), Some("first"));
        // Same root, different slug — must be rejected so one task source is not read twice.
        let err = ledger
            .register(&RegisterRequest {
                project_root,
                backlog_root: None,
                slug: Some("second".into()),
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::DuplicateRoot(_)));
        assert_eq!(ledger.projects.len(), 1);
    }

    // --- update (AC #4/#5/#6) --------------------------------------------------------------

    #[test]
    fn update_changes_backlog_root_and_status_aliases() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();
        let other_backlog = tmp.make_backlog_root("proj-alt");

        let mut ledger = Ledger::empty();
        register(&mut ledger, project_root, Some("proj"));

        let mut aliases = BTreeMap::new();
        aliases.insert("Doing".to_string(), "In Progress".to_string());
        let updated = ledger
            .update(&UpdateRequest {
                slug: "proj".into(),
                project_root: None,
                backlog_root: Some(other_backlog.clone()),
                redetect_git_remote: false,
                status_aliases: Some(aliases),
                new_index: None,
            })
            .unwrap();
        assert_eq!(updated.backlog_root, other_backlog);
        assert_eq!(updated.status_aliases.get("Doing").unwrap(), "In Progress");
    }

    #[test]
    fn update_rejects_non_canonical_status_alias() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        register(&mut ledger, project_root, Some("proj"));

        let mut aliases = BTreeMap::new();
        aliases.insert("Weird".to_string(), "Nonsense".to_string());
        let err = ledger
            .update(&UpdateRequest {
                slug: "proj".into(),
                project_root: None,
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: Some(aliases),
                new_index: None,
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::InvalidStatusAlias { .. }));
    }

    #[test]
    fn update_move_keeps_slug_and_updates_both_roots() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();
        // New location for the same project.
        let moved_backlog = tmp.make_backlog_root("proj-moved");
        let moved_root = moved_backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        register(&mut ledger, project_root, Some("proj"));

        let updated = ledger
            .update(&UpdateRequest {
                slug: "proj".into(),
                project_root: Some(moved_root.clone()),
                backlog_root: None, // move default: <new root>/backlog
                redetect_git_remote: false,
                status_aliases: None,
                new_index: None,
            })
            .unwrap();
        assert_eq!(updated.slug, "proj");
        assert_eq!(updated.project_root, moved_root);
        assert_eq!(updated.backlog_root, moved_root.join("backlog"));
    }

    #[test]
    fn update_rejects_move_onto_another_entrys_root() {
        let tmp = TempDir::new();
        let a_backlog = tmp.make_backlog_root("a");
        let b_backlog = tmp.make_backlog_root("b");
        let b_root = b_backlog.parent().unwrap().to_path_buf();

        let mut ledger = Ledger::empty();
        register(
            &mut ledger,
            a_backlog.parent().unwrap().to_path_buf(),
            Some("a"),
        );
        register(&mut ledger, b_root.clone(), Some("b"));

        // Moving "a" onto "b"'s root must collide (one entry per root).
        let err = ledger
            .update(&UpdateRequest {
                slug: "a".into(),
                project_root: Some(b_root),
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: None,
                new_index: None,
            })
            .unwrap_err();
        assert!(matches!(err, LedgerError::DuplicateRoot(_)));
    }

    #[test]
    fn update_reorders_display_order() {
        let tmp = TempDir::new();
        let mut ledger = Ledger::empty();
        for name in ["a", "b", "c"] {
            let backlog = tmp.make_backlog_root(name);
            register(
                &mut ledger,
                backlog.parent().unwrap().to_path_buf(),
                Some(name),
            );
        }
        // Move "c" to the front.
        ledger
            .update(&UpdateRequest {
                slug: "c".into(),
                project_root: None,
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: None,
                new_index: Some(0),
            })
            .unwrap();
        let order: Vec<&str> = ledger.projects.iter().map(|p| p.slug.as_str()).collect();
        assert_eq!(order, ["c", "a", "b"]);
    }

    // --- cross-task-id (AC #7, doc-3 §5) ---------------------------------------------------

    fn ledger_with(slugs: &[&str]) -> Ledger {
        Ledger {
            schema_version: KNOWN_SCHEMA_VERSION,
            projects: slugs
                .iter()
                .map(|s| ProjectEntry {
                    slug: (*s).to_string(),
                    project_root: PathBuf::from("/x"),
                    backlog_root: PathBuf::from("/x/backlog"),
                    git_remote_present: false,
                    status_aliases: BTreeMap::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn generate_and_parse_roundtrip() {
        let ledger = ledger_with(&["geomyth"]);
        let generated = ledger
            .generate_cross_task_id("geomyth", "TASK-12", "TASK")
            .unwrap();
        assert_eq!(generated, "geomyth:TASK-12");

        let parsed = ledger
            .parse_cross_task_id(&generated, "TASK", None)
            .unwrap();
        assert_eq!(parsed.slug, "geomyth");
        assert_eq!(parsed.task_id, "TASK-12");
    }

    #[test]
    fn generate_rejects_unregistered_slug_and_bad_id() {
        let ledger = ledger_with(&["geomyth"]);
        // Unregistered slug: parser would reject it, so the generator must too.
        assert!(matches!(
            ledger
                .generate_cross_task_id("nope", "TASK-1", "TASK")
                .unwrap_err(),
            LedgerError::UnknownProject(_)
        ));
        // A right side that would break the first-colon split or the id form is rejected,
        // keeping generate/parse a round-trip pair (no "geomyth:TASK-1:extra").
        assert!(matches!(
            ledger
                .generate_cross_task_id("geomyth", "TASK-1:extra", "TASK")
                .unwrap_err(),
            LedgerError::InvalidTaskId(_)
        ));
    }

    #[test]
    fn parse_accepts_draft_ids() {
        let ledger = ledger_with(&["geomyth"]);
        let parsed = ledger
            .parse_cross_task_id("geomyth:DRAFT-3", "TASK", None)
            .unwrap();
        assert_eq!(parsed.task_id, "DRAFT-3");
    }

    #[test]
    fn parse_bare_id_needs_context() {
        let ledger = ledger_with(&["geomyth"]);
        // Without context: rejected.
        assert!(matches!(
            ledger
                .parse_cross_task_id("TASK-12", "TASK", None)
                .unwrap_err(),
            LedgerError::BareIdNeedsContext
        ));
        // With single-project context: accepted, slug filled from context.
        let parsed = ledger
            .parse_cross_task_id("TASK-12", "TASK", Some("geomyth"))
            .unwrap();
        assert_eq!(parsed.slug, "geomyth");
        assert_eq!(parsed.task_id, "TASK-12");
    }

    #[test]
    fn parse_rejects_unknown_project_and_bad_id() {
        let ledger = ledger_with(&["geomyth"]);
        assert!(matches!(
            ledger
                .parse_cross_task_id("nope:TASK-1", "TASK", None)
                .unwrap_err(),
            LedgerError::UnknownProject(_)
        ));
        assert!(matches!(
            ledger
                .parse_cross_task_id("geomyth:BUG-1", "TASK", None)
                .unwrap_err(),
            LedgerError::InvalidTaskId(_)
        ));
        assert!(matches!(
            ledger
                .parse_cross_task_id("geomyth:TASK-", "TASK", None)
                .unwrap_err(),
            LedgerError::InvalidTaskId(_)
        ));
    }

    #[test]
    fn parse_honors_custom_task_prefix() {
        let ledger = ledger_with(&["proj"]);
        let parsed = ledger
            .parse_cross_task_id("proj:ISSUE-7", "ISSUE", None)
            .unwrap();
        assert_eq!(parsed.task_id, "ISSUE-7");
    }

    // --- persistence + schema_version (AC #1) ----------------------------------------------

    #[test]
    fn save_load_roundtrip_with_aliases() {
        let tmp = TempDir::new();
        let backlog = tmp.make_backlog_root("proj");
        let project_root = backlog.parent().unwrap().to_path_buf();
        let path = tmp.path.join("cfg").join("projects.toml");

        let mut loaded = LoadedLedger::load(&path).unwrap(); // missing file → empty
        assert!(!loaded.read_only);
        assert!(loaded.ledger.projects.is_empty());

        register(&mut loaded.ledger, project_root, Some("proj"));
        let mut aliases = BTreeMap::new();
        aliases.insert("Closed".to_string(), "Done".to_string());
        loaded
            .ledger
            .update(&UpdateRequest {
                slug: "proj".into(),
                project_root: None,
                backlog_root: None,
                redetect_git_remote: false,
                status_aliases: Some(aliases),
                new_index: None,
            })
            .unwrap();
        loaded.save(&path).unwrap();

        let reloaded = LoadedLedger::load(&path).unwrap();
        assert_eq!(reloaded.ledger, loaded.ledger);
        assert_eq!(
            reloaded.ledger.projects[0]
                .status_aliases
                .get("Closed")
                .unwrap(),
            "Done"
        );
    }

    #[test]
    fn unknown_higher_schema_version_is_read_only() {
        let tmp = TempDir::new();
        let path = tmp.path.join("projects.toml");
        std::fs::write(&path, "schema_version = 999\n").unwrap();

        let loaded = LoadedLedger::load(&path).unwrap();
        assert!(loaded.read_only);
        // Save is refused so the newer file is never overwritten.
        assert!(matches!(
            loaded.save(&path).unwrap_err(),
            LedgerError::ReadOnly(999)
        ));
    }

    #[test]
    fn load_rejects_corrupt_ledger() {
        let tmp = TempDir::new();
        let path = tmp.path.join("projects.toml");
        // Hand-edited file with a duplicate slug — toml accepts the shape, but the semantic
        // pass must reject it rather than silently pick the first entry.
        std::fs::write(
            &path,
            "schema_version = 1\n\
             [[project]]\n\
             slug = \"dup\"\n\
             project_root = \"/a\"\n\
             backlog_root = \"/a/backlog\"\n\
             git_remote_present = false\n\
             [[project]]\n\
             slug = \"dup\"\n\
             project_root = \"/b\"\n\
             backlog_root = \"/b/backlog\"\n\
             git_remote_present = false\n",
        )
        .unwrap();
        assert!(matches!(
            LoadedLedger::load(&path).unwrap_err(),
            LedgerError::DuplicateSlug(_)
        ));
    }

    #[test]
    fn load_sanitizes_invalid_status_alias() {
        let tmp = TempDir::new();
        let path = tmp.path.join("projects.toml");
        // A non-canonical alias value is dropped on load (doc-3 §3.3 "ignore"), not fatal.
        std::fs::write(
            &path,
            "schema_version = 1\n\
             [[project]]\n\
             slug = \"proj\"\n\
             project_root = \"/a\"\n\
             backlog_root = \"/a/backlog\"\n\
             git_remote_present = false\n\
             [project.status_aliases]\n\
             Doing = \"In Progress\"\n\
             Weird = \"Nonsense\"\n",
        )
        .unwrap();
        let loaded = LoadedLedger::load(&path).unwrap();
        let aliases = &loaded.ledger.projects[0].status_aliases;
        assert_eq!(aliases.get("Doing").unwrap(), "In Progress");
        assert!(
            !aliases.contains_key("Weird"),
            "invalid alias should be dropped"
        );
    }

    #[test]
    fn git_remote_detection() {
        let tmp = TempDir::new();
        let repo = tmp.path.join("repo");
        std::fs::create_dir_all(&repo).unwrap();

        let init = std::process::Command::new("git")
            .arg("-C")
            .arg(&repo)
            .arg("init")
            .output();
        // Skip if git is unavailable in this environment.
        if init.map(|o| o.status.success()).unwrap_or(false) {
            assert!(!detect_git_remote(&repo), "fresh repo has no remote");
            let added = std::process::Command::new("git")
                .arg("-C")
                .arg(&repo)
                .args(["remote", "add", "origin", "https://example.invalid/x.git"])
                .output()
                .unwrap();
            assert!(added.status.success());
            assert!(detect_git_remote(&repo), "remote should be detected");
        }
        // A non-repo path is always false.
        assert!(!detect_git_remote(&tmp.path.join("nonexistent")));
    }
}
