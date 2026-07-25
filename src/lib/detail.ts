/**
 * The task detail screen's data, as pure functions (doc-8 §3–§5). Everything the panel decides
 * — which references are Pull Requests, which dependencies resolve, what the Git 履歴欄 is
 * showing — is computed here from the boundary's payloads, so it can be tested without mounting
 * a component. `TaskDetail.svelte` is then markup over these values.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `swimlane.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §1 タスク詳細画面 | `TaskDetail.svelte` | the panel showing one task's every item |
 * | doc-8 §3 見出し | the panel's `<header>` | 横断タスクID＋title・status（正準対応併記）・priority・assignee・milestone |
 * | doc-8 §3 milestone 参照 | [`MilestoneRef`] | the id plus the title it resolves to in this root, or 未解決 |
 * | doc-8 §3 dependencies（未解決印） | [`DependencyLink`] | one dependency id and the task it resolves to, or `null` for 参照欠損 |
 * | doc-8 §4 Pull Request ↔ References 分離 | [`ReferenceSplit`] | the task's references cut into PR URLs and ordinary references |
 * | doc-8 §5 Git 履歴欄 | [`CommitListView`] + [`RelationAvailability`] | what the commit list is showing, and whether 関連解決 could run at all |
 * | decision-6 コミット該当なし / Git 対象不在 | [`CommitListView`] states `noCommits` / `noRepository` | searched-and-empty (neutral) vs. the root not being a Git repository |
 * | decision-6 Git remote 不在 | [`RelationAvailability`] state `remoteAbsent` | the ledger's Git remote 有無属性 is false — a setting, not a failure |
 * | doc-4 §5 縮退表示（不足内容） | [`DegradeSummary`] | the task's degrade events grouped by what each one costs the display |
 * | doc-8 §3 AC の checked 状態 | [`AcProgress`] | how many acceptance criteria are checked, of how many |
 *
 * Two rules the whole module follows:
 *
 * - **Separation is post-processing, never a rewrite** (doc-8 §4). The PR/References split reads
 *   the extraction the Rust side already did (doc-6 §4's rule, defined once, in `history.rs`)
 *   and subtracts it; no URL is parsed or rewritten here.
 * - **An absent thing says which absence it is** (decision-6). Nothing here folds 該当なし,
 *   対象不在, 読取不能 and 未取得 into one empty value, because the user's next action differs.
 */

import type {
  Commit,
  CommitSearch,
  DegradeEvent,
  Milestone,
  ProjectEntry,
  PullRequestRef,
  ReferenceKind,
  RequiredField,
  TaskHistory,
  TaskView,
} from "./wire";

/**
 * The panel's own state for one task's Git・PR 履歴 read (doc-6). `noTaskId` is not a failure of
 * the read but a refusal to attempt it: コミット検索 keys on the TASK-ID (doc-6 §3), and a 解析不能
 * file has none — the 不足 doc-8 §3 asks to be stated rather than an empty list to be shown.
 */
export type HistoryState =
  | { state: "loading" }
  | { state: "loaded"; history: TaskHistory }
  | { state: "failed"; detail: string }
  | { state: "noTaskId" };

/** A milestone reference from the heading: the id, and the title it resolves to in this root. */
export interface MilestoneRef {
  id: string;
  /** `null` is 参照欠損 (doc-4 §5): the id names no milestone in this root. */
  title: string | null;
}

export function milestoneRef(view: TaskView, milestones: readonly Milestone[]): MilestoneRef | null {
  const id = view.task.milestone;
  if (id === null) return null;
  return { id, title: milestones.find((m) => m.id === id)?.title ?? null };
}

/**
 * One `dependencies` entry (doc-8 §3): the id, and the task it points at so the panel can offer
 * 解決先タスクへ辿れる. `target === null` is the 未解決印 — the read layer does not raise 参照欠損
 * for dependencies (it checks milestone/documentation/references only), so resolution happens
 * here against the same snapshot the panel was opened from.
 */
export interface DependencyLink {
  id: string;
  target: TaskView | null;
}

export function dependencyLinks(
  view: TaskView,
  tasks: readonly TaskView[],
): DependencyLink[] {
  return view.task.dependencies.map((id) => ({
    id,
    target: tasks.find((candidate) => candidate.task.id === id) ?? null,
  }));
}

/** An ordinary reference — everything the PR 抽出 did not claim (doc-8 §4). */
export interface PlainReference {
  value: string;
  /** True when the read layer flagged this reference as 参照欠損 (doc-4 §5). */
  dangling: boolean;
}

/**
 * The task's references cut into the two 区画 doc-8 §4 requires. `pending`/`unavailable` keep the
 * References 区画 visible while stating that the separation has not been applied: showing the
 * list as if it were already PR-free would be a claim the screen cannot make yet.
 */
export type ReferenceSplit =
  | { state: "split"; pullRequests: PullRequestRef[]; references: PlainReference[] }
  | { state: "pending"; references: PlainReference[] }
  | { state: "unavailable"; references: PlainReference[]; detail: string };

