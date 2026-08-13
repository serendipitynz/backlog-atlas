<script lang="ts">
  // プロジェクト別スイムレーン (doc-7 §2): rows are projects, columns are the canonical four,
  // cells hold task cards. The four columns are laid out once for the whole grid — not per row
  // — so a column can be read top-to-bottom across projects, which is the point of the screen
  // (doc-7 §2 プロジェクト横断の縦読み).
  import LaneCell from "./LaneCell.svelte";
  import LaneCreate from "./LaneCreate.svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import { laneCreate } from "../lib/lane-create";
  import { UNWATCHED_MARK, type VersionConflict } from "../lib/mark";
  import {
    CANONICAL_COLUMNS,
    CANONICAL_COLUMN_LABEL,
    LANE_FIGURE,
    LAST_COLUMN_FOLD_BLOCKED_REASON,
    ROW_FOLD_ABSENT_REASON,
    UNMAPPED_LABEL,
    columnFoldable,
    laneCounts,
    laneScrollDelta,
    rowFoldable,
    visibleCount,
    type GridColumn,
    type SwimlaneRow,
  } from "../lib/swimlane";
  import type { CardDensity, StatusColumn, TaskView } from "../lib/wire";

  interface Props {
    rows: SwimlaneRow[];
    /**
     * 行折畳み・列折畳み (doc-7 §5.1) の状態. Held by the shell for the same reason as
     * 列内新規タスク入力 below: this grid is unmounted when プロジェクト詳細画面 is entered and when a task
     * is opened in 全面シングルビュー, and 一時状態 means 実行内保持 — the fold has to be there on the
     * return (doc-7 §5.1). Reading them as props keeps that single copy the one the grid draws from.
     */
    foldedRows: readonly string[];
    collapsedColumns: readonly GridColumn[];
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
     * the staleness is a property of *these* cards, and `undetectable` — not バージョン不整合 — because Atlas
     * cannot say whether the version moved (doc-9 §5 forbids the two reading alike).
     */
    unwatched: readonly string[];
    /** バージョン不整合 (doc-9) per task, from the shell's record. */
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
    /** Ask for this row's 行折畳み to be turned the other way (doc-7 §2.3). */
    onrowFold: (slug: string) => void;
    /**
     * Ask for this column's 列折畳み to be turned the other way (doc-7 §2.2), which is asked only for a
     * column [`columnFoldable`] allows — the shell checks it again, since it is the rule's holder.
     */
    oncolumnFold: (column: GridColumn) => void;
    onselect: (view: TaskView) => void;
    onmove: (slug: string, direction: -1 | 1) => void;
    onretry: (slug: string) => void;
    onreread: (slug: string) => void;
    /** Open プロジェクト詳細画面 (doc-10); the レーンヘッダ行 is its entry point (doc-7 §2.3). */
    onopenProject: (slug: string) => void;
    onfocused: () => void;
  }

  let {
    rows,
    foldedRows,
    collapsedColumns,
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
    onrowFold,
    oncolumnFold,
    onselect,
    onmove,
    onretry,
    onreread,
    onopenProject,
    onfocused,
  }: Props = $props();

  /**
   * The scrollport both header rows are stuck to, and the box a 着地 scrolls.
   *
   * `| null` for the same reason as [`BoundElements`] below: `bind:this` writes `null` on unmount,
   * never `undefined`. This one sits on the template's root and no branch removes it, so nothing can
   * reach the effect with it emptied — but a declaration that says `undefined` beside a comment
   * saying `null` is what the reader has to reconcile, and reconciling it wrongly is the whole of
   * TASK-119.
   */
  let grid = $state<HTMLElement | null>(null);

  /**
   * What a keyed `bind:this` actually holds: the element while it is mounted, **`null` once it is
   * not**, and nothing at all until it first mounts.
   *
   * The `null` is Svelte's, not this component's — `bind_this`'s teardown writes `null` into the
   * binding and *leaves the key in place*, and it does the same to the old key when an `{#each}`
   * item moves. So a record written this way is never `Record<string, HTMLElement>`; declaring it
   * that way is what let TASK-119's 更新停止 through, since a filter for `undefined` alone passes a
   * `null` straight to the measurement below.
   */
  type BoundElements = Record<string, HTMLElement | null | undefined>;

  /**
   * The elements such a record currently holds, with the unmounted keys dropped.
   *
   * Every read of these records goes through this or [`boundElement`], because the case is not
   * hypothetical on this screen: 未分類区画 は常設ではない (doc-7 §2.2), so a filter that empties it
   * unmounts that head while the grid stays mounted — and the record is `$state`, so its own change
   * re-runs the effects that read it. An exception thrown there leaves the `$effect` rather than the
   * callback, which stops Svelte's flush for good: the window keeps its last paint and answers
   * nothing further (TASK-119).
   */
  function boundElements(bound: BoundElements): HTMLElement[] {
    return Object.values(bound).filter(
      (element) => element !== null && element !== undefined,
    );
  }

  /** The one element `key` holds, or `null` for both ways it can hold none. */
  function boundElement(bound: BoundElements, key: string): HTMLElement | null {
    return bound[key] ?? null;
  }

  /**
   * The レーンヘッダ行 elements and the zero-height markers that sit immediately above them, by slug.
   * Held here rather than resolved with a DOM query, because the grid is the only thing that knows
   * which element is which row.
   *
   * The pair exists because the header is sticky: its position stops being the row's position as
   * soon as it is held at the top, so the marker — which nothing moves — is what says where the row
   * begins, and the header is only measured for its height (`laneScrollDelta`).
   */
  let laneHeads = $state<BoundElements>({});
  let laneMarks = $state<BoundElements>({});

  /**
   * The 列ヘッダ行 elements, by column, so the レーンヘッダ行 can be stuck to the row's lower edge.
   *
   * Its height is not a constant, even though every head is now one line (doc-7 §2.2): the line is as
   * tall as the root font-size makes it, which the OS and the browser both scale, and anything later
   * added to a head moves it again. So the offset is measured rather than written down — a fixed one
   * would leave a strip of scrolled cards between the two rows as soon as the real height differed
   * from it, which is exactly what 受入条件 #3 forbids. (Until TASK-69 the folded head stacked its
   * parts and the 未分類列 carried two sentences, so folding a column moved this by two lines; those
   * two causes are gone, the measurement is not.)
   */
  let columnHeads = $state<BoundElements>({});
  let headHeight = $state(0);

  /**
   * The row whose 着地 just completed, carrying the 一時的な強調 (doc-7 §2.3). Separate from
   * `focusSlug`, which is cleared the moment the scroll is written — the emphasis has to outlive
   * that moment, because it exists precisely for the landing that writes no scroll at all (a row
   * already in view moves nothing, and without a mark the return looks like nothing happened).
   * Cleared when the fade's animation ends, so the class does not sit on the row forever.
   */
  let landedSlug = $state<string | null>(null);

  /**
   * The 列ヘッダ行's height as it is right now.
   *
   * Every head is measured, not just one, so the offset does not depend on the grid stretching them
   * to a common height. `getBoundingClientRect` rather than `offsetHeight`: the row's height is
   * fractional at most font sizes, and the rounded integer would leave a hairline of scrolled
   * content showing through the seam half the time.
   */
  function measureHead(): number {
    const elements = boundElements(columnHeads);
    if (elements.length === 0) return 0;
    return Math.max(...elements.map((element) => element.getBoundingClientRect().height));
  }

  $effect(() => {
    const elements = boundElements(columnHeads);
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
    const mark = boundElement(laneMarks, slug);
    const head = boundElement(laneHeads, slug);
    const container = grid;
    if (mark === null || head === null || container === null) return;
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
    // 一時的な強調 (doc-7 §2.3), on every landing — not only the ones that scrolled. The landing
    // for a row already in view writes no scroll, and that is exactly the case where the return
    // would otherwise look like nothing happened.
    landedSlug = slug;
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
  const LAST_COLUMN_REASON_ID = "swimlane-last-column-fold-blocked";
  const REORDER_BLOCKED_REASON =
    "登録ファイルが読み取り専用のため、行の並べ替えはできません。" +
    "プロジェクト詳細の概要区画で理由を確認できます。";

  // 未分類区画は常設ではない (doc-7 §2.2): the column appears only while some row has a task in
  // it, and disappears again once none does.
  let hasUnmapped = $derived(
    rows.some((row) => row.state === "loaded" && row.unmapped.length > 0),
  );

  // 列の幅. A folded column is a narrow band; the 未分類 column stays narrower than the four and last
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
      ...(hasUnmapped
        ? [collapsedColumns.includes("unmapped") ? FOLDED_COLUMN : UNMAPPED_COLUMN]
        : []),
    ].join(" "),
  );

  // 行折畳み は 行非表示 と別の語・別の操作 (doc-7 §5.1), and since TASK-131 it is the only one of the
  // two this row offers: 表示・非表示 は メニューのプロジェクト一覧 が 1 か所で扱う。The sentences below
  // therefore say 件数を残す without a second control beside them saying 件数も読めなくなる.
  const ROW_FOLD_HINT = "行折畳み: レーンセルを畳み、列別の件数をこの行に残します。";
  const ROW_UNFOLD_HINT = "行折畳みを解き、レーンセルを戻します。";
  const COLUMN_FOLD_HINT = "列折畳み: この列を全行同時に畳み、列名を残します（件数は行ごとに残ります）。";
  const COLUMN_UNFOLD_HINT = "列折畳みを解き、この列のカードを全行で戻します。";
