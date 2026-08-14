//! id の比較規則 — the order two management-file ids stand in (doc-4 §7).
//!
//! doc-4 §7 is the rule's one home. It reaches the screen twice: this layer sorts the three
//! non-task collections with [`compare_ids`] before they leave [`crate::read::read_project`],
//! and `src/lib/swimlane.ts` compares task ids with `compareNumberAware` for the card order
//! doc-7 §5.4 lets the user choose. **Two implementations, one rule** — which is why doc-4 §7
//! states what a comparison has to answer *the same way in both*: the digit runs. Outside them
//! each side compares its own code units, and the rule asks only that the answer be total and
//! never disagree with itself, so neither implementation constrains the other there.
//!
//! No locale is consulted, on either side: the same ledger must not read differently on two
//! machines (doc-4 §7, the same reason doc-7 §5.4 compares dates as text).

use std::cmp::Ordering;

/// Compare two ids with their digit runs read as numbers (doc-4 §7): `decision-2` before
/// `decision-10`, `m-2` before `m-10`.
///
/// Bytes rather than chars: UTF-8 orders by code point, digits are ASCII, and a multi-byte
/// sequence never starts inside a digit run — so the walk cannot split a character.
pub fn compare_ids(a: &str, b: &str) -> Ordering {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        if let (Some(end_a), Some(end_b)) = (digit_run_end(a, i), digit_run_end(b, j)) {
            match compare_digit_runs(&a[i..end_a], &b[j..end_b]) {
                Ordering::Equal => {
                    i = end_a;
                    j = end_b;
                }
                by_number => return by_number,
            }
            continue;
        }
        if a[i] != b[j] {
            return a[i].cmp(&b[j]);
        }
        i += 1;
        j += 1;
    }
    // One ran out first: the shorter remainder sorts first (`doc-1` before `doc-1.1`).
    (a.len() - i).cmp(&(b.len() - j))
}

/// Where the run of digits starting at `at` ends, or `None` when there is no digit there.
fn digit_run_end(text: &[u8], at: usize) -> Option<usize> {
    let end = at + text[at..].iter().take_while(|b| b.is_ascii_digit()).count();
    (end != at).then_some(end)
}

/// Two runs of digits as numbers, without parsing them into an integer — a Backlog id is not
/// bounded by any integer width this code could rely on, and parsing would make two distinct ids
/// compare equal once past it.
fn compare_digit_runs(a: &[u8], b: &[u8]) -> Ordering {
    let x = strip_leading_zeros(a);
    let y = strip_leading_zeros(b);
    x.len()
        .cmp(&y.len())
        .then_with(|| x.cmp(y))
        // Same value, different spelling (`doc-01` vs `doc-1`): decided by the written form, so
        // two distinct ids never compare equal and fall through to the 読み取り順 that doc-4 §7
        // reserves for two files that really do carry the same id.
        .then_with(|| a.len().cmp(&b.len()))
}

/// `007` → `7`, `000` → `0`. At least one digit is always left.
fn strip_leading_zeros(run: &[u8]) -> &[u8] {
    let kept = run
        .iter()
        .take_while(|b| **b == b'0')
        .count()
        .min(run.len() - 1);
    &run[kept..]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The ids of doc-4 §7's 昇順の例, in the order the doc writes them, read out of the doc.
    ///
    /// The values are the design document's. A copy in this file would be a second place to
    /// change — the shape TASK-164 took out of the text ladder — and it would let the doc and the
    /// code disagree with nothing failing. `src/lib/id-order.test.ts` reads the same line for the
    /// frontend comparator, which is what holds the rule's two implementations to one answer.
    fn doc_examples() -> Vec<String> {
        const MARKER: &str = "- **昇順の例**: ";
        const DOC_4: &str = include_str!(
            "../../../backlog/docs/doc-4 - Backlog-ルートのドメインモデルと読み取り層-設計.md"
        );
        let line = DOC_4
            .lines()
            .find(|line| line.starts_with(MARKER))
            .expect("doc-4 §7 の 昇順の例 の行が読めない");
        let ids: Vec<String> = line[MARKER.len()..]
            .split('。')
            .next()
            .unwrap_or_default()
            .split('→')
            .map(|cell| cell.trim().trim_matches('`').to_string())
            .filter(|id| !id.is_empty())
            .collect();
        // A line the parse failed on would otherwise leave an empty expectation that every
        // comparator satisfies — the 「0 件が正常でありうるかを先に決める」 shape.
        assert!(ids.len() >= 2, "昇順の例 が 2 件未満では順序を固定できない");
        ids
    }

    #[test]
    fn orders_the_ids_doc_4_lists_the_way_the_doc_lists_them() {
        let expected = doc_examples();
        // Reversed rather than shuffled: the input then disagrees with the answer at every
        // adjacent pair, so a comparator that returned a constant could not pass.
        let mut scrambled: Vec<String> = expected.iter().rev().cloned().collect();
        scrambled.sort_by(|a, b| compare_ids(a, b));
        assert_eq!(scrambled, expected);
    }

    #[test]
    fn reads_digit_runs_as_numbers_rather_than_text() {
        assert_eq!(compare_ids("decision-2", "decision-10"), Ordering::Less);
        assert_eq!(compare_ids("m-10", "m-9"), Ordering::Greater);
        assert_eq!(compare_ids("doc-7", "doc-7"), Ordering::Equal);
    }

    /// 桁が異なる: the digits' *value* decides, and the written form only breaks the tie the
    /// value leaves — so `doc-01` and `doc-1` are ordered rather than equal (doc-4 §7).
    #[test]
    fn zero_padding_changes_the_spelling_and_not_the_value() {
        assert_eq!(compare_ids("doc-1", "doc-01"), Ordering::Less);
        assert_eq!(compare_ids("doc-01", "doc-2"), Ordering::Less);
        assert_eq!(compare_ids("doc-0", "doc-00"), Ordering::Less);
    }

    /// 数値部分が無い id is not a special case: the walk compares those positions as bytes, which
    /// is total and self-consistent — all the rule asks of the non-digit part (doc-4 §7).
    #[test]
    fn an_id_without_digits_still_has_a_place() {
        assert_eq!(compare_ids("doc-notes", "doc-10"), Ordering::Greater);
        assert_eq!(compare_ids("notes", "doc-10"), Ordering::Greater);
        assert_eq!(compare_ids("doc-notes", "doc-notes"), Ordering::Equal);
    }

    /// A longer id whose prefix is another id sorts after it (`doc-1` before `doc-1.1`), which is
    /// the loop's exit rather than a rule of its own.
    #[test]
    fn a_prefix_sorts_before_what_extends_it() {
        assert_eq!(compare_ids("doc-1", "doc-1.1"), Ordering::Less);
        assert_eq!(compare_ids("doc-1.1", "doc-1.10"), Ordering::Less);
    }
}
