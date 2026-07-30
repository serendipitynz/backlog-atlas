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
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--panel);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      border-color: var(--line-strong);
    }

    &.selected {
      outline: 2px solid var(--sel);
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

  // priority は族の色を借りない (decision-12): high の赤と medium の黄土は読取不能・縮退の族の色と
  // 同色で、赤い priority を読取不能と読み違える経路になっていた。3 段は `--fg`／`--bg` の濃淡と
  // 枠線だけで作る (doc-11 §3). An unrecognised value keeps this base style rather than being
  // guessed into one of the three — the file's own word is still shown.
  .priority {
    padding: 0 0.3rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;

    &[data-priority="high"] {
      border-color: var(--fg);
      background: var(--fg);
      color: var(--bg);
    }

    &[data-priority="medium"] {
      border-color: var(--line-strong);
      color: var(--fg);
    }
  }

  // 印チップ配色規則 (decision-12): 文字＝族の色、背景＝族の色 12% 混色、枠＝族の色 45% 混色。The
  // family colour arrives as `--family` and every family sets only that, so the chip names its
  // family and never picks a hue — 縮退 and 版ずれ cannot converge on one colour here (decision-6).
  // The old ベタ塗り＋白文字 left the chip's own text at about 2.8:1; this rule holds every recorded
  // theme's five families at 4.5:1 or better (`lib/theme.test.ts`).
  .mark {
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
    font-size: 0.65rem;

    // 印は `cursor: help` と説明を伴う (doc-11 §3): the short word on the chip is not the whole finding.
    // Keyed on the explanation being present, as in the detail heading — inside a pressable card the
    // help cursor is the one thing that says this chip has more to read than the card's own title.
    &[title] {
      cursor: help;
    }

    &[data-kind="degraded"] {
      --family: var(--mark-degraded);
    }

    &[data-kind="versionConflict"] {
      --family: var(--mark-version-conflict);
    }

    &[data-kind="undetectable"] {
      --family: var(--mark-undetectable);
    }

    &[data-kind="unreadable"] {
      --family: var(--mark-unreadable);
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

  // Type と通常ラベルの差は角丸だけでは弱い (doc-11 §3): Type is a filled, bold, 3px chip and 通常ラベル
  // an outlined pill in 細字・`--muted`. Three differences at once — 塗りの有無・太さ・字の濃さ — so the
  // two are told apart at a glance in one wrapped row, which a 3px-vs-999px radius alone did not do.
  .type {
    border-radius: 3px;
    background: color-mix(in srgb, var(--fg) 13%, transparent);
    font-weight: 600;

    // 未知 Type は実線輪郭、Type 未設定は破線輪郭で、どちらにも色を与えない (doc-11 §3・§6). 未設定 is
    // an absence, not a fault, so 族の色 would say the wrong thing about it (decision-6 の中立表示).
    &.unset {
      background: none;
      border: 1px dashed var(--line-strong);
      color: var(--muted);
      font-weight: 400;
    }

    &.unknown {
      background: none;
      border: 1px solid var(--line-strong);
    }
  }

  .label {
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
  }

  .assignee {
    color: var(--muted);
  }

  // 保存区分印 と 未対応区画の原文 status は族でも Type でもない中立の情報 (doc-11 §3): outline only,
  // `--muted`, no family colour. They say どこに置かれているか・元の語は何か, not that anything is wrong.
  .status,
  .storage {
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    color: var(--muted);
  }
</style>
