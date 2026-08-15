import { describe, expect, it } from "vitest";
import {
  ALIAS_EFFECT_NOTES,
  DETAIL_SECTIONS,
  sectionCount,
  OVERVIEW_INPUT_PROBLEMS_REASON,
  OVERVIEW_NO_CHANGES_REASON,
  OVERVIEW_READ_ONLY_NOTE,
  SLUG_IMMUTABLE_NOTE,
  UNREGISTER_SCOPE_NOTE,
  aliasSummary,
  displayPath,
  gitRemoteDisagreement,
  gitRemoteLine,
  movesRoot,
  overviewBlocked,
  overviewSave,
  redetectControl,
  rootMoveNote,
  submittedAttributes,
  unregisterBlocked,
  type OverviewSave,
} from "./project-detail";
import { omitsSentence } from "./manage";
import { aliasKeyEffect, editOf, editProblems, toUpdateRequest, type EntryEdit } from "./ledger";
import { entry } from "./fixtures";
import type { ProjectEntry } from "./wire";

function registered(overrides: Partial<ProjectEntry> = {}): ProjectEntry {
  return { ...entry("atlas"), ...overrides };
}

function edited(base: ProjectEntry, overrides: Partial<EntryEdit> = {}): EntryEdit {
  return { ...editOf(base), ...overrides };
}

/** The 送信属性一覧 is built from the request, so the tests look at it through one as well. */
function submittedFor(base: ProjectEntry, edit: EntryEdit) {
  const request = toUpdateRequest(base, edit);
  return request === null ? [] : submittedAttributes(base, request);
}

// --- 区画切替 (doc-10 §1/§3) -------------------------------------------------------------------

describe("区画切替", () => {
  it("holds the five 区画 doc-10 §3 puts on this screen, in the doc's order", () => {
    expect(DETAIL_SECTIONS.map((section) => section.id)).toEqual([
      "overview",
      "documents",
      "milestones",
      "decisions",
      "newTask",
    ]);
  });

  // 決定事項 was appended rather than placed beside 文書 (doc-10 §10, TASK-118). Asserting the
  // relative order of the four that design 07 fixes states what the placement rule protects: an
  // item added later must leave every pair of them where 07 put them (doc-12 §8).
  it("leaves design 07's four in the relative order 07 gave them", () => {
    const ids = DETAIL_SECTIONS.map((section) => section.id);
    expect(ids.filter((id) => id !== "decisions")).toEqual([
      "overview",
      "documents",
      "milestones",
      "newTask",
    ]);
  });

  it("labels 決定事項 with the 画面に出る語, not doc-4 §1's 意思決定", () => {
    const decisions = DETAIL_SECTIONS.find((section) => section.id === "decisions");
    expect(decisions?.label).toBe("決定事項");
  });
});

// --- 区画ナビの件数 (doc-10 §1, TASK-118) ------------------------------------------------------

describe("区画ナビの件数", () => {
  const project = { documents: [1, 2, 3], milestones: [1], decisions: [1, 2] };

  it("counts each 区画's own 一覧列", () => {
    expect(sectionCount("documents", project)).toBe(3);
    expect(sectionCount("milestones", project)).toBe(1);
    expect(sectionCount("decisions", project)).toBe(2);
  });

  // `null` と 0 を分けるのがこの関数の仕事である。同じに畳むと、一覧を持たない区画が「空の一覧」に
  // 見え、doc-11 §6 が正常な不在について禁じている型を括弧の側で作ることになる。
  it("has nothing to count for the two 区画 that hold no 一覧列", () => {
    expect(sectionCount("overview", project)).toBeNull();
    expect(sectionCount("newTask", project)).toBeNull();
  });

  it("keeps 0 件 tellable from 数える対象が無い", () => {
    expect(sectionCount("decisions", { documents: [], milestones: [], decisions: [] })).toBe(0);
    expect(sectionCount("overview", { documents: [], milestones: [], decisions: [] })).toBeNull();
  });

  // 読み取りが済むまでは件数が無い。0 を返すと、読めていないことと空であることが同じ絵になる。
  it("has no count before the root has been read", () => {
    for (const section of DETAIL_SECTIONS) {
      expect([section.id, sectionCount(section.id, null)]).toEqual([section.id, null]);
    }
  });
});

