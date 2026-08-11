import { afterEach, describe, expect, it } from "vitest";
import { BODY_FIGURE_CLASS, bodyView } from "./markdown";
import { drawFigures } from "./markdown-figure";

// The failing side of 作図結果 (doc-11 §14.5).
//
// **This meets the component project's stated condition rather than standing as an exception to it**:
// no pure function can hold it (`drawFigures` touches the DOM and mermaid wants a real one) and no
// screen owns it — the five 本文 span two screens and every one of them takes this path. The four
// examples AGENTS lists are examples, not the whole set.
//
// **What is held here is not that a diagram draws — it is that a diagram which cannot draw leaves
// nothing behind.** jsdom has no `getBBox`, so no diagram is finished here, and that is beside the
// point: `suppressErrorRendering` decides whether mermaid inserts **a container of its own into the
// document**, which happens well before anything is measured. Removing the option fails this test.
// What a drawn diagram looks like is measured in a real engine instead (`_sandbox/task-142/`).

/** Everything `document.body` held before a draw, so a stray element is the difference. */
function bodyChildren(): Element[] {
  return [...document.body.children];
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("作図結果 が描けなかったとき (doc-11 §14.5)", () => {
  it("keeps the fence inside the 本文 and adds nothing outside it", async () => {
    const view = bodyView("```mermaid\ngraph TD;\n  A --> ;;; broken\n```\n");
    if (view.kind !== "formatted") {
      throw new Error("整形表示 になっていない");
    }

    const block = document.createElement("div");
    block.innerHTML = view.html;
    document.body.append(block);
    const before = bodyChildren();

    await drawFigures(block, "light");

    // The fence stays: what a reader is left with is the diagram's own source (doc-11 §14.5).
    expect(block.querySelectorAll(`pre.${BODY_FIGURE_CLASS}`)).toHaveLength(1);
    expect(block.textContent).toContain("graph TD;");
    // And nothing has been added outside the 本文. Without `suppressErrorRendering`, mermaid inserts a
    // container for its error diagram directly under `document.body`, and one accumulates on every
    // re-draw and every theme change — three of them were measured in a real engine by that path.
    expect(bodyChildren()).toEqual(before);
  });
});
