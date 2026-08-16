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
 * | doc-8 §3 見出し | the panel's `<header>` | the three fixed rows: 横断タスクID＋ID コピー＋印＋前後移動＋位置＋3 配置切替＋閉じる / title＋編集入口 / 主要属性 |
 * | doc-8 §3 主要属性 | the `<header>`'s `<dl>` | status（正準対応併記）・priority・保存区分・milestone・created・updated の 6 つ、3 段 2 列。assignee は本文側、ファイルパスは外部エディタ区画 |
 * | doc-8 §3 milestone 参照 | [`MilestoneRef`] | the id plus the title it resolves to in this root, or 未解決 |
 * | doc-8 §3 dependencies（未解決印） | [`DependencyLink`] | one dependency id and the task it resolves to, or `null` for 参照欠損 |
 * | doc-8 §4 Pull Request ↔ References 分離 | [`ReferenceSplit`] | the task's references cut into PR URLs and ordinary references |
 * | doc-6 §3 コミット検索の実行状態 | [`HistoryState`] | the panel's own state for the Git read: loading / read / failed / not keyable |
 * | doc-8 §5 Git 履歴欄 | [`CommitListView`] + [`RelationAvailability`] | what the commit list is showing, and whether 関連解決 could run at all |
 * | doc-6 §6 コミット・PR 関連解決の結果 | [`RelationTally`] + [`relationAccounts`] | how many PRs landed in each outcome, and what each one's outcome was |
 * | doc-8 §5 各コミットに関連 Pull Request を紐づけて示す | [`pullRequestsByCommit`] | the resolution read the other way round: commit id → the PRs it belongs to |
 * | doc-8 §5 配置ごとの粒度（件数のみ） | [`commitCountLine`] + [`relationLine`] | the same two facts in one line each, for the narrow placements |
 * | decision-6 コミット該当なし / Git 対象不在 | [`CommitListView`] states `noCommits` / `noRepository` | searched-and-empty (neutral) vs. the root not being a Git repository |
 * | decision-6 Git remote 不在 | [`RelationAvailability`] state `remoteAbsent` | the ledger's Git remote 有無属性 is false — a setting, not a failure |
 * | doc-8 §3 AC の checked 状態 | [`AcProgress`] | how many acceptance criteria are checked, of how many |
 *
 * Two rules the whole module follows:
 *
 * - **Separation is post-processing, never a rewrite** (doc-8 §4). The PR/References split reads
 *   the extraction the interpretation already carries (doc-6 §4's rule, defined once, in
 *   `history.rs`) and subtracts it; no URL is parsed or rewritten here.
 * - **An absent thing says which absence it is** (decision-6). Nothing here folds 該当なし,
 *   対象不在, 読取不能 and 未取得 into one empty value, because the user's next action differs.
 */

import type {
  AcceptanceCriterion,
  Commit,
  CommitSearch,
  DegradeEvent,
  LookupFailure,
  Milestone,
  PrRelation,
  ProjectEntry,
  PullRequestRef,
  ReferenceKind,
  RequiredField,
  TaskHistory,
  TaskView,
} from "./wire";
import { lookupFailureText } from "./failure";
import { msg } from "./messages";

/**
 * Why 横断タスクID のコピー (doc-8 §2.2) cannot be offered for this task: the read layer could not get a
 * TASK-ID out of the file (doc-4 §5 の解析不能), and the id is built from it (doc-3 §5.3).
 *
 * One string for the two places the screen says it — the control's `title` and the sentence beside it
 * (doc-11 §5 wants the reason readable without hovering). Written out twice they would drift, and the
 * same refusal would be worded two ways in one line.
 */
export function crossIdUnavailable(): string {
  return msg().taskDetail.crossIdUnavailable;
}

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
  if (id === null) {
    return null;
  }
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

/** The task's references cut into the two 区画 doc-8 §4 requires. */
export interface ReferenceSplit {
  pullRequests: PullRequestRef[];
  references: PlainReference[];
}

/**
 * Separate Pull Request URLs from ordinary references (doc-8 §4). A pure function of the task and
 * its interpretation — no Git read is involved — so the two 区画 are populated the moment the
 * panel opens, for every task the read layer produced (doc-8 §6.5 参照系, doc-4 §5 不整合表示).
 */
