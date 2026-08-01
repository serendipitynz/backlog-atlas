/**
 * 画面横断契約 1 件 (TASK-91): Rust wire fixture と TypeScript 型利用の往復.
 *
 * `wire.ts` mirrors the Rust side's serde output by hand, and nothing has ever compared the two: the
 * TypeScript compiler never sees a runtime payload, and the Rust JSON tests never read the TypeScript
 * declarations. A renamed field, a moved variant tag, or a `skip_serializing_if` that started firing
 * changes what the screens receive while both sides still build. `wire.ts` is 619 lines, so the
 * chance of catching that by reading is what this replaces.
 *
 * The loop, in both directions:
 *
 * - **Rust moves.** `src-tauri/src/wire_fixtures.rs` fails until the fixture is re-recorded. The new
 *   file then reaches this test, where the key-set assertions name the field that appeared or left,
 *   and the app's own functions read the payload and produce something else.
 * - **`wire.ts` moves.** The declaration and the reader disagree, so `pnpm run check` fails at the
 *   consumer; if the two were changed together, the fixture is still the old shape and the reads
 *   below fail.
 *
 * No DOM here — this is a payload and the pure functions over it, so it runs in the `node` project
 * with the other 418.
 */

import { describe, expect, it } from "vitest";
import { defaultFilter } from "./filter";
import { refusalReport } from "./ledger";
import { historyKeyOf } from "./history-read";
import { statusNotice, saveAvailability, editorArgsText } from "./settings";
import { buildSwimlane } from "./swimlane";
import { degradeMark, taskMarks } from "./mark";
import type {
  AppSettings,
  CliReadiness,
  CommandError,
  CommitSearch,
  EditorLaunch,
  EditorReadiness,
  LedgerResponse,
  LoadedSettings,
  ProjectLoad,
  ProjectSnapshot,
  Task,
  TaskHistory,
  TaskView,
  UpdateResult,
} from "./wire";

/**
 * Every recorded payload, pulled in through the module graph rather than read off disk: `node:fs`
 * would need `@types/node`, and this task's whole dependency budget is `jsdom`. The glob also makes
 * the set of recorded files observable, which the last test uses.
 */
const RECORDED: Record<string, unknown> = import.meta.glob(
  "../../src-tauri/wire-fixtures/*.json",
  { eager: true, import: "default" },
);

const DIR = "../../src-tauri/wire-fixtures";

/**
 * One recorded payload, as its `wire.ts` type.
 *
 * The cast is not the check — the JSON would satisfy anything. What checks is what the tests do with
 * the value: the key-set assertions below, and the app's own functions reading fields through these
 * types. The cast is what makes those reads *typed*, so `wire.ts` is on the hook for them.
 */
function fixture<T>(name: string): T {
  const found = RECORDED[`${DIR}/${name}`];
  if (found === undefined) {
    throw new Error(
      `${name} is not recorded. Run \`ATLAS_RECORD_WIRE_FIXTURES=1 cargo test\` and commit it.`,
    );
  }
  return found as T;
}

/** The keys a recorded object actually carries, sorted so the assertion is order-independent. */
function keysOf(value: unknown): string[] {
  if (value === null || typeof value !== "object") throw new Error("not an object");
  return Object.keys(value as Record<string, unknown>).sort();
}

const LOADED = fixture<ProjectLoad>("project_load_loaded.json");

function snapshotOf(load: ProjectLoad): ProjectSnapshot {
  if (load.state !== "loaded") throw new Error(`expected a loaded root, got ${load.state}`);
  return load.project;
}

