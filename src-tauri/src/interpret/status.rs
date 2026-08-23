//! 列対応規則 — map one project's own status value onto the canonical status columns
//! (decision-4, doc-3 §3.3).
//!
//! **Two questions about the same string, answered separately** (doc-7 §5): which column it goes
//! to ([`StatusMapping::column`]) and whether the value is one the project declares. Separate
//! because they do not imply each other — a project that legitimately runs its own status maps to
//! no column and is still not broken, so only the second earns 想定外スキーマ (decision-4), and
//! folding them would paint the first case with the second's mark.
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
    /// The status exactly as the frontmatter wrote it. Carried because the 未分類区画 shows the
    /// original string as is (decision-4) — normalization is a comparison device, never a
    /// replacement for the value.
    pub raw: String,
    /// The column this status maps to; `None` is 未分類 status (AC #3).
    pub column: Option<StatusColumn>,
    pub declaration: StatusDeclaration,
}

impl StatusMapping {
    /// 未分類 status: this status has no placement column — no alias, no name match, or a value
    /// absent from `config.yml` (which is kept out of a column even when its name matches one).
    /// The swimlane shows these in the row's 未分類区画 rather than a canonical column (doc-7 §5).
    pub fn is_unmapped(&self) -> bool {
        self.column.is_none()
    }

    /// True when this status is the 想定外スキーマ case that earns the stronger degrade mark —
    /// a value that appears in no declaration at all (decision-4).
    pub fn is_undeclared(&self) -> bool {
        matches!(self.declaration, StatusDeclaration::Undeclared)
    }
}

/// 列の作成時 status 候補 (doc-7 §4.1) for one canonical column: the project's own declared
/// statuses that 列対応規則 sends to that column.
///
/// A list per column rather than a map, in [`StatusColumn::ALL`] order, so the four arrive in the
/// order the grid draws them and a column with no candidate is still present as an empty list —
/// 候補 0 件 is a state the screen has to state (doc-7 §4.1), not an absence of information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnCreateStatuses {
    pub column: StatusColumn,
    /// The candidates, verbatim and in `config.yml`'s declaration order — which is what fixes the
    /// default when there are several (doc-7 §4.1).
    pub statuses: Vec<String>,
}

/// Which declared statuses each canonical column could be created with (doc-7 §4.1).
///
/// The reverse of [`map_status`], and reversed by running it rather than by a second rule:
/// 列対応規則 has aliases, the undeclared-value exclusion and 名称一致 in it, and a rule that only
/// *looked* like its inverse would place a task in one column while offering to create it in another.
///
/// The domain is `config.statuses` alone, because that is exactly what `-s` accepts (doc-5 §3): an
/// undeclared value is refused with exit code 1, so a status Atlas could map but the project does
/// not declare is not a value it may create with. That also makes a root declaring nothing
/// (`NoDeclaredSet`) yield no candidate anywhere — nothing is declared for `-s` to take.
pub fn create_status_candidates(
    config: &Config,
    aliases: &BTreeMap<String, String>,
) -> Vec<ColumnCreateStatuses> {
    StatusColumn::ALL
        .into_iter()
        .map(|column| ColumnCreateStatuses {
            column,
            statuses: config
                .statuses
                .iter()
                .filter(|raw| map_status(raw, config, aliases).column == Some(column))
                .cloned()
                .collect(),
        })
        .collect()
}

