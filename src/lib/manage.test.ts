import { describe, expect, it } from "vitest";
import {
  DOC_EMPTY_TAGS_REASON,
  DOC_NOTHING_TO_UPDATE_REASON,
  DOC_TITLE_EMPTY_REASON,
  DOC_TITLE_REQUIRED_REASON,
  DOC_TYPES,
  EMPTY_DOC_CREATE,
  EMPTY_MILESTONE_ADD,
  EMPTY_TASK_CREATE,
  MILESTONE_DESCRIPTION_NOT_EDITABLE,
  MILESTONE_NAME_REQUIRED_REASON,
  TASK_TITLE_REQUIRED_REASON,
  WITHHELD_MILESTONE_OPERATIONS,
  buildDocCreate,
  buildDocUpdate,
  buildMilestoneAdd,
  buildTaskCreate,
  docDirtyFields,
  docDivergence,
  isDocDirty,
  issueAvailability,
  outcomeMessage,
  setDocField,
  startDocSession,
  type DocCreateInput,
  type IssuePlan,
  type MilestoneAddInput,
  type TaskCreateInput,
} from "./manage";
import type { CliReadiness, Document } from "./wire";

function taskInput(overrides: Partial<TaskCreateInput> = {}): TaskCreateInput {
  return { ...EMPTY_TASK_CREATE, title: "Add OAuth", ...overrides };
}

function docInput(overrides: Partial<DocCreateInput> = {}): DocCreateInput {
  return { ...EMPTY_DOC_CREATE, title: "運用ガイド", ...overrides };
}

function milestoneInput(overrides: Partial<MilestoneAddInput> = {}): MilestoneAddInput {
  return { ...EMPTY_MILESTONE_ADD, name: "m-2", ...overrides };
}

function document(overrides: Partial<Document> = {}): Document {
  return {
    sourcePath: "/repos/atlas/backlog/docs/doc-4 - 読み取り層.md",
    id: "doc-4",
    title: "読み取り層 設計",
    type: "specification",
    tags: ["read"],
    createdDate: "2026-07-21 10:05",
    updatedDate: null,
    body: "# 読み取り層 設計\n\n本文。\n",
    ...overrides,
  };
}

/** The action of a plan that must be ready — an assertion and a narrowing in one place. */
function action(plan: IssuePlan) {
  expect(plan.state).toBe("ready");
  if (plan.state !== "ready") throw new Error("unreachable");
  return plan.action;
}

function blockedReason(plan: IssuePlan): string {
  expect(plan.state).toBe("blocked");
  if (plan.state !== "blocked") throw new Error("unreachable");
  return plan.reason;
}

const READY: CliReadiness = { state: "ready", version: "1.47.1" };

// --- 新規タスク作成 (doc-5 §3 task create, AC #1) ---------------------------------------------

describe("buildTaskCreate", () => {
  it("maps every field doc-5 §3's create row lists", () => {
    expect(
      action(
        buildTaskCreate(
          taskInput({
            description: "context",
            status: "To Do",
            labels: ["ui", "auth"],
            priority: "high",
            milestone: "m-1",
            acceptanceCriteria: ["login works", "logout works"],
          }),
        ),
      ),
    ).toEqual([
      {
        op: "taskCreate",
        title: "Add OAuth",
        description: "context",
        status: "To Do",
        labels: ["ui", "auth"],
        priority: "high",
        milestone: "m-1",
        acceptanceCriteria: ["login works", "logout works"],
      },
    ]);
  });

  it("omits an unset field instead of sending it empty", () => {
    // An empty `--status` would set a status of ""; leaving it out is what makes `default_status`
    // apply, which is the whole difference between "not filled in" and "cleared".
    expect(action(buildTaskCreate(taskInput()))).toEqual([{ op: "taskCreate", title: "Add OAuth" }]);
  });

  it("drops blank rows from the list fields", () => {
    const [operation] = action(
      buildTaskCreate(taskInput({ labels: ["ui", "  ", ""], acceptanceCriteria: ["  "] })),
    );
    expect(operation).toEqual({ op: "taskCreate", title: "Add OAuth", labels: ["ui"] });
  });

  it("refuses an empty title before building anything", () => {
    expect(blockedReason(buildTaskCreate(taskInput({ title: "   " })))).toBe(
      TASK_TITLE_REQUIRED_REASON,
    );
  });

  it("refuses a label containing a comma, which the CLI would split in two", () => {
    // `--labels` takes one comma-separated value in v1.47.1 (doc-5 §3): "a,b" would become two
    // labels with nothing reporting it.
    expect(blockedReason(buildTaskCreate(taskInput({ labels: ["ui,auth"] })))).toContain("ui,auth");
  });
});

// --- 文書作成 (doc-5 §3 doc create, AC #2) ----------------------------------------------------

