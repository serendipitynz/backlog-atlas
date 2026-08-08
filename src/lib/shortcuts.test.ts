import { describe, expect, it } from "vitest";
import {
  SCOPE_LABEL,
  SHORTCUTS,
  SHORTCUT_ORDER,
  ariaKeyShortcuts,
  chordLabel,
  isMacUserAgent,
  matchShortcut,
  shortcutHint,
  shortcutOf,
  textEntryFocused,
  type Chord,
  type ShortcutAction,
  type ShortcutKeyEvent,
  type ShortcutScope,
} from "./shortcuts";

/** A press with nothing held. Each test names only the parts of the chord it is about. */
function press(part: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    ...part,
  };
}

/** The window handler's 適用範囲 while the grid is up — the pair the shell passes (doc-7 §2.1). */
const ON_GRID: readonly ShortcutScope[] = ["bothScreens", "swimlane"];

/** A context on each platform, so every match is stated for the OS it belongs to. */
function on(
  scopes: readonly ShortcutScope[],
  options: { textEntry?: boolean; mac?: boolean } = {},
) {
  return { scopes, textEntry: options.textEntry ?? false, mac: options.mac ?? true };
}

function spelled(chord: Chord): { mac: string; other: string } {
  return { mac: chordLabel(chord, true), other: chordLabel(chord, false) };
}

describe("割り当て一覧 (doc-7 §2.1)", () => {
  it("holds every assignment in one list, in SHORTCUT_ORDER", () => {
    expect(SHORTCUTS.map((binding) => binding.action)).toEqual([...SHORTCUT_ORDER]);
  });

  it("gives every row an operation and a 使える場所 the 一覧 can print", () => {
    for (const binding of SHORTCUTS) {
      expect(binding.operation).not.toBe("");
      expect(SCOPE_LABEL[binding.scope]).not.toBe("");
    }
  });

  /**
   * The point of one list: two assignments that can be answered by the same press would make which
   * one runs depend on the order of this array. Chords may repeat only across 適用範囲 that cannot be
   * answering at once — ⌘Enter is 保存 in a 編集部品 and 作成 in the 列内新規タスク入力, and the caret
   * is in one or the other.
   */
  it("never gives one press two meanings within a set of 適用範囲 that answer together", () => {
    const together: readonly ShortcutScope[][] = [
      // The window handler while the grid is up, and the same handler on プロジェクト詳細画面.
      ["bothScreens", "swimlane"],
      ["bothScreens"],
      // A press inside a 被せ層: the layer answers, and the window handler is not listening.
      ["overlay", "modal"],
      // A press inside either input surface still bubbles to the window handler.
      ["bothScreens", "swimlane", "editPart"],
      ["bothScreens", "swimlane", "laneCreate"],
    ];
    for (const scopes of together) {
      const seen = new Set<string>();
      for (const binding of SHORTCUTS.filter((entry) => scopes.includes(entry.scope))) {
        const key = `${binding.chord.mod === true ? "mod+" : ""}${
          binding.chord.shift === true ? "shift+" : ""
        }${binding.chord.key.toLowerCase()}`;
        expect(seen.has(key), `${key} is assigned twice in ${scopes.join("+")}`).toBe(false);
        seen.add(key);
      }
    }
  });

  /** doc-7 §2.1: 既定動作の打ち消しは、それが要るキーだけに限る。 */
  it("records what each preventDefault stops, and stops nothing elsewhere", () => {
    const stopping = SHORTCUTS.filter((binding) => binding.preventsDefault !== null);
    expect(stopping.map((binding) => binding.action)).toEqual([
      "openRegister",
      "addFilter",
      "undoFilter",
      "cycleModalFocus",
      "saveEditSession",
      "submitLaneCreate",
    ]);
    for (const binding of stopping) expect(binding.preventsDefault).not.toBe("");
  });

  /**
   * The type TASK-129 was raised for, and the reason `addFilter` is in the list above: a 単独キー is
   * only answered while the caret is outside a field, so its character normally lands nowhere — unless
   * the operation itself puts a field under the caret before the default is performed. `firesInTextEntry`
   * cannot see that field, so the row has to stop the key.
   *
   * The operations that move focus were counted on the real shell rather than assumed (WebKit,
   * `_sandbox/app-check/`): F reaches the 値一覧's 検索欄, M reaches the menu's first button, Escape
   * returns to the opener, and both ⌘ chords reach the modal's 閉じる. Only F lands on something that
   * takes characters, which is why the set below has one member. A row added with the same shape
   * belongs in it.
   */
  it("stops the key of every bare-key operation that moves focus into a text field", () => {
    const focusesTextEntry: readonly ShortcutAction[] = ["addFilter"];
    for (const action of focusesTextEntry) {
      const binding = shortcutOf(action);
      expect(binding.chord.mod).not.toBe(true);
      expect(binding.preventsDefault).not.toBeNull();
    }
  });

  /**
   * doc-7 §2.1 suppresses *bare* keys inside text fields. A modifier chord is free to fire there —
   * ⌘Enter is 明示保存 in the editor — so the rule is about the bare ones.
   */
  it("keeps every bare-key assignment out of text fields, except the ones that type nothing", () => {
    for (const binding of SHORTCUTS) {
      if (binding.chord.mod === true || !binding.firesInTextEntry) continue;
      expect(["Escape", "Tab"]).toContain(binding.chord.key);
    }
  });
});