export function referenceSplit(view: TaskView): ReferenceSplit {
  const dangling = new Set(
    degradeEvents(view).flatMap((event) =>
      event.event === "danglingReference" && event.kind === "reference" ? [event.target] : [],
    ),
  );
  const pullRequests = view.interpretation.pullRequests;
  // Matched on the verbatim URL: doc-6 §4 keeps `url` exactly as References wrote it, so the
  // extracted set is a subset of this list and set difference is the whole separation.
  const extracted = new Set(pullRequests.map((pr) => pr.url));
  return {
    pullRequests,
    references: view.task.references
      .filter((value) => !extracted.has(value))
      .map((value) => ({ value, dangling: dangling.has(value) })),
  };
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
 * means the gate is open — the resolution ran, and its per-PR outcomes are in
 * [`relationAccounts`] / [`relationTally`].
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
  if (history.state === "loading") {
    return { state: "loading" };
  }
  if (history.state === "failed") {
    return { state: "notRead", detail: history.detail };
  }
  if (history.state === "noTaskId") {
    return {
      state: "notRead",
      detail: msg().gitHistory.noTaskIdForRemote,
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

/**
 * One line of Git 履歴欄, for the placements that show it in less than full (doc-8 §5 配置ごとの粒度).
 * `kind` is the same three families the full rendering uses — 正常な不在 は中立、設定で解消できるものは
 * 中間、失敗だけが族の色 (decision-6) — so narrowing the placement narrows the text and nothing else.
 */
export interface HistoryLine {
  text: string;
  kind: "neutral" | "setting" | "failure";
}

/** コミット一覧を件数で言い切る 1 行 (doc-8 §5 併置サイドバーの 件数のみ). */
export function commitCountLine(view: CommitListView): HistoryLine {
  const text = msg().gitHistory;
  switch (view.state) {
    case "commits":
      return { text: text.commitCount(view.commits.length), kind: "neutral" };
    case "noCommits":
      return { text: text.noCommitsShort, kind: "neutral" };
    case "noRepository":
      return { text: text.noRepositoryShort(view.projectRoot), kind: "setting" };
    case "unreadable":
      return { text: text.unreadable(view.detail), kind: "failure" };
    case "noTaskId":
      return { text: text.noTaskIdShort, kind: "setting" };
    case "loading":
      return { text: msg().state.loading, kind: "neutral" };
  }
}

/**
 * How the task's Pull Requests came out of 関連解決 (doc-6 §6). Counted once and used by both
 * granularities, so the 1 行 of a narrow placement and the per-cause account of 全面 can never
 * disagree about how many PRs there were.
 *
 * `related` is doc-8 §5's *m* in 関連 PR m 件. `unrelated` is kept apart from it because a PR that
 * was queried and shares no commit is a resolved answer, while `failed` means 今は確かめられない.
 */
export interface RelationTally {
  related: number;
  unrelated: number;
  failed: number;
  unsupported: number;
}

function relationsOf(history: HistoryState): PrRelation[] {
  return history.state === "loaded" ? history.history.relations : [];
}

export function relationTally(history: HistoryState): RelationTally {
  const tally: RelationTally = { related: 0, unrelated: 0, failed: 0, unsupported: 0 };
  for (const relation of relationsOf(history)) {
    switch (relation.outcome.state) {
      case "resolved":
        if (relation.outcome.commitIds.length > 0) {
          tally.related += 1;
        } else {
          tally.unrelated += 1;
        }
        break;
      case "lookupFailed":
        tally.failed += 1;
        break;
      case "hostUnsupported":
        tally.unsupported += 1;
        break;
    }
  }
  return tally;
}

/**
 * 各コミットに関連 Pull Request を紐づける (doc-8 §5) — the resolution read from the commit's side.
 * Only `resolved` outcomes contribute: a PR that could not be looked up relates to nothing *yet*, and
 * hanging it off a commit would assert a pairing that was never confirmed.
 */
export function pullRequestsByCommit(history: HistoryState): Map<string, string[]> {
  const byCommit = new Map<string, string[]>();
  for (const relation of relationsOf(history)) {
    if (relation.outcome.state !== "resolved") {
      continue;
    }
    for (const commitId of relation.outcome.commitIds) {
      const urls = byCommit.get(commitId);
      if (urls) {
        urls.push(relation.pullRequest);
      } else {
        byCommit.set(commitId, [relation.pullRequest]);
      }
    }
  }
  return byCommit;
}

/** One Pull Request's outcome written out, for 全面シングルビュー (doc-8 §5 原因ごとの書き分け). */
export interface RelationAccount {
  pullRequest: string;
  text: string;
  kind: HistoryLine["kind"];
}

/**
 * 原因ごとに書き分けた関連解決の状態と、その原因が解消できるかどうか (doc-8 §5 全面シングルビュー).
 * One entry per extracted Pull Request, in the order the task's References gave them.
 */
export function relationAccounts(history: HistoryState): RelationAccount[] {
  return relationsOf(history).map(({ pullRequest, outcome }) => {
    switch (outcome.state) {
      case "resolved":
        return outcome.commitIds.length > 0
          ? {
              pullRequest,
              text: msg().gitHistory.accountRelated(outcome.commitIds.length),
              kind: "neutral" as const,
            }
          : {
              pullRequest,
              text: msg().gitHistory.accountUnrelated,
              kind: "neutral" as const,
            };
      case "hostUnsupported":
        return {
          pullRequest,
          text: msg().gitHistory.accountUnsupported,
          kind: "setting" as const,
        };
      case "lookupFailed":
        return {
          pullRequest,
          // 「関連が無い」ではなく「今は確かめられない」であることは 4 つの原因に共通し、解消の
          // 手掛かりだけが原因ごとに違う (doc-8 §5). 解消経路を payload から確定できない
          // `queryFailed` に、確定できるかのような文言を当てない。
          text: msg().gitHistory.accountFailed(
            lookupFailureText(outcome.reason, outcome.detail),
            lookupRemedy(outcome.reason),
          ),
          kind: "failure" as const,
        };
    }
  });
}

/** その原因が解消できるかどうか (doc-8 §5), per [`LookupFailure`]. */
function lookupRemedy(reason: LookupFailure): string {
  const text = msg().gitHistory.remedy;
  switch (reason.reason) {
    case "toolMissing":
      return text.toolMissing;
    case "invalidReference":
      return text.invalidReference;
    case "queryFailed":
      return text.queryFailed;
    case "timedOut":
      // `queryFailed` と別に書ける唯一の理由: 打ち切ったのは Atlas 自身なので、何が起きたかは
      // 分かっている (decision-19)。解消は約束しないが、再取得で変わり得ることは言える。
      return text.timedOut;
  }
}

/**
 * 関連 PR を 1 行で言う (doc-8 §5). Now that a reference means exists (decision-14), doc-8 §5's 関連 PR
 * m 件 is what the narrow placements show. The line still names the cause when some PR did not
 * resolve — 関連解決の状態 means 今は確かめられない rather than 関連が無い, so a bare count would be the
 * misreading doc-8 §5 forbids — while the per-cause account stays in 全面.
 */
export function relationLine(
  availability: RelationAvailability,
  history: HistoryState,
): HistoryLine {
  switch (availability.state) {
    case "hostDetermined": {
      // 突き合わせる相手が無ければ m は言えない: relation resolution intersects with the task's local
      // commits (doc-6 §6), so with no commit list every count would be 0 and would read as 関連が無い.
      const commits = commitList(history);
      if (commits.state !== "commits" && commits.state !== "noCommits") {
        return {
          text: msg().gitHistory.relationNoCommitList,
          kind: commits.state === "unreadable" ? "failure" : "setting",
        };
      }
      const line = msg().gitHistory;
      const tally = relationTally(history);
      const total = tally.related + tally.unrelated + tally.failed + tally.unsupported;
      if (total === 0) {
        return { text: line.relationNoUrls, kind: "neutral" };
      }
      const caveats: string[] = [];
      if (tally.failed > 0) {
        caveats.push(line.relationCaveatFailed(tally.failed));
      }
      if (tally.unsupported > 0) {
        caveats.push(line.relationCaveatUnsupported(tally.unsupported));
      }
      const text =
        caveats.length > 0
          ? line.relationCountWithCaveats(
              tally.related,
              caveats.join(msg().state.listSeparator),
            )
          : line.relationCount(tally.related);
      // 参照不能 is the only failure family here; 対象外 is a property of the host, which decision-6
      // puts in the 中間 family beside the other things a setting explains.
      const kind = tally.failed > 0 ? "failure" : tally.unsupported > 0 ? "setting" : "neutral";
      return { text, kind };
    }
    case "remoteAbsent":
      return { text: msg().gitHistory.relationRemoteAbsent, kind: "setting" };
    case "hostUndetermined":
      return { text: msg().gitHistory.relationHostUndetermined, kind: "setting" };
    case "notRead":
      return { text: msg().gitHistory.relationNotRead(availability.detail), kind: "setting" };
    case "loading":
      return { text: msg().state.loading, kind: "neutral" };
  }
}

/** AC の checked 状態 (doc-8 §3), as a count for the section heading. */
export interface AcProgress {
  checked: number;
  total: number;
}

/**
 * The same count over any `#N` checklist. Definition of Done items are the acceptance criteria's
 * shape written by the same CLI code (doc-4 §4), so the two 区画 count through one function rather
 * than each holding its own — a second copy is where `checked` and `total` would come to disagree.
 */
export function checklistProgress(items: AcceptanceCriterion[]): AcProgress {
  return { checked: items.filter((item) => item.checked).length, total: items.length };
}

export function acProgress(view: TaskView): AcProgress {
  return checklistProgress(view.task.acceptanceCriteria);
}

/**
 * 達成割合 (doc-8 §3): the checked count over the total. **It has no value when the total is 0.**
 *
 * Not 0 — a task carrying no criteria and a task with none of them done are different things, and the
 * 区画見出し falls back to the thin 区画境界 when the value is absent. Returning 0 would draw `0 / 0`
 * and `0 / 3` as the same bar, which is what doc-11 §6 forbids for 正常な不在.
 */
export function acRatio(progress: AcProgress): number | null {
  return progress.total === 0 ? null : progress.checked / progress.total;
}

function degradeEvents(view: TaskView): DegradeEvent[] {
  return view.task.health.state === "degraded" ? view.task.health.events : [];
}
