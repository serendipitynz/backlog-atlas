/**
 * 列内新規タスク入力 (doc-7 §4.1, TASK-53). Each test names the AC it stands for.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "./filter";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import { CREATE_STATUS_CANDIDATES, loadMap, loaded, taskView, unreadable } from "./fixtures";
import {
  noStatusToPassReason,
  buildLaneTaskCreate,
  laneCreate,
  laneCreateHold,
  laneCreateStatus,
  noCandidateAbsentReason,
} from "./lane-create";
import { issueBusyReason, taskTitleRequiredReason, issueAvailability } from "./manage";
import { buildSwimlane } from "./swimlane";
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

describe("入口を置くか置かないか", () => {
  it("offers the entry on a 候補 1 件 column and passes that one status (AC #6)", () => {
    const entry = laneCreate(CREATE_STATUS_CANDIDATES, "inProgress");
    expect(entry).toEqual({ state: "offered", candidates: ["In Progress"] });
    expect(laneCreateStatus(entry, "")).toBe("In Progress");
  });

  it("passes the project's own declared spelling, never the 正準列名 (AC #6)", () => {
    const entry = laneCreate(TWO_FOR_DONE, "done");
    expect(laneCreateStatus(entry, "")).toBe("Closed");
    expect(laneCreateStatus(entry, "")).not.toBe("Done");
  });

  it("makes a 候補 2 件以上 column a choice, defaulting to the 宣言順 first (AC #8)", () => {
    const entry = laneCreate(TWO_FOR_DONE, "done");
    expect(entry).toEqual({ state: "offered", candidates: ["Closed", "Cancelled"] });
    expect(laneCreateStatus(entry, "")).toBe("Closed");
    expect(laneCreateStatus(entry, "Cancelled")).toBe("Cancelled");
  });

  it("places no entry on a 候補 0 件 column and names the column in the reason (AC #7)", () => {
    const entry = laneCreate(TWO_FOR_DONE, "inProgress");
    expect(entry).toEqual({ state: "absent", reason: noCandidateAbsentReason("inProgress") });
    expect(entry.state === "absent" && entry.reason).toContain("In Progress");
  });

  // The case every `backlog init --defaults` project is in, which is why AC #9 asks for it by name.
  it("leaves In Review without an entry under the init --defaults 3 status 構成 (AC #9)", () => {
    expect(laneCreate(INIT_DEFAULTS, "inReview").state).toBe("absent");
    // The other three keep theirs: the absence belongs to this column, not to the project.
    for (const column of ["toDo", "inProgress", "done"] as const) {
      expect(laneCreate(INIT_DEFAULTS, column).state).toBe("offered");
    }
  });

  // Read as 候補 0 件 rather than as an entry whose `-s` value would be unknown.
  it("treats a column missing from the payload as having no candidate", () => {
    expect(laneCreate([], "toDo")).toEqual({
      state: "absent",
      reason: noCandidateAbsentReason("toDo"),
    });
  });
});

describe("候補は行ごとに決まる", () => {
  // The candidates ride on the row, so the same column can offer the entry in one project and state
  // its 置かない理由 in the next — which is why this cannot be decided once for the whole grid.
  it("splits the same column between projects that declare a status for it and ones that do not", () => {
    const rows = buildSwimlane({
      order: ["atlas", "plain"],
      loads: loadMap(
        loaded("atlas", [taskView({ id: "TASK-1" })]),
        loaded("plain", [taskView({ id: "TASK-2", project: "plain" })], INIT_DEFAULTS),
      ),
      hidden: new Set(),
      filter: DEFAULT_FILTER,
      cardOrder: "priority_desc",
      inconsistent: () => false,
    });
    const candidatesOf = (slug: string) => {
      const row = rows.find((candidate) => candidate.slug === slug);
      return row?.state === "loaded" ? row.createStatusCandidates : [];
    };
    expect(laneCreate(candidatesOf("atlas"), "inReview").state).toBe("offered");
    expect(laneCreate(candidatesOf("plain"), "inReview").state).toBe("absent");
  });

  // 絞り込みはカードの取捨だけを行う (doc-7 §5.2): a column filtered down to nothing still lets a task
  // be created into it, so the candidates must not travel with the cards.
  it("keeps a column's candidates when the filter has emptied its cell", () => {
    const rows = buildSwimlane({
      order: ["atlas"],
      loads: loadMap(loaded("atlas", [taskView({ id: "TASK-1" })])),
      hidden: new Set(),
      filter: { ...DEFAULT_FILTER, text: "該当しない語" },
      cardOrder: "priority_desc",
      inconsistent: () => false,
    });
    const row = rows[0];
    expect(row.state === "loaded" && row.cells[0].tasks).toEqual([]);
    expect(row.state === "loaded" && laneCreate(row.createStatusCandidates, "toDo").state).toBe(
      "offered",
    );
  });

  // A 読取不能行 has no cells at all (doc-7 §6), so there is nowhere to put an entry — and no
  // `config.yml` to have read a candidate from.
  it("gives a 読取不能行 no candidates, since it has no cells to hold an entry", () => {
    const rows = buildSwimlane({
      order: ["gone"],
      loads: loadMap(unreadable("gone")),
      hidden: new Set(),
      filter: DEFAULT_FILTER,
      cardOrder: "priority_desc",
      inconsistent: () => false,
    });
    expect(rows[0].state).toBe("unreadable");
  });
});

describe("外部で config.yml が変わったとき", () => {
  // 継続検出 (doc-9 §3) can bring a new `config.yml` in while the entry is open. A held value the
  // project no longer declares would be refused by `-s` with exit code 1, so what the entry shows —
  // and issues — returns to the current default rather than staying a value that cannot be passed.
  it("returns a selection that left the candidates to the current default", () => {
    const before = laneCreate(TWO_FOR_DONE, "done");
    expect(laneCreateStatus(before, "Cancelled")).toBe("Cancelled");
    const after = laneCreate([{ column: "done", statuses: ["Closed"] }], "done");
    expect(laneCreateStatus(after, "Cancelled")).toBe("Closed");
  });

  it("holds no value to pass for a column that offers no entry", () => {
    expect(laneCreateStatus(laneCreate(INIT_DEFAULTS, "inReview"), "In Review")).toBe("");
  });
});

describe("発行する task create", () => {
  it("issues one task create carrying only the title and the column's status (AC #1)", () => {
    const plan = buildLaneTaskCreate("レーンから作る", "In Progress");
    expect(plan).toEqual({
      state: "ready",
      action: [{ op: "taskCreate", title: "レーンから作る", status: "In Progress" }],
    });
  });

  it("trims the title", () => {
    const plan = buildLaneTaskCreate("  余白つき  ", "To Do");
    expect(plan.state === "ready" && plan.action[0]).toEqual({
      op: "taskCreate",
      title: "余白つき",
      status: "To Do",
    });
  });

  // The same wording as the 新規タスク区画's, because both issue the same `task create` (doc-10 §7).
  it("refuses an empty title with the 新規タスク区画's own reason (AC #3)", () => {
    expect(buildLaneTaskCreate("", "To Do")).toEqual({
      state: "blocked",
      reason: taskTitleRequiredReason(),
    });
    expect(buildLaneTaskCreate("   ", "To Do").state).toBe("blocked");
  });

  // An omitted `-s` is not a neutral default: it is a create that lands in `default_status`'s column
  // (doc-5 §3), i.e. in a column other than the one clicked.
  it("issues nothing while no candidate has been resolved to pass", () => {
    expect(buildLaneTaskCreate("題名", "")).toEqual({
      state: "blocked",
      reason: noStatusToPassReason(),
    });
  });
});

describe("CLI 縮退 (doc-5 §5)", () => {
  // 無効化, not 置かない: the operation becomes pressable once the CLI is there, which is the
  // distinction doc-11 §5 draws. Decided by the same `issueAvailability` the 新規タスク区画 uses.
  it("withholds 発行 with the CLI's own reason while none is detected (AC #4)", () => {
    const plan = buildLaneTaskCreate("題名", "To Do");
    const availability = issueAvailability(plan, {
      readiness: { state: "unavailable", detail: "backlog が見つかりません" },
      busy: false,
    });
    expect(availability.state).toBe("blocked");
    expect(availability.state === "blocked" && availability.reason).toContain(
      "backlog が見つかりません",
    );
  });

  // doc-7 §4.1 disables the *入口*, not merely its 発行, so the closed ＋新規 of every cell needs the
  // same reason — decided without any one cell's input, and in the same words (AC #4).
  it("closes every cell's 入口 under 縮退, with the wording 発行 uses", () => {
    const readiness = { state: "unavailable", detail: "backlog が見つかりません" } as const;
    const held = laneCreateHold({ readiness, busy: false });
    expect(held).not.toBeNull();
    const blocked = issueAvailability(buildLaneTaskCreate("題名", "To Do"), {
      readiness,
      busy: false,
    });
    expect(blocked.state === "blocked" && blocked.reason).toBe(held);
  });

  it("closes every cell's 入口 while a create is in flight", () => {
    expect(laneCreateHold({ readiness: { state: "ready", version: CONFIRMED_CLI_VERSION }, busy: true })).toBe(
      issueBusyReason(),
    );
  });

  // An empty title is not a reason to withhold the 入口 — it is the value the 入口 exists to take.
  it("opens the 入口 whenever the CLI is present and nothing is in flight", () => {
    expect(
      laneCreateHold({ readiness: { state: "ready", version: CONFIRMED_CLI_VERSION }, busy: false }),
    ).toBeNull();
  });

  it("leaves 発行 to the input alone once the CLI is present", () => {
    const readiness = { state: "ready", version: CONFIRMED_CLI_VERSION } as const;
    expect(
      issueAvailability(buildLaneTaskCreate("題名", "To Do"), { readiness, busy: false }).state,
    ).toBe("ready");
    expect(issueAvailability(buildLaneTaskCreate("", "To Do"), { readiness, busy: false })).toEqual({
      state: "blocked",
      reason: taskTitleRequiredReason(),
    });
  });
});
