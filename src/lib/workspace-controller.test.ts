import { describe, expect, it } from "vitest";
import { loaded, snapshot, taskView, unreadable } from "./fixtures";
import { createWorkspaceController, initialWorkspaceState } from "./workspace-controller";
import type { CommandError, ProjectLoad, ProjectSnapshot } from "./wire";

/**
 * A controller over a fake boundary. Every call is recorded, and each one can be made to reject, so the
 * tests below say what the *screen* is left holding rather than what the boundary was asked.
 */
function harness(
  options: {
    opened?: ProjectLoad[];
    watchFails?: boolean;
    openOneFails?: boolean;
    openAllFails?: boolean;
    subscribeFails?: boolean;
    watchEnabled?: boolean;
    slugs?: string[];
  } = {},
) {
  const state = initialWorkspaceState();
  const calls: string[] = [];
  const notices: (string | null)[] = [];
  let watchEnabled = options.watchEnabled ?? true;
  let emit: ((event: { slug: string; load: ProjectLoad }) => void) | null = null;
  let unsubscribed = false;

  const controller = createWorkspaceController(state, {
    openAll: () => {
      calls.push("openAll");
      return options.openAllFails === true
        ? Promise.reject({ kind: "ledger", detail: "no workspace" })
        : Promise.resolve(options.opened ?? []);
    },
    openOne: (slug) => {
      calls.push(`openOne:${slug}`);
      return options.openOneFails === true
        ? Promise.reject({ kind: "rootUnreadable", detail: "gone" })
        : Promise.resolve(snapshot(slug, [taskView({ id: "TASK-1" })]));
    },
    watchStart: (slug) => {
      calls.push(`watchStart:${slug}`);
      return options.watchFails === true
        ? Promise.reject({ kind: "ledger", detail: "no inotify" })
        : Promise.resolve();
    },
    watchStop: (slug) => {
      calls.push(`watchStop:${slug}`);
      return Promise.resolve();
    },
    subscribe: (onReload) => {
      calls.push("subscribe");
      if (options.subscribeFails === true) {
        return Promise.reject({ kind: "ledger", detail: "no channel" });
      }
      emit = onReload;
      return Promise.resolve(() => {
        unsubscribed = true;
      });
    },
    notify: (text) => notices.push(text?.() ?? null),
    commandError: (error) => error as CommandError,
    watchEnabled: () => watchEnabled,
    registeredSlugs: () => options.slugs ?? [],
    readLedger: () => {
      calls.push("readLedger");
      return Promise.resolve();
    },
  });

  return {
    state,
    calls,
    notices,
    controller,
    push: (slug: string, load: ProjectLoad) => emit?.({ slug, load }),
    wasUnsubscribed: () => unsubscribed,
    setWatchEnabled: (next: boolean) => {
      watchEnabled = next;
    },
  };
}

describe("ワークスペースの読取", () => {
  it("台帳を読んでから根を開き、開いた根ごとに監視を張る", async () => {
    const h = harness({ opened: [loaded("atlas", [taskView({ id: "TASK-1" })])] });

    await h.controller.load();

    // 台帳が先である — 行が無ければ読んだ結果を描く先が無い。
    expect(h.calls[0]).toBe("readLedger");
    expect(h.calls).toContain("openAll");
    expect(h.calls).toContain("watchStart:atlas");
    expect(Object.keys(h.state.loadBySlug)).toEqual(["atlas"]);
    expect(h.state.loading).toBe(false);
    expect(h.state.fatal).toBeNull();
  });

  it("読取不能の根も行として持つ（slug で引ける）", async () => {
    const h = harness({ opened: [unreadable("kanri")] });

    await h.controller.load();

    expect(h.state.loadBySlug.kanri?.state).toBe("unreadable");
  });

  it("読取そのものが失敗したら fatal を立て、読み込み中は解く", async () => {
    const h = harness({ openAllFails: true });

    await h.controller.load();

    expect(h.state.fatal?.()).toContain("no workspace");
    expect(h.state.loading).toBe(false);
  });

  /**
   * doc-9 §3: 監視が張れないことは読取の失敗ではない。行はもう画面にあり、以後の鮮度が最後の読取で
   * 止まるだけなので、報告して記録する。**記録が無ければ、その行に手動再読込を出す根拠が無い。**
   */
  it("監視が張れなかった根は記録され、読取は成功したままである", async () => {
    const h = harness({ opened: [loaded("atlas", [])], watchFails: true });

    await h.controller.load();

    expect(h.state.loadBySlug.atlas?.state).toBe("loaded");
    expect(h.state.unwatched).toEqual(["atlas"]);
    expect(h.notices.at(-1)).toContain("no inotify");
  });

  it("継続検出を切っている間は張らず、通知も出さない", async () => {
    const h = harness({ watchEnabled: false });

    expect(await h.controller.startWatch("atlas")).toBe(false);
    expect(h.calls).toEqual([]);
    expect(h.notices).toEqual([]);
  });
});

