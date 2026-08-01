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
  DegradeEvent,
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
  CardDensity,
  DetailPlacement,
  EditorSource,
  FailureKind,
  LaunchMethod,
  LedgerRefusal,
  LookupFailure,
  ReferenceKind,
  RelationOutcome,
  RemoteHost,
  RemoteHostKind,
  RequiredField,
  SettingsStatus,
  StatusColumn,
  StatusDeclaration,
  StatusMapping,
  StorageSelection,
  StorageState,
  TaskHealth,
  UpdateOutcome,
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

/**
 * A value's *type* shape, ignoring what it holds: `"1000"` and `"m-1"` are the same shape, `1000` is
 * a different one. An array reports its first element's shape, which is enough here because the
 * recordings hold homogeneous lists.
 */
type Shape = string | Shape[] | { [key: string]: Shape };

function shapeOf(value: unknown): Shape {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? [] : [shapeOf(value[0])];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, held]) => [key, shapeOf(held)]),
    );
  }
  return typeof value;
}

/**
 * Where the recorded payload's value types differ from `expected`'s, as dotted paths.
 *
 * `expected` is always a value tsc has already checked against `wire.ts`, so this is the half the
 * key-set comparison cannot do: `keysOfType` fixes the field *names*, and a Rust field that changed
 * from a number to a string keeps its name. Both halves are needed, and both are anchored to
 * `wire.ts` rather than to a spec written here — change `Task["ordinal"]` to `string` and the
 * exemplar below stops compiling.
 *
 * `null` on either side agrees with anything, because almost every field on this wire is `X | null`
 * and which of the two a sample happens to carry is not the contract. What is left is exactly the
 * mismatch class this exists for: a field whose non-null type moved.
 */
function shapeMismatches(recorded: Shape, expected: Shape, at = ""): string[] {
  if (recorded === "null" || expected === "null") return [];
  if (Array.isArray(recorded) || Array.isArray(expected)) {
    if (!Array.isArray(recorded) || !Array.isArray(expected)) {
      return [`${at}: ${JSON.stringify(recorded)} vs ${JSON.stringify(expected)}`];
    }
    // An empty list on either side says nothing about its element type.
    return recorded.length === 0 || expected.length === 0
      ? []
      : shapeMismatches(recorded[0], expected[0], `${at}[]`);
  }
  if (typeof recorded === "object" || typeof expected === "object") {
    if (typeof recorded !== "object" || typeof expected !== "object") {
      return [`${at}: ${JSON.stringify(recorded)} vs ${JSON.stringify(expected)}`];
    }
    // Only the keys both carry: which optional fields a sample includes is the key-set comparison's
    // business, and a tagged union's variants legitimately differ here.
    return Object.keys(recorded)
      .filter((key) => key in expected)
      .flatMap((key) => shapeMismatches(recorded[key], expected[key], at === "" ? key : `${at}.${key}`));
  }
  return recorded === expected ? [] : [`${at}: ${recorded} vs ${expected}`];
}

/** Assert a recorded payload's value types against a `wire.ts`-typed exemplar. */
function sameValueTypes(name: string, recorded: unknown, exemplar: unknown): void {
  expect(shapeMismatches(shapeOf(recorded), shapeOf(exemplar)), name).toEqual([]);
}

/**
 * A string-literal union's members, listed exhaustively — the same bargain `keysOfType` strikes, for
 * values instead of keys.
 *
 * `shapeOf` folds every string down to `"string"`, which is what a value-type comparison has to do
 * for a free-form field like `title`. But a serde enum token and a variant tag are *not* free-form:
 * `"declaration": "bogus"` has the right shape and is still not a value `wire.ts` admits, so the
 * shape comparison cannot see a renamed or moved variant. This closes that.
 *
 * Locked to `wire.ts` in both directions by tsc, like the key lists: a value outside the union is
 * rejected, and a member missing from the list makes the call unassignable. So the admissible set
 * cannot be edited into agreement with a recording on its own.
 */
