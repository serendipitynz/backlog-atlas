import { describe, expect, it } from "vitest";
import { editAvailability } from "./edit";
import {
  asksBeforeOpening,
  configuredTerminalCaveat,
  editorProbePendingReason,
  externalOpenAvailability,
  externalOpenRows,
  fileMissingReason,
  launchFailureDetail,
  noConfiguredEditorReason,
  noTargetReason,
  openNotice,
  watchStoppedNote,
  type ExternalOpenContext,
  type ExternalOpenRow,
} from "./external-editor";
import { CATALOGS } from "./messages";
import { taskView } from "./fixtures";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import type { EditorReadiness, LaunchMethod, MethodOffer } from "./wire";

const TARGET = { slug: "atlas", sourcePath: "/roots/p/tasks/task-1 - a.md" };

/** The ordinary case: a file is selected, the watch is running, nothing unsaved, nothing suppressed. */
function context(overrides: Partial<ExternalOpenContext> = {}): ExternalOpenContext {
  return {
    target: TARGET,
    fileMissing: false,
    watchStopped: false,
    hasUnsavedInput: false,
    noticeSuppressed: false,
    ...overrides,
  };
}

function row(method: LaunchMethod, over: Partial<MethodOffer> = {}): MethodOffer {
  return { method, program: "open", product: "", edits: true, ...over };
}

/** What the macOS probe reports (decision-45 §4) — the seven rows, in the crate's order. */
const ON_MACOS: EditorReadiness = {
  configured: { source: "visual", program: "code", args: ["-w"] },
  methods: [
    row("vscode", { product: "Visual Studio Code" }),
    row("zed", { product: "Zed" }),
    row("cotEditor", { product: "CotEditor" }),
    row("configured", { program: "" }),
    row("association"),
    row("reveal", { product: "Finder", edits: false }),
    row("terminal", { product: "Terminal", edits: false }),
  ],
};

const WITHOUT_EDITOR: EditorReadiness = {
  configured: null,
  methods: [row("configured", { program: "" }), row("association")],
};

/** What Windows reports (TASK-44): the association launcher is a Win32 call, not a program. */
const ON_WINDOWS: EditorReadiness = {
  configured: { source: "editor", program: "notepad", args: [] },
  methods: [
    row("vscode", { program: "code.cmd", product: "Visual Studio Code" }),
    row("notepadPlusPlus", { program: "notepad++.exe", product: "Notepad++" }),
    row("configured", { program: "" }),
    row("association", { program: "ShellExecuteW" }),
    row("reveal", { program: "explorer.exe", product: "Explorer", edits: false }),
  ],
};

function pick(readiness: EditorReadiness | null, method: LaunchMethod): ExternalOpenRow {
  const found = externalOpenRows(readiness, context()).find(
    (candidate) => candidate.method === method,
  );
  if (found === undefined) {
    throw new Error(`no row for ${method}`);
  }
  return found;
}

describe("外部で開く の 保留判定 (doc-11 §5, decision-45 §1)", () => {
  it("holds the group while 対象未選択, and says 開く相手が無い rather than 開けない", () => {
    expect(externalOpenAvailability(context({ target: null }))).toEqual({
      state: "withheld",
      reason: noTargetReason(),
    });
    // The distinction the referent table draws: a sentence about a failure would send the user looking
    // for one instead of selecting a file.
    expect(noTargetReason()).toContain("選ばれていません");
    expect(noTargetReason()).not.toContain("開けません");
  });

  it("holds it with its own reason when the selected file left the read result", () => {
    // Two facts, two reasons: nothing selected, versus what is selected is gone. `fileMissing` wins,
    // because it is the more specific of the two and the target is still nominally there.
    expect(externalOpenAvailability(context({ fileMissing: true }))).toEqual({
      state: "withheld",
      reason: fileMissingReason(),
    });
    expect(externalOpenAvailability(context({ target: null, fileMissing: true })).state).toBe(
      "withheld",
    );
  });

  it("offers the group once a file is selected", () => {
    expect(externalOpenAvailability(context())).toEqual({ state: "ready" });
  });
});