/// Apply 列対応規則 to one status value (decision-4).
///
/// `aliases` is the ledger entry's status 別名表 (doc-3 §3.3); an empty map is the normal case
/// and leaves plain name matching in charge.
pub fn map_status(raw: &str, config: &Config, aliases: &BTreeMap<String, String>) -> StatusMapping {
    let declaration = StatusDeclaration::of(raw, config);
    // A status absent from `config.yml`'s declared set is 想定外スキーマ, and doc-7 §5 / decision-4
    // keep it in the row's 未分類区画 with the stronger mark — never a real column, even when its
    // name matches one. This is checked *before* the alias lookup, with no alias exception:
    // decision-4 §13-19 defines an alias's subject as a project-specific status, i.e. one the
    // project *declares* in config.yml, so an alias for a value that appears nowhere in config.yml
    // does not make that inconsistency legitimate — decision-4 §65-68 admit no alias carve-out.
    // `column` means "where to place this task", so an undeclared value yields no placement
    // column; the resembled column is not information any consumer needs (the 未分類区画 shows
    // `raw`).
    let column = if declaration == StatusDeclaration::Undeclared {
        None
    } else {
        match alias_target(aliases, raw) {
            // An alias whose value is not a canonical column is invalid and ignored, and the
            // status it names stays 未分類 (doc-3 §3.3) — it does not fall back to name matching,
            // because a deliberate alias means the writer did not want the default reading of
            // that value. This is the only place that rule is applied: `LoadedLedger::load`
            // hands the invalid pair through untouched precisely so it can be seen here
            // (TASK-42), since a table that had dropped the key would be indistinguishable from
            // one that never had the alias.
            Some(target) => StatusColumn::from_name(target),
            // No alias: a Declared / Draft / unconfigured-root (`NoDeclaredSet`, decision-4's
            // geomyth) status name-matches, since none of them has a declaration to contradict.
            None => StatusColumn::from_name(raw),
        }
    };
    StatusMapping {
        raw: raw.to_string(),
        column,
        declaration,
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
    // the status it names is 未分類 rather than falling back to name matching.
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
        // It still matches no canonical column — known, but 未分類 unless aliased.
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

    // AC #3: a status matching neither an alias nor a column name is 未分類 status. Declared in
    // config.yml, so it carries no stronger mark — the project formally runs this status.
    #[test]
    fn declared_but_unmappable_status_is_unmapped_without_strong_mark() {
        let config = config(&["To Do", "Blocked", "Done"]);
        let mapped = map_status("Blocked", &config, &BTreeMap::new());
        assert!(mapped.is_unmapped());
        assert_eq!(mapped.declaration, StatusDeclaration::Declared);
        assert!(!mapped.is_undeclared());
        // The 未分類区画 shows the original string (decision-4).
        assert_eq!(mapped.raw, "Blocked");
    }

    // AC #3 / decision-4: a status absent from config.yml is 未分類 *and* earns the stronger
    // 想定外スキーマ mark, which is what separates the two 未分類 cases.
    #[test]
    fn undeclared_status_is_unmapped_with_strong_mark() {
        let config = config(&["To Do", "Done"]);
        let mapped = map_status("Wat", &config, &BTreeMap::new());
        assert!(mapped.is_unmapped());
        assert!(mapped.is_undeclared());
    }

    // AC #3 / doc-7 §5: an undeclared status stays out of a real column even when its name
    // matches one — otherwise `In Review` on a project declaring only ["To Do", "Done"] would be
    // placed in the In Review column instead of the row's 未分類区画. It keeps the stronger mark.
    #[test]
    fn undeclared_status_is_unmapped_even_when_its_name_matches_a_column() {
        let config = config(&["To Do", "Done"]);
        let mapped = map_status("In Review", &config, &BTreeMap::new());
        assert!(mapped.is_unmapped());
        assert!(mapped.is_undeclared());
    }

    // An alias does not override the undeclared rule: decision-4 §65-68 keep every status absent
    // from config.yml in the 未分類区画, and an alias's subject is defined as a *declared*
    // project-specific status — so aliasing a value that is not in config.yml does not place it
    // in a column. (A status a project truly runs belongs in config.yml, where it is Declared and
    // the alias applies normally, as `alias_table_maps_project_specific_statuses` shows.)
    #[test]
    fn alias_does_not_map_a_status_absent_from_config() {
        let config = config(&["To Do", "Done"]);
        let mapped = map_status(
            "Reviewing",
            &config,
            &aliases(&[("Reviewing", "In Review")]),
        );
        assert!(mapped.is_unmapped());
        assert!(mapped.is_undeclared());
    }

    // An unconfigured root (NoDeclaredSet) still name-matches — nothing is declared to
    // contradict, so its statuses are not treated as 想定外 and land in their columns.
    #[test]
    fn no_declared_set_status_still_name_matches_a_column() {
        let config = config(&[]);
        let mapped = map_status("In Review", &config, &BTreeMap::new());
        assert_eq!(mapped.column, Some(StatusColumn::InReview));
        assert_eq!(mapped.declaration, StatusDeclaration::NoDeclaredSet);
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

    fn candidates_of(
        config: &Config,
        aliases: &BTreeMap<String, String>,
        column: StatusColumn,
    ) -> Vec<String> {
        create_status_candidates(config, aliases)
            .into_iter()
            .find(|entry| entry.column == column)
            .expect("every canonical column has an entry")
            .statuses
    }

    // doc-7 §4.1: with Backlog.md's four declared statuses, each column has exactly its own.
    #[test]
    fn each_column_gets_the_declared_status_that_maps_to_it() {
        let config = default_config();
        let none = BTreeMap::new();
        for (column, expected) in [
            (StatusColumn::ToDo, "To Do"),
            (StatusColumn::InProgress, "In Progress"),
            (StatusColumn::InReview, "In Review"),
            (StatusColumn::Done, "Done"),
        ] {
            assert_eq!(candidates_of(&config, &none, column), vec![expected]);
        }
    }

    // doc-7 §4.1 / TASK-53 AC #9: `backlog init --defaults` declares no `In Review`, so that column
    // has no candidate at all — which is what makes the swimlane place no entry there.
    #[test]
    fn init_defaults_leaves_in_review_without_a_candidate() {
        let config = config(&["To Do", "In Progress", "Done"]);
        let none = BTreeMap::new();
        assert!(candidates_of(&config, &none, StatusColumn::InReview).is_empty());
        assert_eq!(
            candidates_of(&config, &none, StatusColumn::ToDo),
            vec!["To Do"]
        );
    }

    // doc-7 §4.1: 正準列名をそのまま渡さない — the candidate is the project's own spelling, reached
    // through the alias table, never the canonical column's name.
    #[test]
    fn aliased_project_statuses_are_the_candidates() {
        let config = config(&["Doing", "Review", "Closed", "Cancelled"]);
        let aliases = aliases(&[
            ("Doing", "In Progress"),
            ("Review", "In Review"),
            ("Closed", "Done"),
            ("Cancelled", "Done"),
        ]);
        assert_eq!(
            candidates_of(&config, &aliases, StatusColumn::InProgress),
            vec!["Doing"]
        );
        // Two statuses alias to Done, so that column has two candidates, in declaration order.
        assert_eq!(
            candidates_of(&config, &aliases, StatusColumn::Done),
            vec!["Closed", "Cancelled"]
        );
        assert!(candidates_of(&config, &aliases, StatusColumn::ToDo).is_empty());
    }

    // Declaration order is `config.yml`'s, not the order the columns are scanned in: doc-7 §4.1
    // makes the first declared candidate the default the input starts on.
    #[test]
    fn candidates_keep_config_declaration_order() {
        let config = config(&["Cancelled", "Closed"]);
        let aliases = aliases(&[("Closed", "Done"), ("Cancelled", "Done")]);
        assert_eq!(
            candidates_of(&config, &aliases, StatusColumn::Done),
            vec!["Cancelled", "Closed"]
        );
    }

    // A declared status that maps to no column (doc-7 §4.1 の未分類列の材料) is a candidate for
    // nothing: it belongs to the 未分類区画, which is not a canonical column.
    #[test]
    fn declared_but_unmapped_status_is_nobodys_candidate() {
        let config = config(&["To Do", "Blocked", "Done"]);
        let none = BTreeMap::new();
        for entry in create_status_candidates(&config, &none) {
            assert!(!entry.statuses.contains(&"Blocked".to_string()));
        }
    }

    // An unconfigured root declares nothing, so `-s` has no value it would accept and every column
    // is left without a candidate — even though its tasks' statuses do name-match into columns.
    #[test]
    fn no_declared_set_yields_no_candidates() {
        let config = config(&[]);
        let none = BTreeMap::new();
        assert!(create_status_candidates(&config, &none)
            .iter()
            .all(|entry| entry.statuses.is_empty()));
    }

    #[test]
    fn candidates_serialize_with_camel_case_columns() {
        let json = serde_json::to_value(create_status_candidates(
            &default_config(),
            &BTreeMap::new(),
        ))
        .unwrap();
        assert_eq!(json[0]["column"], "toDo");
        assert_eq!(json[0]["statuses"][0], "To Do");
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
