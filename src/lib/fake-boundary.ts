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
  ExternalProgramReport,
  EditorReadiness,
  GitRemoteRead,
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
import { CONFIRMED_CLI_VERSION } from "./confirmed-version";

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
  /**
   * **Stated rather than left 言語未選択**, unlike every other field here. `null` means the OS decides
   * (`resolveLanguage`), and in `jsdom` that is `navigator.language` — so the component suite's
   * assertions would be against whichever 文言表 the runner's locale picked. They are written in
   * Japanese, so the fake says Japanese; a test about the other language sets it itself.
   */
  language: "ja",
  card_density: "m",
  default_storage_filter: ["active"],
  default_detail_placement: "sidebar",
  default_card_order: "priority_desc",
  watch_external_changes: true,
  collapsed_columns: [],
  folded_rows: [],
  hidden_rows: [],
};

function emptyLedger(): LedgerResponse {
  return { ledger: { schema_version: 1, project: [] }, readOnly: false };
}

/**
 * What the fake answers with. A test assigns only the fields its subject reads, which is the same
 * bargain `fixtures.ts` makes — everything else stays a value that keeps the screen quiet.
 */
export const answers = {
  cli: { state: "ready", version: CONFIRMED_CLI_VERSION } as CliReadiness,
  /** 解決結果の表示 (decision-29). Both 外部コマンド resolve and launch, which is the state a test that
   *  is not about them should not have to arrange. */
  externalPrograms: [
    {
      name: "backlog",
      program: "backlog",
      source: "onPath",
      outcome: { state: "launched", report: `Backlog.md v${CONFIRMED_CLI_VERSION}` },
    },
    {
      name: "git",
      program: "git",
      source: "onPath",
      outcome: { state: "launched", report: "git version 2.51.0" },
    },
    {
      name: "gh",
      program: "gh",
      source: "onPath",
      outcome: { state: "launched", report: "gh version 2.97.0" },
    },
  ] as ExternalProgramReport[],
  editor: { configured: null, association: "open" } as EditorReadiness,
  ledger: emptyLedger(),
  ledgerPath: "/config/ledger.toml",
  settings: { settings: DEFAULT_SETTINGS, status: { state: "stored" } } as LoadedSettings,
  settingsPath: "/config/settings.toml",
  /** Answers `settings_directory_present` — whether 場所を開く has a folder to open (doc-3 §2.1). */
  settingsDirectory: true,
  loads: [] as ProjectLoad[],
  /** Answers `git_remote_read` — the 概要区画's remote 現在値 (doc-10 §4.1). */
  gitRemote: { state: "remoteAbsent" } as GitRemoteRead,
  history: new Map<string, TaskHistory>(),
  /**
   * Holds `task_history_read` open, for a test about a read that has *not* answered yet — 取消 is
   * only about those. A flag rather than a per-task deferred: what the test needs is "this read is
   * still running", and no test needs two of them in different states at once.
   */
  historyNeverAnswers: false,
  /** Answers `update_apply`. Replaced with a `deferred` when a test needs to watch 保存中. */
  update: (_slug: string, _action: UpdateOperation[]): Promise<UpdateResult> =>
    Promise.reject(new Error("update_apply was not expected in this test")),
  /** Answers `project_watch_start`. Rejecting here is how 継続検出停止 is produced. */
  watchStart: (_slug: string): Promise<void> => Promise.resolve(),
  /**
   * Answers `body_link_open` (doc-8 §9.3). A replaceable function rather than a flag, because the
   * failure a test needs is a rejection *value* — the ⑤ 通知 quotes the boundary's sentence, so a
   * bare `true` could not stand in for it.
   */
  bodyLink: (_url: string): Promise<void> => Promise.resolve(),
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
  /**
   * Holds `settings_save` open, for the tests about a write that is still unresolved (保存の発行中は
   * どちらの出口も閉じない). A settable deferred rather than a flag, because the test has to end the
   * write as well as start it, and `null` is the ordinary "answers at once" case.
   */
  settingsSaveHold: null as Deferred<void> | null,
  /**
   * Holds handed to successive `cli_probe` calls, one each, in order. A queue rather than one flag so
   * a test can let the *second* probe finish first — the ordering a detached refresh has to survive.
   * A call made when the queue is empty resolves at once.
   */
  cliProbeHolds: [] as Deferred<void>[],
  /** Holds handed to successive `project_watch_stop` calls, for the same reason. */
  watchStopHolds: [] as Deferred<void>[],
  /** Holds handed to successive `external_programs_probe` calls, for the same reason. */
  externalProgramsHolds: [] as Deferred<void>[],
  /**
   * Make every `settings_save` reject, the way decision-13 refuses to overwrite a file newer than this
   * build. A flag rather than a replaceable function: `vi.mock` copies the references, so a fake swapped
   * in afterwards would never be the one the shell calls.
   */
  settingsSaveFails: false,
  /**
   * The same for `ledger_register` (登録の発行中は 2 つの出口とも閉じない). Its own deferred rather than
   * one shared with the save above: the two モーダル are held by two flags in the shell, and a single
   * hold could not tell a test that had wired them to one flag from one that had not.
   */
  ledgerRegisterHold: null as Deferred<void> | null,
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
  if (listeners.length === 0) {
    throw new Error("emitReload with no subscriber");
  }
  for (const listener of [...listeners]) {
    listener(event);
  }
}

