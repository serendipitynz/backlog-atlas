//! 列対応規則 — map one project's own status value onto the canonical status columns
//! (decision-4, doc-3 §3.3).
//!
//! Two questions are answered separately about the same string, because the swimlane needs
//! both and they do not imply each other (doc-7 §5):
//!
//! 1. **Which column does it go to?** — alias table first, then name matching (case and
//!    surrounding whitespace ignored). No match means 未対応 status: [`StatusMapping::column`]
//!    is `None` and the task must go to the row's 未対応区画, never into a canonical column.
//! 2. **Is the value itself known?** — declared in `config.yml`, the draft-only `Draft`, or
//!    declared nowhere. Only the last earns the stronger 想定外スキーマ mark (decision-4), so a
//!    project that legitimately runs its own status is not painted as broken merely for not
//!    mapping to a column.
//!
//! Nothing here rewrites the target Markdown: the alias table lives in Atlas's own ledger and
//! the mapping is Atlas-side interpretation only (doc-2 boundary, decision-4).

use crate::domain::Config;
use serde::Serialize;
use std::collections::BTreeMap;

/// The status a `draft create` writes. `config.yml` need not list it, yet it is a status a
/// draft legitimately carries, so it must never be read as an unknown value (doc-4 §3.4).
pub const DRAFT_STATUS: &str = "Draft";

/// 正準ステータス列 (decision-4) — the fixed four columns the swimlane always has, identical
/// across projects so a column can be read top-to-bottom across project rows (doc-7 §3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StatusColumn {
    ToDo,
    InProgress,
    InReview,
    Done,
}

impl StatusColumn {
    /// Left-to-right column order (doc-7 §3). Also the order name matching scans.
    pub const ALL: [StatusColumn; 4] = [
        StatusColumn::ToDo,
        StatusColumn::InProgress,
        StatusColumn::InReview,
        StatusColumn::Done,
    ];

    /// The column's canonical name — the spelling `status_aliases` values must use (doc-3
    /// §3.3) and the label the swimlane header shows.
    pub const fn as_str(self) -> &'static str {
        match self {
            StatusColumn::ToDo => "To Do",
            StatusColumn::InProgress => "In Progress",
            StatusColumn::InReview => "In Review",
            StatusColumn::Done => "Done",
        }
    }

    /// 名称一致 — case and surrounding whitespace ignored (decision-4). Backlog.md's default
    /// four statuses all resolve here, which is why an aliasless project needs no configuration.
    pub fn from_name(name: &str) -> Option<Self> {
        StatusColumn::ALL
            .into_iter()
            .find(|column| same_status_name(column.as_str(), name))
    }
}

/// How a status value's legitimacy is established, independent of whether it maps to a column.
/// Kept apart from the mapping because "runs its own status vocabulary" and "wrote a status
/// nobody declared" look identical at the column level yet must not be marked identically
/// (decision-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StatusDeclaration {
    /// Listed in `config.yml`'s `statuses` — the project's own, formally operated status.
    Declared,
    /// The draft-only `Draft` (doc-4 §3.4). Known even when `config.yml` omits it.
    Draft,
    /// `config.yml` declares a status set and this value is not in it — 想定外スキーマ (doc-4
    /// §5), the stronger degrade mark.
    Undeclared,
    /// `config.yml` declares no status set at all, so nothing can contradict this value.
    /// Distinguished from [`Declared`](Self::Declared) so no consumer reads "not degraded" as
    /// "the project vouches for this status": an unconfigured root (decision-4 measured
    /// `geomyth` in exactly this state) would otherwise degrade every one of its tasks.
    NoDeclaredSet,
}

impl StatusDeclaration {
    /// Classify `raw` against the project's declared status set.
    pub fn of(raw: &str, config: &Config) -> Self {
        if config.statuses.iter().any(|s| same_status_name(s, raw)) {
            StatusDeclaration::Declared
        } else if same_status_name(raw, DRAFT_STATUS) {
            StatusDeclaration::Draft
        } else if config.statuses.is_empty() {
            StatusDeclaration::NoDeclaredSet
        } else {
            StatusDeclaration::Undeclared
        }
    }
}

/// The result of applying 列対応規則 to one task's status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusMapping {
    /// The status exactly as the frontmatter wrote it. Carried because the 未対応区画 shows the
    /// original string as is (decision-4) — normalization is a comparison device, never a
    /// replacement for the value.
    pub raw: String,
    /// The column this status maps to; `None` is 未対応 status (AC #3).
    pub column: Option<StatusColumn>,
    pub declaration: StatusDeclaration,
}

