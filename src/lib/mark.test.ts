import { describe, expect, it } from "vitest";
import {
  unwatchedMark,
  conflictKeyOf,
  fileInconsistencyReasons,
  inconsistencyLabel,
  inconsistencyReasons,
  isInconsistent,
  unmappedFileReason,
  versionConflictReason,
  type ConflictTarget,
  type MarkKind,
  type VersionConflict,
} from "./mark";
import { taskView } from "./fixtures";
import type { FileHealth, UnmappedFile } from "./wire";

const PRE_UPDATE: VersionConflict = {
  kind: "preUpdate",
  diverged: ["backlog/tasks/task-1.md"],
  unread: [],
};
const POST_WINDOW: VersionConflict = { kind: "postWindow", fields: ["title"] };

const DEGRADED = taskView({
  health: {
    state: "degraded",
    events: [{ event: "unparseable", missingRequired: ["status"], detail: null }],
  },
});

describe("inconsistencyReasons", () => {
  it("emits nothing for a task that reads cleanly and has no observed divergence", () => {
    expect(inconsistencyReasons(taskView(), null)).toEqual([]);
    expect(isInconsistent(taskView(), null)).toBe(false);
  });

  // decision-22: 判別できなかった項目 と バージョン不整合 は 1 つの 不整合 へ束ねる。族名を分けていた
  // 旧 2 チップと違い、どちらも同じ ⚠️ の理由行として並ぶ。
  it("bundles 読み取りの由来 and バージョン不整合 into one list, in that order", () => {
    const reasons = inconsistencyReasons(DEGRADED, PRE_UPDATE);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toContain("解析不能: status を読めません");
    expect(reasons[1]).toContain("バージョン不整合");
    expect(isInconsistent(DEGRADED, PRE_UPDATE)).toBe(true);
  });

  it("is 不整合 on a task that parses cleanly but had a divergence observed", () => {
    expect(inconsistencyReasons(taskView(), POST_WINDOW)).toHaveLength(1);
    expect(isInconsistent(taskView(), POST_WINDOW)).toBe(true);
  });

  it("names every 由来 without printing the word 不整合 on a 読み取り由来の行", () => {
    const view = taskView({
      health: {
        state: "degraded",
        events: [
          { event: "unexpectedSchema", detail: "unknown status" },
          { event: "danglingReference", kind: "milestone", target: "m-9" },
        ],
      },
    });
    const reasons = inconsistencyReasons(view, null);
    expect(reasons).toEqual([
      "想定外スキーマ: unknown status",
      "参照欠損: milestone m-9",
    ]);
  });

  // AC #4 の理由行は 1 件 1 行. A 解析不能 that names fields *and* carries a detail is two findings,
  // and folding them into one line would hide the second behind the first. **Both lines say
  // 解析不能**: doc-4 §5 のもう一方 (想定外スキーマ) は「frontmatter は読めるが」を定義に持つので、
  // frontmatter が読めなかった事象の detail をその名で出すと、起きていない事象の名前になる。
  it("labels both of an unparseable event's lines 解析不能, never 想定外スキーマ", () => {
    const view = taskView({
      health: {
        state: "degraded",
        events: [
          { event: "unparseable", missingRequired: ["id", "title"], detail: "YAML が読めません" },
        ],
      },
    });
    expect(inconsistencyReasons(view, null)).toEqual([
      "解析不能: id・title を読めません",
      "解析不能: YAML が読めません",
    ]);
  });

  // A ⚠️ whose panel says nothing is indistinguishable from a bug in this function, so an event
  // carrying neither a field list nor a detail still yields a line.
  it("never leaves a degraded task with an empty reason list", () => {
    const view = taskView({
      health: {
        state: "degraded",
        events: [{ event: "unparseable", missingRequired: [], detail: null }],
      },
    });
    expect(inconsistencyReasons(view, null)).toHaveLength(1);
  });
});

describe("inconsistencyLabel", () => {
  // doc-11 §2.4: the figure leaves nothing for a screen reader, so the word and every reason are
  // given in text — the card has nowhere else to put them.
  it("names 不整合 and carries every reason", () => {
    const label = inconsistencyLabel(inconsistencyReasons(DEGRADED, POST_WINDOW));
    expect(label.startsWith("不整合: ")).toBe(true);
    expect(label).toContain("解析不能");
    expect(label).toContain("バージョン不整合");
  });
});

describe("versionConflictReason", () => {
  // doc-9 §5 splits the presentation into 防げる競合 and 防げない喪失の事後通知; both are バージョン不整合,
  // so they share the word, and the evidence differs because the user's next step does.
  it("uses one word for both stages and states which one it is", () => {
    const pre = versionConflictReason(PRE_UPDATE);
    const post = versionConflictReason(POST_WINDOW);
    expect(pre.startsWith("バージョン不整合: ")).toBe(true);
    expect(post.startsWith("バージョン不整合: ")).toBe(true);
    expect(pre).toContain("更新前競合");
    expect(pre).toContain("backlog/tasks/task-1.md");
    expect(post).toContain("照合後競合窓");
    expect(post).toContain("title");
  });
});

describe("継続検出停止", () => {
  // doc-9 §5 forbids 照合不能 from reading as a conflict; the same holds for a stopped watch, which
  // is likewise "no way to look" rather than "a divergence was found".
  it("is undetectable, never バージョン不整合", () => {
    const kind: MarkKind = unwatchedMark().kind;
    expect(kind).toBe("undetectable");
    expect(unwatchedMark().detail).toContain("版がずれているとは限りません");
  });
});