// --- 2 本の帯 (doc-10 §3/§8) -------------------------------------------------------------------
//
// The 帯 themselves are ② and ③ of the screen-common 上部帯 stack, so their text and their
// independence are `band.test.ts`'s (doc-11 §4). What stays here is the per-操作 reason this screen
// shows beside its controls, which is where the full text lives once the band is 縮約 to one line.

describe("台帳読取専用の及ぶ範囲", () => {
  it("stops the ledger edits on a read-only ledger and nothing else (doc-10 §8)", () => {
    expect(overviewBlocked({ readOnly: true, busy: false })).toContain("読み取り専用");
    expect(overviewBlocked({ readOnly: false, busy: true })).toContain("実行中");
    expect(overviewBlocked({ readOnly: false, busy: false })).toBeNull();
  });

  it("says the read-only state reaches the inputs, not only the save (review [P2])", () => {
    // doc-10 §8 asks for both the inputs and 登録解除 to be disabled. With only the save held back,
    // the user could edit values that can never be written, that input would count as 未保存入力,
    // and they would later be asked whether to discard changes that were never saveable.
    expect(OVERVIEW_READ_ONLY_NOTE).toContain("入力");
    expect(OVERVIEW_READ_ONLY_NOTE).toContain("登録解除");
    // And the same sentence says the stop reaches this 区画 only (doc-10 §3's independence).
    expect(OVERVIEW_READ_ONLY_NOTE).toContain("文書・マイルストーン・新規タスク");
  });
});

// --- 送信属性一覧 (doc-10 §4.1) ----------------------------------------------------------------

describe("送信属性一覧", () => {
  it("lists nothing when the form matches the ledger — 変更なし is an empty list", () => {
    const base = registered();
    expect(submittedFor(base, edited(base))).toEqual([]);
  });

  it("names both roots on a move, because that is what the request actually carries", () => {
    // A move sends both roots (doc-3 §4.3). Built from the request rather than from what the screen
    // thinks it changed, so `backlog_root` appears here even untouched — that what travels is what
    // is listed is the whole point of this list.
    const base = registered();
    const attributes = submittedFor(base, edited(base, { projectRoot: "/moved/atlas" }));
    expect(attributes.map((attribute) => attribute.attribute)).toEqual([
      "project_root",
      "backlog_root",
    ]);
    expect(attributes[0]).toEqual({
      attribute: "project_root",
      from: "/repos/atlas",
      to: "/moved/atlas",
    });
  });

  it("never lists git_remote_present — the re-detection does not travel on a save (doc-10 §4.1)", () => {
    // The list is built from the request, so a request carrying the flag is the case to check: even
    // then the attribute is absent, because 再検出 issues on its own and is not what 保存 sends.
    const base = registered({ git_remote_present: false });
    const attributes = submittedAttributes(base, {
      slug: base.slug,
      redetect_git_remote: true,
      backlog_root: "/moved/bl",
    });
    expect(attributes.map((attribute) => attribute.attribute)).toEqual(["backlog_root"]);
  });

  it("shows the 別名表 on both sides, with an empty table spelled out", () => {
    const base = registered({ status_aliases: { Doing: "In Progress" } });
    const attributes = submittedFor(base, edited(base, { aliases: [] }));
    expect(attributes).toEqual([
      { attribute: "status_aliases", from: "Doing → In Progress", to: "なし" },
    ]);
  });

  it("keeps an empty table readable rather than blank", () => {
    // As "" the value column would disappear and the diff would stop being readable.
    expect(aliasSummary(undefined)).toBe("なし");
    expect(aliasSummary({})).toBe("なし");
    expect(aliasSummary({ Review: "In Review", Doing: "In Progress" })).toBe(
      "Doing → In Progress / Review → In Review",
    );
  });
});

