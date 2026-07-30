<script lang="ts">
  // レーンセル (doc-7 §1): one project row × one canonical column, or the row's 未対応区画.
  // An empty cell is drawn empty and says so — "該当タスクが無い" is a different fact from
  // "ルートが読めない", which is a row-level state (doc-7 §6).
  import TaskCard from "./TaskCard.svelte";
  import type { VersionConflict } from "../lib/mark";
  import type { TaskView } from "../lib/wire";

  interface Props {
    tasks: TaskView[];
    /** The column this cell belongs to, for the count a 畳んだ列 announces (doc-7 §2.2). */
    label: string;
    /** 未対応区画 shows each card's original status string (doc-7 §2). */
    unmapped?: boolean;
    /**
     * 列折畳み (doc-7 §2.2): the column is a narrow band in *every* row, so the cell keeps its count
     * and drops its cards. Decided per column by the grid, never per row — a column folded in one row
     * only would put the same status at a different x in each row and break the 縦読み.
     */
    collapsed?: boolean;
    showStorageMark: boolean;
    selectedPath: string | null;
    /** 版ずれ (doc-9) per task, from the shell's record — a lookup, not a copy of the map. */
    conflictOf: (view: TaskView) => VersionConflict | null;
    onselect: (view: TaskView) => void;
  }

  let {
    tasks,
    label,
    unmapped = false,
    collapsed = false,
    showStorageMark,
    selectedPath,
    conflictOf,
    onselect,
  }: Props = $props();
</script>

<div class="cell" class:unmapped class:collapsed>
  {#if collapsed && tasks.length > 0}
    <!-- 畳んだ列は件数を残す (doc-7 §2.2): the number is the cell's whole content, and the column name
         travels with it in the label so the band is readable without the column head beside it. -->
    <span class="count" aria-label="{label} {tasks.length} 件">{tasks.length}</span>
  {:else if tasks.length === 0}
    <!-- 空セル (doc-7 §6): 該当タスク無し is normal, so it is neutral — opacity only, no colour
         and no symbol (decision-6 エラー提示方針). ルート読取不能 never reaches here; it replaces
         the row's cells entirely, which is what keeps the two apart (AC #2). -->
    <span class="empty" aria-label="該当タスクなし">—</span>
  {:else}
    {#each tasks as view (view.task.sourcePath)}
      <TaskCard
        {view}
        {showStorageMark}
        showRawStatus={unmapped}
        selected={selectedPath === view.task.sourcePath}
        conflict={conflictOf(view)}
        {onselect}
      />
    {/each}
  {/if}
</div>

<style lang="scss">
  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.4rem;
    border-left: 1px solid var(--line);
  }

  .unmapped {
    border-left: 2px dashed var(--line-strong);
    background: var(--inset);
  }

  // 畳んだ列 (doc-7 §2.2). Centred so the numbers of a band line up down the grid, and
  // `tabular-nums` (doc-11 §2.2) so they can be compared row to row — the same reason the
  // レーンヘッダ行's counts carry it.
  .collapsed {
    align-items: center;
    padding: 0.4rem 0.2rem;
  }

  .count {
    color: var(--muted);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  // `--faint` (doc-11 §2.1・§6), not an opacity: the theme carries its own 弱 colour, and an opacity
  // over `--fg` lands somewhere else on every 表示テーマ — the two would not stay the same 弱 as the
  // Git 履歴欄's 該当なし, which is the other 正常な不在 on screen.
  .empty {
    padding: 0.2rem 0.1rem;
    color: var(--faint);
    font-size: 0.75rem;
  }
</style>
