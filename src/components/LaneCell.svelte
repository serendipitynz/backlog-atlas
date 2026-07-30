<script lang="ts">
  // レーンセル (doc-7 §1): one project row × one canonical column, or the row's 未対応区画.
  // An empty cell is drawn empty and says so — "該当タスクが無い" is a different fact from
  // "ルートが読めない", which is a row-level state (doc-7 §6).
  import TaskCard from "./TaskCard.svelte";
  import type { VersionConflict } from "../lib/mark";
  import type { TaskView } from "../lib/wire";

  interface Props {
    tasks: TaskView[];
    /** 未対応区画 shows each card's original status string (doc-7 §2). */
    unmapped?: boolean;
    showStorageMark: boolean;
    selectedPath: string | null;
    /** 版ずれ (doc-9) per task, from the shell's record — a lookup, not a copy of the map. */
    conflictOf: (view: TaskView) => VersionConflict | null;
    onselect: (view: TaskView) => void;
  }

  let {
    tasks,
    unmapped = false,
    showStorageMark,
    selectedPath,
    conflictOf,
    onselect,
  }: Props = $props();
</script>

<div class="cell" class:unmapped>
  {#if tasks.length === 0}
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

  .empty {
    padding: 0.2rem 0.1rem;
    font-size: 0.75rem;
    opacity: 0.4;
  }
</style>