// --- remote 現在値と再検出 (doc-10 §4.1, decision-6) --------------------------------------------

describe("remote 現在値", () => {
  it("shows the address, and names which remote it came from", () => {
    const line = gitRemoteLine({
      state: "configured",
      name: "origin",
      url: "git@github.com:serendipitynz/backlog-atlas.git",
    });
    expect(line).toEqual({
      text: "git@github.com:serendipitynz/backlog-atlas.git",
      kind: "neutral",
      name: "origin",
      address: true,
    });
  });

  it("keeps 未取得, remote 不在, 対象不在 and a failed read as four different lines (decision-6)", () => {
    // The whole point of the four states: the user's next action differs, so one empty line for all
    // of them would be the collapse decision-6 was written against.
    const texts = [
      gitRemoteLine(null),
      gitRemoteLine({ state: "remoteAbsent" }),
      gitRemoteLine({ state: "noRepository" }),
      gitRemoteLine({ state: "unreadable", reason: { reason: "gitFailed" }, detail: "git is unavailable" }),
    ];
    expect(new Set(texts.map((line) => line.text)).size).toBe(4);
    expect(texts.map((line) => line.kind)).toEqual(["neutral", "setting", "setting", "failure"]);
    // Only the address is set in code type — a sentence about an absence is not an address.
    expect(texts.every((line) => !line.address)).toBe(true);
    expect(texts[3].text).toContain("git is unavailable");
  });
});

describe("記録と検出の食い違い", () => {
  const configured = {
    state: "configured",
    name: "origin",
    url: "git@github.com:o/r.git",
  } as const;

  it("says nothing while the ledger and the current read agree", () => {
    expect(gitRemoteDisagreement(registered({ git_remote_present: true }), configured)).toBeNull();
    expect(
      gitRemoteDisagreement(registered({ git_remote_present: false }), { state: "remoteAbsent" }),
    ).toBeNull();
  });

  it("names the recorded value in both directions of disagreement", () => {
    expect(gitRemoteDisagreement(registered({ git_remote_present: false }), configured)).toContain(
      "「なし」",
    );
    expect(
      gitRemoteDisagreement(registered({ git_remote_present: true }), { state: "noRepository" }),
    ).toContain("「あり」");
  });

  it("claims no disagreement from a read that failed or has not landed", () => {
    // An unreadable read says nothing about whether a remote exists, so reporting a disagreement
    // from it would state a fact nobody observed.
    const recorded = registered({ git_remote_present: true });
    expect(gitRemoteDisagreement(recorded, { state: "unreadable", reason: { reason: "gitFailed" }, detail: "x" })).toBeNull();
    expect(gitRemoteDisagreement(recorded, null)).toBeNull();
  });
});

describe("再検出の控え", () => {
  const control = (overrides: { readOnly?: boolean; busy?: boolean; running?: boolean } = {}) =>
    redetectControl({ readOnly: false, busy: false, running: false, ...overrides });

  it("is held by a read-only ledger, and says so about this operation", () => {
    const shown = control({ readOnly: true });
    expect(shown.state).toBe("withheld");
    expect(shown.state === "withheld" && shown.reason).toContain("読み取り専用");
    expect(shown.state === "withheld" && shown.reason).toContain("再検出");
  });

  it("is held while another ledger write is in flight, and free otherwise", () => {
    const busy = control({ busy: true });
    expect(busy.state === "withheld" && busy.reason).toBe(
      overviewBlocked({ readOnly: false, busy: true }),
    );
    expect(control().state).toBe("ready");
  });

  it("says it is running rather than blaming the write it started itself", () => {
    // 2026-08-08 の目視: pressing it raised the generic「台帳の更新を実行中です」line under the
    // control, so every press grew and dropped a paragraph. The running state carries no reason to
    // put there — its own label is what says what is happening.
    const running = control({ busy: true, running: true });
    expect(running.state).toBe("running");
    expect(running.label).not.toBe(control().label);
    expect(running).not.toHaveProperty("reason");
  });

  it("still refuses to be pressed while running, read-only or busy", () => {
    for (const shown of [control({ running: true }), control({ readOnly: true }), control({ busy: true })]) {
      expect(shown.state).not.toBe("ready");
    }
  });
});

