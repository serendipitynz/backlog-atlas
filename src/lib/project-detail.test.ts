import { describe, expect, it } from "vitest";
import {
  ALIAS_EFFECT_NOTES,
  DETAIL_SECTIONS,
  OVERVIEW_READ_ONLY_NOTE,
  SLUG_IMMUTABLE_NOTE,
  UNREGISTER_SCOPE_NOTE,
  aliasSummary,
  movesRoot,
  overviewBlocked,
  rootMoveNote,
  submittedAttributes,
  unregisterBlocked,
} from "./project-detail";
import { aliasKeyEffect, editOf, toUpdateRequest, type EntryEdit } from "./ledger";
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
  it("holds the four 区画 doc-10 §3 puts on this screen, in the doc's order", () => {
    expect(DETAIL_SECTIONS.map((section) => section.id)).toEqual([
      "overview",
      "documents",
      "milestones",
      "newTask",
    ]);
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

  it("writes the remote re-detection as the request it is, not as a value", () => {
    const base = registered({ git_remote_present: false });
    const attributes = submittedFor(base, edited(base, { redetectGitRemote: true }));
    expect(attributes).toEqual([
      {
        attribute: "git_remote_present",
        from: "なし",
        to: "プロジェクトルートに対して再判定する",
      },
    ]);
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
    expect(ALIAS_EFFECT_NOTES.undeclared.note).toContain("台帳からは削除しません");
  });
});

// --- 登録解除 (doc-10 §4.3) ---------------------------------------------------------------------

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
    expect(UNREGISTER_SCOPE_NOTE).toContain("正本はそのまま残ります");
  });
});