impl StatusMapping {
    /// 未対応 status: no alias and no name match. The swimlane keeps these out of the four
    /// columns and shows them in the row's 未対応区画 (doc-7 §5).
    pub fn is_unmapped(&self) -> bool {
        self.column.is_none()
    }

    /// True when this status is the 想定外スキーマ case that earns the stronger degrade mark —
    /// a value that appears in no declaration at all (decision-4).
    pub fn is_undeclared(&self) -> bool {
        matches!(self.declaration, StatusDeclaration::Undeclared)
    }
}

/// Apply 列対応規則 to one status value (decision-4).
///
/// `aliases` is the ledger entry's status 別名表 (doc-3 §3.3); an empty map is the normal case
/// and leaves plain name matching in charge.
pub fn map_status(raw: &str, config: &Config, aliases: &BTreeMap<String, String>) -> StatusMapping {
    let column = match alias_target(aliases, raw) {
        // An alias whose value is not a canonical column is invalid and ignored, and the status
        // it names stays 未対応 (doc-3 §3.3) — it does not fall back to name matching, because a
        // deliberate alias means the writer did not want the default reading of that value.
        // `LoadedLedger::load` already drops such aliases, so this is the defense for callers
        // that build the map some other way.
        Some(target) => StatusColumn::from_name(target),
        None => StatusColumn::from_name(raw),
    };
    StatusMapping {
        raw: raw.to_string(),
        column,
        declaration: StatusDeclaration::of(raw, config),
    }
}

/// Look up `status` in the alias table. An exact key wins; otherwise the same 名称一致 rule the
/// default mapping uses applies, so an alias keyed `doing` still catches a `Doing` status
/// instead of silently doing nothing.
fn alias_target<'a>(aliases: &'a BTreeMap<String, String>, status: &str) -> Option<&'a str> {
    if let Some(target) = aliases.get(status) {
        return Some(target);
    }
    aliases
        .iter()
        .find(|(key, _)| same_status_name(key, status))
        .map(|(_, target)| target.as_str())
}

/// 名称一致: equal once surrounding whitespace and case are ignored (decision-4).
fn same_status_name(a: &str, b: &str) -> bool {
    normalize(a) == normalize(b)
}

