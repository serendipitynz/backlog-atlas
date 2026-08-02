//! Type 値の導出 — derive a task's Type values from its Type 候補 (decision-5, decision-20).
//!
//! A **Type 候補** is one string taken from a **Type 導出元**, before any classifying or folding.
//! There are two 導出元 (decision-20): the `kind:` labels, and the frontmatter `type` field
//! Backlog CLI v1.48.0 writes. The read layer collects both into the task's `type` slot, kind
//! labels first (doc-4 §3.3); this module applies the rules to what it collected.
//!
//! From the kind side the rule is mechanical prefix removal, not a lookup table: the kind
//! vocabulary belongs to each project, so a table would need an Atlas-side edit every time a
//! project invents a `kind:spike` — exactly the boundary decision-5 refuses to cross. An
//! unrecognized value is therefore carried through as a Type value and merely *marked* unknown,
//! never dropped. The `type` field's vocabulary is the opposite — closed, and fixed in the CLI
//! rather than in the project's config — but nothing here checks it against that vocabulary
//! either: a hand-edited file can hold any string, and the CLI's list changes between versions
//! (decision-20).
//!
//! Four boundary cases stay distinguishable because the display for each differs (decision-5,
//! decision-20, doc-7 §3, doc-8 §4):
//!
//! | case | here | display |
//! |---|---|---|
//! | 複数 kind | two or more values, in 候補 order | all shown side by side, never rounded to one |
//! | kind 無し | zero values ([`TypeValues::is_unset`]) | an explicit "Type 未設定", not an empty gap |
//! | 未知 Type | [`TypeValue::known`] false | the value, with a neutral fallback mark |
//! | 同値の重複 | folded to one by [`derive_types`] | one value, so it cannot be read as 複数 kind |
//!
//! kind 無し is a legitimate state rather than a defect, which is why nothing here produces a
//! degrade event — it is a normal display state, kept apart from the parse-error marks
//! (decision-5).

use serde::Serialize;

/// The label prefix that marks a Type. Matched exactly: a differently-cased `Kind:` is not the
/// convention doc-4 §3.3 fixes, and reading it as one would quietly take a label out of the
/// normal label list on a guess.
pub const KIND_LABEL_PREFIX: &str = "kind:";

/// 既知 Type 集合 (decision-5, widened by decision-20) — the Type values Atlas prepares display
/// affordances (colour, ordering) for. Membership only selects the display treatment; it never
/// gates a value.
///
/// Two origins, deliberately kept in one list because a Type value carries no record of which
/// 導出元 produced it (doc-8 §4 does not show the origin, so neither does this):
/// doc-2's five, and the five from Backlog CLI's own `--type` vocabulary that doc-2 did not have.
/// The CLI's list can change between versions and nothing here follows it automatically — a
/// value it adds would simply show with the 未知 Type mark, which is a display treatment and not
/// a degrade (decision-20).
pub const KNOWN_TYPES: [&str; 10] = [
    // doc-2's enumeration (decision-5).
    "feature",
    "bug",
    "research",
    "writing",
    "maintenance",
    // Backlog CLI v1.48.0's `--type` vocabulary, less `bug`/`feature` which are already above
    // (2026-08-02 measured: the CLI rejects anything outside its seven and `config.yml` cannot
    // widen it). `task` reads oddly beside Atlas's own "task", but it is the CLI's word, not a
    // name Atlas chose, so it is not reworded (decision-20).
    "enhancement",
    "task",
    "chore",
    "docs",
    "spike",
];

/// One Type value derived from a Type 候補.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeValue {
    /// The Type 候補's text — after `kind:` for a label, the field's own value for `type` — with
    /// case preserved and surrounding whitespace removed (decision-5).
    pub value: String,
    /// Whether `value` is in [`KNOWN_TYPES`]. False is 未知 Type: shown as is, with the neutral
    /// fallback mark.
    pub known: bool,
}

impl TypeValue {
    fn new(value: String) -> Self {
        let known = KNOWN_TYPES
            .iter()
            // Case-insensitive so `kind:Feature` gets the `feature` treatment, while `value`
            // still carries the project's own spelling for display (decision-5 keeps case).
            .any(|known| known.eq_ignore_ascii_case(&value));
        TypeValue { value, known }
    }
}

/// A task's Type values in Type 候補 order — zero or more, because decision-5 refuses to collapse
/// 複数 kind to a single value. Serializes as a plain array; `unset` is the empty array, so no
/// consumer has to keep a separate flag in sync with the contents.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct TypeValues(Vec<TypeValue>);

