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
import { inconsistencyReasons, isInconsistent } from "./mark";
import { gitRemoteLine } from "./project-detail";
import { probeFailureText } from "./failure";
import { releaseNoticeText } from "./header";
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";
import type {
  AcceptanceCriterion,
  AppSettings,
  CliReadiness,
  Comment,
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
  ManagedFileKind,
  Milestone,
  ProjectEntry,
  ProjectLoad,
  ProjectSnapshot,
  PrRelation,
  PullRequestRef,
  RegisterResponse,
  ReleaseNotice,
  ReloadEvent,
  CardDensity,
  CardOrder,
  DetailPlacement,
  EditorSource,
  ExternalProgramReport,
  ExternalProgramSource,
  ProbeOutcome,
  GitRemoteRead,
  FailureKind,
  LaunchMethod,
  LedgerRefusal,
  LookupFailure,
  LaunchRefusal,
  BodyLinkRefusal,
  ImageRefusal,
  ProbeFailure,
  RemoteReadFailure,
  ReferenceKind,
  RelationOutcome,
  RemoteHost,
  RemoteHostKind,
  RequiredField,
  UnmappedFile,
  SettingsStatus,
  GridColumn,
  StatusColumn,
  StatusDeclaration,
  StatusMapping,
  StorageSelection,
  StorageState,
  FileHealth,
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
  if (value === null || typeof value !== "object") {
    throw new Error("not an object");
  }
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
 * a different one. An array reports **every** element's shape: `relations` is deliberately
 * heterogeneous — one entry per Pull Request outcome — so reducing a list to its first element would
 * leave the other variants' payload types uncompared, which is how a snake_case `after_secs` reached
 * the branch (PR #127 1R [P1]).
 */
type Shape = string | Shape[] | { [key: string]: Shape };

function shapeOf(value: unknown): Shape {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.map(shapeOf);
  }
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
  if (recorded === "null" || expected === "null") {
    return [];
  }
  if (Array.isArray(recorded) || Array.isArray(expected)) {
    if (!Array.isArray(recorded) || !Array.isArray(expected)) {
      return [`${at}: ${JSON.stringify(recorded)} vs ${JSON.stringify(expected)}`];
    }
    // Pairwise, up to the shorter list — an empty one on either side says nothing about its
    // element type, and a homogeneous recording is still served by a one-element exemplar.
    const pairs = Math.min(recorded.length, expected.length);
    return Array.from({ length: pairs }).flatMap((_, at_) =>
      shapeMismatches(recorded[at_], expected[at_], `${at}[${at_}]`),
    );
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

/**
 * The complete set of tokens serde emits for each union, recorded by
 * `src-tauri/src/wire_fixtures.rs`. This is what anchors the member lists below to *Rust* and not only
 * to `wire.ts`.
 *
 * A payload sample only exercises the variants it happens to carry — the recordings serialize
 * `StatusDeclaration::Declared` and never `Draft` — so renaming an unrecorded member's token on the
 * Rust side moved nothing any other check compares. With the whole set recorded, every member is
 * anchored: the Rust rename changes this file, and the comparison against the `unionValues` list
 * fails.
 */
const TOKENS = fixture<Record<string, string[]>>("wire_tokens.json");

/** Assert that Rust emits exactly the members `wire.ts` declares for this union. */
function sameTokens(name: string, listed: readonly string[]): void {
  const recorded = TOKENS[name];
  expect(recorded, `${name} is not in wire_tokens.json`).toBeDefined();
  expect([...recorded].sort(), name).toEqual([...listed].sort());
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
const GRID_COLUMNS = unionValues<GridColumn>()(
  "toDo",
  "inProgress",
  "inReview",
  "done",
  "unmapped",
);
const STATUS_DECLARATIONS = unionValues<StatusDeclaration>()(
  "declared",
  "draft",
  "undeclared",
  "noDeclaredSet",
);
const REFERENCE_KINDS = unionValues<ReferenceKind>()("milestone", "documentation", "reference");
const REQUIRED_FIELDS = unionValues<RequiredField>()("id", "title", "status");
const REMOTE_HOST_KINDS = unionValues<RemoteHostKind>()("gitHub");
const LAUNCH_METHODS = unionValues<LaunchMethod>()(
  "configured",
  "association",
  "vscode",
  "zed",
  "cotEditor",
  "notepadPlusPlus",
  "reveal",
  "terminal",
);
const EDITOR_SOURCES = unionValues<EditorSource>()("appSettings", "visual", "editor");
const EXTERNAL_PROGRAM_SOURCES = unionValues<ExternalProgramSource>()(
  "configured",
  "subPackage",
  "onPath",
);
const CARD_DENSITIES = unionValues<CardDensity>()("s", "m", "l");
const DETAIL_PLACEMENTS = unionValues<DetailPlacement>()("sidebar", "modal", "full");
const CARD_ORDERS = unionValues<CardOrder>()(
  "priority_asc",
  "priority_desc",
  "task_id_asc",
  "task_id_desc",
  "updated_asc",
  "updated_desc",
  "created_asc",
  "created_desc",
  "milestone_asc",
  "milestone_desc",
);
const MANAGED_FILE_KINDS = unionValues<ManagedFileKind>()(
  "milestone",
  "document",
  "decision",
);
// The 失敗理由符号 (decision-35 §3). Locked on the tag, like the variant tags below, because two of
// these four carry the value the screen names and so are no longer bare strings.
const LOOKUP_FAILURES = unionValues<LookupFailure["reason"]>()(
  "toolMissing",
  "invalidReference",
  "queryFailed",
  "timedOut",
);
const LAUNCH_REFUSALS = unionValues<LaunchRefusal["reason"]>()(
  "osRefused",
  "exited",
  "shellExecute",
  "comInit",
  "shellExecuteAbsent",
);
const BODY_LINK_REFUSALS = unionValues<BodyLinkRefusal["reason"]>()(
  "schemeNotAllowed",
  "controlCharacter",
  "launchFailed",
);
const IMAGE_REFUSALS = unionValues<ImageRefusal["reason"]>()(
  "outsideAssets",
  "absent",
  "unreadable",
);
const PROBE_FAILURES = unionValues<ProbeFailure["reason"]>()(
  "spawnFailed",
  "exited",
  "noResponse",
);
const REMOTE_READ_FAILURES = unionValues<RemoteReadFailure["reason"]>()(
  "gitUnavailable",
  "gitFailed",
  "remoteUrlEmpty",
);

// The variant tags. A tag is the field every consumer switches on, so a moved one is the change that
// silently sends a payload down the wrong branch — `wire.ts`'s unions are what these are locked to.
const HEALTH_STATES = unionValues<FileHealth["state"]>()("ok", "degraded");
const DEGRADE_EVENTS = unionValues<DegradeEvent["event"]>()(
  "unparseable",
  "unexpectedSchema",
  "danglingReference",
);
const LOAD_STATES = unionValues<ProjectLoad["state"]>()("loaded", "unreadable");
const GIT_REMOTE_STATES = unionValues<GitRemoteRead["state"]>()(
  "configured",
  "remoteAbsent",
  "noRepository",
  "unreadable",
);
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
const FAILURE_KINDS = unionValues<FailureKind["kind"]>()(
  "spawn",
  "nonZero",
  "timedOut",
  "write",
);
const CLI_STATES = unionValues<CliReadiness["state"]>()("ready", "unavailable", "unsupported");
const PROBE_OUTCOME_STATES = unionValues<ProbeOutcome["state"]>()("launched", "failed");
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
  "unknownManagedFile",
  "editorUnavailable",
  "editorLaunchFailed",
  "historyCancelled",
  "bodyLinkFailed",
  "bodyImageRefused",
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

const COMMENT_EXEMPLAR: Comment = { author: "someone", created: "2026-08-01 09:00", body: "x" };

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
  finalSummary: "It shipped.",
  definitionOfDone: [CRITERION_EXEMPLAR],
  comments: [COMMENT_EXEMPLAR],
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
      health: { state: "ok" },
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
      // Degraded on purpose: this is the recording that carries a non-task `FileHealth`
      // (decision-24). A document keeps id/title/body when only an optional field is out of range.
      health: {
        state: "degraded",
        events: [{ event: "unexpectedSchema", detail: "frontmatter `tags` is not a list" }],
      },
    },
  ],
  decisions: [
    {
      sourcePath: "/repos/atlas/backlog/decisions/decision-12 - colours.md",
      id: "decision-12",
      title: "Colour tokens",
      status: "accepted",
      date: "2026-07-10",
      body: "The tokens.",
      health: { state: "ok" },
    },
  ],
  unmappedFiles: [
    {
      sourcePath: "/repos/atlas/backlog/docs/doc-9 - broken.md",
      kind: "document",
      missingRequired: ["id", "title"],
      detail: "no closing frontmatter fence",
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
    language: "en",
    card_density: "l",
    default_storage_filter: ["active", "indeterminate"],
    default_detail_placement: "modal",
    default_card_order: "updated_desc",
    watch_external_changes: false,
    collapsed_columns: ["inReview", "unmapped"],
    folded_rows: ["atlas", "kanri"],
    hidden_rows: ["retired"],
    suppress_frontmatter_notice: true,
    backlog_cli: "/opt/backlog/backlog",
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
  // All four the recording carries, in its order, so every 失敗理由符号 payload is compared against
  // `wire.ts` and not only against the token list (which fixes the tag and nothing under it).
  relations: [
    {
      pullRequest: "https://example.test/pull/1",
      outcome: { state: "resolved", commitIds: ["0123456789abcdef0123456789abcdef01234567"] },
    },
    { pullRequest: "https://example.test/pull/2", outcome: { state: "hostUnsupported" } },
    {
      pullRequest: "https://example.test/pull/3",
      outcome: { state: "lookupFailed", reason: { reason: "timedOut", afterSecs: 15 }, detail: "" },
    },
    {
      pullRequest: "https://example.test/pull/4",
      outcome: {
        state: "lookupFailed",
        reason: { reason: "invalidReference", value: ".." },
        detail: "",
      },
    },
  ],
};

const LOADED = fixture<ProjectLoad>("project_load_loaded.json");

function snapshotOf(load: ProjectLoad): ProjectSnapshot {
  if (load.state !== "loaded") {
    throw new Error(`expected a loaded root, got ${load.state}`);
  }
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
      "external_program_report.json",
      "external_program_report_failed.json",
      "git_remote_read.json",
      "git_remote_read_unreadable.json",
      "ledger_response.json",
      "loaded_settings.json",
      "project_load_loaded.json",
      "project_load_unreadable.json",
      "register_response.json",
      "release_notice.json",
      "reload_event.json",
      "task_history.json",
      "update_result_conflict.json",
      "update_result_ran_failed.json",
      "update_result_ran_timed_out.json",
      "wire_tokens.json",
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
        "unmappedFiles",
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
        "finalSummary",
        "definitionOfDone",
        "comments",
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
    expect(keysOf(view.task.definitionOfDone[0])).toEqual(
      keysOfType<AcceptanceCriterion>()("number", "text", "checked"),
    );
    expect(keysOf(view.task.comments[0])).toEqual(
      keysOfType<Comment>()("author", "created", "body"),
    );
    const mapping = view.interpretation.status;
    if (mapping === null) {
      throw new Error("the recorded task has no status mapping");
    }
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
      keysOfType<Milestone>()("sourcePath", "id", "title", "description", "health"),
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
        "health",
      ),
    );
    // decision-4 keeps decisions out of `Document`: they carry `status`/`date` instead of
    // `type`/`tags` — which is exactly the kind of difference a shared key list would paper over.
    // `sourcePath` and `health` are the two TASK-88 gave all three kinds alike (decision-24).
    expect(keysOf(snapshot.decisions[0])).toEqual(
      keysOfType<Decision>()("sourcePath", "id", "title", "status", "date", "body", "health"),
    );
  });

  it("UnmappedFile — 写せなかったファイルは所在・種別・理由を運ぶ", () => {
    const snapshot = snapshotOf(LOADED);
    // AC #1: source path, kind and the reason it did not read. `event` is absent by design —
    // 解析不能 is the only event that produces one (decision-24).
    expect(keysOf(snapshot.unmappedFiles[0])).toEqual(
      keysOfType<UnmappedFile>()("sourcePath", "kind", "missingRequired", "detail"),
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
    // The three 外部コマンド指定 and `external_editor` are optional on both sides and skipped when
    // unset, so the recording has to carry them — an absent key here would let an optional field drop
    // out unnoticed.
    expect(keysOf(loaded.settings)).toEqual(
      keysOfType<AppSettings>()(
        "schema_version",
        "theme",
        "language",
        "card_density",
        "default_storage_filter",
        "default_detail_placement",
        "default_card_order",
        "watch_external_changes",
        "collapsed_columns",
        "folded_rows",
        "hidden_rows",
        "suppress_frontmatter_notice",
        "backlog_cli",
        "git_cli",
        "gh_cli",
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
    // The two 失敗理由符号 that carry a value, by their **key sets** rather than their value types.
    // The value-type comparison cannot see this: it walks only the keys both sides carry, so a field
    // renamed on one side is absent from the other and drops out of the walk entirely. That is how a
    // serde `rename_all` left off `LookupFailure::TimedOut` shipped `after_secs` against a `wire.ts`
    // reading `afterSecs`, with every other check green (PR #127 1R [P1]).
    for (const [at, listed] of [
      [2, keysOfType<Extract<LookupFailure, { reason: "timedOut" }>>()("reason", "afterSecs")],
      [3, keysOfType<Extract<LookupFailure, { reason: "invalidReference" }>>()("reason", "value")],
    ] as const) {
      const outcome = history.relations[at].outcome;
      if (outcome.state !== "lookupFailed") {
        throw new Error(`relations[${at}] is meant to be a failed lookup, got ${outcome.state}`);
      }
      expect(keysOf(outcome.reason), `relations[${at}].outcome.reason`).toEqual(listed);
    }
    const remote = history.remote;
    if (remote === null) {
      throw new Error("the recorded history has no remote");
    }
    expect(keysOf(remote)).toEqual(keysOfType<RemoteHost>()("kind", "owner", "repo"));
    if (history.commits.state !== "searched") {
      throw new Error("expected a searched commit list");
    }
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
      cardOrder: "priority_desc",
      inconsistent: () => false,
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

  it("GitRemoteRead", () => {
    // remote 現在値 (doc-10 §4.1). Two samples, because two variants carry fields; 不在 and 対象不在
    // reach here through `wire_tokens.json`, which is why both legs are needed.
    const read = fixture<GitRemoteRead>("git_remote_read.json");
    sameValueTypes("git_remote_read", read, {
      state: "configured",
      name: "origin",
      url: "git@github.com:serendipitynz/backlog-atlas.git",
    } satisfies GitRemoteRead);
    admits(GIT_REMOTE_STATES, read.state, "git_remote_read.state");

    // The failing side, whose 失敗理由符号 carries the remote's name — and whose `detail` is empty,
    // which the line has to word around rather than print.
    const unreadable = fixture<GitRemoteRead>("git_remote_read_unreadable.json");
    sameValueTypes("git_remote_read_unreadable", unreadable, {
      state: "unreadable",
      reason: { reason: "remoteUrlEmpty", name: "origin" },
      detail: "d",
    } satisfies GitRemoteRead);
    if (unreadable.state === "unreadable") {
      admits(REMOTE_READ_FAILURES, unreadable.reason.reason, "git_remote_read_unreadable.reason");
      expect(gitRemoteLine(unreadable).text).toContain("origin");
      expect(gitRemoteLine(unreadable).kind).toBe("failure");
    }
    // The frontend's own function runs over the payload, so the recording reaches the screen's line
    // and not only the type — the leg a shape comparison cannot supply.
    expect(gitRemoteLine(read)).toEqual({
      text: "git@github.com:serendipitynz/backlog-atlas.git",
      kind: "neutral",
      name: "origin",
      address: true,
    });
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
        reloadRequired: true,
      },
      project: null,
    } satisfies UpdateResult);
    // 期限到達 gets its own recording because `afterMs` appears in no other payload — without it the
    // field's type is anchored to `wire.ts` alone and a Rust-side change to it would pass (TASK-85).
    sameValueTypes(
      "update_result_ran_timed_out",
      fixture<UpdateResult>("update_result_ran_timed_out.json"),
      {
        state: "ran",
        outcome: {
          state: "failed",
          command: "task edit",
          kind: { kind: "timedOut", afterMs: 30000 },
          stderr: "the backlog CLI did not finish within 30 seconds, so Atlas stopped waiting for it",
          completedBefore: 0,
          reloadRequired: true,
        },
        project: null,
      } satisfies UpdateResult,
    );
  });

  it("動作確認済み版は 2 つの記録が同じ値を持つ (decision-27)", () => {
    // `confirmed-version.ts` reads the ready recording's `version` as Atlas's 動作確認済み版, which
    // holds only because `wire_fixtures.rs` builds that sample from `MIN_VERSION`. Here it is pinned
    // to the *other* recording of the same constant — `minimum`, the field that means the floor — so
    // rebuilding the ready sample with some higher version fails instead of quietly redefining the
    // value every test and fake reads.
    const errors = fixture<CommandError[]>("command_errors.json");
    const unavailable = errors.find((error) => error.kind === "updatesUnavailable");
    if (unavailable?.kind !== "updatesUnavailable") {
      throw new Error("no updatesUnavailable recorded");
    }
    if (unavailable.readiness.state !== "unsupported") {
      throw new Error("the recorded updatesUnavailable is the unsupported case");
    }
    expect(CONFIRMED_CLI_VERSION).toBe(unavailable.readiness.minimum);
  });

  it("ExternalProgramReport — 解決結果の表示", () => {
    // The 外部コマンド指定 case is the first recorded one, so `program` has a path to take a type
    // from; the failed outcome is the second, below. A recording exercises only the variants it
    // happens to carry, so what neither carries is anchored through `wire_tokens.json`.
    const report = fixture<ExternalProgramReport>("external_program_report.json");
    expect(keysOf(report)).toEqual(
      keysOfType<ExternalProgramReport>()("name", "program", "source", "outcome"),
    );
    sameValueTypes("external_program_report", report, {
      name: "git",
      program: "/usr/bin/git",
      source: "configured",
      outcome: { state: "launched", report: "git version 2.0.0" },
    } satisfies ExternalProgramReport);
    admits(EXTERNAL_PROGRAM_SOURCES, report.source, "external_program_report.source");
    admits(PROBE_OUTCOME_STATES, report.outcome.state, "external_program_report.outcome.state");

    // The failed outcome, whose 失敗理由符号 carries a `program` no token list anchors the type of.
    const failed = fixture<ExternalProgramReport>("external_program_report_failed.json");
    sameValueTypes("external_program_report_failed", failed, {
      name: "gh",
      program: "gh",
      source: "onPath",
      outcome: { state: "failed", reason: { reason: "spawnFailed", program: "gh" }, detail: "d" },
    } satisfies ExternalProgramReport);
    if (failed.outcome.state === "failed") {
      admits(PROBE_FAILURES, failed.outcome.reason.reason, "…_failed.outcome.reason");
      // The frontend's own function over the recording: the 文言表 is what words it now, so a
      // sentence coming out empty would mean the code reached no entry.
      expect(probeFailureText(failed.outcome.reason, failed.outcome.detail)).toContain("gh");
    }
  });

  it("ReleaseNotice — 版の告知", () => {
    const notice = fixture<ReleaseNotice>("release_notice.json");
    expect(keysOf(notice)).toEqual(keysOfType<ReleaseNotice>()("version"));
    sameValueTypes("release_notice", notice, { version: "1.2.3" } satisfies ReleaseNotice);
    // The frontend's own function over the recording (decision-44 §3): the 文言表 words the line, so a
    // sentence that did not carry the version would mean the catalog entry was reached with nothing.
    expect(releaseNoticeText(notice)).toContain(notice.version);
    // The other answer, which has no shape to record: `null` is 照会の縮退 and "already the published
    // build" at once, and the line says nothing for it.
    expect(releaseNoticeText(null)).toBeNull();
  });

  it("CliReadiness と外部エディタ経路", () => {
    sameValueTypes("cli_readiness", fixture<CliReadiness>("cli_readiness.json"), {
      state: "ready",
      version: CONFIRMED_CLI_VERSION,
    } satisfies CliReadiness);
    sameValueTypes("editor_readiness", fixture<EditorReadiness>("editor_readiness.json"), {
      configured: { source: "appSettings", program: "code", args: ["-w"] },
      methods: [{ method: "vscode", program: "open", product: "Visual Studio Code", edits: true }],
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
      {
        kind: "updatesUnavailable",
        readiness: { state: "unsupported", version: "1.20.0", minimum: CONFIRMED_CLI_VERSION },
      },
      { kind: "taskNotFound", slug: "atlas", task_id: "TASK-99" },
      { kind: "unknownManagedFile", slug: "atlas", path: "/elsewhere/evil.md" },
      { kind: "historyCancelled", read_id: "3f2a1c-7" },
      {
        kind: "editorLaunchFailed",
        method: "configured",
        program: "code",
        reason: { reason: "osRefused" },
        detail: "d",
      },
      {
        kind: "editorLaunchFailed",
        method: "association",
        program: "ShellExecuteW",
        reason: { reason: "shellExecute", code: 1 },
        detail: "d",
      },
      { kind: "editorUnavailable" },
      {
        kind: "bodyLinkFailed",
        reason: { reason: "launchFailed", program: "p", launch: { reason: "exited" } },
        detail: "d",
      },
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

describe("wire.ts の union メンバーが Rust の直列化と一致する", () => {
  // The third leg's missing half, and the one a payload sample cannot supply: a sample carries one
  // variant, so every *other* member of its union was anchored to `wire.ts` alone. Comparing the
  // recorded token set closes that for all of them at once — a Rust-side rename of a member no
  // recording exercises now fails here.

  const UNIONS: Record<string, readonly string[]> = {
    StorageState: STORAGE_STATES,
    StorageSelection: STORAGE_SELECTIONS,
    StatusColumn: STATUS_COLUMNS,
    StatusDeclaration: STATUS_DECLARATIONS,
    ReferenceKind: REFERENCE_KINDS,
    RequiredField: REQUIRED_FIELDS,
    ManagedFileKind: MANAGED_FILE_KINDS,
    RemoteHostKind: REMOTE_HOST_KINDS,
    LookupFailure: LOOKUP_FAILURES,
    LaunchMethod: LAUNCH_METHODS,
    EditorSource: EDITOR_SOURCES,
    ExternalProgramSource: EXTERNAL_PROGRAM_SOURCES,
    CardDensity: CARD_DENSITIES,
    DetailPlacement: DETAIL_PLACEMENTS,
    CardOrder: CARD_ORDERS,
    GridColumn: GRID_COLUMNS,
    FileHealth: HEALTH_STATES,
    DegradeEvent: DEGRADE_EVENTS,
    ProjectLoad: LOAD_STATES,
    CommitSearch: COMMIT_SEARCH_STATES,
    GitRemoteRead: GIT_REMOTE_STATES,
    RelationOutcome: RELATION_STATES,
    UpdateResult: UPDATE_STATES,
    UpdateOutcome: OUTCOME_STATES,
    FailureKind: FAILURE_KINDS,
    CliReadiness: CLI_STATES,
    ProbeOutcome: PROBE_OUTCOME_STATES,
    SettingsStatus: SETTINGS_STATES,
    CommandError: ERROR_KINDS,
    LedgerRefusal: REFUSAL_REASONS,
    LaunchRefusal: LAUNCH_REFUSALS,
    BodyLinkRefusal: BODY_LINK_REFUSALS,
    ImageRefusal: IMAGE_REFUSALS,
    ProbeFailure: PROBE_FAILURES,
    RemoteReadFailure: REMOTE_READ_FAILURES,
  };

  it("記録された union はすべてここで照合される", () => {
    // Both ways round: a union recorded on the Rust side with no list here would be an anchor nobody
    // reads, and a list here with nothing recorded would be locked to `wire.ts` alone — which is the
    // gap this whole block exists to close.
    expect(Object.keys(TOKENS).sort()).toEqual(Object.keys(UNIONS).sort());
  });

  for (const [name, listed] of Object.entries(UNIONS)) {
    it(name, () => sameTokens(name, listed));
  }
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
    admits(CARD_ORDERS, loaded.settings.default_card_order, "settings.default_card_order");
    for (const [at, column] of loaded.settings.collapsed_columns.entries()) {
      admits(GRID_COLUMNS, column, `settings.collapsed_columns[${at}]`);
    }
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
        admits(
          LOOKUP_FAILURES,
          relation.outcome.reason.reason,
          `relations[${at}].outcome.reason`,
        );
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
    // Every row's own token, not just the launch's: the rows are what the submenu draws, so a Rust-side
    // rename of one would otherwise be anchored to `wire.ts` alone.
    expect(readiness.methods.length).toBeGreaterThan(0);
    for (const [index, offer] of readiness.methods.entries()) {
      admits(LAUNCH_METHODS, offer.method, `editor_readiness.methods[${index}].method`);
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
      cardOrder: "priority_desc",
      inconsistent: () => false,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.slug).toBe("atlas");
    if (row.state !== "loaded") {
      throw new Error(`expected a loaded row, got ${row.state}`);
    }
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

  it("不整合印は記録した health から立ち、理由行がその中身を読む", () => {
    const [ok, broken] = snapshotOf(LOADED).tasks;

    // `health.state` is a tagged variant, so this fails if the tag key or its spelling moves; the
    // reason lines fail if a *event* tag or its payload field moves, which the tag alone would not
    // catch (decision-22 puts the payload on screen one line at a time).
    expect(isInconsistent(ok, null)).toBe(true);
    expect(isInconsistent(broken, null)).toBe(true);
    expect(inconsistencyReasons(ok, null).join(" ")).toContain("参照欠損: documentation");
    expect(inconsistencyReasons(broken, null).join(" ")).toContain("解析不能:");
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
    if (duplicate === undefined) {
      throw new Error("the duplicate-slug refusal is not recorded");
    }

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
    if (loaded.status.state !== "readOnly") {
      throw new Error("the recording is the readOnly case");
    }
    expect(statusNotice(loaded.status)).toContain(String(loaded.status.version));
    expect(saveAvailability(loaded.status).state).toBe("withheld");
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
