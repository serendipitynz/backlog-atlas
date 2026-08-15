/**
 * 列間ドロップ (doc-7 §4.2, decision-34, TASK-81). Each test names the AC it stands for.
 */

import { describe, expect, it } from "vitest";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import { CREATE_STATUS_CANDIDATES } from "./fixtures";
import { laneCreate } from "./lane-create";
import {
  buildLaneStatusEdit,
  laneDragHold,
  laneDrop,
  laneDropStatus,
  laneDropTarget,
  type DragSource,
} from "./lane-drop";
import { ISSUE_BUSY_REASON } from "./manage";
import type { ColumnCreateStatuses } from "./wire";

/** `backlog init --defaults` の 3 status 構成: In Review is not declared (doc-7 §4.1, 実測). */
const INIT_DEFAULTS: ColumnCreateStatuses[] = [
  { column: "toDo", statuses: ["To Do"] },
  { column: "inProgress", statuses: ["In Progress"] },
  { column: "inReview", statuses: [] },
  { column: "done", statuses: ["Done"] },
];

/** A project whose Done column has two declared statuses, aliased there (doc-3 §3.3). */
const TWO_FOR_DONE: ColumnCreateStatuses[] = [
  { column: "toDo", statuses: ["To Do"] },
  { column: "inProgress", statuses: [] },
  { column: "inReview", statuses: [] },
  { column: "done", statuses: ["Closed", "Cancelled"] },
];

const CARD: DragSource = {
  slug: "atlas",
  taskId: "TASK-7",
  sourcePath: "/roots/atlas/backlog/tasks/task-7.md",
  column: "toDo",
};

describe("受け先になるセル", () => {
  it("takes the card in another 正準列 of the same row (AC #1)", () => {
    expect(laneDropTarget(CARD, "atlas", "inProgress", CREATE_STATUS_CANDIDATES)).toBe(true);
    expect(laneDrop(CARD, "atlas", "inProgress", CREATE_STATUS_CANDIDATES)).toEqual({
      state: "issue",
      status: "In Progress",
    });
  });

  it("refuses the column the card is already in — 同じ status への発行は更新ではない (AC #1)", () => {
    expect(laneDropTarget(CARD, "atlas", "toDo", CREATE_STATUS_CANDIDATES)).toBe(false);
    expect(laneDrop(CARD, "atlas", "toDo", CREATE_STATUS_CANDIDATES)).toEqual({ state: "ignored" });
  });

  it("refuses another project's row — 行またぎのドロップは成立しない (AC #6)", () => {
    expect(laneDropTarget(CARD, "kanri", "inProgress", CREATE_STATUS_CANDIDATES)).toBe(false);
    expect(laneDrop(CARD, "kanri", "inProgress", CREATE_STATUS_CANDIDATES)).toEqual({
      state: "ignored",
    });
  });

  it("refuses a 候補 0 件 正準列, which `init --defaults` makes In Review (AC #3)", () => {
    expect(laneDropTarget(CARD, "atlas", "inReview", INIT_DEFAULTS)).toBe(false);
    expect(laneDrop(CARD, "atlas", "inReview", INIT_DEFAULTS)).toEqual({ state: "ignored" });
  });

  it("puts the 候補 0 件 reason on screen through the 入口 it already belongs to (AC #3)", () => {
    // doc-7 §4.2 asks for the reason on that column and for none on the 未分類列. The sentence is
    // the 入口's, not a second one — this asserts the two operations point at the same string.
    const entry = laneCreate(INIT_DEFAULTS, "inReview");
    expect(entry).toEqual({ state: "absent", reason: expect.stringContaining("In Review") });
    expect(laneDropTarget(CARD, "atlas", "inReview", INIT_DEFAULTS)).toBe(false);
  });

  it("takes a card dragged out of the 未分類区画, which is in no 正準列 (AC #1)", () => {
    const unmapped: DragSource = { ...CARD, column: null };
    for (const column of ["toDo", "inProgress", "inReview", "done"] as const) {
      expect(laneDropTarget(unmapped, "atlas", column, CREATE_STATUS_CANDIDATES)).toBe(true);
    }
  });

  it("takes nothing while no card is being dragged", () => {
    expect(laneDropTarget(null, "atlas", "inProgress", CREATE_STATUS_CANDIDATES)).toBe(false);
    expect(laneDrop(null, "atlas", "inProgress", CREATE_STATUS_CANDIDATES)).toEqual({
      state: "ignored",
    });
  });
});

describe("渡る status", () => {
  it("passes the project's own declared spelling, never the 正準列名 (AC #1)", () => {
    const drop = laneDrop(CARD, "atlas", "done", TWO_FOR_DONE);
    expect(laneDropStatus(drop, "")).toBe("Closed");
    expect(laneDropStatus(drop, "")).not.toBe("Done");
  });

  it("asks on a 候補 2 件以上 受け先 and does not ask on a 候補 1 件 one (AC #2)", () => {
    expect(laneDrop(CARD, "atlas", "done", TWO_FOR_DONE)).toEqual({
      state: "ask",
      candidates: ["Closed", "Cancelled"],
    });
    expect(laneDrop(CARD, "atlas", "done", CREATE_STATUS_CANDIDATES)).toEqual({
      state: "issue",
      status: "Done",
    });
  });

  it("defaults the 問い to the 宣言順 first candidate and honours a held choice (AC #2)", () => {
    const drop = laneDrop(CARD, "atlas", "done", TWO_FOR_DONE);
    expect(laneDropStatus(drop, "")).toBe("Closed");
    expect(laneDropStatus(drop, "Cancelled")).toBe("Cancelled");
  });

  it("drops a held value the project no longer declares back to the first candidate (AC #2)", () => {
    // doc-9 継続検出 can re-read `config.yml` while the 問い is open; `-s` would refuse the stale
    // value with exit code 1 (doc-5 §3), so the shown value has to fall back rather than be passed.
    const drop = laneDrop(CARD, "atlas", "done", TWO_FOR_DONE);
    expect(laneDropStatus(drop, "Resolved")).toBe("Closed");
  });

  it("passes nothing for a drop that is not on a 受け先", () => {
    expect(laneDropStatus({ state: "ignored" }, "Done")).toBe("");
  });
});

describe("発行する更新操作", () => {
  it("is doc-5 §3's タスク status 変更 row and carries nothing else (AC #1)", () => {
    expect(buildLaneStatusEdit("TASK-7", "In Progress")).toEqual([
      { op: "taskEdit", taskId: "TASK-7", edit: { status: "In Progress" } },
    ]);
  });
});

describe("つまめないカード", () => {
  const READY = { state: "ready", version: CONFIRMED_CLI_VERSION } as const;

  it("lets a card be picked up when the CLI is ready and nothing is in flight (AC #4)", () => {
    expect(laneDragHold({ readiness: READY, busy: false })).toBeNull();
  });

  it("holds every card while the CLI is 縮退 (AC #4)", () => {
    expect(laneDragHold({ readiness: null, busy: false })).not.toBeNull();
  });

  it("holds every card while an action is in flight, in the 入口's own words (AC #4)", () => {
    expect(laneDragHold({ readiness: READY, busy: true })).toBe(
      ISSUE_BUSY_REASON,
    );
  });
});
