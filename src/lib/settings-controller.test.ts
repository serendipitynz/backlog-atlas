import { describe, expect, it } from "vitest";
import {
  createSettingsController,
  initialSettingsState,
  type SettingsController,
  type SettingsState,
} from "./settings-controller";
import type {
  AppSettings,
  CliReadiness,
  CommandError,
  EditorReadiness,
  ExternalProgramReport,
  LoadedSettings,
  StorageSelection,
} from "./wire";

const DEFAULTS: AppSettings = {
  schema_version: 1,
  theme: null,
  language: null,
  card_density: "m",
  default_storage_filter: ["active"],
  default_detail_placement: "sidebar",
  default_card_order: "priority_desc",
  watch_external_changes: true,
  collapsed_columns: [],
  folded_rows: [],
  hidden_rows: [],
};

function file(overrides: Partial<AppSettings> = {}): LoadedSettings {
  return { settings: { ...DEFAULTS, ...overrides }, status: { state: "stored" } };
}

/**
 * A controller over a fake アプリ設定ファイル and fake probes. Each probe can be held open, so a test can
 * have two in flight and say which answer the screen kept.
 */
function harness(
  options: {
    onDisk?: LoadedSettings;
    readFails?: boolean;
    saveFails?: boolean;
    storage?: StorageSelection[];
  } = {},
) {
  const state = initialSettingsState();
  let onDisk = options.onDisk ?? file();
  let saveFails = options.saveFails === true;
  const notices: (string | null)[] = [];
  const busy: boolean[] = [];
  const reconciles: number[] = [];
  let storage: readonly StorageSelection[] = options.storage ?? ["active"];
  const adoptedStorage: StorageSelection[][] = [];
  const adoptedGrid: unknown[] = [];
  /** Resolvers of the probes still in flight, keyed by which probe issued them. */
  const pendingCli: ((value: CliReadiness) => void)[] = [];
  const pendingEditor: ((value: EditorReadiness) => void)[] = [];
  const pendingPrograms: ((value: ExternalProgramReport[]) => void)[] = [];

  const controller = createSettingsController(state, {
    read: () =>
      options.readFails === true
        ? Promise.reject({ kind: "settings", detail: "broken toml" })
        : Promise.resolve(onDisk),
    save: (settings) => {
      if (saveFails) {
        return Promise.reject({ kind: "settings", detail: "file is newer" });
      }
      onDisk = { settings, status: { state: "stored" } };
      return Promise.resolve(onDisk);
    },
    locate: () => Promise.resolve("/config/settings.toml"),
    directoryPresent: () => Promise.resolve(true),
    openLocation: () => Promise.resolve(undefined),
    probeCli: () => new Promise((resolve) => pendingCli.push(resolve)),
    probeEditor: () => new Promise((resolve) => pendingEditor.push(resolve)),
    probePrograms: () => new Promise((resolve) => pendingPrograms.push(resolve)),
    notify: (text) => {
      // The band as the shell holds it: `notify` writes the thunk itself, so `standingNotice` can be
      // compared by identity — which is what "take down *its own* refusal" means.
      standing = text;
      notices.push(text?.() ?? null);
    },
    standingNotice: () => standing,
    commandError: (error) => error as CommandError,
    peekStorageFilter: () => storage,
    adoptStorageFilter: (next) => {
      storage = next;
      adoptedStorage.push([...next]);
    },
    adoptGridState: (next) => adoptedGrid.push(next),
    reconcileWatches: () => {
      reconciles.push(reconciles.length);
      return Promise.resolve();
    },
    busy: (running) => busy.push(running),
  });

  /** The ⑤ 通知 the screen is holding, as the controller's `standingNotice` port reports it. */
  let standing: (() => string) | null = null;

  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  };

  return {
    state,
    controller,
    notices,
    busy,
    reconciles,
    adoptedStorage,
    adoptedGrid,
    settle,
    diskNow: () => onDisk.settings,
    setStanding: (text: (() => string) | null) => {
      standing = text;
    },
    setSaveFails: (next: boolean) => {
      saveFails = next;
    },
    landCli: (value: CliReadiness) => pendingCli.shift()?.(value),
    landEditor: (value: EditorReadiness) => pendingEditor.shift()?.(value),
    /**
     * Land one probe out of order, by which call issued it. `0` is the oldest still in flight — landing
     * a later one first is the whole of what the per-call number has to survive.
     */
    landEditorAt: (index: number, value: EditorReadiness) => {
      const resolve = pendingEditor[index];
      pendingEditor.splice(index, 1);
      resolve?.(value);
    },
    landPrograms: (value: ExternalProgramReport[]) => pendingPrograms.shift()?.(value),
    inFlight: () => ({
      cli: pendingCli.length,
      editor: pendingEditor.length,
      programs: pendingPrograms.length,
    }),
  };
}

