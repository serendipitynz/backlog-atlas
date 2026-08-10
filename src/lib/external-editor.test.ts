import { describe, expect, it } from "vitest";
import {
  EMPTY_DEPENDENCIES_REASON,
  EMPTY_REFERENCES_REASON,
  EXTERNAL_EDITOR_ROUTE,
  editAvailability,
} from "./edit";
import {
  CONFIGURED_TERMINAL_CAVEAT,
  EDITOR_PROBE_PENDING_REASON,
  FILE_MISSING_EDITOR_REASON,
  FRONTMATTER_NOTICE,
  NO_CONFIGURED_EDITOR_REASON,
  UNSAVED_INPUT_WARNING,
  editorOffers,
  launchConfirmation,
  launchFailureDetail,
  launchSummary,
  needsConfirmation,
} from "./external-editor";
import { taskView } from "./fixtures";
import type { EditorReadiness } from "./wire";

const WITH_EDITOR: EditorReadiness = {
  configured: { source: "visual", program: "code", args: ["-w"] },
  association: "open",
};

const WITHOUT_EDITOR: EditorReadiness = { configured: null, association: "open" };

/** What Windows reports (TASK-44): the association launcher is a Win32 call, not a program. */
const ON_WINDOWS: EditorReadiness = {
  configured: { source: "editor", program: "notepad", args: [] },
  association: "ShellExecuteW",
};

function offer(readiness: EditorReadiness | null, method: "configured" | "association") {
  const found = editorOffers(readiness, { fileMissing: false }).find(
    (candidate) => candidate.method === method,
  );
  if (found === undefined) throw new Error(`no offer for ${method}`);
  return found;
}

describe("editorOffers", () => {
  it("offers both methods and names what each would run", () => {
    const offers = editorOffers(WITH_EDITOR, { fileMissing: false });
    expect(offers.map((entry) => entry.method)).toEqual(["configured", "association"]);
    expect(offers.every((entry) => entry.enabled)).toBe(true);
    // The source in effect is named, so "which editor" is never guessed from the program alone.
    expect(offer(WITH_EDITOR, "configured").label).toContain("$VISUAL");
    expect(offer(WITH_EDITOR, "configured").command).toBe("code -w <このタスクのファイル>");
    expect(offer(WITH_EDITOR, "association").command).toContain("open");
  });

  it("names アプリ設定 as the source when the setting is what resolved", () => {
    // doc-8 §7 の解決順 puts アプリ設定 first, and the label has to say so: calling it `$…` would send
    // the user looking for an environment variable that is not the one in effect.
    const fromSettings: EditorReadiness = {
      configured: { source: "appSettings", program: "/Applications/My Editor", args: [] },
      association: "open",
    };
    const configured = offer(fromSettings, "configured");
    expect(configured.label).toContain("アプリ設定");
    expect(configured.label).not.toContain("$");
    expect(configured.command).toBe("/Applications/My Editor <このタスクのファイル>");
  });

  it("keeps the association method when no editor variable is set", () => {
    // doc-8 §7 names both; the machine without an $EDITOR is exactly why they are separate controls.
    expect(offer(WITHOUT_EDITOR, "association").enabled).toBe(true);
    const configured = offer(WITHOUT_EDITOR, "configured");
    expect(configured.enabled).toBe(false);
    expect(configured.reason).toBe(NO_CONFIGURED_EDITOR_REASON);
    // The reason has to name both ways out, since アプリ設定 is now the first of them (doc-8 §7).
    expect(configured.reason).toContain("設定画面");
  });

  it("offers the association method on Windows and names ShellExecuteW as what it invokes", () => {
    // TASK-44: the method used to be withheld here, because the only launcher available was
    // `cmd /c start` and it re-parses the path (a file named `a&calc.md` would run `calc`). It is now a
    // `ShellExecuteW` call, and the panel names it — reading *that* off the screen is how a user can
    // tell "opened through a shell" from "opened through the shell API".
    const association = offer(ON_WINDOWS, "association");
    expect(association.enabled).toBe(true);
    expect(association.reason).toBe(null);
    expect(association.command).toBe("ShellExecuteW … <このタスクのファイル>");
    expect(offer(ON_WINDOWS, "configured").enabled).toBe(true);
  });

  it("states the terminal-editor caveat on an offered $EDITOR", () => {
    // Enabled *and* carrying a caveat: a terminal editor spawned from a GUI process draws nothing,
    // and that has to be readable before the launch rather than diagnosed after it.
    const configured = offer(WITH_EDITOR, "configured");
    expect(configured.enabled).toBe(true);
    expect(configured.reason).toBe(CONFIGURED_TERMINAL_CAVEAT);
  });

  it("withholds both methods while the probe is unfinished", () => {
    const offers = editorOffers(null, { fileMissing: false });
    expect(offers.every((entry) => !entry.enabled)).toBe(true);
    expect(offers.every((entry) => entry.reason === EDITOR_PROBE_PENDING_REASON)).toBe(true);
  });

  it("withholds both methods when the file left the read result", () => {
    // Nothing can be named as the target, and a launch on a stale path is what the boundary refuses.
    const offers = editorOffers(WITH_EDITOR, { fileMissing: true });
    expect(offers.every((entry) => !entry.enabled)).toBe(true);
    expect(offers.every((entry) => entry.reason === FILE_MISSING_EDITOR_REASON)).toBe(true);
  });
});

describe("開く前の表示 (AC #3)", () => {
  it("states the frontmatter exposure, the 不整合表示 it causes, and the missing CLI check", () => {
    expect(FRONTMATTER_NOTICE).toContain("frontmatter");
    expect(FRONTMATTER_NOTICE).toContain("不整合表示");
    // The exception doc-8 §7 names: these bytes do not pass the CLI's option checking.
    expect(FRONTMATTER_NOTICE).toContain("検査は実施されません");
  });

});

