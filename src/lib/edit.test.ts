import { describe, expect, it } from "vitest";
import {
  EMPTY_DEPENDENCIES_REASON,
  EMPTY_REFERENCES_REASON,
  EMPTY_TITLE_REASON,
  acRows,
  buildSave,
  canRemoveLast,
  commandErrorDetail,
  divergence,
  editAvailability,
  externallyChanged,
  failureDetail,
  isDirty,
  milestoneOptions,
  optionsFor,
  rebaseOnto,
  setAcMode,
  setField,
  setNotesMode,
  startSession,
  toggleAcCheck,
  toggleAcRemoval,
  transitionOffers,
  type EditSession,
} from "./edit";
import { snapshot, taskView } from "./fixtures";
import type { AcceptanceCriterion, CliReadiness, TaskEdit, UpdateOperation } from "./wire";

const READY: CliReadiness = { state: "ready", version: "1.47.1" };

function criteria(...items: [string, boolean][]): AcceptanceCriterion[] {
  return items.map(([text, checked], index) => ({ number: index + 1, text, checked }));
}

/** The `task edit` an action carries, so a test names the facet instead of the wire shape. */
function editOf(action: UpdateOperation[]): TaskEdit {
  const operation = action[0];
  if (operation.op !== "taskEdit") throw new Error(`expected taskEdit, got ${operation.op}`);
  return operation.edit;
}

function ready(session: EditSession): { action: UpdateOperation[]; submitted: unknown } {
  const plan = buildSave(session);
  if (plan.state !== "ready") throw new Error(`expected ready, got ${plan.state}`);
  return plan;
}

describe("編集セッションの未保存入力", () => {
  it("開始直後は保存するものが無い", () => {
    const session = startSession(taskView({ title: "T", description: "D" }));
    expect(isDirty(session)).toBe(false);
    expect(buildSave(session).state).toBe("nothingToSave");
  });

  it("触れても値が元に戻れば保存対象にならない", () => {
    const view = taskView({ title: "T" });
    let session = setField(startSession(view), "title", "T2");
    expect(isDirty(session)).toBe(true);
    session = setField(session, "title", "T");
    expect(isDirty(session)).toBe(false);
  });

  it("変えた項目だけを 1 回の task edit にまとめる", () => {
    const view = taskView({ title: "T", description: "D", priority: "low" });
    let session = setField(startSession(view), "description", "D2");
    session = setField(session, "priority", "high");
    const edit = editOf(ready(session).action);
    expect(edit).toEqual({ description: "D2", priority: "high" });
    expect(ready(session).action).toHaveLength(1);
  });

  it("title を空にする保存は拒む（doc-4 §3.1 の必須項目）", () => {
    const session = setField(startSession(taskView({ title: "T" })), "title", "");
    expect(buildSave(session)).toEqual({ state: "refused", reason: EMPTY_TITLE_REASON });
  });

  it("TASK-ID が無いタスクは対象を指定できない", () => {
    const session = setField(startSession(taskView({ id: null })), "description", "x");
    expect(buildSave(session).state).toBe("refused");
  });
});

describe("ラベルの増減", () => {
  it("差分を --add-label / --remove-label に振り分ける", () => {
    const view = taskView({ labels: ["a", "b"] });
    const session = setField(startSession(view), "labels", ["b", "c"]);
    expect(editOf(ready(session).action)).toEqual({ addLabels: ["c"], removeLabels: ["a"] });
  });
});

describe("References・dependencies の非空全置換 (doc-5 §3.1)", () => {
  it("既存を含む全集合を渡す", () => {
    const view = taskView({ references: ["https://example.test/1"] });
    const session = setField(startSession(view), "references", [
      "https://example.test/1",
      "https://example.test/pull/2",
    ]);
    expect(editOf(ready(session).action).references).toEqual([
      "https://example.test/1",
      "https://example.test/pull/2",
    ]);
  });

  it("最後の 1 件は削除できない", () => {
    expect(canRemoveLast(["only"])).toBe(false);
    expect(canRemoveLast(["a", "b"])).toBe(true);
  });

  it("空集合にする保存はアダプターへ出す前に拒む", () => {
    const references = setField(startSession(taskView({ references: ["u"] })), "references", []);
    expect(buildSave(references)).toEqual({ state: "refused", reason: EMPTY_REFERENCES_REASON });

    const dependencies = setField(
      startSession(taskView({ dependencies: ["TASK-1"] })),
      "dependencies",
      [],
    );
    expect(buildSave(dependencies)).toEqual({
      state: "refused",
      reason: EMPTY_DEPENDENCIES_REASON,
    });
  });
});

