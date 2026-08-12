/**
 * The one rule for values Atlas passes to a CLI option that reads its value as comma-separated
 * (doc-5 §3): `task create -l`, `doc update --tags`, and `task edit -a`. Each of those takes the
 * whole set as a single argument, so a comma *inside* one member is not expressible — it would
 * silently become two members, and nothing downstream would report it.
 *
 * Held here rather than in the screen module that needed it first: the rule belongs to the 操作写像,
 * and two screens now state it (`manage.ts` for ラベル・タグ, `edit.ts` for assignee). One home keeps
 * the sentence identical wherever it is shown.
 */

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
  // Cut by code point, not by `slice`: a label may hold an astral character (an emoji is one), and
  // cutting between its two UTF-16 units leaves a lone surrogate that draws as `�` — a character the
  // reader never typed, in the sentence whose whole job is to name the value they did type. The cut
  // still lands inside a grapheme cluster (a ZWJ emoji sequence splits into its parts), which is
  // acceptable where a replacement character is not: the quote is there to identify the value, and a
  // partial sequence identifies while `�` misreports.
  const points = [...value];
  const quoted =
    points.length > QUOTED_VALUE_LIMIT ? `${points.slice(0, QUOTED_VALUE_LIMIT).join("")}…` : value;
  return (
    `${what}に「,」を含められません（1 個のカンマ区切り値として扱われるため、` +
    `「${quoted}」は 2 件に分かれます）`
  );
}

export function firstWithComma(values: readonly string[]): string | undefined {
  return values.find((value) => value.includes(","));
}
