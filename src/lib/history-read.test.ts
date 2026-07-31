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
  const load = createHistoryLoader({
    read: () => reads[index++],
    peek: () => stored,
    store: (read) => (stored = read),
    // Stands in for the screen's `unreadableDetail(asCommandError(...))`: what matters here is
    // that a rejection reaches the port at all, not how the screen words it.
    describeError: (error) => JSON.stringify(error),
  });
  return { load, current: () => stored };
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
  if (read?.value.state !== "loaded") return null;
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

  it("reports the newest read's own failure through the error port", async () => {
    const failing = deferred();
    const { load, current } = loader([failing.promise]);

    void load("atlas", "TASK-1", INPUTS);
    expect(current()?.value.state).toBe("loading");
    failing.reject({ kind: "projectNotOpen", slug: "atlas" });
    await settle();

    const value = current()?.value;
    if (value?.state !== "failed") throw new Error("expected the read to be reported as failed");
    expect(value.detail).toContain("projectNotOpen");
  });
});
