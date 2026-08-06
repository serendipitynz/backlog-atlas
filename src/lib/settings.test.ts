import { describe, expect, it } from "vitest";
import {
  CARD_DENSITY_LABEL,
  CARD_DENSITY_NOTE,
  STORAGE_SELECTIONS,
  editorArgsText,
  editorCommandOf,
  emptyStorageWarning,
  isDirty,
  mergeDraft,
  OPENING_LOCATION_REASON,
  openLocationBlocked,
  openLocationFailure,
  saveAvailability,
  statusNotice,
  toggleStorage,
} from "./settings";
import { unreadableDetail } from "./swimlane";
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

describe("場所を開く (TASK-75)", () => {
  it("withholds the control while the file has never been written (AC #3)", () => {
    expect(openLocationBlocked({ state: "absent" }, false)).toContain("まだ作成されていない");
  });

  it("gives the launch in flight a reason of its own, whatever the file's state", () => {
    // doc-11 §5: 押せない間ずっと `aria-describedby` の指す先が空になる形は、理由の無い無効化である。
    // 発行中を状態ではなくこの関数の返す理由にしているのは、控えが黙って押せなくなるのを防ぐためで、
    // ファイルが読める状態でも同じである。
    for (const status of [
      { state: "stored" },
      { state: "absent" },
      { state: "readOnly", version: 9 },
    ] satisfies SettingsStatus[]) {
      expect(openLocationBlocked(status, true)).toBe(OPENING_LOCATION_REASON);
    }
  });

  it("opens the location for a file that exists but cannot be used", () => {
    // 読めない・上位版 の 2 つは、ファイルが**ある**状態である。手で直すならその場所を開く必要が
    // あるので、読めないことを理由に閉ざすと、直す手段のほうを閉ざすことになる。
    for (const status of [
      { state: "stored" },
      { state: "unreadable", detail: "expected an equals" },
      { state: "readOnly", version: 9 },
    ] satisfies SettingsStatus[]) {
      expect(openLocationBlocked(status, false)).toBeNull();
    }
  });

  it("names what refused the launch, without the 外部エディタ経路's advice", () => {
    const failure = openLocationFailure({
      kind: "editorLaunchFailed",
      method: "association",
      program: "xdg-open",
      detail: "No such file or directory (os error 2)",
    });
    expect(failure).toContain("xdg-open");
    expect(failure).toContain("os error 2");
    // `launchFailureDetail` (external-editor.ts) points a failed association at `.md` の関連付け and at
    // VISUAL・EDITOR. Neither has any bearing on a directory that would not open, and telling someone
    // to check them is sending them to the one place that cannot be the cause.
    expect(failure).not.toContain(".md");
    expect(failure).not.toContain("EDITOR");
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

describe("保存の失敗", () => {
  it("keeps the reason the write failed, rather than only its kind", () => {
    // The screen's recovery depends on it: an I/O fault and a refused overwrite call for different
    // actions, and both would otherwise read as the bare tag.
    expect(
      unreadableDetail({ kind: "settings", detail: "Permission denied (os error 13)" }),
    ).toBe("Permission denied (os error 13)");
  });
});

describe("カード情報量", () => {
  it("says the 状態の印 survive every 段 (doc-7 §3, AC #2)", () => {
    // Otherwise S reads as "fewer items, so probably fewer warnings too", and a user who wants a
    // dense grid would be choosing — as far as they could tell — to stop being told about 不整合.
    expect(CARD_DENSITY_NOTE).toContain("状態の印");
    expect(CARD_DENSITY_NOTE).toContain("どの段でも落としません");
  });

  it("names what each 段 adds, so the choice is readable before it is made", () => {
    expect(CARD_DENSITY_LABEL.s).toContain("1 行");
    expect(CARD_DENSITY_LABEL.m).toContain("Type");
    expect(CARD_DENSITY_LABEL.l).toContain("assignee");
  });
});

describe("第 2 の書き手（既定の詳細配置）と開いているフォーム", () => {
  it("seeds straight from the new values while there is no draft to protect", () => {
    expect(mergeDraft(null, null, DEFAULTS)).toEqual(DEFAULTS);
  });

  it("adopts an outside change to a field the user has not touched", () => {
    // Choosing a 詳細配置 stores it as the 既定 (doc-8 §2.2) while this form may be open. An untouched
    // field must follow the file, or 保存 would put the placement back the way it was.
    const next: AppSettings = { ...DEFAULTS, default_detail_placement: "full" };
    const merged = mergeDraft(DEFAULTS, { ...DEFAULTS }, next);
    expect(merged.default_detail_placement).toBe("full");
  });

  it("keeps every field the user edited, and takes the rest from the new values", () => {
    const draft: AppSettings = { ...DEFAULTS, card_density: "l", theme: "dusk" };
    const next: AppSettings = { ...DEFAULTS, default_detail_placement: "modal" };
    const merged = mergeDraft(DEFAULTS, draft, next);

    expect(merged.card_density).toBe("l");
    expect(merged.theme).toBe("dusk");
    expect(merged.default_detail_placement).toBe("modal");
  });

  it("does not let an outside write take a placement the user is in the middle of changing", () => {
    const draft: AppSettings = { ...DEFAULTS, default_detail_placement: "modal" };
    const next: AppSettings = { ...DEFAULTS, default_detail_placement: "full" };
    expect(mergeDraft(DEFAULTS, draft, next).default_detail_placement).toBe("modal");
  });

  it("keeps a half-typed 起動指定, and leaves the key absent when it is unset either side", () => {
    const draft: AppSettings = {
      ...DEFAULTS,
      external_editor: { program: "/usr/local/bin/mi", args: [] },
    };
    const merged = mergeDraft(DEFAULTS, draft, { ...DEFAULTS });
    expect(merged.external_editor).toEqual({ program: "/usr/local/bin/mi", args: [] });
    // Absent rather than present-and-undefined: the key is skipped in the file when there is none.
    expect("external_editor" in mergeDraft(DEFAULTS, { ...DEFAULTS }, DEFAULTS)).toBe(false);
  });

  it("takes schema_version from the file, never from the draft", () => {
    const draft: AppSettings = { ...DEFAULTS, schema_version: 99 };
    expect(mergeDraft(DEFAULTS, draft, { ...DEFAULTS, schema_version: 2 }).schema_version).toBe(2);
  });

  it("keeps a hand-edited backlog_cli when the form saves some other field", () => {
    // 保存 serializes this return value as the whole file, so a field this merge omits is deleted
    // from disk. `backlog_cli` has no control on the form (doc-5 §4 順序 1 is hand-edited only), which
    // is precisely why dropping it would go unnoticed until updates degraded again.
    const withCli: AppSettings = { ...DEFAULTS, backlog_cli: "/opt/backlog/backlog" };
    const draft: AppSettings = { ...withCli, card_density: "l" };
    const merged = mergeDraft(withCli, draft, withCli);
    expect(merged.backlog_cli).toBe("/opt/backlog/backlog");
    expect(merged.card_density).toBe("l");
    // And absent rather than present-and-undefined when there is none, like external_editor.
    expect("backlog_cli" in mergeDraft(DEFAULTS, { ...DEFAULTS }, DEFAULTS)).toBe(false);
  });

  it("counts a backlog_cli difference as dirty", () => {
    // Without it in `normalize`, an incoming change to the field would read as "nothing to save".
    expect(isDirty(DEFAULTS, { ...DEFAULTS, backlog_cli: "/opt/backlog/backlog" })).toBe(true);
  });
});