function unionValues<T extends string>() {
  return <V extends readonly T[]>(
    ...values: [T] extends [V[number]]
      ? V
      : readonly ["a member of the union is missing from this list", Exclude<T, V[number]>]
  ): readonly string[] => values as readonly string[];
}

/** Assert that a recorded value is one the union admits. `null` is a value in its own right. */
function admits(values: readonly string[], recorded: string | null, at: string): void {
  expect(recorded === null || values.includes(recorded), `${at}: ${String(recorded)}`).toBe(true);
}

const STORAGE_STATES = unionValues<StorageState>()("active", "draft", "completed", "archive");
const STORAGE_SELECTIONS = unionValues<StorageSelection>()(
  "active",
  "draft",
  "completed",
  "archive",
  "indeterminate",
);
const STATUS_COLUMNS = unionValues<StatusColumn>()("toDo", "inProgress", "inReview", "done");
const STATUS_DECLARATIONS = unionValues<StatusDeclaration>()(
  "declared",
  "draft",
  "undeclared",
  "noDeclaredSet",
);
const REFERENCE_KINDS = unionValues<ReferenceKind>()("milestone", "documentation", "reference");
const REQUIRED_FIELDS = unionValues<RequiredField>()("id", "title", "status");
const REMOTE_HOST_KINDS = unionValues<RemoteHostKind>()("gitHub");
const LAUNCH_METHODS = unionValues<LaunchMethod>()("configured", "association");
const EDITOR_SOURCES = unionValues<EditorSource>()("appSettings", "visual", "editor");
const CARD_DENSITIES = unionValues<CardDensity>()("s", "m", "l");
const DETAIL_PLACEMENTS = unionValues<DetailPlacement>()("sidebar", "modal", "full");
const LOOKUP_FAILURES = unionValues<LookupFailure>()(
  "toolMissing",
  "invalidReference",
  "queryFailed",
);

// The variant tags. A tag is the field every consumer switches on, so a moved one is the change that
// silently sends a payload down the wrong branch — `wire.ts`'s unions are what these are locked to.
const HEALTH_STATES = unionValues<TaskHealth["state"]>()("ok", "degraded");
const DEGRADE_EVENTS = unionValues<DegradeEvent["event"]>()(
  "unparseable",
  "unexpectedSchema",
  "danglingReference",
);
const LOAD_STATES = unionValues<ProjectLoad["state"]>()("loaded", "unreadable");
const COMMIT_SEARCH_STATES = unionValues<CommitSearch["state"]>()(
  "searched",
  "noRepository",
  "unreadable",
);
const RELATION_STATES = unionValues<RelationOutcome["state"]>()(
  "resolved",
  "hostUnsupported",
  "lookupFailed",
);
const UPDATE_STATES = unionValues<UpdateResult["state"]>()("conflict", "ran");
const OUTCOME_STATES = unionValues<UpdateOutcome["state"]>()("succeeded", "failed");
const FAILURE_KINDS = unionValues<FailureKind["kind"]>()("spawn", "nonZero");
const CLI_STATES = unionValues<CliReadiness["state"]>()("ready", "unavailable", "unsupported");
const SETTINGS_STATES = unionValues<SettingsStatus["state"]>()(
  "stored",
  "absent",
  "unreadable",
  "readOnly",
);
const ERROR_KINDS = unionValues<CommandError["kind"]>()(
  "ledger",
  "ledgerRefused",
  "settings",
  "rootUnreadable",
  "unknownProject",
  "projectNotOpen",
  "taskNotFound",
  "updatesUnavailable",
  "updateRejected",
  "uncheckableTarget",
  "reloadFailed",
  "versionProbeFailed",
  "watchFailed",
  "unknownTaskFile",
  "editorUnavailable",
  "editorLaunchFailed",
);
const REFUSAL_REASONS = unionValues<LedgerRefusal["reason"]>()(
  "readOnly",
  "backlogRootInvalid",
  "invalidSlug",
  "duplicateSlug",
  "slugNotFound",
  "nonAbsoluteRoot",
  "duplicateRoot",
  "invalidStatusAlias",
);