describe("AC の項目単位操作と全体差し替えの区別 (doc-5 §3)", () => {
  const view = taskView({ acceptanceCriteria: criteria(["one", false], ["two", true]) });

  it("チェックの切り替えは delta として出る", () => {
    const session = toggleAcCheck(startSession(view), 1);
    expect(editOf(ready(session).action).ac).toEqual({
      mode: "delta",
      add: [],
      remove: [],
      check: [1],
      uncheck: [],
    });
  });

  it("元の状態へ戻す切り替えは操作を残さない", () => {
    const session = toggleAcCheck(toggleAcCheck(startSession(view), 1), 1);
    expect(isDirty(session)).toBe(false);
  });

  it("削除指定は項目を一覧に残したまま印を付ける", () => {
    const session = toggleAcRemoval(startSession(view), 2);
    expect(acRows(session).map((row) => row.removed)).toEqual([false, true]);
    expect(editOf(ready(session).action).ac).toMatchObject({ mode: "delta", remove: [2] });
  });

  it("全体差し替えは既存件数つきの replace として出る", () => {
    let session = setAcMode(startSession(view), "replace");
    session = setField(session, "ac", {
      mode: "replace",
      items: [{ text: "only", checked: true }],
    });
    expect(editOf(ready(session).action).ac).toEqual({
      mode: "replace",
      existing: 2,
      items: [{ text: "only", checked: true }],
    });
  });

  it("差し替えモードへ入っただけでは変更にならない", () => {
    expect(isDirty(setAcMode(startSession(view), "replace"))).toBe(false);
  });
});

describe("実装ノートの置換と追記", () => {
  const view = taskView({ implementationNotes: "既存" });

  it("追記モードでは入力した本文だけを送る", () => {
    let session = setNotesMode(startSession(view), "append");
    session = setField(session, "notes", "追記分");
    expect(editOf(ready(session).action).notes).toEqual({ mode: "append", text: "追記分" });
  });

  it("追記モードへの切り替えは本文を空にする", () => {
    expect(setNotesMode(startSession(view), "append").draft.notes).toBe("");
  });

  it("追記が空なら保存対象にならない", () => {
    expect(isDirty(setNotesMode(startSession(view), "append"))).toBe(false);
  });
});

describe("編集中の外部変更と競合後の 2 経路 (doc-8 §6.4, doc-9 §5)", () => {
  const baseline = taskView({ title: "T", description: "D" });

  it("内容が動いたことだけを知らせる", () => {
    const session = startSession(baseline);
    expect(externallyChanged(session, taskView({ title: "T", description: "D" }))).toBe(false);
    expect(externallyChanged(session, taskView({ title: "T2", description: "D" }))).toBe(true);
    expect(externallyChanged(session, null)).toBe(true);
  });

  it("再適用は触った項目だけを最新の上に載せ直す", () => {
    const session = setField(startSession(baseline), "description", "自分の入力");
    // 外部で title が変わった: 触っていないので最新側が残る。
    const latest = taskView({ title: "外部が変えた", description: "D" });
    const rebased = rebaseOnto(session, latest);
    expect(rebased.draft.title).toBe("外部が変えた");
    expect(rebased.draft.description).toBe("自分の入力");
    expect(editOf(ready(rebased).action)).toEqual({ description: "自分の入力" });
  });

  it("再適用後は外部変更の警告が消える", () => {
    const session = setField(startSession(baseline), "description", "自分の入力");
    const latest = taskView({ title: "外部が変えた", description: "D" });
    expect(externallyChanged(rebaseOnto(session, latest), latest)).toBe(false);
  });
});

describe("照合後競合窓の事後検出 (doc-9 §4.1)", () => {
  it("送った内容と再読込結果が一致すれば何も言わない", () => {
    expect(divergence({ title: "T", description: "D" }, taskView({ title: "T", description: "D" })))
      .toEqual([]);
  });

  it("食い違った項目を挙げる", () => {
    expect(divergence({ title: "送った" }, taskView({ title: "別のもの" }))).toEqual(["title"]);
  });

  it("前後の空白差は CLI の整形なので競合として挙げない", () => {
    expect(divergence({ description: "D\n" }, taskView({ description: "D" }))).toEqual([]);
  });

  it("参照は順序差では挙げない", () => {
    expect(divergence({ references: ["b", "a"] }, taskView({ references: ["a", "b"] }))).toEqual([]);
  });

  it("再読込結果にタスクが無ければそのことを挙げる", () => {
    expect(divergence({ title: "T" }, null)).toHaveLength(1);
  });
});

describe("保存区分別の編集可否 (doc-8 §6.5)", () => {
  it("active は編集できる", () => {
    expect(editAvailability(taskView({ storageState: "active" }), READY)).toEqual({
      state: "editable",
    });
  });

  it("draft・completed・archive は理由つきで編集を出さない", () => {
    for (const storageState of ["draft", "completed", "archive"] as const) {
      const availability = editAvailability(taskView({ storageState }), READY);
      expect(availability.state).toBe("unavailable");
    }
  });

  it("保存区分不明・TASK-ID 不明も編集を出さない", () => {
    expect(editAvailability(taskView({ storageState: null }), READY).state).toBe("unavailable");
    expect(editAvailability(taskView({ id: null }), READY).state).toBe("unavailable");
  });

  it("対応 CLI が無ければ active でも編集を出さない（doc-5 §5 縮退）", () => {
    const availability = editAvailability(taskView({}), {
      state: "unsupported",
      version: "1.0.0",
      minimum: "1.47.1",
    });
    expect(availability.state).toBe("unavailable");
  });
});

