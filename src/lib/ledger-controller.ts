/**
 * プロジェクト台帳 (doc-3 §4) as the screen holds it: the entry list, 登録・登録解除・更新・並べ替え, and the
 * one rule that makes those four safe to offer from three different screens at once.
 *
 * The shell issued these rather than the 台帳管理画面 for a reason that has not changed — the rows, the
 * open sessions and the watches move when the ledger does — but the *shell* was not where that reason
 * lived either. What each caller gets back is whether the operation was done or refused, and with which
 * reason; what happens to everything keyed by a slug that left the ledger is stated here once, through
 * ports, instead of once per caller.
 */

import { refusalReport, type LedgerActionResult } from "./ledger";
import { msg } from "./messages";
import { unreadableDetail } from "./swimlane";
import type {
  CommandError,
  LedgerResponse,
  ProjectEntry,
  RegisterRequest,
  UpdateRequest,
} from "./wire";

export interface LedgerState {
  /** Every registered project, in ledger order (doc-3 §2.2). The row order the grid draws. */
  entries: ProjectEntry[];
  /** The ledger file's path (doc-3 §2.1), for the 登録 panel to show. `null` until it is known. */
  path: string | null;
  /** 台帳読取専用 — the 上部帯 ③ (doc-11 §4). Comes back with every ledger answer. */
  readOnly: boolean;
  /**
   * True while a ledger command is in flight. Ledger operations are issued one at a time on purpose:
   * each command returns the ledger *it* wrote, and two in flight can answer out of order — the boundary
   * releases its lifecycle lock before joining a detached watch thread, so a removal can reply after a
   * registration that wrote later. Adopting the earlier snapshot would drop an entry the ledger actually
   * holds, until the next read put it back.
   *
   * Serializing at the point of issue is what keeps response order equal to write order, and it has to
   * live at this level rather than in one screen: the swimlane's row reorder writes the ledger too, so a
   * per-screen guard would leave that caller racing the others.
   */
  busy: boolean;
}

export function initialLedgerState(): LedgerState {
  return { entries: [], path: null, readOnly: false, busy: false };
}

export interface LedgerControllerPorts {
  list: () => Promise<LedgerResponse>;
  locate: () => Promise<string>;
  register: (request: RegisterRequest) => Promise<{ ledger: LedgerResponse; entry: ProjectEntry }>;
  remove: (slug: string) => Promise<LedgerResponse>;
  update: (request: UpdateRequest) => Promise<LedgerResponse>;
  reorder: (slug: string, index: number) => Promise<LedgerResponse>;
  /** Raise or take down the ⑤ 通知 (doc-11 §4) — the shell's band. */
  notify: (text: (() => string) | null) => void;
  /** The boundary's typed failure for a rejection (`settings-controller.ts` says why this is a port). */
  commandError: (error: unknown) => CommandError;
  /**
   * Read one root and start its watch. A newly registered project is in exactly the position a failed
   * row is — nothing has been read for it yet — and an 更新 that moved the root or changed the 別名表
   * invalidates what the row is showing, so both go through the same re-read.
   */
  reread: (slug: string) => Promise<void>;
  /** Let go of one root's snapshot and its watch record (doc-3 §4.2). */
  forget: (slug: string) => void;
  /**
   * 復元時の正規化 の行の側 (doc-7 §5.1): check 行非表示・行折畳み against the slugs the ledger just gave, and
   * write the result back when something was dropped. Held by the shell because those two values are the
   * grid's, and the write is アプリ設定's.
   */
  pruneRowState: (slugs: readonly string[]) => void;
  /**
   * Everything else keyed by a slug that has left the ledger — the open task, the 列内新規タスク入力, the
   * プロジェクト詳細画面 showing it. One port rather than four, because they are one consequence of one
   * fact, and a caller cannot take some of it.
   */
  releaseRow: (slug: string) => void;
  /** 行非表示 (doc-7 §5.1) as the grid has it — what makes 並べ替え pass the row the user can see. */
  hiddenSlugs: () => readonly string[];
  /**
   * Whether a 登録 issued from the モーダル is unresolved. Raised here rather than in the form: the
   * モーダル's two exits have to be turned away for as long as it is, and neither of them is the form's
   * control (doc-11 §7).
   */
  registering: (running: boolean) => void;
}

export interface LedgerController {
  /** Read the ledger and adopt it. The read every start and every 再読込 begins with. */
  read: () => Promise<void>;
  /** Where `projects.toml` is (doc-3 §2.1). One resolution per run — it cannot change while up. */
  locate: () => Promise<void>;
  /**
   * Register a project (doc-3 §4.1) and read it into its row.
   */
  register: (request: RegisterRequest) => Promise<LedgerActionResult>;
  /**
   * Remove a project from the ledger (doc-3 §4.2) and let go of its row. The boundary has already closed
   * its session and stopped its watch; what is left is the screen state keyed by that slug, which would
   * otherwise keep a row — and a バージョン不整合 mark — for a project Atlas no longer reads.
   */
  remove: (slug: string) => Promise<LedgerActionResult>;
  /**
   * Update one ledger entry (doc-3 §4.3). Every change but a reorder is followed by a re-read of that
   * root, because both kinds of change invalidate what the row is showing: a move makes the model a model
   * of the old files (the boundary closes the session for that reason), and a 別名表 edit changes the
   * interpretation the snapshot was built with — the column a task sits in (doc-7 §4). A reorder touches
   * neither, so it only reorders the rows.
   */
  update: (request: UpdateRequest) => Promise<LedgerActionResult>;
  /**
   * Move a row past its nearest *visible* neighbour. Using the neighbour's ledger index rather than
   * `index ± 1` is what makes the button do what it looks like it does when rows in between are hidden —
   * those rows keep their ledger position, and the moved row lands on the other side of the row the user
   * can actually see.
   */
  move: (slug: string, direction: -1 | 1) => Promise<void>;
  /** The registered slugs in ledger order. The one list — nobody keeps a second copy. */
  slugs: () => string[];
}