// --- 保存の保留判定 (doc-10 §4.1, TASK-127) -----------------------------------------------------
//
// 保留判定 (whether 保存 is withheld) is the `state` field and 保留理由 is a field beside it, so the
// two cannot be removed as one. They were one value until TASK-127 — a `string | null` whose non-null
// half *was* the 保留判定 — and the 目視 pass over screen prose (`8aa4be9`) replaced two 理由文 with
// `null`, taking both obstacles with them: 保存 became pressable with nothing to send, against
// doc-10 §4.1. These tests are what that pass would have had to break to land.

describe("保存の保留判定", () => {
  const base = registered();
  const control = (
    edit: EntryEdit,
    context: { readOnly?: boolean; busy?: boolean } = {},
  ): OverviewSave =>
    overviewSave({
      readOnly: false,
      busy: false,
      hasProblems: editProblems(edit).length > 0,
      hasChanges: toUpdateRequest(base, edit) !== null,
      ...context,
    });

  it("withholds 保存 while there is nothing to send (doc-10 §4.1)", () => {
    const shown = control(edited(base));
    expect(shown.state).toBe("withheld");
    expect(shown.state === "withheld" && shown.reason).toBe(OVERVIEW_NO_CHANGES_REASON);
  });

  it("withholds 保存 while the input has a problem, before it looks at what changed", () => {
    // Both obstacles stand at once here — an empty root is a problem *and* a change — and the
    // problem is what the reason names: sending is not the next move, fixing the field is.
    const shown = control(edited(base, { projectRoot: "" }));
    expect(shown.state).toBe("withheld");
    expect(shown.state === "withheld" && shown.reason).toBe(OVERVIEW_INPUT_PROBLEMS_REASON);
  });

  it("is ready only when a sound form has something to send", () => {
    expect(control(edited(base, { backlogRoot: "/repos/atlas/bl" })).state).toBe("ready");
  });

  it("puts the obstacles outside the form first, and states them as the 区画 does", () => {
    const changed = edited(base, { backlogRoot: "/repos/atlas/bl" });
    for (const context of [{ readOnly: true }, { busy: true }]) {
      const shown = control(changed, context);
      expect(shown.state).toBe("withheld");
      expect(shown.state === "withheld" && shown.reason).toBe(
        overviewBlocked({ readOnly: false, busy: false, ...context }),
      );
    }
  });

  it("never withholds 保存 without a reason to go with it (doc-11 §5)", () => {
    // The guarantee in the other direction, which is why the two are one *value* even though they
    // are two fields: a 保留判定 computed apart from its reason is how a 理由の無い無効化 gets in.
    const withheld = [
      control(edited(base)),
      control(edited(base, { projectRoot: "" })),
      control(edited(base), { readOnly: true }),
      control(edited(base), { busy: true }),
    ];
    for (const shown of withheld) {
      expect(shown.state).toBe("withheld");
      expect(shown.state === "withheld" && shown.reason.length).toBeGreaterThan(0);
    }
  });

  it("leaves the two reasons the 区画 itself states off the screen (doc-11 §8 の licence ①)", () => {
    // 入力に問題があるとき is printed under each field it is about, and 変更が無いとき is what the
    // 送信属性一覧 directly above the control says. Printing either again under 保存 would state one
    // situation twice within the same 区画.
    expect(omitsSentence(OVERVIEW_NO_CHANGES_REASON)).toBe(true);
    expect(omitsSentence(OVERVIEW_INPUT_PROBLEMS_REASON)).toBe(true);
    // The obstacles from outside the form are on neither licence and keep their printed line.
    expect(omitsSentence(overviewBlocked({ readOnly: true, busy: false }) ?? "")).toBe(false);
    expect(omitsSentence(overviewBlocked({ readOnly: false, busy: true }) ?? "")).toBe(false);
  });
});