export function reset(): void {
  calls.length = 0;
  listeners.length = 0;
  answers.cli = { state: "ready", version: CONFIRMED_CLI_VERSION };
  answers.externalPrograms = [
    {
      name: "backlog",
      program: "backlog",
      source: "onPath",
      outcome: { state: "launched", report: `Backlog.md v${CONFIRMED_CLI_VERSION}` },
    },
    {
      name: "git",
      program: "git",
      source: "onPath",
      outcome: { state: "launched", report: "git version 2.51.0" },
    },
    {
      name: "gh",
      program: "gh",
      source: "onPath",
      outcome: { state: "launched", report: "gh version 2.97.0" },
    },
  ];
  answers.editor = { configured: null, association: "open" };
  answers.ledger = emptyLedger();
  answers.ledgerPath = "/config/ledger.toml";
  answers.settings = { settings: { ...DEFAULT_SETTINGS }, status: { state: "stored" } };
  answers.settingsPath = "/config/settings.toml";
  answers.settingsDirectory = true;
  answers.loads = [];
  answers.gitRemote = { state: "remoteAbsent" };
  answers.history = new Map();
  answers.historyNeverAnswers = false;
  answers.update = () => Promise.reject(new Error("update_apply was not expected in this test"));
  answers.watchStart = () => Promise.resolve();
  answers.subscribeFails = false;
  answers.settingsReadFails = false;
  answers.settingsSaveHold = null;
  answers.cliProbeHolds = [];
  answers.watchStopHolds = [];
  answers.externalProgramsHolds = [];
  answers.settingsSaveFails = false;
  answers.ledgerRegisterHold = null;
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
  if (load.state !== "loaded") {
    throw new Error("snapshotOf on an unreadable load");
  }
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
    record("ledger_register", [request], async () => {
      if (answers.ledgerRegisterHold !== null) {
        await answers.ledgerRegisterHold.promise;
      }
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
      return { entry, ledger: answers.ledger };
    }),

  ledgerRemove: (slug: string): Promise<LedgerResponse> =>
    record("ledger_remove", [slug], () => Promise.resolve(answers.ledger)),

  ledgerUpdate: (request: UpdateRequest): Promise<LedgerResponse> =>
    record("ledger_update", [request], () => Promise.resolve(answers.ledger)),

  gitRemoteRead: (slug: string): Promise<GitRemoteRead> =>
    record("git_remote_read", [slug], () => Promise.resolve(answers.gitRemote)),

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
    record("project_watch_stop", [slug], async () => {
      const hold = answers.watchStopHolds.shift();
      if (hold !== undefined) {
        await hold.promise;
      }
    }),

  taskHistoryRead: (slug: string, taskId: string, readId: string): Promise<TaskHistory> =>
    record("task_history_read", [slug, taskId, readId], () => {
      if (answers.historyNeverAnswers) {
        return new Promise<TaskHistory>(() => {});
      }
      const found = answers.history.get(`${slug}:${taskId}`);
      return found === undefined
        ? Promise.reject(new Error(`task_history_read with no answer for ${slug}:${taskId}`))
        : Promise.resolve(found);
    }),

  taskHistoryCancel: (readId: string): Promise<void> =>
    record("task_history_cancel", [readId], () => Promise.resolve()),

  settingsRead: (): Promise<LoadedSettings> =>
    record("settings_read", [], () =>
      answers.settingsReadFails
        ? Promise.reject(new Error("settings channel is gone"))
        : Promise.resolve(answers.settings),
    ),

  settingsSave: (settings: AppSettings): Promise<LoadedSettings> =>
    record("settings_save", [settings], async () => {
      if (answers.settingsSaveHold !== null) {
        await answers.settingsSaveHold.promise;
      }
      if (answers.settingsSaveFails) {
        throw new Error("settings are read-only");
      }
      answers.settings = { settings, status: { state: "stored" } };
      return answers.settings;
    }),

  settingsLocation: (): Promise<string> =>
    record("settings_location", [], () => Promise.resolve(answers.settingsPath)),

  settingsDirectoryPresent: (): Promise<boolean> =>
    record("settings_directory_present", [], () => Promise.resolve(answers.settingsDirectory)),

  settingsLocationOpen: (): Promise<EditorLaunch> =>
    record("settings_location_open", [], () =>
      Promise.resolve({
        method: "association" as LaunchMethod,
        program: "open",
        args: [answers.settingsPath],
      }),
    ),

  cliProbe: (): Promise<CliReadiness> =>
    record("cli_probe", [], async () => {
      // Captured before the wait: the answer belongs to the moment the probe was issued, which is
      // what makes an out-of-order completion observable at all.
      const answer = answers.cli;
      const hold = answers.cliProbeHolds.shift();
      if (hold !== undefined) {
        await hold.promise;
      }
      return answer;
    }),

  externalProgramsProbe: (): Promise<ExternalProgramReport[]> =>
    record("external_programs_probe", [], async () => {
      // Captured before the wait, like `cli_probe`: the answer belongs to the moment the probe was
      // issued, which is what makes an out-of-order completion observable.
      const answer = answers.externalPrograms;
      const hold = answers.externalProgramsHolds.shift();
      if (hold !== undefined) {
        await hold.promise;
      }
      return answer;
    }),

  editorProbe: (): Promise<EditorReadiness> =>
    record("editor_probe", [], () => Promise.resolve(answers.editor)),

  taskFileOpen: (slug: string, sourcePath: string, method: LaunchMethod): Promise<EditorLaunch> =>
    record("task_file_open", [slug, sourcePath, method], () =>
      Promise.resolve({ method, program: "open", args: [sourcePath] }),
    ),

  /** 既定ブラウザ起動 (doc-8 §9.3). Resolves to nothing, like the command: this fake has no browser to
   *  bring forward, and the call itself — with the URL it was given — is what a test reads back. */
  bodyLinkOpen: (url: string): Promise<void> =>
    record("body_link_open", [url], () => answers.bodyLink(url)),

  updateApply: (slug: string, action: UpdateOperation[]): Promise<UpdateResult> =>
    record("update_apply", [slug, action], () => answers.update(slug, action)),

  // The window's own title (decision-31). Faked for the reason every call here is — it is IPC, and the
  // real one reaches Tauri's window plugin, which is not there under `jsdom`.
  //
  // **Not recorded**, unlike every other call in this module. `at()` answers with a position in the
  // recorded list, so a call landing in it shifts every later index — and this one is issued by an
  // effect on the first paint, ahead of the 起動時の順序 the tests here fix. It carries no contract
  // those tests are about: what the title says is `title.ts`'s rule, and when it is written is
  // whenever 総件数 or the current screen changed.
  windowTitleSet: (_title: string): Promise<void> => Promise.resolve(),

  onProjectReloaded: (handler: (event: ReloadEvent) => void): Promise<() => void> =>
    record("on_project_reloaded", [], () => {
      if (answers.subscribeFails) {
        return Promise.reject(new Error("no channel"));
      }
      listeners.push(handler);
      return Promise.resolve(() => {
        const at = listeners.indexOf(handler);
        if (at >= 0) {
          listeners.splice(at, 1);
        }
      });
    }),
};

/** The project config every fake snapshot carries, re-exported so a test needs one import fewer. */
export { CONFIG };
