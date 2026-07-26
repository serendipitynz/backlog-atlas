import { describe, expect, it } from "vitest";
import {
  EMPTY_DEPENDENCIES_REASON,
  EMPTY_REFERENCES_REASON,
  EXTERNAL_EDITOR_ROUTE,
  editAvailability,
} from "./edit";
import {
  CLI_LIMIT_GUIDANCE,
  CONFIGURED_TERMINAL_CAVEAT,
  EDITOR_PROBE_PENDING_REASON,
  FILE_MISSING_EDITOR_REASON,
  FRONTMATTER_NOTICE,
  NO_ASSOCIATION_LAUNCHER_REASON,
  NO_CONFIGURED_EDITOR_REASON,
  UNSAVED_INPUT_WARNING,
  WRITE_BACK_NOTE,
  editorOffers,
  launchFailureDetail,
  launchSummary,
  needsConfirmation,
} from "./external-editor";
import { taskView } from "./fixtures";
import type { EditorReadiness } from "./wire";

const WITH_EDITOR: EditorReadiness = {
  configured: { variable: "VISUAL", program: "code", args: ["-w"] },
  association: "open",
};

const WITHOUT_EDITOR: EditorReadiness = { configured: null, association: "open" };

/** A platform with no association launcher this build will spawn (Windows — `cmd` is a shell). */
const WITHOUT_ASSOCIATION: EditorReadiness = {
  configured: { variable: "EDITOR", program: "notepad", args: [] },
  association: null,
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
    // The variable in effect is named, so "which editor" is never guessed from the program alone.
    expect(offer(WITH_EDITOR, "configured").label).toContain("VISUAL");
    expect(offer(WITH_EDITOR, "configured").command).toBe("code -w <このタスクのファイル>");
    expect(offer(WITH_EDITOR, "association").command).toContain("open");
  });

  it("keeps the association method when no editor variable is set", () => {
    // doc-8 §7 names both; the machine without an $EDITOR is exactly why they are separate controls.
    expect(offer(WITHOUT_EDITOR, "association").enabled).toBe(true);
    const configured = offer(WITHOUT_EDITOR, "configured");
    expect(configured.enabled).toBe(false);
    expect(configured.reason).toBe(NO_CONFIGURED_EDITOR_REASON);
  });

  it("withholds the association method where the platform has no non-shell launcher", () => {
    // The alternative would be `cmd /c start`, which re-parses the path (a file named `a&calc.md`
    // would run `calc`). The control is therefore absent *with its reason*, and $EDITOR still works.
    const association = offer(WITHOUT_ASSOCIATION, "association");
    expect(association.enabled).toBe(false);
    expect(association.reason).toBe(NO_ASSOCIATION_LAUNCHER_REASON);
    expect(association.command).toBe("—");
    expect(offer(WITHOUT_ASSOCIATION, "configured").enabled).toBe(true);
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
  it("states the frontmatter exposure, the degradation it causes, and the missing CLI check", () => {
    expect(FRONTMATTER_NOTICE).toContain("frontmatter");
    expect(FRONTMATTER_NOTICE).toContain("縮退表示");
    // The exception doc-8 §7 names: these bytes do not pass the CLI's option checking.
    expect(FRONTMATTER_NOTICE).toContain("スキーマ検査");
  });

  it("says the save comes back through the watch, not through an exit (AC #2)", () => {
    expect(WRITE_BACK_NOTE).toContain("ファイル監視");
    expect(WRITE_BACK_NOTE).toContain("閉じる必要はありません");
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
});

describe("CLI で不能な操作の案内先 (AC #5)", () => {
  it("names the operations this route exists for", () => {
    expect(CLI_LIMIT_GUIDANCE).toContain("References");
    expect(CLI_LIMIT_GUIDANCE).toContain("dependencies");
    expect(CLI_LIMIT_GUIDANCE).toContain("archive");
  });

  it("is the destination every withheld operation points at", () => {
    // The reasons and the control have to name the same place: a reason pointing at "外部エディタ経路"
    // in the abstract is what made this route unfindable before it existed as a control.
    expect(EMPTY_REFERENCES_REASON).toContain(EXTERNAL_EDITOR_ROUTE);
    expect(EMPTY_DEPENDENCIES_REASON).toContain(EXTERNAL_EDITOR_ROUTE);
    for (const storageState of ["draft", "completed", "archive"] as const) {
      const availability = editAvailability(taskView({ storageState }), {
        state: "ready",
        version: "1.47.1",
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

  it("names the program a failed spawn tried", () => {
    const detail = launchFailureDetail({
      kind: "editorLaunchFailed",
      program: "definitely-not-installed",
      detail: "No such file or directory (os error 2)",
    });
    expect(detail).toContain("definitely-not-installed");
    expect(detail).toContain("EDITOR");
  });

  it("falls back to the boundary's own wording for unrelated failures", () => {
    expect(launchFailureDetail({ kind: "projectNotOpen", slug: "atlas" })).toContain("atlas");
  });
});
