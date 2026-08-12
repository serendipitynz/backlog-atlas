import { describe, expect, it } from "vitest";
import {
  DOC_NOTHING_TO_UPDATE_REASON,
  DOC_TITLE_EMPTY_REASON,
  DOC_TITLE_REQUIRED_REASON,
  DOC_TYPES,
  EMPTY_DOC_CREATE,
  EMPTY_MILESTONE_ADD,
  EMPTY_MILESTONE_REMOVE,
  EMPTY_MILESTONE_RENAME,
  EMPTY_TASK_CREATE,
  MILESTONE_KEEP_LEAVES_DANGLING_REFERENCES,
  MILESTONE_NAME_REQUIRED_REASON,
  MILESTONE_REASSIGN_TARGET_IS_SELF_REASON,
  MILESTONE_REASSIGN_TARGET_REQUIRED_REASON,
  MILESTONE_REMOVE_HANDLING_REQUIRED_REASON,
  MILESTONE_REMOVE_MOVES_THE_FILE,
  MILESTONE_RENAME_REQUIRED_REASON,
  MILESTONE_RENAME_UNCHANGED_REASON,
  TASK_CREATE_LATER_FIELDS,
  TASK_CREATE_NOTE,
  TASK_TITLE_REQUIRED_REASON,
  MILESTONE_DESCRIPTION_HEADING_REASON,
  MILESTONE_DESCRIPTION_UNCHANGED_REASON,
  buildDocCreate,
  buildDocUpdate,
  buildMilestoneAdd,
  buildMilestoneArchive,
  buildMilestoneDescribe,
  buildMilestoneRemove,
  buildMilestoneRename,
  buildTaskCreate,
  followsReferences,
  referencingTasks,
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
import { readinessReason } from "./edit";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import { taskView } from "./fixtures";
import type { CliReadiness, DocUpdate, Document, Milestone } from "./wire";

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
    health: { state: "ok" },
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

const READY: CliReadiness = { state: "ready", version: CONFIRMED_CLI_VERSION };

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
    // The range is Atlas's, not v1.48.0's: `task create` also takes `-a`/`--plan`/`--notes`/
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
    // `--labels` takes one comma-separated value in v1.48.0 (doc-5 §3): "a,b" would become two
    // labels with nothing reporting it.
    expect(blockedReason(buildTaskCreate(taskInput({ labels: ["ui,auth"] })))).toContain("ui,auth");
  });

  it("bounds the reason, because the label it quotes is typed by the reader", () => {
    // The sentence is drawn inside a 固定行 whose height doc-11 §13 bounds, and a label has no length
    // limit — quoting one whole put the row past the band the rule requires (実測 2026-08-11).
    const long = `ui,${"あ".repeat(600)}`;
    const reason = blockedReason(buildTaskCreate(taskInput({ labels: [long] })));
    expect(reason).not.toContain(long);
    // Still says *which* label: the head is what distinguishes it from the others.
    expect(reason).toContain("ui,");
    expect(reason).toContain("…");
    // Counted in code points, which is what the width of the drawn line follows — `length` counts
    // UTF-16 units, so an all-astral label would double it without drawing any wider.
    expect([...reason].length).toBeLessThan(80);
  });

  it("cuts the quoted label between characters, not between the halves of one", () => {
    // An emoji is one code point in two UTF-16 units. Cutting between them leaves a lone surrogate
    // that draws as `�` — a character the reader never typed, in the sentence naming what they did.
    const reason = blockedReason(
      buildTaskCreate(taskInput({ labels: [`${"a".repeat(19)}😀,tail`] })),
    );
    expect(reason).toContain(`${"a".repeat(19)}😀…`);
    expect(reason).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
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

  // タグ全消し (doc-10 §5, TASK-109). The two tests below are the pair that keeps 空集合の tags
  // apart from 未タッチの tags: the first sends `[]` so the adapter emits `--tags ""`, the second
  // sends no tags at all. Collapsing them would let an update that never touched tags clear them.
  it("sends 空集合の tags as the タグ全消し request", () => {
    const session = setDocField(startDocSession(document()), "tags", []);
    expect(action(buildDocUpdate(session))).toEqual([
      { op: "docUpdate", docId: "doc-4", update: { tags: [] } },
    ]);
  });

  it("omits tags entirely when the field was never touched", () => {
    const session = setDocField(startDocSession(document()), "title", "読み取り層 設計（改訂）");
    const update = action(buildDocUpdate(session))[0];
    expect(update).toEqual({
      op: "docUpdate",
      docId: "doc-4",
      update: { title: "読み取り層 設計（改訂）" },
    });
    expect("tags" in (update as { update: DocUpdate }).update).toBe(false);
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

// --- 改称・削除・アーカイブ (doc-9 §4.2, doc-10 §6) ---------------------------------------------

const MILESTONE: Milestone = {
  sourcePath: "/repos/atlas/backlog/milestones/m-1 - phase-one.md",
  id: "m-1",
  title: "Phase One",
  description: null,
  health: { state: "ok" },
};

describe("参照タスク集合 (doc-9 §4.2.2)", () => {
  const tasks = [
    taskView({ id: "TASK-1", milestone: "m-1" }),
    // v1.48.0 matches the title ignoring surrounding space and case, so this one is rewritten too
    // even though the read layer resolves it to nothing (doc-9 §4.2.1).
    taskView({ id: "TASK-2", milestone: "  phase ONE  " }),
    // The id padded and upper-cased is a reference to v1.48.0 too (doc-9 §4.2.1), so an id compared
    // exactly would leave this one out of the set — and out of what the screen shows.
    taskView({ id: "TASK-3", milestone: "  M-1  " }),
    taskView({ id: "TASK-8", milestone: null }),
    taskView({ id: "TASK-4", milestone: "m-2" }),
    taskView({ id: "TASK-5", milestone: "m-1", storageState: "draft" }),
    taskView({ id: "TASK-6", milestone: "m-1", storageState: "archive" }),
    taskView({ id: "TASK-7", milestone: "m-1", storageState: "completed" }),
  ];

  it("covers the active tasks matching the id or the title, and nothing else", () => {
    expect(referencingTasks(MILESTONE, tasks).map((view) => view.task.id)).toEqual([
      "TASK-1",
      "TASK-2",
      "TASK-3",
    ]);
  });

  it("is part of the 書き換え対象集合 for exactly the three operations that fan out", () => {
    const fans = (plan: IssuePlan) =>
      plan.state === "ready" && followsReferences(plan.action[0]);
    expect(fans(buildMilestoneRename(MILESTONE, { to: "Phase 1", updateTasks: true }))).toBe(true);
    expect(fans(buildMilestoneRemove(MILESTONE, { handling: "clear", reassignTo: "" }))).toBe(true);
    expect(
      fans(buildMilestoneRemove(MILESTONE, { handling: "reassign", reassignTo: "m-2" })),
    ).toBe(true);
    // doc-9 §4.2.1 measured these three as rewriting the milestone file alone.
    expect(fans(buildMilestoneRename(MILESTONE, { to: "Phase 1", updateTasks: false }))).toBe(
      false,
    );
    expect(fans(buildMilestoneRemove(MILESTONE, { handling: "keep", reassignTo: "" }))).toBe(false);
    expect(fans(buildMilestoneArchive(MILESTONE))).toBe(false);
  });
});

describe("buildMilestoneRename", () => {
  it("sends the id as <from> and carries --no-update-tasks as a flag", () => {
    expect(buildMilestoneRename(MILESTONE, { to: " Phase 1 ", updateTasks: true })).toEqual({
      state: "ready",
      action: [{ op: "milestoneRename", from: "m-1", to: "Phase 1", updateTasks: true }],
    });
    expect(buildMilestoneRename(MILESTONE, { to: "Phase 1", updateTasks: false })).toEqual({
      state: "ready",
      action: [{ op: "milestoneRename", from: "m-1", to: "Phase 1", updateTasks: false }],
    });
  });

  it("defaults to updating the referencing tasks", () => {
    expect(EMPTY_MILESTONE_RENAME.updateTasks).toBe(true);
  });

  it("blocks an empty name, and one the CLI would treat as the current name", () => {
    expect(buildMilestoneRename(MILESTONE, { ...EMPTY_MILESTONE_RENAME })).toEqual({
      state: "blocked",
      reason: MILESTONE_RENAME_REQUIRED_REASON,
    });
    // Case and surrounding space are what the CLI ignores (doc-9 §4.2.1), so this would be issued
    // as a change and land as none.
    expect(buildMilestoneRename(MILESTONE, { to: "  phase one  ", updateTasks: true })).toEqual({
      state: "blocked",
      reason: MILESTONE_RENAME_UNCHANGED_REASON,
    });
  });
});

describe("buildMilestoneRemove", () => {
  it("requires the task handling to be chosen before anything is issued", () => {
    expect(EMPTY_MILESTONE_REMOVE.handling).toBeNull();
    expect(buildMilestoneRemove(MILESTONE, { ...EMPTY_MILESTONE_REMOVE })).toEqual({
      state: "blocked",
      reason: MILESTONE_REMOVE_HANDLING_REQUIRED_REASON,
    });
  });

  it("maps clear and keep to --task-handling alone", () => {
    expect(buildMilestoneRemove(MILESTONE, { handling: "clear", reassignTo: "" })).toEqual({
      state: "ready",
      action: [{ op: "milestoneRemove", name: "m-1", taskHandling: { mode: "clear" } }],
    });
    expect(buildMilestoneRemove(MILESTONE, { handling: "keep", reassignTo: "" })).toEqual({
      state: "ready",
      action: [{ op: "milestoneRemove", name: "m-1", taskHandling: { mode: "keep" } }],
    });
  });

  it("requires --reassign-to for reassign, and refuses the milestone being removed", () => {
    expect(buildMilestoneRemove(MILESTONE, { handling: "reassign", reassignTo: " " })).toEqual({
      state: "blocked",
      reason: MILESTONE_REASSIGN_TARGET_REQUIRED_REASON,
    });
    expect(buildMilestoneRemove(MILESTONE, { handling: "reassign", reassignTo: "m-1" })).toEqual({
      state: "blocked",
      reason: MILESTONE_REASSIGN_TARGET_IS_SELF_REASON,
    });
    expect(buildMilestoneRemove(MILESTONE, { handling: "reassign", reassignTo: "m-2" })).toEqual({
      state: "ready",
      action: [
        { op: "milestoneRemove", name: "m-1", taskHandling: { mode: "reassign", to: "m-2" } },
      ],
    });
  });

  it("says what the CLI's 削除 actually does to the file and to kept references", () => {
    // doc-10 §6: the screen keeps the CLI's word but must not let it read as an unlink.
    expect(MILESTONE_REMOVE_MOVES_THE_FILE).toContain("archive/milestones/");
    expect(MILESTONE_KEEP_LEAVES_DANGLING_REFERENCES).toContain("解決先の無い");
  });
});

describe("buildMilestoneArchive", () => {
  it("issues the archive with the milestone's id as its operand", () => {
    expect(buildMilestoneArchive(MILESTONE)).toEqual({
      state: "ready",
      action: [{ op: "milestoneArchive", name: "m-1" }],
    });
  });
});

// --- マイルストーン説明の更新 (doc-10 §6, decision-21) -------------------------------------------

describe("buildMilestoneDescribe", () => {
  const described: Milestone = { ...MILESTONE, description: "Phase one of two." };

  it("issues the 直接書き込み操作 with the milestone's id as its operand", () => {
    expect(buildMilestoneDescribe(described, "Rewritten.")).toEqual({
      state: "ready",
      action: [{ op: "milestoneDescribe", name: "m-1", description: "Rewritten." }],
    });
  });

  it("issues an empty description rather than blocking it (doc-10 §6)", () => {
    // Emptying is offered on purpose: `milestone add` without `-d` writes a placeholder, so a
    // description the user wrote has no other way back out. The empty string is what carries it,
    // which is why it must not be confused with "nothing to send".
    expect(buildMilestoneDescribe(described, "")).toEqual({
      state: "ready",
      action: [{ op: "milestoneDescribe", name: "m-1", description: "" }],
    });
  });

  it("blocks an unchanged description, including a milestone that never had one", () => {
    expect(buildMilestoneDescribe(described, "Phase one of two.")).toEqual({
      state: "blocked",
      reason: MILESTONE_DESCRIPTION_UNCHANGED_REASON,
    });
    // `null` description and an empty box are the same state, so pressing 保存 there would write
    // the bytes that are already in the file.
    expect(buildMilestoneDescribe(MILESTONE, "")).toEqual({
      state: "blocked",
      reason: MILESTONE_DESCRIPTION_UNCHANGED_REASON,
    });
  });

  it("refuses a line starting with `##`, wherever in the description it is", () => {
    // The read layer ends 説明の本文範囲 at the next `##`, so everything after such a line would be
    // written to the file and then read back as absent (decision-21).
    for (const text of ["## Notes", "Intro.\n\n## Notes\n- a", "  ## indented"]) {
      expect(buildMilestoneDescribe(described, text)).toEqual({
        state: "blocked",
        reason: MILESTONE_DESCRIPTION_HEADING_REASON,
      });
    }
  });

  it("allows `#` and a mid-line `##`, which end no section", () => {
    // Only a line *beginning* `##` closes the range; refusing more than that would block ordinary
    // prose for a rule it is not subject to.
    expect(buildMilestoneDescribe(described, "# Title\nsee C## for the rest").state).toBe("ready");
  });

  it("states a reason that is true of v1.48.0 (doc-10 §1)", () => {
    // Not "the CLI cannot do it": `milestone add -d` writes a heading-bearing description without
    // complaint (measured 2026-08-06). The reason is about the round trip, and says so.
    expect(MILESTONE_DESCRIPTION_HEADING_REASON).not.toContain("CLI");
    expect(MILESTONE_DESCRIPTION_HEADING_REASON).toContain("##");
  });
});

describe("発行の可否", () => {
  const ready: CliReadiness = { state: "ready", version: CONFIRMED_CLI_VERSION };
  const plan: IssuePlan = { state: "ready", action: [{ op: "milestoneAdd", name: "m-2" }] };

  it("lets a caller hold issuance with its own reason, ahead of the form's state", () => {
    // プロジェクト詳細画面 holds every 区画 while a ledger write is in flight (review [P1]): if that
    // write is a move, the ids the screen holds start naming files in another root — a different
    // fact from `ISSUE_BUSY_REASON` (another 発行 is running). Passing a reason is what lets the two
    // be said apart.
    const held = issueAvailability(plan, { readiness: ready, busy: false, hold: "移動中です" });
    expect(held).toEqual({ state: "blocked", reason: "移動中です" });
    // The hold outranks an unfilled form: the reason is the target, not the input.
    const blockedPlan: IssuePlan = { state: "blocked", reason: "title は必須です" };
    expect(issueAvailability(blockedPlan, { readiness: ready, busy: false, hold: "移動中です" })).toEqual(
      { state: "blocked", reason: "移動中です" },
    );
  });

  it("keeps the CLI degrade ahead of the hold, and no hold as no change", () => {
    const degraded: CliReadiness = { state: "unavailable", detail: "not on PATH" };
    expect(
      issueAvailability(plan, { readiness: degraded, busy: false, hold: "移動中です" }),
    ).toEqual({ state: "blocked", reason: readinessReason(degraded) });
    expect(issueAvailability(plan, { readiness: ready, busy: false })).toEqual({ state: "ready" });
    expect(issueAvailability(plan, { readiness: ready, busy: false, hold: null })).toEqual({
      state: "ready",
    });
  });
});

describe("新規タスクの注記", () => {
  it("says where the fields go instead, and never why the form omits them", () => {
    // 代替経路の案内 (doc-11 §8): the note carries a route and nothing else. TASK-123 dropped the
    // per-field reasons, so the assertion is that they did not come back — a reason here would be
    // the thing the 目視 called ノイズ, and「CLI に無い」would be false besides (v1.48.0's
    // `task create` does accept all five, measured 2026-07-29).
    expect(TASK_CREATE_NOTE).toContain("作成後");
    expect(TASK_CREATE_NOTE).toContain("タスクの編集");
    expect(TASK_CREATE_NOTE).not.toContain("CLI");
    expect(TASK_CREATE_NOTE).not.toContain("製品判断");
    expect(TASK_CREATE_NOTE).not.toMatch(/doc-\d|decision-\d/);
  });

  it("names the five fields v1.48.0 accepts and this form has no input for", () => {
    expect(TASK_CREATE_LATER_FIELDS).toEqual([
      "assignee",
      "実装計画",
      "実装ノート",
      "References",
      "依存",
    ]);
  });

  it("carries no flag names", () => {
    // doc-11 §8 の 発行手段の記述 lost its carve-out with TASK-123: the flags were shown so that the
    // absence could not read as「CLI に無い」, and with the reasons gone there is no false
    // explanation left for them to guard against.
    for (const field of TASK_CREATE_LATER_FIELDS) {
      expect(field).not.toMatch(/^-|--/);
    }
    expect(TASK_CREATE_LATER_FIELDS.join("")).not.toContain("-a");
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
      readiness: { state: "unavailable", detail: "backlog: No such file or directory (os error 2)" },
      busy: false,
    });
    expect(available.state).toBe("blocked");
    if (available.state !== "blocked") throw new Error("unreachable");
    expect(available.reason).toContain("backlog CLI の実行ファイルを解決できない");
    // The 起動失敗 detail names the executable that was tried (decision-16 順序 1): it is what the
    // user corrects when アプリ設定 `backlog_cli` holds a typo, so the reason has to carry it through.
    expect(available.reason).toContain("backlog: No such file or directory");
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
      {
        state: "conflict",
        diverged: ["/repos/atlas/backlog/docs/doc-4.md"],
        unread: [],
      },
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
