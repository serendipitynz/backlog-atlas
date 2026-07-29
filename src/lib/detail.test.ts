import { describe, expect, it } from "vitest";
import {
  acProgress,
  commitCountLine,
  commitList,
  degradeSummary,
  dependencyLinks,
  milestoneRef,
  referenceSplit,
  relationAvailability,
  relationLine,
  type HistoryState,
} from "./detail";
import { CANONICAL_COLUMN_LABEL } from "./swimlane";
import { commit, entry, history, pullRequest, snapshot, taskView } from "./fixtures";
import type { TaskHistory } from "./wire";

const PR_URL = "https://github.com/serendipitynz/backlog-atlas/pull/10";
const DOC_URL = "https://example.com/spec";

function loaded(value: TaskHistory): HistoryState {
  return { state: "loaded", history: value };
}

describe("AC #1 heading: 横断タスクID・status の正準対応・milestone", () => {
  it("names every canonical column, so a mapped status can be shown beside its raw value", () => {
    const view = taskView({ status: "Doing", column: "inProgress" });
    expect(view.interpretation.status?.raw).toBe("Doing");
    expect(CANONICAL_COLUMN_LABEL[view.interpretation.status!.column!]).toBe("In Progress");
  });

  it("resolves the milestone id to its title, and marks one that resolves to nothing", () => {
    const view = taskView({ milestone: "m-1" });
    const milestones = [{ id: "m-1", title: "m-1 読み取りと表示", description: null }];
    expect(milestoneRef(view, milestones)).toEqual({ id: "m-1", title: "m-1 読み取りと表示" });
    expect(milestoneRef(view, [])).toEqual({ id: "m-1", title: null });
    expect(milestoneRef(taskView(), milestones)).toBeNull();
  });
});

describe("AC #2 Pull Request URL を References と分離する", () => {
  it("puts extracted PR URLs in one 区画 and leaves the rest as ordinary references", () => {
    const view = taskView({
      references: [DOC_URL, PR_URL],
      pullRequests: [pullRequest(PR_URL, 10)],
    });
    const split = referenceSplit(view);

    expect(split.pullRequests.map((pr) => pr.url)).toEqual([PR_URL]);
    expect(split.references.map((reference) => reference.value)).toEqual([DOC_URL]);
  });

  it("separates a task with no readable TASK-ID too, since References is the only input", () => {
    // doc-6 §4 keys PR extraction on References alone, so a 解析不能 task — which コミット検索
    // cannot even be keyed for — still gets its 区画 split (doc-4 §5 keeps every readable field).
    const view = taskView({
      id: null,
      status: null,
      references: [PR_URL, DOC_URL],
      pullRequests: [pullRequest(PR_URL, 10)],
    });
    const split = referenceSplit(view);

    expect(split.pullRequests.map((pr) => pr.url)).toEqual([PR_URL]);
    expect(split.references.map((reference) => reference.value)).toEqual([DOC_URL]);
  });

  it("marks a reference the read layer reported as 参照欠損", () => {
    const view = taskView({
      references: ["doc-404", DOC_URL],
      health: {
        state: "degraded",
        events: [{ event: "danglingReference", kind: "reference", target: "doc-404" }],
      },
    });

    expect(referenceSplit(view).references).toEqual([
      { value: "doc-404", dangling: true },
      { value: DOC_URL, dangling: false },
    ]);
  });
});

describe("AC #3 AC の checked 可視化と dependencies の未解決印", () => {
  it("counts checked acceptance criteria against the total", () => {
    const view = taskView({
      acceptanceCriteria: [
        { number: 1, text: "one", checked: true },
        { number: 2, text: "two", checked: false },
      ],
    });
    expect(acProgress(view)).toEqual({ checked: 1, total: 2 });
    expect(acProgress(taskView())).toEqual({ checked: 0, total: 0 });
  });

  it("links each dependency to its task and marks the ones that resolve to nothing", () => {
    const target = taskView({ id: "TASK-30", title: "history layer" });
    const view = taskView({ id: "TASK-35", dependencies: ["TASK-30", "TASK-99"] });
    const links = dependencyLinks(view, snapshot("atlas", [target, view]).tasks);

    expect(links.map((link) => link.id)).toEqual(["TASK-30", "TASK-99"]);
    expect(links[0].target?.task.title).toBe("history layer");
    expect(links[1].target).toBeNull();
  });
});

