/**
 * The one rule for values Atlas passes to a CLI option that reads its value as comma-separated
 * (doc-5 §3). Such an option splits the argument it is handed, so a comma *inside* one member is not
 * expressible — it would silently become two members, and nothing downstream would report it. That
 * holds however the values are grouped: whether the option carries the whole set, a delta, or a
 * single entry, what splits is the one value it is given.
 *
 * Held here rather than in the screen module that needed it first: the rule belongs to the 操作写像,
 * and two screens now state it (`manage.ts` for 作成のラベル・文書のタグ, `edit.ts` for assignee・
 * ラベル・依存・References). One home keeps the sentence identical wherever it is shown.
 *
 * **The site is an option the CLI splits, not an option Atlas joins** (TASK-155, measured on
 * v1.50.1 over every option `allowed_options` permits). Seven split: `task create -l`,
 * `task edit -a` / `--add-label` / `--remove-label` / `--depends-on` / `--ref`, and
 * `doc update --tags`. **`--ref` is the one that makes the distinction load-bearing** — Atlas passes
 * it once per reference and joins nothing, and v1.50.1 splits each value anyway, so an enumeration
 * drawn off `join(",")` misses it. **Repeatable does not mean unsplit either way**: `--ac` is
 * repeatable and keeps its comma, `--ref` is repeatable and splits.
 *
 * The pairing of an option with its gate is held by `comma.test.ts` rather than by this paragraph:
 * the option set is taken off the crate, so an eighth option cannot arrive unclassified and leave a
 * sentence here still true.
 *
 * **The two reasons are not one sentence said twice.** What separates them is whose value it is, not
 * whether dropping the comma helps: [`commaReason`] states that a value *supplied for this save*
 * cannot be expressed — every gate but one, `--add-label` included — and what the reader does about it
 * is theirs to choose. It deliberately promises no remedy, because there is not one remedy: a label
 * can be renamed, while a URL's comma belongs to the identifier and dropping it names something else.
 * [`commaRemovalReason`] is for the case where the value is *already on the task and is the argument
 * of its own removal*: `--remove-label "x,y"` exits 0 saying `Updated`, having split the value into
 * two names the task does not have and removed neither. `--remove-label` is the only option in that
 * position — the 全置換 options remove such a member by leaving it out of the value they send, where
 * no comma then appears. The label reached the file by hand (no CLI path writes one), after which the
 * CLI itself preserves it.
 */

import { msg } from "./messages";

/**
 * How much of the offending value the reason quotes. The quote is there to say *which* value has the
 * comma, and a head that long distinguishes it; the whole string would put no bound on the sentence.
 */
const QUOTED_VALUE_LIMIT = 20;

/**
 * Why a comma cannot appear in one member of such a set.
 *
 * The quoted value is cut because this sentence is drawn inside a 固定行 (doc-11 §11), whose height
 * doc-11 §13 bounds: a label is typed by the reader and has no length limit, and quoting it whole put
 * the row at 350.25px of a 367px pane in a 640×480 窓 — under the band the rule requires (measured
 * 2026-08-11, 600 characters). Cut here rather than clamped in CSS: doc-11 §5 wants the reason legible
 * without hovering, and a clamped line moves half of it into a tooltip.
 */
export function commaReason(what: string, value: string): string {
  return msg().field.commaNotAllowed(what, cut(value));
}

/**
 * The quoted head both reasons carry.
 *
 * Cut by code point, not by `slice`: a label may hold an astral character (an emoji is one), and
 * cutting between its two UTF-16 units leaves a lone surrogate that draws as `�` — a character the
 * reader never typed, in the sentence whose whole job is to name the value they did type. The cut
 * still lands inside a grapheme cluster (a ZWJ emoji sequence splits into its parts), which is
 * acceptable where a replacement character is not: the quote is there to identify the value, and a
 * partial sequence identifies while `�` misreports.
 */
function cut(value: string): string {
  const points = [...value];
  return points.length > QUOTED_VALUE_LIMIT
    ? `${points.slice(0, QUOTED_VALUE_LIMIT).join("")}…`
    : value;
}

/**
 * Why a value that already holds a comma cannot be taken off a 増減 field (doc-5 §3.1 沈黙無変更).
 * Reached only from `--remove-label`, and only for a label the read layer found on the task — see the
 * head note for why no other gate has this case.
 */
export function commaRemovalReason(what: string, value: string): string {
  return msg().field.commaValueNotRemovable(what, cut(value));
}

export function firstWithComma(values: readonly string[]): string | undefined {
  return values.find((value) => value.includes(","));
}
