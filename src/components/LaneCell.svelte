<script lang="ts">
  // レーンセル (doc-7 §1): one project row × one canonical column, or the row's 未対応区画.
  // An empty cell is drawn empty and says so — "該当タスクが無い" is a different fact from
  // "ルートが読めない", which is a row-level state (doc-7 §6).
  import TaskCard from "./TaskCard.svelte";
  import type { TaskView } from "../lib/wire";

  interface Props {
    tasks: TaskView[];
    /** 未対応区画 shows each card's original status string (doc-7 §2). */
    unmapped?: boolean;
    showStorageMark: boolean;
    selectedPath: string | null;
    onselect: (view: TaskView) => void;
  }

  let { tasks, unmapped = false, showStorageMark, selectedPath, onselect }: Props = $props();
</script>

<div class="cell" class:unmapped>
  {#if tasks.length === 0}
    <span class="empty" aria-label="該当タスクなし">—</span>
  {:else}
    {#each tasks as view (view.task.sourcePath)}
      <TaskCard
        {view}
        {showStorageMark}
        showRawStatus={unmapped}
        selected={selectedPath === view.task.sourcePath}
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
    border-left: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }

  .unmapped {
    border-left: 2px dashed color-mix(in srgb, currentColor 30%, transparent);
    background: color-mix(in srgb, canvastext 4%, transparent);
  }

  .empty {
    padding: 0.2rem 0.1rem;
    font-size: 0.75rem;
    opacity: 0.4;
  }
</style>