describe("externalOpenRows", () => {
  it("draws the rows the crate reported, in its order, and names what each would run", () => {
    const rows = externalOpenRows(ON_MACOS, context());
    expect(rows.map((entry) => entry.method)).toEqual([
      "vscode",
      "zed",
      "cotEditor",
      "configured",
      "association",
      "reveal",
      "terminal",
    ]);
    // Nothing here spells a platform or a product: the row set *is* the crate's answer (decision-45 §4).
    expect(pick(ON_MACOS, "vscode").label).toBe("Visual Studio Code で開く");
    expect(pick(ON_MACOS, "reveal").label).toBe("Finder で表示");
    expect(pick(ON_MACOS, "terminal").label).toBe("Terminal で開く");
    expect(pick(ON_MACOS, "configured").label).toContain("$VISUAL");
    expect(pick(ON_MACOS, "configured").command).toBe("code -w <選んでいるファイル>");
  });

  it("draws the other platform's rows from the other platform's answer", () => {
    // The same module, a different table: what changes is the crate's list, and this file has no branch
    // that could disagree with it.
    expect(externalOpenRows(ON_WINDOWS, context()).map((entry) => entry.method)).toEqual([
      "vscode",
      "notepadPlusPlus",
      "configured",
      "association",
      "reveal",
    ]);
    expect(pick(ON_WINDOWS, "notepadPlusPlus").label).toBe("Notepad++ で開く");
    expect(pick(ON_WINDOWS, "reveal").label).toBe("Explorer で表示");
    // TASK-44: reading `ShellExecuteW` off the screen is how a user tells "opened through a shell"
    // from "opened through the shell API".
    expect(pick(ON_WINDOWS, "association").command).toBe("ShellExecuteW … <選んでいるファイル>");
  });

  it("marks the 所在に効く 2 操作 as handing over nothing to edit", () => {
    // decision-45 §6: it is what keeps frontmatter の注意 off the two rows that offer no way to write.
    const rows = externalOpenRows(ON_MACOS, context());
    expect(rows.filter((entry) => !entry.edits).map((entry) => entry.method)).toEqual([
      "reveal",
      "terminal",
    ]);
  });

  it("names アプリ設定 as the source when the setting is what resolved", () => {
    // doc-8 §7 の解決順 puts アプリ設定 first, and the label has to say so: calling it `$…` would send
    // the user looking for an environment variable that is not the one in effect.
    const fromSettings: EditorReadiness = {
      configured: { source: "appSettings", program: "/Applications/My Editor", args: [] },
      methods: [row("configured", { program: "" })],
    };
    const configured = pick(fromSettings, "configured");
    expect(configured.label).toContain("アプリ設定");
    expect(configured.label).not.toContain("$");
    expect(configured.command).toBe("/Applications/My Editor <選んでいるファイル>");
  });

  it("holds only the 起動指定 row when no editor variable is set", () => {
    // The environment's obstacle belongs to its own row: the association row and the named editors are
    // unaffected by an unset $EDITOR, which is why they were separate controls to begin with.
    expect(pick(WITHOUT_EDITOR, "association").availability).toEqual({ state: "ready" });
    const configured = pick(WITHOUT_EDITOR, "configured");
    expect(configured.availability).toEqual({
      state: "withheld",
      reason: noConfiguredEditorReason(),
    });
    // The reason has to name both ways out, since アプリ設定 is now the first of them (doc-8 §7).
    expect(noConfiguredEditorReason()).toContain("設定画面");
  });

  it("states the terminal-editor caveat on an offered 起動指定 and on nothing else", () => {
    // Enabled *and* carrying a caveat: a terminal editor spawned from a GUI process draws nothing, and
    // that has to be readable before the launch rather than diagnosed after it — the more so now that a
    // success says nothing at all (decision-45 §7).
    const configured = pick(ON_MACOS, "configured");
    expect(configured.availability).toEqual({ state: "ready" });
    expect(configured.caveat).toBe(configuredTerminalCaveat());
    for (const other of externalOpenRows(ON_MACOS, context())) {
      if (other.method !== "configured") {
        expect(other.caveat).toBe(null);
      }
    }
  });

  it("says the probe has not answered rather than drawing a row set it invented", () => {
    // A guessed list would be this module writing the table decision-45 §4 put on the crate's side.
    const rows = externalOpenRows(null, context());
    expect(rows).toHaveLength(1);
    expect(rows[0].availability).toEqual({
      state: "withheld",
      reason: editorProbePendingReason(),
    });
  });
});