describe("状態遷移の入口 (doc-5 §3.2/§3.3, doc-8 §6.5)", () => {
  const context = { readiness: READY, hasUnsavedInput: false };

  it("active には demote・archive・complete を出す", () => {
    const offers = transitionOffers(taskView({ storageState: "active" }), context);
    if (offers.state !== "offered") throw new Error("expected offers");
    expect(offers.offers.map((offer) => offer.kind)).toEqual([
      "taskDemote",
      "taskArchive",
      "taskComplete",
    ]);
  });

  it("task complete は status が Done のときだけ能動化する", () => {
    const notDone = transitionOffers(taskView({ status: "In Progress" }), context);
    if (notDone.state !== "offered") throw new Error("expected offers");
    const disabled = notDone.offers.find((offer) => offer.kind === "taskComplete");
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.reason).toContain("Done");

    const done = transitionOffers(taskView({ status: "Done", column: "done" }), context);
    if (done.state !== "offered") throw new Error("expected offers");
    expect(done.offers.find((offer) => offer.kind === "taskComplete")?.enabled).toBe(true);
  });

  it("draft には promote・archive だけを出す", () => {
    const offers = transitionOffers(
      taskView({ storageState: "draft", id: "DRAFT-2", status: "Draft" }),
      context,
    );
    if (offers.state !== "offered") throw new Error("expected offers");
    expect(offers.offers.map((offer) => offer.kind)).toEqual(["draftPromote", "draftArchive"]);
    expect(offers.offers[0].operation).toEqual({ op: "draftPromote", draftId: "DRAFT-2" });
  });

  it("completed・archive には戻す操作が無いので提示しない", () => {
    for (const storageState of ["completed", "archive"] as const) {
      expect(transitionOffers(taskView({ storageState }), context).state).toBe("none");
    }
  });

  it("未保存入力があるあいだは遷移を能動化しない", () => {
    const offers = transitionOffers(taskView({ status: "Done" }), {
      readiness: READY,
      hasUnsavedInput: true,
    });
    if (offers.state !== "offered") throw new Error("expected offers");
    expect(offers.offers.every((offer) => !offer.enabled)).toBe(true);
  });

  it("対応 CLI が無ければ遷移も能動化しない", () => {
    const offers = transitionOffers(taskView({ status: "Done" }), {
      readiness: { state: "unavailable", detail: "not found" },
      hasUnsavedInput: false,
    });
    if (offers.state !== "offered") throw new Error("expected offers");
    expect(offers.offers.every((offer) => !offer.enabled)).toBe(true);
  });
});

describe("選択肢", () => {
  it("未設定のときだけ「未設定」を選べる", () => {
    expect(optionsFor(null, ["high"]).map((option) => option.value)).toEqual(["", "high"]);
    expect(optionsFor("high", ["high"]).map((option) => option.value)).toEqual(["high"]);
  });

  it("config.yml が宣言していない現在値も選択肢に残す", () => {
    expect(optionsFor("Doing", ["To Do", "Done"]).map((option) => option.value)).toEqual([
      "Doing",
      "To Do",
      "Done",
    ]);
  });

  it("このルートに無いマイルストーン参照も残す", () => {
    const options = milestoneOptions(snapshot("atlas", []), "m-9");
    expect(options[0].value).toBe("m-9");
  });
});

describe("失敗の言い分け (doc-5 §5, doc-9 §4.2)", () => {
  it("CLI 失敗はサブコマンドと stderr を出す", () => {
    const detail = failureDetail({
      command: "task edit",
      kind: { kind: "nonZero", code: 1 },
      stderr: "Task TASK-9 not found",
      completedBefore: 0,
      partial: false,
    });
    expect(detail).toContain("task edit");
    expect(detail).toContain("Task TASK-9 not found");
  });

  it("照合不能は競合と読めない言い方にする", () => {
    const detail = commandErrorDetail({
      kind: "uncheckableTarget",
      what: "milestone rename",
      detail: "参照追随書き換え",
    });
    expect(detail).toContain("照合不能");
    expect(detail).toContain("検出したわけではありません");
  });

  it("適用済みで再読込に失敗した場合はやり直しを止める", () => {
    const detail = commandErrorDetail({
      kind: "reloadFailed",
      detail: "config.yml not found",
      applied: { state: "succeeded" },
    });
    expect(detail).toContain("やり直さないでください");
  });
});
