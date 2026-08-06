/**
 * How a task card names its task (doc-7 §3, doc-3 §5.3), and which items each カード情報量 puts on it.
 * Split out from `swimlane.ts` because both the grid and the filter need the identity, and a shared
 * identity is exactly the thing that must not be defined twice — the text filter matches what the
 * card shows.
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-7 §1 カード情報量 | `CardDensity` (`wire.ts`) | the S・M・L setting itself (decision-13) |
 * | doc-7 §3 割当表 | [`cardFields`] | which items a 段 draws, and how many lines its title gets |
 * | doc-7 §3 既定は M | [`DEFAULT_CARD_DENSITY`] | the 段 in force before the settings read answers |
 * | decision-23 priority 3 段 | [`priorityEdge`] | which of the three 優先度の縁 a task draws, if any |
 */

import type { CardDensity, TaskView } from "./wire";

/**
 * 横断タスクID (doc-3 §5.1/§5.3) — always slug-prefixed, because this screen is cross-project.
 * `null` for a 解析不能 file, which has no id to build one from (doc-4 §5).
 */
export function crossTaskId(view: TaskView): string | null {
  const { project, id } = view.task;
  return id === null ? null : `${project}:${id}`;
}

/** The task file's name — the only stable handle a 解析不能 task has (doc-4 §5). */
export function sourceFileName(view: TaskView): string {
  const path = view.task.sourcePath;
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut === -1 ? path : path.slice(cut + 1);
}

/** What the card shows as its identifier, and what the text filter matches against. */
export function cardIdentity(view: TaskView): string {
  return crossTaskId(view) ?? sourceFileName(view);
}

/**
 * Priority values are compared case-insensitively so `High` and `high` are one facet — and so the
 * 絞り込み and the 優先度の縁 agree about which tasks are `high`. Lives here rather than in `filter.ts`
 * for the reason this module exists: what the card shows and what the filter matches must not be
 * derived twice.
 */
export function normalizePriority(priority: string): string {
  return priority.trim().toLowerCase();
}

/** priority 3 段 (decision-23) — the values 優先度の縁 has a colour for. */
export type PriorityStep = "high" | "medium" | "low";

/**
 * Not `edit.ts` の `PRIORITIES`, which happens to hold the same three words. That list is the value
 * range `task edit --priority` accepts — what Atlas may *write*; this one is what the card *colours*,
 * and a file may perfectly well carry a priority the CLI would not take. If the CLI ever accepted a
 * fourth word, that would not by itself give the edge a fourth colour: 優先度色 would have to be added
 * to every 表示テーマ and cleared against the 収録条件 first. Two referents, so two lists.
 */
const PRIORITY_STEPS: readonly PriorityStep[] = ["high", "medium", "low"];

/**
 * Which 優先度の縁 a task draws (decision-23), or `null` for no edge at all.
 *
 * `null` is two states the decision treats alike — **priority 未設定** (the frontmatter has no
 * priority) and **priority 未知** (it has one that is not among the three, e.g. `urgent`). Neither
 * gets an edge: 縁が無いこと itself says 未設定 (decision-6 の中立表示), and guessing an unknown word
 * into one of the three would put a colour on a value the file never gave. The priority チップ goes on
 * showing the word as written either way, so 未知 is not hidden — it is only uncoloured.
 */
export function priorityEdge(priority: string | null): PriorityStep | null {
  if (priority === null) return null;
  const value = normalizePriority(priority);
  // `find` rather than `includes` + a cast: the returned element already has the narrow type, so
  // nothing here asserts that a string is one of the three.
  return PRIORITY_STEPS.find((step) => step === value) ?? null;
}

/** The items doc-7 §3 の割当表 varies by 段, as one card's worth of answers. */
export interface CardFields {
  /** Type チップ (decision-5): M 以上。未設定・未知の表示も含めてこの一行ごと落ちる。 */
  readonly types: boolean;
  /** 通常ラベル (doc-4 の labels の非 kind 要素): L 限定。 */
  readonly labels: boolean;
  /** assignee: L 限定。 */
  readonly assignee: boolean;
  /** title を何行で切り詰めるか (1・2・3)。 */
  readonly titleLines: 1 | 2 | 3;
}

/**
 * doc-7 §3 の割当表。可変長の項目（通常ラベル・assignee）だけが L 限定で、S・M はそれを外すことで
 * title の行数を保証する。
 *
 * 横断タスクID・priority・状態の印はこの表に無い。どの段でも落とさない項目であり (AC #2)、ここに
 * 書けば false を書ける項目になってしまう — 印を落とすと、問題のあるタスクが正常なカードとして
 * 見える。カード情報量は密度の調整であって、異常の隠蔽ではない (doc-7 §3)。
 */
const CARD_FIELDS: Record<CardDensity, CardFields> = {
  s: { types: false, labels: false, assignee: false, titleLines: 1 },
  m: { types: true, labels: false, assignee: false, titleLines: 2 },
  l: { types: true, labels: true, assignee: true, titleLines: 3 },
};

/** What the given 段 draws (doc-7 §3 の割当表). */
export function cardFields(density: CardDensity): CardFields {
  return CARD_FIELDS[density];
}

/**
 * 既定のカード情報量 (doc-7 §3). M rather than L because the two L-only items are variable in count,
 * which makes a card's height unpredictable in the state nobody chose. doc-7 §3 は既定値の正本で、
 * 画面設計案 01 の L とは一致しない。
 *
 * The stored value defaults the same way on the Rust side (`settings.rs` の `CardDensity::default`);
 * this is the 段 the grid draws with while that read is still in flight.
 */
export const DEFAULT_CARD_DENSITY: CardDensity = "m";
