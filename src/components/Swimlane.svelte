<script lang="ts">
  // プロジェクト別スイムレーン (doc-7 §2): rows are projects, columns are the canonical four,
  // cells hold task cards. The four columns are laid out once for the whole grid — not per row
  // — so a column can be read top-to-bottom across projects, which is the point of the screen
  // (doc-7 §2 プロジェクト横断の縦読み).
  import LaneCell from "./LaneCell.svelte";
  import LaneCreate from "./LaneCreate.svelte";
  import { UNMAPPED_ABSENT_REASON, laneCreate } from "../lib/lane-create";
  import { UNWATCHED_MARK, type VersionConflict } from "../lib/mark";
  import {
    CANONICAL_COLUMNS,
    CANONICAL_COLUMN_LABEL,
    ROW_FOLD_ABSENT_REASON,
    UNMAPPED_FOLD_ABSENT_REASON,
    UNMAPPED_LABEL,
    columnTotal,
    laneCounts,
    laneScrollDelta,
    rowFoldable,
    visibleCount,
    type SwimlaneRow,
  } from "../lib/swimlane";
  import type { CardDensity, StatusColumn, TaskView } from "../lib/wire";

  interface Props {
    rows: SwimlaneRow[];
    /**
     * カード情報量 (doc-7 §3, decision-13). One 段 for the whole grid, not per row or per column: it is
     * an アプリ設定, and a grid whose rows carried different 段 would make the cards' heights say
     * something about the row rather than about the task.
     */
    density: CardDensity;
    showStorageMark: boolean;
    selectedPath: string | null;
    /** False on a read-only ledger: row order lives there, so it cannot be written (doc-3 §2.2). */
    canReorder: boolean;
    /**
     * Rows whose 継続検出 is not running (doc-9 §3). Marked on the row rather than only in a banner:
     * the staleness is a property of *these* cards, and `undetectable` — not 版ずれ — because Atlas
     * cannot say whether the version moved (doc-9 §5 forbids the two reading alike).
     */
    unwatched: readonly string[];
    /** 版ずれ (doc-9) per task, from the shell's record. */
    conflictOf: (view: TaskView) => VersionConflict | null;
    /**
     * The row to bring into view, or `null`. Set by プロジェクト詳細画面's 「このプロジェクトのレーンへ」
     * (doc-10 §2): the screen it returns to is this grid, and the row it was about may be scrolled
     * well off it. Cleared through `onfocused` once the scroll is done, so the same row can be asked
     * for again after the user has scrolled away.
     */
    focusSlug: string | null;
    /**
     * 列内新規タスク入力 (doc-7 §4.1) の状態. Held by the shell, not here: the grid is unmounted when a
     * task is opened in 全面シングルビュー and when プロジェクト詳細画面 is entered, and input the user
     * typed must not vanish with it. `null` is 入力を開いていない.
     */
    createOpen: { slug: string; column: StatusColumn } | null;
    createTitle: string;
    /** The candidate that will be passed, already resolved against the open cell's 候補. */
    createStatus: string;
    /** Why 発行 is withheld for the open entry, or `null` (doc-5 §5). */
    createBlocked: string | null;
    /** Why *no* cell may take input — CLI 縮退 or an action in flight (doc-7 §4.1), or `null`. */
    createHeld: string | null;
    oncreateOpen: (slug: string, column: StatusColumn) => void;
    oncreateClose: () => void;
    oncreateTitle: (value: string) => void;
    oncreateStatus: (value: string) => void;
    oncreateSubmit: () => void;
    onselect: (view: TaskView) => void;
    onmove: (slug: string, direction: -1 | 1) => void;
    onhide: (slug: string) => void;
    onretry: (slug: string) => void;
    onreread: (slug: string) => void;
    /** Open プロジェクト詳細画面 (doc-10); the レーンヘッダ行 is its entry point (doc-7 §2.3). */
    onopenProject: (slug: string) => void;
    onfocused: () => void;
  }

  let {
    rows,
    density,
    showStorageMark,
    selectedPath,
    canReorder,
    unwatched,
    conflictOf,
    focusSlug,
    createOpen,
    createTitle,
    createStatus,
    createBlocked,
    createHeld,
    oncreateOpen,
    oncreateClose,
    oncreateTitle,
    oncreateStatus,
    oncreateSubmit,
    onselect,
    onmove,
    onhide,
    onretry,
    onreread,
    onopenProject,
    onfocused,
  }: Props = $props();

  /** The scrollport both header rows are stuck to, and the box a 着地 scrolls. */
  let grid = $state<HTMLElement>();

  /**
   * The レーンヘッダ行 elements and the zero-height markers that sit immediately above them, by slug.
   * Held here rather than resolved with a DOM query, because the grid is the only thing that knows
   * which element is which row.
   *
   * The pair exists because the header is sticky: its position stops being the row's position as
   * soon as it is held at the top, so the marker — which nothing moves — is what says where the row
   * begins, and the header is only measured for its height (`laneScrollDelta`).
   */
  let laneHeads = $state<Record<string, HTMLElement>>({});
  let laneMarks = $state<Record<string, HTMLElement>>({});

  /**
   * The 列ヘッダ行 elements, by column, so the レーンヘッダ行 can be stuck to the row's lower edge.
   *
   * Its height is not a constant: 畳んだ列 stacks its name, count and control (doc-7 §2.2) and the
   * 未対応列 carries the two sentences that say what it does not offer, either of which makes the row
   * taller than an open column's one line. So the offset is measured rather than written down — a
   * fixed one would leave a strip of scrolled cards between the two rows the moment a column is
   * folded, which is exactly what 受入条件 #3 forbids.
   */
  let columnHeads = $state<Record<string, HTMLElement>>({});
  let headHeight = $state(0);

  /**
   * The 列ヘッダ行's height as it is right now.
   *
   * Every head is measured, not just one, so the offset does not depend on the grid stretching them
   * to a common height. `getBoundingClientRect` rather than `offsetHeight`: the row's height is
   * fractional at most font sizes, and the rounded integer would leave a hairline of scrolled
   * content showing through the seam half the time.
   */
  function measureHead(): number {
    const elements = Object.values(columnHeads).filter((element) => element !== undefined);
    if (elements.length === 0) return 0;
    return Math.max(...elements.map((element) => element.getBoundingClientRect().height));
  }

  $effect(() => {
    const elements = Object.values(columnHeads).filter((element) => element !== undefined);
    if (elements.length === 0) return;
    // Measured once here as well as from the callback: a `ResizeObserver` reports asynchronously, so
    // without this the grid's first paint would put every レーンヘッダ行 at the top of the scrollport,
    // behind the 列ヘッダ行, until the callback arrived.
    headHeight = measureHead();
    const observer = new ResizeObserver(() => {
      headHeight = measureHead();
    });
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  });

  // 「このプロジェクトのレーンへ」の着地 (doc-10 §2). Runs after the row exists — a project detail
  // screen can be left for a row that was scrolled out, and returning to the grid puts it back in
  // view rather than at wherever the grid happened to be. The scroll is written rather than asked
  // for with `scrollIntoView`: a sticky header held at the top is *on screen* by that method's
  // reckoning, so a row scrolled above the view would not be returned to at all. Not smooth, for the
  // same reason as before: the point is that the row is *there* when the grid appears.
  $effect(() => {
    const slug = focusSlug;
    if (slug === null) return;
    const mark = laneMarks[slug];
    const head = laneHeads[slug];
    const container = grid;
    if (mark === undefined || head === undefined || container === undefined) return;
    // The head is measured here rather than read from `headHeight`, because this effect can run
    // before the observer has reported for the first time — and it does exactly that on the path the
    // landing exists for: 「このプロジェクトのレーンへ」 mounts the grid with `focusSlug` already set,
    // and a landing computed against a height of 0 puts the row's start at the top of the scrollport,
    // which is behind both header rows. The request is cleared right after, so nothing would correct
    // it later (PR #47 の [P1]).
    // The grid has neither border nor padding, so its border box and its scrollport share an edge.
    container.scrollTop += laneScrollDelta({
      offset: mark.getBoundingClientRect().top - container.getBoundingClientRect().top,
      headHeight: measureHead(),
      laneHeight: head.getBoundingClientRect().height,
      viewportHeight: container.clientHeight,
    });
    onfocused();
  });

  /**
   * 無効化の理由の置き場 (doc-11 §5). Every ↑↓ on the grid is blocked by the same one thing, so the
   * reason is written once as a full-width row and the arrows are bound to it with `aria-describedby`
   * — repeating the sentence on each row would put the same words on screen as many times as there
   * are projects. The arrows stay `aria-disabled` rather than `disabled` so they keep taking focus:
   * that is what makes the binding reachable from the keyboard and from a screen reader.
   */
  const REORDER_REASON_ID = "swimlane-reorder-blocked";
  const REORDER_BLOCKED_REASON =
    "台帳が読み取り専用のため、行の並べ替えはできません（doc-3 §2.2）。台帳画面で理由を確認できます。";

  // 未対応区画は常設ではない (doc-7 §2.2): the column appears only while some row has a task in
  // it, and disappears again once none does.
  let hasUnmapped = $derived(
    rows.some((row) => row.state === "loaded" && row.unmapped.length > 0),
  );

  /**
   * 列折畳み・行折畳み are 画面の一時状態 (doc-7 §5.1, decision-13): they are never written to the
   * settings file or the ledger, and nothing outside the grid reads them — the counts a fold keeps
   * are computed from the rows the shell already passes in — so they live here rather than in the
   * shell beside 行非表示, which the 上部帯 does have to see.
   */
  let collapsedColumns = $state<StatusColumn[]>([]);
  let foldedRows = $state<string[]>([]);

  function toggleColumn(column: StatusColumn): void {
    collapsedColumns = collapsedColumns.includes(column)
      ? collapsedColumns.filter((candidate) => candidate !== column)
      : [...collapsedColumns, column];
  }

  function toggleRow(slug: string): void {
    foldedRows = foldedRows.includes(slug)
      ? foldedRows.filter((candidate) => candidate !== slug)
      : [...foldedRows, slug];
  }

  // 列の幅. A folded column is a narrow band; the 未対応 column stays narrower than the four and last
  // (doc-7 §2.2). The band has to hold the column name at 0.7rem, which is what fixes it at 5rem.
  const OPEN_COLUMN = "minmax(13rem, 1fr)";
  const FOLDED_COLUMN = "5rem";
  const UNMAPPED_COLUMN = "minmax(10rem, 0.7fr)";

  /**
   * The grid's columns, as one template for the whole grid. 列折畳みが全行同時にしか効かないのは、
   * 畳んだ幅がここに 1 度だけ書かれるからである (doc-7 §2.2): a row cannot narrow a column on its own,
   * so the same status keeps the same x in every row and the 縦読み holds.
   */
  let columnTemplate = $derived(
    [
      ...CANONICAL_COLUMNS.map((column) =>
        collapsedColumns.includes(column) ? FOLDED_COLUMN : OPEN_COLUMN,
      ),
      ...(hasUnmapped ? [UNMAPPED_COLUMN] : []),
    ].join(" "),
  );

  // 行折畳み と 行非表示 は別の語・別の操作 (doc-7 §5.1). The two sentences are kept apart word for
  // word — 件数を残す against 件数も読めなくなる — because that difference *is* the distinction, and
  // a shared phrasing would be the取り違え the doc names.
  const ROW_FOLD_HINT = "行折畳み: レーンセルを畳み、列別の件数をこの行に残します。";
  const ROW_UNFOLD_HINT = "行折畳みを解き、レーンセルを戻します。";
  const HIDE_HINT =
    "行非表示: この行を画面から取り除きます（件数も読めなくなります）。上部の一覧から戻せます。";
  const COLUMN_FOLD_HINT = "列折畳み: この列を全行同時に畳み、列名と件数を残します。";
  const COLUMN_UNFOLD_HINT = "列折畳みを解き、この列のカードを全行で戻します。";
