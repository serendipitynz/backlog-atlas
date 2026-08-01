/**
 * A stand-in for the command boundary (TASK-91). Not imported by the app; the
 * `*.component.test.ts` files put it in front of `commands.ts` so `App.svelte` can be mounted
 * without a Tauri host.
 *
 * It replaces only the calls that cross the boundary. `asCommandError` and `isCommandError` stay
 * the real ones — they are rules, not IPC, and `src/lib/*.test.ts` already fixes them.
 *
 * Two things it does beyond answering:
 *
 * - It **records the order** of every call. 起動時の設定・workspace・監視の順序 is a contract about
 *   sequence and nothing else (doc-8 §7's 起動指定の解決順 depends on it, as does 既定の保存区分 being
 *   the filter the first cards are drawn through), so the order has to be observable to be fixed.
 * - It lets a test **hold a call open**. 保存中 is a state that only exists while a call is in
 *   flight, and a promise that has already resolved cannot be observed in it.
 */

import type {
  AppSettings,
  CliReadiness,
  EditorLaunch,
  EditorReadiness,
  LaunchMethod,
  LedgerResponse,
  LoadedSettings,
  ProjectEntry,
  ProjectLoad,
  ProjectSnapshot,
  RegisterRequest,
  RegisterResponse,
  ReloadEvent,
  TaskHistory,
  UpdateOperation,
  UpdateRequest,
  UpdateResult,
} from "./wire";
import { CONFIG } from "./fixtures";

/** One boundary call, in the order it was made. */
export interface Recorded {
  name: string;
  args: readonly unknown[];
}

export const calls: Recorded[] = [];

/** The names of the calls made so far — what an order assertion reads. */
export function order(): string[] {
  return calls.map((call) => call.name);
}

/** Every call recorded under `name`. */
export function madeTo(name: string): Recorded[] {
  return calls.filter((call) => call.name === name);
}

/** A promise a test resolves or rejects when it chooses. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DEFAULT_SETTINGS: AppSettings = {
  schema_version: 1,
  theme: null,
  card_density: "m",
  default_storage_filter: ["active"],
  default_detail_placement: "sidebar",
  watch_external_changes: true,
};

function emptyLedger(): LedgerResponse {
  return { ledger: { schema_version: 1, project: [] }, readOnly: false };
}

/**
 * What the fake answers with. A test assigns only the fields its subject reads, which is the same
 * bargain `fixtures.ts` makes — everything else stays a value that keeps the screen quiet.
 */
export const answers = {
  cli: { state: "ready", version: "1.48.0" } as CliReadiness,
  editor: { configured: null, association: "open" } as EditorReadiness,
  ledger: emptyLedger(),
  ledgerPath: "/config/ledger.toml",
  settings: { settings: DEFAULT_SETTINGS, status: { state: "stored" } } as LoadedSettings,
  settingsPath: "/config/settings.toml",
  loads: [] as ProjectLoad[],
  history: new Map<string, TaskHistory>(),
  /** Answers `update_apply`. Replaced with a `deferred` when a test needs to watch 保存中. */
  update: (_slug: string, _action: UpdateOperation[]): Promise<UpdateResult> =>
    Promise.reject(new Error("update_apply was not expected in this test")),
  /** Answers `project_watch_start`. Rejecting here is how 継続検出停止 is produced. */
  watchStart: (_slug: string): Promise<void> => Promise.resolve(),
  /**
   * Makes the `project-reloaded` subscription fail. A flag rather than a replaceable function,
   * because each test file spreads `commandFakes` into its `vi.mock` once — the function references
   * are copied then, so a later reassignment would not be seen.
   */
  subscribeFails: false,
  /**
   * Makes `settings_read` fail. Same reason as `subscribeFails` for being a flag — and it has to be
   * the *call* that rejects rather than a broken `settings` value, because the boundary already
   * degrades a missing or unreadable file to the defaults: only an IPC failure can reach the shell.
   */
  settingsReadFails: false,
};

/** The `project-reloaded` subscribers currently registered, in subscription order. */
const listeners: ((event: ReloadEvent) => void)[] = [];

/** True once the app has subscribed — the first thing 起動順序 requires (`App.svelte` onMount). */
export function subscribed(): boolean {
  return listeners.length > 0;
}

/**
 * Deliver a watch-triggered re-read, the way `commands::PROJECT_RELOADED_EVENT` would.
 *
 * Throws when nothing is listening rather than doing nothing: a test that fires into the void would
 * otherwise pass while asserting that a screen kept its selection — which it trivially would, having
 * never been re-read.
 */
export function emitReload(event: ReloadEvent): void {
  if (listeners.length === 0) throw new Error("emitReload with no subscriber");
  for (const listener of [...listeners]) listener(event);
}

export function reset(): void {
  calls.length = 0;
  listeners.length = 0;
  answers.cli = { state: "ready", version: "1.48.0" };
  answers.editor = { configured: null, association: "open" };
  answers.ledger = emptyLedger();
  answers.ledgerPath = "/config/ledger.toml";
  answers.settings = { settings: { ...DEFAULT_SETTINGS }, status: { state: "stored" } };
  answers.settingsPath = "/config/settings.toml";
  answers.loads = [];
  answers.history = new Map();
  answers.update = () => Promise.reject(new Error("update_apply was not expected in this test"));
  answers.watchStart = () => Promise.resolve();
  answers.subscribeFails = false;
  answers.settingsReadFails = false;
}

function record<T>(name: string, args: readonly unknown[], answer: () => T): T {
  calls.push({ name, args });
  return answer();
}