// --- the exemplars ------------------------------------------------------------------------------
//
// Each is annotated with its `wire.ts` type, so tsc is what decides its value types: none of these
// literals can carry a type `wire.ts` does not declare. That is what keeps them from being a third
// spec — the objection the key lists had before `keysOfType`.
//
// Every field is populated rather than left `null` where the type allows it. A `null` agrees with
// anything (see `shapeMismatches`), so a null-heavy exemplar would quietly check less and less.

const CRITERION_EXEMPLAR: AcceptanceCriterion = { number: 1, text: "x", checked: true };

const TASK_EXEMPLAR: Task = {
  sourcePath: "/repos/atlas/backlog/tasks/task-1 - a.md",
  project: "atlas",
  storageState: "active",
  id: "TASK-1",
  title: "A task",
  status: "In Progress",
  type: ["feature"],
  labels: ["ui"],
  assignee: ["someone"],
  priority: "high",
  ordinal: 1000,
  milestone: "m-1",
  createdDate: "2026-07-01 10:00",
  updatedDate: "2026-07-20 11:00",
  dependencies: ["TASK-2"],
  documentation: ["doc-7"],
  references: ["https://example.test/pull/1"],
  description: "What it is for.",
  acceptanceCriteria: [CRITERION_EXEMPLAR],
  implementationPlan: "Do it.",
  implementationNotes: "Done it.",
  unknownSections: [{ name: "REVIEW", body: "Kept." }],
  health: { state: "degraded", events: [{ event: "danglingReference", kind: "documentation", target: "doc-99" }] },
};

const SNAPSHOT_EXEMPLAR: ProjectSnapshot = {
  slug: "atlas",
  config: {
    projectName: "Atlas",
    taskPrefix: "TASK",
    statuses: ["To Do"],
    defaultStatus: "To Do",
    dateFormat: "yyyy-MM-dd",
  },
  tasks: [
    {
      task: TASK_EXEMPLAR,
      interpretation: {
        status: { raw: "In Progress", column: "inProgress", declaration: "declared" },
        types: [{ value: "feature", known: true }],
        pullRequests: [
          {
            url: "https://example.test/pull/1",
            host: "gitHub",
            owner: "serendipitynz",
            repo: "backlog-atlas",
            number: 1,
          },
        ],
      },
    },
  ],
  milestones: [
    {
      sourcePath: "/repos/atlas/backlog/milestones/m-1 - phase.md",
      id: "m-1",
      title: "Phase one",
      description: "The first phase.",
    },
  ],
  documents: [
    {
      sourcePath: "/repos/atlas/backlog/docs/doc-7 - screen.md",
      id: "doc-7",
      title: "Screen design",
      type: "specification",
      tags: ["ui"],
      createdDate: "2026-07-01 10:00",
      updatedDate: "2026-07-20 11:00",
      body: "The screen.",
    },
  ],
  decisions: [
    {
      id: "decision-12",
      title: "Colour tokens",
      status: "accepted",
      date: "2026-07-10",
      body: "The tokens.",
    },
  ],
  createStatusCandidates: [{ column: "toDo", statuses: ["To Do"] }],
};

const ENTRY_EXEMPLAR: ProjectEntry = {
  slug: "atlas",
  project_root: "/repos/atlas",
  backlog_root: "/repos/atlas/backlog",
  git_remote_present: true,
  status_aliases: { Doing: "inProgress" },
};

const LEDGER_EXEMPLAR: LedgerResponse = {
  ledger: { schema_version: 1, project: [ENTRY_EXEMPLAR] },
  readOnly: false,
};

const SETTINGS_EXEMPLAR: LoadedSettings = {
  settings: {
    schema_version: 1,
    theme: "nord",
    card_density: "l",
    default_storage_filter: ["active", "indeterminate"],
    default_detail_placement: "modal",
    watch_external_changes: false,
    external_editor: { program: "code", args: ["-w"] },
  },
  status: { state: "readOnly", version: 2 },
};

