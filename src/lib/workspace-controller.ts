/**
 * The read of every registered Backlog ルート and everything that keeps it current: the first open, one
 * root's re-read, 継続検出 (doc-9 §3), and the event that carries a watch's re-read back to the screen.
 *
 * These were spread across the shell as five functions and five holders that only ever made sense
 * together — a failed watch is recorded because it changes what the screen owes the user, a re-read is
 * the same call as a retry, and the subscription is the reason a watch can change anything here at all.
 * Held in one place, "how fresh is what the grid is drawing, and why" is one question with one answer.
 *
 * **The snapshots are this controller's and the row *order* is not.** Which slugs exist is the ledger's
 * (`ledger-controller.ts`), so the calls that walk every root take the slugs as an argument or read them
 * through a port rather than keeping a second list — two lists is how a row could be watched that is no
 * longer registered.
 */

import { msg } from "./messages";
import { unreadableDetail } from "./swimlane";
import type {
  ColumnCreateStatuses,
  CommandError,
  ProjectLoad,
  ProjectSnapshot,
  TaskView,
} from "./wire";

/** Where one task is named for a lookup: 解析不能 has no id (doc-4 §5), so the path is the key. */
export interface TaskRef {
  slug: string;
  sourcePath: string;
}

export interface WorkspaceState {
  /** Every registered root's latest read, by slug. What the grid draws. */
  loadBySlug: Record<string, ProjectLoad>;
  /**
   * Roots whose 継続検出 is not running (doc-9 §3): the watch refused to start, so nothing pushes a
   * re-read for them and their cards are only as fresh as the last read. Recorded rather than merely
   * reported, because it changes what the screen owes the user — an explicit re-read they can press,
   * which is the only thing that will show an external save for such a root.
   */
  unwatched: string[];
  /**
   * Whether a watch-triggered re-read can reach the screen at all. The event subscription is the
   * frontend half of 継続検出 (doc-9 §3): without it every root's watch can run perfectly and still
   * change nothing here, because no one copies the emitted `ProjectLoad` in. Held beside `unwatched`
   * because it has the same consequence for the user (only an explicit re-read refreshes anything) but
   * no per-root cause — it makes *every* row stale.
   */
  reloadFeed: "live" | "unavailable";
  /** True while the whole-workspace read is in flight. */
  loading: boolean;
  /** A failure that left the screen with nothing to draw, as opposed to one bad row. */
  // A thunk for the reason a 通知 is one: the failure outlives the read that raised it, and a stored
  // sentence would keep the 表示言語 it was worded in (decision-35).
  fatal: (() => string) | null;
}

export function initialWorkspaceState(): WorkspaceState {
  return { loadBySlug: {}, unwatched: [], reloadFeed: "live", loading: true, fatal: null };
}

export interface WorkspaceControllerPorts {
  /** Open every registered root (doc-4). One call, one outcome per root. */
  openAll: () => Promise<ProjectLoad[]>;
  /** Open one root — which is also the re-read: doc-9 §3 funnels every trigger through one reload. */
  openOne: (slug: string) => Promise<ProjectSnapshot>;
  watchStart: (slug: string) => Promise<void>;
  watchStop: (slug: string) => Promise<void>;
  /**
   * Subscribe to the boundary's re-read events. Resolves with the function that ends the subscription,
   * so the screen can let go of it when it goes away.
   */
  subscribe: (onReload: (event: { slug: string; load: ProjectLoad }) => void) => Promise<() => void>;
  /** Raise or take down the ⑤ 通知 (doc-11 §4) — the shell's band. */
  notify: (text: (() => string) | null) => void;
  /** The boundary's typed failure for a rejection (`settings-controller.ts` says why this is a port). */
  commandError: (error: unknown) => CommandError;
  /** 継続検出の可否 (doc-9 §3.1, decision-13) as アプリ設定 has it right now. */
  watchEnabled: () => boolean;
  /** The registered slugs in ledger order — the ledger's list, never a second copy of it. */
  registeredSlugs: () => readonly string[];
  /** The ledger read that has to happen before any root is opened, so a row exists to draw into. */
  readLedger: () => Promise<void>;
}

