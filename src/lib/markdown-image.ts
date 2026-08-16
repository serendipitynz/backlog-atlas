/**
 * 添付画像 (doc-8 §9.2, doc-11 §14.7): drawing the 本文画像 that `markdown.ts` left as a 状態の印.
 *
 * Separate from `markdown.ts` for the same three reasons `markdown-figure.ts` is: it touches the DOM,
 * it is asynchronous, and it reaches the boundary. The shape is deliberately the same as that
 * module's — the placeholder in the output *is* the failure state, so nothing here has a failure path
 * of its own and nothing it does can empty a 本文.
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §9.2 本文画像 | `span.${BODY_IMAGE_CLASS}[${BODY_IMAGE_REFERENCE_ATTRIBUTE}]` | the placeholder `markdown.ts` wrote, still the 状態の印 |
 * | doc-8 §9.2 添付画像 | the bytes [`bodyImageRead`] returns | one file under `<backlog root>/assets/` |
 * | 対応表 の 媒体型表 | [`MEDIA_TYPES`] | extension → the type the `Blob` declares |
 * | doc-11 §14.7 の描かれた姿 | [`IMAGE_DRAWN_CLASS`] | the `<img>`, in place of that placeholder |
 *
 * ## Why the media type is decided here and not at the boundary
 *
 * A `Blob` has to declare `image/svg+xml` for an SVG to render at all — the engine sniffs the other
 * formats but not that one — so *someone* needs this table. Putting it here rather than in Rust is
 * what lets the response body stay raw bytes: the boundary can return `Raw` **or** JSON, not both, and
 * a `Vec<u8>` through JSON is an array of numbers (about 370KB of text for one 80KB screenshot). The
 * table is in one place either way; this is the place where the raw path stays open.
 *
 * The extensions are Backlog CLI v1.49.3's own image subset (`handleAssetRequest`, read 2026-08-17).
 * The CLI serves `pdf`, `txt`, `css` and `js` from the same directory — those are not images, and a
 * 本文画像 naming one draws nothing in the CLI's browser mode either.
 */

import { BODY_IMAGE_CLASS, BODY_IMAGE_REFERENCE_ATTRIBUTE } from "./markdown";

/**
 * How the bytes of one 添付画像 are fetched.
 *
 * **A function rather than an import of `commands.ts`.** `Body.svelte` is the component that draws
 * every 本文 and it reaches no boundary — the shell owns that, which is also what keeps the slug out
 * of a component that is handed a string and nothing else. The reader is threaded down beside
 * `onopenlink`, and it is what a test replaces.
 */
export type ImageReader = (reference: string) => Promise<ArrayBuffer>;

/** Class on a drawn 添付画像 (doc-11 §14.7). */
export const IMAGE_DRAWN_CLASS = "body-image-drawn";

/** Where a drawn 添付画像 keeps the reference it came from, so a re-read can find it again. */
const REFERENCE_ATTRIBUTE = "data-image-reference";

/** 媒体型表: the extensions Atlas draws, and what the `Blob` declares for each. */
const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * The media type for one reference, or `null` when Atlas does not draw that extension.
 *
 * Matched the way the CLI matches it: the last `.` of the last segment, lowercased. A reference with
 * no extension at all yields `null` rather than a guess.
 */
export function mediaTypeFor(reference: string): string | null {
  const name = reference.slice(reference.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return null;
  }
  return MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** Which draw is current for one root, so a later 本文 cannot be overwritten by an earlier read. */
const generations = new WeakMap<ParentNode, number>();

/** The object URLs one root is currently holding open, revoked when it draws again. */
const held = new WeakMap<ParentNode, string[]>();

function placeholders(root: ParentNode): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      `span.${BODY_IMAGE_CLASS}[${BODY_IMAGE_REFERENCE_ATTRIBUTE}]`,
    ),
  ];
}

/**
 * Revoke every object URL this root still holds.
 *
 * Called before each pass and on unmount. Without it the blobs stay alive for the life of the window:
 * a panel that redraws on every keystroke would otherwise accumulate one copy of every screenshot it
 * has ever shown.
 */
export function releaseImages(root: ParentNode): void {
  for (const url of held.get(root) ?? []) {
    URL.revokeObjectURL(url);
  }
  held.delete(root);
}

/**
 * Put an `<img>` where `placeholder` is, and put `placeholder` back if it will not draw.
 *
 * **Swapped first and restored on `error`, rather than awaited and swapped on `load`.** Waiting would
 * make this module depend on the engine loading a resource, which is the one thing `jsdom` does not do
 * — a test would hang rather than fail. Restoring instead needs no such promise and reaches the same
 * two states.
 *
 * The `error` path matters more than it looks: it is what a reader sees if `img-src blob:` is ever
 * dropped from the CSP (decision-28 §2 機能の source) — the only line of that policy whose loss the
 * screen states rather than swallows — and it also covers a file whose bytes are not the picture its
 * extension claims.
 */
function draw(placeholder: HTMLElement, url: string, reference: string): void {
  const image = placeholder.ownerDocument.createElement("img");
  // The alt is the 本文's own, which is empty for both image references in this 台帳 — an empty alt is
  // the right answer for a picture with no caption, and the 状態の印 the placeholder carries is what
  // says "there is one" for as long as it cannot be drawn.
  image.alt = placeholder.textContent ?? "";
  image.className = IMAGE_DRAWN_CLASS;
  image.setAttribute(REFERENCE_ATTRIBUTE, reference);
  image.addEventListener("error", () => {
    image.replaceWith(placeholder);
  });
  image.src = url;
  placeholder.replaceWith(image);
}

/**
 * Draw every 添付画像 named under `root`.
 *
 * Safe to call on every update: it returns before reaching the boundary when there is no 本文画像 to
 * draw, which is every 本文 in a 台帳 that names no picture (2 of 184 files here name one).
 */
export async function drawImages(root: ParentNode, read: ImageReader): Promise<void> {
  const pending = placeholders(root);
  if (pending.length === 0) {
    return;
  }

  const generation = (generations.get(root) ?? 0) + 1;
  generations.set(root, generation);
  releaseImages(root);

  for (const placeholder of pending) {
    if (generations.get(root) !== generation) {
      return;
    }
    // **Classified once, in `markdown.ts`.** This attribute exists only on a 添付画像 and already holds
    // the decoded reference, so re-running `bodyImagePlan` here would decode a second time — and a
    // file legitimately named `50%.png` arrives here as exactly that, which `decodeURIComponent`
    // rejects. The image would then never be asked for, though the boundary would have read it.
    const reference = placeholder.getAttribute(BODY_IMAGE_REFERENCE_ATTRIBUTE) ?? "";
    const mediaType = mediaTypeFor(reference);
    if (mediaType === null) {
      // An extension the 媒体型表 does not carry. The 状態の印 stays, which is the whole answer —
      // asking the boundary for bytes no `<img>` could render would only spend a round trip to
      // arrive at the same picture-shaped gap.
      continue;
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await read(reference);
    } catch {
      // 経路の拒否・不在・読取不能 all land here, and all three leave the same thing on screen: the
      // 状態の印 `markdown.ts` wrote, whose accessible name says a picture is there and not shown.
      // The 失敗理由符号 is deliberately not read — nothing about *which* refusal changes what the
      // reader can do about it, and doc-8 §9.5 keeps this off ⑤ 通知 for that reason.
      continue;
    }
    if (generations.get(root) !== generation || !placeholder.isConnected) {
      continue;
    }

    const url = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
    held.set(root, [...(held.get(root) ?? []), url]);
    draw(placeholder, url, reference);
  }
}
