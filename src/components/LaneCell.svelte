<script lang="ts">
  // Draws either of the two runs of cards a プロジェクト行 holds: a レーンセル (doc-7 §1 — the row ×
  // one 正準ステータス列) or the row's 未分類区画, **which is not a レーンセル**. One component for
  // both because what a run of cards looks like is the same; the two are named apart wherever a
  // name reaches the screen (`laneGroupLabel`, doc-8 §2.2).
  // An empty cell is drawn empty and says so — "該当タスクが無い" is a different fact from
  // "ルートが読めない", which is a row-level state (doc-7 §6).
  import TaskCard from "./TaskCard.svelte";
  import { collapsedCellLabel, priorityTally } from "../lib/card";
  import { messages } from "../lib/messages-context";
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
    /** バージョン不整合 (doc-9) per task, from the shell's record — a lookup, not a copy of the map. */
    conflictOf: (view: TaskView) => VersionConflict | null;
    onselect: (view: TaskView) => void;
    /**
     * レーンセルの末尾 (doc-7 §4.1): where 列内新規タスク入力 goes. Handed in as a snippet rather than
     * built here, because what belongs at the end depends on the *project* (its 作成時 status 候補) and
     * on the shell (which cell holds the input) — neither of which a cell knows. The cell owns only
     * the position, which is what doc-7 §4.1 fixes.
     */
    createEntry?: Snippet;
    /**
     * 受け先 (doc-7 §4.2): whether this cell takes the card currently being dragged. Decided by the
     * grid, not here — it depends on the dragged card's row and column and on the project's 列の作成時
     * status 候補, none of which a cell knows. `false` covers all four refusals doc-7 §4.2 lists,
     * which share one presentation: the cell does not take the card. **Not a 無効化** (doc-11 §5) —
     * there is no control here to disable, and the one sentence that is owed (候補 0 件) is already
     * written by the 入口 below the cards.
     */
    dropTarget?: boolean;
    ondropcard?: () => void;
    /** 発行中のカード (doc-7 §4.2), by task file — the shell's record, looked up rather than copied. */
    issuingPath?: string | null;
    dragHeld: string | null;
    ondragstart: (view: TaskView) => void;
    ondragend: () => void;
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
    dropTarget = false,
    ondropcard,
    issuingPath = null,
    dragHeld,
    ondragstart,
    ondragend,
  }: Props = $props();

  /**
   * Take the drag over this cell (doc-7 §4.2). `preventDefault` is what makes a cell a drop target at
   * all in HTML5 drag and drop, so the 受け先 decision and the browser's own notion of one are the
   * same fact rather than two that could disagree — a cell that is not a 受け先 never calls it, and
   * the pointer keeps the "no drop" cursor the engine draws for it.
   */
  function overCell(event: DragEvent): void {
    if (!dropTarget) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function dropOnCell(event: DragEvent): void {
    if (!dropTarget) {
      return;
    }
    event.preventDefault();
    ondropcard?.();
  }

  // One derivation for both the figures and the count's accessible name (decision-23): the shape a
  // sighted user reads and the words a screen reader hears describe the same distribution because
  // they come from the same call.
  const t = messages();

  let groups = $derived(priorityTally(tasks));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="cell"
  class:unmapped
  class:collapsed
  class:drop-target={dropTarget}
  ondragover={overCell}
  ondrop={dropOnCell}
>
  {#if collapsed}
    <!-- 畳んだ列は、カード 1 枚を小さな四角 1 つに置き換えて並べ、その下に件数を出す (doc-7 §2.2).
         The squares are how much work is in the cell at a glance — the reading a 5rem band cannot give
         with cards — and the number below them is the exact figure.
         **They take 優先度色 (decision-23)**, so a folded column still says *what kind* of work is in
         it and not only how much. This is not one of the 4 系統 of chip (doc-11 §3): those say a task
         has a problem, and 優先度色 is not a 族の色 — which is exactly the reason doc-11 §3 gave for
         keeping these colourless, and the reason no longer applies.
         **色だけでは述べない**: the squares are grouped 段 by 段, most urgent first, and each 段 has its
         own height, so the distribution is a shape before it is a hue. A task in none of the 3 段 keeps
         the neutral square, as its card keeps a colourless 縁.
         `aria-hidden` still, because a run of N nameless figures is noise — the breakdown they carry
         goes into the count's accessible name below instead. -->
    {#if tasks.length > 0}
      <div class="tally" aria-hidden="true">
        {#each groups as group (group.step ?? "none")}
          {#each { length: group.count } as _, index (index)}
            <span class="pip" data-priority={group.step}></span>
          {/each}
        {/each}
      </div>
    {/if}
    <!-- 件数 (doc-7 §2.2): the exact number, and the column name travels with it in the label so the
         band is readable without the column head beside it. Zero is written as `0`, not as the 空セル's
         `—`: in a folded column the cell *is* the count, and a band mixing dashes with numbers cannot
         be read down the grid, which is the reading the count was kept for. `—` stays the form of an
         空セル in an open column (doc-11 §6), where the absence is what has to be shown rather than a
         number. -->
    <span class="count" aria-label={collapsedCellLabel(label, tasks)}>{tasks.length}</span>
  {:else}
    {#if tasks.length === 0}
      <!-- 空セル (doc-7 §6): 該当タスク無し is normal, so it is neutral — opacity only, no colour
           and no symbol (decision-6 エラー提示方針). ルート読取不能 never reaches here; it replaces
           the row's cells entirely, which is what keeps the two apart (AC #2). -->
      <span class="empty" aria-label={t().swimlane.emptyCell}>—</span>
    {:else}
      {#each tasks as view (view.task.sourcePath)}
        <TaskCard
          {view}
          {density}
          {showStorageMark}
          showRawStatus={unmapped}
          selected={selectedPath === view.task.sourcePath}
          conflict={conflictOf(view)}
          {dragHeld}
          issuing={issuingPath === view.task.sourcePath}
          {ondragstart}
          {ondragend}
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

  // 受け先 (doc-7 §4.2), while a card is over the grid. Only the cells that will take the card are
  // marked, so the four refusals need no mark of their own — an unmarked cell is one that will not
  // take it, which is what doc-7 §4.2 asks the screen to show without a sentence per refusal.
  // `--sel` is the selection ink, the same one the grid already uses for "this is the one".
  .drop-target {
    background: var(--inset);
    box-shadow: inset 0 0 0 2px var(--sel);
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
  //
  // `align-items: flex-end` puts the 段 の高さ差 on one baseline, so the run reads as a row of bars
  // rather than as figures floating at different heights.
  .tally {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    align-self: stretch;
    gap: 0.16rem;
  }

  // No border, no radius worth the name: at this size a 1px frame is most of the figure. The default
  // is the 強い罫線 (doc-11 §2.1) — the most neutral ink on the theme — and it stays that for a task in
  // none of the 3 段. 族の色 is still off limits here (decision-6: nothing in this band is a problem
  // being reported); 優先度色 is not one (decision-23).
  //
  // 非文字要素なので満たすのは 3:1 のほう (優先度色の収録条件). At this size these are the smallest
  // thing the palette has to carry, which is why the condition is checked against every surface rather
  // than against the one this band happens to sit on.
  //
  // **高さが段ごとに違う**ので、色を見分けられなくても分布が読める (WCAG 1.4.1). The width is the same
  // for the three 段 so that the run still counts as one square per card; only the 段 なし square is
  // narrower as well, because it is the one that would otherwise differ from `low` by hue alone.
  .pip {
    width: 0.35rem;
    height: 0.17rem;
    border-radius: 1px;
    background: var(--line-strong);

    &:not([data-priority]) {
      width: 0.17rem;
    }

    &[data-priority="high"] {
      height: 0.35rem;
      background: var(--priority-high);
    }

    &[data-priority="medium"] {
      height: 0.26rem;
      background: var(--priority-medium);
    }

    &[data-priority="low"] {
      background: var(--priority-low);
    }
  }

  .count {
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  // `--faint` (doc-11 §2.1・§6), not an opacity: the theme carries its own 弱 colour, and an opacity
  // over `--fg` lands somewhere else on every 表示テーマ — the two would not stay the same 弱 as the
  // Git 履歴欄's 該当なし, which is the other 正常な不在 on screen.
  .empty {
    padding: 0.2rem 0.1rem;
    color: var(--faint);
    font-size: var(--text-md);
  }
</style>
