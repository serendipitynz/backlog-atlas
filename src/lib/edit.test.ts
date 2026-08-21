import { describe, expect, it } from "vitest";
import {
  emptyAssigneeReason,
  emptyDependenciesReason,
  emptyReferencesReason,
  emptyTitleReason,
  fileMissingReason,
  nothingToSaveReason,
  acDeltaDroppedByRebase,
  acRows,
  buildSave,
  canRemoveLast,
  commandErrorDetail,
  confirmMarkedLabel,
  divergence,
  editAvailability,
  externallyChanged,
  failureDetail,
  isDirty,
  lastRemovalAvailability,
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
  transitionConfirmation,
  transitionOffers,
  typeNotEditable,
  type EditSession,
  type TransitionOffer,
} from "./edit";
import { commaRemovalReason, commaReason } from "./comma";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import { CATALOGS, msg } from "./messages";
import { snapshot, taskView } from "./fixtures";
import type { AcceptanceCriterion, CliReadiness, TaskEdit, UpdateOperation } from "./wire";

const READY: CliReadiness = { state: "ready", version: CONFIRMED_CLI_VERSION };

function criteria(...items: [string, boolean][]): AcceptanceCriterion[] {
  return items.map(([text, checked], index) => ({ number: index + 1, text, checked }));
}

/** The `task edit` an action carries, so a test names the facet instead of the wire shape. */
function editOf(action: UpdateOperation[]): TaskEdit {
  const operation = action[0];
  if (operation.op !== "taskEdit") {
    throw new Error(`expected taskEdit, got ${operation.op}`);
  }
  return operation.edit;
}

function ready(session: EditSession): { action: UpdateOperation[]; submitted: unknown } {
  const plan = buildSave(session);
  if (plan.state !== "ready") {
    throw new Error(`expected ready, got ${plan.state}`);
  }
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
    expect(buildSave(session)).toEqual({ state: "refused", reason: emptyTitleReason() });
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

  it("カンマを含むラベルの追加を拒み、2 件に分かれることを理由に述べる", () => {
    // `--add-label "b,c"` writes `b` と `c` の 2 件 (v1.49.3 実測)。作成モーダルとタグには同じ規則が
    // 先に掛かっており (doc-10 §7)、同じ入力が作成では拒まれ編集では通る非対称がここで閉じる。
    const session = setField(startSession(taskView({ labels: ["a"] })), "labels", ["a", "b,c"]);
    expect(buildSave(session)).toEqual({
      state: "refused",
      reason: commaReason(msg().field.labelWord, "b,c"),
    });
  });

  it("カンマを含む既存ラベルの削除を拒み、削除できないことを理由に述べる", () => {
    // 追加側と結末が違うので理由文も別である: `--remove-label "x,y"` は値を 2 件へ分けたうえで、その
    // どちらもタスクに無いので 1 件も消さずに終了コード 0 と `Updated` を出す (v1.49.3 実測)。発行すれば
    // 起きなかった削除を成功として報告することになり、ラベルは divergence の突き合わせにも入っていない。
    const session = setField(startSession(taskView({ labels: ["x,y"] })), "labels", []);
    expect(buildSave(session)).toEqual({
      state: "refused",
      reason: commaRemovalReason(msg().field.labelWord, "x,y"),
    });
  });

  it("カンマを含む既存ラベルを持つタスクでも、それを残す保存は通る", () => {
    // 関門は draft ではなく増減の値に掛かる。残るラベルはどちらの引数にも現れないので、CLI が現に
    // 正しく行える保存 — 別のラベルを 1 件足すだけ — を拒まない。
    const session = setField(startSession(taskView({ labels: ["x,y"] })), "labels", ["x,y", "new"]);
    expect(editOf(ready(session).action)).toEqual({ addLabels: ["new"], removeLabels: [] });
  });
});

