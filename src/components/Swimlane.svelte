<script lang="ts">
  // プロジェクト別スイムレーン (doc-7 §2): rows are projects, columns are the canonical four,
  // cells hold task cards. The four columns are laid out once for the whole grid — not per row
  // — so a column can be read top-to-bottom across projects, which is the point of the screen
  // (doc-7 §2 プロジェクト横断の縦読み).
  import LaneCell from "./LaneCell.svelte";
  import { UNWATCHED_MARK, type VersionConflict } from "../lib/mark";
  import {
    CANONICAL_COLUMNS,
    CANONICAL_COLUMN_LABEL,
    type SwimlaneRow,
  } from "../lib/swimlane";
  import type { TaskView } from "../lib/wire";

  interface Props {
    rows: SwimlaneRow[];
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
    onselect: (view: TaskView) => void;
    onmove: (slug: string, direction: -1 | 1) => void;
    onhide: (slug: string) => void;
    onretry: (slug: string) => void;
    onreread: (slug: string) => void;
  }

  let {
    rows,
    showStorageMark,
    selectedPath,
    canReorder,
    unwatched,
    conflictOf,
    onselect,
    onmove,
    onhide,
    onretry,
    onreread,
  }: Props = $props();

  // 未対応区画は常設ではない (doc-7 §2.2): the column appears only while some row has a task in
  // it, and disappears again once none does.
  let hasUnmapped = $derived(
    rows.some((row) => row.state === "loaded" && row.unmapped.length > 0),
  );
  function visibleCount(row: SwimlaneRow): number {
    if (row.state !== "loaded") return 0;
    return (
      row.cells.reduce((sum, cell) => sum + cell.tasks.length, 0) + row.unmapped.length
    );
  }
</script>

<div class="grid" class:with-unmapped={hasUnmapped}>
  <div class="head corner">プロジェクト</div>
  {#each CANONICAL_COLUMNS as column (column)}
    <div class="head">{CANONICAL_COLUMN_LABEL[column]}</div>
  {/each}
  {#if hasUnmapped}
    <div class="head unmapped">未対応</div>
  {/if}

  {#each rows as row (row.slug)}
    <div class="row-head" class:unreadable={row.state === "unreadable"}>
      <div class="names">
        <span class="project">
          {row.state === "loaded" && row.projectName ? row.projectName : row.slug}
        </span>
        {#if row.state === "loaded" && row.projectName}
          <span class="slug">{row.slug}</span>
        {/if}
      </div>
      {#if row.state === "loaded"}
        <span class="count">{visibleCount(row)} / {row.totalBeforeFilter} 件</span>
      {/if}
      {#if unwatched.includes(row.slug)}
        <!-- 継続検出停止: the cards below are only as fresh as the last read, and 版ずれ の有無は
             確かめられない — a distinct family from both 縮退 and 版ずれ (doc-9 §3/§5). -->
        <span class="mark" data-kind={UNWATCHED_MARK.kind} title={UNWATCHED_MARK.detail}>
          {UNWATCHED_MARK.label}
        </span>
      {/if}
      <div class="controls">
        <button
          type="button"
          title="上へ"
          disabled={!canReorder}
          onclick={() => onmove(row.slug, -1)}>↑</button
        >
        <button
          type="button"
          title="下へ"
          disabled={!canReorder}
          onclick={() => onmove(row.slug, 1)}>↓</button
        >
        <button type="button" title="この行を隠す" onclick={() => onhide(row.slug)}>隠す</button>
        {#if unwatched.includes(row.slug)}
          <!-- The manual 再読込契機 (doc-9 §3) sits on the row it refreshes: a row that says its
               cards may be stale has to carry the one control that resolves that. -->
          <button
            type="button"
            title="このルートを読み直す（継続検出が動いていないため自動では更新されません）"
            onclick={() => onreread(row.slug)}>再読込</button
          >
        {/if}
      </div>
    </div>

    {#if row.state === "loaded"}
      {#each row.cells as cell (cell.column)}
        <LaneCell
          tasks={cell.tasks}
          {showStorageMark}
          {selectedPath}
          {conflictOf}
          {onselect}
        />
      {/each}
      {#if hasUnmapped}
        <LaneCell
          tasks={row.unmapped}
          unmapped
          {showStorageMark}
          {selectedPath}
          {conflictOf}
          {onselect}
        />
      {/if}
    {:else if row.state === "unreadable"}
      <!-- ルート読取不能 (doc-7 §6): the row stays and states why it has no cards. Nothing is
           drawn in the columns, so this can never be mistaken for an empty cell. -->
      <div class="row-message">
        <span class="reason">ルート読取不能: {row.detail}</span>
        <button type="button" onclick={() => onretry(row.slug)}>再読み込み</button>
      </div>
    {:else}
      <div class="row-message pending">読み込み中…</div>
    {/if}
  {/each}
</div>

<style lang="scss">
  .grid {
    display: grid;
    // Row header, then the four canonical columns at equal width so the same status sits at
    // the same x for every project. The 未対応 column is narrower and last.
    grid-template-columns: minmax(11rem, 14rem) repeat(4, minmax(13rem, 1fr));
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

    &.with-unmapped {
      grid-template-columns: minmax(11rem, 14rem) repeat(4, minmax(13rem, 1fr)) minmax(
          10rem,
          0.7fr
        );
    }
  }

  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line-strong);
    background: var(--bg);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .head.unmapped {
    opacity: 0.75;
  }

  .row-head,
  .row-message {
    border-bottom: 1px solid var(--line);
  }

  .row-head {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.5rem;
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
    align-self: flex-start;
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
    font-size: 0.65rem;

    &[data-kind="undetectable"] {
      --family: var(--mark-undetectable);
    }
  }

  .names {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .project {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .slug {
    font-size: 0.7rem;
    opacity: 0.6;
  }

  .count {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }

  .controls {
    display: flex;
    gap: 0.2rem;

    button {
      padding: 0 0.35rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
  }

  .row-message {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    // Spans every column but the row header, whatever the 未対応 column's presence makes that.
    grid-column: 2 / -1;
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
