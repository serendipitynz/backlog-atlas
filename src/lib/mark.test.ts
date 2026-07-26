import { describe, expect, it } from "vitest";
import {
  UNWATCHED_MARK,
  conflictKeyOf,
  degradeMark,
  taskMarks,
  versionConflictMark,
  type ConflictTarget,
  type MarkKind,
  type VersionConflict,
} from "./mark";
import { taskView } from "./fixtures";

const PRE_UPDATE: VersionConflict = {
  kind: "preUpdate",
  path: "backlog/tasks/task-1.md",
};
const POST_WINDOW: VersionConflict = { kind: "postWindow", fields: ["title"] };

const DEGRADED = taskView({
  health: {
    state: "degraded",
    events: [{ event: "unparseable", missingRequired: ["status"], detail: null }],
  },
});

describe("taskMarks", () => {
  it("emits nothing for a task that reads cleanly and has no observed divergence", () => {
    expect(taskMarks(taskView(), null)).toEqual([]);
  });

  // decision-6 三者を同じ印へ混ぜない: the whole point of the module is that these two never share
  // one kind, so a display cannot reach for one colour for both.
  it("keeps 解析縮退 and 版ずれ in separate kinds", () => {
    const marks = taskMarks(DEGRADED, PRE_UPDATE);
    expect(marks.map((mark) => mark.kind)).toEqual(["degraded", "versionConflict"]);
    expect(new Set(marks.map((mark) => mark.label)).size).toBe(2);
  });

  it("marks 版ずれ on a task that parses cleanly", () => {
    const marks = taskMarks(taskView(), POST_WINDOW);
    expect(marks.map((mark) => mark.kind)).toEqual(["versionConflict"]);
  });

  it("marks 縮退 without a divergence", () => {
    expect(taskMarks(DEGRADED, null).map((mark) => mark.kind)).toEqual(["degraded"]);
  });

  it("orders marks the same way whatever the task", () => {
    const both = taskMarks(DEGRADED, POST_WINDOW).map((mark) => mark.kind);
    expect(both).toEqual(["degraded", "versionConflict"]);
  });
});

describe("degradeMark", () => {
  it("is null for a healthy task", () => {
    expect(degradeMark(taskView())).toBeNull();
  });

  it("names every degrade event in its detail", () => {
    const view = taskView({
      health: {
        state: "degraded",
        events: [
          { event: "unexpectedSchema", detail: "unknown status" },
          { event: "danglingReference", kind: "milestone", target: "m-9" },
        ],
      },
    });
    const mark = degradeMark(view);
    expect(mark?.label).toBe("縮退");
    expect(mark?.detail).toContain("想定外スキーマ: unknown status");
    expect(mark?.detail).toContain("参照欠損: milestone m-9");
  });
});

describe("versionConflictMark", () => {
  // doc-9 §5 splits the presentation into 防げる競合 and 防げない喪失の事後通知; both are 版ずれ, so
  // they share the word, and the evidence differs because the user's next step does.
  it("uses one word for both stages and states which one it is", () => {
    const pre = versionConflictMark(PRE_UPDATE);
    const post = versionConflictMark(POST_WINDOW);
    expect(pre.label).toBe("版ずれ");
    expect(post.label).toBe("版ずれ");
    expect(pre.kind).toBe("versionConflict");
    expect(post.kind).toBe("versionConflict");
    expect(pre.detail).toContain("更新前競合");
    expect(pre.detail).toContain(PRE_UPDATE.path);
    expect(post.detail).toContain("照合後競合窓");
    expect(post.detail).toContain("title");
  });
});

describe("継続検出停止", () => {
  // doc-9 §5 forbids 照合不能 from reading as a conflict; the same holds for a stopped watch, which
  // is likewise "no way to look" rather than "a divergence was found".
  it("is undetectable, never 版ずれ", () => {
    const kind: MarkKind = UNWATCHED_MARK.kind;
    expect(kind).toBe("undetectable");
    expect(UNWATCHED_MARK.detail).toContain("版がずれているとは限りません");
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