/** The answer to a ledger action asked for while another was still in flight. */
function busyResult(): LedgerActionResult {
  return { state: "refused", report: { message: msg().shell.ledgerBusy, field: null } };
}

export function createLedgerController(
  state: LedgerState,
  ports: LedgerControllerPorts,
): LedgerController {
  /** Adopt a ledger the boundary just returned: the row order and the read-only state come with it. */
  function adopt(response: LedgerResponse): void {
    state.entries = response.ledger.project;
    state.readOnly = response.readOnly;
    // Every answer the ledger gives is where the two row values are checked against it — the ledger is
    // what says which slugs exist. This covers both cases doc-7 §5.1 names: a slug left in a hand-edited
    // アプリ設定ファイル, and 登録解除 dropping the row's values (doc-3 §4.2), which is why `remove` below
    // no longer filters them itself.
    ports.pruneRowState(response.ledger.project.map((entry) => entry.slug));
  }

  /**
   * Run one ledger write under the one-at-a-time guard, adopt what it returned, and word a refusal
   * (doc-3 §4). Held as one function because the guard, the adopt and the refusal are the same three
   * steps for all four operations, and a fifth would otherwise copy them.
   */
  async function issue(
    run: () => Promise<{
      response: LedgerResponse;
      slug: string;
      after?: () => void | Promise<void>;
    }>,
    /**
     * A second flag to hold for exactly as long as this operation is unresolved — 登録's is the only one,
     * and it has to span the re-read as well, since the モーダル's exits stay turned away until the row
     * the registration made is on screen.
     */
    hold?: (running: boolean) => void,
  ): Promise<LedgerActionResult> {
    if (state.busy) {
      return busyResult();
    }
    state.busy = true;
    hold?.(true);
    try {
      const { response, slug, after } = await run();
      adopt(response);
      await after?.();
      return { state: "done", slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(ports.commandError(error)) };
    } finally {
      state.busy = false;
      hold?.(false);
    }
  }

  return {
    async read(): Promise<void> {
      adopt(await ports.list());
    },
    async locate(): Promise<void> {
      // A failure leaves it `null`, which draws no row — it withholds no control, since knowing the path
      // is not what makes an edit possible.
      try {
        state.path = await ports.locate();
      } catch {
        state.path = null;
      }
    },
    register(request: RegisterRequest): Promise<LedgerActionResult> {
      return issue(async () => {
        const response = await ports.register(request);
        return {
          response: response.ledger,
          slug: response.entry.slug,
          // The re-read is the read: a newly registered root is in the same position a failed row is.
          after: () => ports.reread(response.entry.slug),
        };
      }, ports.registering);
    },
    remove(slug: string): Promise<LedgerActionResult> {
      return issue(async () => ({
        response: await ports.remove(slug),
        slug,
        after: () => {
          ports.forget(slug);
          // 行非表示・行折畳み for this slug went with the adopt above — it prunes both against the ledger
          // it was handed (doc-7 §5.1 の 復元時の正規化), and this row is no longer in it.
          ports.releaseRow(slug);
        },
      }));
    },
    update(request: UpdateRequest): Promise<LedgerActionResult> {
      return issue(async () => {
        const response = await ports.update(request);
        const reorderOnly = Object.keys(request).every(
          (key) => key === "slug" || key === "new_index",
        );
        return {
          response,
          slug: request.slug,
          after: reorderOnly ? undefined : () => ports.reread(request.slug),
        };
      });
    },
    async move(slug: string, direction: -1 | 1): Promise<void> {
      const hidden = ports.hiddenSlugs();
      const order = state.entries.map((entry) => entry.slug);
      const visible = order.filter((candidate) => !hidden.includes(candidate));
      const neighbour = visible[visible.indexOf(slug) + direction];
      if (neighbour === undefined) {
        return;
      }
      // A reorder writes the ledger like any other operation, so it queues behind one in flight rather
      // than racing it. Reported rather than dropped: the row visibly did not move, and the neighbour it
      // would have passed may be different by the time the other finishes.
      if (state.busy) {
        ports.notify(() => msg().shell.ledgerBusy);
        return;
      }
      state.busy = true;
      try {
        adopt(await ports.reorder(slug, order.indexOf(neighbour)));
        ports.notify(null);
      } catch (error) {
        const detail = unreadableDetail(ports.commandError(error));
        ports.notify(() => msg().shell.reorderFailed(detail));
      } finally {
        state.busy = false;
      }
    },
    slugs(): string[] {
      return state.entries.map((entry) => entry.slug);
    },
  };
}
