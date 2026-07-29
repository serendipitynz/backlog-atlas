import { describe, expect, it } from "vitest";
import {
  PENDING_CONSUMER_NOTE,
  STORAGE_SELECTIONS,
  editorArgsText,
  editorCommandOf,
  emptyStorageWarning,
  isDirty,
  saveAvailability,
  statusNotice,
  toggleStorage,
} from "./settings";
import type { AppSettings, SettingsStatus } from "./wire";

const DEFAULTS: AppSettings = {
  schema_version: 1,
  theme: null,
  card_density: "m",
  default_storage_filter: ["active"],
  default_detail_placement: "sidebar",
  watch_external_changes: true,
};

describe("statusNotice", () => {
  it("says nothing when the values came from the file", () => {
    expect(statusNotice({ state: "stored" })).toBeNull();
  });

  it("states why the defaults are in force, differently per cause (AC #6)", () => {
    // decision-13 gives three different situations, and they lead to different expectations: a first
    // run needs no action, a corrupt file is rebuilt by the next save, a newer file is never written.
    const absent = statusNotice({ state: "absent" });
    const unreadable = statusNotice({ state: "unreadable", detail: "expected an equals" });
    const readOnly = statusNotice({ state: "readOnly", version: 7 });
    for (const notice of [absent, unreadable, readOnly]) {
      expect(notice).toContain("既定値");
    }
    expect(unreadable).toContain("expected an equals");
    expect(readOnly).toContain("7");
    expect(readOnly).toContain("保存はできません");
    expect(new Set([absent, unreadable, readOnly]).size).toBe(3);
  });
});

describe("saveAvailability", () => {
  it("allows saving over a missing or corrupt file — the save rebuilds it", () => {
    for (const status of [
      { state: "stored" },
      { state: "absent" },
      { state: "unreadable", detail: "…" },
    ] satisfies SettingsStatus[]) {
      expect(saveAvailability(status)).toEqual({ enabled: true, reason: null });
    }
  });

  it("withholds saving over an unknown newer file, with the reason (AC #1)", () => {
    const availability = saveAvailability({ state: "readOnly", version: 9 });
    expect(availability.enabled).toBe(false);
    // doc-5 §5 / doc-11 §5: a withheld control says why, rather than being absent.
    expect(availability.reason).toContain("9");
  });
});

describe("外部エディタ指定 (doc-8 §7)", () => {
  it("reads arguments one per line and keeps spaces inside one argument", () => {
    // The setting is not a command line: nothing splits on whitespace, which is what lets a program
    // path — or an argument — contain spaces at all (AGENTS: never a shell string).
    const command = editorCommandOf("/Applications/My Editor.app/Contents/MacOS/my editor", " -w \n --new window \n\n");
    expect(command).toEqual({
      program: "/Applications/My Editor.app/Contents/MacOS/my editor",
      args: ["-w", "--new window"],
    });
    expect(editorArgsText(command)).toBe("-w\n--new window");
  });

  it("clears the setting when the program is blank, so the variables resolve again", () => {
    // doc-8 §7 の解決順 falls through to $VISUAL/$EDITOR; a blank program must not shadow them with a
    // control whose only outcome is a spawn error.
    expect(editorCommandOf("", "-w")).toBeUndefined();
    expect(editorCommandOf("   ", "")).toBeUndefined();
    expect(editorArgsText(undefined)).toBe("");
  });
});

describe("既定の保存区分 (doc-7 §5.2)", () => {
  it("keeps a stable order however the boxes are clicked", () => {
    // The saved file and the checkbox list have to read the same on the next start, so the order is
    // the declaration order rather than the click order.
    const clicked = toggleStorage(toggleStorage(["active"], "archive", true), "draft", true);
    expect(clicked).toEqual(["active", "draft", "archive"]);
    expect(toggleStorage(clicked, "active", false)).toEqual(["draft", "archive"]);
  });

  it("offers the indeterminate selection the filter can hold (doc-4 §3.4/§5)", () => {
    expect(STORAGE_SELECTIONS).toContain("indeterminate");
  });

  it("warns about an empty selection instead of refusing it", () => {
    // Empty is a legal filter state (保存区分 is a positive selection), but as a *startup* default it
    // means a grid with no cards, which the user should not meet unwarned.
    expect(emptyStorageWarning([])).not.toBeNull();
    expect(emptyStorageWarning(["active"])).toBeNull();
  });
});

describe("isDirty", () => {
  it("compares every item, including an absent external editor", () => {
    expect(isDirty(DEFAULTS, { ...DEFAULTS })).toBe(false);
    expect(isDirty(DEFAULTS, { ...DEFAULTS, external_editor: undefined })).toBe(false);
    expect(isDirty(DEFAULTS, { ...DEFAULTS, card_density: "l" })).toBe(true);
    expect(isDirty(DEFAULTS, { ...DEFAULTS, watch_external_changes: false })).toBe(true);
    expect(isDirty(DEFAULTS, { ...DEFAULTS, theme: "Atlas Dark" })).toBe(true);
    expect(
      isDirty(DEFAULTS, { ...DEFAULTS, external_editor: { program: "code", args: [] } }),
    ).toBe(true);
    expect(isDirty(DEFAULTS, { ...DEFAULTS, default_storage_filter: ["active", "draft"] })).toBe(
      true,
    );
  });
});

describe("画面が持たない項目", () => {
  it("says a stored-but-unused value is stored (rather than hiding the control)", () => {
    // decision-13 puts all six items in this file while three of the screens that read them are
    // separate work; an absent control would read as "Atlas has no such setting".
    expect(PENDING_CONSUMER_NOTE).toContain("保存");
  });
});
