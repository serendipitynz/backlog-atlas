import { describe, expect, it } from "vitest";
import {
  createHistoryLoader,
  historyKeyOf,
  type HistoryInputs,
  type HistoryRead,
} from "./history-read";
import { commit, history } from "./fixtures";
import type { TaskHistory } from "./wire";

/** A read whose completion the test decides, so completion order can be inverted at will. */
function deferred(): {
  promise: Promise<TaskHistory>;
  resolve: (value: TaskHistory) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: TaskHistory) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<TaskHistory>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function loader(reads: Promise<TaskHistory>[]) {
  let stored: HistoryRead | null = null;
  let index = 0;
  /** Every 読取識別子 the loader read under, and every one it cancelled, in order. */
  const started: string[] = [];
  const cancelled: string[] = [];
  const loader = createHistoryLoader({
    read: (_slug, _taskId, readId) => {
      started.push(readId);
      return reads[index++];
    },
    cancel: (readId) => {
      cancelled.push(readId);
      return Promise.resolve();
    },
    peek: () => stored,
    store: (read) => (stored = read),
    // Stands in for the screen's `unreadableDetail(asCommandError(...))`: what matters here is
    // that a rejection reaches the port at all, not how the screen words it.
    describeError: (error) => JSON.stringify(error),
  });
  return {
    load: loader.load,
    abandon: loader.abandon,
    current: () => stored,
    started,
    cancelled,
  };
}

/** The read inputs a task carries when nothing about them is under test. */
const INPUTS: HistoryInputs = {
  projectRoot: "/repos/atlas",
  gitRemotePresent: true,
  references: [],
};

