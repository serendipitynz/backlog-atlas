/**
 * The 選択 → 読込 → 取消 half of the detail panel's Git 履歴 (doc-6 §3, decision-19). `history-read.ts`
 * owns which of several in-flight calls may store its answer; this owns what a read is *about* — the
 * inputs it is computed from, the key those make, and when a selection change starts or abandons one.
 *
 * The two were one file's worth of sequencing split across the shell: the loader was already outside
 * the component, while the key, the inputs and the effect that drives them sat in `App.svelte` beside
 * everything else the shell does. Holding them together is what makes "the panel never shows an answer
 * about a task it is no longer on" one statement in one place instead of an agreement between a module
 * and a component.
 *
 * **The state is passed in rather than reached for through ports.** This controller owns
 * [`HistoryControllerState`] — nothing else reads or writes it — so a `peek`/`store` pair would be two
 * holes standing in for one field. `settings-write.ts` takes ports for the opposite reason: the values
 * it reads and adopts belong to the shell.
 */

import type { HistoryState } from "./detail";
import {
  createHistoryLoader,
  historyKeyOf,
  type HistoryInputs,
  type HistoryLoaderPorts,
  type HistoryRead,
} from "./history-read";
import type { ProjectEntry, TaskView } from "./wire";

/** Where the read the screen holds lives. One field, because one read is shown at a time. */
export interface HistoryControllerState {
  read: HistoryRead | null;
}

export function initialHistoryState(): HistoryControllerState {
  return { read: null };
}

/** The boundary calls and the wording of a rejection — what the loader needs beyond the state. */
export type HistoryControllerPorts = Pick<HistoryLoaderPorts, "read" | "cancel" | "describeError">;

export interface HistoryController {
  /**
   * The inputs the open task's read is computed from (doc-6 §3/§4/§6), or `null` when there is nothing
   * to read — no task, a task with no TASK-ID (コミット検索 keys on the id, doc-6 §3), or no ledger entry
   * for its root.
   */
  inputsOf: (view: TaskView | null, entry: ProjectEntry | null) => HistoryInputs | null;
  /**
   * Which read the panel is showing. The task alone is not enough: the backend copies these inputs out
   * of the open model, releases its locks and only then runs `git`/`gh` (decision-14), so an answer
   * computed from References or a root the screen has since left is stale. Keying on the inputs makes
   * such a change start a newer read, whose token supersedes the one in flight.
   */
  keyOf: (view: TaskView | null, inputs: HistoryInputs | null) => string | null;
  /** The read belonging to the *current* selection; anything else counts as not yet read. */
  shown: (view: TaskView | null, key: string | null) => HistoryState;
  /**
   * Start the read `key` names, or abandon the one in flight when there is none to start (decision-19:
   * nothing supersedes such a read, so the 取消 is the only thing that ends its `gh`).
   *
   * `key` is the whole trigger — the view and the inputs are read for the call's arguments only. That
   * split is the point: reading the view as a dependency would re-fetch on every unrelated root's
   * reload, since a reload replaces every view object.
   */
  follow: (key: string | null, view: TaskView | null, inputs: HistoryInputs | null) => void;
  /**
   * 再取得 (doc-6 §3): read the open task's 履歴 again on demand. A commit is not file state — no watch
   * reports a new one — so nothing else re-reads it, which is why the panel offers a button at all.
   *
   * Separate from [`follow`] because the trigger is different in kind: `follow` fires when the key
   * moves and does nothing while it stands, and this fires on the same key. The read they issue is one
   * call, and the loader supersedes the older of the two either way.
   */
  reread: (view: TaskView | null, inputs: HistoryInputs | null) => void;
}

export function createHistoryController(
  state: HistoryControllerState,
  ports: HistoryControllerPorts,
): HistoryController {
  const loader = createHistoryLoader({
    read: ports.read,
    cancel: ports.cancel,
    // **No `untrack` here, where the shell had one.** In `App.svelte` this read sat in a component, so
    // the guard was what kept a `$state` read from becoming a dependency of whatever was drawing. What
    // makes it unnecessary now is not the move but the call site: `history-read.ts` calls `peek` past an
    // `await`, so no reactive context is on the stack. Restore the guard if that ever stops being true —
    // this file cannot see it from here, which is why it is written down.
    peek: () => state.read,
    store: (read) => {
      state.read = read;
    },
    describeError: ports.describeError,
  });

  function reread(view: TaskView | null, inputs: HistoryInputs | null): void {
    if (view === null || view.task.id === null || inputs === null) {
      return;
    }
    void loader.load(view.task.project, view.task.id, inputs);
  }

  return {
    inputsOf(view, entry) {
      if (view === null || view.task.id === null || entry === null) {
        return null;
      }
      return {
        projectRoot: entry.project_root,
        gitRemotePresent: entry.git_remote_present,
        references: view.task.references,
      };
    },
    keyOf(view, inputs) {
      if (view === null || view.task.id === null || inputs === null) {
        return null;
      }
      return historyKeyOf(view.task.project, view.task.id, inputs);
    },
    shown(view, key) {
      if (view !== null && view.task.id === null) {
        return { state: "noTaskId" };
      }
      return state.read !== null && state.read.key === key
        ? state.read.value
        : { state: "loading" };
    },
    follow(key, view, inputs) {
      if (key === null) {
        loader.abandon();
        return;
      }
      reread(view, inputs);
    },
    reread,
  };
}
