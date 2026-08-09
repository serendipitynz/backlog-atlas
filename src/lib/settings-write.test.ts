import { describe, expect, it } from "vitest";
import { SETTINGS_NOT_READ, createSettingsWriter } from "./settings-write";
import { mergeDraft } from "./settings";
import type { AppSettings, LoadedSettings } from "./wire";

const DEFAULTS: AppSettings = {
  schema_version: 1,
  theme: null,
  card_density: "m",
  default_storage_filter: ["active"],
  default_detail_placement: "sidebar",
  default_card_order: "priority_desc",
  watch_external_changes: true,
};

/** A writer over a fake file, recording what each save was handed. */
function harness(options: { initial?: AppSettings | null; fail?: boolean } = {}) {
  let current: AppSettings | null =
    options.initial === undefined ? { ...DEFAULTS } : options.initial;
  const written: AppSettings[] = [];
  /** Resolvers of the saves still in flight, so a test can decide when each one lands. */
  const pending: (() => void)[] = [];

  const write = createSettingsWriter({
    peek: () => current,
    save: (settings) => {
      written.push(settings);
      const loaded: LoadedSettings = { settings, status: { state: "stored" } };
      if (options.fail === true) return Promise.reject({ kind: "settings", detail: "disk is full" });
      return new Promise<LoadedSettings>((resolve) => {
        pending.push(() => resolve(loaded));
      });
    },
    adopt: (loaded) => (current = loaded.settings),
    describeError: (error) => (error as { detail: string }).detail,
  });

  /** Let the queued work reach its next await — a write is issued on a microtask, not on the call. */
  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  };

  return {
    write,
    written,
    settle,
    /** Land every save, in the order they were issued, letting the queue advance between them. */
    flush: async (): Promise<void> => {
      await settle();
      while (pending.length > 0) {
        pending.shift()?.();
        await settle();
      }
    },
    now: () => current,
  };
}

describe("アプリ設定の 2 writer を直列化する", () => {
  it("issues each change against the values the previous write left, not against a snapshot", async () => {
    // doc-8 §2.2 gave アプリ設定 a second writer. The form's 保存 and the placement switch overlap here:
    // both are issued before either lands, which is exactly the case that used to lose a field.
    const app = harness();
    const formSave = app.write((current) =>
      mergeDraft(DEFAULTS, { ...DEFAULTS, card_density: "l" }, current),
    );
    const placement = app.write((current) => ({
      ...current,
      default_detail_placement: "full",
    }));

    // Only the first write may be in flight; the second has not read anything yet.
    await app.settle();
    expect(app.written).toHaveLength(1);
    await app.flush();
    expect(await formSave).toBeNull();
    expect(await placement).toBeNull();

    expect(app.written).toHaveLength(2);
    // The placement write kept the density the form had just saved — the field it never touched.
    expect(app.written[1]).toMatchObject({
      card_density: "l",
      default_detail_placement: "full",
    });
    expect(app.now()).toMatchObject({ card_density: "l", default_detail_placement: "full" });
  });

  it("keeps the form's own fields when the placement landed first", async () => {
    const app = harness();
    const placement = app.write((current) => ({
      ...current,
      default_detail_placement: "modal",
    }));
    app.flush();
    await placement;

    // The form was seeded before that write, so its baseline still says 併置サイドバー — and it must not
    // impose that, because the user never touched the placement field.
    const formSave = app.write((current) =>
      mergeDraft(DEFAULTS, { ...DEFAULTS, theme: "dusk" }, current),
    );
    await app.flush();
    expect(await formSave).toBeNull();

    expect(app.now()).toMatchObject({ theme: "dusk", default_detail_placement: "modal" });
  });

  it("issues nothing when the change would not change anything", async () => {
    const app = harness();
    expect(await app.write((current) => ({ ...current }))).toBeNull();
    expect(app.written).toHaveLength(0);
  });

  it("says so, and writes nothing, before the first read has answered", async () => {
    const app = harness({ initial: null });
    expect(await app.write((current) => current)).toBe(SETTINGS_NOT_READ);
    expect(app.written).toHaveLength(0);
  });

  it("returns the failure's reason and keeps taking later writes", async () => {
    const failing = harness({ fail: true });
    expect(await failing.write((current) => ({ ...current, theme: "dusk" }))).toBe("disk is full");
    // The queue must not be left chained behind the rejection: a second write still gets issued.
    expect(await failing.write((current) => ({ ...current, theme: "dawn" }))).toBe("disk is full");
    expect(failing.written).toHaveLength(2);
  });
});
