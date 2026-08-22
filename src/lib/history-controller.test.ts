import { describe, expect, it } from "vitest";
import { entry, history, taskView } from "./fixtures";
import { createHistoryController, initialHistoryState } from "./history-controller";
import type { CommandError, TaskHistory } from "./wire";

function harness(options: { readFails?: boolean } = {}) {
  const state = initialHistoryState();
  const reads: string[] = [];
  const cancels: string[] = [];
  /** Resolvers of the reads still in flight, so a test decides which answer arrives when. */
  const pending: { readId: string; resolve: (value: TaskHistory) => void }[] = [];

  const controller = createHistoryController(state, {
    read: (_slug, taskId, readId) => {
      reads.push(`${taskId}:${readId}`);
      if (options.readFails === true) {
        return Promise.reject({ kind: "gitFailed", detail: "no repository" });
      }
      return new Promise((resolve) => pending.push({ readId, resolve }));
    },
    cancel: (readId) => {
      cancels.push(readId);
      return Promise.resolve();
    },
    describeError: (error) => (error as CommandError & { detail: string }).detail,
  });

  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  };

  return {
    state,
    controller,
    reads,
    cancels,
    settle,
    inFlight: () => pending.length,
    /** Land the read at `index` of those in flight — a later one first is what the token has to survive. */
    landAt: (index: number, value: TaskHistory) => {
      const [held] = pending.splice(index, 1);
      held?.resolve(value);
    },
  };
}

const ATLAS = entry("atlas");
const TASK = taskView({ id: "TASK-1", references: ["https://example.test/pr/1"] });

describe("読取の対象", () => {
  it("根・関連解決の可否・References が読取の入力である", () => {
    const h = harness();

    expect(h.controller.inputsOf(TASK, ATLAS)).toEqual({
      projectRoot: ATLAS.project_root,
      gitRemotePresent: ATLAS.git_remote_present,
      references: TASK.task.references,
    });
  });

  /** doc-6 §3: コミット検索 は TASK-ID を鍵にするので、id が無いタスクは読む対象を持たない。 */
  it("タスクが無い・id が無い・台帳項目が無いときは入力が無い", () => {
    const h = harness();

    expect(h.controller.inputsOf(null, ATLAS)).toBeNull();
    expect(h.controller.inputsOf(taskView({ id: null }), ATLAS)).toBeNull();
    expect(h.controller.inputsOf(TASK, null)).toBeNull();
  });

  it("鍵は入力込みで、入力が動けば別の鍵になる", () => {
    const h = harness();
    const first = h.controller.keyOf(TASK, h.controller.inputsOf(TASK, ATLAS));
    const moved = h.controller.keyOf(
      TASK,
      h.controller.inputsOf(TASK, { ...ATLAS, project_root: "/moved" }),
    );

    expect(first).not.toBeNull();
    expect(moved).not.toBe(first);
  });

  it("読む対象が無ければ鍵も無い", () => {
    const h = harness();

    expect(h.controller.keyOf(null, null)).toBeNull();
    expect(h.controller.keyOf(taskView({ id: null }), null)).toBeNull();
  });
});

describe("画面が見せるもの", () => {
  it("id を持たないタスクはその状態を述べる", () => {
    const h = harness();

    expect(h.controller.shown(taskView({ id: null }), null)).toEqual({ state: "noTaskId" });
  });

  /**
   * 鍵が合わない読取は「まだ読んでいない」に数える。**前のタスクのコミットを見せない**のがこの分岐の
   * 仕事で、選択が動いた直後は 読み込み中 と読める。
   */
  it("持っている読取の鍵が合わなければ 読み込み中 である", () => {
    const h = harness();
    h.state.read = { key: "other", token: 1, value: { state: "loaded", history: history({}) } };

    expect(h.controller.shown(TASK, "mine")).toEqual({ state: "loading" });
  });

  it("鍵が合えばその読取を見せる", () => {
    const h = harness();
    const value = { state: "loaded", history: history({}) } as const;
    h.state.read = { key: "mine", token: 1, value };

    expect(h.controller.shown(TASK, "mine")).toEqual(value);
  });
});