// --- 移動の断り・slug 不変 (doc-10 §4.1) --------------------------------------------------------

describe("ルート移動の断り", () => {
  it("says nothing until the project root actually differs", () => {
    const base = registered();
    expect(rootMoveNote(base, edited(base))).toBeNull();
    expect(rootMoveNote(base, edited(base, { backlogRoot: "/repos/atlas/bl" }))).toBeNull();
  });

  it("names the value in the field, not the default it would otherwise take", () => {
    // doc-10 §4.1: the default would be <new root>/backlog, but what travels is the field's value.
    const base = registered();
    const note = rootMoveNote(base, edited(base, { projectRoot: "/moved/atlas" }));
    expect(note).toContain("/repos/atlas/backlog");
    expect(note).toContain("編集セッションは閉じます");
    expect(note).toContain("atlas");
  });

  it("explains what changing the slug would cost, instead of offering a disabled field", () => {
    expect(SLUG_IMMUTABLE_NOTE).toContain("登録を解除して登録し直す");
    expect(SLUG_IMMUTABLE_NOTE).toContain("同一性は切れます");
  });
});

// --- 移動の検出 (doc-10 §4.1: a move closes the open 編集セッション) ---------------------------

describe("移動かどうかの判定", () => {
  const base = registered();

  it("counts either root, since a backlog_root change also moves what is read", () => {
    expect(movesRoot({ slug: "atlas", project_root: "/moved/atlas" })).toBe(true);
    expect(movesRoot({ slug: "atlas", backlog_root: "/repos/atlas/bl" })).toBe(true);
  });

  it("does not count a change that leaves the roots alone", () => {
    // A 別名表 edit or a remote re-detection changes the interpretation or an attribute, not what is
    // read. Counting either as a move would close a session that need not close, throwing away
    // 未保存入力.
    expect(movesRoot({ slug: "atlas", status_aliases: { Doing: "In Progress" } })).toBe(false);
    expect(movesRoot({ slug: "atlas", redetect_git_remote: true })).toBe(false);
    expect(movesRoot({ slug: "atlas", new_index: 2 })).toBe(false);
  });

  it("sees the move in the request a project-root edit actually produces (review [P1])", () => {
    // A move's request carries both roots. Without closing the open 文書編集セッション, a body read
    // from the old root could be sent to the new one by document id alone; with the same id present
    // there, the 照合 passes against the new root, and `--content` replaces it whole.
    const request = toUpdateRequest(base, edited(base, { projectRoot: "/moved/atlas" }));
    expect(request).not.toBeNull();
    expect(movesRoot(request!)).toBe(true);
  });

  it("leaves an alias-only save out of it, so its editing session survives", () => {
    const request = toUpdateRequest(
      base,
      edited(base, { aliases: [{ key: "Doing", value: "In Progress" }] }),
    );
    expect(request).not.toBeNull();
    expect(movesRoot(request!)).toBe(false);
  });
});

// --- status 別名表の効き方 (doc-10 §4.2) --------------------------------------------------------

