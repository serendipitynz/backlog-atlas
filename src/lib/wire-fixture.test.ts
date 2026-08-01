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
  AcceptanceCriterion,
  AppSettings,
  CliReadiness,
  Commit,
  CommandError,
  CommitSearch,
  Config,
  Decision,
  Document,
  EditorLaunch,
  EditorReadiness,
  Ledger,
  LedgerResponse,
  LoadedSettings,
  Milestone,
  ProjectEntry,
  ProjectLoad,
  ProjectSnapshot,
  PrRelation,
  PullRequestRef,
  RegisterResponse,
  ReloadEvent,
  RemoteHost,
  StatusMapping,
  Task,
  TaskHistory,
  TaskInterpretation,
  TaskView,
  TypeValue,
  UnknownSection,
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

/**
 * `T`'s keys, listed exhaustively — the compile-time half of the comparison, and the reason a hand
 * written list here is not a third declaration that can drift from the other two.
 *
 * The list is checked against `wire.ts` by tsc in both directions: a name that is not a key of `T` is
 * rejected, and a key of `T` that is *missing* from the list makes the call unassignable (the
 * parameter type collapses to a marker tuple naming the omission). Paired with the runtime assertion
 * against the recorded JSON, that is what closes the loop — a cast could not:
 *
 * - Rust renames a field → the recorded keys change → the runtime assertion fails → the list has to
 *   be edited → and the edited list does not compile until `wire.ts` carries the new name too.
 * - `wire.ts` renames a field → `keyof T` changes → the list stops compiling → and editing it to
 *   match fails the runtime assertion, because the recording still has the old name.
 *
 * So `wire.ts`, the Rust output, and this list cannot be brought into agreement two at a time.
 */
function keysOfType<T extends object>() {
  return <K extends readonly (keyof T)[]>(
    ...names: [keyof T] extends [K[number]]
      ? K
      : readonly ["a key of the type is missing from this list", Exclude<keyof T, K[number]>]
  ): string[] => (names as readonly (keyof T)[]).map(String).sort();
}

const LOADED = fixture<ProjectLoad>("project_load_loaded.json");

function snapshotOf(load: ProjectLoad): ProjectSnapshot {
  if (load.state !== "loaded") throw new Error(`expected a loaded root, got ${load.state}`);
  return load.project;
}

