import { describe, expect, it } from "vitest";
import {
  ALIAS_EFFECT_NOTES,
  DETAIL_SECTIONS,
  LEDGER_READ_ONLY_BAND,
  OVERVIEW_READ_ONLY_NOTE,
  SLUG_IMMUTABLE_NOTE,
  UNREGISTER_SCOPE_NOTE,
  aliasSummary,
  cliDegradedBand,
  movesRoot,
  overviewBlocked,
  rootMoveNote,
  submittedAttributes,
  unregisterBlocked,
} from "./project-detail";
import { aliasKeyEffect, editOf, toUpdateRequest, type EntryEdit } from "./ledger";
import { entry } from "./fixtures";
import type { CliReadiness, ProjectEntry } from "./wire";

function registered(overrides: Partial<ProjectEntry> = {}): ProjectEntry {
  return { ...entry("atlas"), ...overrides };
}

function edited(base: ProjectEntry, overrides: Partial<EntryEdit> = {}): EntryEdit {
  return { ...editOf(base), ...overrides };
}

/** 送信属性一覧は要求値から作るので、テストも「フォームからの要求値」を通して見る。 */
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

describe("台帳読取専用帯と CLI 縮退帯", () => {
  it("keeps the two bands independent, each naming the 区画 it does not reach", () => {
    // doc-10 §3: 台帳読取専用は Atlas が書く先の問題、CLI 縮退は Backlog CLI が使えない問題で、
    // 片方だけが立つ。並んで立ったときに「全部だめになった」と読まれてはならない。
    expect(LEDGER_READ_ONLY_BAND).toContain("文書・マイルストーン・新規タスク");
    expect(LEDGER_READ_ONLY_BAND).toContain("影響を受けません");
    const degraded = cliDegradedBand({ state: "unavailable", detail: "not on PATH" });
    expect(degraded).toContain("概要区画");
    expect(degraded).toContain("影響を受けません");
  });

  it("raises no CLI band while a supported backlog is present", () => {
    const ready: CliReadiness = { state: "ready", version: "1.47.1" };
    expect(cliDegradedBand(ready)).toBeNull();
  });

  it("distinguishes 確認中 from 検出できない, since the two lead to different actions", () => {
    expect(cliDegradedBand(null)).toContain("確認中");
    expect(cliDegradedBand({ state: "unavailable", detail: "not on PATH" })).toContain(
      "見つからない",
    );
  });

  it("stops the ledger edits on a read-only ledger and nothing else (doc-10 §8)", () => {
    expect(overviewBlocked({ readOnly: true, busy: false })).toContain("読み取り専用");
    expect(overviewBlocked({ readOnly: false, busy: true })).toContain("実行中");
    expect(overviewBlocked({ readOnly: false, busy: false })).toBeNull();
  });

  it("says the read-only state reaches the inputs, not only the save (review [P2])", () => {
    // doc-10 §8 は入力と登録解除の両方の無効化を求めている。押せない保存だけを残すと、書き換え
    // られない値を編集でき、その入力が未保存入力に数えられて、あとで「保存できなかった変更を
    // 破棄しますか」と尋ねることになる。
    expect(OVERVIEW_READ_ONLY_NOTE).toContain("入力");
    expect(OVERVIEW_READ_ONLY_NOTE).toContain("登録解除");
    // そして、止まるのがこの区画だけであることも同じ文で述べる (doc-10 §3 の独立)。
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
    // doc-3 §4.3 の移動は両ルートを送る。「変えたつもりの属性」ではなく要求値から作っているので、
    // backlog_root を触っていなくてもここに現れる — 送られるものが並ぶことが、この一覧の意味である。
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
    // 空文字にすると、送る値の欄が消えて差分が読めなくなる。
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
    // doc-10 §4.1: 既定は <新ルート>/backlog だが、送るのは欄に入っている値である。
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

// --- 移動の検出 (doc-10 §4.1 開いている編集セッションは閉じる) ---------------------------------

describe("移動かどうかの判定", () => {
  const base = registered();

  it("counts either root, since a backlog_root change also moves what is read", () => {
    expect(movesRoot({ slug: "atlas", project_root: "/moved/atlas" })).toBe(true);
    expect(movesRoot({ slug: "atlas", backlog_root: "/repos/atlas/bl" })).toBe(true);
  });

  it("does not count a change that leaves the roots alone", () => {
    // 別名表や remote 再判定はモデルの解釈や属性を変えるが、読む先は変わらない。ここで移動と
    // 判定すると、閉じる必要のない編集セッションを閉じて未保存入力を捨てることになる。
    expect(movesRoot({ slug: "atlas", status_aliases: { Doing: "In Progress" } })).toBe(false);
    expect(movesRoot({ slug: "atlas", redetect_git_remote: true })).toBe(false);
    expect(movesRoot({ slug: "atlas", new_index: 2 })).toBe(false);
  });

  it("sees the move in the request a project-root edit actually produces (review [P1])", () => {
    // 移動の要求は両ルートを載せる。開いていた文書編集セッションを閉じないと、旧ルートで読んだ
    // 本文を文書 ID だけで新ルートへ送れてしまい、同じ ID があれば照合は新ルートに対して通る。
    // `--content` は全置換なので、そのまま丸ごと上書きになる。
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
    // 実装は 4 状態あるので 4 態で出す。doc-10 §4.2 も同じ 4 態へ改訂してある。
    const declared = ["To Do", "In Progress"];
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("To Do", declared)].label).toBe("宣言あり");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Draft", declared)].label).toBe("draft 専用");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Doing", declared)].label).toBe("宣言なし → 効果なし");
    expect(ALIAS_EFFECT_NOTES[aliasKeyEffect("Doing", [])].label).toBe("宣言集合なし");
  });

  it("marks only the one state where the alias changes nothing", () => {
    // `NoDeclaredSet` では `map_status` が列対応を切らないので別名は効く。効かない別名と同じ印を
    // 付けると、直しようのないものを直せと言っていることになる。
    expect(ALIAS_EFFECT_NOTES.undeclared.ineffective).toBe(true);
    expect(ALIAS_EFFECT_NOTES.noDeclaredSet.ineffective).toBe(false);
    expect(ALIAS_EFFECT_NOTES.declared.ineffective).toBe(false);
    expect(ALIAS_EFFECT_NOTES.draft.ineffective).toBe(false);
  });

  it("says the ineffective alias is kept in the ledger, not dropped (doc-3 §3.3, TASK-42)", () => {
    expect(ALIAS_EFFECT_NOTES.undeclared.note).toContain("未対応区画");
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
    // 貼り付けに付いてくるだけの空白で拒み続けるのは確認として意味がない。一方 slug の文字種は
    // 英小文字・数字・ハイフンだけなので (doc-3 §3.1)、大小の違いは打ち間違いである。
    expect(unregisterBlocked("  atlas ", "atlas", open)).toBeNull();
    expect(unregisterBlocked("Atlas", "atlas", open)).not.toBeNull();
  });

  it("puts the ledger's own state ahead of the confirmation", () => {
    // 一致していても書けない台帳では実行できないので、先に読まれるのはそちらの理由である。
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
