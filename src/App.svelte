<script lang="ts">
  // The swimlane screen's shell (TASK-34 / doc-7): it owns the data the grid draws and the
  // screen-local row state, and nothing else. All placement, ordering and filtering rules live
  // in `lib/swimlane.ts` and `lib/filter.ts` as pure functions.
  //
  // Row order is deliberately *not* screen state: it is the ledger's entry order (doc-3 §2.2),
  // and a reorder is written back through `ledger_update` (doc-7 §5 allows reflecting it
  // there), so the order the user arranges survives a restart. Row visibility is the opposite —
  // doc-7 §5 calls it 一時的 — so `hidden` never leaves this component.
  import { onDestroy, onMount } from "svelte";
  import FilterBar from "./components/FilterBar.svelte";
  import Swimlane from "./components/Swimlane.svelte";
  import {
    asCommandError,
    ledgerList,
    ledgerReorder,
    onProjectReloaded,
    projectOpen,
    projectWatchStart,
    projectWatchStop,
    workspaceOpen,
  } from "./lib/commands";
  import { cardIdentity } from "./lib/card";
  import { DEFAULT_FILTER, collectFacets, type CardFilter } from "./lib/filter";
  import { buildSwimlane, unreadableDetail } from "./lib/swimlane";
  import type { ProjectLoad, TaskView } from "./lib/wire";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  let order = $state<string[]>([]);
  let loadBySlug = $state<Record<string, ProjectLoad>>({});
  let hidden = $state<string[]>([]);
  let filter = $state<CardFilter>(DEFAULT_FILTER);
  let ledgerReadOnly = $state(false);
  let loading = $state(true);
  /** A failure that left the screen with nothing to draw, as opposed to one bad row. */
  let fatal = $state<string | null>(null);
  /** A failure of an action the user took; the grid stays usable. */
  let notice = $state<string | null>(null);
  let selected = $state<TaskView | null>(null);

  let unlisten: UnlistenFn | null = null;

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

  onMount(async () => {
    // Subscribed before the first read so a change landing during startup is not missed.
    unlisten = await onProjectReloaded((event) => {
      loadBySlug[event.slug] = event.load;
    });
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
      order = response.ledger.project.map((entry) => entry.slug);
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
      order = response.ledger.project.map((entry) => entry.slug);
      ledgerReadOnly = response.readOnly;
      notice = null;
    } catch (error) {
      notice = `行の並べ替えに失敗しました: ${unreadableDetail(asCommandError(error))}`;
    }
  }

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

  {#if fatal}
    <p class="fatal">読み込みに失敗しました: {fatal}</p>
    <button type="button" onclick={load}>再読み込み</button>
  {:else if loading}
    <p class="status">読み込み中…</p>
  {:else if order.length === 0}
    <p class="status">登録済みプロジェクトがありません。台帳への登録は TASK-39 の画面で行います。</p>
  {:else}
    <Swimlane
      {rows}
      {showStorageMark}
      selectedPath={selected?.task.sourcePath ?? null}
      canReorder={!ledgerReadOnly}
      onselect={(view) => (selected = view)}
      onmove={move}
      onhide={hide}
      onretry={retry}
    />
  {/if}

  {#if selected}
    <!-- カードを選ぶとタスク詳細画面を開く (doc-7 §3). The detail screen itself is TASK-35;
         until it lands, the selection is shown here so the entry point is already wired. -->
    <footer class="selection">
      <span class="identity">{cardIdentity(selected)}</span>
      <span class="title">{selected.task.title ?? "（title 不明）"}</span>
      <span class="path">{selected.task.sourcePath}</span>
      <button type="button" onclick={() => (selected = null)}>閉じる</button>
    </footer>
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

  .selection {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.4rem 0.75rem;
    border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    font-size: 0.75rem;

    .identity {
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }

    .path {
      margin-left: auto;
      opacity: 0.55;
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