const READY: CliReadiness = { state: "ready", version: "1.50.1" };
const EDITOR: EditorReadiness = { configured: null, association: "vi" };

describe("読取の適用", () => {
  /**
   * 既定の詳細配置 と 3 値 は **初回の読取だけ** から取る。以後の読取は、この画面か設定画面が
   * いま行った書込みの答えなので、そこから撒き直すと保存中に畳んだ折畳みを元へ戻してしまう。
   */
  it("初回だけ 詳細配置 と 3 値 を取る", async () => {
    const h = harness({
      onDisk: file({ default_detail_placement: "modal", hidden_rows: ["kanri"] }),
    });

    await h.controller.load();
    expect(h.state.placement).toBe("modal");
    expect(h.adoptedGrid).toEqual([
      { collapsedColumns: [], foldedRows: [], hidden: ["kanri"] },
    ]);

    h.controller.adopt(file({ default_detail_placement: "sidebar", hidden_rows: ["atlas"] }));

    expect(h.state.placement).toBe("modal");
    expect(h.adoptedGrid).toHaveLength(1);
  });

  /** doc-7 §2.2 は全列を畳むのを禁じており、控えがそれを守る。保存値の 4 列はどこか他から来ている。 */
  it("列だけは復元時に正規化する（行は台帳とつき合わせるので、ここではしない）", async () => {
    const h = harness({
      onDisk: file({
        collapsed_columns: ["toDo", "inProgress", "inReview", "done"],
        folded_rows: ["gone"],
      }),
    });

    await h.controller.load();

    expect(h.adoptedGrid).toEqual([
      { collapsedColumns: [], foldedRows: ["gone"], hidden: [] },
    ]);
  });

  /**
   * 既定の保存区分・既定の並び順 は初期値なので、利用者がそれから動かした後で撒くと、別の画面で
   * 保存を押した瞬間に相手の作業を消すことになる。
   */
  it("画面がまだ既定のままなら 保存区分 を撒く", async () => {
    const h = harness({ onDisk: file({ default_storage_filter: ["active", "archive"] }) });

    await h.controller.load();

    expect(h.adoptedStorage).toEqual([["active", "archive"]]);
  });

  it("画面が絞り込みを動かしていたら撒かない", async () => {
    const h = harness({
      onDisk: file({ default_storage_filter: ["active", "archive"] }),
      storage: ["completed"],
    });

    await h.controller.load();

    expect(h.adoptedStorage).toEqual([]);
  });

  it("並び順も同じで、画面が選び直していたら撒かない", async () => {
    const h = harness({ onDisk: file({ default_card_order: "updated_desc" }) });
    await h.controller.load();
    expect(h.state.cardOrder).toBe("updated_desc");

    h.state.cardOrder = "priority_desc";
    h.controller.adopt(file({ default_card_order: "task_id_asc" }));

    expect(h.state.cardOrder).toBe("priority_desc");
  });

  it("読取そのものが失敗しても既定で立ち、理由を述べる", async () => {
    const h = harness({ readFails: true });

    await h.controller.load();

    expect(h.state.loaded).toBeNull();
    expect(h.notices.at(-1)).toContain("broken toml");
  });
});