const HISTORY_EXEMPLAR: TaskHistory = {
  commits: {
    state: "searched",
    commits: [
      {
        id: "0123456789abcdef0123456789abcdef01234567",
        shortId: "0123456",
        summary: "TASK-1: do it",
        date: "2026-07-20T10:00:00+09:00",
        author: "Someone",
      },
    ],
  },
  remote: { kind: "gitHub", owner: "serendipitynz", repo: "backlog-atlas" },
  relations: [
    {
      pullRequest: "https://example.test/pull/1",
      outcome: { state: "resolved", commitIds: ["0123456789abcdef0123456789abcdef01234567"] },
    },
  ],
};

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

describe("記録した payload の値の型が wire.ts の宣言と一致する", () => {
  // The half `keysOfType` cannot do. A Rust field that changed from a number to a string keeps its
  // name, so the key comparison stays green — which is what this catches. Each exemplar is annotated
  // with its `wire.ts` type, so the types being compared against are the declarations themselves.

  it("ProjectLoad — スナップショット全体", () => {
    sameValueTypes("project_load_loaded", snapshotOf(LOADED), SNAPSHOT_EXEMPLAR);
  });

  it("ReloadEvent も同じスナップショットを運ぶ", () => {
    const event = fixture<ReloadEvent>("reload_event.json");
    sameValueTypes("reload_event", event, {
      slug: "atlas",
      load: { state: "loaded", project: SNAPSHOT_EXEMPLAR },
    } satisfies ReloadEvent);
  });

  it("Ledger と RegisterResponse", () => {
    sameValueTypes("ledger_response", fixture<LedgerResponse>("ledger_response.json"), LEDGER_EXEMPLAR);
    sameValueTypes("register_response", fixture<RegisterResponse>("register_response.json"), {
      entry: ENTRY_EXEMPLAR,
      ledger: LEDGER_EXEMPLAR,
    } satisfies RegisterResponse);
  });

  it("LoadedSettings", () => {
    sameValueTypes("loaded_settings", fixture<LoadedSettings>("loaded_settings.json"), SETTINGS_EXEMPLAR);
  });

  it("TaskHistory と CommitSearch の縮退", () => {
    sameValueTypes("task_history", fixture<TaskHistory>("task_history.json"), HISTORY_EXEMPLAR);
    sameValueTypes(
      "commit_search_no_repository",
      fixture<CommitSearch>("commit_search_no_repository.json"),
      { state: "noRepository", projectRoot: "/repos/atlas" } satisfies CommitSearch,
    );
    sameValueTypes(
      "commit_search_unreadable",
      fixture<CommitSearch>("commit_search_unreadable.json"),
      { state: "unreadable", detail: "git not found on PATH" } satisfies CommitSearch,
    );
  });

  it("UpdateResult", () => {
    sameValueTypes(
      "update_result_conflict",
      fixture<UpdateResult>("update_result_conflict.json"),
      {
        state: "conflict",
        diverged: ["tasks/task-1 - a.md"],
        unread: ["tasks/task-9 - new.md"],
        project: SNAPSHOT_EXEMPLAR,
      } satisfies UpdateResult,
    );
    sameValueTypes("update_result_ran_failed", fixture<UpdateResult>("update_result_ran_failed.json"), {
      state: "ran",
      outcome: {
        state: "failed",
        command: "task edit",
        kind: { kind: "nonZero", code: 1 },
        stderr: "no such task",
        completedBefore: 1,
        partial: true,
      },
      project: null,
    } satisfies UpdateResult);
  });

  it("CliReadiness と外部エディタ経路", () => {
    sameValueTypes("cli_readiness", fixture<CliReadiness>("cli_readiness.json"), {
      state: "ready",
      version: "1.47.1",
    } satisfies CliReadiness);
    sameValueTypes("editor_readiness", fixture<EditorReadiness>("editor_readiness.json"), {
      configured: { source: "appSettings", program: "code", args: ["-w"] },
      association: "open",
    } satisfies EditorReadiness);
    sameValueTypes("editor_launch", fixture<EditorLaunch>("editor_launch.json"), {
      method: "association",
      program: "open",
      args: ["/repos/atlas/backlog/tasks/task-1 - a.md"],
    } satisfies EditorLaunch);
  });

  it("CommandError の各変種", () => {
    // Compared one by one rather than as a list: the variants are a tagged union, so a single
    // exemplar would only ever describe the one whose tag it carries.
    const errors = fixture<CommandError[]>("command_errors.json");
    const exemplars: CommandError[] = [
      { kind: "ledgerRefused", reason: { reason: "duplicateSlug", slug: "atlas" }, detail: "d" },
      {
        kind: "ledgerRefused",
        reason: { reason: "invalidStatusAlias", key: "Doing", value: "nope" },
        detail: "d",
      },
      { kind: "updatesUnavailable", readiness: { state: "unsupported", version: "1.20.0", minimum: "1.47.0" } },
      { kind: "taskNotFound", slug: "atlas", task_id: "TASK-99" },
      { kind: "unknownTaskFile", slug: "atlas", path: "/elsewhere/evil.md" },
      { kind: "editorLaunchFailed", method: "configured", program: "code", detail: "d" },
    ];
    expect(errors).toHaveLength(exemplars.length);
    errors.forEach((error, at) => sameValueTypes(`command_errors[${at}]`, error, exemplars[at]));
  });

  it("ProjectLoad の unreadable 変種", () => {
    sameValueTypes("project_load_unreadable", fixture<ProjectLoad>("project_load_unreadable.json"), {
      state: "unreadable",
      slug: "gone",
      error: { kind: "rootUnreadable", slug: "gone", detail: "config.yml not found" },
    } satisfies ProjectLoad);
  });
});