impl TypeValues {
    pub fn values(&self) -> &[TypeValue] {
        &self.0
    }

    /// kind 無し — the task has no Type 候補 at all (no `kind:` label and no `type` field).
    /// Display shows "Type 未設定" rather than nothing, since absence of a Type is itself the
    /// fact (decision-5).
    pub fn is_unset(&self) -> bool {
        self.0.is_empty()
    }

    /// 複数 kind — two or more Type values, all of which are shown.
    pub fn is_multiple(&self) -> bool {
        self.0.len() > 1
    }

    /// Whether any value falls outside 既知 Type 集合.
    pub fn has_unknown(&self) -> bool {
        self.0.iter().any(|t| !t.known)
    }
}

/// Split frontmatter `labels` into kind labels (as bare Type 候補) and normal labels — the
/// separation doc-4 §3.3 fixes at the read layer, with the derivation rule decision-5 fixes.
/// Returned in the input order so 複数 kind keeps the order the labels were written in.
///
/// The two lists are disjoint by construction: this is the single place the split happens, so
/// a kind label can never reach the normal label list (AC #5).
pub fn split_labels(labels: Vec<String>) -> (Vec<String>, Vec<String>) {
    let mut kinds = Vec::new();
    let mut normal = Vec::new();
    for label in labels {
        match label.strip_prefix(KIND_LABEL_PREFIX) {
            Some(kind) => kinds.push(kind.trim().to_string()),
            None => normal.push(label),
        }
    }
    (kinds, normal)
}