describe("buildDocCreate", () => {
  it("maps title・type・path", () => {
    expect(action(buildDocCreate(docInput({ docType: "guide", path: "ops" })))).toEqual([
      { op: "docCreate", title: "運用ガイド", docType: "guide", path: "ops" },
    ]);
  });

  it("leaves type and path off when unset", () => {
    expect(action(buildDocCreate(docInput()))).toEqual([{ op: "docCreate", title: "運用ガイド" }]);
  });

  it("refuses an empty title", () => {
    expect(blockedReason(buildDocCreate(docInput({ title: "" })))).toBe(DOC_TITLE_REQUIRED_REASON);
  });

  it("offers exactly the four types doc-5 §3 fixes", () => {
    expect([...DOC_TYPES]).toEqual(["readme", "guide", "specification", "other"]);
  });
});

// --- 文書更新 (doc-5 §3.2 本文全置換, AC #2) --------------------------------------------------

describe("startDocSession", () => {
  it("seeds the editor with the whole body, since --content full-replaces it", () => {
    const session = startDocSession(document());
    expect(session.draft.content).toBe("# 読み取り層 設計\n\n本文。\n");
    expect(session.draft.tags).toEqual(["read"]);
    // No baseline exists for `-p`, so it starts empty and means 変更しない (see `DocDraft.path`).
    expect(session.draft.path).toBe("");
    expect(isDocDirty(session)).toBe(false);
  });

  it("treats an absent body as an empty one, not as unknown", () => {
    expect(startDocSession(document({ body: null })).draft.content).toBe("");
  });
});

describe("buildDocUpdate", () => {
  it("sends the edited whole body — a partial edit is reduced to the full text", () => {
    const session = setDocField(startDocSession(document()), "content", "# 読み取り層 設計\n\n改訂。\n");
    expect(action(buildDocUpdate(session))).toEqual([
      { op: "docUpdate", docId: "doc-4", update: { content: "# 読み取り層 設計\n\n改訂。\n" } },
    ]);
  });

  it("combines every changed field into one call", () => {
    let session = startDocSession(document());
    session = setDocField(session, "title", "読み取り層 設計（改訂）");
    session = setDocField(session, "docType", "guide");
    session = setDocField(session, "path", "ops");
    session = setDocField(session, "tags", ["read", "doc-4"]);
    expect(action(buildDocUpdate(session))).toEqual([
      {
        op: "docUpdate",
        docId: "doc-4",
        update: {
          title: "読み取り層 設計（改訂）",
          docType: "guide",
          path: "ops",
          tags: ["read", "doc-4"],
        },
      },
    ]);
  });

  it("sends only touched fields, so a reload's change is not reverted by an untouched one", () => {
    const session = setDocField(startDocSession(document()), "tags", ["read", "doc-4"]);
    expect(docDirtyFields(session)).toEqual(["tags"]);
  });

  it("counts a field touched and returned to its original value as unchanged", () => {
    const session = setDocField(startDocSession(document()), "title", "読み取り層 設計");
    expect(isDocDirty(session)).toBe(false);
    expect(blockedReason(buildDocUpdate(session))).toBe(DOC_NOTHING_TO_UPDATE_REASON);
  });

  it("refuses emptying the title", () => {
    const session = setDocField(startDocSession(document()), "title", "  ");
    expect(blockedReason(buildDocUpdate(session))).toBe(DOC_TITLE_EMPTY_REASON);
  });

  it("refuses emptying tags, whose CLI effect v1.47.1 has not been measured for", () => {
    const session = setDocField(startDocSession(document()), "tags", []);
    expect(blockedReason(buildDocUpdate(session))).toBe(DOC_EMPTY_TAGS_REASON);
  });

  it("refuses a tag containing a comma", () => {
    const session = setDocField(startDocSession(document()), "tags", ["read,write"]);
    expect(blockedReason(buildDocUpdate(session))).toContain("read,write");
  });
});

describe("docDivergence", () => {
  it("reports a body the re-read disagrees with — the value --content full-replaced", () => {
    const session = setDocField(startDocSession(document()), "content", "私の全文\n");
    const plan = buildDocUpdate(session);
    if (plan.state !== "ready") throw new Error("unreachable");
    expect(docDivergence(plan.submitted, document({ body: "誰かの全文\n" }))).toEqual(["本文"]);
  });

  it("does not report the CLI's own trailing-whitespace normalization as someone else's change", () => {
    const session = setDocField(startDocSession(document()), "content", "本文\n\n");
    const plan = buildDocUpdate(session);
    if (plan.state !== "ready") throw new Error("unreachable");
    expect(docDivergence(plan.submitted, document({ body: "本文" }))).toEqual([]);
  });

  it("says so when the document left the read result entirely", () => {
    expect(docDivergence({ title: "x" }, null)).toEqual(["文書（再読込結果に見当たりません）"]);
  });

  it("compares tags as a set, and leaves untouched fields out of the comparison", () => {
    const session = setDocField(startDocSession(document()), "tags", ["b", "a"]);
    const plan = buildDocUpdate(session);
    if (plan.state !== "ready") throw new Error("unreachable");
    expect(docDivergence(plan.submitted, document({ tags: ["a", "b"], title: "別の題" }))).toEqual([]);
  });
});

