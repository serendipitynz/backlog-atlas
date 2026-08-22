import { describe, expect, it } from "vitest";
import { entry } from "./fixtures";
import { createLedgerController, initialLedgerState } from "./ledger-controller";
import type { CommandError, LedgerResponse, ProjectEntry } from "./wire";

function response(slugs: string[], readOnly = false): LedgerResponse {
  return {
    ledger: { schema_version: 1, project: slugs.map((slug) => entry(slug)) },
    readOnly,
  };
}

/**
 * A controller over a fake boundary whose writes can be held open, so a test can have two operations in
 * flight and say which answer the screen adopted.
 */
function harness(options: { start?: string[]; failing?: boolean } = {}) {
  const state = initialLedgerState();
  const calls: string[] = [];
  const notices: (string | null)[] = [];
  const prunes: string[][] = [];
  const released: string[] = [];
  const forgotten: string[] = [];
  const rereads: string[] = [];
  /** Resolvers of the re-reads still in flight, so a test can hold one open across the flag's life. */
  const pendingRereads: (() => void)[] = [];
  const registering: boolean[] = [];
  let hidden: string[] = [];
  /** Resolvers of the writes still in flight, so a test decides when each one lands. */
  const pending: (() => void)[] = [];

  function held(answer: LedgerResponse): Promise<LedgerResponse> {
    if (options.failing === true) {
      return Promise.reject({ kind: "ledger", detail: "read-only ledger" });
    }
    return new Promise((resolve) => {
      pending.push(() => resolve(answer));
    });
  }

  const controller = createLedgerController(state, {
    list: () => {
      calls.push("list");
      return Promise.resolve(response(options.start ?? []));
    },
    locate: () => Promise.resolve("/config/projects.toml"),
    register: (request) => {
      calls.push(`register:${request.slug ?? "derived"}`);
      // `slug` is optional on the request (the boundary derives one), so the test always passes it.
      const slug = request.slug ?? "derived";
      const answer: { ledger: LedgerResponse; entry: ProjectEntry } = {
        ledger: response([...(options.start ?? []), slug]),
        entry: entry(slug),
      };
      if (options.failing === true) {
        return Promise.reject({ kind: "ledger", detail: "slug is taken" });
      }
      return new Promise((resolve) => {
        pending.push(() => resolve(answer));
      });
    },
    remove: (slug) => {
      calls.push(`remove:${slug}`);
      return held(response((options.start ?? []).filter((candidate) => candidate !== slug)));
    },
    update: (request) => {
      calls.push(`update:${request.slug}`);
      return held(response(options.start ?? []));
    },
    reorder: (slug, index) => {
      calls.push(`reorder:${slug}:${index}`);
      return held(response(options.start ?? []));
    },
    notify: (text) => notices.push(text?.() ?? null),
    commandError: (error) => error as CommandError,
    reread: (slug) => {
      rereads.push(slug);
      // Held rather than resolved: the 登録 flag has to stand *across* this call, and a port that
      // resolves at once leaves no moment in which the difference could show.
      return new Promise((resolve) => pendingRereads.push(() => resolve()));
    },
    forget: (slug) => forgotten.push(slug),
    pruneRowState: (slugs) => prunes.push([...slugs]),
    releaseRow: (slug) => released.push(slug),
    hiddenSlugs: () => hidden,
    registering: (running) => registering.push(running),
  });

  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  };

  return {
    state,
    calls,
    notices,
    prunes,
    released,
    forgotten,
    rereads,
    registering,
    controller,
    settle,
    setHidden: (next: string[]) => {
      hidden = next;
    },
    /** Land the ledger answer alone, leaving whatever it starts still in flight. */
    landLedger: async (): Promise<void> => {
      pending.shift()?.();
      await settle();
    },
    /** Land the re-read the register is waiting on. */
    landReread: async (): Promise<void> => {
      pendingRereads.shift()?.();
      await settle();
    },
    /** Land every write and every re-read, in issue order, letting the queue advance between them. */
    flush: async (): Promise<void> => {
      await settle();
      while (pending.length > 0 || pendingRereads.length > 0) {
        pending.shift()?.();
        pendingRereads.shift()?.();
        await settle();
      }
    },
  };
}

describe("台帳の読取と適用", () => {
  it("読んだ台帳の順序と読取専用を取り、行の値を突き合わせる", async () => {
    const h = harness({ start: ["atlas", "kanri"] });

    await h.controller.read();

    expect(h.controller.slugs()).toEqual(["atlas", "kanri"]);
    expect(h.state.readOnly).toBe(false);
    // doc-7 §5.1 の 復元時の正規化 の行の側 — 台帳が答えるたびに突き合わせる。
    expect(h.prunes).toEqual([["atlas", "kanri"]]);
  });

  it("どの操作の答えでも行の値を突き合わせる", async () => {
    const h = harness({ start: ["atlas"] });
    void h.controller.update({ slug: "atlas", project_root: "/moved" });
    await h.flush();

    expect(h.prunes.at(-1)).toEqual(["atlas"]);
  });
});

/**
 * 台帳の書込みは 1 件ずつである。各コマンドは **自分が書いた台帳** を返すので、2 件が同時に走ると
 * 答えの順序が書込みの順序と違いうる — 後から書いた登録の答えが先に着き、先に書いた削除の答えが
 * 後から着けば、実際には残っている項目を落とした台帳を取ってしまう。
 */