</script>

<div
  class="grid"
  style="--columns: {columnTemplate}; --lane-top: {headHeight}px"
  bind:this={grid}
>
  {#each CANONICAL_COLUMNS as column (column)}
    {@const folded = collapsedColumns.includes(column)}
    <div class="head" class:folded bind:this={columnHeads[column]}>
      <span class="label">{CANONICAL_COLUMN_LABEL[column]}</span>
      {#if folded}
        <!-- 畳んだ列は列名と件数を残す (doc-7 §2.2): the band keeps the column's own total, and each
             row keeps its own count in the cell, so folding never makes 何件あるか unreadable. -->
        <span class="total">{columnTotal(rows, column)} 件</span>
      {/if}
      <button
        type="button"
        class="fold"
        aria-expanded={!folded}
        aria-label="{CANONICAL_COLUMN_LABEL[column]} 列の列折畳みを{folded ? '解く' : '行う'}"
        title={folded ? COLUMN_UNFOLD_HINT : COLUMN_FOLD_HINT}
        onclick={() => toggleColumn(column)}>{folded ? "展開" : "畳む"}</button
      >
    </div>
  {/each}
  {#if hasUnmapped}
    <!-- 未対応列は列折畳みの対象にしない (doc-7 §2.2). The control is not placed, and the reason is
         written beside where it would have been — the same treatment doc-7 §4.1 gives an entry it
         does not offer, which is not the 無効化 of doc-11 §5. -->
    <div class="head unmapped" bind:this={columnHeads.unmapped}>
      <span class="label">{UNMAPPED_LABEL}</span>
      <span class="withheld" title={UNMAPPED_FOLD_ABSENT_REASON}>正準列ではないため列折畳みなし</span>
      <!-- 未対応列には列内新規タスク入力を置かない (doc-7 §4.1). In the column head, once, rather than in
           every row's 未対応 cell: unlike a canonical column's 候補 0 件, this reason is identical for
           every project — the 未対応区画 is not a 正準ステータス列 anywhere — so a per-cell copy would put
           the same sentence on screen as many times as there are rows (the reason the reorder block
           below is written once too). Abbreviated with the full sentence on the `title`, like the
           列折畳みなし note beside it: the head is one line for the whole grid, and two full sentences
           in a 10rem column would raise it for every row. -->
      <span class="withheld" title={UNMAPPED_ABSENT_REASON}>候補集合を定義できないため新規入力なし</span>
    </div>
  {/if}

  {#if !canReorder}
    <p class="blocked-note" id={REORDER_REASON_ID}>{REORDER_BLOCKED_REASON}</p>
  {/if}

  {#each rows as row (row.slug)}
    <!-- A row that is no longer loaded is never drawn folded, whatever it was when the user folded
         it: a re-read can turn a loaded row unreadable (App.svelte's reload and retry paths) while
         its slug sits in `foldedRows`, and the folded branch would then print four zeros the row
         does not have — with the unfold button gone, since 読取不能行 has none (doc-7 §6). The state
         is kept rather than cleared, so the row folds back the way the user left it if a later read
         succeeds. -->
    {@const folded = rowFoldable(row) && foldedRows.includes(row.slug)}
    <!-- Where the row begins, for a 着地 to scroll to (doc-10 §2). Nothing is drawn: it takes no
         height, and the header below it is the row's visible start. It exists because that header
         is sticky and therefore cannot report where its row is (see `laneMarks`). -->
    <div class="lane-mark" bind:this={laneMarks[row.slug]}></div>
    <!-- レーンヘッダ行 (doc-7 §2.3): the row's own full-width line. There is no fixed project column
         at the left edge, so the name never has to be traded against the width the four columns get. -->
    <div
      class="lane-head"
      class:unreadable={row.state === "unreadable"}
      bind:this={laneHeads[row.slug]}
    >
      {#if rowFoldable(row)}
        <button
          type="button"
          class="fold"
          aria-expanded={!folded}
          aria-label="{row.slug} の行折畳みを{folded ? '解く' : '行う'}"
          title={folded ? ROW_UNFOLD_HINT : ROW_FOLD_HINT}
          onclick={() => toggleRow(row.slug)}
        >
          <span aria-hidden="true">{folded ? "▲" : "▼"}</span>{folded ? "展開" : "畳む"}
        </button>
      {/if}
      <div class="names">
        <!-- The project name is the entry point to プロジェクト詳細画面 (doc-7 §2.3, doc-10 §2).
             Kept on a 読取不能行 as well: its 台帳エントリ is readable, and fixing the root is done
             on that screen (doc-7 §6). The name is the only part of the header that gives up room
             when the window narrows, so `title` keeps the full one reachable; the slug beside it
             never shortens. -->
        <button
          type="button"
          class="project"
          title="{row.state === 'loaded' && row.projectName
            ? row.projectName
            : row.slug} のプロジェクト詳細画面を開きます"
          onclick={() => onopenProject(row.slug)}
        >
          {row.state === "loaded" && row.projectName ? row.projectName : row.slug}
        </button>
        {#if row.state === "loaded" && row.projectName}
          <span class="slug">{row.slug}</span>
        {/if}
      </div>
      {#if row.state === "loaded"}
        <span class="count">{visibleCount(row)} / {row.totalBeforeFilter} 件</span>
      {/if}
      {#if folded}
        <!-- 畳んでも件数は読める (doc-7 §2.3・§5.1): the cells are gone, so their counts come up here
             column by column. This is the whole visible difference from 行非表示, which takes the
             counts away with the row. -->
        <div class="fold-counts">
          {#each laneCounts(row, hasUnmapped) as entry (entry.label)}
            <span class="fold-count">
              <span class="name">{entry.label}</span><span class="n">{entry.count}</span>
            </span>
          {/each}
        </div>
      {/if}
      {#if unwatched.includes(row.slug)}
        <!-- 継続検出停止: the cards below are only as fresh as the last read, and 版ずれ の有無は
             確かめられない — a distinct family from both 縮退 and 版ずれ (doc-9 §3/§5). -->
        <span
          class="mark"
          data-kind={UNWATCHED_MARK.kind}
          title={UNWATCHED_MARK.detail}
          aria-label="{UNWATCHED_MARK.label}: {UNWATCHED_MARK.detail}"
        >
          {UNWATCHED_MARK.label}
        </span>
      {/if}
      <div class="controls">
        <!-- 押せない矢印は消さずに残す (doc-11 §5). `aria-label` carries the name the arrow glyph does
             not spell out, and the reason travels through `aria-describedby` to the one line above the
             rows; `title` repeats it for the pointer only, never as its only home. -->
        <button
          type="button"
          aria-label="{row.slug} を上へ"
          aria-disabled={!canReorder}
          aria-describedby={canReorder ? undefined : REORDER_REASON_ID}
          title={canReorder ? "表示順を上へ" : REORDER_BLOCKED_REASON}
          onclick={() => canReorder && onmove(row.slug, -1)}>↑</button
        >
        <button
          type="button"
          aria-label="{row.slug} を下へ"
          aria-disabled={!canReorder}
          aria-describedby={canReorder ? undefined : REORDER_REASON_ID}
          title={canReorder ? "表示順を下へ" : REORDER_BLOCKED_REASON}
          onclick={() => canReorder && onmove(row.slug, 1)}>↓</button
        >
        <button type="button" title={HIDE_HINT} onclick={() => onhide(row.slug)}>隠す</button>
        {#if unwatched.includes(row.slug)}
          <!-- The manual 再読込契機 (doc-9 §3) sits on the row it refreshes: a row that says its
               cards may be stale has to carry the one control that resolves that. -->
          <button
            type="button"
            title="このルートを読み直す（継続検出が動いていないため自動では更新されません）"
            onclick={() => onreread(row.slug)}>再読込</button
          >
        {/if}
        <!-- The `›` at the row's end (doc-7 §2.3's sketch, doc-10 §2): the same destination as the
             project name, as an entry point at the end of the row. The name is the part that gives
             up room as the window narrows; this one keeps its width, so it stays pressable. -->
        <button
          type="button"
          aria-label="{row.slug} のプロジェクト詳細画面を開く"
          title="プロジェクト詳細画面を開きます"
          onclick={() => onopenProject(row.slug)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>

    {#if row.state === "loaded"}
      {#if !folded}
        {#each row.cells as cell (cell.column)}
          {@const entry = laneCreate(row.createStatusCandidates, cell.column)}
          {@const entryOpen =
            createOpen !== null &&
            createOpen.slug === row.slug &&
            createOpen.column === cell.column}
          <LaneCell
            tasks={cell.tasks}
            label={CANONICAL_COLUMN_LABEL[cell.column]}
            collapsed={collapsedColumns.includes(cell.column)}
            {density}
            {showStorageMark}
            {selectedPath}
            {conflictOf}
            {onselect}
          >
            {#snippet createEntry()}
              <!-- 列内新規タスク入力 (doc-7 §4.1). The title and the chosen candidate come from the
                   shell for the one open cell; every other cell draws only its ＋新規 or its reason,
                   so the values cannot be shared between two entries. -->
              <LaneCreate
                {entry}
                label={CANONICAL_COLUMN_LABEL[cell.column]}
                open={entryOpen}
                title={entryOpen ? createTitle : ""}
                status={entryOpen ? createStatus : ""}
                blocked={entryOpen ? createBlocked : null}
                held={createHeld}
                onopen={() => oncreateOpen(row.slug, cell.column)}
                onclose={oncreateClose}
                ontitle={oncreateTitle}
                onstatus={oncreateStatus}
                onsubmit={oncreateSubmit}
              />
            {/snippet}
          </LaneCell>
        {/each}
        {#if hasUnmapped}
          <!-- No `createEntry`: 未対応列には入口を置かない (doc-7 §4.1), and the 置かない理由 is in the
               column head rather than in each row's cell (see the head above). Deliberately absent,
               not forgotten — passing a disabled entry here is the presentation doc-11 §5 separates
               from this one. -->
          <LaneCell
            tasks={row.unmapped}
            label={UNMAPPED_LABEL}
            unmapped
            {density}
            {showStorageMark}
            {selectedPath}
            {conflictOf}
            {onselect}
          />
        {/if}
      {/if}
    {:else if row.state === "unreadable"}
      <!-- ルート読取不能 (doc-7 §6): the row stays and states why it has no cards. Nothing is
           drawn in the columns, so this can never be mistaken for an empty cell. -->
      <div class="row-message">
        <span class="reason">ルート読取不能: {row.detail}</span>
        <button type="button" onclick={() => onretry(row.slug)}>再読み込み</button>
        <span class="withheld">{ROW_FOLD_ABSENT_REASON}</span>
      </div>
    {:else}
      <div class="row-message pending">読み込み中…</div>
    {/if}
  {/each}
</div>

<style lang="scss">
  .grid {
    display: grid;
    // The four canonical columns at equal width so the same status sits at the same x for every
    // project, with the 未対応 column narrower and last. No project column at the left: the row's
    // identity is on its レーンヘッダ行 (doc-7 §2.3), which frees the whole width for the columns.
    // The script builds the template so that folding a column is one edit for the whole grid.
    grid-template-columns: var(--columns);
    align-items: stretch;
    // Rows keep their content height; leftover space stays at the bottom instead of being
    // shared out, which would stretch the header and every row of a short grid.
    align-content: start;
    // Takes the rest of the screen and scrolls inside itself, so the filter bar stays put while
    // the grid moves. `min-width: 0` is what lets it *give up* width to the detail panel beside
    // it: without it a flex item refuses to shrink below its content, and the panel would be
    // pushed off the clipped edge of the screen instead of the columns scrolling.
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
  }

  // 2 層スティッキー (doc-7 §2.3): the 列ヘッダ行 holds the top of the scrollport and the レーンヘッダ行
  // of whichever row is being read holds the line just below it. The layer numbers are relative and
  // local — the two rows only have to sit above the cards and below the popovers and the 中央モーダル
  // layer, which are 3 and up across the app.
  .head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line-strong);
    background: var(--bg);
    font-size: 0.8rem;
    font-weight: 600;

    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // 畳んだ列 (doc-7 §2.2): a band 5rem wide, so the name, the count and the way back stack
    // instead of sitting side by side. Nothing but the width changes about the column.
    &.folded {
      flex-direction: column;
      align-items: stretch;
      gap: 0.16rem;
      padding: 0.4rem 0.25rem;
      font-size: 0.7rem;
      text-align: center;
    }
  }

  .head .fold {
    margin-left: auto;
  }

  .head.folded .fold {
    margin-left: 0;
  }

  .total {
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  // 未対応列 has no 畳む to put on the right, and the sentence that says why stands under the name
  // rather than beside it — side by side, the name is what gives up room and 未対応 would ellipsise.
  .head.unmapped {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    opacity: 0.75;
  }

  .lane-head,
  .row-message {
    border-bottom: 1px solid var(--line);
  }

  // レーンヘッダ行 (doc-7 §2.3): one line across the whole grid. `nowrap` holds it to that one line —
  // the width is the reason this方式 was chosen over a fixed column, so a header that wrapped would
  // give back what it bought. What can lose room does: the folded row's counts scroll inside
  // themselves, and the name ellipsises, while the counts and the controls keep their size.
  // Takes no height and paints nothing: the row's start, for the 着地 to measure (see `laneMarks`).
  .lane-mark {
    grid-column: 1 / -1;
    height: 0;
  }

  .lane-head {
    grid-column: 1 / -1;
    // Stuck to the 列ヘッダ行's lower edge, at whatever height that row currently has (the script
    // measures it). Every row's header is stuck to the same line, so the one on top is the last row
    // whose start has passed — the row whose cards are being read.
    position: sticky;
    top: var(--lane-top);
    z-index: 1;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.5rem;
    border-top: 1px solid var(--line);
    // Opaque, because the cards of the row above scroll underneath it (decision-12 の色値).
    background: var(--inset);

    // 読取不能 as 問題の縁 (doc-11 §2.3) rather than as a tint over the whole row header. The tint
    // used to sit *under* the 継続検出停止 chip — a root that cannot be read is exactly a root whose
    // watch is not running, so both show at once — and a chip's 12% 混色背景 over a tinted face is a
    // different colour than over `--inset`, which is what the 収録条件 was verified against
    // (decision-12, `lib/theme.test.ts`). The edge says the same thing and cannot get behind a chip.
    &.unreadable {
      border-left: 3px solid var(--mark-unreadable);
    }
  }

  // 印チップ配色規則 (decision-12): 文字＝族の色、背景＝族の色 12% 混色、枠＝族の色 45% 混色。族の色は
  // app.scss の表示テーマ 1 箇所から取る (decision-6). The chip sits on the レーンヘッダ行 (`--inset`),
  // which is one of the two surfaces the 収録条件 is verified on (`lib/theme.test.ts`).
  .mark {
    flex: none;
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
    font-size: 0.65rem;

    // 印は `cursor: help` と説明を伴う (doc-11 §3), keyed on the explanation being there — the same
    // rule the card and the detail heading use, so one chip does not promise more than another.
    &[title] {
      cursor: help;
    }

    &[data-kind="undetectable"] {
      --family: var(--mark-undetectable);
    }
  }

  // The one part of the header allowed to lose room, since the name is also readable in the slug
  // beside it and in full through the `title`.
  .names {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  // The project name is an entry point (doc-7 §2.3) but also the row's identity, so it takes no
  // border: drawn like a button, the most prominent thing on the レーンヘッダ行 would read as an
  // operation rather than as a name. That it is pressable is carried by the cursor and by an
  // underline on hover/focus, while the `›` at the row's end is the explicit control for the same
  // destination.
  .project {
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    overflow: hidden;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }

  // 副次 (doc-11 §2.1): the theme's own colour, not an opacity over `--fg` — an opacity lands
  // somewhere different on every 表示テーマ, which is what decision-12 keeps the colours for.
  .slug {
    flex: none;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .count {
    flex: none;
    color: var(--muted);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  // 行折畳み時の列別件数 (doc-7 §2.3). Kept on the one line by scrolling inside itself: the counts
  // are the part of the folded row that grows with the number of columns, and the row header must
  // not wrap (doc-7 §2.3 の 折り返しなし).
  .fold-counts {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    min-width: 0;
    overflow-x: auto;
    white-space: nowrap;
  }

  .fold-count {
    display: inline-flex;
    gap: 0.25rem;
    font-size: 0.68rem;

    .name {
      color: var(--muted);
    }

    .n {
      font-variant-numeric: tabular-nums;
    }
  }

  // 置かない操作の理由 (doc-7 §4.1・§6). 副次の文であって 弱 でも 空表示 でもないので `--muted`
  // (doc-11 §2.1) — the same colour TASK-48 moved the withheld reasons of the Git 履歴欄 to.
  .withheld {
    color: var(--muted);
    font-size: 0.65rem;
    font-weight: 400;
    line-height: 1.25;
  }

  .fold {
    display: inline-flex;
    flex: none;
    gap: 0.2rem;
    align-items: center;
    padding: 0 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .controls {
    display: flex;
    flex: none;
    gap: 0.2rem;
    margin-left: auto;

    button {
      padding: 0 0.35rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
      // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a `:disabled` rule here would outrank it.
    }
  }

  // The reason sits above the rows and spans every column, so it is read before the arrows it
  // explains rather than found by hovering one of them (doc-11 §5).
  .blocked-note {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.7rem;
  }

  .row-message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    // The row's whole width, under its レーンヘッダ行: with no project column left, there is nothing
    // for the message to sit beside (doc-7 §2.3).
    grid-column: 1 / -1;
    padding: 0.5rem;
    font-size: 0.8rem;

    button {
      padding: 0.1rem 0.5rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }
  }

  .reason {
    color: var(--mark-unreadable);
  }

  .pending {
    opacity: 0.6;
  }
</style>
