/**
 * Sequencing for the detail panel's Git 履歴 reads (doc-6 §3). The read is asynchronous while the
 * selection is not, so two things have to be true of whatever the panel displays: it is about the
 * task now open, and it is the newest answer — not merely the last one to arrive.
 *
 * Those are separate conditions, and one does not imply the other. "About the open task" is a
 * property of the task key, checked where the panel reads the record. "Newest" needs a per-call
 * token: selecting A, then B, then A again produces two reads that share A's key, so a key-only
 * check would let the first A's response be stored as the second's — and if it resolves last, it
 * would be what stays on screen.
 *
 * Kept out of the component so that ordering can be tested with controllable promises; the
 * component supplies the state it lives in through [`HistoryLoaderPorts`].
 */

import type { HistoryState } from "./detail";
import type { TaskHistory } from "./wire";

/**
 * One Git 履歴 read: what it is about, which call made it, and where that call got to.
 *
 * `token` is the screen's own "which call is this", and [`readIdOf`] turns it into the 読取識別子 the
 * backend files the call under (decision-19). One number, two uses: numbering the call twice would
 * let the screen and the backend disagree about which read a 取消 reaches.
 */
export interface HistoryRead {
  /** The task the read belongs to — [`historyKeyOf`]'s value. */
  key: string;
  /** Which call produced this record. Monotonic within one loader. */
  token: number;
  value: HistoryState;
}

/**
 * The inputs a Git 履歴 read is computed from, beyond the task's identity (doc-6 §3/§4/§6). The
 * backend copies these out of the open model, releases its locks, and only then runs `git` and `gh` —
 * so if any of them changes while a read is in flight, that read's answer describes a state the
 * screen has already left. Naming them in the key is what makes such a change start a newer read,
 * whose token then supersedes the stale one.
 */
export interface HistoryInputs {
  /** Where コミット検索 runs (doc-6 §3). A root move must not leave the old repository's answer up. */
  projectRoot: string;
  /** The 関連解決 gate (doc-6 §5). */
  gitRemotePresent: boolean;
  /** PR URL 抽出's input (doc-6 §4) — the coordinates each Pull Request is looked up at. */
  references: readonly string[];
}

/**
 * The identity of one Git 履歴 read: the task it is about, and the inputs it was computed from.
 * Serialized rather than concatenated, so no two (slug, TASK-ID) pairs can collide into one key.
 */
export function historyKeyOf(slug: string, taskId: string, inputs: HistoryInputs): string {
  return JSON.stringify([
    slug,
    taskId,
    inputs.projectRoot,
    inputs.gitRemotePresent,
    inputs.references,
  ]);
}

/**
 * What tells one loader instance from another, for the length of the backend's memory.
 *
 * The per-call token alone is not an identity the backend can key on. A reload of the webview builds
 * a new loader whose token starts at 1 again, while the Rust side and any read still waiting on `gh`
 * live on — so the new loader's first read would arrive under a number an older read still holds,
 * replacing its registration and then being removed by the older read's guard (PR #44 round 2).
 * Stamping each loader distinguishes them; `crypto.randomUUID` where the environment has it, and a
 * clock-plus-random string where it does not, since the only property needed is that two loaders in
 * one process's lifetime do not collide.
 */
function newGeneration(): string {
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid) {
    return uuid();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The 読取識別子 for one call: which loader asked, and which of its calls this is. */
function readIdOf(generation: string, token: number): string {
  return `${generation}:${token}`;
}

export interface HistoryLoaderPorts {
  read: (slug: string, taskId: string, readId: string) => Promise<TaskHistory>;
  /**
   * 履歴読取の取消 (decision-19): tell the backend that the read `readId` names is no longer wanted,
   * so it ends the `gh` it has in flight. Dropping the answer on this side does not stop that
   * process — this is the only thing that does.
   */
  cancel: (readId: string) => Promise<void>;
  /** The record the screen holds right now. */
  peek: () => HistoryRead | null;
  store: (read: HistoryRead) => void;
  /** Render a rejection as text — the boundary's typed failures, not an `Error`. */
  describeError: (error: unknown) => string;
}

/** What a loader offers its screen: start a read, and abandon the one running. */
export interface HistoryLoader {
  load: (slug: string, taskId: string, inputs: HistoryInputs) => Promise<void>;
  /**
   * Abandon the read in flight without starting another — what leaving the detail panel does
   * (decision-19). Nothing supersedes such a read, so without this its `gh` would outlive the screen
   * that asked for it. A no-op when the last read already finished.
   */
  abandon: () => void;
}

/**
 * A loader that stamps every call and stores only the newest call's result. A superseded call is
 * dropped in silence: its answer is not wrong, it is just no longer the one being asked for — and
 * since 2026-08-02 it is also cancelled, so the `gh` behind it stops rather than running on for a
 * screen that has moved (decision-19).
 */
export function createHistoryLoader(ports: HistoryLoaderPorts): HistoryLoader {
  const generation = newGeneration();
  let calls = 0;
  /** The 読取識別子 of the read still waiting for an answer, or `null` when none is. */
  let running: string | null = null;

  function stopRunning(): void {
    if (running === null) {
      return;
    }
    // Not awaited: the screen's next read must not queue behind a round trip whose only purpose is
    // to stop something. A rejection is nothing to report either — the read is being abandoned, and
    // an unhandled rejection here would be noise about a call whose answer nobody wanted.
    void ports.cancel(running).catch(() => {});
    running = null;
  }

  return {
    async load(slug: string, taskId: string, inputs: HistoryInputs): Promise<void> {
      const key = historyKeyOf(slug, taskId, inputs);
      // Cancelled before the next call starts, so the backend's own 引き継ぎ is a safety net rather
      // than the mechanism: this names the exact read being abandoned, while 引き継ぎ can only key on
      // the task and so cannot help when the next read is about a different one.
      stopRunning();
      const token = ++calls;
      const readId = readIdOf(generation, token);
      running = readId;
      ports.store({ key, token, value: { state: "loading" } });

      let value: HistoryState;
      try {
        value = { state: "loaded", history: await ports.read(slug, taskId, readId) };
      } catch (error) {
        value = { state: "failed", detail: ports.describeError(error) };
      }
      if (running === readId) {
        running = null;
      }

      // Every call stamps the record before awaiting, so "the stored token is still mine" is exactly
      // "no later call has started" — including a later call for the same task.
      if (ports.peek()?.token === token) {
        ports.store({ key, token, value });
      }
    },
    abandon: stopRunning,
  };
}