/** Let every already-settled promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function historyWith(summary: string): TaskHistory {
  return history({ commits: { state: "searched", commits: [commit("a".repeat(10), summary)] } });
}

function summaryOf(read: HistoryRead | null): string | null {
  if (read?.value.state !== "loaded") {
    return null;
  }
  const commits = read.value.history.commits;
  return commits.state === "searched" ? (commits.commits[0]?.summary ?? null) : null;
}

describe("one task's Git history read never lands on another's panel", () => {
  it("drops a response whose task is no longer the one being read", async () => {
    const first = deferred();
    const second = deferred();
    const { load, current } = loader([first.promise, second.promise]);

    void load("atlas", "TASK-1", INPUTS);
    void load("atlas", "TASK-2", INPUTS);
    second.resolve(historyWith("TASK-2 commit"));
    first.resolve(historyWith("TASK-1 commit"));
    await settle();

    expect(current()?.key).toBe(historyKeyOf("atlas", "TASK-2", INPUTS));
    expect(summaryOf(current())).toBe("TASK-2 commit");
  });

  // A → B → A: the two A reads share a key, so only the per-call token tells them apart.
  it("keeps the newest read of a re-selected task, whichever response arrives last", async () => {
    const firstA = deferred();
    const b = deferred();
    const secondA = deferred();
    const { load, current } = loader([firstA.promise, b.promise, secondA.promise]);

    void load("atlas", "TASK-1", INPUTS); // A1
    void load("atlas", "TASK-2", INPUTS); // B
    void load("atlas", "TASK-1", INPUTS); // A2 — same key as A1
    secondA.resolve(historyWith("A2 commit"));
    await settle();
    expect(summaryOf(current())).toBe("A2 commit");

    // A1 finishing last must not resurrect the earlier answer.
    firstA.resolve(historyWith("A1 commit"));
    b.resolve(historyWith("B commit"));
    await settle();

    expect(current()?.key).toBe(historyKeyOf("atlas", "TASK-1", INPUTS));
    expect(summaryOf(current())).toBe("A2 commit");
  });

  it("does not let a superseded failure overwrite the current read", async () => {
    const firstA = deferred();
    const secondA = deferred();
    const { load, current } = loader([firstA.promise, secondA.promise]);

    void load("atlas", "TASK-1", INPUTS);
    void load("atlas", "TASK-1", INPUTS);
    secondA.resolve(historyWith("A2 commit"));
    await settle();
    firstA.reject(new Error("the project was closed"));
    await settle();

    expect(current()?.value.state).toBe("loaded");
    expect(summaryOf(current())).toBe("A2 commit");
  });

  it("supersedes a read whose inputs the screen has already left", async () => {
    // [P2] review finding: the backend copies References and the root out of the model, releases its
    // locks, and only then runs git/gh. An answer computed from References the task no longer has
    // would otherwise be accepted beside the new ones, because the task key never changed.
    const withPrA = deferred();
    const withPrB = deferred();
    const { load, current } = loader([withPrA.promise, withPrB.promise]);

    const before: HistoryInputs = { ...INPUTS, references: ["https://github.com/o/r/pull/1"] };
    const after: HistoryInputs = { ...INPUTS, references: ["https://github.com/o/r/pull/2"] };
    void load("atlas", "TASK-1", before);
    void load("atlas", "TASK-1", after); // same task, edited References
    withPrB.resolve(historyWith("PR#2 の読み"));
    withPrA.resolve(historyWith("PR#1 の読み")); // the stale lookup finishing last
    await settle();

    expect(current()?.key).toBe(historyKeyOf("atlas", "TASK-1", after));
    expect(summaryOf(current())).toBe("PR#2 の読み");
  });

  // 履歴読取の取消 (decision-19). Dropping a response on this side leaves the `gh` behind it running;
  // these fix that the loader also says so, and says it about the right read.
  it("cancels the read it supersedes, naming that read's own 読取識別子", async () => {
    const first = deferred();
    const second = deferred();
    const l = loader([first.promise, second.promise]);

    void l.load("atlas", "TASK-1", INPUTS);
    void l.load("atlas", "TASK-2", INPUTS);

    expect(l.cancelled).toEqual([l.started[0]]);
    // The read that replaced it is not cancelled by its own start — the positive counterpart,
    // without which "cancel everything on every load" would pass just as well.
    expect(l.cancelled).not.toContain(l.started[1]);
    // Two calls, two identifiers — and both carry this loader's generation, so a loader built after
    // a reload cannot name a read this one is still waiting on (PR #44 round 2).
    expect(new Set(l.started).size).toBe(2);
    const generation = l.started[0].split(":")[0];
    expect(l.started.every((id) => id.startsWith(`${generation}:`))).toBe(true);
    expect(l.started).toEqual([`${generation}:1`, `${generation}:2`]);
  });

  it("cancels the read in flight when the panel leaves with no next read", async () => {
    // The route the backend's 引き継ぎ cannot cover: closing the detail panel starts nothing that
    // would supersede the read, so without this its `gh` outlives the screen that asked for it.
    const open = deferred();
    const l = loader([open.promise]);

    void l.load("atlas", "TASK-1", INPUTS);
    l.abandon();

    expect(l.cancelled).toEqual([l.started[0]]);
  });

  it("does not cancel a read that already answered", async () => {
    // A cancel for a finished read would reach the backend after its registration is gone. Harmless
    // there, but sending it would mean this loader does not know what it is still waiting for — and
    // the same confusion would let a *later* read be cancelled by an earlier abandon.
    const done = deferred();
    const l = loader([done.promise]);

    void l.load("atlas", "TASK-1", INPUTS);
    done.resolve(historyWith("answered"));
    await settle();
    l.abandon();

    expect(l.cancelled).toEqual([]);
  });

  it("reports the newest read's own failure through the error port", async () => {
    const failing = deferred();
    const { load, current } = loader([failing.promise]);

    void load("atlas", "TASK-1", INPUTS);
    expect(current()?.value.state).toBe("loading");
    failing.reject({ kind: "projectNotOpen", slug: "atlas" });
    await settle();

    const value = current()?.value;
    if (value?.state !== "failed") {
      throw new Error("expected the read to be reported as failed");
    }
    expect(value.detail).toContain("projectNotOpen");
  });
});

describe("読取識別子 は loader 世代をまたいで衝突しない", () => {
  it("gives two loaders in one process distinct identifiers for their first call", () => {
    // PR #44 round 2 [P1]: the backend keys its cancellation registry on this value, and a webview
    // reload builds a new loader while the Rust side — and any read still waiting on `gh` — lives
    // on. If both loaders' first call were named `1`, the new read's registration would replace the
    // old one's and the old read's guard would then remove the new one, leaving a running `gh`
    // nothing can reach.
    const first: string[] = [];
    const second: string[] = [];
    const build = (into: string[]) =>
      createHistoryLoader({
        read: (_slug, _taskId, readId) => {
          into.push(readId);
          return new Promise<TaskHistory>(() => {});
        },
        cancel: () => Promise.resolve(),
        peek: () => null,
        store: () => {},
        describeError: () => "",
      });

    void build(first).load("atlas", "TASK-1", INPUTS);
    void build(second).load("atlas", "TASK-1", INPUTS);

    expect(first[0]).not.toBe(second[0]);
    // Both are their loader's first call, so what differs is the generation and only that — the
    // assertion above would also pass for a counter that merely never restarts, which is not what
    // survives a reload.
    expect(first[0].split(":")[1]).toBe("1");
    expect(second[0].split(":")[1]).toBe("1");
  });
});
