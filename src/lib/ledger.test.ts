import { describe, expect, it } from "vitest";
import {
  aliasKeyEffect,
  aliasProblems,
  aliasTable,
  editOf,
  hasRegisterInput,
  isAbsolutePath,
  isValidSlug,
  moveTarget,
  parentPath,
  refusalReport,
  registerProblems,
  resolvedBacklogRoot,
  toRegisterRequest,
  toUpdateRequest,
  type AliasRow,
  type RegisterInput,
} from "./ledger";
import { entry } from "./fixtures";
import type { CommandError, LedgerRefusal } from "./wire";

function input(overrides: Partial<RegisterInput> = {}): RegisterInput {
  return {
    projectRoot: "/repos/geomyth",
    backlogRoot: "",
    slug: "",
    ...overrides,
  };
}

function refused(reason: LedgerRefusal): CommandError {
  return { kind: "ledgerRefused", reason, detail: "the boundary's own sentence" };
}

// --- slug の規則 (doc-3 §3.1, AC #6) --------------------------------------------------------

describe("isValidSlug", () => {
  it("accepts the grammar doc-3 §3.1 fixes and rejects the separators it forbids", () => {
    expect(isValidSlug("geomyth")).toBe(true);
    expect(isValidSlug("backlog-atlas")).toBe(true);
    expect(isValidSlug("9lives")).toBe(true);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    // `:` and whitespace are what make the cross-task-id split unique (doc-3 §5.2).
    expect(isValidSlug("has:colon")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
  });
});

describe("isAbsolutePath", () => {
  it("accepts both platforms' spellings so a host-valid path is never blocked here", () => {
    expect(isAbsolutePath("/repos/geomyth")).toBe(true);
    expect(isAbsolutePath("C:\\repos\\geomyth")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("repos/geomyth")).toBe(false);
    expect(isAbsolutePath("./geomyth")).toBe(false);
    expect(isAbsolutePath("")).toBe(false);
  });
});

describe("parentPath", () => {
  it("names the directory above, so picking a Backlog root can prefill the project root", () => {
    expect(parentPath("/repos/geomyth/backlog")).toBe("/repos/geomyth");
    expect(parentPath("/repos/geomyth/backlog/")).toBe("/repos/geomyth");
    expect(parentPath("C:\\repos\\geomyth\\backlog")).toBe("C:\\repos\\geomyth");
    // A root has no parent to offer, and neither has a bare name.
    expect(parentPath("/")).toBe(null);
    expect(parentPath("geomyth")).toBe(null);
  });
});

// --- 登録 (doc-3 §4.1, AC #1/#5/#6) --------------------------------------------------------

describe("resolvedBacklogRoot", () => {
  it("shows the default the ledger would apply, and the explicit value when given", () => {
    expect(resolvedBacklogRoot(input())).toBe("/repos/geomyth/backlog");
    expect(resolvedBacklogRoot(input({ backlogRoot: "/elsewhere/bl" }))).toBe("/elsewhere/bl");
    // A Windows project root keeps its separator rather than gaining a POSIX one.
    expect(resolvedBacklogRoot(input({ projectRoot: "C:\\repos\\geomyth" }))).toBe(
      "C:\\repos\\geomyth\\backlog",
    );
    expect(resolvedBacklogRoot(input({ projectRoot: "" }))).toBe("");
  });
});

describe("registerProblems", () => {
  it("passes a bare project root: the ledger derives the rest (doc-3 §3.1/§4.1)", () => {
    expect(registerProblems(input(), ["atlas"])).toEqual([]);
  });

  it("requires a project root, as an absolute path", () => {
    expect(registerProblems(input({ projectRoot: "" }), []).map((p) => p.field)).toEqual([
      "projectRoot",
    ]);
    expect(registerProblems(input({ projectRoot: "repos/geomyth" }), []).map((p) => p.field)).toEqual(
      ["projectRoot"],
    );
  });

  it("reports an invalid slug against the field the user recovers in (AC #6)", () => {
    const problems = registerProblems(input({ slug: "Bad Slug" }), []);
    expect(problems.map((p) => p.field)).toEqual(["slug"]);
    expect(problems[0].message).toContain("Bad Slug");
  });

  it("reports a slug already in view as taken, before the round-trip (AC #6)", () => {
    const problems = registerProblems(input({ slug: "atlas" }), ["atlas", "geomyth"]);
    expect(problems).toEqual([
      {
        field: "slug",
        message: "slug atlas は既に登録済みです。別の slug を指定してください。",
      },
    ]);
  });
});

describe("toRegisterRequest", () => {
  it("omits the optional fields it was not given, so the ledger's defaults apply", () => {
    expect(toRegisterRequest(input())).toEqual({ project_root: "/repos/geomyth" });
  });

  it("sends an explicit Backlog root and slug, trimmed", () => {
    expect(
      toRegisterRequest({
        projectRoot: " /repos/geomyth ",
        backlogRoot: " /elsewhere/bl ",
        slug: " geo ",
      }),
    ).toEqual({
      project_root: "/repos/geomyth",
      backlog_root: "/elsewhere/bl",
      slug: "geo",
    });
  });
});

// --- 未保存入力 (doc-8 §6.3 の語を doc-11 §7 のモーダルへ, TASK-86) --------------------------

describe("hasRegisterInput", () => {
  it("counts any of the three fields, so an optional one typed alone is still input", () => {
    expect(hasRegisterInput({ projectRoot: "", backlogRoot: "", slug: "" })).toBe(false);
    expect(hasRegisterInput({ projectRoot: "/repos/geomyth", backlogRoot: "", slug: "" })).toBe(true);
    // 登録 is refused without a project root, so these two can only ever be input that was *not*
    // issued — exactly what a 破棄前確認 is for.
    expect(hasRegisterInput({ projectRoot: "", backlogRoot: "/elsewhere/bl", slug: "" })).toBe(true);
    expect(hasRegisterInput({ projectRoot: "", backlogRoot: "", slug: "geo" })).toBe(true);
  });

  it("does not count whitespace, which could not have been submitted either", () => {
    // `toRegisterRequest` trims, so a field holding spaces alone reaches the ledger as nothing;
    // asking whether to discard it would be asking about a value that never existed.
    expect(hasRegisterInput({ projectRoot: "  ", backlogRoot: "\t", slug: " " })).toBe(false);
  });
});

// --- 更新 (doc-3 §4.3, AC #3) --------------------------------------------------------------

describe("toUpdateRequest", () => {
  it("returns null when nothing changed, so an unchanged form writes no ledger", () => {
    const target = entry("geomyth");
    expect(toUpdateRequest(target, editOf(target))).toBe(null);
  });

  it("keeps an alias-only edit alias-only: the roots are absent, so it is not a move", () => {
    const target = entry("geomyth");
    const edit = editOf(target);
    edit.aliases = [{ key: "Doing", value: "In Progress" }];
    expect(toUpdateRequest(target, edit)).toEqual({
      slug: "geomyth",
      status_aliases: { Doing: "In Progress" },
    });
  });

  it("clears the 別名表 with an empty table rather than by omitting it (doc-3 §3.3)", () => {
    const target = { ...entry("geomyth"), status_aliases: { Doing: "In Progress" } };
    const edit = editOf(target);
    edit.aliases = [];
    expect(toUpdateRequest(target, edit)).toEqual({ slug: "geomyth", status_aliases: {} });
  });

  it("sends both roots on a move, so what is stored is what the form showed (doc-3 §4.3)", () => {
    const target = entry("geomyth");
    const edit = editOf(target);
    edit.projectRoot = "/moved/geomyth";
    edit.backlogRoot = "/moved/geomyth/backlog";
    expect(toUpdateRequest(target, edit)).toEqual({
      slug: "geomyth",
      project_root: "/moved/geomyth",
      backlog_root: "/moved/geomyth/backlog",
    });
  });

  it("sends only the Backlog root when the project root did not move", () => {
    const target = entry("geomyth");
    const edit = editOf(target);
    edit.backlogRoot = "/repos/geomyth/docs/backlog";
    expect(toUpdateRequest(target, edit)).toEqual({
      slug: "geomyth",
      backlog_root: "/repos/geomyth/docs/backlog",
    });
  });

  it("has no way to put the git remote re-detection on a save (doc-10 §4.1)", () => {
    // Since TASK-124 the re-detection is its own control that issues on press, so the form holds
    // nothing for it. Asserted rather than left to the type: what makes 再検出 an independent
    // operation is precisely that no edit of this form can produce `redetect_git_remote`.
    const target = entry("geomyth", false);
    const edit = editOf(target);
    edit.backlogRoot = "/moved/bl";
    const request = toUpdateRequest(target, edit);
    expect(request).not.toHaveProperty("redetect_git_remote");
    expect(toUpdateRequest(target, editOf(target))).toBeNull();
  });

  it("never carries the slug as a change — it selects the entry and stays immutable", () => {
    const target = entry("geomyth");
    const edit = editOf(target);
    edit.backlogRoot = "/moved/bl";
    const request = toUpdateRequest(target, edit);
    expect(request?.slug).toBe("geomyth");
    expect(Object.keys(request ?? {}).filter((key) => key !== "slug")).toEqual(["backlog_root"]);
  });
});

// --- status 別名表 (doc-3 §3.3, decision-4) -------------------------------------------------

describe("aliasTable", () => {
  it("drops half-filled rows and trims, so an unfinished row is not a table entry", () => {
    const rows: AliasRow[] = [
      { key: " Doing ", value: " In Progress " },
      { key: "Half", value: "" },
      { key: "", value: "Done" },
    ];
    expect(aliasTable(rows)).toEqual({ Doing: "In Progress" });
  });
});

describe("aliasProblems", () => {
  it("accepts canonical targets and ignores an entirely blank row", () => {
    expect(
      aliasProblems([
        { key: "Doing", value: "In Progress" },
        { key: "", value: "" },
      ]),
    ).toEqual([]);
  });

  it("rejects a non-canonical target (doc-3 §3.3: the four columns are fixed)", () => {
    const problems = aliasProblems([{ key: "Doing", value: "Nonsense" }]);
    expect(problems.map((p) => p.field)).toEqual(["aliases"]);
    expect(problems[0].message).toContain("Nonsense");
  });

  it("reports keys that 名称一致 makes one status, which would silently lose one row", () => {
    const problems = aliasProblems([
      { key: "Doing", value: "In Progress" },
      { key: " doing ", value: "Done" },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("重複");
  });

  it("reports a target with no status name to apply to", () => {
    expect(aliasProblems([{ key: "", value: "Done" }])).toEqual([
      { field: "aliases", message: "別名表に status 名の無い行があります。" },
    ]);
  });
});

describe("aliasKeyEffect", () => {
  const declared = ["To Do", "Doing", "Done"];

  it("separates a declared status from one declared nowhere (decision-4)", () => {
    expect(aliasKeyEffect("Doing", declared)).toBe("declared");
    expect(aliasKeyEffect(" doing ", declared)).toBe("declared");
    // An alias for a status config.yml does not declare leaves the task 未分類 regardless.
    expect(aliasKeyEffect("Ongoing", declared)).toBe("undeclared");
  });

  it("knows the draft-only status and an unconfigured root", () => {
    expect(aliasKeyEffect("Draft", declared)).toBe("draft");
    expect(aliasKeyEffect("Anything", [])).toBe("noDeclaredSet");
  });
});

// --- 表示上の並び順 (doc-3 §4.3) -----------------------------------------------------------

describe("moveTarget", () => {
  const order = ["a", "b", "c"];

  it("steps one position, and stops at each end", () => {
    expect(moveTarget(order, "b", -1)).toBe(0);
    expect(moveTarget(order, "b", 1)).toBe(2);
    expect(moveTarget(order, "a", -1)).toBe(null);
    expect(moveTarget(order, "c", 1)).toBe(null);
    expect(moveTarget(order, "missing", 1)).toBe(null);
  });
});

// --- 拒否の理由と回復先 (doc-3 §4.1/§3.1, AC #5/#6) ----------------------------------------

describe("refusalReport", () => {
  it("sends a slug collision back to the slug field with the taken slug named (AC #6)", () => {
    const report = refusalReport(refused({ reason: "duplicateSlug", slug: "geomyth" }));
    expect(report.field).toBe("slug");
    expect(report.message).toContain("geomyth");
    expect(report.message).toContain("別の slug");
  });

  it("sends an unreadable Backlog root back to that field, naming what it lacks (AC #5)", () => {
    const report = refusalReport(
      refused({ reason: "backlogRootInvalid", path: "/repos/geomyth/backlog" }),
    );
    expect(report.field).toBe("backlogRoot");
    expect(report.message).toContain("/repos/geomyth/backlog");
    expect(report.message).toContain("config.yml");
  });

  it("states the slug grammar for an invalid slug, derived or given (AC #6)", () => {
    const report = refusalReport(refused({ reason: "invalidSlug", slug: "Bad Slug" }));
    expect(report.field).toBe("slug");
    expect(report.message).toContain("英小文字");
  });

  it("names the entry that already holds a duplicated root (doc-3 §3/§6)", () => {
    const report = refusalReport(refused({ reason: "duplicateRoot", slug: "atlas" }));
    expect(report.field).toBe("projectRoot");
    expect(report.message).toContain("atlas");
  });

  it("offers no field for a read-only ledger: no edit gets past it (doc-3 §2.2)", () => {
    const report = refusalReport(refused({ reason: "readOnly", schema_version: 999 }));
    expect(report.field).toBe(null);
    expect(report.message).toContain("999");
  });

  it("points an invalid alias at the 別名表 and lists the four targets (doc-3 §3.3)", () => {
    const report = refusalReport(
      refused({ reason: "invalidStatusAlias", key: "Weird", value: "Nonsense" }),
    );
    expect(report.field).toBe("aliases");
    expect(report.message).toContain("In Review");
  });

  it("passes an untyped ledger failure through with no field to correct", () => {
    const report = refusalReport({ kind: "ledger", detail: "disk gone" });
    expect(report.field).toBe(null);
    expect(report.message).toContain("disk gone");
  });

  it("does not read a non-ledger failure as a refusal", () => {
    const report = refusalReport({ kind: "unknownProject", slug: "geomyth" });
    expect(report.field).toBe(null);
  });
});