describe("照合 (doc-7 §2.1 の契約)", () => {
  /**
   * doc-7 §2.1: 修飾キーは macOS で Command、Windows・Linux で Control に対応させる。The other platform's
   * modifier is not a second way in — on macOS, Control+letter is native caret movement inside a text
   * field, and these chords fire in text fields, so answering it would take Control-N from the editor
   * while the screen only ever printed ⌘N (review [P2] on PR #34).
   */
  it("answers this OS's modifier only", () => {
    expect(matchShortcut(press({ key: "n", metaKey: true }), on(ON_GRID))?.action).toBe(
      "openRegister",
    );
    expect(matchShortcut(press({ key: "n", ctrlKey: true }), on(ON_GRID))).toBeNull();

    const windows = { mac: false };
    expect(
      matchShortcut(press({ key: "n", ctrlKey: true }), on(ON_GRID, windows))?.action,
    ).toBe("openRegister");
    expect(matchShortcut(press({ key: "n", metaKey: true }), on(ON_GRID, windows))).toBeNull();
  });

  it("does not answer both modifiers held together", () => {
    expect(
      matchShortcut(press({ key: "n", metaKey: true, ctrlKey: true }), on(ON_GRID)),
    ).toBeNull();
    expect(
      matchShortcut(press({ key: "n", metaKey: true, ctrlKey: true }), on(ON_GRID, { mac: false })),
    ).toBeNull();
  });

  it("does not read a modifier chord as its bare key, or the reverse", () => {
    expect(matchShortcut(press({ key: "n" }), on(ON_GRID))).toBeNull();
    expect(matchShortcut(press({ key: "f", metaKey: true }), on(ON_GRID))).toBeNull();
    // Nor via the *other* platform's modifier: ⌃F is native forward-char on macOS.
    expect(matchShortcut(press({ key: "f", ctrlKey: true }), on(ON_GRID))).toBeNull();
    expect(
      matchShortcut(press({ key: "f", metaKey: true }), on(ON_GRID, { mac: false })),
    ).toBeNull();
  });

  it("fires no assignment during an IME composition", () => {
    for (const event of [
      press({ key: "n", metaKey: true, isComposing: true }),
      // macOS WebKit reports a composing keydown this way (`Editor.svelte` has checked it since
      // doc-8 §6.2), so the guard reads both signals.
      press({ key: "n", metaKey: true, keyCode: 229 }),
      press({ key: "f", keyCode: 229 }),
    ]) {
      expect(matchShortcut(event, on(ON_GRID))).toBeNull();
    }
  });

  it("withholds bare keys while the caret is in a text field, and keeps modifier chords", () => {
    expect(matchShortcut(press({ key: "f" }), on(ON_GRID, { textEntry: true }))).toBeNull();
    expect(
      matchShortcut(press({ key: "Backspace" }), on(ON_GRID, { textEntry: true })),
    ).toBeNull();
    expect(
      matchShortcut(press({ key: "n", metaKey: true }), on(ON_GRID, { textEntry: true }))?.action,
    ).toBe("openRegister");
  });

  it("closes a 被せ層 on Escape even with the caret in one of its fields", () => {
    expect(
      matchShortcut(press({ key: "Escape" }), on(["overlay"], { textEntry: true }))?.action,
    ).toBe("closeOverlay");
  });

  it("answers only the 適用範囲 the caller names", () => {
    // The grid's bare keys are not answered from プロジェクト詳細画面, where there is no grid.
    expect(matchShortcut(press({ key: "f" }), on(["bothScreens"]))).toBeNull();
    // Nothing at all while a modal is up: the shell passes no scope, so a press falls through.
    expect(matchShortcut(press({ key: "m" }), on([]))).toBeNull();
    expect(
      matchShortcut(
        press({ key: "Enter", metaKey: true }),
        on(["laneCreate"], { textEntry: true }),
      )?.action,
    ).toBe("submitLaneCreate");
  });

  it("takes Tab in either direction inside a modal, and Alt as a different chord", () => {
    expect(matchShortcut(press({ key: "Tab" }), on(["modal"], { textEntry: true }))?.action).toBe(
      "cycleModalFocus",
    );
    expect(
      matchShortcut(press({ key: "Tab", shiftKey: true }), on(["modal"], { textEntry: true }))
        ?.action,
    ).toBe("cycleModalFocus");
    // ⌥f types ƒ on macOS; swallowing it would take a character away from the field.
    expect(matchShortcut(press({ key: "f", altKey: true }), on(ON_GRID))).toBeNull();
  });

  it("does not read Shift+key as the bare key", () => {
    expect(matchShortcut(press({ key: "F", shiftKey: true }), on(ON_GRID))).toBeNull();
    // Caps Lock leaves `shiftKey` false, and the letter still means the assignment.
    expect(matchShortcut(press({ key: "F" }), on(ON_GRID))?.action).toBe("addFilter");
  });
});

