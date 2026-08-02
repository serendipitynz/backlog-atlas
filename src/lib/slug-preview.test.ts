import { describe, expect, it } from "vitest";
import { createSlugPreviewLoader, type SlugPreview } from "./slug-preview";

/** A derivation whose completion the test decides, so completion order can be inverted at will. */
function deferred(): {
  promise: Promise<string | null>;
  resolve: (value: string | null) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: string | null) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function loader(derivations: Promise<string | null>[]) {
  let shown: SlugPreview = { state: "unknown" };
  let index = 0;
  /** Every root the loader actually asked about, in order. */
  const asked: string[] = [];
  const built = createSlugPreviewLoader({
    derive: (projectRoot) => {
      asked.push(projectRoot);
      return derivations[index++];
    },
    show: (preview) => (shown = preview),
  });
  return { load: built.load, clear: built.clear, current: () => shown, asked };
}

/** Let every already-settled promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function slugOf(preview: SlugPreview): string | null {
  return preview.state === "derived" ? preview.slug : null;
}

describe("既定 slug のプレビューは現在のプロジェクトルートについてのものだけを出す", () => {
  it("keeps the newest root's slug when the older derivation answers last", async () => {
    // 指摘 6 そのもの: ルート A の照会後、完了前に B へ変更し、B の応答後に A の応答が届く。
    const a = deferred();
    const b = deferred();
    const { load, current } = loader([a.promise, b.promise]);

    void load("/repos/alpha");
    void load("/repos/bravo");
    b.resolve("bravo");
    a.resolve("alpha");
    await settle();

    expect(slugOf(current())).toBe("bravo");
  });

  it("keeps the newest root's slug when the derivations answer in the order they started", async () => {
    // The positive counterpart. Without it, a loader that simply ignored every answer but the first
    // would pass the test above.
    const a = deferred();
    const b = deferred();
    const { load, current } = loader([a.promise, b.promise]);

    void load("/repos/alpha");
    void load("/repos/bravo");
    a.resolve("alpha");
    b.resolve("bravo");
    await settle();

    expect(slugOf(current())).toBe("bravo");
  });

  it("does not show the previous root's slug while the new root's derivation is in flight", async () => {
    // The same falsehood as a stale answer, only shorter-lived: the sentence under the field names
    // the slug 登録 will use, and during this window 登録 would use the root now in the field.
    const a = deferred();
    const b = deferred();
    const { load, current } = loader([a.promise, b.promise]);

    void load("/repos/alpha");
    a.resolve("alpha");
    await settle();
    expect(slugOf(current())).toBe("alpha");

    void load("/repos/bravo");
    expect(current().state).toBe("unknown");
  });

  // A → B → A. Both A calls agree on the root, so this is the case a comparison against the current
  // root cannot decide — it would accept the first A's answer as the second's.
  it("keeps the newest derivation of a re-entered root, whichever answer arrives last", async () => {
    const firstA = deferred();
    const b = deferred();
    const secondA = deferred();
    const { load, current } = loader([firstA.promise, b.promise, secondA.promise]);

    void load("/repos/alpha");
    void load("/repos/bravo");
    void load("/repos/alpha");
    secondA.resolve("alpha-renamed");
    await settle();
    expect(slugOf(current())).toBe("alpha-renamed");

    firstA.resolve("alpha");
    b.resolve("bravo");
    await settle();

    expect(slugOf(current())).toBe("alpha-renamed");
  });

  it("does not let a superseded 導出できない answer demand a slug for the current root", async () => {
    // The stale answer of this shape is worse than a wrong slug: 導出できない is shown as a problem
    // telling the user they must name one, about a root that derives a slug perfectly well.
    const a = deferred();
    const b = deferred();
    const { load, current } = loader([a.promise, b.promise]);

    void load("/repos/漢字だけ");
    void load("/repos/bravo");
    b.resolve("bravo");
    a.resolve(null);
    await settle();

    expect(current()).toEqual({ state: "derived", slug: "bravo" });
  });

  it("does not let a superseded failure clear the current root's slug", async () => {
    const a = deferred();
    const b = deferred();
    const { load, current } = loader([a.promise, b.promise]);

    void load("/repos/alpha");
    void load("/repos/bravo");
    b.resolve("bravo");
    a.reject(new Error("the root went away"));
    await settle();

    expect(slugOf(current())).toBe("bravo");
  });

  it("supersedes the derivation in flight when the field is emptied", async () => {
    // Clearing the field asks about nothing, so it makes no call — which is exactly how an answer
    // still in flight used to survive it.
    const a = deferred();
    const { load, current, asked } = loader([a.promise]);

    void load("/repos/alpha");
    void load("   ");
    a.resolve("alpha");
    await settle();

    expect(current().state).toBe("unknown");
    expect(asked).toEqual(["/repos/alpha"]);
  });

  it("supersedes the derivation in flight when a completed registration clears the form", async () => {
    const a = deferred();
    const { load, clear, current } = loader([a.promise]);

    void load("/repos/alpha");
    clear();
    a.resolve("alpha");
    await settle();

    expect(current().state).toBe("unknown");
  });

  it("reports the current root's own 導出できない", async () => {
    // The state the screen turns into「slug を指定してください」. Nothing above would notice if a
    // null answer were dropped entirely.
    const a = deferred();
    const { load, current } = loader([a.promise]);

    void load("/repos/漢字だけ");
    a.resolve(null);
    await settle();

    expect(current()).toEqual({ state: "underivable" });
  });

  it("leaves a failed derivation at 未取得 rather than 導出できない", async () => {
    // 導出できない is a claim about the directory name. A call that failed makes no such claim, and
    // showing it would demand a slug the user does not actually have to supply.
    const a = deferred();
    const { load, current } = loader([a.promise]);

    void load("/repos/alpha");
    a.reject(new Error("ledger_default_slug failed"));
    await settle();

    expect(current().state).toBe("unknown");
  });
});
