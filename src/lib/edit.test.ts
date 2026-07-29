import { describe, expect, it } from "vitest";
import {
  EMPTY_DEPENDENCIES_REASON,
  EMPTY_REFERENCES_REASON,
  EMPTY_TITLE_REASON,
  FILE_MISSING_REASON,
  NOTHING_TO_SAVE_REASON,
  acDeltaDroppedByRebase,
  acRows,
  assigneeCollapseWarning,
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
  saveAvailability,
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

describe("assignee の設定・付け替え (doc-5 §3, TASK-57)", () => {
  it("1 件だけを --assignee へ渡し、前後の空白は落とす", () => {
    const session = setField(startSession(taskView({ assignee: [] })), "assignee", " @takkyun ");
    expect(editOf(ready(session).action)).toEqual({ assignee: "@takkyun" });
  });

  it("空欄は「変更しない」であり、解除としては発行しない", () => {
    // `-a ""` は終了コード 0 で何も変えない（実測）。解除できたかのように発行しないための規則。
    const session = setField(startSession(taskView({ assignee: ["@takkyun"] })), "assignee", "  ");
    expect(isDirty(session)).toBe(false);
    expect(buildSave(session).state).toBe("nothingToSave");
  });

  it("複数 assignee のタスクは、同じ値に触れただけでも 1 件化として保存対象になる", () => {
    // 一覧を丸ごと置き換えるため（実測）、先頭と同じ値でも保存すれば 2 件が 1 件になる。
    const view = taskView({ assignee: ["@takkyun", "@someone"] });
    const session = setField(startSession(view), "assignee", "@takkyun");
    expect(isDirty(session)).toBe(true);
    expect(editOf(ready(session).action)).toEqual({ assignee: "@takkyun" });
    expect(assigneeCollapseWarning(view.task.assignee)).toContain("2 件");
    expect(assigneeCollapseWarning(["@takkyun"])).toBeNull();
  });

  it("再読込結果の assignee が送った 1 件と違えば事後通知に載る", () => {
    expect(divergence({ assignee: "@takkyun" }, taskView({ assignee: ["@takkyun"] }))).toEqual([]);
    expect(
      divergence({ assignee: "@takkyun" }, taskView({ assignee: ["@takkyun", "@someone"] })),
    ).toEqual(["assignee"]);
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

// v1.47.1 実測: 1 回の task edit の中で --remove-ac は読んだままの番号を、
// --check-ac / --uncheck-ac は削除後の番号を指す。--ac の追加は末尾に付き番号をずらさない。
describe("AC 項目単位操作の番号を削除後の並びへ写す", () => {
  const three = taskView({
    acceptanceCriteria: criteria(["one", false], ["two", false], ["three", false]),
  });

  it("削除より後ろの項目は削除後の番号で指す", () => {
    // #1 を削除しつつ #2 をチェック。素の番号のまま送ると CLI は削除後の #2（元 #3）を
    // チェックしてしまう（実測・終了コード 0 で別項目が変わる）。
    let session = toggleAcRemoval(startSession(three), 1);
    session = toggleAcCheck(session, 2);
    expect(editOf(ready(session).action).ac).toEqual({
      mode: "delta",
      add: [],
      remove: [1],
      check: [1],
      uncheck: [],
    });
  });

  it("項目が 2 件のときも範囲外にならない", () => {
    // 素の番号だと --remove-ac 1 --check-ac 2 になり、CLI は
    // "Acceptance criterion #2 not found" で終了コード 1（実測）。
    const two = taskView({ acceptanceCriteria: criteria(["one", false], ["two", false]) });
    let session = toggleAcRemoval(startSession(two), 1);
    session = toggleAcCheck(session, 2);
    expect(editOf(ready(session).action).ac).toMatchObject({ remove: [1], check: [1] });
  });

  it("uncheck も同じ写像を通す", () => {
    const checked = taskView({
      acceptanceCriteria: criteria(["one", false], ["two", true], ["three", true]),
    });
    let session = toggleAcRemoval(startSession(checked), 1);
    session = toggleAcCheck(session, 3);
    expect(editOf(ready(session).action).ac).toMatchObject({ remove: [1], uncheck: [2] });
  });

  it("削除する項目のチェック操作は落とす", () => {
    let session = toggleAcCheck(startSession(three), 2);
    session = toggleAcRemoval(session, 2);
    expect(editOf(ready(session).action).ac).toMatchObject({ remove: [2], check: [] });
  });

  it("削除が無ければ番号はそのまま", () => {
    const session = toggleAcCheck(startSession(three), 3);
    expect(editOf(ready(session).action).ac).toMatchObject({ remove: [], check: [3] });
  });

  it("削除より前の項目は番号が変わらない", () => {
    let session = toggleAcRemoval(startSession(three), 3);
    session = toggleAcCheck(session, 1);
    expect(editOf(ready(session).action).ac).toMatchObject({ remove: [3], check: [1] });
  });
});

describe("競合後の再適用と AC 項目単位操作", () => {
  const before = taskView({
    acceptanceCriteria: criteria(["one", false], ["two", false]),
  });

  it("外部で AC が変わっていたら番号指定の操作は落とす", () => {
    let session = toggleAcRemoval(startSession(before), 1);
    session = toggleAcCheck(session, 2);
    // 外部編集で 1 件消えた: 同じ番号が別の項目を指すようになる。
    const latest = taskView({ acceptanceCriteria: criteria(["two", false]) });
    expect(acDeltaDroppedByRebase(session, latest)).toBe(true);
    const rebased = rebaseOnto(session, latest);
    expect(rebased.draft.ac).toEqual({
      mode: "delta",
      delta: { add: [], remove: [], check: [], uncheck: [] },
    });
  });

  it("AC が変わっていなければ操作を保つ", () => {
    const session = toggleAcRemoval(startSession(before), 1);
    const latest = taskView({
      title: "外部が変えた",
      acceptanceCriteria: criteria(["one", false], ["two", false]),
    });
    expect(acDeltaDroppedByRebase(session, latest)).toBe(false);
    expect(rebaseOnto(session, latest).draft.ac).toMatchObject({ delta: { remove: [1] } });
  });

  it("追加予定の本文は番号に依らないので残す", () => {
    let session = setField(startSession(before), "ac", {
      mode: "delta",
      delta: { add: ["追加"], remove: [1], check: [], uncheck: [] },
    });
    const latest = taskView({ acceptanceCriteria: criteria(["two", false]) });
    session = rebaseOnto(session, latest);
    expect(session.draft.ac).toMatchObject({ delta: { add: ["追加"], remove: [] } });
  });

  it("全体差し替えは本文を持つので再適用で落とさない", () => {
    let session = setAcMode(startSession(before), "replace");
    session = setField(session, "ac", { mode: "replace", items: [{ text: "自分の案", checked: false }] });
    const latest = taskView({ acceptanceCriteria: criteria(["外部が足した", false]) });
    expect(acDeltaDroppedByRebase(session, latest)).toBe(false);
    // existing は再適用後の baseline から数え直す。
    expect(editOf(ready(rebaseOnto(session, latest)).action).ac).toEqual({
      mode: "replace",
      existing: 1,
      items: [{ text: "自分の案", checked: false }],
    });
  });
});

describe("ファイルが読み取り結果から消えたとき (doc-8 §6.4)", () => {
  it("内容編集を理由つきで止める", () => {
    const availability = editAvailability(taskView({}), READY, true);
    expect(availability).toEqual({ state: "unavailable", reason: FILE_MISSING_REASON });
  });

  it("状態遷移も止める", () => {
    const offers = transitionOffers(taskView({ status: "Done" }), {
      readiness: READY,
      hasUnsavedInput: false,
      fileMissing: true,
    });
    if (offers.state !== "offered") throw new Error("expected offers");
    expect(offers.offers.every((offer) => offer.reason === FILE_MISSING_REASON)).toBe(true);
  });

  it("保存できる入力があっても保存を止め、理由を出す", () => {
    // 保持された編集セッション: 入力は残っているので plan は ready のまま。それでも
    // 発行先のファイルが無いので、押せるように見せずに理由を返す。
    const session = setField(startSession(taskView({})), "description", "書きかけ");
    const plan = buildSave(session);
    expect(plan.state).toBe("ready");
    expect(saveAvailability(plan, { fileMissing: true, busy: false })).toEqual({
      state: "blocked",
      reason: FILE_MISSING_REASON,
    });
  });
});

describe("保存操作の可否と理由 (doc-5 §5)", () => {
  // Shadowing the `ready()` helper above would read as the same thing; this is the plan value.
  const readyPlan = buildSave(setField(startSession(taskView({})), "description", "x"));

  it("保存できるときだけ ready", () => {
    expect(saveAvailability(readyPlan, { fileMissing: false, busy: false })).toEqual({
      state: "ready",
    });
  });

  it("保存中は理由つきで止める", () => {
    expect(saveAvailability(readyPlan, { fileMissing: false, busy: true })).toEqual({
      state: "blocked",
      reason: "保存中です",
    });
  });

  it("変更が無ければ理由つきで止める", () => {
    const nothing = buildSave(startSession(taskView({})));
    expect(saveAvailability(nothing, { fileMissing: false, busy: false })).toEqual({
      state: "blocked",
      reason: NOTHING_TO_SAVE_REASON,
    });
  });

  it("先取り拒否の理由をそのまま出す", () => {
    const refused = buildSave(
      setField(startSession(taskView({ references: ["u"] })), "references", []),
    );
    expect(saveAvailability(refused, { fileMissing: false, busy: false })).toEqual({
      state: "blocked",
      reason: EMPTY_REFERENCES_REASON,
    });
  });

  it("編集セッションが無ければ止める", () => {
    expect(saveAvailability(null, { fileMissing: false, busy: false }).state).toBe("blocked");
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