/// Classify a task's Type 候補 (its `type` slot, already collected from both 導出元 by the read
/// layer) into Type values, marking each against 既知 Type 集合 and folding 同値の重複.
///
/// The fold ignores which 導出元 a 候補 came from. Restricting it to cross-導出元 pairs would
/// leave `kind:bug` + `kind:Bug` showing twice while `kind:bug` + `type: Bug` shows once, and
/// since doc-8 §4 keeps the origin off the screen, a reader has nothing to tell those two
/// situations apart by (decision-20). The comparison is the same ASCII case-insensitive one
/// [`TypeValue::new`] uses against 既知 Type 集合, so a value is never both "same as an existing
/// one" and "a different member of the known set".
pub fn derive_types(candidates: &[String]) -> TypeValues {
    let mut values: Vec<TypeValue> = Vec::new();
    for candidate in candidates {
        let value = candidate.trim();
        // First spelling wins: kind labels come first in the slot, so an existing project's
        // display is unchanged by a `type` field that merely repeats one of its kind labels.
        if values
            .iter()
            .any(|kept| kept.value.eq_ignore_ascii_case(value))
        {
            continue;
        }
        values.push(TypeValue::new(value.to_string()));
    }
    TypeValues(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| (*v).to_string()).collect()
    }

    // AC #4 / AC #5: the prefix is removed, the remainder becomes the Type value, and the
    // normal label list never receives a kind label.
    #[test]
    fn prefix_removal_separates_type_from_normal_labels() {
        let (kinds, normal) = split_labels(labels(&["kind:feature", "ui", "kind:research"]));
        assert_eq!(kinds, ["feature", "research"]);
        assert_eq!(normal, ["ui"]);
        assert!(!normal.iter().any(|l| l.starts_with(KIND_LABEL_PREFIX)));
    }

    // decision-5: case is preserved, surrounding whitespace is not.
    #[test]
    fn type_value_keeps_case_and_drops_surrounding_space() {
        let (kinds, _) = split_labels(labels(&["kind: Feature "]));
        assert_eq!(kinds, ["Feature"]);
        let types = derive_types(&kinds);
        assert_eq!(types.values()[0].value, "Feature");
        // Known despite the capital F — the spelling is display data, not the lookup key.
        assert!(types.values()[0].known);
    }

    // AC #4 (複数 kind): every value is kept, in label order — no rounding to one.
    #[test]
    fn multiple_kinds_are_all_kept_in_label_order() {
        let (kinds, _) = split_labels(labels(&["kind:research", "docs", "kind:writing"]));
        let types = derive_types(&kinds);
        assert!(types.is_multiple());
        assert_eq!(
            types.values().iter().map(|t| &t.value).collect::<Vec<_>>(),
            ["research", "writing"]
        );
    }

    // AC #4 (kind 無し): no kind label is 未設定 — distinguishable from a task that has Types.
    #[test]
    fn no_kind_label_is_unset() {
        let (kinds, normal) = split_labels(labels(&["ui", "backend"]));
        let types = derive_types(&kinds);
        assert!(types.is_unset());
        assert!(!types.is_multiple());
        assert!(!types.has_unknown());
        // Normal labels are untouched: 未設定 Type says nothing about labels (decision-5).
        assert_eq!(normal, ["ui", "backend"]);
    }

    // AC #4 (未知 Type): a project's own kind is carried as a value and only marked unknown.
    // `refactoring` rather than decision-5's own `kind:spike` example, because decision-20 moved
    // spike into 既知 Type 集合 along with the rest of the CLI's vocabulary.
    #[test]
    fn unknown_type_is_kept_and_marked() {
        let types = derive_types(&labels(&["refactoring"]));
        assert!(types.has_unknown());
        assert_eq!(types.values()[0].value, "refactoring");
        assert!(!types.values()[0].known);
        // 未知 is not 未設定 — the value exists.
        assert!(!types.is_unset());
    }

    // Every value of 既知 Type 集合 resolves as known — decision-5's five plus decision-20's five.
    #[test]
    fn known_type_set_resolves_as_known() {
        let types = derive_types(&labels(&KNOWN_TYPES));
        assert!(!types.has_unknown());
        assert_eq!(types.values().len(), KNOWN_TYPES.len());
    }

    // decision-20 widened 既知 Type 集合 to the CLI's vocabulary. Named one by one rather than
    // asserting a length, so dropping a word to keep the count fails here.
    #[test]
    fn the_cli_type_vocabulary_is_known() {
        for value in [
            "bug",
            "feature",
            "enhancement",
            "task",
            "chore",
            "docs",
            "spike",
        ] {
            let types = derive_types(&labels(&[value]));
            assert!(!types.has_unknown(), "{value} should be a known Type");
        }
    }

    // A bare `kind:` carries no Type information, but decision-5 discards nothing: it becomes an
    // empty, unknown Type value so the malformed label is visible instead of vanishing between
    // the two lists.
    #[test]
    fn empty_kind_label_becomes_an_unknown_value() {
        let (kinds, normal) = split_labels(labels(&["kind:"]));
        assert_eq!(kinds, [""]);
        assert!(normal.is_empty());
        let types = derive_types(&kinds);
        assert!(!types.is_unset());
        assert!(types.has_unknown());
    }

    // A label merely containing `kind:` is not a kind label — only the prefix counts.
    #[test]
    fn prefix_matches_only_at_the_start() {
        let (kinds, normal) = split_labels(labels(&["area:kind:feature", "Kind:feature"]));
        assert!(kinds.is_empty());
        assert_eq!(normal, ["area:kind:feature", "Kind:feature"]);
    }

    // 同値の重複 (decision-20) is folded, and the first spelling is the one kept — so a `type`
    // field repeating a kind label leaves an existing project's display exactly as it was.
    #[test]
    fn a_repeated_value_is_folded_to_one_keeping_the_first_spelling() {
        // As the read layer builds it: kind labels first, then the `type` field.
        let types = derive_types(&labels(&["bug", "Bug"]));
        assert_eq!(
            types.values().iter().map(|t| &t.value).collect::<Vec<_>>(),
            ["bug"]
        );
        // Folded to one, so it cannot be read as 複数 kind.
        assert!(!types.is_multiple());
    }

    // The fold does not look at which 導出元 a 候補 came from: two kind labels differing only in
    // case fold too. Splitting the rule by origin would show these twice while `kind:bug` +
    // `type: Bug` shows once, and doc-8 §4 gives the reader no way to tell the two apart.
    #[test]
    fn two_kind_labels_differing_only_in_case_also_fold() {
        let (kinds, _) = split_labels(labels(&["kind:bug", "kind:Bug"]));
        assert_eq!(kinds, ["bug", "Bug"]);
        assert_eq!(derive_types(&kinds).values().len(), 1);
    }

    // Folding is by value, not by count: two genuinely different values stay two.
    #[test]
    fn different_values_are_not_folded() {
        let types = derive_types(&labels(&["bug", "feature"]));
        assert_eq!(
            types.values().iter().map(|t| &t.value).collect::<Vec<_>>(),
            ["bug", "feature"]
        );
    }

    #[test]
    fn serializes_as_a_plain_array() {
        let types = derive_types(&labels(&["feature", "refactoring"]));
        let json = serde_json::to_value(&types).unwrap();
        assert_eq!(
            json,
            serde_json::json!([
                {"value": "feature", "known": true},
                {"value": "refactoring", "known": false},
            ])
        );
        // 未設定 is the empty array — no separate flag to fall out of sync.
        assert_eq!(
            serde_json::to_value(TypeValues::default()).unwrap(),
            serde_json::json!([])
        );
    }
}