describe("同時に 1 件だけ", () => {
  it("走っている間の 2 件目は拒否され、コマンドは出ない", async () => {
    const h = harness({ start: ["atlas"] });
    const first = h.controller.remove("atlas");
    await h.settle();

    const second = await h.controller.update({ slug: "atlas", project_root: "/moved" });

    expect(second.state).toBe("refused");
    expect(h.calls).not.toContain("update:atlas");
    await h.flush();
    expect((await first).state).toBe("done");
  });

  it("終わったら次の 1 件は通る", async () => {
    const h = harness({ start: ["atlas"] });
    void h.controller.remove("atlas");
    await h.flush();

    const next = h.controller.update({ slug: "atlas", project_root: "/moved" });
    await h.flush();

    expect(h.calls).toContain("update:atlas");
    expect((await next).state).toBe("done");
  });

  it("拒否された書込みでも次の 1 件は出せる（旗が下りている）", async () => {
    const h = harness({ start: ["atlas"], failing: true });

    const refused = await h.controller.remove("atlas");
    expect(refused.state).toBe("refused");
    expect(h.state.busy).toBe(false);
  });
});

describe("登録", () => {
  /**
   * 発行中 の旗は **再読取まで** 立っている。モーダルの 2 つの出口は登録が未解決の間ずっと断られる
   * のであって、台帳が答えた瞬間に開くのではない — 行がまだ画面に無い。
   */
  it("旗は台帳の答えではなく、読み込み終わりまで立っている", async () => {
    const h = harness();
    const running = h.controller.register({ slug: "atlas", project_root: "/atlas" });
    await h.settle();
    expect(h.registering).toEqual([true]);

    // 台帳が答えた。行はまだ読めていない。
    await h.landLedger();
    expect(h.rereads).toEqual(["atlas"]);
    expect(h.registering).toEqual([true]);

    // 読み込みが終わって初めて旗が降りる。
    await h.landReread();
    await running;
    expect(h.registering).toEqual([true, false]);
  });

  it("拒否されたら理由を返し、読み直さない", async () => {
    const h = harness({ failing: true });

    const result = await h.controller.register({ slug: "atlas", project_root: "/atlas" });

    expect(result.state).toBe("refused");
    expect(h.rereads).toEqual([]);
    expect(h.registering).toEqual([true, false]);
  });
});

describe("登録解除", () => {
  it("読取結果と、その slug で引かれる画面の状態を手放す", async () => {
    const h = harness({ start: ["atlas", "kanri"] });
    void h.controller.remove("atlas");
    await h.flush();

    expect(h.forgotten).toEqual(["atlas"]);
    expect(h.released).toEqual(["atlas"]);
    expect(h.controller.slugs()).toEqual(["kanri"]);
  });

  it("拒否されたら何も手放さない", async () => {
    const h = harness({ start: ["atlas"], failing: true });

    await h.controller.remove("atlas");

    expect(h.forgotten).toEqual([]);
    expect(h.released).toEqual([]);
  });
});

describe("更新", () => {
  it("並べ替えだけの要求は読み直さない", async () => {
    const h = harness({ start: ["atlas", "kanri"] });
    void h.controller.update({ slug: "atlas", new_index: 1 });
    await h.flush();

    expect(h.rereads).toEqual([]);
  });

  /** 根の移動は模型を旧ファイルの模型にし、別名表の編集は列の解釈を変える（doc-7 §4）。 */
  it("それ以外の変更はその根を読み直す", async () => {
    const h = harness({ start: ["atlas"] });
    void h.controller.update({ slug: "atlas", project_root: "/moved" });
    await h.flush();

    expect(h.rereads).toEqual(["atlas"]);
  });
});

describe("並べ替え", () => {
  /**
   * 間の行が非表示のとき、押した控えが見た目どおりに動くのは **見えている隣** の台帳位置を渡すからで
   * ある。`index ± 1` だと、画面に無い行と入れ替わって何も動かない。
   */
  it("見えている隣の台帳位置を渡す", async () => {
    const h = harness({ start: ["atlas", "hidden-one", "kanri"] });
    await h.controller.read();
    h.setHidden(["hidden-one"]);

    void h.controller.move("atlas", 1);
    await h.flush();

    expect(h.calls).toContain("reorder:atlas:2");
  });

  it("端の行は動かさず、コマンドも出さない", async () => {
    const h = harness({ start: ["atlas", "kanri"] });
    await h.controller.read();

    await h.controller.move("atlas", -1);

    expect(h.calls.filter((call) => call.startsWith("reorder"))).toEqual([]);
  });

  it("他の書込みが走っている間は述べて落とす", async () => {
    const h = harness({ start: ["atlas", "kanri"] });
    await h.controller.read();
    void h.controller.remove("kanri");
    await h.settle();

    await h.controller.move("atlas", 1);

    expect(h.calls.filter((call) => call.startsWith("reorder"))).toEqual([]);
    expect(h.notices.at(-1)).not.toBeNull();
  });

  it("断られたら理由を述べる", async () => {
    const h = harness({ start: ["atlas", "kanri"], failing: true });
    h.state.entries = [entry("atlas"), entry("kanri")];

    await h.controller.move("atlas", 1);

    expect(h.notices.at(-1)).toContain("read-only ledger");
  });

  it("通ったら前の通知を降ろす", async () => {
    const h = harness({ start: ["atlas", "kanri"] });
    await h.controller.read();

    void h.controller.move("atlas", 1);
    await h.flush();

    expect(h.notices.at(-1)).toBeNull();
  });
});
