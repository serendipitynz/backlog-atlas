/**
 * 画面横断契約 1 件 (TASK-91): モーダルの閉じると未保存確認.
 *
 * What is fixed here is the contract as it stands. `Modal.svelte` routes every way out — its own × in
 * the corner (doc-11 §7, TASK-76) and the Escape it answers — through one `onclose`, keeps focus
 * inside while it is up, and gives focus back on the way out (doc-7 §2.1) —
 * and it is the *shell* that decides what `onclose` does, which is why the 破棄前確認 for the routes
 * that already have one is fixed in `App.component.test.ts` rather than here.
 *
 * 設定 and プロジェクト登録 have no 破棄前確認 of their own yet: their close discards whatever was typed.
 * That is TASK-86's subject, not a contract, so nothing here asserts it in either direction — the
 * single exit these tests pin is what TASK-86 routes the confirmation through.
 */

import { afterEach, describe, expect, it } from "vitest";
import Modal from "./Modal.svelte";
import { byLabel, byText, cleanup, click, press, render, snippet } from "../lib/render";

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

/**
 * この層の × (doc-11 §7, TASK-76). Asked for by its announced name, never by its text: it is an
 * アイコンのみのボタン (doc-11 §2.4), so it has no text to match on — which is the point of finding it
 * this way rather than adding a hook to the markup for the tests' benefit.
 */
function closeOf(host: HTMLElement): HTMLButtonElement {
  return byLabel<HTMLButtonElement>(host, '[role="dialog"] button', "閉じる");
}

describe("モーダルの閉じる出口", () => {
  it("この層が持つ出口は × と Escape の 2 つで、他に出口を足さない", () => {
    // The layer's own half of the contract. That its × and Escape reach one request, and that the
    // *caller's* own controls reach the same one, is asserted in `App.component.test.ts` through 設定
    // and プロジェクト登録 — only the caller wires those, so a snippet here could not tell whether it
    // had stopped doing so.
    //
    // What is fixed here is that this layer adds no *third* exit: a press inside it that is neither
    // the × nor Escape must not close it, or a 破棄前確認 put in front of `onclose` (TASK-86) would
    // have a way around it that nobody wired. Until TASK-76 the layer had no exit of its own at all
    // and each caller drew a 閉じる of its own; the × replaced those three with this one.
    const closed: string[] = [];
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => closed.push("onclose"),
      children: snippet('<button type="button">保存</button><input type="text" />'),
    });
    const dialog = dialogOf(host);

    click(byText(host, "button", "保存"));
    press(dialog, "Enter");
    press(dialog, " ");
    press(host.querySelector("input")!, "Escape", { metaKey: true });
    expect(closed).toEqual([]);

    press(dialog, "Escape");
    click(closeOf(host));
    expect(closed).toEqual(["onclose", "onclose"]);
  });

  it("閉じられない理由を渡されている間、× は要求を出さず理由へ結ぶ", () => {
    // doc-11 §5 の 2 つ目の形. The shell holds the fact (`App.svelte`'s `settingsSaving` turns away
    // Escape with the same one), and the × is the exit that has a control to hang the reason on. A
    // control that goes quiet without saying why is the 理由の無い無効化 §5 refuses — and that is the
    // [P2] TASK-74 took, one exit earlier.
    let closed = 0;
    const { host } = render(Modal, {
      label: "設定",
      closeBlocked: "保存中です",
      onclose: () => (closed += 1),
      children: snippet("<p>本文</p>"),
    });
    const close = closeOf(host);

    click(close);
    expect(closed).toBe(0);

    // Focusable, and pointing at a reason that is in the document — the two halves §5 asks for
    // together. `aria-disabled` rather than `disabled` is what keeps the first of them true.
    expect(close.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(close.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toContain("保存中です");
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

  it("開くとフォーカスがこの層の × へ入る", () => {
    // The × is first in the dialog, so it is where the trap puts the keyboard. That is deliberate
    // twice over: the way out is one press from the moment the layer opens, and `focus()` scrolls its
    // target into the backdrop's scroll area — a first control further down would open a tall modal
    // already scrolled past its own heading (`ShortcutHelp`'s nine-row table is the case that showed
    // it).
    const came = opener();
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet('<button type="button">保存</button><button type="button">やめる</button>'),
    });

    expect(document.activeElement).toBe(closeOf(host));
    expect(document.activeElement).not.toBe(came);
  });

  it("Tab は内側を巡って外へ出ない", () => {
    const came = opener();
    const { host } = render(Modal, {
      label: "設定",
      onclose: () => {},
      children: snippet('<button type="button">保存</button><button type="button">やめる</button>'),
    });
    const close = closeOf(host);
    const save = byText<HTMLButtonElement>(host, "button", "保存");
    const quit = byText<HTMLButtonElement>(host, "button", "やめる");
    const dialog = dialogOf(host);

    press(dialog, "Tab");
    expect(document.activeElement).toBe(save);
    press(dialog, "Tab");
    expect(document.activeElement).toBe(quit);
    // Wraps rather than reaching the opener behind the layer — that is what フォーカスを内側に留める
    // means, and a trap that let Tab out would not be one. The layer's own × is inside the cycle, so
    // wrapping comes back to it and not to the caller's first control.
    press(dialog, "Tab");
    expect(document.activeElement).toBe(close);
    press(dialog, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(quit);
    expect(document.activeElement).not.toBe(came);
  });

  it("描画されていない操作は巡回に入らない", () => {
    const { host } = render(Modal, {
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
    const reached: Element[] = [];
    const dialog = dialogOf(host);
    for (let step = 0; step < 4; step += 1) {
      press(dialog, "Tab");
      reached.push(document.activeElement as Element);
    }
    expect(reached.map((element) => element.textContent)).not.toContain("隠れている");
    // Collected as elements rather than as text: the × announces 閉じる but reads as nothing, so a
    // set of `textContent` would put it beside the closed `details`' hidden button as another empty
    // string and stop telling the two apart.
    expect(new Set(reached)).toEqual(
      new Set([closeOf(host), byText(host, "button", "保存"), host.querySelector("summary")!]),
    );
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