describe("別名が効くかの提示", () => {
  it("covers every state `aliasKeyEffect` can return", () => {
    // The implementation has four states, so four are shown; doc-10 §4.2 was revised to match.
    const declared = ["To Do", "In Progress"];
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("To Do", declared)].label).toBe("宣言あり");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Draft", declared)].label).toBe("draft 専用");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Doing", declared)].label).toBe("宣言なし → 効果なし");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Doing", [])].label).toBe("宣言集合なし");
  });

  it("marks only the one state where the alias changes nothing", () => {
    // Under `NoDeclaredSet` the alias applies — `map_status` does not cut the column mapping — so
    // giving it the ineffective mark would tell the user to fix something that is not broken.
    expect(ALIAS_EFFECT_NOTES.undeclared.ineffective).toBe(true);
    expect(ALIAS_EFFECT_NOTES.noDeclaredSet.ineffective).toBe(false);
    expect(ALIAS_EFFECT_NOTES.declared.ineffective).toBe(false);
    expect(ALIAS_EFFECT_NOTES.draft.ineffective).toBe(false);
  });

  it("says the ineffective alias is kept in the ledger, not dropped (doc-3 §3.3, TASK-42)", () => {
    expect(ALIAS_EFFECT_NOTES.undeclared.note).toContain("未分類区画");
    expect(ALIAS_EFFECT_NOTES.undeclared.note).toContain("登録内容からは削除しません");
  });
});

// --- 登録解除 (doc-10 §4.3) ---------------------------------------------------------------------

describe("表示パス", () => {
  it("makes source_path project-relative for the pane heading", () => {
    expect(displayPath("/repos/atlas/backlog/docs/doc-1 - a.md", "/repos/atlas")).toBe(
      "backlog/docs/doc-1 - a.md",
    );
    // A trailing separator on the root names the same root.
    expect(displayPath("/repos/atlas/backlog/docs/doc-1 - a.md", "/repos/atlas/")).toBe(
      "backlog/docs/doc-1 - a.md",
    );
  });

  it("keeps the Windows separator working, since source_path comes from the OS that scanned", () => {
    expect(displayPath("C:\\repos\\atlas\\backlog\\docs\\doc-1.md", "C:\\repos\\atlas")).toBe(
      "backlog\\docs\\doc-1.md",
    );
  });

  it("shows a path not under the root as read, rather than guessing", () => {
    // `/repos/atlas-two` must not be shortened by the `/repos/atlas` root: the prefix check is on
    // whole path segments, so a sibling directory sharing the spelling stays absolute.
    expect(displayPath("/repos/atlas-two/backlog/docs/doc-1.md", "/repos/atlas")).toBe(
      "/repos/atlas-two/backlog/docs/doc-1.md",
    );
  });
});

describe("登録解除", () => {
  const open = { readOnly: false, busy: false };

  it("holds the action until the typed text is the slug", () => {
    expect(unregisterBlocked("", "atlas", open)).toContain("atlas");
    expect(unregisterBlocked("atla", "atlas", open)).not.toBeNull();
    expect(unregisterBlocked("atlas", "atlas", open)).toBeNull();
  });

  it("forgives surrounding space but not a different spelling", () => {
    // Refusing over whitespace that came along with a paste confirms nothing. A slug is lowercase
    // letters, digits and hyphens only (doc-3 §3.1), so a case difference is a typo.
    expect(unregisterBlocked("  atlas ", "atlas", open)).toBeNull();
    expect(unregisterBlocked("Atlas", "atlas", open)).not.toBeNull();
  });

  it("puts the ledger's own state ahead of the confirmation", () => {
    // A matching slug still cannot act on a ledger that cannot be written, so that reason is read
    // first.
    expect(unregisterBlocked("atlas", "atlas", { readOnly: true, busy: false })).toContain(
      "読み取り専用",
    );
    expect(unregisterBlocked("atlas", "atlas", { readOnly: false, busy: true })).toContain("実行中");
  });

  it("states what is not deleted, which is what makes the button safe to press", () => {
    expect(UNREGISTER_SCOPE_NOTE).toContain("触れません");
    expect(UNREGISTER_SCOPE_NOTE).toContain("タスクはそのまま残ります");
  });
});