</script>

<div
  class="grid"
  style="--columns: {columnTemplate}; --lane-top: {headHeight}px"
  bind:this={grid}
>
  <!-- 列ヘッダ 1 つ。正準ステータス列と 未分類区画 が同じものを描く (doc-7 §2.2): 列折畳みはどちらにも
       効くので、控えとその 4 つの aria 属性を 2 か所に書くと片方だけが後から変わりうる。`name` を別に
       取るのは、読み上げが「To Do 列の」と「未分類区画の」で分かれるためで、`label` は画面に出る語。 -->
  {#snippet columnHead(column: GridColumn, label: string, name: string)}
    {@const folded = collapsedColumns.includes(column)}
    {@const foldable = columnFoldable(collapsedColumns, column)}
    <div
      class="head"
      class:folded
      class:unmapped={column === "unmapped"}
      bind:this={columnHeads[column]}
    >
      <!-- アイコンのみのボタン (doc-11 §2.4): the figure carries no words, so 列折畳み is named by
           `aria-label` and explained by `title`. ＜ / ＞ point at what the press does rather than at
           the column's current width — sideways there is no 開いている / 畳んである to point at
           (doc-7 §2.2), which is the one place this screen's two folds differ.
           **Before the name, at the head's left edge**, so the control sits at the same x whatever the
           name's length — a 畳んだ列 is 5rem wide and a name that ellipsises there would otherwise push
           the control around (doc-7 §2.2).
           残り 1 列は畳めない (doc-7 §2.2): `aria-disabled` and focusable rather than `disabled`, with
           the reason in the line below the heads — the form doc-11 §5 requires when the reason would
           otherwise live only on a `title` a keyboard never reaches. -->
      <button
        type="button"
        class="fold"
        aria-expanded={!folded}
        aria-disabled={!foldable}
        aria-describedby={foldable ? undefined : LAST_COLUMN_REASON_ID}
        aria-label="{name}の列折畳みを{folded ? '解く' : '行う'}"
        title={foldable
          ? folded
            ? COLUMN_UNFOLD_HINT
            : COLUMN_FOLD_HINT
          : LAST_COLUMN_FOLD_BLOCKED_REASON}
        onclick={() => foldable && oncolumnFold(column)}
      >
        <Icon name={folded ? LANE_FIGURE.columnFold.unfold : LANE_FIGURE.columnFold.fold} />
      </button>
      <!-- 畳んだ列は列名を残す (doc-7 §2.2). One line in both states: the name gives up its tail to an
           ellipsis rather than wrapping, because a head that grew a second line would push every row
           of the grid down for a word the `title` already carries in full. 件数はここに出さない —
           each row's own count travels with the cards in the cell (`LaneCell.svelte`). -->
      <span class="label" title={label}>{label}</span>
    </div>
  {/snippet}

  {#each CANONICAL_COLUMNS as column (column)}
    {@render columnHead(column, CANONICAL_COLUMN_LABEL[column], `${CANONICAL_COLUMN_LABEL[column]} 列`)}
  {/each}
  {#if hasUnmapped}
    <!-- 未分類区画も列折畳みの対象 (doc-7 §2.2). It holds cards like any column, and the reason it used
         to be excluded was only that it is not a 正準ステータス列 — which says nothing about folding.
         What stays apart is [`columnFoldable`]'s guarantee: this one never counts as the column left
         open, because it vanishes on its own once no row has an 未分類 status task. -->
    {@render columnHead("unmapped", UNMAPPED_LABEL, "未分類区画")}
  {/if}

  {#if !CANONICAL_COLUMNS.every((column) => columnFoldable(collapsedColumns, column))}
    <!-- The reason the last open column's control is refused, on its own line under the heads and
         spanning them all (the same treatment the 並べ替え block below gets). Present only while the
         state holds, since a reason for a block that is not in force reads as a warning about
         nothing. -->
    <p class="blocked-note" id={LAST_COLUMN_REASON_ID}>{LAST_COLUMN_FOLD_BLOCKED_REASON}</p>
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
      class:landed={landedSlug === row.slug}
      bind:this={laneHeads[row.slug]}
      onanimationend={(event) => {
        // Only the fade's own end takes the class off: `animationend` bubbles, and a child's
        // animation ending must not cut the emphasis short.
        if (event.target === event.currentTarget) landedSlug = null;
      }}
    >
      {#if rowFoldable(row)}
        <!-- アイコンのみのボタン (doc-11 §2.4): 行折畳み is named by `aria-label` and explained by
             `title`, since the figure has no words. ∨ / ∧ point at whether the row's cells are open
             or folded, not at what the press does (doc-7 §2.3) — with the words gone the figure is
             the only thing left saying which state the row is in. -->
        <button
          type="button"
          class="fold"
          aria-expanded={!folded}
          aria-label="{row.slug} の行折畳みを{folded ? '解く' : '行う'}"
          title={folded ? ROW_UNFOLD_HINT : ROW_FOLD_HINT}
          onclick={() => onrowFold(row.slug)}
        >
          <Icon name={folded ? LANE_FIGURE.rowFold.folded : LANE_FIGURE.rowFold.open} />
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
        <!-- 継続検出停止: the cards below are only as fresh as the last read, and バージョン不整合 の有無は
             確かめられない — a distinct family from 不整合 (doc-9 §3/§5). -->
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
        <!-- 押せない矢印は消さずに残す (doc-11 §5). `aria-label` carries the name the figure does not
             spell out, and the reason travels through `aria-describedby` to the one line above the
             rows; `title` repeats it for the pointer only, never as its only home.
             移動の族 (doc-11 §2.4): the same pair 前後移動 takes in `TaskDetail.svelte`, which the
             section allows because both point at the same thing — moving one step up or down. What is
             moved (this row's place in the ledger / the task the panel shows) is what the labels say,
             and the 脇パネル配置 is where both are on screen at once. -->
        <button
          type="button"
          aria-label="{row.slug} を上へ"
          aria-disabled={!canReorder}
          aria-describedby={canReorder ? undefined : REORDER_REASON_ID}
          title={canReorder ? "表示順を上へ" : REORDER_BLOCKED_REASON}
          onclick={() => canReorder && onmove(row.slug, -1)}
        >
          <Icon name={LANE_FIGURE.moveUp} />
        </button>
        <button
          type="button"
          aria-label="{row.slug} を下へ"
          aria-disabled={!canReorder}
          aria-describedby={canReorder ? undefined : REORDER_REASON_ID}
          title={canReorder ? "表示順を下へ" : REORDER_BLOCKED_REASON}
          onclick={() => canReorder && onmove(row.slug, 1)}
        >
          <Icon name={LANE_FIGURE.moveDown} />
        </button>
        {#if unwatched.includes(row.slug)}
          <!-- The manual 再読込契機 (doc-9 §3) sits on the row it refreshes: a row that says its
               cards may be stale has to carry the one control that resolves that. -->
          <button
            type="button"
            title="このルートを読み直す（継続検出が動いていないため自動では更新されません）"
            onclick={() => onreread(row.slug)}>再読込</button
          >
        {/if}
        <!-- 行末の入口 (doc-7 §2.3's sketch, doc-10 §2): the same destination as the project name, as
             an entry point at the end of the row. The name is the part that gives up room as the
             window narrows; this one keeps its width, so it stays pressable.
             移動の族 (doc-11 §2.4): `arrow-right`, not the `chevron-right` the sketch's `›` looks like
             — that figure is the 列折畳み one column head away, and the section copies what the glyph
             pointed at rather than how it was drawn. -->
        <button
          type="button"
          aria-label="{row.slug} のプロジェクト詳細画面を開く"
          title="プロジェクト詳細画面を開きます"
          onclick={() => onopenProject(row.slug)}
        >
          <Icon name={LANE_FIGURE.openProject} />
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
          <!-- No `createEntry`: 未分類列には入口を置かない (doc-7 §4.1), and the 置かない理由 is in the
               column head rather than in each row's cell (see the head above). Deliberately absent,
               not forgotten — passing a disabled entry here is the presentation doc-11 §5 separates
               from this one. -->
          <LaneCell
            tasks={row.unmapped}
            label={UNMAPPED_LABEL}
            unmapped
            collapsed={collapsedColumns.includes("unmapped")}
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
    /*
     * One height for every 控え on the two header rows, stated rather than taken from a text line box
     * (the same reason `FilterBar.svelte` has `--bar-control`, doc-12 §4.3). 折畳み now draws a figure
     * and its neighbours draw words, and a figure's box is its own 1em — 11.2px against the ~18.8px a
     * .7rem line box gives, measured — so the two would no longer end up the same height on their own.
     * In `rem`, so the value does not move with the font-size of whichever head the control sits in.
     * The border-box sizing the stated height depends on comes from app.scss now (doc-11 §2.2), so
     * the controls below no longer declare it each. The value is the smallest step of that section's
     * 段階 — on this row the 行の識別 is the content and these are what sit beside it.
     */
    --head-control: 1.2rem;

    display: grid;
    // The four canonical columns at equal width so the same status sits at the same x for every
    // project, with the 未分類 column narrower and last. No project column at the left: the row's
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
    // Centred rather than on a baseline: the 列折畳み control holds a figure, and a box with no text
    // in it has no baseline to share with the name beside it (`App.svelte` has the same note for ☰).
    align-items: center;
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

    // 畳んだ列 (doc-7 §2.2): a band 5rem wide, and **still one line** — the control keeps its size and
    // the name gives up its tail to the ellipsis above. Stacking the parts instead (what this used to
    // do) made the head three lines tall, and because every head is as tall as the tallest, folding
    // one column pushed the whole grid down by two lines.
    &.folded {
      gap: 0.16rem;
      padding: 0.4rem 0.25rem;
      font-size: 0.7rem;
    }
  }

  // 未分類列 draws the same head as the four (doc-7 §2.2) — one line, control then name — and is set
  // apart only by being dimmer, the same 中立 treatment its cells get. The two sentences that used to
  // stand under its name are now the line below the heads (doc-7 §4.1), which is what lets this head
  // be one line like the others.
  .head.unmapped {
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

    // 一時的な強調 (doc-7 §2.3): a background tint that fades away on its own — an answer to the
    // landing, not a lasting state, so it is none of doc-11 §2.3's rows and does not borrow the
    // 選択 outline. `--info` because the tint informs (this is the row you asked for); mixed over
    // `--inset` so the face stays opaque while it fades (cards scroll underneath this header).
    // A one-shot animation on a class that leaves, never a standing `transition`: a standing one
    // would also animate every theme switch.
    &.landed {
      animation: landed-fade 1.6s ease-out both;
    }
  }

  @keyframes landed-fade {
    from {
      background-color: color-mix(in srgb, var(--info) 30%, var(--inset));
    }

    to {
      background-color: var(--inset);
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

  // 折畳みの控え (doc-7 §2.2・§2.3), アイコンのみのボタン (doc-11 §2.4). The `font-size` is the .7rem
  // its neighbours read at and it is also what sizes the figure, since an icon draws at 1em — the icon
  // gets no size of its own (doc-11 §2.4). Centred vertically because the height is stated rather than
  // taken from a text line, so the figure has to be placed inside it; nothing widens this box (it is
  // `flex: none` in both an open head and a folded one), so there is nothing to centre horizontally.
  .fold {
    display: inline-flex;
    flex: none;
    align-items: center;
    height: var(--head-control);
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

    // 並べ替えと行末の入口はアイコンのみのボタン、再読込は文言 (doc-11 §2.4). Centred both ways for the
    // same reason `.fold` is: the height is stated rather than taken from a text line, and a figure is
    // a `display: block` svg that brings no line box to be centred by. The 再読込 label rides along.
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: var(--head-control);
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