describe("Rust が記録した payload の項目が wire.ts と一致する", () => {
  // Every list below goes through `keysOfType`, so it is checked against `wire.ts` by tsc as well as
  // against the recording at run time. A field that appears on the Rust side cannot be absorbed by
  // editing one list — see `keysOfType`.

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
      "register_response.json",
      "reload_event.json",
      "task_history.json",
      "update_result_conflict.json",
      "update_result_ran_failed.json",
    ]);
  });

  it("ProjectSnapshot と Config", () => {
    expect(keysOf(snapshotOf(LOADED))).toEqual(
      keysOfType<ProjectSnapshot>()(
        "slug",
        "config",
        "tasks",
        "milestones",
        "documents",
        "decisions",
        "createStatusCandidates",
      ),
    );
    expect(keysOf(snapshotOf(LOADED).config)).toEqual(
      keysOfType<Config>()(
        "projectName",
        "taskPrefix",
        "statuses",
        "defaultStatus",
        "dateFormat",
      ),
    );
  });

  it("TaskView と Task", () => {
    const view: TaskView = snapshotOf(LOADED).tasks[0];
    expect(keysOf(view)).toEqual(keysOfType<TaskView>()("task", "interpretation"));
    expect(keysOf(view.interpretation)).toEqual(
      keysOfType<TaskInterpretation>()("status", "types", "pullRequests"),
    );
    expect(keysOf(view.task)).toEqual(
      keysOfType<Task>()(
        "sourcePath",
        "project",
        "storageState",
        "id",
        "title",
        "status",
        // `type` and not `typeLabels`: the Rust field is renamed for the wire, and doc-4 §3.3 keeps
        // Type apart from the label list — a rename here would merge two things the model separates.
        "type",
        "labels",
        "assignee",
        "priority",
        "ordinal",
        "milestone",
        "createdDate",
        "updatedDate",
        "dependencies",
        "documentation",
        "references",
        "description",
        "acceptanceCriteria",
        "implementationPlan",
        "implementationNotes",
        "unknownSections",
        "health",
      ),
    );
    // The nested shapes a card and the detail panel read field by field, so a rename inside one of
    // them cannot hide behind its container's key set.
    expect(keysOf(view.task.acceptanceCriteria[0])).toEqual(
      keysOfType<AcceptanceCriterion>()("number", "text", "checked"),
    );
    expect(keysOf(view.task.unknownSections[0])).toEqual(
      keysOfType<UnknownSection>()("name", "body"),
    );
    const mapping = view.interpretation.status;
    if (mapping === null) throw new Error("the recorded task has no status mapping");
    expect(keysOf(mapping)).toEqual(keysOfType<StatusMapping>()("raw", "column", "declaration"));
    expect(keysOf(view.interpretation.types[0])).toEqual(
      keysOfType<TypeValue>()("value", "known"),
    );
    expect(keysOf(view.interpretation.pullRequests[0])).toEqual(
      keysOfType<PullRequestRef>()("url", "host", "owner", "repo", "number"),
    );
  });

  it("Milestone と Document と Decision", () => {
    const snapshot = snapshotOf(LOADED);
    expect(keysOf(snapshot.milestones[0])).toEqual(
      keysOfType<Milestone>()("sourcePath", "id", "title", "description"),
    );
    expect(keysOf(snapshot.documents[0])).toEqual(
      keysOfType<Document>()(
        "sourcePath",
        "id",
        "title",
        "type",
        "tags",
        "createdDate",
        "updatedDate",
        "body",
      ),
    );
    // decision-4 keeps decisions out of `Document`: they carry `status`/`date` instead of
    // `type`/`tags`, and no `sourcePath` — which is exactly the kind of difference a shared key list
    // would paper over.
    expect(keysOf(snapshot.decisions[0])).toEqual(
      keysOfType<Decision>()("id", "title", "status", "date", "body"),
    );
  });

  it("Ledger と ProjectEntry — 台帳側は snake_case のまま", () => {
    const response = fixture<LedgerResponse>("ledger_response.json");
    expect(keysOf(response)).toEqual(keysOfType<LedgerResponse>()("ledger", "readOnly"));
    expect(keysOf(response.ledger)).toEqual(keysOfType<Ledger>()("schema_version", "project"));
    // doc-3 §2.2 keeps the ledger hand-editable, so its field names are the TOML's. `wire.ts`
    // mirrors them as they are rather than "correcting" them — a silent camelCasing here would read
    // every entry as undefined.
    expect(keysOf(response.ledger.project[0])).toEqual(
      keysOfType<ProjectEntry>()(
        "slug",
        "project_root",
        "backlog_root",
        "git_remote_present",
        "status_aliases",
      ),
    );
  });

  it("AppSettings — 設定ファイルのキーがそのまま IPC の項目名", () => {
    const loaded = fixture<LoadedSettings>("loaded_settings.json");
    expect(keysOf(loaded)).toEqual(keysOfType<LoadedSettings>()("settings", "status"));
    // `external_editor` is optional on both sides and skipped when unset, so the recording has to
    // carry it — an absent key here would let the optional field drop out unnoticed.
    expect(keysOf(loaded.settings)).toEqual(
      keysOfType<AppSettings>()(
        "schema_version",
        "theme",
        "card_density",
        "default_storage_filter",
        "default_detail_placement",
        "watch_external_changes",
        "external_editor",
      ),
    );
  });

  it("TaskHistory", () => {
    const history = fixture<TaskHistory>("task_history.json");
    expect(keysOf(history)).toEqual(keysOfType<TaskHistory>()("commits", "remote", "relations"));
    expect(keysOf(history.relations[0])).toEqual(
      keysOfType<PrRelation>()("pullRequest", "outcome"),
    );
    const remote = history.remote;
    if (remote === null) throw new Error("the recorded history has no remote");
    expect(keysOf(remote)).toEqual(keysOfType<RemoteHost>()("kind", "owner", "repo"));
    if (history.commits.state !== "searched") throw new Error("expected a searched commit list");
    expect(keysOf(history.commits.commits[0])).toEqual(
      keysOfType<Commit>()("id", "shortId", "summary", "date", "author"),
    );
  });

  it("RegisterResponse — 登録の応答", () => {
    // Its own payload rather than only its nested types: `ledger_register` is the one command whose
    // answer names the entry it created (doc-3 §3.1 lets the slug be derived), and a rename of the
    // outer `entry`/`ledger` pair is invisible in any other recording.
    const response = fixture<RegisterResponse>("register_response.json");
    expect(keysOf(response)).toEqual(keysOfType<RegisterResponse>()("entry", "ledger"));
    expect(response.entry.slug).toBe("atlas");
    expect(response.ledger.readOnly).toBe(false);
  });

  it("ReloadEvent — 再読込イベントの payload", () => {
    // The `project-reloaded` payload, which no command returns: the shell keys the new load by
    // `slug`, so a rename of either field would silently stop every watch-triggered re-read from
    // reaching a row.
    const event = fixture<ReloadEvent>("reload_event.json");
    expect(keysOf(event)).toEqual(keysOfType<ReloadEvent>()("slug", "load"));
    const rows = buildSwimlane({
      order: [event.slug],
      loads: new Map([[event.slug, event.load]]),
      hidden: new Set(),
      filter: defaultFilter(["active", "indeterminate"]),
    });
    expect(rows[0].state).toBe("loaded");
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