describe("読取の起動と取消", () => {
  it("鍵があれば読み、記録は 読み込み中 から始まる", async () => {
    const h = harness();
    const inputs = h.controller.inputsOf(TASK, ATLAS);
    const key = h.controller.keyOf(TASK, inputs);

    h.controller.follow(key, TASK, inputs);

    expect(h.state.read?.value).toEqual({ state: "loading" });
    expect(h.reads).toHaveLength(1);

    h.landAt(0, history({}));
    await h.settle();
    expect(h.state.read?.value.state).toBe("loaded");
  });

  /**
   * decision-19: 読む対象が無くなったとき、その読取を追い越す次の読取は無い。**取消だけがその `gh` を
   * 終わらせる**ので、鍵が null になった回はそれを出す。
   */
  it("鍵が無くなったら、走っている読取を取消す", () => {
    const h = harness();
    const inputs = h.controller.inputsOf(TASK, ATLAS);
    h.controller.follow(h.controller.keyOf(TASK, inputs), TASK, inputs);
    expect(h.cancels).toEqual([]);

    h.controller.follow(null, null, null);

    expect(h.cancels).toHaveLength(1);
  });

  it("走っている読取が無ければ、取消は何もしない", () => {
    const h = harness();

    h.controller.follow(null, null, null);

    expect(h.cancels).toEqual([]);
  });

  it("鍵はあっても読む材料が無ければ、読みも取消もしない", () => {
    const h = harness();

    h.controller.follow("some-key", taskView({ id: null }), null);

    expect(h.reads).toEqual([]);
    expect(h.cancels).toEqual([]);
  });

  /** 再取得 は同じ鍵に対して走る — 鍵が動いたときだけ走る `follow` とは契機が違う。 */
  it("再取得 は同じ鍵でもう 1 度読む", () => {
    const h = harness();
    const inputs = h.controller.inputsOf(TASK, ATLAS);
    h.controller.follow(h.controller.keyOf(TASK, inputs), TASK, inputs);

    h.controller.reread(TASK, inputs);

    expect(h.reads).toHaveLength(2);
    // 前の読取は追い越されるので、その `gh` は取消される。
    expect(h.cancels).toHaveLength(1);
  });

  it("再取得 も、読む材料が無ければ何もしない", () => {
    const h = harness();

    h.controller.reread(null, null);
    h.controller.reread(taskView({ id: null }), h.controller.inputsOf(TASK, ATLAS));

    expect(h.reads).toEqual([]);
  });

  /**
   * A→B→A のように鍵が戻る経路では 2 つの読取が同じ鍵を共有するので、鍵だけの検査では 1 件目の答えを
   * 2 件目のものとして書き込みうる。**呼び出しごとの番号** がそれを分ける。
   */
  it("古い読取の答えは、新しい読取が始まった後には入らない", async () => {
    const h = harness();
    const inputs = h.controller.inputsOf(TASK, ATLAS);
    const key = h.controller.keyOf(TASK, inputs);
    h.controller.reread(TASK, inputs);
    h.controller.reread(TASK, inputs);
    expect(h.inFlight()).toBe(2);

    // 2 件目を先に着け、1 件目（古い呼び出し）を後から着ける。
    h.landAt(1, history({}));
    await h.settle();
    const afterNewer = h.state.read?.token;
    h.landAt(0, history({}));
    await h.settle();

    expect(h.state.read?.token).toBe(afterNewer);
    expect(h.state.read?.key).toBe(key);
  });

  it("失敗した読取は理由を持って記録される", async () => {
    const h = harness({ readFails: true });
    const inputs = h.controller.inputsOf(TASK, ATLAS);

    h.controller.reread(TASK, inputs);
    await h.settle();

    expect(h.state.read?.value).toEqual({ state: "failed", detail: "no repository" });
  });
});