describe("開く前の表示 (decision-45 §6, doc-11 §15)", () => {
  it("states the frontmatter exposure, the 不整合表示 it causes, and the missing CLI check", () => {
    const notice = openNotice(pick(ON_MACOS, "vscode"), context());
    expect(notice?.frontmatter).toContain("frontmatter");
    expect(notice?.frontmatter).toContain("不整合表示");
    // The exception doc-8 §7 names: these bytes do not pass the CLI's option checking.
    expect(notice?.frontmatter).toContain("検査は実施されません");
    // 「タスクの」ではなく「管理ファイルの」: the target is four kinds now, so naming only tasks would be
    // false for a user opening a 文書 (decision-45 §6).
    expect(notice?.frontmatter).toContain("管理ファイル");
    expect(notice?.frontmatter).not.toContain("タスクの Markdown");
  });

  it("offers the tick beside the suppressible half, and names the row as both title and 進む", () => {
    const opened = pick(ON_MACOS, "zed");
    const notice = openNotice(opened, context());
    expect(notice?.suppress).toBe(CATALOGS.ja.shell.externalOpen.suppressNotice);
    expect(notice?.title).toBe(opened.label);
    expect(notice?.proceed).toBe(opened.label);
    // 語尾の … belongs to the 控え, not to the layer's name (doc-11 §12 の ②).
    expect(notice?.title).not.toContain("…");
  });

  it("stands for no row that hands over nothing to edit", () => {
    // 所在に効く 2 操作 offer no way to write the file, so there is nothing for the notice to warn about
    // — and a layer that stood anyway would train the answer into a reflex.
    for (const method of ["reveal", "terminal"] as const) {
      expect(openNotice(pick(ON_MACOS, method), context())).toBe(null);
      expect(openNotice(pick(ON_MACOS, method), context({ hasUnsavedInput: true }))).toBe(null);
    }
  });

  it("keeps the 語尾の … off a row that cannot be pressed (doc-11 §12 ②)", () => {
    // 記号が予告するのは「押しても動作に届かない」ことなので、押せない控えに付けると予告する相手が
    // 無くなる。オーナーの Windows 実機で、保留された 起動指定 の行がこれを刷っていた (2026-08-28)。
    const held = pick(WITHOUT_EDITOR, "configured");
    expect(held.availability.state).toBe("withheld");
    expect(asksBeforeOpening(held, context())).toBe(false);
    // 押せる行では変わらず付く。
    expect(asksBeforeOpening(pick(ON_MACOS, "configured"), context())).toBe(true);
  });

  it("stops standing once 注意の抑止 is recorded, and the press becomes the launch", () => {
    expect(openNotice(pick(ON_MACOS, "vscode"), context({ noticeSuppressed: true }))).toBe(null);
    expect(asksBeforeOpening(pick(ON_MACOS, "vscode"), context({ noticeSuppressed: true }))).toBe(
      false,
    );
    expect(asksBeforeOpening(pick(ON_MACOS, "vscode"), context())).toBe(true);
  });

  it("keeps 実行前確認 standing even while the notice is suppressed, and drops the tick", () => {
    // doc-11 §15 ③ and decision-45 §6: 未保存入力 is not suppressible, because a question that can be
    // turned off is one that can be missing on the single occasion it was needed. The tick goes with the
    // half it turns off — beside this question alone it would read as turning *this* question off.
    const notice = openNotice(
      pick(ON_MACOS, "vscode"),
      context({ noticeSuppressed: true, hasUnsavedInput: true }),
    );
    expect(notice).not.toBe(null);
    expect(notice?.frontmatter).toBe(null);
    expect(notice?.unsavedInput).not.toBe(null);
    expect(notice?.suppress).toBe(null);
  });

  it("says both halves in one layer when both apply", () => {
    const notice = openNotice(pick(ON_MACOS, "vscode"), context({ hasUnsavedInput: true }));
    expect(notice?.frontmatter).not.toBe(null);
    expect(notice?.unsavedInput).not.toBe(null);
    expect(notice?.suppress).not.toBe(null);
  });

  it("promises the input is kept and names both halves of the doc-8 §6.4 handling", () => {
    // Neither half may be dropped from the wording: the launch does not take the 未保存入力, and the
    // divergence is acted on where doc-8 §6.4 puts it — 外部変更の検出 and 保存時の更新前競合検出.
    const warning = openNotice(
      pick(ON_MACOS, "vscode"),
      context({ hasUnsavedInput: true }),
    )?.unsavedInput;
    expect(warning).toContain("破棄しません");
    expect(warning).toContain("外部変更");
    expect(warning).toContain("更新前競合検出");
  });
});

