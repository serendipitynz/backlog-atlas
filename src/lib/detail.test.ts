import { describe, expect, it } from "vitest";
import {
  acProgress,
  commitCountLine,
  commitList,
  degradeSummary,
  dependencyLinks,
  milestoneRef,
  pullRequestsByCommit,
  referenceSplit,
  relationAccounts,
  relationAvailability,
  relationLine,
  relationTally,
  type HistoryState,
} from "./detail";
import { CANONICAL_COLUMN_LABEL } from "./swimlane";
import { commit, entry, history, pullRequest, relation, snapshot, taskView } from "./fixtures";
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

  it("states 関連 PR m 件 in one line, and names the cause when some PR did not resolve", () => {
    // doc-8 §5: with a reference means in place (decision-14) the narrow placements go back to
    // 関連 PR m 件 — but a count alone would read as 関連が無い for a PR that could not be reached,
    // so an unresolved cause is named in the same line.
    const determined = { state: "hostDetermined", host: "gitHub: a/b" } as const;
    const empty = loaded(history());
    expect(relationLine(determined, empty).text).toContain("Pull Request URL がありません");

    const mixedHistory = loaded(
      history({
        relations: [
          relation(PR_URL, { state: "resolved", commitIds: ["a1"] }),
          relation(`${PR_URL}1`, { state: "resolved", commitIds: [] }),
          relation(`${PR_URL}2`, { state: "lookupFailed", reason: "queryFailed", detail: "offline" }),
          relation(`${PR_URL}3`, { state: "hostUnsupported" }),
        ],
      }),
    );
    expect(relationTally(mixedHistory)).toEqual({
      related: 1,
      unrelated: 1,
      failed: 1,
      unsupported: 1,
    });
    const line = relationLine(determined, mixedHistory);
    expect(line.text).toBe("関連 PR 1 件（1 件は参照不能・1 件は対象外）");
    // 参照不能 is the only failure family; 対象外 is a property of the host (decision-6 中間).
    expect(line.kind).toBe("failure");
    expect(
      relationLine(
        determined,
        loaded(
          history({
            relations: [
              relation(PR_URL, { state: "resolved", commitIds: ["a1"] }),
              relation(`${PR_URL}1`, { state: "resolved", commitIds: ["b2"] }),
            ],
          }),
        ),
      ),
    ).toEqual({ text: "関連 PR 2 件", kind: "neutral" });

    // 突き合わせる相手が無いときに 0 件と言い切らない: with no local commit list the intersection was
    // never computed, and doc-8 §5 forbids presenting that as 関連が無い.
    const noRepo = loaded(
      history({ commits: { state: "noRepository", projectRoot: "/repos/x" } }),
    );
    expect(relationLine(determined, noRepo)).toEqual({
      text: "関連 PR: 突き合わせ不能（ローカルコミット一覧を読めません）",
      kind: "setting",
    });
    const unreadable = loaded(history({ commits: { state: "unreadable", detail: "git 無し" } }));
    expect(relationLine(determined, unreadable).kind).toBe("failure");

    expect(relationLine({ state: "remoteAbsent" }, empty).text).toContain("remote 不在");
    expect(relationLine({ state: "hostUndetermined" }, empty).kind).toBe("setting");
    expect(relationLine({ state: "notRead", detail: "未照会" }, empty).text).toContain("未照会");
    expect(relationLine({ state: "loading" }, empty).kind).toBe("neutral");
  });

  it("hangs a resolved Pull Request off each commit it contains, and nothing else off any", () => {
    // AC #3: 各コミットに関連 Pull Request を紐づけて表示する。An unreachable PR relates to nothing
    // *yet*, so attaching it to a commit would assert a pairing that was never confirmed.
    const state = loaded(
      history({
        relations: [
          relation(PR_URL, { state: "resolved", commitIds: ["a1", "b2"] }),
          relation(`${PR_URL}1`, { state: "resolved", commitIds: ["b2"] }),
          relation(`${PR_URL}2`, { state: "lookupFailed", reason: "queryFailed", detail: "offline" }),
        ],
      }),
    );
    const byCommit = pullRequestsByCommit(state);
    expect(byCommit.get("a1")).toEqual([PR_URL]);
    expect(byCommit.get("b2")).toEqual([PR_URL, `${PR_URL}1`]);
    expect(byCommit.has("c3")).toBe(false);
  });

  it("writes each cause out for 全面, saying whether it can be cleared", () => {
    // doc-8 §5 全面シングルビュー: 原因ごとの書き分けと、その原因が解消できるかどうか。
    const accounts = relationAccounts(
      loaded(
        history({
          relations: [
            relation(PR_URL, { state: "resolved", commitIds: ["a1"] }),
            relation(`${PR_URL}1`, { state: "resolved", commitIds: [] }),
            relation(`${PR_URL}2`, { state: "lookupFailed", reason: "queryFailed", detail: "offline" }),
            relation(`${PR_URL}3`, { state: "hostUnsupported" }),
          ],
        }),
      ),
    );
    expect(accounts.map((account) => account.kind)).toEqual([
      "neutral",
      "neutral",
      "failure",
      "setting",
    ]);
    expect(accounts[0].text).toContain("コミット 1 件と関連");
    expect(accounts[1].text).toContain("共有コミット無し");
    // 参照不能 は「関連が無い」ではなく「今は確かめられない」であることを、原因によらず書く。
    expect(accounts[2].text).toContain("offline");
    expect(accounts[2].text).toContain("今は確かめられない");
    expect(accounts[3].text).toContain("解消できません");
  });

  it("does not promise a recovery path the payload cannot establish", () => {
    // [P2] review finding: the backend maps a missing tool, a malformed reference and a query that
    // ran and failed to the same 参照不能, and they do not clear the same way. doc-8 §5 asks for
    // whether a cause can be cleared, so the reason travels with it.
    const accountFor = (reason: "toolMissing" | "invalidReference" | "queryFailed") =>
      relationAccounts(
        loaded(history({ relations: [relation(PR_URL, { state: "lookupFailed", reason, detail: "x" })] })),
      )[0].text;

    expect(accountFor("toolMissing")).toContain("gh を導入すれば解消できます");
    expect(accountFor("invalidReference")).toContain("References の URL を直せば解消できます");
    // The one case whose cause is undecidable here must not claim 認証・ネットワークが回復すれば解消.
    const query = accountFor("queryFailed");
    expect(query).toContain("この結果からは分かりません");
    expect(query).not.toContain("すれば解消できます");
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