describe("AC #4 Git 履歴欄: コミット一覧と 0 件の扱い", () => {
  it("keeps the commit order the history layer produced (doc-6 §3 新しい順)", () => {
    const newest = commit("aaaaaaaaaa", "TASK-35 latest", "2026-07-24T09:00:00+09:00");
    const older = commit("bbbbbbbbbb", "TASK-35 first", "2026-07-20T09:00:00+09:00");
    const view = commitList(loaded(history({ commits: { state: "searched", commits: [newest, older] } })));

    if (view.state !== "commits") throw new Error("expected a commit list");
    expect(view.commits.map((c) => c.shortId)).toEqual(["aaaaaaa", "bbbbbbb"]);
  });

  it("separates 該当なし, Git 対象不在, a failed Git read and 鍵なし", () => {
    expect(commitList(loaded(history({ commits: { state: "searched", commits: [] } })))).toEqual({
      state: "noCommits",
    });
    expect(
      commitList(loaded(history({ commits: { state: "noRepository", projectRoot: "/repos/x" } }))),
    ).toEqual({ state: "noRepository", projectRoot: "/repos/x" });
    expect(
      commitList(loaded(history({ commits: { state: "unreadable", detail: "git is unavailable" } }))),
    ).toEqual({ state: "unreadable", detail: "git is unavailable" });
    expect(commitList({ state: "noTaskId" })).toEqual({ state: "noTaskId" });
    expect(commitList({ state: "failed", detail: "project is not open" })).toEqual({
      state: "unreadable",
      detail: "project is not open",
    });
  });

  it("tells remote 不在 from a host it cannot reference, and from a determined host", () => {
    const withHost = loaded(history());
    expect(relationAvailability(entry("atlas"), withHost)).toEqual({
      state: "hostDetermined",
      host: "gitHub: serendipitynz/backlog-atlas",
    });

    // decision-6: Git remote 不在 is the ledger attribute being false — not merely an absent host.
    const noHost = loaded(history({ remote: null }));
    expect(relationAvailability(entry("atlas", false), noHost)).toEqual({ state: "remoteAbsent" });
    expect(relationAvailability(entry("atlas", true), noHost)).toEqual({
      state: "hostUndetermined",
    });
    // 読み込み中 must not be said of a read that was never attempted (a task with no TASK-ID).
    expect(relationAvailability(entry("atlas"), { state: "loading" })).toEqual({
      state: "loading",
    });
    const notRead = relationAvailability(entry("atlas"), { state: "noTaskId" });
    if (notRead.state !== "notRead") throw new Error("expected an unattempted read");
    expect(notRead.detail).toContain("TASK-ID");
  });

  // TASK-54 / doc-8 §5: the narrow placements say the same things in one line each.
  it("states the commit count in one line, without folding the absences together", () => {
    const twoCommits = commitList(
      loaded(history({ commits: { state: "searched", commits: [commit("a", "x"), commit("b", "y")] } })),
    );
    expect(commitCountLine(twoCommits)).toEqual({ text: "コミット 2 件", kind: "neutral" });

    // 該当なし stays neutral, 対象不在 stays a setting, a failed read stays a failure (decision-6).
    expect(commitCountLine({ state: "noCommits" }).kind).toBe("neutral");
    expect(commitCountLine({ state: "noRepository", projectRoot: "/repos/x" }).kind).toBe("setting");
    expect(commitCountLine({ state: "unreadable", detail: "git is unavailable" }).kind).toBe(
      "failure",
    );
    expect(commitCountLine({ state: "noTaskId" }).kind).toBe("setting");
  });

  it("replaces 関連 PR の件数 with its state, since an unresolved relation has no count", () => {
    // doc-8 §5 asks the narrow placements for 関連 PR m 件; doc-6 §6 leaves the resolution
    // unimplemented, so every m would be 0 and would read as 関連が無い — which doc-8 §5 forbids.
    const determined = relationLine({ state: "hostDetermined", host: "gitHub: a/b" });
    expect(determined.text).toContain("未実装");
    expect(relationLine({ state: "remoteAbsent" }).text).toContain("remote 不在");
    expect(relationLine({ state: "hostUndetermined" }).kind).toBe("setting");
    expect(relationLine({ state: "notRead", detail: "未照会" }).text).toContain("未照会");
    expect(relationLine({ state: "loading" }).kind).toBe("neutral");
  });
});

describe("AC #5 縮退時は判別できた項目だけを出し、不足を明示する", () => {
  it("groups the degrade events by what each one costs the display", () => {
    const view = taskView({
      status: null,
      health: {
        state: "degraded",
        events: [
          { event: "unparseable", missingRequired: ["id", "title"], detail: "invalid YAML" },
          { event: "unexpectedSchema", detail: "status `Blocked` is not declared in config.yml" },
          { event: "danglingReference", kind: "milestone", target: "m-9" },
        ],
      },
    });
    const summary = degradeSummary(view);

    expect(summary.degraded).toBe(true);
    expect(summary.missingRequired).toEqual(["id", "title"]);
    expect(summary.schemaIssues).toEqual([
      "invalid YAML",
      "status `Blocked` is not declared in config.yml",
    ]);
    expect(summary.danglingReferences).toEqual([{ kind: "milestone", target: "m-9" }]);
  });

  it("reports a healthy task as not degraded, with nothing missing", () => {
    expect(degradeSummary(taskView())).toEqual({
      degraded: false,
      missingRequired: [],
      schemaIssues: [],
      danglingReferences: [],
    });
  });

  it("still separates 参照系 for a completed or archived task", () => {
    // doc-8 §6.5: 編集可否 is per 保存区分, but reading Type・References・PR is not.
    for (const storageState of ["completed", "archive", "draft", null] as const) {
      const split = referenceSplit(
        taskView({
          storageState,
          references: [PR_URL, DOC_URL],
          pullRequests: [pullRequest(PR_URL, 10)],
        }),
      );
      expect(split.pullRequests).toHaveLength(1);
      expect(split.references.map((reference) => reference.value)).toEqual([DOC_URL]);
    }
  });
});
