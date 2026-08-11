import { afterEach, describe, expect, it } from "vitest";
import { BODY_FIGURE_CLASS, bodyView } from "./markdown";
import { drawFigures } from "./markdown-figure";

// 作図結果 (doc-11 §14.5) の失敗側。**AGENTS が `component` 企画に置くと定めた 画面横断契約 にあたる** —
// 純関数では持てず（`drawFigures` は DOM を触り、mermaid は実 DOM を要求する）、どの 1 画面のものでもない
// （整形表示 の 5 か所は 2 画面にまたがり、全部がこの経路を通る）。AGENTS が挙げている 4 例は例示であって
// 列挙ではないので、条件のほうを満たす形でここに置いている。
//
// **測っているのは「描けたか」ではなく「描けなかったときに何も残らないか」である。** jsdom は
// `getBBox` を持たないので図はここでは描き切らない。それでよい: この試験が固定するのは
// `suppressErrorRendering` で、あれが決めるのは mermaid が**自分の容器を document へ挿すかどうか**
// であって、その後 SVG を測れるかどうかではない。実際に描ける姿は実エンジンで測ってある
// (`_sandbox/task-142/`)。

/** Everything `document.body` held before a draw, so a stray element is the difference. */
function bodyChildren(): Element[] {
  return [...document.body.children];
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("作図結果 が描けなかったとき (doc-11 §14.5)", () => {
  it("本文の中にフェンスを残し、本文の外に何も足さない", async () => {
    const view = bodyView("```mermaid\ngraph TD;\n  A --> ;;; broken\n```\n");
    if (view.kind !== "formatted") throw new Error("整形表示 になっていない");

    const block = document.createElement("div");
    block.innerHTML = view.html;
    document.body.append(block);
    const before = bodyChildren();

    await drawFigures(block, "light");

    // フェンスは残る: 読み手に残るのは図の出どころそのものである (doc-11 §14.5)。
    expect(block.querySelectorAll(`pre.${BODY_FIGURE_CLASS}`)).toHaveLength(1);
    expect(block.textContent).toContain("graph TD;");
    // 本文の外に何も増えていない。`suppressErrorRendering` を外すと mermaid が誤り図のための容器を
    // `document.body` 直下へ挿し、再描画とテーマ切替のたびに 1 つずつ積もる（実エンジンで 3 件を実測した
    // のがこの経路である）。
    expect(bodyChildren()).toEqual(before);
  });
});