describe("assignee の非空全置換 (doc-5 §3, TASK-57・TASK-151)", () => {
  it("既存を含む全集合を --assignee へ渡す", () => {
    const view = taskView({ assignee: ["@takkyun"] });
    const session = setField(startSession(view), "assignee", ["@takkyun", "@someone"]);
    expect(editOf(ready(session).action)).toEqual({ assignee: ["@takkyun", "@someone"] });
  });

  it("触れていない assignee は送らないので、複数 assignee はそのまま残る", () => {
    // doc-9 §5 (ii): title だけの保存は `--assignee` を出さない。
    const view = taskView({ title: "T", assignee: ["@takkyun", "@someone"] });
    const titleOnly = setField(startSession(view), "title", "T2");
    expect(editOf(ready(titleOnly).action)).toEqual({ title: "T2" });
  });

  it("最後の 1 件は削除できない", () => {
    // `-a ""` も、区切りだけで解析結果が空になる値も、終了コード 0 で何も変えない（実測）。
    const session = setField(startSession(taskView({ assignee: ["@takkyun"] })), "assignee", []);
    expect(buildSave(session)).toEqual({ state: "refused", reason: emptyAssigneeReason() });
    expect(canRemoveLast(["@takkyun"])).toBe(false);
  });

  it("1 件の名前にカンマを含む保存は拒み、2 件に分かれることを理由に述べる", () => {
    // 編集側の `-a` は値をカンマで分ける（v1.49.3 実測。作成側は分割しない）ので、"dave,erin" を
    // 1 件の assignee として書く手段は無い。発行してから食い違いを知るのではなく保存前に拒む。
    const view = taskView({ assignee: ["dave"] });
    const session = setField(startSession(view), "assignee", ["dave,erin"]);
    expect(buildSave(session)).toEqual({
      state: "refused",
      reason: commaReason("assignee", "dave,erin"),
    });
  });

  it("空だったタスクへ足した 1 件は、戻せば保存対象でなくなる", () => {
    // 最後の 1 件の削除を差し控える理由は「CLI に空集合化の手段が無い」だが、読み取り時点で空
    // だった一覧にはその制約が掛からない — 戻すと触れた項目でなくなり `-a` を送らないため。
    // 差し控えると、打ち間違いを取り消す手段がセッションの破棄しか無くなる。
    const view = taskView({ assignee: [] });
    let session = setField(startSession(view), "assignee", ["alcie"]);
    expect(isDirty(session)).toBe(true);
    session = setField(session, "assignee", []);
    expect(isDirty(session)).toBe(false);
    expect(buildSave(session).state).toBe("nothingToSave");
  });

  it("再読込結果の assignee が送った集合と違えば事後通知に載る", () => {
    expect(divergence({ assignee: ["@takkyun"] }, taskView({ assignee: ["@takkyun"] }))).toEqual([]);
    // 並びは CLI の書き方に属するので集合で比べる（他の全置換と同じ）。
    expect(divergence({ assignee: ["a", "b"] }, taskView({ assignee: ["b", "a"] }))).toEqual([]);
    expect(
      divergence({ assignee: ["@takkyun"] }, taskView({ assignee: ["@takkyun", "@someone"] })),
    ).toEqual(["assignee"]);
  });
});