// --- マイルストーン (doc-5 §3.2, doc-9 §4.2, AC #3/#5) ----------------------------------------

describe("buildMilestoneAdd", () => {
  it("sets the description at creation, the only time the CLI can", () => {
    expect(action(buildMilestoneAdd(milestoneInput({ description: "第 2 期" })))).toEqual([
      { op: "milestoneAdd", name: "m-2", description: "第 2 期" },
    ]);
  });

  it("leaves the description off when unset", () => {
    expect(action(buildMilestoneAdd(milestoneInput()))).toEqual([{ op: "milestoneAdd", name: "m-2" }]);
  });

  it("refuses an empty name", () => {
    expect(blockedReason(buildMilestoneAdd(milestoneInput({ name: " " })))).toBe(
      MILESTONE_NAME_REQUIRED_REASON,
    );
  });
});

describe("マイルストーンの提供範囲", () => {
  it("states that a created milestone's description cannot be edited, and why (AC #3)", () => {
    // The reason has to name the CLI constraint, not merely say the control is missing: doc-5 §3.2
    // requires the absence to read as 制約由来.
    expect(MILESTONE_DESCRIPTION_NOT_EDITABLE).toContain("milestone add -d");
    expect(MILESTONE_DESCRIPTION_NOT_EDITABLE).toContain("doc-5 §3.1");
  });

  it("withholds rename・remove・archive with a reason that is not a version divergence", () => {
    expect(WITHHELD_MILESTONE_OPERATIONS.map((entry) => entry.kind)).toEqual([
      "rename",
      "remove",
      "archive",
    ]);
    for (const entry of WITHHELD_MILESTONE_OPERATIONS) {
      // doc-9 §5: it must not read as 更新前競合, and no unchecked run may be offered as a way round.
      expect(entry.reason).toContain("版がずれていることを検出したわけではなく");
      expect(entry.reason).toContain("照合を省いた実行は代替経路として提供しません");
    }
  });

  it("keeps the withheld operations' 操作写像 legible, including reassign's required target", () => {
    const remove = WITHHELD_MILESTONE_OPERATIONS.find((entry) => entry.kind === "remove");
    expect(remove?.mapping).toContain("--task-handling <clear|keep|reassign>");
    expect(remove?.mapping).toContain("--reassign-to <milestone>");
  });
});

// --- 縮退と発行可否 (doc-5 §5) ----------------------------------------------------------------

describe("issueAvailability", () => {
  it("withholds every operation when there is no supported CLI, before the form is even judged", () => {
    // The form is buildable; the CLI is what is missing, and that verdict has to win.
    const available = issueAvailability(buildTaskCreate(taskInput()), {
      readiness: { state: "unavailable", detail: "not on PATH" },
      busy: false,
    });
    expect(available.state).toBe("blocked");
    if (available.state !== "blocked") throw new Error("unreachable");
    expect(available.reason).toContain("PATH 上に backlog CLI が見つからない");
  });

  it("reports 確認中 rather than 'no CLI' while the probe has not answered", () => {
    const available = issueAvailability(
      { state: "ready", action: [] },
      { readiness: null, busy: false },
    );
    expect(available).toEqual({ state: "blocked", reason: "backlog CLI の確認中です" });
  });

  it("passes a form's own reason through once the CLI is supported", () => {
    expect(
      issueAvailability(buildTaskCreate(taskInput({ title: "" })), {
        readiness: READY,
        busy: false,
      }),
    ).toEqual({ state: "blocked", reason: TASK_TITLE_REQUIRED_REASON });
  });

  it("is ready only with a supported CLI, no issue in flight and a buildable form", () => {
    expect(
      issueAvailability(buildTaskCreate(taskInput()), { readiness: READY, busy: false }),
    ).toEqual({ state: "ready" });
    expect(
      issueAvailability(buildTaskCreate(taskInput()), { readiness: READY, busy: true }).state,
    ).toBe("blocked");
  });
});

// --- 結果の提示 (doc-9 §5) --------------------------------------------------------------------

describe("outcomeMessage", () => {
  it("states 更新前競合 as a re-read to retry from, not as a failure", () => {
    const message = outcomeMessage(
      { state: "conflict", path: "/repos/atlas/backlog/docs/doc-4.md" },
      "文書を更新しました",
    );
    expect(message).toContain("CLI を起動せずに中止");
    expect(message).toContain("最新を読み直した");
  });

  it("passes 照合不能 through as the boundary worded it, apart from a conflict", () => {
    expect(outcomeMessage({ state: "uncheckable", detail: "照合不能: milestone rename …" }, "done")).toBe(
      "照合不能: milestone rename …",
    );
  });

  it("names what succeeded on success", () => {
    expect(outcomeMessage({ state: "applied" }, "タスクを作成しました")).toBe("タスクを作成しました");
  });
});
