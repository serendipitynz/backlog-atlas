<script lang="ts">
  // タスクカード (doc-7 §3): the display unit inside a lane cell. It carries only what a
  // cross-project list needs to identify a task and judge its priority — dependencies, AC
  // progress and the rest stay in the task detail screen (doc-8), so the grid keeps its density.
  import { cardIdentity } from "../lib/card";
  import type { TaskView } from "../lib/wire";

  interface Props {
    view: TaskView;
    selected: boolean;
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

  let { view, selected, showStorageMark, showRawStatus, onselect }: Props = $props();

  const STORAGE_LABEL: Record<string, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  let identity = $derived(cardIdentity(view));
  let types = $derived(view.interpretation.types);
  let degradeEvents = $derived(
    view.task.health.state === "degraded" ? view.task.health.events : [],
  );
  // The mark distinguishes the added divisions from active, so active itself stays unmarked.
  let storageMark = $derived(
    showStorageMark && view.task.storageState !== "active"
      ? (STORAGE_LABEL[view.task.storageState ?? ""] ?? "保存区分不明")
      : null,
  );
  let degradeSummary = $derived(
    degradeEvents
      .map((event) => {
        switch (event.event) {
          case "unparseable":
            return `解析不能: ${event.missingRequired.join("・")} が読めない`;
          case "unexpectedSchema":
            return `想定外スキーマ: ${event.detail}`;
          case "danglingReference":
            return `参照欠損: ${event.kind} ${event.target}`;
        }
      })
      .join(" / "),
  );
</script>

<button
  type="button"
  class="card"
  class:selected
  class:degraded={degradeEvents.length > 0}
  onclick={() => onselect(view)}
>
  <span class="line">
    <span class="identity">{identity}</span>
    {#if view.task.priority}
      <span class="priority" data-priority={view.task.priority.trim().toLowerCase()}>
        {view.task.priority}
      </span>
    {/if}
    {#if degradeEvents.length > 0}
      <span class="degrade" title={degradeSummary} aria-label="縮退: {degradeSummary}">縮退</span>
    {/if}
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

    &.degraded {
      border-left: 3px solid #b8860b;
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

  .degrade {
    padding: 0 0.3rem;
    border-radius: 3px;
    font-size: 0.65rem;
    background: #b8860b;
    color: #fff;
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
