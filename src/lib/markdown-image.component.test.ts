import { describe, expect, it, vi } from "vitest";
import { bodyView } from "./markdown";
import {
  IMAGE_DRAWN_CLASS,
  drawImages,
  mediaTypeFor,
  releaseImages,
  type ImageReader,
} from "./markdown-image";

// 添付画像 (doc-8 §9.2, doc-11 §14.7). A `jsdom` file rather than a `node` one because the whole of
// this module is a DOM edit — and because the thing it must not do is depend on the engine *loading*
// a resource, which `jsdom` does not do. That is the point of the shape under test: the `<img>` goes
// in immediately and the 状態の印 comes back on `error`, so nothing here waits on a load that will
// never happen (a version of this module that awaited one would hang this file rather than fail it).

/** A 本文 drawn into a detached root, the way `Body.svelte` draws one. */
function root(source: string): HTMLElement {
  const view = bodyView(source);
  if (view.kind !== "formatted") {
    throw new Error("整形表示 になっていない");
  }
  const block = document.createElement("div");
  block.innerHTML = view.html;
  document.body.append(block);
  return block;
}

/** `URL.createObjectURL`/`revokeObjectURL` do not exist in `jsdom`; these record what was asked for. */
function stubObjectUrls(): { created: Blob[]; revoked: string[] } {
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      created.push(blob);
      return `blob:test/${created.length}`;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  });
  return { created, revoked };
}

const bytes = (): ArrayBuffer => new Uint8Array([1, 2, 3]).buffer;
const reads = (): ImageReader => vi.fn(async () => bytes());

describe("媒体型表", () => {
  it("carries Backlog CLI's image extensions and nothing that is not an image", () => {
    for (const [reference, type] of [
      ["/assets/a.png", "image/png"],
      ["/assets/a.jpg", "image/jpeg"],
      ["/assets/a.jpeg", "image/jpeg"],
      ["/assets/a.gif", "image/gif"],
      ["/assets/a.svg", "image/svg+xml"],
      ["/assets/a.webp", "image/webp"],
      ["/assets/a.avif", "image/avif"],
      // Case is the CLI's too: it lowercases the extension before looking it up.
      ["/assets/A.PNG", "image/png"],
      ["/assets/shots/a.png", "image/png"],
    ]) {
      expect(mediaTypeFor(reference)).toBe(type);
    }
    // The CLI serves these from the same directory and they are still not images — an `<img>` draws
    // none of them there either.
    for (const notAnImage of [
      "/assets/a.pdf",
      "/assets/a.txt",
      "/assets/a.css",
      "/assets/a.js",
      "/assets/noextension",
      "/assets/",
    ]) {
      expect(mediaTypeFor(notAnImage)).toBeNull();
    }
  });

  it("reads a name that is already decoded, including one holding a bare %", () => {
    // The attribute `drawImages` reads holds the **decoded** reference, so a file named `50%.png`
    // arrives here as `/assets/50%.png`. Anything that decoded it a second time would throw on
    // `%.p` and drop the image for good, though the boundary would have read it.
    expect(mediaTypeFor("/assets/50%.png")).toBe("image/png");
    expect(mediaTypeFor("/assets/図.png")).toBe("image/png");
  });
});

describe("添付画像 の描画 (doc-8 §9.2)", () => {
  it("replaces the 状態の印 with an image carrying the 本文's own alt", async () => {
    const { created } = stubObjectUrls();
    const block = root("![図の説明](/assets/TASK-82.png)");
    const read = reads();

    await drawImages(block, read);

    expect(read).toHaveBeenCalledWith("/assets/TASK-82.png");
    const image = block.querySelector<HTMLImageElement>(`img.${IMAGE_DRAWN_CLASS}`);
    expect(image).not.toBeNull();
    expect(image?.alt).toBe("図の説明");
    expect(image?.getAttribute("src")).toBe("blob:test/1");
    expect(created[0].type).toBe("image/png");
    // The placeholder is gone, which is the whole difference a reader sees.
    expect(block.querySelector("[data-body-image]")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("leaves the 状態の印 in place when the boundary refuses — AC #4", async () => {
    stubObjectUrls();
    const block = root("![](/assets/gone.png)");
    const read: ImageReader = vi.fn(async () => {
      throw { kind: "bodyImageRefused", reason: { reason: "absent" }, detail: "" };
    });

    await drawImages(block, read);

    // 経路の拒否・不在・読取不能 all land the same way, and the 印 is what says a picture was named
    // here — the alt is empty, as it is for both images in this 台帳.
    expect(block.querySelector(`img.${IMAGE_DRAWN_CLASS}`)).toBeNull();
    expect(block.querySelector("[data-body-image]")).not.toBeNull();
    expect(block.querySelector("[data-body-image] svg")).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("puts the 状態の印 back when the image will not draw", async () => {
    stubObjectUrls();
    const block = root("![](/assets/corrupt.png)");
    await drawImages(block, reads());

    const image = block.querySelector<HTMLImageElement>(`img.${IMAGE_DRAWN_CLASS}`);
    expect(image).not.toBeNull();
    // The path a reader takes if `img-src blob:` is ever dropped from the CSP (decision-28 §2 機能の
    // source), and the one a file whose bytes are not its extension takes. Either way the 本文 keeps
    // saying a picture is there.
    image?.dispatchEvent(new Event("error"));
    expect(block.querySelector(`img.${IMAGE_DRAWN_CLASS}`)).toBeNull();
    expect(block.querySelector("[data-body-image]")).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("asks the boundary for a name holding a bare %, rather than dropping it", async () => {
    stubObjectUrls();
    const block = root("![](</assets/50%25.png>)");
    const read = reads();

    await drawImages(block, read);

    // The reference reaches the boundary decoded and byte-identical to the file's own name.
    expect(read).toHaveBeenCalledWith("/assets/50%.png");
    expect(block.querySelector(`img.${IMAGE_DRAWN_CLASS}`)).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("never asks the boundary for an extension it could not draw", async () => {
    stubObjectUrls();
    const block = root("![](/assets/notes.pdf)");
    const read = reads();

    await drawImages(block, read);

    expect(read).not.toHaveBeenCalled();
    expect(block.querySelector("[data-body-image]")).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("reaches the boundary for neither a 遠隔 image nor a src it will not resolve", async () => {
    stubObjectUrls();
    const block = root("![](https://e.test/a.png) ![](./b.png)");
    const read = reads();

    await drawImages(block, read);

    expect(read).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("revokes the URLs it opened, so a redrawn panel does not accumulate them", async () => {
    const { revoked } = stubObjectUrls();
    const block = root("![](/assets/a.png)");

    await drawImages(block, reads());
    expect(revoked).toEqual([]);

    releaseImages(block);
    expect(revoked).toEqual(["blob:test/1"]);
    // Releasing twice is not two revocations: the second call has nothing left to hold.
    releaseImages(block);
    expect(revoked).toEqual(["blob:test/1"]);
    vi.unstubAllGlobals();
  });
});