export interface WorkspaceController {
  /**
   * Read the ledger, then every root it names, and start 継続検出 for each that opened (doc-9 §3): the
   * boundary pushes each re-read on its event, which is what keeps the cards' 安定並び in step with the
   * files (doc-7 §7). Idempotent, so a retry can call it again.
   */
  load: () => Promise<void>;
  /**
   * Subscribe before the first read, so a change landing during startup is not missed.
   *
   * Failing to subscribe is the same kind of failure as a watch that will not start — the screen is one
   * read behind, not unusable — so it must not take the first read down with it, which would leave
   * 読み込み中 on screen over a workspace that reads perfectly well. It is *recorded* for the same reason
   * a failed watch is: with no listener, every root's watch can run and still change nothing here, so
   * the only thing that refreshes any row is the manual re-read — which the screen then has to offer
   * for all of them.
   */
  subscribe: () => Promise<void>;
  /**
   * Let go of the subscription and every watch. Best-effort on the watches: they would end with the
   * process anyway, but a dev-server reload leaves the Rust side running, and a second start would
   * otherwise be a no-op on a stale watch.
   */
  release: () => void;
  /**
   * Start 継続検出 for one root, reporting whether it is running (doc-9 §3). A failed watch is not a
   * failed read: the row's cards are already on screen and only stay as fresh as the last read, so it
   * is reported, not escalated — but it is *recorded*, because from then on the only thing that
   * refreshes that root is an explicit re-read, and the screen has to offer one.
   */
  startWatch: (slug: string) => Promise<boolean>;
  /** Bring every registered root's watch in line with 継続検出の可否 (doc-9 §3.1). */
  reconcileWatches: () => Promise<void>;
  /**
   * Re-read one root, and retry its watch. Answers both 再試行 for a ルート読取不能 row (doc-7 §6) and the
   * manual 再読込 (doc-9 §3 の再読込契機) — they are one call because `openOne` *is* the re-read, and a
   * root whose watch will not start has nothing else that refreshes it: re-selecting a task only
   * resolves it out of the snapshot already in hand. Other rows are untouched either way.
   */
  reread: (slug: string) => Promise<void>;
  /**
   * Re-read every row 継続検出 is not covering — the 上部帯 ④'s own operation (doc-11 §4: 帯が持つ操作は
   * 縮約しても帯に残し、操作へ到達するために別の場所を開かせない). Without it the band could only name the
   * state and point at a row's mark, which is unreachable while that row is scrolled out of view.
   * Sequential rather than parallel: with 継続検出 off every registered root is on this list, and they
   * read the same disks.
   */
  rereadAll: (slugs: readonly string[]) => Promise<void>;
  /**
   * Take a snapshot an update returned as this root's current read (doc-5 §6). Present exactly when
   * disk moved, so a failure that changed nothing leaves the display as it was — which is what lets a
   * panel offer a retry of the same input.
   */
  adopt: (slug: string, project: ProjectSnapshot) => void;
  /** Let go of one root's read and its watch record — 登録解除 (doc-3 §4.2). */
  forget: (slug: string) => void;
  /** One root's tasks as the current read has them, before any filtering. Empty when unreadable. */
  tasksOf: (slug: string) => TaskView[];
  /** One task as the current read of its root has it, or `null` when that read does not yield the file. */
  viewAt: (ref: TaskRef) => TaskView | null;
  /** One root's 列の作成時 status 候補 as the current read has them; empty for a row that is not loaded. */
  candidatesOf: (slug: string) => ColumnCreateStatuses[];
  /** One root's snapshot when the current read yields one, else `null`. */
  snapshotOf: (slug: string) => ProjectSnapshot | null;
}