/** A ledger holding one entry per load, so the rows the workspace read have entries behind them. */
export function ledgerFor(...entries: LedgerResponse["ledger"]["project"]): LedgerResponse {
  return { ledger: { schema_version: 1, project: entries }, readOnly: false };
}

/** The snapshot a slug's load carries, for the tests that need to hand the same one back. */
export function snapshotOf(load: ProjectLoad): ProjectSnapshot {
  if (load.state !== "loaded") throw new Error("snapshotOf on an unreadable load");
  return load.project;
}

/**
 * The replacements themselves. Spread over the real module by each test file's `vi.mock`, so a
 * command added to `commands.ts` and not to this list keeps its real implementation and fails loudly
 * on the missing Tauri host, rather than silently answering nothing.
 */
export const commandFakes = {
  pickDirectory: (title: string): Promise<string | null> =>
    record("pick_directory", [title], () => Promise.resolve(null)),

  ledgerList: (): Promise<LedgerResponse> =>
    record("ledger_list", [], () => Promise.resolve(answers.ledger)),

  ledgerLocation: (): Promise<string> =>
    record("ledger_location", [], () => Promise.resolve(answers.ledgerPath)),

  ledgerDefaultSlug: (projectRoot: string): Promise<string | null> =>
    record("ledger_default_slug", [projectRoot], () => Promise.resolve(null)),

  ledgerRegister: (request: RegisterRequest): Promise<RegisterResponse> =>
    record("ledger_register", [request], () => {
      // The entry the ledger would have created, with the slug resolved: an absent one is derived
      // from the project-root directory name (doc-3 §3.1), which is the case a caller has to be able
      // to read back off the response rather than assume.
      const slug = request.slug ?? (request.project_root.split("/").pop() ?? "project");
      const entry: ProjectEntry = {
        slug,
        project_root: request.project_root,
        backlog_root: request.backlog_root ?? `${request.project_root}/backlog`,
        git_remote_present: false,
      };
      return Promise.resolve({ entry, ledger: answers.ledger });
    }),

  ledgerRemove: (slug: string): Promise<LedgerResponse> =>
    record("ledger_remove", [slug], () => Promise.resolve(answers.ledger)),

  ledgerUpdate: (request: UpdateRequest): Promise<LedgerResponse> =>
    record("ledger_update", [request], () => Promise.resolve(answers.ledger)),

  ledgerReorder: (slug: string, newIndex: number): Promise<LedgerResponse> =>
    record("ledger_reorder", [slug, newIndex], () => Promise.resolve(answers.ledger)),

  workspaceOpen: (): Promise<ProjectLoad[]> =>
    record("workspace_open", [], () => Promise.resolve(answers.loads)),

  projectOpen: (slug: string): Promise<ProjectSnapshot> =>
    record("project_open", [slug], () => {
      const load = answers.loads.find(
        (candidate) => candidate.state === "loaded" && candidate.project.slug === slug,
      );
      return load === undefined
        ? Promise.reject(new Error(`project_open on an unknown slug: ${slug}`))
        : Promise.resolve(snapshotOf(load));
    }),

  projectWatchStart: (slug: string): Promise<void> =>
    record("project_watch_start", [slug], () => answers.watchStart(slug)),

  projectWatchStop: (slug: string): Promise<void> =>
    record("project_watch_stop", [slug], () => Promise.resolve()),

  taskHistoryRead: (slug: string, taskId: string): Promise<TaskHistory> =>
    record("task_history_read", [slug, taskId], () => {
      const found = answers.history.get(`${slug}:${taskId}`);
      return found === undefined
        ? Promise.reject(new Error(`task_history_read with no answer for ${slug}:${taskId}`))
        : Promise.resolve(found);
    }),

  settingsRead: (): Promise<LoadedSettings> =>
    record("settings_read", [], () =>
      answers.settingsReadFails
        ? Promise.reject(new Error("settings channel is gone"))
        : Promise.resolve(answers.settings),
    ),

  settingsSave: (settings: AppSettings): Promise<LoadedSettings> =>
    record("settings_save", [settings], () => {
      answers.settings = { settings, status: { state: "stored" } };
      return Promise.resolve(answers.settings);
    }),

  settingsLocation: (): Promise<string> =>
    record("settings_location", [], () => Promise.resolve(answers.settingsPath)),

  cliProbe: (): Promise<CliReadiness> =>
    record("cli_probe", [], () => Promise.resolve(answers.cli)),

  editorProbe: (): Promise<EditorReadiness> =>
    record("editor_probe", [], () => Promise.resolve(answers.editor)),

  taskFileOpen: (slug: string, sourcePath: string, method: LaunchMethod): Promise<EditorLaunch> =>
    record("task_file_open", [slug, sourcePath, method], () =>
      Promise.resolve({ method, program: "open", args: [sourcePath] }),
    ),

  updateApply: (slug: string, action: UpdateOperation[]): Promise<UpdateResult> =>
    record("update_apply", [slug, action], () => answers.update(slug, action)),

  onProjectReloaded: (handler: (event: ReloadEvent) => void): Promise<() => void> =>
    record("on_project_reloaded", [], () => {
      if (answers.subscribeFails) return Promise.reject(new Error("no channel"));
      listeners.push(handler);
      return Promise.resolve(() => {
        const at = listeners.indexOf(handler);
        if (at >= 0) listeners.splice(at, 1);
      });
    }),
};

/** The project config every fake snapshot carries, re-exported so a test needs one import fewer. */
export { CONFIG };