describe("記録した enum・variant tag の値が wire.ts の union に収まる", () => {
  // What the shape comparison cannot see: `"bogus"` is a string, so it has the right *shape* and is
  // still not a value `wire.ts` admits. Every admissible set below is locked to `wire.ts` by
  // `unionValues`, so a renamed serde token fails here rather than reaching a `switch` that has no
  // branch for it.

  it("ProjectLoad — task と interpretation の enum", () => {
    admits(LOAD_STATES, LOADED.state, "project_load_loaded.state");
    const snapshot = snapshotOf(LOADED);
    for (const [at, view] of snapshot.tasks.entries()) {
      admits(STORAGE_STATES, view.task.storageState, `tasks[${at}].task.storageState`);
      admits(HEALTH_STATES, view.task.health.state, `tasks[${at}].task.health.state`);
      if (view.task.health.state === "degraded") {
        for (const [index, event] of view.task.health.events.entries()) {
          admits(DEGRADE_EVENTS, event.event, `tasks[${at}].health.events[${index}].event`);
          if (event.event === "danglingReference") {
            admits(REFERENCE_KINDS, event.kind, `tasks[${at}].health.events[${index}].kind`);
          }
          if (event.event === "unparseable") {
            for (const field of event.missingRequired) {
              admits(REQUIRED_FIELDS, field, `tasks[${at}].health.events[${index}].missingRequired`);
            }
          }
        }
      }
      const mapping = view.interpretation.status;
      if (mapping !== null) {
        admits(STATUS_COLUMNS, mapping.column, `tasks[${at}].interpretation.status.column`);
        admits(
          STATUS_DECLARATIONS,
          mapping.declaration,
          `tasks[${at}].interpretation.status.declaration`,
        );
      }
      for (const [index, reference] of view.interpretation.pullRequests.entries()) {
        admits(
          REMOTE_HOST_KINDS,
          reference.host,
          `tasks[${at}].interpretation.pullRequests[${index}].host`,
        );
      }
    }
    // 列の作成時 status 候補 (doc-7 §4.1): the boundary keys these by canonical column, so a moved
    // column token would silently offer a cell's 新規タスク入力 the wrong candidate set.
    for (const [at, candidate] of snapshot.createStatusCandidates.entries()) {
      admits(STATUS_COLUMNS, candidate.column, `createStatusCandidates[${at}].column`);
    }
    // The same tasks arrive on the reload path, so its copy is checked rather than assumed identical.
    const event = fixture<ReloadEvent>("reload_event.json");
    admits(LOAD_STATES, event.load.state, "reload_event.load.state");
  });

  it("AppSettings の選択値", () => {
    const loaded = fixture<LoadedSettings>("loaded_settings.json");
    admits(CARD_DENSITIES, loaded.settings.card_density, "settings.card_density");
    admits(
      DETAIL_PLACEMENTS,
      loaded.settings.default_detail_placement,
      "settings.default_detail_placement",
    );
    for (const [at, selection] of loaded.settings.default_storage_filter.entries()) {
      admits(STORAGE_SELECTIONS, selection, `settings.default_storage_filter[${at}]`);
    }
    admits(SETTINGS_STATES, loaded.status.state, "status.state");
  });

  it("TaskHistory の tag と remote", () => {
    const history = fixture<TaskHistory>("task_history.json");
    admits(COMMIT_SEARCH_STATES, history.commits.state, "commits.state");
    if (history.remote !== null) {
      admits(REMOTE_HOST_KINDS, history.remote.kind, "remote.kind");
    }
    for (const [at, relation] of history.relations.entries()) {
      admits(RELATION_STATES, relation.outcome.state, `relations[${at}].outcome.state`);
      if (relation.outcome.state === "lookupFailed") {
        admits(LOOKUP_FAILURES, relation.outcome.reason, `relations[${at}].outcome.reason`);
      }
    }
    admits(
      COMMIT_SEARCH_STATES,
      fixture<CommitSearch>("commit_search_no_repository.json").state,
      "commit_search_no_repository.state",
    );
    admits(
      COMMIT_SEARCH_STATES,
      fixture<CommitSearch>("commit_search_unreadable.json").state,
      "commit_search_unreadable.state",
    );
  });

  it("UpdateResult と CliReadiness の tag", () => {
    admits(
      UPDATE_STATES,
      fixture<UpdateResult>("update_result_conflict.json").state,
      "update_result_conflict.state",
    );
    const ran = fixture<UpdateResult>("update_result_ran_failed.json");
    admits(UPDATE_STATES, ran.state, "update_result_ran_failed.state");
    if (ran.state === "ran") {
      admits(OUTCOME_STATES, ran.outcome.state, "outcome.state");
      if (ran.outcome.state === "failed") {
        admits(FAILURE_KINDS, ran.outcome.kind.kind, "outcome.kind.kind");
      }
    }
    admits(CLI_STATES, fixture<CliReadiness>("cli_readiness.json").state, "cli_readiness.state");
  });

  it("外部エディタ経路の enum", () => {
    const readiness = fixture<EditorReadiness>("editor_readiness.json");
    if (readiness.configured !== null) {
      admits(EDITOR_SOURCES, readiness.configured.source, "editor_readiness.configured.source");
    }
    admits(
      LAUNCH_METHODS,
      fixture<EditorLaunch>("editor_launch.json").method,
      "editor_launch.method",
    );
  });

  it("CommandError の kind と拒否理由", () => {
    // The kinds and refusal reasons are the two the 台帳管理画面 switches on to pick a field to send
    // the user back to (doc-3 §3.1), so a moved token there is a form that can no longer be corrected.
    for (const [at, error] of fixture<CommandError[]>("command_errors.json").entries()) {
      admits(ERROR_KINDS, error.kind, `command_errors[${at}].kind`);
      if (error.kind === "ledgerRefused") {
        admits(REFUSAL_REASONS, error.reason.reason, `command_errors[${at}].reason.reason`);
      }
      if (error.kind === "updatesUnavailable") {
        admits(CLI_STATES, error.readiness.state, `command_errors[${at}].readiness.state`);
      }
      if (error.kind === "editorLaunchFailed") {
        admits(LAUNCH_METHODS, error.method, `command_errors[${at}].method`);
      }
    }
    const unreadable = fixture<ProjectLoad>("project_load_unreadable.json");
    admits(LOAD_STATES, unreadable.state, "project_load_unreadable.state");
    if (unreadable.state === "unreadable") {
      admits(ERROR_KINDS, unreadable.error.kind, "project_load_unreadable.error.kind");
    }
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
