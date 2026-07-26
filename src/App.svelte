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
  import Swimlane from "./components/Swimlane.svelte";
  import TaskDetail from "./components/TaskDetail.svelte";
  import {
    asCommandError,
    cliProbe,
    editorProbe,
    ledgerList,
    ledgerReorder,
    onProjectReloaded,
    projectOpen,
    projectWatchStart,
    projectWatchStop,
    taskFileOpen,
    taskHistoryRead,
    updateApply,
    workspaceOpen,
  } from "./lib/commands";
  import type { HistoryState } from "./lib/detail";
  import { commandErrorDetail, failureDetail, type ApplyOutcome } from "./lib/edit";
  import { launchFailureDetail, type OpenOutcome } from "./lib/external-editor";
  import { createHistoryLoader, historyKeyOf, type HistoryRead } from "./lib/history-read";
  import { DEFAULT_FILTER, collectFacets, type CardFilter } from "./lib/filter";
  import { buildSwimlane, unreadableDetail } from "./lib/swimlane";
  import type {
    CliReadiness,
    EditorReadiness,
    LaunchMethod,
    ProjectEntry,
    ProjectLoad,
    ProjectSnapshot,
    TaskView,
    UpdateOperation,
  } from "./lib/wire";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  let entries = $state<ProjectEntry[]>([]);
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
  /** True while the detail panel holds 未保存入力 — what makes a selection change ask first. */
  let detailDirty = $state(false);
  /** A selection requested while the panel was dirty, held until the user answers (doc-8 §6.3). */
  let pendingSelection = $state<{ slug: string; sourcePath: string } | null>(null);

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
    try {
      unlisten = await onProjectReloaded((event) => {
        loadBySlug[event.slug] = event.load;
      });
    } catch (error) {
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
    // 外部エディタ経路 (doc-8 §7): one environment read, so it is probed once beside the CLI probe.
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
      const response = await ledgerList();
      entries = response.ledger.project;
      ledgerReadOnly = response.readOnly;

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
      for (const slug of Object.keys(next)) startWatch(slug);
    } catch (error) {
      fatal = unreadableDetail(asCommandError(error));
    } finally {
      loading = false;
    }
  }

  function startWatch(slug: string): void {
    // A failed watch is not a failed read: the row's cards are already on screen and only
    // stay as fresh as the last read, so it is reported, not escalated.
    void projectWatchStart(slug).catch((error) => {
      notice = `${slug}: 変更監視を開始できません（${unreadableDetail(asCommandError(error))}）`;
    });
  }

  /** Retry one ルート読取不能 row (doc-7 §6). Other rows are untouched either way. */
  async function retry(slug: string): Promise<void> {
    try {
      const project = await projectOpen(slug);
      loadBySlug[slug] = { state: "loaded", project };
      startWatch(slug);
      notice = null;
    } catch (error) {
      const commandError = asCommandError(error);
      loadBySlug[slug] = { state: "unreadable", slug, error: commandError };
    }
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
    try {
      const response = await ledgerReorder(slug, order.indexOf(neighbour));
      entries = response.ledger.project;
      ledgerReadOnly = response.readOnly;
      notice = null;
    } catch (error) {
      notice = `行の並べ替えに失敗しました: ${unreadableDetail(asCommandError(error))}`;
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
      pendingSelection = next;
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
    const slug = selectedRef?.slug;
    if (slug === undefined) {
      return { state: "failed", detail: "対象プロジェクトを特定できません" };
    }
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
        selectedRef = null;
        detailDirty = false;
        notice = "状態遷移を適用しました。保存区分と ID が変わるため、詳細を閉じました。";
      }
      return { state: "applied" };
    } catch (error) {
      return { state: "failed", detail: commandErrorDetail(asCommandError(error)) };
    }
  }

  /**
   * Open the selected task's management file in the user's editor (doc-8 §7). The shell owns this for
   * the same reason as `apply`: the boundary resolves the file from the (slug, path) the selection is
   * held as, and nothing else knows both.
   *
   * The watch is (re)started before the launch. It is the whole of the 書き戻し path — the editor's
   * save reaches Atlas only because doc-9's 継続検出 picks it up (AC #2) — so a root whose watch never
   * started, or whose start failed earlier, would take the edit and show nothing. `projectWatchStart`
   * is idempotent, so this costs nothing when the watch is already running.
   */
  async function openExternally(method: LaunchMethod): Promise<OpenOutcome> {
    const ref = selectedRef;
    if (ref === null) return { state: "failed", detail: "対象タスクを特定できません" };
    try {
      await projectWatchStart(ref.slug);
    } catch (error) {
      notice =
        `${ref.slug}: 変更監視を開始できません（${unreadableDetail(asCommandError(error))}）。` +
        "外部エディタで保存しても自動では反映されないため、タスクを開き直して確認してください。";
    }
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
    <h1>プロジェクト別スイムレーン</h1>
    {#if ledgerReadOnly}
      <span class="badge">台帳は読み取り専用（行の並べ替えは不可）</span>
    {/if}
  </header>

  <FilterBar
    {filter}
    {facets}
    {hasIndeterminateStorage}
    onchange={(next) => (filter = next)}
    onreset={() => (filter = DEFAULT_FILTER)}
  />

  {#if hiddenRows.length > 0}
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

  {#if pendingSelection !== null}
    <!-- 破棄前確認 (doc-8 §6.3): the panel confirms its own cancel, and this is the other exit. -->
    <div class="confirm">
      <span>編集中の未保存入力があります。別のタスクを開くと破棄されます。</span>
      <button
        type="button"
        onclick={() => {
          selectedRef = pendingSelection;
          pendingSelection = null;
        }}
      >
        破棄して開く
      </button>
      <button type="button" onclick={() => (pendingSelection = null)}>編集に戻る</button>
    </div>
  {/if}

  {#if fatal}
    <p class="fatal">読み込みに失敗しました: {fatal}</p>
    <button type="button" onclick={load}>再読み込み</button>
  {:else if loading}
    <p class="status">読み込み中…</p>
  {:else if order.length === 0}
    <p class="status">登録済みプロジェクトがありません。台帳への登録は TASK-39 の画面で行います。</p>
  {:else}
    <!-- The grid and the detail panel share the remaining height; the panel is beside the grid
         rather than over it, so a task can be read while its row stays visible (doc-8 §2). -->
    <div class="body">
      <Swimlane
        {rows}
        {showStorageMark}
        selectedPath={selectedRef?.sourcePath ?? null}
        canReorder={!ledgerReadOnly}
        onselect={open}
        onmove={move}
        onhide={hide}
        onretry={retry}
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

  .badge {
    padding: 0 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 3px;
    font-size: 0.7rem;
    opacity: 0.8;
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

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: color-mix(in srgb, #2f6f9f 12%, transparent);
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

  .notice {
    background: color-mix(in srgb, #b8860b 12%, transparent);
  }

  .fatal {
    color: #c0392b;
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
