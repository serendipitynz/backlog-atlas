/**
 * 画面横断契約 1 件 (TASK-91): モーダルの閉じると未保存確認.
 *
 * What is fixed here is the contract as it stands. `Modal.svelte` routes every way out through one
 * `onclose`, keeps focus inside while it is up, and gives focus back on the way out (doc-7 §2.1) —
 * and it is the *shell* that decides what `onclose` does, which is why the 破棄前確認 for the routes
 * that already have one is fixed in `App.component.test.ts` rather than here.
 *
 * 設定 and プロジェクト登録 have no 破棄前確認 of their own yet: their close discards whatever was typed.
 * That is TASK-86's subject, not a contract, so nothing here asserts it in either direction — the
 * single exit these tests pin is what TASK-86 routes the confirmation through.
 */

import { afterEach, describe, expect, it } from "vitest";
import Modal from "./Modal.svelte";
import { byText, cleanup, click, press, render, snippet } from "../lib/render";

afterEach(cleanup);

/** The opener the modal has to give focus back to — a control that existed before it opened. */
function opener(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "設定を開く";
  document.body.append(button);
  button.focus();
  return button;
}

function dialogOf(host: HTMLElement): HTMLElement {
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error("the modal drew no dialog");
  return dialog;
}

describe("モーダルの閉じる出口", () => {
  it("Escape と子の閉じるが同じ 1 つの出口へ集まる", () => {
    const closed: string[] = [];
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => closed.push("onclose"),
      children: snippet('<button type="button" data-close>閉じる</button>'),
    });

    press(dialogOf(host), "Escape");
    expect(closed).toEqual(["onclose"]);

    // The child's own control is wired by whoever opened the modal, so what this fixes is that the
    // layer adds no second exit of its own: Escape is answered here, and everything else is the
    // caller's — one place for a 破棄前確認 to be put in front of (TASK-86).
    expect(host.querySelectorAll("[data-close]")).toHaveLength(1);
  });

  it("閉じる要求はモーダル自身を外さない", () => {
    let closed = 0;
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => (closed += 1),
      children: snippet("<p>本文</p>"),
    });

    press(dialogOf(host), "Escape");

    // `onclose` is a request, not the act: the layer is still mounted, and the shell is what drops
    // it. This is the seam TASK-86 needs — a modal that removed itself here could not be held back
    // for a 破棄前確認.
    expect(closed).toBe(1);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("Escape は IME の変換中には発火しない", () => {
    let closed = 0;
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => (closed += 1),
      children: snippet('<input type="text" />'),
    });
    const field = host.querySelector<HTMLInputElement>("input");
    if (field === null) throw new Error("no field");

    // doc-7 §2.1: the composition owns the keyboard, and Escape then cancels the conversion instead
    // of the modal. macOS WebKit sends the press as `keyCode === 229`, which is the second spelling.
    press(field, "Escape", { isComposing: true });
    press(field, "Process", { keyCode: 229 });
    expect(closed).toBe(0);

    press(field, "Escape");
    expect(closed).toBe(1);
  });

  it("背景を押しても閉じない", () => {
    let closed = 0;
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => (closed += 1),
      children: snippet("<p>本文</p>"),
    });
    const backdrop = host.querySelector<HTMLElement>(".backdrop");
    if (backdrop === null) throw new Error("no backdrop");

    // Deliberately absent: a stray press on the backdrop would throw away a half-filled
    // registration, and doc-7 §2.1 already gives a way out that cannot be pressed by accident.
    click(backdrop);
    expect(closed).toBe(0);
  });

  it("開くとフォーカスが内側の最初の操作へ入る", () => {
    const came = opener();
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet('<button type="button">保存</button><button type="button">やめる</button>'),
    });

    expect(document.activeElement).toBe(byText(host, "button", "保存"));
    expect(document.activeElement).not.toBe(came);
  });

  it("Tab は内側を巡って外へ出ない", () => {
    const came = opener();
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet('<button type="button">保存</button><button type="button">やめる</button>'),
    });
    const save = byText<HTMLButtonElement>(host, "button", "保存");
    const quit = byText<HTMLButtonElement>(host, "button", "やめる");
    const dialog = dialogOf(host);

    press(dialog, "Tab");
    expect(document.activeElement).toBe(quit);
    // Wraps rather than reaching the opener behind the layer — that is what フォーカスを内側に留める
    // means, and a trap that let Tab out would not be one.
    press(dialog, "Tab");
    expect(document.activeElement).toBe(save);
    press(dialog, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(quit);
    expect(document.activeElement).not.toBe(came);
  });

  it("描画されていない操作は巡回に入らない", () => {
    render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet(
        '<button type="button">保存</button>' +
          "<details><summary>全文</summary><button type=\"button\">隠れている</button></details>",
      ),
    });

    // doc-11 §5 keeps some withheld controls focusable so their reason can be read without a
    // pointer; a control inside a *closed* `details` is a different case — it cannot take focus at
    // all, and Tab landing on it would look like the trap dropped the press.
    const reached: (string | null)[] = [];
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog === null) throw new Error("no dialog");
    for (let step = 0; step < 3; step += 1) {
      press(dialog, "Tab");
      reached.push((document.activeElement as HTMLElement).textContent);
    }
    expect(reached).not.toContain("隠れている");
    expect(new Set(reached)).toEqual(new Set(["全文", "保存"]));
  });

  it("閉じたら開く前の操作へフォーカスが戻る", () => {
    const came = opener();
    const mounted = render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet('<button type="button">保存</button>'),
    });
    expect(document.activeElement).not.toBe(came);

    // Restoring belongs to unmounting rather than to `onclose`: every way the modal can go — its own
    // 閉じる, Escape, and the shell dropping it for a reason of its own — ends there, and only there.
    mounted.destroy();
    expect(document.activeElement).toBe(came);
  });
});