describe("保存", () => {
  it("発行中の旗は書込みと適用を囲む", async () => {
    const h = harness();
    await h.controller.load();

    await h.controller.save((current) => ({ ...current, card_density: "l" }));

    expect(h.busy).toEqual([true, false]);
    expect(h.diskNow().card_density).toBe("l");
  });

  /**
   * 継続検出 は値を書くだけでは足りない — 切ったなら、いま走っている監視が実際に止まらなければ
   * 「次の起動から」になる。だから旗の内側で待つ。
   */
  it("継続検出が変わったときだけ監視を再調整する", async () => {
    const h = harness();
    await h.controller.load();

    await h.controller.save((current) => ({ ...current, card_density: "s" }));
    expect(h.reconciles).toEqual([]);

    await h.controller.save((current) => ({ ...current, watch_external_changes: false }));
    expect(h.reconciles).toEqual([0]);
  });

  /**
   * 保存が待つのは書込みと適用だけである。probe を待つと、`onsaved` が **別の下書きを持つ**
   * モーダルに対して後から発火し、破棄前確認なしに閉じて入力を失わせうる（doc-8 §6.3）。
   */
  it("probe は待たない — 解決したときには旗が下りている", async () => {
    const h = harness();
    await h.controller.load();

    await h.controller.save((current) => ({ ...current, card_density: "l" }));

    expect(h.busy).toEqual([true, false]);
    expect(h.inFlight().editor).toBe(1);
    expect(h.state.editor).toBeNull();

    h.landEditor(EDITOR);
    await h.settle();
    expect(h.state.editor).toEqual(EDITOR);
  });

  it("断られたら理由を返し、監視も probe も動かさない", async () => {
    const h = harness({ saveFails: true });
    await h.controller.load();

    const failure = await h.controller.save((current) => ({ ...current, card_density: "l" }));

    expect(failure?.()).toContain("file is newer");
    expect(h.reconciles).toEqual([]);
    expect(h.inFlight().editor).toBe(0);
  });
});

/**
 * probe は保存から切り離されているので 2 件が同時に走りうる（`backlog` のパスを保存 → 設定を開き直す →
 * `git` のパスを保存）。番号が無いと **遅い方の答え** が新しい方を上書きし、次の probe まで誰も直さない。
 */
describe("遅い probe は新しい答えを上書きしない", () => {
  it("後の保存の答えが着いたら、前の保存の答えは捨てる", async () => {
    const h = harness();
    await h.controller.load();

    await h.controller.save((current) => ({ ...current, card_density: "l" }));
    await h.controller.save((current) => ({ ...current, card_density: "s" }));

    expect(h.inFlight().editor).toBe(2);
    const [older, newer] = [EDITOR, { ...EDITOR, association: "code" }];

    // 2 件目（新しい呼び出し）を先に着け、1 件目（古い呼び出し）を **後から** 着ける。
    // 番号が無ければ、後から着いた古い答えが新しい答えを上書きする。
    h.landEditorAt(1, newer);
    await h.settle();
    h.landEditorAt(0, older);
    await h.settle();

    expect(h.state.editor).toEqual(newer);
  });

  it("解決結果の表示 は開くたびに 確認中 へ戻す", async () => {
    const h = harness();
    const programs: ExternalProgramReport[] = [
      { name: "backlog", program: "backlog", source: "onPath", outcome: { state: "launched", report: "1.50.1" } },
    ];
    void h.controller.refreshPrograms();
    h.landPrograms(programs);
    await h.settle();
    expect(h.state.programs).toEqual(programs);

    void h.controller.refreshPrograms();
    expect(h.state.programs).toBeNull();
  });
});

describe("起動時の probe", () => {
  it("答えたらそれを持つ", async () => {
    const h = harness();
    const running = h.controller.probeCli();
    h.landCli(READY);
    await running;

    expect(h.state.cli).toEqual(READY);
  });

  /**
   * **CLI の probe は、拒否そのものが答えである（doc-5 §5）。** `null` のままにすると画面はそれを 確認中 と
   * 読み、**縮退帯 が立たないまま編集の控えが理由なしに保留される** — doc-11 §5 が禁じている形そのもので、
   * しかもどの帯もそれを述べない。次の試験のエディタ側とはここが逆で、あちらは `null` のままが正しい。
   */
  it("拒否は 発行不能 という答えになり、理由を運ぶ", async () => {
    const h = harness();
    const { state, controller } = withPort(h, {
      probeCli: () => Promise.reject({ kind: "ledger", detail: "backlog is not on PATH" }),
    });

    await controller.probeCli();

    expect(state.cli).toEqual({ state: "unavailable", detail: "backlog is not on PATH" });
  });

  it("エディタの probe が失敗したら 確認中 のままで、理由は帯が述べる", async () => {
    const h = harness();
    const { state, controller } = withPort(h, {
      probeEditor: () => Promise.reject({ kind: "editorLaunchFailed", detail: "no editor" }),
    });

    await controller.probeEditor();

    expect(state.editor).toBeNull();
    expect(h.notices.at(-1)).not.toBeNull();
  });
});