export function createWorkspaceController(
  state: WorkspaceState,
  ports: WorkspaceControllerPorts,
): WorkspaceController {
  let unlisten: (() => void) | null = null;

  function detail(error: unknown): string {
    return unreadableDetail(ports.commandError(error));
  }

  async function startWatch(slug: string): Promise<boolean> {
    // 継続検出を切っている間は張らない (doc-9 §3.1). Reported as "not watching" without a notice: the user
    // chose it, and the 帯 already covers every row while the setting is off, so the reason is stated
    // once instead of once per root.
    if (!ports.watchEnabled()) {
      return false;
    }
    try {
      await ports.watchStart(slug);
      state.unwatched = state.unwatched.filter((candidate) => candidate !== slug);
      return true;
    } catch (error) {
      const said = detail(error);
      ports.notify(() => msg().shell.watchStartFailed(slug, said));
      if (!state.unwatched.includes(slug)) {
        state.unwatched = [...state.unwatched, slug];
      }
      return false;
    }
  }

  function tasksOf(slug: string): TaskView[] {
    const load = state.loadBySlug[slug];
    return load?.state === "loaded" ? load.project.tasks : [];
  }

  async function reread(slug: string): Promise<void> {
    try {
      state.loadBySlug[slug] = { state: "loaded", project: await ports.openOne(slug) };
      ports.notify(null);
      // Awaited, so a root re-read whose watch still refuses to start stays listed as 監視なし instead of
      // looking recovered (the notice `startWatch` sets is the report).
      await startWatch(slug);
    } catch (error) {
      state.loadBySlug[slug] = { state: "unreadable", slug, error: ports.commandError(error) };
    }
  }

  return {
    async load(): Promise<void> {
      state.loading = true;
      try {
        await ports.readLedger();
        const opened = await ports.openAll();
        const next: Record<string, ProjectLoad> = {};
        for (const outcome of opened) {
          next[outcome.state === "loaded" ? outcome.project.slug : outcome.slug] = outcome;
        }
        state.loadBySlug = next;
        state.fatal = null;
        for (const slug of Object.keys(next)) {
          void startWatch(slug);
        }
      } catch (error) {
        state.fatal = () => detail(error);
      } finally {
        state.loading = false;
      }
    },
    async subscribe(): Promise<void> {
      try {
        unlisten = await ports.subscribe((event) => {
          state.loadBySlug[event.slug] = event.load;
        });
      } catch (error) {
        state.reloadFeed = "unavailable";
        const said = detail(error);
        ports.notify(() => msg().shell.feedSubscribeFailed(said));
      }
    },
    release(): void {
      unlisten?.();
      unlisten = null;
      for (const slug of ports.registeredSlugs()) {
        void ports.watchStop(slug).catch(() => {});
      }
    },
    startWatch,
    async reconcileWatches(): Promise<void> {
      for (const slug of ports.registeredSlugs()) {
        if (ports.watchEnabled()) {
          await startWatch(slug);
        } else {
          await ports.watchStop(slug).catch(() => {});
        }
      }
      // Nothing is watched while the setting is off, so per-root failures recorded earlier no longer
      // describe anything: the 帯 already covers every row from the setting alone.
      if (!ports.watchEnabled()) {
        state.unwatched = [];
      }
    },
    reread,
    async rereadAll(slugs: readonly string[]): Promise<void> {
      for (const slug of slugs) {
        await reread(slug);
      }
    },
    adopt(slug: string, project: ProjectSnapshot): void {
      state.loadBySlug[slug] = { state: "loaded", project };
    },
    forget(slug: string): void {
      const { [slug]: _dropped, ...remaining } = state.loadBySlug;
      state.loadBySlug = remaining;
      state.unwatched = state.unwatched.filter((candidate) => candidate !== slug);
    },
    tasksOf,
    viewAt(ref: TaskRef): TaskView | null {
      return tasksOf(ref.slug).find((view) => view.task.sourcePath === ref.sourcePath) ?? null;
    },
    candidatesOf(slug: string): ColumnCreateStatuses[] {
      const load = state.loadBySlug[slug];
      return load?.state === "loaded" ? load.project.createStatusCandidates : [];
    },
    snapshotOf(slug: string): ProjectSnapshot | null {
      const load = state.loadBySlug[slug];
      return load?.state === "loaded" ? load.project : null;
    },
  };
}
