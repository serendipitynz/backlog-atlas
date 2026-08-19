/**
 * 保留判定 と 保留理由 を 1 つの値の別々の欄として持つ形 (doc-11 §5).
 *
 * The tag is the 保留判定 and `reason` rides beside it, so neither half can be dropped without the
 * other going with it. That is the whole point of the shape: a `string | null` whose non-null half
 * *is* the judgement breaks in the direction doc-11 §5 names — the 目視 pass that replaces a 理由文
 * with `null` also stops the control being withheld, and nothing on screen says the control changed.
 * `ProjectDetail.svelte` の概要区画 broke exactly that way before TASK-127.
 *
 * Written down once rather than per module because the shape was reproduced at 17 sites and kept
 * coming back at new ones: TASK-127's enumeration named 8 on 2026-08-08, one of which TASK-144 closed,
 * and TASK-128 counted 17 on 2026-08-19 — the 10 it added include three written *after* the rule was
 * (`laneDragHold`, `dropAskBlocked`, and the pair in `App.svelte`). Modules that
 * carry more than these two facts keep their own type — `IssuePlan` and `IssueAvailability`
 * (`manage.ts`), `RedetectControl` and `OverviewSave` (`project-detail.ts`), `EditAvailability`
 * (`edit.ts`) — because a label or a third state is theirs, not this type's.
 *
 * **Build the judgement from the cause, never from the reason's nullness.** `{ enabled, reason }`
 * pairs satisfy the letter of §5 and still break when `enabled` is written as `reason === null`;
 * `openLocationAvailability` (`settings.ts`) is the pair done right — each branch writes both fields
 * together.
 */
export type Availability = { state: "ready" } | { state: "withheld"; reason: string };

/** 押せる控え. A value rather than a literal per site, since it carries no per-site information. */
export const AVAILABLE: Availability = { state: "ready" };

/** 保留中の控え, with what the screen says about it. */
export function withheld(reason: string): Availability {
  return { state: "withheld", reason };
}