describe("二重取り込みの回避 (AC #4)", () => {
  it("asks for a confirmation only while there is 未保存入力 (doc-8 §6.4)", () => {
    expect(needsConfirmation(true)).toBe(true);
    expect(needsConfirmation(false)).toBe(false);
  });

  it("promises the input is kept and names both halves of the doc-8 §6.4 handling", () => {
    // Neither half may be dropped from the wording: the launch does not take the 未保存入力, and the
    // divergence is acted on where doc-8 §6.4 puts it — 外部変更の検出 and 保存時の更新前競合検出.
    expect(UNSAVED_INPUT_WARNING).toContain("破棄しません");
    expect(UNSAVED_INPUT_WARNING).toContain("外部変更");
    expect(UNSAVED_INPUT_WARNING).toContain("更新前競合検出");
  });

  it("問いは区画が出している注意文そのもので、両方の答えが起動を名乗る (doc-11 §12)", () => {
    // The layer covers the 区画 that prints the warning, so the question has to carry it — and doc-11
    // §7 already settled that the same thing is not worded a second way for the second place.
    for (const offer of editorOffers(WITH_EDITOR, { fileMissing: false })) {
      const confirmation = launchConfirmation(offer);
      expect(confirmation.question).toBe(UNSAVED_INPUT_WARNING);
      expect(confirmation.title).toBe(offer.label);
      expect(confirmation.proceed).toBe(offer.label);
      // 語尾の … belongs to the 控え, not to the layer's name (doc-11 §12 の ②).
      expect(confirmation.title).not.toContain("…");
    }
  });
});

describe("CLI で不能な操作の案内先 (AC #5)", () => {
  it("is the destination every withheld operation points at", () => {
    // The reasons and the control have to name the same place: a reason pointing at "外部エディタ経路"
    // in the abstract is what made this route unfindable before it existed as a control.
    expect(EMPTY_REFERENCES_REASON).toContain(EXTERNAL_EDITOR_ROUTE);
    expect(EMPTY_DEPENDENCIES_REASON).toContain(EXTERNAL_EDITOR_ROUTE);
    for (const storageState of ["draft", "completed", "archive"] as const) {
      const availability = editAvailability(taskView({ storageState }), {
        state: "ready",
        version: "1.48.0",
      });
      expect(availability.state).toBe("unavailable");
      if (availability.state !== "unavailable") return;
      expect(availability.reason).toContain(EXTERNAL_EDITOR_ROUTE);
    }
  });

  it("stays offered for the 保存区分 the CLI cannot edit", () => {
    // doc-8 §6.5 sends draft・completed・archive here, so the controls must not depend on 保存区分 or
    // on the CLI probe — `editorOffers` takes neither.
    expect(editorOffers(WITH_EDITOR, { fileMissing: false }).every((entry) => entry.enabled)).toBe(
      true,
    );
  });
});

describe("launchSummary", () => {
  it("shows the argument array that was spawned", () => {
    expect(
      launchSummary({
        method: "configured",
        program: "code",
        args: ["-w", "/roots/p/tasks/task-1 - a.md"],
      }),
    ).toBe("$EDITOR で起動しました: code -w /roots/p/tasks/task-1 - a.md");
    expect(
      launchSummary({ method: "association", program: "open", args: ["/roots/p/a.md"] }),
    ).toContain("OS の関連付け");
  });

  it("shows the path ShellExecuteW received, metacharacters included", () => {
    // TASK-44 AC #3 read off the screen: the name's `&`, `^` and `%…%` are still there and still one
    // value, which is what tells the user no command line was involved.
    const path = String.raw`C:\roots\my backlog\tasks\task-1 - a&b^c %PATH% d.md`;
    const summary = launchSummary({
      method: "association",
      program: "ShellExecuteW",
      args: [path],
    });
    expect(summary).toBe(`OS の関連付け で起動しました: ShellExecuteW ${path}`);
  });
});

describe("launchFailureDetail", () => {
  it("reads a stale path as a re-read, not as an editor failure", () => {
    const detail = launchFailureDetail({
      kind: "unknownTaskFile",
      slug: "atlas",
      path: "/roots/p/tasks/task-9 - gone.md",
    });
    expect(detail).toContain("/roots/p/tasks/task-9 - gone.md");
    expect(detail).toContain("開き直して");
  });

  it("names the program a failed spawn tried, and points at the 起動指定 to correct", () => {
    const detail = launchFailureDetail({
      kind: "editorLaunchFailed",
      method: "configured",
      program: "definitely-not-installed",
      detail: "No such file or directory (os error 2)",
    });
    expect(detail).toContain("definitely-not-installed");
    expect(detail).toContain("EDITOR");
  });

  it("points a failed association at the OS's association, not at $EDITOR", () => {
    // What a Windows user meets when nothing is registered for `.md` (SE_ERR_NOASSOC). The 起動指定 has
    // no bearing on it, so naming VISUAL・EDITOR here would send them to the one place that cannot fix it.
    const detail = launchFailureDetail({
      kind: "editorLaunchFailed",
      method: "association",
      program: "ShellExecuteW",
      detail: "この拡張子に関連付けられたアプリケーションがありません (SE_ERR_NOASSOC)",
    });
    expect(detail).toContain("ShellExecuteW");
    expect(detail).toContain("関連付けられたアプリケーション");
    expect(detail).not.toContain("値（プログラム名とオプション）");
  });

  it("falls back to the boundary's own wording for unrelated failures", () => {
    expect(launchFailureDetail({ kind: "projectNotOpen", slug: "atlas" })).toContain("atlas");
  });
});
