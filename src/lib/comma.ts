/**
 * The one rule for values Atlas passes to a CLI option that reads its value as comma-separated
 * (doc-5 §3). Each such option takes the whole set as a single argument, so a comma *inside* one
 * member is not expressible — it would silently become two members, and nothing downstream would
 * report it.
 *
 * Held here rather than in the screen module that needed it first: the rule belongs to the 操作写像,
 * and two screens now state it (`manage.ts` for 作成のラベル・文書のタグ, `edit.ts` for assignee・
 * ラベル・依存). One home keeps the sentence identical wherever it is shown.
 *
 * **Every option `update.rs` comma-joins is a site** — `task create -l`, `task edit -a`,
 * `task edit --add-label` / `--remove-label`, `task edit --depends-on` and `doc update --tags`.
 * TASK-155 closed the last three, and the pairing of an option with its gate is held by
 * `comma.test.ts` rather than by this sentence: the count is taken off `update.rs`, so a seventh
 * option cannot arrive unguarded and leave a paragraph here still true.
 *
 * **The two reasons are not one sentence said twice** (TASK-155, measured on v1.49.3). Where the set
 * travels whole — `-a`, `--depends-on`, `--tags`, `-l` — a comma in a member is a value the reader is
 * typing, and [`commaReason`] says it cannot be expressed. `--add-label` / `--remove-label` carry a
 * *delta*, so a comma-bearing label already on the task is the argument of its own removal:
 * `--remove-label "x,y"` exits 0 saying `Updated`, having split the value into two names the task
 * does not have and removed neither. That one is [`commaRemovalReason`] — nothing the reader retypes
 * changes it, and the value reached the file by hand (the CLI cannot write one), after which the CLI
 * itself preserves it.
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
 * Reached only from the labels facet, and only for a label the read layer found on the task — see the
 * head note for why the 全置換 fields have no such case.
 */
export function commaRemovalReason(what: string, value: string): string {
  return msg().field.commaValueNotRemovable(what, cut(value));
}

export function firstWithComma(values: readonly string[]): string | undefined {
  return values.find((value) => value.includes(","));
}