describe("Rust が記録した payload の項目が wire.ts と一致する", () => {
  // These lists are the contract, spelled out. A field added on the Rust side lands here as a
  // mismatch, which is the prompt to add it to `wire.ts` too — the step that used to be invisible.

  it("記録されている payload はすべてこのファイルが読む", () => {
    // Listed rather than counted: a payload recorded on the Rust side with no reader here would
    // otherwise be a fixture that pins the Rust shape and tells the frontend nothing.
    expect(Object.keys(RECORDED).map((key) => key.slice(DIR.length + 1)).sort()).toEqual([
      "cli_readiness.json",
      "command_errors.json",
      "commit_search_no_repository.json",
      "commit_search_unreadable.json",
      "editor_launch.json",
      "editor_readiness.json",
      "ledger_response.json",
      "loaded_settings.json",
      "project_load_loaded.json",
      "project_load_unreadable.json",
      "task_history.json",
      "update_result_conflict.json",
      "update_result_ran_failed.json",
    ]);
  });

  it("ProjectSnapshot", () => {
    expect(keysOf(snapshotOf(LOADED))).toEqual([
      "config",
      "createStatusCandidates",
      "decisions",
      "documents",
      "milestones",
      "slug",
      "tasks",
    ]);
  });

  it("Config", () => {
    expect(keysOf(snapshotOf(LOADED).config)).toEqual([
      "dateFormat",
      "defaultStatus",
      "projectName",
      "statuses",
      "taskPrefix",
    ]);
  });

  it("TaskView と Task", () => {
    const view: TaskView = snapshotOf(LOADED).tasks[0];
    expect(keysOf(view)).toEqual(["interpretation", "task"]);
    expect(keysOf(view.interpretation)).toEqual(["pullRequests", "status", "types"]);
    const task: Task = view.task;
    expect(keysOf(task)).toEqual([
      "acceptanceCriteria",
      "assignee",
      "createdDate",
      "dependencies",
      "description",
      "documentation",
      "health",
      "id",
      "implementationNotes",
      "implementationPlan",
      "labels",
      "milestone",
      "ordinal",
      "priority",
      "project",
      "references",
      "sourcePath",
      "status",
      "storageState",
      "title",
      // `type` and not `typeLabels`: the Rust field is renamed for the wire, and doc-4 §3.3 keeps
      // Type apart from the label list — a rename here would merge two things the model separates.
      "type",
      "unknownSections",
      "updatedDate",
    ]);
  });

  it("ProjectEntry — 台帳側は snake_case のまま", () => {
    const response = fixture<LedgerResponse>("ledger_response.json");
    expect(keysOf(response)).toEqual(["ledger", "readOnly"]);
    expect(keysOf(response.ledger)).toEqual(["project", "schema_version"]);
    // doc-3 §2.2 keeps the ledger hand-editable, so its field names are the TOML's. `wire.ts`
    // mirrors them as they are rather than "correcting" them — a silent camelCasing here would read
    // every entry as undefined.
    expect(keysOf(response.ledger.project[0])).toEqual([
      "backlog_root",
      "git_remote_present",
      "project_root",
      "slug",
      "status_aliases",
    ]);
  });

  it("AppSettings — 設定ファイルのキーがそのまま IPC の項目名", () => {
    const loaded = fixture<LoadedSettings>("loaded_settings.json");
    expect(keysOf(loaded)).toEqual(["settings", "status"]);
    const settings: AppSettings = loaded.settings;
    expect(keysOf(settings)).toEqual([
      "card_density",
      "default_detail_placement",
      "default_storage_filter",
      "external_editor",
      "schema_version",
      "theme",
      "watch_external_changes",
    ]);
  });

  it("TaskHistory", () => {
    const history = fixture<TaskHistory>("task_history.json");
    expect(keysOf(history)).toEqual(["commits", "relations", "remote"]);
    expect(keysOf(history.relations[0])).toEqual(["outcome", "pullRequest"]);
  });
});