describe("最後の 1 件の削除を差し控える条件 (doc-8 §6)", () => {
  it("読み取り時点で空だった一覧では差し控えない", () => {
    expect(lastRemovalAvailability([], emptyAssigneeReason())).toEqual({ state: "ready" });
    expect(lastRemovalAvailability([], emptyReferencesReason())).toEqual({ state: "ready" });
    expect(lastRemovalAvailability([], emptyDependenciesReason())).toEqual({ state: "ready" });
  });

  it("読み取り時点で 1 件以上あった一覧では、その理由を述べて差し控える", () => {
    expect(lastRemovalAvailability(["@takkyun"], emptyAssigneeReason())).toEqual({
      state: "withheld",
      reason: emptyAssigneeReason(),
    });
    expect(lastRemovalAvailability(["TASK-2"], emptyDependenciesReason())).toEqual({
      state: "withheld",
      reason: emptyDependenciesReason(),
    });
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

  it("1 件の参照にカンマを含む保存を拒む", () => {
    // `--ref` は参照ごとに繰り返して渡すので連結は起きないが、**CLI は各値をカンマで分ける**
    // （v1.49.3 実測）。座標を持つ地図の URL がそのまま当たるので、繰り返し渡していることは
    // 掛けない理由にならない。
    const session = setField(
      startSession(taskView({ references: ["https://a.test/1"] })),
      "references",
      ["https://m.test/@1,2"],
    );
    expect(buildSave(session)).toEqual({
      state: "refused",
      reason: commaReason("References", "https://m.test/@1,2"),
    });
  });

  it("1 件の依存にカンマを含む保存を拒む", () => {
    // `--depends-on` は `-a` と同じく値を集合として読むので、1 件に カンマ は入れられない。TASK-ID の
    // 文法にカンマが無いことは理由にならない — 欄は自由入力で、「TASK-3,TASK-4」は画面では 1 件の
    // 未解決な依存として描かれる一方、ファイルには 2 件書かれる。
    const session = setField(
      startSession(taskView({ dependencies: ["TASK-2"] })),
      "dependencies",
      ["TASK-3,TASK-4"],
    );
    expect(buildSave(session)).toEqual({
      state: "refused",
      reason: commaReason("dependencies", "TASK-3,TASK-4"),
    });
  });

  it("空集合にする保存はアダプターへ出す前に拒む", () => {
    const references = setField(startSession(taskView({ references: ["u"] })), "references", []);
    expect(buildSave(references)).toEqual({ state: "refused", reason: emptyReferencesReason() });

    const dependencies = setField(
      startSession(taskView({ dependencies: ["TASK-1"] })),
      "dependencies",
      [],
    );
    expect(buildSave(dependencies)).toEqual({
      state: "refused",
      reason: emptyDependenciesReason(),
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

// v1.49.3 実測: 1 回の task edit の中で --remove-ac は読んだままの番号を、
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
    // "Acceptance criterion #2 not found" で始まる文で終了コード 1（2026-08-12 に v1.49.3 で実測）。
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
    expect(availability).toEqual({ state: "unavailable", reason: fileMissingReason() });
  });

  it("状態遷移も止める", () => {
    const offers = transitionOffers(taskView({ status: "Done" }), {
      readiness: READY,
      hasUnsavedInput: false,
      fileMissing: true,
    });
    if (offers.state !== "offered") {
      throw new Error("expected offers");
    }
    expect(
      offers.offers.every(
        (offer) =>
          offer.availability.state === "withheld" &&
          offer.availability.reason === fileMissingReason(),
      ),
    ).toBe(true);
  });

  it("保存できる入力があっても保存を止め、理由を出す", () => {
    // 保持された編集セッション: 入力は残っているので plan は ready のまま。それでも
    // 発行先のファイルが無いので、押せるように見せずに理由を返す。
    const session = setField(startSession(taskView({})), "description", "書きかけ");
    const plan = buildSave(session);
    expect(plan.state).toBe("ready");
    expect(saveAvailability(plan, { fileMissing: true, busy: false })).toEqual({
      state: "blocked",
      reason: fileMissingReason(),
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
      reason: nothingToSaveReason(),
    });
  });

  it("先取り拒否の理由をそのまま出す", () => {
    const refused = buildSave(
      setField(startSession(taskView({ references: ["u"] })), "references", []),
    );
    expect(saveAvailability(refused, { fileMissing: false, busy: false })).toEqual({
      state: "blocked",
      reason: emptyReferencesReason(),
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
      minimum: CONFIRMED_CLI_VERSION,
    });
    expect(availability.state).toBe("unavailable");
  });
});

describe("Type 編集の非提供 (doc-8 §4)", () => {
  it("says Atlas has no route, and names neither 導出元", () => {
    // doc-8 §4 dropped its 掲示要求 for the two grounds with TASK-192. The 区画 puts kind ラベル 由来
    // and frontmatter 由来 values in one list without distinguishing them (doc-8 §4 の 2 つ目の項), so
    // a sentence carrying one ground is false of the other half of what the reader is looking at.
    // The grounds stay in doc-8 §4; what the screen states is whose boundary this is.
    for (const sentence of [typeNotEditable(), CATALOGS.en.taskDetail.typeNotEditable]) {
      // The scope, not the mere word 編集できません: 「この画面では」 was what the owner read on
      // 2026-08-17 as promising some other route inside Atlas (doc-11 §5 asks a reason for this much).
      expect(sentence).toContain("Atlas");
      expect(sentence).not.toContain("kind");
      expect(sentence).not.toContain("frontmatter");
    }
    expect(typeNotEditable()).not.toContain("この画面");
    expect(CATALOGS.en.taskDetail.typeNotEditable).not.toContain("on this screen");
  });

  it("states a reason that is true of v1.49.3 (doc-10 §1)", () => {
    // Not "the CLI has no way": `task edit` and `task create` both take `--type` (measured
    // 2026-08-17). What is absent is an operation on Atlas's side, so neither the flag name nor a
    // claim about the CLI belongs in the sentence.
    expect(typeNotEditable()).not.toContain("CLI");
    expect(typeNotEditable()).not.toContain("--type");
    expect(CATALOGS.en.taskDetail.typeNotEditable).not.toContain("CLI");
    expect(CATALOGS.en.taskDetail.typeNotEditable).not.toContain("--type");
  });
});

describe("状態遷移の入口 (doc-5 §3.2/§3.3, doc-8 §6.5)", () => {
  const context = { readiness: READY, hasUnsavedInput: false };

  it("active には demote・archive・complete を出す", () => {
    const offers = transitionOffers(taskView({ storageState: "active" }), context);
    if (offers.state !== "offered") {
      throw new Error("expected offers");
    }
    expect(offers.offers.map((offer) => offer.kind)).toEqual([
      "taskDemote",
      "taskArchive",
      "taskComplete",
    ]);
  });

  it("task complete は status が Done のときだけ能動化する", () => {
    const notDone = transitionOffers(taskView({ status: "In Progress" }), context);
    if (notDone.state !== "offered") {
      throw new Error("expected offers");
    }
    const disabled = notDone.offers.find((offer) => offer.kind === "taskComplete");
    expect(disabled?.availability.state).toBe("withheld");
    expect(
      disabled?.availability.state === "withheld" && disabled.availability.reason,
    ).toContain("Done");

    const done = transitionOffers(taskView({ status: "Done", column: "done" }), context);
    if (done.state !== "offered") {
      throw new Error("expected offers");
    }
    expect(done.offers.find((offer) => offer.kind === "taskComplete")?.availability.state).toBe(
      "ready",
    );
  });

  it("draft には promote・archive だけを出す", () => {
    const offers = transitionOffers(
      taskView({ storageState: "draft", id: "DRAFT-2", status: "Draft" }),
      context,
    );
    if (offers.state !== "offered") {
      throw new Error("expected offers");
    }
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
    if (offers.state !== "offered") {
      throw new Error("expected offers");
    }
    expect(offers.offers.every((offer) => offer.availability.state === "withheld")).toBe(true);
  });

  it("対応 CLI が無ければ遷移も能動化しない", () => {
    const offers = transitionOffers(taskView({ status: "Done" }), {
      readiness: { state: "unavailable", detail: "not found" },
      hasUnsavedInput: false,
    });
    if (offers.state !== "offered") {
      throw new Error("expected offers");
    }
    expect(offers.offers.every((offer) => offer.availability.state === "withheld")).toBe(true);
  });
});

describe("実行前確認 (doc-11 §12)", () => {
  const context = { readiness: READY, hasUnsavedInput: false };

  /** Every transition either 保存区分 offers — the five doc-8 §6.5 says all ask. */
  function everyOffer(): TransitionOffer[] {
    return ["active", "draft"].flatMap((storageState) => {
      const offers = transitionOffers(
        taskView({ storageState: storageState as "active" | "draft", status: "Done" }),
        context,
      );
      if (offers.state !== "offered") {
        throw new Error("expected offers");
      }
      return offers.offers;
    });
  }

  it("5 件とも問いと進む側の答えを持つ", () => {
    const offers = everyOffer();
    expect(offers.map((offer) => offer.kind)).toEqual([
      "taskDemote",
      "taskArchive",
      "taskComplete",
      "draftPromote",
      "draftArchive",
    ]);
    for (const offer of offers) {
      const confirmation = transitionConfirmation(offer);
      expect(confirmation.question).not.toBe("");
      expect(confirmation.proceed).not.toBe("");
    }
  });

  it("層の名前は控えの語そのもので、… を含まない", () => {
    // 語尾の … belongs to the 控え that asks (doc-11 §12 の ②); the layer is named for the act itself,
    // and a mark inside its own name would predict a question that is already standing.
    for (const offer of everyOffer()) {
      expect(transitionConfirmation(offer).title).toBe(offer.label);
      expect(transitionConfirmation(offer).title).not.toContain("…");
    }
  });

  it("進む側は動作を名乗り、実行する では答えない", () => {
    // doc-11 §12: 指示対象より広い語を選ばない — the same judgement §7 made for 破棄して閉じる.
    for (const offer of everyOffer()) {
      const { proceed } = transitionConfirmation(offer);
      expect(proceed).not.toBe("実行する");
      // Naming the act means the 控え's own word is in the answer — 「アーカイブ」→「アーカイブする」.
      expect(proceed).toContain(offer.label);
    }
  });

  it("問いは控えの隣の 結果の予告 の言い直しではない", () => {
    // The effect line answers 「この控えは何をするか」 before the press and carries 完了整理's precondition,
    // which is already satisfied once the question can stand (doc-11 §12 の註).
    for (const offer of everyOffer()) {
      expect(transitionConfirmation(offer).question).not.toBe(offer.effect);
    }
    const complete = everyOffer().find((offer) => offer.kind === "taskComplete");
    if (complete === undefined) {
      throw new Error("expected taskComplete");
    }
    expect(complete.effect).toContain("Done のときのみ");
    expect(transitionConfirmation(complete).question).not.toContain("Done のときのみ");
  });

  it("片道の遷移は 3 件とも同じ語で戻せないことを述べる", () => {
    // One wording for the three, because it is one fact about them (the user's word, 2026-08-11 の目視).
    // The version number that first draft carried belongs to doc-8 §6.5, not to a question about this
    // press. 差し戻す・昇格 must not pick it up: those two *can* be taken back.
    for (const kind of ["taskArchive", "taskComplete", "draftArchive"] as const) {
      const offer = everyOffer().find((entry) => entry.kind === kind);
      if (offer === undefined) {
        throw new Error(`expected ${kind}`);
      }
      expect(transitionConfirmation(offer).question).toContain("この操作は戻せません。");
    }
    for (const kind of ["taskDemote", "draftPromote"] as const) {
      const offer = everyOffer().find((entry) => entry.kind === kind);
      if (offer === undefined) {
        throw new Error(`expected ${kind}`);
      }
      expect(transitionConfirmation(offer).question).not.toContain("戻せません");
    }
  });

  it("語尾の … は語の末尾にだけ足す", () => {
    expect(confirmMarkedLabel("アーカイブ")).toBe("アーカイブ…");
    expect(confirmMarkedLabel("OS の関連付けで開く")).toBe("OS の関連付けで開く…");
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
      reloadRequired: false,
    });
    expect(detail).toContain("task edit");
    expect(detail).toContain("Task TASK-9 not found");
    // 要再読込 でない失敗は再読込の注記を付けない — 付けると、何も起きていない失敗を
    // 「画面が作り直された」と読ませてしまう。
    expect(detail).not.toContain("再読込済み");
  });

  it("期限到達は終了コードではなく中断として述べ、適用の有無を断定しない", () => {
    const detail = failureDetail({
      command: "task edit",
      kind: { kind: "timedOut", afterMs: 30000 },
      stderr: "the backlog CLI did not finish within 30 seconds, so Atlas stopped waiting for it",
      completedBefore: 0,
      reloadRequired: true,
    });
    expect(detail).toContain("30 秒以内に終了しなかった");
    // decision-18: 強制終了した呼び出しが書いたかどうかは分からないので、既に適用済みとは書かない。
    expect(detail).toContain("変更したかどうかは分かりません");
    expect(detail).toContain("再読込済み");
    expect(detail).not.toContain("終了コード");
    expect(detail).not.toContain("既に適用済み");
  });

  it("2 回目以降の失敗は既に適用された件数を述べる", () => {
    const detail = failureDetail({
      command: "task edit",
      kind: { kind: "nonZero", code: 1 },
      stderr: "boom",
      completedBefore: 2,
      reloadRequired: true,
    });
    expect(detail).toContain("2 件は既に適用済み");
    expect(detail).not.toContain("分かりません");
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