export function referenceSplit(view: TaskView, history: HistoryState): ReferenceSplit {
  const dangling = new Set(
    degradeEvents(view).flatMap((event) =>
      event.event === "danglingReference" && event.kind === "reference" ? [event.target] : [],
    ),
  );
  const all = view.task.references.map((value) => ({ value, dangling: dangling.has(value) }));

  switch (history.state) {
    case "loading":
      return { state: "pending", references: all };
    case "failed":
      return { state: "unavailable", references: all, detail: history.detail };
    case "noTaskId":
      return {
        state: "unavailable",
        references: all,
        detail: "TASK-ID が読めないため、この画面から PR URL 抽出を実行できません",
      };
    case "loaded": {
      // Matched on the verbatim URL: doc-6 §4 keeps `url` exactly as References wrote it, so the
      // extracted set is a subset of this list and set difference is the whole separation.
      const extracted = new Set(history.history.pullRequests.map((pr) => pr.url));
      return {
        state: "split",
        pullRequests: history.history.pullRequests,
        references: all.filter((reference) => !extracted.has(reference.value)),
      };
    }
  }
}

/**
 * What the Git 履歴欄's commit list is showing (doc-8 §5, decision-6). `noCommits` is the neutral
 * 該当なし — 対応コミット無し, which is a normal state for an unstarted task — and is deliberately
 * a different value from `noRepository` (Git 対象不在) and `unreadable` (a Git read that failed).
 */
export type CommitListView =
  | { state: "commits"; commits: Commit[] }
  | { state: "noCommits" }
  | { state: "noRepository"; projectRoot: string }
  | { state: "unreadable"; detail: string }
  | { state: "noTaskId" }
  | { state: "loading" };

export function commitList(history: HistoryState): CommitListView {
  switch (history.state) {
    case "loading":
      return { state: "loading" };
    case "noTaskId":
      return { state: "noTaskId" };
    case "failed":
      return { state: "unreadable", detail: history.detail };
    case "loaded":
      return fromCommitSearch(history.history.commits);
  }
}

function fromCommitSearch(search: CommitSearch): CommitListView {
  switch (search.state) {
    case "searched":
      // Order is doc-6 §3's contract (新しい順, git log's own order) and is not re-sorted here:
      // re-deriving it from `date` would be a second ordering rule that could quietly disagree.
      return search.commits.length === 0
        ? { state: "noCommits" }
        : { state: "commits", commits: search.commits };
    case "noRepository":
      return { state: "noRepository", projectRoot: search.projectRoot };
    case "unreadable":
      return { state: "unreadable", detail: search.detail };
  }
}

/**
 * Whether コミット・PR 関連解決 could run for this task (doc-6 §5/§6, decision-6). The three
 * states are separated because they are undone differently: `remoteAbsent` is a ledger attribute
 * the user can fix, `hostUndetermined` is a host Atlas cannot reference, and `hostDetermined`
 * means the gate is open — the relation is still unresolved in this build (doc-6 §6 leaves each
 * host's reference means to a per-kind addition), which is a fourth fact the panel states.
 */
export type RelationAvailability =
  | { state: "hostDetermined"; host: string }
  | { state: "remoteAbsent" }
  | { state: "hostUndetermined" }
  | { state: "loading" }
  /** The read that would have decided this never happened — and `detail` says why. */
  | { state: "notRead"; detail: string };

export function relationAvailability(
  entry: ProjectEntry | null,
  history: HistoryState,
): RelationAvailability {
  // 読み込み中 and 未照会 are different claims: only the first is going to resolve on its own.
  if (history.state === "loading") return { state: "loading" };
  if (history.state === "failed") return { state: "notRead", detail: history.detail };
  if (history.state === "noTaskId") {
    return {
      state: "notRead",
      detail: "TASK-ID が読めないため remote ホストを照会していません",
    };
  }
  const remote = history.history.remote;
  if (remote !== null) {
    return { state: "hostDetermined", host: `${remote.kind}: ${remote.owner}/${remote.repo}` };
  }
  // decision-6 defines Git remote 不在 as the ledger's Git remote 有無属性 being false, so that
  // attribute — not the absent host — is what tells the two apart.
  return entry?.git_remote_present === false
    ? { state: "remoteAbsent" }
    : { state: "hostUndetermined" };
}

/** AC の checked 状態 (doc-8 §3), as a count for the section heading. */
export interface AcProgress {
  checked: number;
  total: number;
}

export function acProgress(view: TaskView): AcProgress {
  const items = view.task.acceptanceCriteria;
  return { checked: items.filter((item) => item.checked).length, total: items.length };
}

/**
 * 縮退表示の不足内容 (doc-4 §5, doc-8 §3), grouped by what each event costs the display: which
 * required fields could not be read, which values were out of range, and which references
 * resolve to nothing. Grouped rather than listed flat so the panel can put each mark where the
 * missing thing would have been, and still show the rest of the task.
 */
export interface DegradeSummary {
  degraded: boolean;
  /** id / title / status that could not be read — the fields the heading has to do without. */
  missingRequired: RequiredField[];
  /** 想定外スキーマ details (unknown status, unknown SECTION, broken structure). */
  schemaIssues: string[];
  danglingReferences: { kind: ReferenceKind; target: string }[];
}

export function degradeSummary(view: TaskView): DegradeSummary {
  const summary: DegradeSummary = {
    degraded: view.task.health.state === "degraded",
    missingRequired: [],
    schemaIssues: [],
    danglingReferences: [],
  };
  for (const event of degradeEvents(view)) {
    switch (event.event) {
      case "unparseable":
        summary.missingRequired.push(...event.missingRequired);
        if (event.detail !== null) summary.schemaIssues.push(event.detail);
        break;
      case "unexpectedSchema":
        summary.schemaIssues.push(event.detail);
        break;
      case "danglingReference":
        summary.danglingReferences.push({ kind: event.kind, target: event.target });
        break;
    }
  }
  return summary;
}

function degradeEvents(view: TaskView): DegradeEvent[] {
  return view.task.health.state === "degraded" ? view.task.health.events : [];
}
