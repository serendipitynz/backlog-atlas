import { describe, expect, it } from "vitest";
import { createGitRemoteReader } from "./git-remote-read";
import type { GitRemoteRead } from "./wire";

/** A read whose completion the test decides, so completion order can be inverted at will. */
function deferred(): {
  promise: Promise<GitRemoteRead>;
  resolve: (value: GitRemoteRead) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: GitRemoteRead) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<GitRemoteRead>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function reader(reads: Promise<GitRemoteRead>[]) {
  let shown: GitRemoteRead | null = null;
  let index = 0;
  /** Every slug the reader actually asked about, in order. */
  const asked: string[] = [];
  const built = createGitRemoteReader({
    read: (slug) => {
      asked.push(slug);
      return reads[index++];
    },
    show: (read) => (shown = read),
  });
  return { load: built.load, current: (): GitRemoteRead | null => shown, asked };
}

/** Let every already-settled promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const CONFIGURED: GitRemoteRead = {
  state: "configured",
  name: "origin",
  url: "git@github.com:serendipitynz/backlog-atlas.git",
};

describe("remote 現在値は最後に頼んだ読み取りの答えだけを出す", () => {
  it("keeps the newer answer when two reads of the SAME entry finish in reverse order", async () => {
    // The case a slug/root comparison cannot catch, and the one 再検出する actually produces: the
    // screen's read and the post-再検出 read are both about the entry on screen, so both would pass
    // an identity check and the older one landing last would undo the re-detection on screen.
    const first = deferred();
    const second = deferred();
    const built = reader([first.promise, second.promise]);

    void built.load("atlas");
    void built.load("atlas");
    second.resolve(CONFIGURED);
    await settle();
    expect(built.current()).toEqual(CONFIGURED);

    first.resolve({ state: "remoteAbsent" });
    await settle();
    expect(built.current()).toEqual(CONFIGURED);
    expect(built.asked).toEqual(["atlas", "atlas"]);
  });

  it("keeps the newest entry's answer when an older entry's read answers last", async () => {
    const a = deferred();
    const b = deferred();
    const built = reader([a.promise, b.promise]);

    void built.load("atlas");
    void built.load("geomyth");
    b.resolve({ state: "noRepository" });
    await settle();
    a.resolve(CONFIGURED);
    await settle();

    expect(built.current()).toEqual({ state: "noRepository" });
  });

  it("goes back to 未取得 for the length of every read", async () => {
    // 未取得 is not 不在 (decision-6). Leaving the previous entry's address up while the next one is
    // being read would attribute one project's remote to another.
    const first = deferred();
    const second = deferred();
    const built = reader([first.promise, second.promise]);

    void built.load("atlas");
    first.resolve(CONFIGURED);
    await settle();
    expect(built.current()).toEqual(CONFIGURED);

    void built.load("geomyth");
    expect(built.current()).toBeNull();
    second.resolve({ state: "remoteAbsent" });
    await settle();
    expect(built.current()).toEqual({ state: "remoteAbsent" });
  });

  it("stays at 未取得 when a read rejects, rather than inventing a remote state", async () => {
    const only = deferred();
    const built = reader([only.promise]);

    void built.load("atlas");
    only.reject(new Error("IPC channel dropped"));
    await settle();

    expect(built.current()).toBeNull();
  });
});
