<script lang="ts">
  // Draws either of the two runs of cards a プロジェクト行 holds: a レーンセル (doc-7 §1 — the row ×
  // one 正準ステータス列) or the row's 未分類区画, **which is not a レーンセル**. One component for
  // both because what a run of cards looks like is the same; the two are named apart wherever a
  // name reaches the screen (`laneGroupLabel`, doc-8 §2.2).
  // An empty cell is drawn empty and says so — "該当タスクが無い" is a different fact from
  // "ルートが読めない", which is a row-level state (doc-7 §6).
  import TaskCard from "./TaskCard.svelte";
  import type { Snippet } from "svelte";
  import type { VersionConflict } from "../lib/mark";
  import type { CardDensity, TaskView } from "../lib/wire";

  interface Props {
    tasks: TaskView[];
    /** The column this cell belongs to, for the count a 畳んだ列 announces (doc-7 §2.2). */
    label: string;
    /** 未分類区画 shows each card's original status string (doc-7 §2). */
    unmapped?: boolean;
    /**
     * 列折畳み (doc-7 §2.2): the column is a narrow band in *every* row, so the cell keeps its count
     * and drops its cards. Decided per column by the grid, never per row — a column folded in one row
     * only would put the same status at a different x in each row and break the 縦読み.
     */
    collapsed?: boolean;
    /** カード情報量 (doc-7 §3): one 段 for the whole grid, handed down to each card. */
    density: CardDensity;
    showStorageMark: boolean;
    selectedPath: string | null;
    /** 版ずれ (doc-9) per task, from the shell's record — a lookup, not a copy of the map. */
    conflictOf: (view: TaskView) => VersionConflict | null;
    onselect: (view: TaskView) => void;
    /**
     * レーンセルの末尾 (doc-7 §4.1): where 列内新規タスク入力 goes. Handed in as a snippet rather than
     * built here, because what belongs at the end depends on the *project* (its 作成時 status 候補) and
     * on the shell (which cell holds the input) — neither of which a cell knows. The cell owns only
     * the position, which is what doc-7 §4.1 fixes.
     */
    createEntry?: Snippet;
  }

  let {
    tasks,
    label,
    unmapped = false,
    collapsed = false,
    density,
    showStorageMark,
    selectedPath,
    conflictOf,
    onselect,
    createEntry,
  }: Props = $props();
</script>

<div class="cell" class:unmapped class:collapsed>
  {#if collapsed}
    <!-- 畳んだ列は、カード 1 枚を小さな四角 1 つに置き換えて並べ、その下に件数を出す (doc-7 §2.2).
         The squares are how much work is in the cell at a glance — the reading a 5rem band cannot give
         with cards — and the number below them is the exact figure. They carry no colour: a coloured
         square here would read as one of the 4 系統 of chip (doc-11 §3), which say something *about*
         a task, while these say only how many there are.
         `aria-hidden`, because they add nothing a screen reader cannot get from the count. -->
    {#if tasks.length > 0}
      <div class="tally" aria-hidden="true">
        {#each tasks as view (view.task.sourcePath)}
          <span class="pip"></span>
        {/each}
      </div>
    {/if}
    <!-- 件数 (doc-7 §2.2): the exact number, and the column name travels with it in the label so the
         band is readable without the column head beside it. Zero is written as `0`, not as the 空セル's
         `—`: in a folded column the cell *is* the count, and a band mixing dashes with numbers cannot
         be read down the grid, which is the reading the count was kept for. `—` stays the form of an
         空セル in an open column (doc-11 §6), where the absence is what has to be shown rather than a
         number. -->
    <span class="count" aria-label="{label} {tasks.length} 件">{tasks.length}</span>
  {:else}
    {#if tasks.length === 0}
      <!-- 空セル (doc-7 §6): 該当タスク無し is normal, so it is neutral — opacity only, no colour
           and no symbol (decision-6 エラー提示方針). ルート読取不能 never reaches here; it replaces
           the row's cells entirely, which is what keeps the two apart (AC #2). -->
      <span class="empty" aria-label="該当タスクなし">—</span>
    {:else}
      {#each tasks as view (view.task.sourcePath)}
        <TaskCard
          {view}
          {density}
          {showStorageMark}
          showRawStatus={unmapped}
          selected={selectedPath === view.task.sourcePath}
          conflict={conflictOf(view)}
          {onselect}
        />
      {/each}
    {/if}
    <!-- After the cards, and in an empty cell too: a column with nothing in it is exactly a column a
         task may be created into. Not under a 畳んだ列 (the branch above), where the cell *is* its
         count (doc-7 §2.2) — the entry returns with the cards when the column is unfolded. -->
    {@render createEntry?.()}
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

  // カード 1 枚ぶんの四角の列 (doc-7 §2.2). Wraps and fills the band from its left edge, so the shape
  // of the block is itself the quantity; it is not a fixed-width gauge and never truncates, because a
  // capped row of squares would say the same thing for 20 cards as for 200.
  .tally {
    display: flex;
    flex-wrap: wrap;
    align-self: stretch;
    gap: 0.16rem;
  }

  // No border, no radius worth the name: at this size a 1px frame is most of the figure. The colour is
  // the 強い罫線 (doc-11 §2.1) — the most neutral ink on the theme, and pointedly not a 族の色
  // (decision-6: nothing here is a problem being reported).
  .pip {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 1px;
    background: var(--line-strong);
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