describe("3 値の保存", () => {
  it("押すたびに 3 つとも送る", async () => {
    const h = harness();
    await h.controller.load();

    await h.controller.storeGridState({
      collapsedColumns: ["toDo"],
      foldedRows: ["atlas"],
      hidden: ["kanri"],
    });

    expect(h.diskNow().collapsed_columns).toEqual(["toDo"]);
    expect(h.diskNow().folded_rows).toEqual(["atlas"]);
    expect(h.diskNow().hidden_rows).toEqual(["kanri"]);
  });

  /**
   * 通った書込みは前の拒否を無効にするので、その帯は降ろす。**同一性で降ろす** のは、ここの押下が
   * 頻繁で、その間に別の理由で立った通知の 再試行 ではないからである。
   */
  it("通ったら自分の拒否だけを降ろす", async () => {
    const h = harness({ saveFails: true });
    await h.controller.load();

    await h.controller.storeGridState({ collapsedColumns: [], foldedRows: ["atlas"], hidden: [] });
    expect(h.notices.at(-1)).toContain("file is newer");

    h.setSaveFails(false);
    await h.controller.storeGridState({ collapsedColumns: ["toDo"], foldedRows: [], hidden: [] });

    expect(h.notices.at(-1)).toBeNull();
  });

  it("別の理由で立った通知は、通った書込みでも降りない", async () => {
    const h = harness();
    await h.controller.load();
    const other = () => "監視を開始できません";
    h.setStanding(other);

    await h.controller.storeGridState({
      collapsedColumns: ["toDo"],
      foldedRows: [],
      hidden: [],
    });

    // 何も降ろしていない — 立っているのは自分の拒否ではないため。
    expect(h.notices).toEqual([]);
  });
});

describe("場所を開く", () => {
  it("受け取られたら null を返す", async () => {
    const h = harness();

    expect(await h.controller.openLocation()).toBeNull();
  });
});

/**
 * A controller over resolved-at-once ports with exactly one of them swapped, and the state it writes.
 *
 * The main [`harness`] holds every probe open so ordering can be tested; these three tests are about a
 * single probe's *answer*, so they take a version where nothing has to be landed by hand.
 */
function withPort(
  h: ReturnType<typeof harness>,
  swap: Partial<ReturnType<typeof portsOf>>,
): { state: SettingsState; controller: SettingsController } {
  const state = initialSettingsState();
  return { state, controller: createSettingsController(state, { ...portsOf(h), ...swap }) };
}

/** The ports the harness built, so a test can swap exactly one of them. */
function portsOf(h: ReturnType<typeof harness>) {
  return {
    read: () => Promise.resolve(file()),
    save: (settings: AppSettings) =>
      Promise.resolve({ settings, status: { state: "stored" } } as LoadedSettings),
    locate: () => Promise.resolve("/config/settings.toml"),
    directoryPresent: () => Promise.resolve(true),
    openLocation: () => Promise.resolve(undefined),
    probeCli: () => Promise.resolve(READY),
    probeEditor: () => Promise.resolve(EDITOR),
    probePrograms: () => Promise.resolve([] as ExternalProgramReport[]),
    notify: (text: (() => string) | null) => h.notices.push(text?.() ?? null),
    standingNotice: () => null,
    commandError: (error: unknown) => error as CommandError,
    peekStorageFilter: () => ["active"] as readonly StorageSelection[],
    adoptStorageFilter: () => undefined,
    adoptGridState: () => undefined,
    reconcileWatches: () => Promise.resolve(),
    busy: () => undefined,
  };
}