// `to_lowercase` rather than `eq_ignore_ascii_case`: a project may name its statuses in any
// language, and case folding that stops at ASCII would treat two spellings of the same
// non-ASCII status as different values.
fn normalize(name: &str) -> String {
    name.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(statuses: &[&str]) -> Config {
        Config {
            project_name: Some("Backlog Atlas".into()),
            task_prefix: "TASK".into(),
            statuses: statuses.iter().map(|s| (*s).to_string()).collect(),
            default_status: None,
            date_format: None,
        }
    }

    fn default_config() -> Config {
        config(&["To Do", "In Progress", "In Review", "Done"])
    }

    fn aliases(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    // AC #1: name matching ignores case and surrounding whitespace, so Backlog.md's default
    // four statuses map with no alias table at all.
    #[test]
    fn name_match_ignores_case_and_surrounding_space() {
        let config = default_config();
        let none = BTreeMap::new();
        for (raw, expected) in [
            ("To Do", StatusColumn::ToDo),
            ("  in progress  ", StatusColumn::InProgress),
            ("IN REVIEW", StatusColumn::InReview),
            ("done", StatusColumn::Done),
        ] {
            let mapped = map_status(raw, &config, &none);
            assert_eq!(mapped.column, Some(expected), "raw = {raw:?}");
            // The original spelling survives the comparison.
            assert_eq!(mapped.raw, raw);
        }
    }

    // AC #1: the alias table supplies the mappings name matching cannot reach (decision-4's
    // Doing / Review / Closed / Cancelled examples).
    #[test]
    fn alias_table_maps_project_specific_statuses() {
        let config = config(&["Doing", "Review", "Closed", "Cancelled"]);
        let aliases = aliases(&[
            ("Doing", "In Progress"),
            ("Review", "In Review"),
            ("Closed", "Done"),
            ("Cancelled", "Done"),
        ]);
        for (raw, expected) in [
            ("Doing", StatusColumn::InProgress),
            ("Review", StatusColumn::InReview),
            ("Closed", StatusColumn::Done),
            ("Cancelled", StatusColumn::Done),
        ] {
            let mapped = map_status(raw, &config, &aliases);
            assert_eq!(mapped.column, Some(expected), "raw = {raw:?}");
            // Declared in config.yml, so no degrade mark despite being project-specific.
            assert_eq!(mapped.declaration, StatusDeclaration::Declared);
        }
    }

    // AC #1: an alias overrides name matching — the writer's explicit reading wins.
    #[test]
    fn alias_overrides_name_match() {
        let config = config(&["In Review"]);
        let mapped = map_status("In Review", &config, &aliases(&[("In Review", "Done")]));
        assert_eq!(mapped.column, Some(StatusColumn::Done));
    }

    // The alias table is keyed by 名称一致 too, so a differently-cased key still applies.
    #[test]
    fn alias_key_matches_case_insensitively() {
        let config = config(&["Doing"]);
        let mapped = map_status(" DOING ", &config, &aliases(&[("doing", "In Progress")]));
        assert_eq!(mapped.column, Some(StatusColumn::InProgress));
    }

    // doc-3 §3.3: an alias pointing at something that is not a canonical column is invalid;
    // the status it names is 未対応 rather than falling back to name matching.
    #[test]
    fn invalid_alias_leaves_status_unmapped() {
        let config = default_config();
        let mapped = map_status("Done", &config, &aliases(&[("Done", "Shipped")]));
        assert!(mapped.is_unmapped());
        assert_eq!(mapped.declaration, StatusDeclaration::Declared);
    }

    // AC #2: `Draft` is a known status even though config.yml does not list it, so it never
    // becomes the 想定外スキーマ case.
    #[test]
    fn draft_is_known_without_being_declared() {
        let config = default_config();
        let mapped = map_status("Draft", &config, &BTreeMap::new());
        assert_eq!(mapped.declaration, StatusDeclaration::Draft);
        assert!(!mapped.is_undeclared());
        // It still matches no canonical column — known, but 未対応 unless aliased.
        assert!(mapped.is_unmapped());
    }

    // AC #2: a project that wants its drafts in a column can alias `Draft` like any other value.
    #[test]
    fn draft_can_be_aliased_to_a_column() {
        let config = default_config();
        let mapped = map_status("Draft", &config, &aliases(&[("Draft", "To Do")]));
        assert_eq!(mapped.column, Some(StatusColumn::ToDo));
        assert_eq!(mapped.declaration, StatusDeclaration::Draft);
    }

    // AC #3: a status matching neither an alias nor a column name is 未対応 status. Declared in
    // config.yml, so it carries no stronger mark — the project formally runs this status.
    #[test]
    fn declared_but_unmappable_status_is_unmapped_without_strong_mark() {
        let config = config(&["To Do", "Blocked", "Done"]);
        let mapped = map_status("Blocked", &config, &BTreeMap::new());
        assert!(mapped.is_unmapped());
        assert_eq!(mapped.declaration, StatusDeclaration::Declared);
        assert!(!mapped.is_undeclared());
        // The 未対応区画 shows the original string (decision-4).
        assert_eq!(mapped.raw, "Blocked");
    }

    // AC #3 / decision-4: a status absent from config.yml is 未対応 *and* earns the stronger
    // 想定外スキーマ mark, which is what separates the two 未対応 cases.
    #[test]
    fn undeclared_status_is_unmapped_with_strong_mark() {
        let config = config(&["To Do", "Done"]);
        let mapped = map_status("Wat", &config, &BTreeMap::new());
        assert!(mapped.is_unmapped());
        assert!(mapped.is_undeclared());
    }

    // A status that maps to a column can still be undeclared — the two axes are independent.
    #[test]
    fn mapped_status_can_still_be_undeclared() {
        let config = config(&["To Do", "Done"]);
        let mapped = map_status("In Review", &config, &BTreeMap::new());
        assert_eq!(mapped.column, Some(StatusColumn::InReview));
        assert!(mapped.is_undeclared());
    }

    // An unconfigured root (decision-4's geomyth) must not have every task degraded.
    #[test]
    fn no_declared_set_is_not_undeclared() {
        let config = config(&[]);
        let mapped = map_status("Whatever", &config, &BTreeMap::new());
        assert_eq!(mapped.declaration, StatusDeclaration::NoDeclaredSet);
        assert!(!mapped.is_undeclared());
        assert!(mapped.is_unmapped());
    }

    #[test]
    fn columns_serialize_as_camel_case_tokens() {
        let json =
            serde_json::to_value(map_status("To Do", &default_config(), &BTreeMap::new())).unwrap();
        assert_eq!(json["column"], "toDo");
        assert_eq!(json["declaration"], "declared");
        assert_eq!(json["raw"], "To Do");
    }
}
