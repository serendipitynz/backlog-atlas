//! Type 値の導出 — derive a task's Type values from its `kind:` labels (decision-5).
//!
//! The rule is mechanical prefix removal, not a lookup table: the kind vocabulary belongs to
//! each project, so a table would need an Atlas-side edit every time a project invents a
//! `kind:spike` — exactly the boundary decision-5 refuses to cross. An unrecognized value is
//! therefore carried through as a Type value and merely *marked* unknown, never dropped.
//!
//! Three boundary cases stay distinguishable because the display for each differs (decision-5,
//! doc-7 §3, doc-8 §4):
//!
//! | case | here | display |
//! |---|---|---|
//! | 複数 kind | two or more values, in label order | all shown side by side, never rounded to one |
//! | kind 無し | zero values ([`TypeValues::is_unset`]) | an explicit "Type 未設定", not an empty gap |
//! | 未知 Type | [`TypeValue::known`] false | the value, with a neutral fallback mark |
//!
//! kind 無し is a legitimate state rather than a defect, which is why nothing here produces a
//! degrade event — it is a normal display state, kept apart from the parse-error marks
//! (decision-5).

use serde::Serialize;

/// The label prefix that marks a Type. Matched exactly: a differently-cased `Kind:` is not the
/// convention doc-4 §3.3 fixes, and reading it as one would quietly take a label out of the
/// normal label list on a guess.
pub const KIND_LABEL_PREFIX: &str = "kind:";

/// 既知 Type 集合 (decision-5) — the Type values Atlas prepares display affordances (colour,
/// ordering) for. Membership only selects the display treatment; it never gates a value.
pub const KNOWN_TYPES: [&str; 5] = ["feature", "bug", "research", "writing", "maintenance"];

/// One Type value: `X` from a `kind:X` label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeValue {
    /// The text after `kind:`, case preserved and surrounding whitespace removed (decision-5).
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

/// A task's Type values in label order — zero or more, because decision-5 refuses to collapse
/// 複数 kind to a single value. Serializes as a plain array; `unset` is the empty array, so no
/// consumer has to keep a separate flag in sync with the contents.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct TypeValues(Vec<TypeValue>);

impl TypeValues {
    pub fn values(&self) -> &[TypeValue] {
        &self.0
    }

    /// kind 無し — the task has no `kind:` label. Display shows "Type 未設定" rather than
    /// nothing, since absence of a Type is itself the fact (decision-5).
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

/// Split frontmatter `labels` into kind labels (as bare Type values) and normal labels — the
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

/// Classify already-split kind values (a task's `type` slot) into Type values, marking each
/// against 既知 Type 集合.
pub fn derive_types(kind_values: &[String]) -> TypeValues {
    TypeValues(
        kind_values
            .iter()
            .map(|value| TypeValue::new(value.trim().to_string()))
            .collect(),
    )
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
    #[test]
    fn unknown_type_is_kept_and_marked() {
        let types = derive_types(&labels(&["spike"]));
        assert!(types.has_unknown());
        assert_eq!(types.values()[0].value, "spike");
        assert!(!types.values()[0].known);
        // 未知 is not 未設定 — the value exists.
        assert!(!types.is_unset());
    }

    // All five values decision-5 lists as 既知 Type 集合 resolve as known.
    #[test]
    fn known_type_set_matches_decision_5() {
        let types = derive_types(&labels(&KNOWN_TYPES));
        assert!(!types.has_unknown());
        assert_eq!(types.values().len(), KNOWN_TYPES.len());
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

    #[test]
    fn serializes_as_a_plain_array() {
        let types = derive_types(&labels(&["feature", "spike"]));
        let json = serde_json::to_value(&types).unwrap();
        assert_eq!(
            json,
            serde_json::json!([
                {"value": "feature", "known": true},
                {"value": "spike", "known": false},
            ])
        );
        // 未設定 is the empty array — no separate flag to fall out of sync.
        assert_eq!(
            serde_json::to_value(TypeValues::default()).unwrap(),
            serde_json::json!([])
        );
    }
}