describe("記録した payload を画面の関数がそのまま読める", () => {
  it("スイムレーンは記録したスナップショットから列を組める", () => {
    const rows = buildSwimlane({
      order: ["atlas"],
      loads: new Map([["atlas", LOADED]]),
      hidden: new Set(),
      // The filter reads `storageState`, so a rename on the Rust side drops both tasks out of the
      // 既定の保存区分 and this row comes back empty.
      filter: defaultFilter(["active", "indeterminate"]),
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.slug).toBe("atlas");
    if (row.state !== "loaded") throw new Error(`expected a loaded row, got ${row.state}`);
    expect(row.projectName).toBe("Atlas");
    // The two recorded tasks land where their recorded statuses interpret to: one in 進行中, and the
    // 解析不能 one in 未分類 — the placement rule reading the payload, not a restatement of it.
    const inProgress = row.cells.find((cell) => cell.column === "inProgress");
    expect(inProgress?.tasks.map((view) => view.task.id)).toEqual(["TASK-1"]);
    expect(row.unmapped.map((view) => view.task.sourcePath)).toEqual([
      "/repos/atlas/backlog/tasks/task-broken.md",
    ]);
    expect(row.totalBeforeFilter).toBe(2);
  });

  it("縮退の印は記録した health から立つ", () => {
    const [ok, broken] = snapshotOf(LOADED).tasks;

    // `health.state` is a tagged variant, so this fails if the tag key or its spelling moves.
    expect(degradeMark(ok)).not.toBeNull();
    expect(degradeMark(broken)).not.toBeNull();
    expect(taskMarks(broken, null).map((mark) => mark.kind)).toContain("degraded");
  });

  it("履歴読取のキーは記録した References から作られる", () => {
    const entry = fixture<LedgerResponse>("ledger_response.json").ledger.project[0];
    const view = snapshotOf(LOADED).tasks[0];
    const key = historyKeyOf("atlas", "TASK-1", {
      projectRoot: entry.project_root,
      gitRemotePresent: entry.git_remote_present,
      references: view.task.references,
    });

    // m-1 TASK-43: the key *is* the read's inputs. If `references` or `project_root` were renamed,
    // the key would be built from `undefined` and every task would share one — which is a cache that
    // answers one task's history with another's.
    expect(key).toContain("https://example.test/pull/1");
    expect(key).toContain("/repos/atlas");
    expect(key).not.toContain("undefined");
  });

  it("台帳の拒否理由は記録した CommandError から欄名まで決まる", () => {
    const errors = fixture<CommandError[]>("command_errors.json");
    const duplicate = errors.find(
      (error) => error.kind === "ledgerRefused" && error.reason.reason === "duplicateSlug",
    );
    if (duplicate === undefined) throw new Error("the duplicate-slug refusal is not recorded");

    // doc-3 §3.1 asks the screen to send the user back to the field that gets them past the refusal,
    // so the mapping from the payload to a field name is the contract — not just the message.
    const report = refusalReport(duplicate);
    expect(report.field).toBe("slug");
    expect(report.message).not.toContain("undefined");
  });

  it("設定の状態と外部エディタ指定を記録した payload から読める", () => {
    const loaded = fixture<LoadedSettings>("loaded_settings.json");

    // `readOnly` carries a `version`, and the notice prints it — a renamed payload field would show
    // the sentence with a hole in it rather than failing.
    expect(statusNotice(loaded.status)).toContain("2");
    expect(saveAvailability(loaded.status).enabled).toBe(false);
    expect(editorArgsText(loaded.settings.external_editor)).toBe("-w");
  });

  it("残る payload も自分の tag で判別できる", () => {
    expect(fixture<CliReadiness>("cli_readiness.json").state).toBe("ready");
    expect(fixture<ProjectLoad>("project_load_unreadable.json").state).toBe("unreadable");
    expect(fixture<UpdateResult>("update_result_conflict.json").state).toBe("conflict");
    expect(fixture<UpdateResult>("update_result_ran_failed.json").state).toBe("ran");
    // decision-6 / doc-8 §5: these two must stay tellable apart from `searched` with no commits, or
    // the screen reports 関連が無い over a search that never ran.
    expect(fixture<CommitSearch>("commit_search_no_repository.json").state).toBe("noRepository");
    expect(fixture<CommitSearch>("commit_search_unreadable.json").state).toBe("unreadable");
    expect(fixture<EditorReadiness>("editor_readiness.json").configured?.source).toBe("appSettings");
    expect(fixture<EditorLaunch>("editor_launch.json").method).toBe("association");
  });
});