describe("記録の宛先", () => {
  /**
   * The shell keys the record by the target it is handed, never by whatever is selected when the
   * answer arrives: an update is awaited, and a 状態遷移 needs no 未保存入力, so nothing stops the
   * user selecting another card while the CLI runs. This models that store.
   */
  function store(): {
    note: (conflict: VersionConflict | null, target: ConflictTarget) => void;
    at: (target: ConflictTarget) => VersionConflict | null;
  } {
    let records: Record<string, VersionConflict> = {};
    return {
      note: (conflict, target) => {
        const key = conflictKeyOf(target.slug, target.sourcePath);
        if (conflict === null) {
          const { [key]: _removed, ...rest } = records;
          records = rest;
        } else {
          records[key] = conflict;
        }
      },
      at: (target) => records[conflictKeyOf(target.slug, target.sourcePath)] ?? null,
    };
  }

  const A: ConflictTarget = { slug: "atlas", sourcePath: "backlog/tasks/task-a.md" };
  const B: ConflictTarget = { slug: "atlas", sourcePath: "backlog/tasks/task-b.md" };

  it("files a divergence against the operated task, not the one selected later", () => {
    const records = store();
    // A's save is in flight; the user selects B; A comes back as a conflict.
    records.note(PRE_UPDATE, A);
    expect(records.at(A)).toEqual(PRE_UPDATE);
    expect(records.at(B)).toBeNull();
  });

  it("clears only the operated task's record", () => {
    const records = store();
    records.note(PRE_UPDATE, A);
    records.note(POST_WINDOW, B);
    records.note(null, A);
    expect(records.at(A)).toBeNull();
    expect(records.at(B)).toEqual(POST_WINDOW);
  });
});

describe("conflictKeyOf", () => {
  it("keys on the file path, so a 解析不能 task with no id is still addressable", () => {
    expect(conflictKeyOf("atlas", "backlog/tasks/broken.md")).toBe(
      conflictKeyOf("atlas", "backlog/tasks/broken.md"),
    );
  });

  it("cannot collide two (slug, path) pairs into one key", () => {
    // A concatenated key would make these two the same string.
    expect(conflictKeyOf("a", "b/c.md")).not.toBe(conflictKeyOf("a/b", "c.md"));
  });
});

// --- TASK-88 / decision-24: 不整合 の対象が管理ファイル 1 件へ広がった ------------------------

describe("fileInconsistencyReasons", () => {
  it("emits nothing for a non-task file that mapped cleanly", () => {
    expect(fileInconsistencyReasons({ state: "ok" }, "document")).toEqual([]);
  });

  // AC #3: the id/title/body survive and only the out-of-range field is named — so the line has to
  // name the field, not the file.
  it("names the field a 想定外スキーマ left unset", () => {
    expect(
      fileInconsistencyReasons(
        {
          state: "degraded",
          events: [{ event: "unexpectedSchema", detail: "frontmatter `type` is not a scalar value" }],
        },
        "document",
      ),
    ).toEqual(["想定外スキーマ: frontmatter `type` is not a scalar value"]);
  });

  // The derivation is the task one (decision-22「導出は 1 回」), so a line reads identically on
  // either side of the widened object — only the noun in the fallback can differ.
  it("reads the same as a task's line for the same event", () => {
    const health: FileHealth = {
      state: "degraded",
      events: [{ event: "danglingReference", kind: "milestone", target: "m-9" }],
    };
    expect(fileInconsistencyReasons(health, "milestone")).toEqual(
      inconsistencyReasons(taskView({ health }), null),
    );
  });
});

describe("unmappedFileReason", () => {
  const file = (overrides: Partial<UnmappedFile> = {}): UnmappedFile => ({
    sourcePath: "/repos/atlas/backlog/docs/doc-9 - broken.md",
    kind: "document",
    missingRequired: [],
    detail: null,
    ...overrides,
  });

  it("names which required field was missing", () => {
    expect(unmappedFileReason(file({ missingRequired: ["id"] }))).toBe(
      "解析不能: id を読めません",
    );
  });

  it("carries the read or YAML error when there is one", () => {
    expect(unmappedFileReason(file({ detail: "file could not be read: denied" }))).toBe(
      "解析不能: file could not be read: denied",
    );
  });

  it("keeps both facts apart when a required field was present in an unusable shape", () => {
    expect(
      unmappedFileReason(
        file({
          missingRequired: ["title"],
          detail: "frontmatter `title` is not a scalar value",
        }),
      ),
    ).toBe("解析不能: title を読めません / 解析不能: frontmatter `title` is not a scalar value");
  });

  // A ⚠️ with no reason is indistinguishable from a bug in the derivation, so a record carrying
  // neither fact still yields a line — and the noun says what the file was meant to be.
  it("still says something when the record carries neither a field list nor a detail", () => {
    expect(unmappedFileReason(file({ kind: "milestone" }))).toBe(
      "解析不能: このファイルをマイルストーンとして写せませんでした",
    );
    // 決定事項, not doc-4 §1's 意思決定: this line is printed for the user (TASK-118).
    expect(unmappedFileReason(file({ kind: "decision" }))).toBe(
      "解析不能: このファイルを決定事項として写せませんでした",
    );
  });
});
