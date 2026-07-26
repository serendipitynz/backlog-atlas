<script lang="ts">
  // タスクカード (doc-7 §3): the display unit inside a lane cell. It carries only what a
  // cross-project list needs to identify a task and judge its priority — dependencies, AC
  // progress and the rest stay in the task detail screen (doc-8), so the grid keeps its density.
  import { cardIdentity } from "../lib/card";
  import { taskMarks, type VersionConflict } from "../lib/mark";
  import type { TaskView } from "../lib/wire";

  interface Props {
    view: TaskView;
    selected: boolean;
    /**
     * 版ずれ (doc-9) observed for this task, or `null`. Not read off the view: the file reads fine,
     * so a divergence is something the shell observed about a save — not a property of the task
     * (`lib/mark.ts`).
     */
    conflict: VersionConflict | null;
    /**
     * 保存区分印 (doc-7 §3): only drawn once the filter has added a division beyond active —
     * in the default active-only view every card is active, and a mark on all of them would
     * carry no information.
     */
    showStorageMark: boolean;
    /** In the 未対応区画 the card shows its original status string (doc-7 §2). */
    showRawStatus: boolean;
    onselect: (view: TaskView) => void;
  }

  let { view, selected, conflict, showStorageMark, showRawStatus, onselect }: Props = $props();

  const STORAGE_LABEL: Record<string, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  let identity = $derived(cardIdentity(view));
  let types = $derived(view.interpretation.types);
  // 縮退印 and 版ずれ印 come from one derivation shared with the detail heading, so the two screens
  // cannot disagree about which marks a task has (decision-6 三者を同じ印へ混ぜない).
  let marks = $derived(taskMarks(view, conflict));
  let degraded = $derived(marks.some((mark) => mark.kind === "degraded"));
  let conflicted = $derived(marks.some((mark) => mark.kind === "versionConflict"));
  // The mark distinguishes the added divisions from active, so active itself stays unmarked.
  let storageMark = $derived(
    showStorageMark && view.task.storageState !== "active"
      ? (STORAGE_LABEL[view.task.storageState ?? ""] ?? "保存区分不明")
      : null,
  );
</script>

<button
  type="button"
  class="card"
  class:selected
  class:degraded
  class:conflicted
  onclick={() => onselect(view)}
>
  <span class="line">
    <span class="identity">{identity}</span>
    {#if view.task.priority}
      <span class="priority" data-priority={view.task.priority.trim().toLowerCase()}>
        {view.task.priority}
      </span>
    {/if}
    <!-- 縮退（解析起因）と版ずれ（doc-9 の競合）は別の印 (decision-6, AC #4): different chips,
         different colours, and both can be on one card at once — a file can be degraded *and*
         have had a save stopped by a version divergence. -->
    {#each marks as mark (mark.kind)}
      <span class="mark" data-kind={mark.kind} title={mark.detail} aria-label="{mark.label}: {mark.detail}">
        {mark.label}
      </span>
    {/each}
  </span>

  <span class="title">{view.task.title ?? "（title 不明）"}</span>

  <span class="line marks">
    {#if showRawStatus}
      <span class="status">
        {view.interpretation.status ? `status: ${view.interpretation.status.raw}` : "status 不明"}
      </span>
    {/if}
    {#if storageMark}
      <span class="storage">{storageMark}</span>
    {/if}
    <!-- Type と通常ラベルは混ぜない (doc-7 §3): different chip shapes, never one list. -->
    {#if types.length === 0}
      <span class="type unset">Type 未設定</span>
    {:else}
      <!-- Indexed keys: a malformed frontmatter can repeat a label, and a duplicate key would
           be a render error rather than the display of what the file actually says. -->
      {#each types as value, index (index)}
        <span class="type" class:unknown={!value.known}>
          {value.value}{value.known ? "" : "（未知）"}
        </span>
      {/each}
    {/if}
    {#each view.task.labels as label, index (index)}
      <span class="label">{label}</span>
    {/each}
    {#each view.task.assignee as assignee, index (index)}
      <span class="assignee">{assignee}</span>
    {/each}
  </span>
</button>

<style lang="scss">
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 5px;
    background: color-mix(in srgb, canvas 92%, canvastext 8%);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      border-color: color-mix(in srgb, currentColor 45%, transparent);
    }

    &.selected {
      outline: 2px solid highlight;
      outline-offset: 1px;
    }

    // The edge says which one without reading the chips. Both at once puts the 版ずれ colour on
    // the edge and leaves 縮退 to its chip: the divergence is the one with an action attached.
    &.degraded {
      border-left: 3px solid var(--mark-degraded);
    }

    &.conflicted {
      border-left: 3px solid var(--mark-version-conflict);
    }
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .identity {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .title {
    font-size: 0.85rem;
    line-height: 1.3;
  }

  .marks {
    gap: 0.2rem;
  }

  .priority {
    padding: 0 0.3rem;
    border-radius: 999px;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    background: color-mix(in srgb, currentColor 12%, transparent);

    &[data-priority="high"] {
      background: #c0392b;
      color: #fff;
    }

    &[data-priority="medium"] {
      background: #b8860b;
      color: #fff;
    }

    &[data-priority="low"] {
      background: color-mix(in srgb, currentColor 18%, transparent);
    }
  }

  // 印の族ごとの色は app.scss の一箇所定義から取る (decision-6): the chip names its family and
  // never picks a hue, so 縮退 and 版ずれ cannot converge on one colour here.
  .mark {
    padding: 0 0.3rem;
    border-radius: 3px;
    font-size: 0.65rem;
    color: #fff;

    &[data-kind="degraded"] {
      background: var(--mark-degraded);
    }

    &[data-kind="versionConflict"] {
      background: var(--mark-version-conflict);
    }

    &[data-kind="undetectable"] {
      background: var(--mark-undetectable);
    }

    &[data-kind="unreadable"] {
      background: var(--mark-unreadable);
    }
  }

  .type,
  .label,
  .assignee,
  .status,
  .storage {
    font-size: 0.65rem;
    padding: 0 0.3rem;
  }

  // Type: filled chip. 通常ラベル: outlined chip. The shapes differ so the two are never read
  // as one list (doc-7 §3).
  .type {
    border-radius: 3px;
    background: color-mix(in srgb, currentColor 16%, transparent);

    &.unset {
      background: none;
      border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
      opacity: 0.7;
    }

    &.unknown {
      background: none;
      border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    }
  }

  .label {
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 999px;
  }

  .assignee {
    opacity: 0.8;
  }

  .status,
  .storage {
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 3px;
    opacity: 0.85;
  }
</style>