describe("継続検出の購読", () => {
  it("届いた再読取を行へ書き入れる", async () => {
    const h = harness();
    await h.controller.subscribe();

    h.push("atlas", loaded("atlas", [taskView({ id: "TASK-9" })]));

    expect(h.state.loadBySlug.atlas?.state).toBe("loaded");
    expect(h.state.reloadFeed).toBe("live");
  });

  /**
   * 購読できなければ、どの根の監視が動いても画面は変わらない。**行ごとの原因を持たない**ので
   * `unwatched` ではなくこちらに立ち、帯は全行を対象に述べる。
   */
  it("購読に失敗したら feed を unavailable にし、読取は続ける", async () => {
    const h = harness({ subscribeFails: true });

    await h.controller.subscribe();

    expect(h.state.reloadFeed).toBe("unavailable");
    expect(h.state.unwatched).toEqual([]);
    expect(h.notices.at(-1)).toContain("no channel");
  });

  it("release は購読を解き、登録済みの根の監視を止める", async () => {
    const h = harness({ slugs: ["atlas", "kanri"] });
    await h.controller.subscribe();

    h.controller.release();

    expect(h.wasUnsubscribed()).toBe(true);
    expect(h.calls).toContain("watchStop:atlas");
    expect(h.calls).toContain("watchStop:kanri");
  });
});

describe("監視の再調整", () => {
  it("切ったときは全部止め、行ごとの記録も落とす", async () => {
    const h = harness({ slugs: ["atlas", "kanri"], watchFails: true });
    await h.controller.startWatch("atlas");
    expect(h.state.unwatched).toEqual(["atlas"]);

    h.setWatchEnabled(false);
    await h.controller.reconcileWatches();

    expect(h.calls).toContain("watchStop:kanri");
    // 切っている間はどの行も監視されていないので、行ごとの原因はもう何も述べていない。
    expect(h.state.unwatched).toEqual([]);
  });

  it("入れたときは登録済みの根すべてに張る", async () => {
    const h = harness({ slugs: ["atlas", "kanri"] });

    await h.controller.reconcileWatches();

    expect(h.calls).toEqual(["watchStart:atlas", "watchStart:kanri"]);
  });
});

describe("1 つの根の再読込", () => {
  it("読み直して監視を張り直し、通知を降ろす", async () => {
    const h = harness({ watchFails: false });
    h.state.loadBySlug.atlas = unreadable("atlas");

    await h.controller.reread("atlas");

    expect(h.state.loadBySlug.atlas?.state).toBe("loaded");
    expect(h.calls).toEqual(["openOne:atlas", "watchStart:atlas"]);
    expect(h.notices).toContain(null);
  });

  /**
   * 待つのは、監視がまだ張れない根が「復帰したように見える」のを避けるためである。`startWatch` を
   * 待たないと、`unwatched` へ入る前に呼び出し側が画面を描き直しうる。
   */
  it("読み直せても監視が張れない根は 監視なし のままである", async () => {
    const h = harness({ watchFails: true });

    await h.controller.reread("atlas");

    expect(h.state.loadBySlug.atlas?.state).toBe("loaded");
    expect(h.state.unwatched).toEqual(["atlas"]);
  });

  it("読み直せなければ、その行だけが読取不能になる", async () => {
    const h = harness({ openOneFails: true });
    h.state.loadBySlug.kanri = loaded("kanri", []);

    await h.controller.reread("atlas");

    expect(h.state.loadBySlug.atlas?.state).toBe("unreadable");
    expect(h.state.loadBySlug.kanri?.state).toBe("loaded");
  });

  it("rereadAll は渡された行を順に読み直す", async () => {
    const h = harness();

    await h.controller.rereadAll(["atlas", "kanri"]);

    expect(h.calls.filter((call) => call.startsWith("openOne"))).toEqual([
      "openOne:atlas",
      "openOne:kanri",
    ]);
  });
});

describe("行の取得と手放し", () => {
  it("forget は読取結果と監視の記録の両方を落とす", async () => {
    const h = harness({ watchFails: true });
    await h.controller.startWatch("atlas");
    h.state.loadBySlug.atlas = loaded("atlas", []);

    h.controller.forget("atlas");

    expect(h.state.loadBySlug.atlas).toBeUndefined();
    expect(h.state.unwatched).toEqual([]);
  });

  it("adopt は更新が返した snapshot をその根の現在の読取にする", () => {
    const h = harness();
    const next: ProjectSnapshot = snapshot("atlas", [taskView({ id: "TASK-42" })]);

    h.controller.adopt("atlas", next);

    expect(h.controller.tasksOf("atlas").map((view) => view.task.id)).toEqual(["TASK-42"]);
  });

  it("tasksOf・candidatesOf は読めていない行では空である", () => {
    const h = harness();
    h.state.loadBySlug.atlas = unreadable("atlas");

    expect(h.controller.tasksOf("atlas")).toEqual([]);
    expect(h.controller.candidatesOf("atlas")).toEqual([]);
    expect(h.controller.snapshotOf("atlas")).toBeNull();
  });

  /** doc-4 §5: 解析不能 のタスクは id を持たないので、引き当ての鍵はファイルのパスである。 */
  it("viewAt はパスで引き、無ければ null である", () => {
    const h = harness();
    h.controller.adopt(
      "atlas",
      snapshot("atlas", [taskView({ id: "TASK-1", sourcePath: "/atlas/backlog/tasks/task-1.md" })]),
    );

    expect(
      h.controller.viewAt({ slug: "atlas", sourcePath: "/atlas/backlog/tasks/task-1.md" })?.task.id,
    ).toBe("TASK-1");
    expect(h.controller.viewAt({ slug: "atlas", sourcePath: "/atlas/nope.md" })).toBeNull();
  });
});
