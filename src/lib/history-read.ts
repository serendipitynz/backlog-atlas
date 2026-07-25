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

/** One Git 履歴 read: what it is about, which call made it, and where that call got to. */
export interface HistoryRead {
  /** The task the read belongs to — [`historyKeyOf`]'s value. */
  key: string;
  /** Which call produced this record. Monotonic within one loader. */
  token: number;
  value: HistoryState;
}

/**
 * The identity of the task a read is about. Serialized rather than concatenated, so no two
 * (slug, TASK-ID) pairs can collide into one key.
 */
export function historyKeyOf(slug: string, taskId: string): string {
  return JSON.stringify([slug, taskId]);
}

export interface HistoryLoaderPorts {
  read: (slug: string, taskId: string) => Promise<TaskHistory>;
  /** The record the screen holds right now. */
  peek: () => HistoryRead | null;
  store: (read: HistoryRead) => void;
  /** Render a rejection as text — the boundary's typed failures, not an `Error`. */
  describeError: (error: unknown) => string;
}

/**
 * A loader that stamps every call and stores only the newest call's result. A superseded call is
 * dropped in silence: its answer is not wrong, it is just no longer the one being asked for.
 */
export function createHistoryLoader(
  ports: HistoryLoaderPorts,
): (slug: string, taskId: string) => Promise<void> {
  let calls = 0;
  return async function load(slug: string, taskId: string): Promise<void> {
    const key = historyKeyOf(slug, taskId);
    const token = ++calls;
    ports.store({ key, token, value: { state: "loading" } });

    let value: HistoryState;
    try {
      value = { state: "loaded", history: await ports.read(slug, taskId) };
    } catch (error) {
      value = { state: "failed", detail: ports.describeError(error) };
    }

    // Every call stamps the record before awaiting, so "the stored token is still mine" is exactly
    // "no later call has started" — including a later call for the same task.
    if (ports.peek()?.token === token) ports.store({ key, token, value });
  };
}