describe("継続検出停止の註 (decision-45 §9)", () => {
  it("names the re-read as what will bring the edit back, and is not part of the layer", () => {
    // Drawn by the submenu rather than inside the notice, because the notice can be suppressed and this
    // requirement would then be met only for users who had not suppressed it — which is not met.
    expect(watchStoppedNote()).toContain("継続検出");
    expect(watchStoppedNote()).toContain("このルートを再読込");
    const notice = openNotice(pick(ON_MACOS, "vscode"), context({ watchStopped: true }));
    expect(notice?.frontmatter).not.toContain("継続検出");
    expect(notice?.unsavedInput ?? null).toBe(null);
  });
});

describe("CLI で不能な操作の理由 (doc-11 §8)", () => {
  it("names Atlas's own boundary, and does not send the reader to this route", () => {
    // TASK-192: the route is the same destination for every 不可, so each reason naming it said one
    // thing five times without widening what the reader could do.
    // **Three of those five reasons are gone rather than reworded** (TASK-153): the 最後の 1 件 の
    // 差し控え that References・dependencies・assignee each carried does not exist on v1.50.1, so what
    // is left to hold is the 保存区分 side.
    //
    // **The referent guarded here moved on 2026-08-25** (decision-45). It was the 区画's 見出し, because
    // the route *was* a 区画 of this panel; the route is now the ☰'s 外部で開く, and that line's own name
    // is what a reason must not send the reader to. **Guarding the old heading would now guard
    // 「ファイルパス」, which no reason would name anyway** — the check would pass while holding nothing.
    const entry = (catalog: (typeof CATALOGS)[keyof typeof CATALOGS]) =>
      catalog.shell.externalOpen.label;
    const reasons: string[] = [];
    for (const storageState of ["draft", "completed", "archive"] as const) {
      const availability = editAvailability(taskView({ storageState }), {
        state: "ready",
        version: CONFIRMED_CLI_VERSION,
      });
      expect(availability.state).toBe("unavailable");
      if (availability.state !== "unavailable") {
        return;
      }
      reasons.push(availability.reason);
    }
    expect(reasons).toHaveLength(3);
    for (const reason of reasons) {
      expect(reason).not.toContain(entry(CATALOGS.ja));
    }
    for (const closed of [CATALOGS.en.taskDetail.draftReadOnly, CATALOGS.en.taskDetail.closedReadOnly]) {
      expect(closed).not.toContain(entry(CATALOGS.en));
    }
  });

  it("stays offered for the 保存区分 the CLI cannot edit", () => {
    // doc-8 §6.5 sends draft・completed・archive here, so nothing about the rows may depend on 保存区分
    // or on the CLI probe — neither `externalOpenRows` nor `externalOpenAvailability` takes either, and
    // this is the check that they still do not: every row is offered, and the group with them.
    expect(
      externalOpenRows(ON_MACOS, context()).every((entry) => entry.availability.state === "ready"),
    ).toBe(true);
    expect(externalOpenAvailability(context())).toEqual({ state: "ready" });
  });
});

describe("launchFailureDetail", () => {
  it("reads a stale path as a re-read, not as an editor failure", () => {
    const detail = launchFailureDetail({
      kind: "unknownManagedFile",
      slug: "atlas",
      path: "/roots/p/tasks/task-9 - gone.md",
    });
    expect(detail).toContain("/roots/p/tasks/task-9 - gone.md");
    expect(detail).toContain("選び直して");
  });

  it("names the program a failed spawn tried, and points at the 起動指定 to correct", () => {
    const detail = launchFailureDetail({
      kind: "editorLaunchFailed",
      method: "configured",
      program: "definitely-not-installed",
      reason: { reason: "osRefused" },
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
      // SE_ERR_NOASSOC arrives as its number now; the sentence is this side's (decision-35 §3).
      reason: { reason: "shellExecute", code: 31 },
      detail: "",
    });
    expect(detail).toContain("ShellExecuteW");
    expect(detail).toContain("関連付けられたアプリケーション");
    expect(detail).not.toContain("値（プログラム名とオプション）");
  });

  it("falls back to the boundary's own wording for unrelated failures", () => {
    expect(launchFailureDetail({ kind: "projectNotOpen", slug: "atlas" })).toContain("atlas");
  });
});
