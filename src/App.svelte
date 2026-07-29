<script lang="ts">
  // The swimlane screen's shell (TASK-34 / doc-7): it owns the data the grid draws and the
  // screen-local row state, and nothing else. All placement, ordering and filtering rules live
  // in `lib/swimlane.ts` and `lib/filter.ts` as pure functions.
  //
  // Row order is deliberately *not* screen state: it is the ledger's entry order (doc-3 §2.2),
  // and a reorder is written back through `ledger_update` (doc-7 §5 allows reflecting it
  // there), so the order the user arranges survives a restart. Row visibility is the opposite —
  // doc-7 §5 calls it 一時的 — so `hidden` never leaves this component.
  import { onDestroy, onMount, untrack } from "svelte";
  import FilterBar from "./components/FilterBar.svelte";
  import ProjectLedger from "./components/ProjectLedger.svelte";
  import ProjectManage from "./components/ProjectManage.svelte";
  import Settings from "./components/Settings.svelte";
  import Swimlane from "./components/Swimlane.svelte";
  import TaskDetail from "./components/TaskDetail.svelte";
  import {
    asCommandError,
    cliProbe,
    editorProbe,
    ledgerDefaultSlug,
    ledgerList,
    ledgerLocation,
    ledgerRegister,
    ledgerRemove,
    ledgerReorder,
    ledgerUpdate,
    onProjectReloaded,
    pickDirectory,
    projectOpen,
    projectWatchStart,
    projectWatchStop,
    settingsLocation,
    settingsRead,
    settingsSave,
    taskFileOpen,
    taskHistoryRead,
    updateApply,
    workspaceOpen,
  } from "./lib/commands";
  import { refusalReport, type LedgerActionResult } from "./lib/ledger";
  import type { HistoryState } from "./lib/detail";
  import { commandErrorDetail, failureDetail, type ApplyOutcome } from "./lib/edit";
  import type { IssueOutcome } from "./lib/manage";
  import { launchFailureDetail, type OpenOutcome } from "./lib/external-editor";
  import {
    conflictKeyOf,
    UNWATCHED_MARK,
    type ConflictTarget,
    type VersionConflict,
  } from "./lib/mark";
  import { createHistoryLoader, historyKeyOf, type HistoryRead } from "./lib/history-read";
  import { DEFAULT_FILTER, collectFacets, type CardFilter } from "./lib/filter";
  import { buildSwimlane, unreadableDetail } from "./lib/swimlane";
  import type {
    AppSettings,
    CliReadiness,
    EditorReadiness,
    LaunchMethod,
    LedgerResponse,
    LoadedSettings,
    ProjectEntry,
    ProjectLoad,
    ProjectSnapshot,
    RegisterRequest,
    TaskView,
    UpdateOperation,
    UpdateRequest,
  } from "./lib/wire";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  /** 利用者向け画面 (doc-7・doc-3 §4・doc-5 §3.2), one per top-level tab. */
  type Screen = "swimlane" | "ledger" | "manage";

  /**
   * Which screen is showing. The swimlane's own state (rows, filter, selection) lives in this shell,
   * so switching away and back keeps it; what does not survive is the other components' internal
   * state — including the detail panel's 編集セッション and the 管理画面's 文書編集セッション, which
   * is why leaving either while dirty asks first (doc-8 §6.3).
   */
  let screen = $state<Screen>("swimlane");
  let entries = $state<ProjectEntry[]>([]);
  /** The ledger file's path (doc-3 §2.1), for the 台帳管理画面 to show. `null` until it is known. */
  let ledgerPath = $state<string | null>(null);
  /**
   * アプリ設定 and why they are what they are (decision-13). `null` until the first read answers, which
   * is why the screen waits for it before opening any root: 継続検出の可否 and 既定の保存区分 decide what
   * the first read *does*, and applying them after the fact would start a watch the user turned off.
   */
  let settings = $state<LoadedSettings | null>(null);
  /** Where `settings.toml` is (decision-13), for the 設定画面 to name. `null` while unknown. */
  let settingsPath = $state<string | null>(null);
  /** Whether the 設定画面 is open. Opened from the fixed header's 設定 (doc-7 §2.1). */
  let settingsOpen = $state(false);
  let loadBySlug = $state<Record<string, ProjectLoad>>({});
  let hidden = $state<string[]>([]);
  let filter = $state<CardFilter>(DEFAULT_FILTER);
  let ledgerReadOnly = $state(false);
  let loading = $state(true);
  /** A failure that left the screen with nothing to draw, as opposed to one bad row. */
  let fatal = $state<string | null>(null);
  /** A failure of an action the user took; the grid stays usable. */
  let notice = $state<string | null>(null);
  /**
   * The open task, held as (slug, file path) rather than as the `TaskView` itself: a reload
   * replaces every view object, and a captured one would keep the detail panel showing the
   * task as it was read before the change (doc-9 §3 継続検出). The path is the key because a
   * 解析不能 task has no id (doc-4 §5) and must still be openable.
   */
  let selectedRef = $state<{ slug: string; sourcePath: string } | null>(null);
  /**
   * The Git 履歴 read the screen holds, tagged with the task and the call it came from. The panel
   * shows it only while its key matches the open task, so a selection change reads as 読み込み中
   * rather than as the previous task's commits; `history-read.ts` owns the other half — which of
   * several in-flight calls may store its answer.
   */
  let historyRead = $state<HistoryRead | null>(null);
  /**
   * Whether a supported `backlog` exists (doc-5 §5 縮退). `null` until the probe answers, which the
   * panel shows as "確認中" rather than as "no CLI" — the two lead to different user actions.
   */
  let readiness = $state<CliReadiness | null>(null);
  /**
   * Which 外部エディタ経路 launch methods this environment has (doc-8 §7). `null` until the probe
   * answers, which the panel shows as 確認中 rather than as "no editor" — the two differ in what the
   * user would do next.
   */
  let editorReadiness = $state<EditorReadiness | null>(null);
  /**
   * Roots whose 継続検出 is not running (doc-9 §3): the watch refused to start, so nothing pushes a
   * re-read for them and their cards are only as fresh as the last read. Recorded rather than merely
   * reported, because it changes what the screen owes the user — an explicit re-read they can press
   * (`rereadRow`), which is the only thing that will show an external save for such a root.
   */
  let unwatched = $state<string[]>([]);
  /**
   * Whether a watch-triggered re-read can reach the screen at all. The event subscription is the
   * frontend half of 継続検出 (doc-9 §3): without it every root's watch can run perfectly and still
   * change nothing here, because no one copies the emitted `ProjectLoad` into `loadBySlug`. Held
   * beside `unwatched` because it has the same consequence for the user (only an explicit re-read
   * refreshes anything) but no per-root cause — it makes *every* row stale.
   */
  let reloadFeed = $state<"live" | "unavailable">("live");
  /**
   * 版ずれ (doc-9) per task, keyed by (slug, source path). Owned by the shell rather than the panel
   * because the mark has to outlive the panel: a divergence observed while editing one task is
   * still true after the user goes to look at another, and the swimlane is where they would find it
   * again (AC #4 横断的に適用する). Cleared by the panel when the divergence is resolved — a clean
   * save, a restart from the latest read, a rebase onto it, or an acknowledgement.
   */
  let conflicts = $state<Record<string, VersionConflict>>({});
  /** True while the detail panel holds 未保存入力 — what makes leaving the panel ask first. */
  let detailDirty = $state(false);
  /**
   * True while the 文書・マイルストーン管理画面 holds 未保存入力 (its 文書編集セッション). Separate
   * from `detailDirty` because they belong to different screens: only the one being left has input to
   * protect, and one flag for both would ask about a panel that is not even mounted.
   */
  let manageDirty = $state(false);
  /**
   * Where the user asked to go while a screen held 未保存入力, held until they answer (doc-8 §6.3).
   * Screen changes are here rather than only the task selection: switching tabs unmounts the panel
   * holding the input, which discards it just as thoroughly as opening another task does.
   */
  let pendingLeave = $state<
    { to: "task"; slug: string; sourcePath: string } | { to: "screen"; screen: Screen } | null
  >(null);

  let unlisten: UnlistenFn | null = null;

  /** The operations that move a task between 保存区分 (doc-5 §3.3) — they invalidate a selection. */
  const TRANSITIONS: string[] = [
    "taskDemote",
    "taskArchive",
    "taskComplete",
    "draftPromote",
    "draftArchive",
  ];

  let order = $derived(entries.map((entry) => entry.slug));
  let loads = $derived(new Map(Object.entries(loadBySlug)));
  let rows = $derived(
    buildSwimlane({ order, loads, hidden: new Set(hidden), filter }),
  );
  let allViews = $derived(
    Object.values(loadBySlug).flatMap((load) =>
      load.state === "loaded" ? load.project.tasks : [],
    ),
  );
  let facets = $derived(collectFacets(allViews));
  let hasIndeterminateStorage = $derived(
    allViews.some((view) => view.task.storageState === null),
  );
  // 保存区分印 goes on cards only once a division beyond active is in play (doc-7 §3).
  let showStorageMark = $derived(filter.storage.some((state) => state !== "active"));
  let hiddenRows = $derived(hidden.filter((slug) => order.includes(slug)));
  /**
   * The projects the 管理画面 can act on: those whose root is currently readable, in ledger order.
   * A root Atlas cannot read has no document or milestone list to act on, and the boundary would
   * refuse an update against it (the project is not open) — so it is not offered as a target.
   */
  let loadedProjects = $derived(
    order.flatMap((slug) => {
      const load = loadBySlug[slug];
      return load?.state === "loaded" ? [load.project] : [];
    }),
  );
  /**
   * 継続検出の可否 (doc-9 §3.1, decision-13). Defaults to on until the settings are read, which is the
   * state a build without a settings file has always been in.
   */
  let watchEnabled = $derived(settings?.settings.watch_external_changes ?? true);
  /**
   * The rows an external change would not reach on its own, so the manual 再読込 is offered for them.
   * Three causes converge here: the user turned 継続検出 off (every row), the event subscription is
   * dead so nothing can arrive at all (every row), or a root's own watch would not start. doc-9 §3.1
   * requires exactly this — the state and its mark are the same however it came about, and only the
   * reason differs, which `unwatchedReason` below states. Only registered rows either way: a slug
   * that left the ledger has no row to re-read.
   */
  let unwatchedRows = $derived(
    !watchEnabled || reloadFeed === "unavailable"
      ? order
      : unwatched.filter((slug) => order.includes(slug)),
  );
  /** Why 継続検出 is stopped, for the 帯. The state's name and mark stay the same (doc-9 §3.1). */
  let unwatchedReason = $derived(
    !watchEnabled
      ? "設定で継続検出を切っているため、どの行も自動では更新されません"
      : reloadFeed === "unavailable"
        ? "変更の通知を購読できていないため、どの行も自動では更新されません"
        : "変更監視が動いていない行があります",
  );
  /** Whether the open task's root is one of those (AC #7: the 外部エディタ経路 states it before opening). */
  let selectedWatchStopped = $derived(
    selectedRef !== null && unwatchedRows.includes(selectedRef.slug),
  );

  // The open task, resolved against the *current* read of its root, so a reload refreshes the
  // panel instead of leaving it on the version the card was clicked from.
  let selectedSnapshot = $derived.by(() => {
    if (selectedRef === null) return null;
    const load = loadBySlug[selectedRef.slug];
    return load?.state === "loaded" ? load.project : null;
  });
  let selectedView = $derived.by(() => {
    const path = selectedRef?.sourcePath;
    if (path === undefined) return null;
    return selectedSnapshot?.tasks.find((view) => view.task.sourcePath === path) ?? null;
  });
  let selectedEntry = $derived(
    entries.find((entry) => entry.slug === selectedRef?.slug) ?? null,
  );
  /** The 版ずれ record for the open task, so the panel shows what its card shows. */
  let selectedConflict = $derived(
    selectedRef === null
      ? null
      : (conflicts[conflictKeyOf(selectedRef.slug, selectedRef.sourcePath)] ?? null),
  );
  /**
   * The last read that resolved the open selection. Kept because an external move — `task demote`
   * run in another window, an editor saving the file elsewhere — makes the current read stop
   * yielding the task, and doc-8 §6.4 does not let that take the panel's 未保存入力 with it.
   */
  let retained = $state<{ view: TaskView; snapshot: ProjectSnapshot } | null>(null);
  $effect(() => {
    if (selectedRef === null) retained = null;
    else if (selectedView !== null && selectedSnapshot !== null) {
      retained = { view: selectedView, snapshot: selectedSnapshot };
    }
  });
  /**
   * What the panel draws, and whether it is the current read. Deliberately one value rather than
   * two branches in the markup: moving between branches would destroy and recreate `TaskDetail`,
   * and with it the 編集セッション this exists to keep.
   */
  let shown = $derived.by(() => {
    if (selectedRef === null) return null;
    if (selectedView !== null && selectedSnapshot !== null) {
      return { view: selectedView, snapshot: selectedSnapshot, missing: false };
    }
    // Only while there is input to protect: with nothing unsaved, a task that left the read result
    // is better reported than shown from a stale read.
    return detailDirty && retained?.view.task.sourcePath === selectedRef.sourcePath
      ? { view: retained.view, snapshot: retained.snapshot, missing: true }
      : null;
  });
  /**
   * Which task a Git 履歴 read belongs to. `null` when there is nothing to read: no selection, or
   * a task with no TASK-ID — コミット検索 keys on the id (doc-6 §3), while the References-derived
   * PR 区画 needs no Git read at all. Serialized rather than concatenated, so no two (slug, id)
   * pairs can collide into one key — and with no separator byte that would make this file binary.
   */
  let historyKey = $derived(
    selectedView === null || selectedView.task.id === null
      ? null
      : historyKeyOf(selectedView.task.project, selectedView.task.id),
  );
  /** The read belonging to the *current* selection; anything else counts as not yet read. */
  let history = $derived.by((): HistoryState => {
    if (selectedView !== null && selectedView.task.id === null) return { state: "noTaskId" };
    return historyRead !== null && historyRead.key === historyKey
      ? historyRead.value
      : { state: "loading" };
  });

  onMount(async () => {
    // Subscribed before the first read so a change landing during startup is not missed.
    // Failing to subscribe is the same kind of failure as a watch that will not start — the
    // screen is one read behind, not unusable — so it must not take the first read down with
    // it, which would leave 読み込み中 on screen over a workspace that reads perfectly well.
    // It is *recorded* for the same reason a failed watch is: with no listener, every root's watch
    // can run and still change nothing here, so the only thing that refreshes any row is the manual
    // re-read — which the screen then has to offer for all of them (`unwatchedRows`).
    try {
      unlisten = await onProjectReloaded((event) => {
        loadBySlug[event.slug] = event.load;
      });
    } catch (error) {
      reloadFeed = "unavailable";
      notice = `変更の通知を購読できません（${unreadableDetail(asCommandError(error))}）`;
    }
    // Probed once and not per edit: it decides whether edit controls are offered at all (doc-5 §5),
    // and a probe per keystroke-worth of UI would spawn a process for a question that does not
    // change while the app runs.
    try {
      readiness = await cliProbe();
    } catch (error) {
      readiness = { state: "unavailable", detail: unreadableDetail(asCommandError(error)) };
    }
    // The ledger file's location (doc-3 §2.1). One path resolution, and it cannot change while the
    // app runs, so it is read once here rather than each time the 台帳管理画面 opens. A failure leaves
    // it `null`, which that screen shows as 確認中 — it withholds no control, since knowing the path
    // is not what makes an edit possible.
    try {
      ledgerPath = await ledgerLocation();
    } catch {
      ledgerPath = null;
    }
    // アプリ設定 (decision-13), before the first read: 継続検出の可否 decides whether `load` starts any
    // watch, and 既定の保存区分 is the filter the first cards are drawn through. Awaited rather than
    // applied later, so the screen never briefly runs on settings the user changed away from.
    // A rejection here is not fatal either (AC #6): the boundary already degrades a missing or broken
    // file to the defaults, so this only fires if the IPC call itself failed, and the defaults stand.
    try {
      applySettings(await settingsRead());
    } catch (error) {
      notice = `設定を読み込めませんでした（${unreadableDetail(asCommandError(error))}）。既定値で動きます。`;
    }
    try {
      settingsPath = await settingsLocation();
    } catch {
      settingsPath = null;
    }
    // 外部エディタ経路 (doc-8 §7): one environment read, so it is probed once beside the CLI probe.
    // Probed *after* the settings are read, because doc-8 §7's 起動指定の解決順 starts at アプリ設定 —
    // probing first would report `$EDITOR` as the editor in effect when a setting outranks it.
    // Left `null` on failure — the panel then withholds both launch controls as 確認中, which is what
    // the state actually is; the notice says why it will stay that way.
    try {
      editorReadiness = await editorProbe();
    } catch (error) {
      notice = `外部エディタの確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
    }
    await load();
  });

  onDestroy(() => {
    unlisten?.();
    // Best-effort: the watches would end with the process anyway, but a dev-server reload
    // leaves the Rust side running, and a second start would otherwise be a no-op on a stale
    // watch.
    for (const slug of order) void projectWatchStop(slug).catch(() => {});
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      applyLedger(await ledgerList());

      const opened = await workspaceOpen();
      const next: Record<string, ProjectLoad> = {};
      for (const outcome of opened) {
        next[outcome.state === "loaded" ? outcome.project.slug : outcome.slug] = outcome;
      }
      loadBySlug = next;
      fatal = null;

      // 継続検出 (doc-9 §3) for every root that opened: the boundary pushes each re-read on
      // `project-reloaded`, which is what keeps the cards' 安定並び in step with the files
      // (doc-7 §7). Idempotent, so a retry can call it again.
      for (const slug of Object.keys(next)) void startWatch(slug);
    } catch (error) {
      fatal = unreadableDetail(asCommandError(error));
    } finally {
      loading = false;
    }
  }

  // --- アプリ設定 (decision-13, TASK-46) ------------------------------------------------------

  /**
   * Adopt a settings value the boundary returned, and apply the parts the shell owns.
   *
   * Only 既定の保存区分 is applied to live state, and only when the filter is still the one the
   * settings put there: it is an *initial* value (doc-7 §5.2), so overwriting a filter the user has
   * since narrowed would undo their work at the moment they pressed 保存 in another panel. 継続検出の
   * 可否 is read straight off `settings` by `watchEnabled`; the other three items are stored for the
   * screens that consume them (表示テーマ・カード情報量・既定の詳細配置).
   */
  function applySettings(next: LoadedSettings): void {
    const previous = settings?.settings.default_storage_filter ?? DEFAULT_FILTER.storage;
    const untouched = sameStorage(filter.storage, previous);
    settings = next;
    if (untouched) filter = { ...filter, storage: [...next.settings.default_storage_filter] };
  }

  function sameStorage(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  /**
   * Persist アプリ設定 (AC #3) and make the change take effect now. Returns the failure text, or `null`
   * on success — the 設定画面 states it, the shell only owns the consequences.
   *
   * 継続検出 is the one item with a consequence beyond the value: turning it off has to stop the watches
   * that are already running (otherwise the setting would only take effect on the next start, while
   * the screen already says the rows are stale), and turning it on has to start them for every open
   * root.
   */
  async function saveSettings(next: AppSettings): Promise<string | null> {
    try {
      const before = watchEnabled;
      applySettings(await settingsSave(next));
      if (before !== watchEnabled) await reconcileWatches();
      // 起動指定の解決順 starts at アプリ設定 (doc-8 §7), so the probe's answer changes with this save.
      // Re-probed here rather than left until the next start: the panel names the editor it would
      // launch, and a stale name would say `$EDITOR` while the launch used the setting just typed.
      try {
        editorReadiness = await editorProbe();
      } catch (error) {
        notice = `外部エディタの確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
      }
      return null;
    } catch (error) {
      return unreadableDetail(asCommandError(error));
    }
  }

  /** Bring every registered root's watch in line with 継続検出の可否 (doc-9 §3.1). */
  async function reconcileWatches(): Promise<void> {
    for (const slug of order) {
      if (watchEnabled) await startWatch(slug);
      else await projectWatchStop(slug).catch(() => {});
    }
    // Nothing is watched while the setting is off, so per-root failures recorded earlier no longer
    // describe anything: `unwatchedRows` already covers every row from the setting alone.
    if (!watchEnabled) unwatched = [];
  }

  /**
   * Start 継続検出 for one root, reporting whether it is running (doc-9 §3). A failed watch is not a
   * failed read: the row's cards are already on screen and only stay as fresh as the last read, so it
   * is reported, not escalated — but it is *recorded*, because from then on the only thing that
   * refreshes that root is an explicit re-read, and the screen has to offer one (`unwatched` below).
   */
  async function startWatch(slug: string): Promise<boolean> {
    // 継続検出を切っている間は張らない (doc-9 §3.1). Reported as "not watching" without a notice: the
    // user chose it, and `unwatchedRows` already carries every row while the setting is off, so the
    // 帯 states the reason once instead of once per root.
    if (!watchEnabled) return false;
    try {
      await projectWatchStart(slug);
      unwatched = unwatched.filter((candidate) => candidate !== slug);
      return true;
    } catch (error) {
      notice = `${slug}: 変更監視を開始できません（${unreadableDetail(asCommandError(error))}）`;
      if (!unwatched.includes(slug)) unwatched = [...unwatched, slug];
      return false;
    }
  }

  /** Retry one ルート読取不能 row (doc-7 §6). Other rows are untouched either way. */
  async function retry(slug: string): Promise<void> {
    try {
      const project = await projectOpen(slug);
      loadBySlug[slug] = { state: "loaded", project };
      notice = null;
      // Awaited, so a root re-read whose watch still refuses to start stays listed as 監視なし
      // instead of looking recovered (the notice `startWatch` sets is the report).
      await startWatch(slug);
    } catch (error) {
      const commandError = asCommandError(error);
      loadBySlug[slug] = { state: "unreadable", slug, error: commandError };
    }
  }

  /**
   * Re-read one root on demand — the manual counterpart of 継続検出 (doc-9 §3 の再読込契機). Needed
   * because a root whose watch will not start has nothing else that refreshes it: re-selecting a task
   * only resolves it out of the snapshot already in hand, so without this the screen could tell the
   * user to "look again" at a model that never changes. Shares `retry`'s path: `projectOpen` *is* the
   * re-read (doc-9 §3 funnels every trigger through one reload), and it retries the watch as well.
   */
  async function rereadRow(slug: string): Promise<void> {
    await retry(slug);
  }

  /**
   * Move a row past its nearest *visible* neighbour. Using the neighbour's ledger index rather
   * than `index ± 1` is what makes the button do what it looks like it does when rows in
   * between are hidden — those rows keep their ledger position, and the moved row lands on the
   * other side of the row the user can actually see.
   */
  async function move(slug: string, direction: -1 | 1): Promise<void> {
    const visible = order.filter((candidate) => !hidden.includes(candidate));
    const neighbour = visible[visible.indexOf(slug) + direction];
    if (neighbour === undefined) return;
    // A reorder writes the ledger like any other operation, so it queues behind one in flight
    // (`ledgerBusy`) rather than racing it. Reported rather than dropped: the row visibly did not
    // move, and the neighbour it would have passed may be different by the time the other finishes.
    if (ledgerBusy) {
      notice = "ほかの台帳操作が完了するまで待ってください。";
      return;
    }
    ledgerBusy = true;
    try {
      applyLedger(await ledgerReorder(slug, order.indexOf(neighbour)));
      notice = null;
    } catch (error) {
      notice = `行の並べ替えに失敗しました: ${unreadableDetail(asCommandError(error))}`;
    } finally {
      ledgerBusy = false;
    }
  }

  // --- 台帳操作 (doc-3 §4, TASK-39) ----------------------------------------------------------
  //
  // The shell issues these rather than the 台帳管理画面 itself, for the same reason it owns `apply`:
  // the rows, the open sessions and the watches are here, and a ledger change moves all three. The
  // screen gets back only whether the operation was done or refused, and with which reason.

  /**
   * True while a ledger command is in flight. Ledger operations are issued one at a time on purpose:
   * each command returns the ledger *it* wrote, and two in flight can answer out of order — the
   * boundary releases its lifecycle lock before joining a detached watch thread, so a removal can
   * reply after a registration that wrote later. `applyLedger` would then adopt the earlier
   * snapshot and drop an entry the ledger actually holds, until the next read put it back.
   *
   * Serializing at the point of issue is what keeps response order equal to write order, and it has
   * to live here rather than in the 台帳管理画面: the swimlane's row reorder writes the ledger too, so
   * a per-screen guard would leave that caller racing the others.
   */
  let ledgerBusy = $state(false);

  /** The answer to a ledger action asked for while another was still in flight. */
  const LEDGER_BUSY_RESULT: LedgerActionResult = {
    state: "refused",
    report: { message: "ほかの台帳操作が完了するまで待ってください。", field: null },
  };

  /** Adopt a ledger the boundary just returned: the row order and the read-only state come with it. */
  function applyLedger(response: LedgerResponse): void {
    entries = response.ledger.project;
    ledgerReadOnly = response.readOnly;
  }

  /**
   * Register a project (doc-3 §4.1) and read it into its row. `retry` is the read: it is the same
   * "open this one root and start its watch" path a failed row uses, and a newly registered root is
   * in exactly that position — nothing has been read for it yet.
   */
  async function registerProject(request: RegisterRequest): Promise<LedgerActionResult> {
    if (ledgerBusy) return LEDGER_BUSY_RESULT;
    ledgerBusy = true;
    try {
      const response = await ledgerRegister(request);
      applyLedger(response.ledger);
      await retry(response.entry.slug);
      return { state: "done", slug: response.entry.slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
    }
  }

  /**
   * Remove a project from the ledger (doc-3 §4.2) and let go of its row. The boundary has already
   * closed its session and stopped its watch; what is left here is the screen state keyed by that
   * slug, which would otherwise keep a row — and a 版ずれ mark — for a project Atlas no longer reads.
   */
  async function removeProject(slug: string): Promise<LedgerActionResult> {
    if (ledgerBusy) return LEDGER_BUSY_RESULT;
    ledgerBusy = true;
    try {
      applyLedger(await ledgerRemove(slug));
      const { [slug]: _dropped, ...remaining } = loadBySlug;
      loadBySlug = remaining;
      hidden = hidden.filter((candidate) => candidate !== slug);
      unwatched = unwatched.filter((candidate) => candidate !== slug);
      conflicts = Object.fromEntries(
        // The key is `JSON.stringify([slug, path])` (`mark.ts`), so the slug is its first element.
        Object.entries(conflicts).filter(([key]) => JSON.parse(key)[0] !== slug),
      );
      if (selectedRef?.slug === slug) {
        selectedRef = null;
        detailDirty = false;
      }
      return { state: "done", slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
    }
  }

  /**
   * Update one ledger entry (doc-3 §4.3). Every change but a reorder is followed by a re-read of that
   * root, because both kinds of change invalidate what the row is showing: a move makes the model a
   * model of the old files (the boundary closes the session for that reason), and a 別名表 edit changes
   * the interpretation the snapshot was built with — the column a task sits in (doc-7 §4). A reorder
   * touches neither, so it only reorders the rows.
   */
  async function updateProject(request: UpdateRequest): Promise<LedgerActionResult> {
    if (ledgerBusy) return LEDGER_BUSY_RESULT;
    ledgerBusy = true;
    try {
      applyLedger(await ledgerUpdate(request));
      const reorderOnly = Object.keys(request).every(
        (key) => key === "slug" || key === "new_index",
      );
      if (!reorderOnly) await retry(request.slug);
      return { state: "done", slug: request.slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
    }
  }

  /** True when leaving `screen` would discard 未保存入力 held by whatever it has mounted. */
  function dirtyOn(current: Screen): boolean {
    if (current === "swimlane") return detailDirty;
    return current === "manage" && manageDirty;
  }

  /**
   * Go to another screen. Asks first while the one being left holds 未保存入力 (doc-8 §6.3): its
   * panel is unmounted on the way, so the input is gone as surely as if another task had been opened.
   */
  function goToScreen(next: Screen): void {
    if (next === screen) return;
    if (dirtyOn(screen)) {
      pendingLeave = { to: "screen", screen: next };
      return;
    }
    screen = next;
  }

  /** Take the exit the user just confirmed, discarding the panel's 未保存入力 (doc-8 §6.3). */
  function leaveConfirmed(): void {
    const target = pendingLeave;
    pendingLeave = null;
    if (target === null) return;
    if (target.to === "task") {
      selectedRef = { slug: target.slug, sourcePath: target.sourcePath };
      return;
    }
    // The panel holding the input is unmounted from here, so its `ondirty` will not run again to
    // retract the flag. The task selection itself is kept: coming back reopens the task, with a
    // fresh 編集セッション.
    if (screen === "swimlane") detailDirty = false;
    else if (screen === "manage") manageDirty = false;
    screen = target.screen;
  }

  /**
   * Record or clear one task's 版ずれ (doc-9). Reported by the panel rather than derived here:
   * 更新前競合 is visible to `apply` below, but the 事後通知 is not — it is the comparison between
   * what was submitted and what the re-read says, and only the panel holds the former.
   *
   * The task is named by the caller, never read back off `selectedRef`. An update is awaited, and
   * nothing stops the selection from moving in the meantime — a transition needs no 未保存入力, so
   * the cards stay clickable — which would file one task's divergence against another's card.
   */
  /**
   * One task as the current read of its root has it, or `null` when that read does not yield the
   * file. Keyed by path for the same reason the selection is (doc-4 §5: a 解析不能 task has no id).
   */
  function viewAt(target: ConflictTarget): TaskView | null {
    const load = loadBySlug[target.slug];
    if (load?.state !== "loaded") return null;
    return load.project.tasks.find((view) => view.task.sourcePath === target.sourcePath) ?? null;
  }

  function noteConflict(conflict: VersionConflict | null, target: ConflictTarget): void {
    const key = conflictKeyOf(target.slug, target.sourcePath);
    if (conflict === null) {
      const { [key]: _removed, ...rest } = conflicts;
      conflicts = rest;
    } else {
      conflicts[key] = conflict;
    }
  }

  /**
   * Open one task's detail panel (doc-7 §3 カードを選ぶとタスク詳細画面を開く). A pending 編集
   * セッション is not discarded on the way: doc-8 §6.3 asks before 未保存入力 is thrown away, and
   * leaving the task is the other way to lose it.
   */
  function open(view: TaskView): void {
    const next = { slug: view.task.project, sourcePath: view.task.sourcePath };
    if (detailDirty && selectedRef !== null && selectedRef.sourcePath !== next.sourcePath) {
      pendingLeave = { to: "task", ...next };
      return;
    }
    selectedRef = next;
  }

  /**
   * Issue one screen action for the open task (doc-5 §3, doc-9 §4). The shell owns this rather than
   * the panel because the result carries the re-read root: the grid and the panel draw from one
   * snapshot, and letting the panel keep a second copy is how the two would drift apart.
   */
  async function apply(action: UpdateOperation[]): Promise<ApplyOutcome> {
    // The whole reference, captured before the await: everything below is about the task the action
    // was issued for, and the selection can move while the CLI runs.
    const target = selectedRef;
    if (target === null) {
      return { state: "failed", detail: "対象プロジェクトを特定できません" };
    }
    const slug = target.slug;
    try {
      const result = await updateApply(slug, action);
      if (result.state === "conflict") {
        // 更新前競合 (doc-9 §5): an ordinary re-read, not 縮退 — the row and the panel both move to
        // the current file, while the panel keeps the 未保存入力 it was holding.
        loadBySlug[slug] = { state: "loaded", project: result.project };
        return { state: "conflict", path: result.path };
      }
      // Present exactly when disk moved (doc-5 §6). A failure that changed nothing leaves the
      // display as it was, which is what lets the panel offer a retry of the same input.
      if (result.project !== null) {
        loadBySlug[slug] = { state: "loaded", project: result.project };
      }
      if (result.outcome.state !== "succeeded") {
        return { state: "failed", detail: failureDetail(result.outcome) };
      }
      // A 状態遷移 moves the file and re-numbers the id (doc-5 §3.3), so the open selection — held
      // as (slug, path) — no longer names anything. Closing it here rather than letting the panel
      // fall through to "現在の読み取り結果にありません" keeps a deliberate move from reading like
      // a task that went missing.
      if (action.some((operation) => TRANSITIONS.includes(operation.op))) {
        // The 版ずれ record is keyed by the file path, and the transition moved the file — the old
        // key would mark a card that no longer exists while the moved task carried none.
        noteConflict(null, target);
        // Closed only if it is still the transitioned task on screen: the panel may have been
        // pointed at another task while the CLI ran, and that one did not move.
        if (selectedRef?.sourcePath === target.sourcePath) {
          selectedRef = null;
          detailDirty = false;
        }
        notice = "状態遷移を適用しました。保存区分と ID が変わるため、詳細を閉じました。";
      }
      // The operated task as of the re-read, resolved here because the shell is what holds it. The
      // panel needs it to make doc-9 §5's 事後通知 comparison against the right task even when the
      // selection moved during the await — reading it off the panel's own `view` would compare the
      // submitted values against whatever is open instead.
      return { state: "applied", view: viewAt(target) };
    } catch (error) {
      const commandError = asCommandError(error);
      // 照合不能 (doc-9 §4.2) is separated here rather than in the panel, so the panel never has to
      // recognise it from its own message text. doc-9 §5 requires it not to read as a conflict.
      return commandError.kind === "uncheckableTarget"
        ? { state: "uncheckable", detail: commandErrorDetail(commandError) }
        : { state: "failed", detail: commandErrorDetail(commandError) };
    }
  }

  /**
   * Issue one screen action against a *named* project (doc-5 §3, doc-9 §4) — the 文書・マイルストーン
   * 管理画面's counterpart of `apply`, which is bound to the open task instead. The shell owns it for
   * the same reason: the result carries the re-read root, and letting a screen keep a second copy of
   * the snapshot is how the two would drift apart.
   *
   * The three non-success states are kept apart on the way out, because doc-9 §5 requires the screen
   * to state them differently: 更新前競合 (checked, and it diverged — no CLI ran), 照合不能 (no
   * defined way to check — no CLI ran either), and an ordinary CLI failure.
   */
  async function issue(slug: string, action: UpdateOperation[]): Promise<IssueOutcome> {
    try {
      const result = await updateApply(slug, action);
      if (result.state === "conflict") {
        loadBySlug[slug] = { state: "loaded", project: result.project };
        return { state: "conflict", path: result.path };
      }
      // Present exactly when disk moved (doc-5 §6): a failure that changed nothing leaves the
      // display as it was, which is what lets the screen offer a retry of the same input.
      if (result.project !== null) {
        loadBySlug[slug] = { state: "loaded", project: result.project };
      }
      return result.outcome.state === "succeeded"
        ? { state: "applied" }
        : { state: "failed", detail: failureDetail(result.outcome) };
    } catch (error) {
      const commandError = asCommandError(error);
      return commandError.kind === "uncheckableTarget"
        ? { state: "uncheckable", detail: commandErrorDetail(commandError) }
        : { state: "failed", detail: commandErrorDetail(commandError) };
    }
  }

  /**
   * Open the selected task's management file in the user's editor (doc-8 §7). The shell owns this for
   * the same reason as `apply`: the boundary resolves the file from the (slug, path) the selection is
   * held as, and nothing else knows both.
   *
   * The watch is (re)started before the launch, when 継続検出 is on. It is the whole of the 書き戻し
   * path — the editor's save reaches Atlas only because doc-9's 継続検出 picks it up — so a root whose
   * watch failed to start earlier would take the edit and show nothing. The underlying command is
   * idempotent, so this costs nothing when the watch is already running, and `startWatch` declines by
   * itself while the setting is off.
   *
   * Nothing is *reported* here. doc-8 §7 requires the user to be told 開く前に, not after the editor is
   * already up, so the panel states it beside the launch controls (`watchStopped` below) and offers
   * the re-read there — a notice from this point would arrive too late to be the warning doc-8 asks
   * for, and would repeat what the panel already says.
   */
  async function openExternally(method: LaunchMethod): Promise<OpenOutcome> {
    const ref = selectedRef;
    if (ref === null) return { state: "failed", detail: "対象タスクを特定できません" };
    await startWatch(ref.slug);
    try {
      return { state: "launched", launch: await taskFileOpen(ref.slug, ref.sourcePath, method) };
    } catch (error) {
      return { state: "failed", detail: launchFailureDetail(asCommandError(error)) };
    }
  }

  /** Read one task's Git 履歴 (doc-6). Ordering — which in-flight call wins — is the loader's. */
  const loadHistory = createHistoryLoader({
    read: taskHistoryRead,
    peek: () => untrack(() => historyRead),
    store: (read) => (historyRead = read),
    describeError: (error) => unreadableDetail(asCommandError(error)),
  });

  // Read on a new selection, keyed by task alone: the PR/References separation comes with the
  // snapshot (doc-8 §4), so References changes need no re-read, and commits are not file state —
  // no watch reports a new one — so refreshing those is the panel's 再取得 button. `historyKey` is
  // the whole dependency; reading the view here would re-fetch on every unrelated root's reload.
  $effect(() => {
    if (historyKey === null) return;
    const view = untrack(() => selectedView);
    if (view === null || view.task.id === null) return;
    void loadHistory(view.task.project, view.task.id);
  });

  function hide(slug: string): void {
    if (!hidden.includes(slug)) hidden = [...hidden, slug];
  }

  function show(slug: string): void {
    hidden = hidden.filter((candidate) => candidate !== slug);
  }
</script>

<main class="screen">
  <header class="top">
    <h1>
      {screen === "swimlane"
        ? "プロジェクト別スイムレーン"
        : screen === "ledger"
          ? "プロジェクト台帳"
          : "文書・マイルストーン管理と新規タスク作成"}
    </h1>
    <!-- The 利用者向け画面 of the app so far. A switch rather than a route: there is no URL to
         restore, and the swimlane's state lives in this shell, so coming back finds it as it was. -->
    <nav class="screens">
      <button
        type="button"
        class:current={screen === "swimlane"}
        onclick={() => goToScreen("swimlane")}>スイムレーン</button
      >
      <button type="button" class:current={screen === "ledger"} onclick={() => goToScreen("ledger")}>
        台帳（{entries.length}）
      </button>
      <button type="button" class:current={screen === "manage"} onclick={() => goToScreen("manage")}>
        文書・マイルストーン・新規タスク
      </button>
    </nav>
    <!-- 設定 (doc-7 §2.1): an entry point on the fixed header, opening アプリ設定 (decision-13) over the
         screen rather than as a fourth tab — it is not a place to work, and the swimlane behind it
         keeps its state. -->
    <button type="button" class="settings-open" onclick={() => (settingsOpen = true)}>設定</button>
    {#if ledgerReadOnly && screen === "swimlane"}
      <span class="badge">台帳は読み取り専用（行の並べ替えは不可）</span>
    {/if}
  </header>

  {#if settingsOpen}
    <!-- Kept over the screen with the shell's state intact: an アプリ設定 change is about how the
         swimlane is shown, so losing the rows, filter and selection to open it would be backwards. -->
    <div class="settings-panel">
      <Settings
        loaded={settings}
        path={settingsPath}
        onsave={saveSettings}
        onclose={() => (settingsOpen = false)}
      />
    </div>
  {/if}

  {#if screen === "swimlane"}
    <FilterBar
      {filter}
      {facets}
      {hasIndeterminateStorage}
      onchange={(next) => (filter = next)}
      onreset={() => (filter = DEFAULT_FILTER)}
    />
  {/if}

  {#if hiddenRows.length > 0 && screen === "swimlane"}
    <div class="hidden-rows">
      <span>非表示の行:</span>
      {#each hiddenRows as slug (slug)}
        <button type="button" onclick={() => show(slug)}>{slug} を戻す</button>
      {/each}
    </div>
  {/if}

  {#if notice}
    <p class="notice">{notice}</p>
  {/if}

  {#if unwatchedRows.length > 0 && screen === "swimlane"}
    <!-- 継続検出停止 (doc-9 §3): the *explanation* is here, once for the screen; the mark and the
         manual 再読込契機 sit on each affected row, where the possibly-stale cards are. Deliberately
         not 版ずれ's expression: nothing has been observed to diverge, Atlas simply cannot look
         (doc-9 §5 照合不能の提示 makes the same distinction). -->
    <div class="unwatched">
      <span>
        {unwatchedReason}（外部エディタ・別プロセスの保存は自動反映されません）。
        該当行の「{UNWATCHED_MARK.label}」印と「再読込」を参照してください。
      </span>
    </div>
  {/if}

  {#if pendingLeave !== null}
    <!-- 破棄前確認 (doc-8 §6.3): the panel confirms its own cancel, and these are the other exits. -->
    <div class="confirm">
      <span>
        編集中の未保存入力があります。{pendingLeave.to === "task"
          ? "別のタスクを開くと破棄されます。"
          : "他の画面へ移ると破棄されます。"}
      </span>
      <button type="button" onclick={leaveConfirmed}>
        {pendingLeave.to === "task" ? "破棄して開く" : "破棄して移動"}
      </button>
      <button type="button" onclick={() => (pendingLeave = null)}>編集に戻る</button>
    </div>
  {/if}

  {#if screen === "ledger"}
    <!-- 台帳・プロジェクト登録・管理 (doc-3 §4, TASK-39). The ledger file is the only thing any action
         here writes; no project's Backlog root or Git repository is touched (doc-3 §2.1/§4.2). -->
    <ProjectLedger
      {entries}
      readOnly={ledgerReadOnly}
      loads={loadBySlug}
      busy={ledgerBusy}
      listLoading={loading}
      listFailure={entries.length === 0 && fatal !== null ? fatal : null}
      {ledgerPath}
      onpickDirectory={pickDirectory}
      ondefaultSlug={ledgerDefaultSlug}
      onregister={registerProject}
      onupdate={updateProject}
      onremove={removeProject}
    />
  {:else if screen === "manage"}
    <!-- 文書・マイルストーン管理と新規タスク作成の入口 (doc-5 §3.2, TASK-40). Every action is a
         更新操作 issued through the adapter; the screen writes no managed Markdown itself (doc-2). -->
    <ProjectManage
      projects={loadedProjects}
      {loading}
      {readiness}
      onissue={issue}
      ondirty={(dirty) => (manageDirty = dirty)}
    />
  {:else if fatal}
    <p class="fatal">読み込みに失敗しました: {fatal}</p>
    <button type="button" onclick={load}>再読み込み</button>
  {:else if loading}
    <p class="status">読み込み中…</p>
  {:else if order.length === 0}
    <p class="status">
      登録済みプロジェクトがありません。
      <button type="button" class="link" onclick={() => goToScreen("ledger")}>台帳画面</button>
      から登録してください。
    </p>
  {:else}
    <!-- The grid and the detail panel share the remaining height; the panel is beside the grid
         rather than over it, so a task can be read while its row stays visible (doc-8 §2). -->
    <div class="body">
      <Swimlane
        {rows}
        {showStorageMark}
        selectedPath={selectedRef?.sourcePath ?? null}
        canReorder={!ledgerReadOnly}
        unwatched={unwatchedRows}
        conflictOf={(view) =>
          conflicts[conflictKeyOf(view.task.project, view.task.sourcePath)] ?? null}
        onselect={open}
        onmove={move}
        onhide={hide}
        onretry={retry}
        onreread={rereadRow}
      />

      <!-- カードを選ぶとタスク詳細画面を開く (doc-7 §3, doc-8 §2). -->
      {#if selectedRef !== null}
        {#if shown !== null}
          {@const view = shown.view}
          <TaskDetail
            {view}
            snapshot={shown.snapshot}
            missing={shown.missing}
            entry={selectedEntry}
            {history}
            {readiness}
            {editorReadiness}
            watchStopped={selectedWatchStopped}
            onreread={() => rereadRow(view.task.project)}
            conflict={selectedConflict}
            onconflict={noteConflict}
            onapply={apply}
            onopenExternally={openExternally}
            onselect={open}
            onreloadHistory={() =>
              view.task.id === null
                ? undefined
                : void loadHistory(view.task.project, view.task.id)}
            ondirty={(dirty) => (detailDirty = dirty)}
            onclose={() => {
              // Cleared with the selection: the panel is unmounted from here on, so its own
              // `ondirty` will not run again to retract a flag left standing.
              selectedRef = null;
              detailDirty = false;
            }}
          />
        {:else}
          <!-- The task was open when its root stopped yielding it — deleted, moved, or the root
               became unreadable. Distinct from an empty panel: the selection is still named. -->
          <aside class="detail-gone">
            <p>
              {selectedRef.sourcePath} は現在の読み取り結果にありません（削除・移動、または
              ルート読取不能の可能性）。
            </p>
            <button type="button" onclick={() => (selectedRef = null)}>閉じる</button>
          </aside>
        {/if}
      {/if}
    </div>
  {/if}
</main>

<style lang="scss">
  .screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;

    h1 {
      margin: 0;
      font-size: 1rem;
    }
  }

  .screens {
    display: flex;
    gap: 0.25rem;

    button {
      padding: 0.1rem 0.5rem;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.72rem;
      cursor: pointer;

      &.current {
        border-color: var(--info);
        background: color-mix(in srgb, var(--info) 14%, transparent);
      }
    }
  }

  // A button that reads as part of the sentence it sits in, for the one place a message hands the
  // user a screen to go to rather than an action to take.
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--info);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .badge {
    padding: 0 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 3px;
    font-size: 0.7rem;
    opacity: 0.8;
  }

  // The 設定 entry point sits apart from the screen tabs: it opens a panel, not another screen.
  .settings-open {
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .settings-panel {
    max-height: 60vh;
    border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    background: color-mix(in srgb, canvas 94%, canvastext 6%);
    overflow-y: auto;
  }

  .hidden-rows {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
    font-size: 0.72rem;

    button {
      padding: 0 0.35rem;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
    }
  }

  // 継続検出停止 は縮退でも版ずれでもない (doc-9 §3/§5): its own family, so it cannot be read as
  // either. It used to share 縮退's amber, which is what decision-6 forbids.
  .unwatched {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
    font-size: 0.75rem;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.75rem;

    button {
      padding: 0 0.4rem;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.72rem;
      cursor: pointer;
    }
  }

  .notice,
  .fatal,
  .status {
    margin: 0;
    padding: 0.4rem 0.75rem;
    font-size: 0.78rem;
  }

  // An action's own report (failed reorder, applied transition, probe trouble). Not one of the
  // 印の族 — so it takes the neutral info hue rather than borrowing 縮退's amber, which would make
  // every notice look like a parse degrade (decision-6).
  .notice {
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .fatal {
    color: var(--mark-unreadable);
  }

  .status {
    opacity: 0.7;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: stretch;
  }

  .detail-gone {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.4rem;
    width: min(30rem, 45vw);
    padding: 0.6rem 0.75rem;
    border-left: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    font-size: 0.75rem;

    p {
      margin: 0;
    }

    button {
      padding: 0 0.4rem;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
    }
  }
</style>