describe("表記 (doc-7 §2.1 修飾キーの OS 対応)", () => {
  it("spells 共通修飾キー per OS while the assignment stays one", () => {
    expect(spelled(shortcutOf("openRegister").chord)).toEqual({ mac: "⌘N", other: "Ctrl+N" });
    expect(spelled(shortcutOf("openSettings").chord)).toEqual({ mac: "⌘,", other: "Ctrl+," });
    expect(shortcutHint("addFilter", true)).toBe("F");
    expect(shortcutHint("undoFilter", false)).toBe("Backspace");
    expect(shortcutHint("closeOverlay", true)).toBe("Esc");
  });

  it("shows both directions of the one assignment that answers Shift too", () => {
    expect(spelled(shortcutOf("cycleModalFocus").chord)).toEqual({
      mac: "Tab / ⇧Tab",
      other: "Tab / Shift+Tab",
    });
  });

  it("reads macOS off the user agent, and nothing else as macOS", () => {
    expect(isMacUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
    expect(isMacUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(isMacUserAgent("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });

  /** What is advertised has to be what is answered — one modifier, this OS's (review [P2]). */
  it("advertises this OS's chord only, and matches what it advertises", () => {
    expect(ariaKeyShortcuts("openRegister", true)).toBe("Meta+N");
    expect(ariaKeyShortcuts("openRegister", false)).toBe("Control+N");
    expect(ariaKeyShortcuts("addFilter", true)).toBe("F");
    expect(ariaKeyShortcuts("cycleModalFocus", false)).toBe("Tab Shift+Tab");
  });
});

describe("文字入力中 (doc-7 §2.1)", () => {
  /** Stands in for a focused element: `hit` is what `closest` would find. */
  function focused(hit: boolean) {
    return { closest: (selectors: string) => (hit && selectors.length > 0 ? {} : null) };
  }

  it("counts focus inside an element that takes characters, and nothing else", () => {
    expect(textEntryFocused(focused(true))).toBe(true);
    expect(textEntryFocused(focused(false))).toBe(false);
    // Nothing focused at all — the body has it — is not a text field.
    expect(textEntryFocused(null)).toBe(false);
  });
});
