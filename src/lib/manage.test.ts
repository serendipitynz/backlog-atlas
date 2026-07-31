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
  TASK_CREATE_OMITTED_FIELDS,
  TASK_CREATE_SCOPE_NOTE,
  TASK_TITLE_REQUIRED_REASON,
  WITHHELD_DOCUMENT_OPERATIONS,
  WITHHELD_MILESTONE_OPERATIONS,
  buildDocCreate,
  buildDocUpdate,
  buildMilestoneAdd,
  buildTaskCreate,
  docDirtyFields,
  docDivergence,
  hasDocCreateInput,
  hasMilestoneAddInput,
  hasTaskCreateInput,
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

// --- 新規タスク作成 (doc-5 §3 task create・doc-10 §7 作成時に渡す範囲, AC #1) ------------------

describe("buildTaskCreate", () => {
  it("maps every field the create-time range covers", () => {
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

  it("carries nothing outside the create-time range, whatever the CLI would accept", () => {
    // The range is Atlas's, not v1.47.1's: `task create` also takes `-a`/`--plan`/`--notes`/
    // `--ref`/`--depends-on` and stores them (doc-5 §3, 実測). Keeping the form narrower is the
    // product judgment stated on `TaskCreateInput`, so this fixes what the operation may carry —
    // it is not a record of a CLI limit.
    const [operation] = action(
      buildTaskCreate(taskInput({ description: "context", labels: ["ui"] })),
    );
    expect(Object.keys(operation).sort()).toEqual(["description", "labels", "op", "title"]);
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

  it("lists the description edit beside the three, so every withheld operation is in one 区画", () => {
    // TASK-55 / doc-10 §6: 出さないと決めた操作は、無効化されたボタンとしてではなく名称・写像先・
    // 理由の 3 点で並べる。説明編集だけがヒント文として別扱いだったのを、同じ一覧へ入れた。
    expect(WITHHELD_MILESTONE_OPERATIONS.map((entry) => entry.kind)).toEqual([
      "describe",
      "rename",
      "remove",
      "archive",
    ]);
    for (const entry of WITHHELD_MILESTONE_OPERATIONS) {
      expect(entry.label).not.toBe("");
      expect(entry.mapping).not.toBe("");
    }
  });

  it("withholds rename・remove・archive with a reason that is not a version divergence", () => {
    const uncheckable = WITHHELD_MILESTONE_OPERATIONS.filter((entry) => entry.kind !== "describe");
    expect(uncheckable.map((entry) => entry.kind)).toEqual(["rename", "remove", "archive"]);
    for (const entry of uncheckable) {
      // doc-9 §5: it must not read as 更新前競合, and no unchecked run may be offered as a way round.
      expect(entry.reason).toContain("版がずれていることを検出したわけではなく");
      expect(entry.reason).toContain("照合を省いた実行は代替経路として提供しません");
    }
  });

  it("keeps the description edit out of the 照合不能 family, since its cause is different", () => {
    // 説明編集が無いのは CLI にサブコマンドが無いためで、照合が定まっていないためではない。
    // 照合不能の尾を付けると「照合さえ定まれば出る」と読めてしまう。
    const describe = WITHHELD_MILESTONE_OPERATIONS.find((entry) => entry.kind === "describe");
    expect(describe?.reason).toBe(MILESTONE_DESCRIPTION_NOT_EDITABLE);
    expect(describe?.reason).not.toContain("照合を省いた実行は代替経路として提供しません");
  });

  it("keeps the withheld operations' 操作写像 legible, including reassign's required target", () => {
    const remove = WITHHELD_MILESTONE_OPERATIONS.find((entry) => entry.kind === "remove");
    expect(remove?.mapping).toContain("--task-handling <clear|keep|reassign>");
    expect(remove?.mapping).toContain("--reassign-to <milestone>");
  });
});

// --- 文書の提供しない操作 (doc-10 §5) ----------------------------------------------------------

describe("文書の提供範囲", () => {
  it("withholds the delete with the boundary reason, not with a bare absence", () => {
    expect(WITHHELD_DOCUMENT_OPERATIONS.map((entry) => entry.kind)).toEqual(["remove"]);
    const remove = WITHHELD_DOCUMENT_OPERATIONS[0];
    // 理由は 2 段でなければならない: CLI に無いことと、その不在を Atlas がファイルを直接消して
    // 埋めない（decision-2 の境界）こと。前者だけだと「Atlas が消せばよい」と読める。
    expect(remove.reason).toContain("v1.47.1");
    expect(remove.reason).toContain("decision-2");
    expect(remove.mapping).not.toBe("");
  });
});

// --- 新規タスク区画で欄を出さない項目 (doc-10 §7) ----------------------------------------------

describe("新規タスク作成の範囲", () => {
  it("states the narrowing as a product judgment, never as a missing CLI feature", () => {
    // doc-10 §7 は「CLI に無い」と書くことを禁じている: v1.47.1 の `task create` は実測でこれらを
    // 受け取るので事実に反し、しかも後から CLI を口実に欄を増やす余地を残す。
    expect(TASK_CREATE_SCOPE_NOTE).toContain("製品判断");
    for (const field of TASK_CREATE_OMITTED_FIELDS) {
      expect(field.reason).not.toContain("CLI に無い");
      expect(field.flag).not.toBe("");
      // 省いた項目に作成後の経路があるかは項目ごとに違う (doc-10 §7) ので、どれも経路を持つ。
      expect(field.after).not.toBe("");
    }
  });

  it("covers exactly the fields v1.47.1 accepts and this form does not offer", () => {
    expect(TASK_CREATE_OMITTED_FIELDS.map((field) => field.flag)).toEqual([
      "-a",
      "--plan",
      "--notes",
      "--ref",
      "--depends-on",
    ]);
  });

  it("says that assignee cannot be cleared, since that is the one gap with no route", () => {
    const assignee = TASK_CREATE_OMITTED_FIELDS.find((field) => field.flag === "-a");
    expect(assignee?.after).toContain("解除");
    expect(assignee?.after).toContain("doc-5 §3.1");
  });
});

// --- 未送信入力の検出 (doc-8 §6.3 破棄前確認) --------------------------------------------------

describe("未送信フォームの検出", () => {
  // Review [P2]: a create form is unmounted by a screen switch exactly as an edit session is, so its
  // values have to reach the shell's 破棄前確認 or leaving the tab discards them without a word.
  it("counts an empty form as holding nothing", () => {
    expect(hasTaskCreateInput(EMPTY_TASK_CREATE)).toBe(false);
    expect(hasDocCreateInput(EMPTY_DOC_CREATE)).toBe(false);
    expect(hasMilestoneAddInput(EMPTY_MILESTONE_ADD)).toBe(false);
  });

  it("counts every field of the task form, not only the title", () => {
    expect(hasTaskCreateInput(taskInput({ title: "" }))).toBe(false);
    for (const filled of [
      taskInput({ title: "t" }),
      taskInput({ title: "", description: "d" }),
      taskInput({ title: "", status: "To Do" }),
      taskInput({ title: "", priority: "high" }),
      taskInput({ title: "", milestone: "m-1" }),
      taskInput({ title: "", labels: ["ui"] }),
      taskInput({ title: "", acceptanceCriteria: ["works"] }),
    ]) {
      expect(hasTaskCreateInput(filled)).toBe(true);
    }
  });

  it("does not count whitespace alone as input", () => {
    expect(hasTaskCreateInput(taskInput({ title: "   " }))).toBe(false);
    expect(hasDocCreateInput(docInput({ title: " " }))).toBe(false);
    expect(hasMilestoneAddInput(milestoneInput({ name: " " }))).toBe(false);
  });

  it("counts the doc and milestone forms' own fields", () => {
    expect(hasDocCreateInput(docInput({ title: "", docType: "guide" }))).toBe(true);
    expect(hasDocCreateInput(docInput({ title: "", path: "ops" }))).toBe(true);
    expect(hasMilestoneAddInput(milestoneInput({ name: "", description: "第 2 期" }))).toBe(true);
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
