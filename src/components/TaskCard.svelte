<script lang="ts">
  // タスクカード (doc-7 §3): the display unit inside a lane cell. It carries only what a
  // cross-project list needs to identify a task and judge its priority — dependencies, AC
  // progress and the rest stay in the task detail screen (doc-8), so the grid keeps its density.
  import { cardFields, cardIdentity, priorityStep } from "../lib/card";
  import Icon from "../lib/icons/Icon.svelte";
  import { inconsistencyLabel, inconsistencyReasons, type VersionConflict } from "../lib/mark";
  import type { CardDensity, TaskView } from "../lib/wire";

  interface Props {
    view: TaskView;
    selected: boolean;
    /**
     * カード情報量 (doc-7 §3, decision-13): which of the 割当表's items this card draws. Passed in
     * rather than read from the settings here, so one grid never mixes 段 — and so this component
     * keeps having no boundary of its own.
     */
    density: CardDensity;
    /**
     * バージョン不整合 (doc-9) observed for this task, or `null`. Not read off the view: the file
     * reads fine, so a divergence is something the shell observed about a save — not a property of
     * the task (`lib/mark.ts`).
     */
    conflict: VersionConflict | null;
    /**
     * 保存区分印 (doc-7 §3): only drawn once the filter has added a division beyond active —
     * in the default active-only view every card is active, and a mark on all of them would
     * carry no information.
     */
    showStorageMark: boolean;
    /** In the 未分類区画 the card shows its original status string (doc-7 §2). */
    showRawStatus: boolean;
    onselect: (view: TaskView) => void;
  }

  let { view, selected, density, conflict, showStorageMark, showRawStatus, onselect }: Props =
    $props();

  const STORAGE_LABEL: Record<string, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  let identity = $derived(cardIdentity(view));
  // priority 3 段 (decision-23): which 段 this task is in, or `null` for both priority 未設定 (no value
  // in the frontmatter) and priority 未知 (a value that is not one of the three, e.g. `urgent`). The
  // 優先度の縁 and the priority チップ both read this one derivation, so they cannot disagree.
  let step = $derived(priorityStep(view.task.priority));
  let fields = $derived(cardFields(density));
  let types = $derived(view.interpretation.types);
  // 不整合 (decision-22) comes from one derivation shared with the detail heading and the detail's
  // 不整合区画, so the card, the heading and the panel cannot disagree about the same task. The card
  // shows the ⚠️ only — 由来名も族名も出さない — and the reasons travel in the accessible name.
  let reasons = $derived(inconsistencyReasons(view, conflict));
  // The mark distinguishes the added divisions from active, so active itself stays unmarked.
  let storageMark = $derived(
    showStorageMark && view.task.storageState !== "active"
      ? (STORAGE_LABEL[view.task.storageState ?? ""] ?? "保存区分不明")
      : null,
  );
  /**
   * Whether the second line has anything on it. At S the 段 drops Type, 通常ラベル and assignee at
   * once, and a row left standing with only its `gap` would take height off a card whose whole
   * point at that 段 is to take less. The 印 on it — 原文 status・保存区分印 — are not part of what
   * a 段 drops (doc-7 §3), so they alone are enough to keep the row.
   */
  let hasChips = $derived(
    showRawStatus ||
      storageMark !== null ||
      fields.types ||
      (fields.labels && view.task.labels.length > 0) ||
      (fields.assignee && view.task.assignee.length > 0),
  );
</script>

<!-- 優先度の縁 (decision-23) is `data-priority-edge` on the card itself, not a child: it is the card's
     own left border, which is where TASK-77 freed the space (decision-22). Absent for priority 未設定
     と priority 未知 — the attribute is not written at all, so the card keeps its ordinary 1px 枠. -->
<button
  type="button"
  class="card"
  class:selected
  data-priority-edge={step}
  onclick={() => onselect(view)}
>
  <span class="line">
    <span class="identity">{identity}</span>
    <!-- priority チップ: the word as the file wrote it, coloured by the 段 it normalises to. The
         attribute is `step`, not a second normalisation of the same string — the chip and the
         優先度の縁 must not be able to disagree about which 段 one task is in. -->
    {#if view.task.priority}
      <span class="priority" data-priority={step}>
        {view.task.priority}
      </span>
    {/if}
    <!-- 不整合印 (decision-22): ⚠️ ひとつだけで、「縮退」「版ずれ」「バージョン不整合」のどの語も
         カードには出さない。理由はタスク詳細の不整合区画が持ち、ここでは読み上げとホバーへ回る。
         `<span role="img">` rather than a bare figure: `Icon.svelte` is always `aria-hidden`
         (doc-11 §2.4), so without a named wrapper the mark would exist for the eye only. -->
    {#if reasons.length > 0}
      <span
        class="inconsistent"
        role="img"
        aria-label={inconsistencyLabel(reasons)}
        title={inconsistencyLabel(reasons)}
      >
        <Icon name="triangle-alert" />
      </span>
    {/if}
  </span>

  <!-- title は段ごとに 1・2・3 行で切り詰める (doc-7 §3). The count travels as a custom property so the
       clamp is one rule; the full text stays reachable through `title`, as the レーンヘッダ行 does with a
       project name it has to ellipsise — and the card opens the detail screen, so the tooltip is never
       the only way to read it. -->
  <span
    class="title"
    style="--title-lines: {fields.titleLines}"
    title={view.task.title ?? undefined}
  >
    {view.task.title ?? "（title 不明）"}
  </span>

  {#if hasChips}
    <span class="line marks">
      <!-- 未分類区画の原文 status と保存区分印 は状態の印であって、段では落とさない (doc-7 §3, AC #2):
           どちらも「このタスクがどこに置かれているか」で、S で消すと未分類の status も draft の別も
           読めないカードになる。 -->
      {#if showRawStatus}
        <span class="status">
          {view.interpretation.status ? `status: ${view.interpretation.status.raw}` : "status 不明"}
        </span>
      {/if}
      {#if storageMark}
        <span class="storage">{storageMark}</span>
      {/if}
      <!-- Type は M 以上 (doc-7 §3 の割当表). 未設定・未知の表示も Type の行の一部なので、S では
           「Type 未設定」も出さない — S が落とすのは Type という項目そのものである。
           Type と通常ラベルは混ぜない (doc-7 §3): different chip shapes, never one list. -->
      {#if fields.types}
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
      {/if}
      <!-- 通常ラベル と assignee は L 限定 (doc-7 §3): 件数が可変で、カードの高さを予測できなくする。
           S・M が title の行数を保証できるのは、この 2 つを外しているからである。 -->
      {#if fields.labels}
        {#each view.task.labels as label, index (index)}
          <span class="label">{label}</span>
        {/each}
      {/if}
      {#if fields.assignee}
        {#each view.task.assignee as assignee, index (index)}
          <span class="assignee">{assignee}</span>
        {/each}
      {/if}
    </span>
  {/if}
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

    // 優先度の縁 (decision-23): the 3px left edge TASK-77 freed, now saying priority instead of 族.
    // Same device as 問題の縁 (doc-11 §2.3) on purpose — decision-23 accepts that the two share the
    // form and separates them by what carries them (a card vs a レーンヘッダ行・上部帯), not by hue.
    //
    // The padding gives back exactly what the wider border takes, so a card with an edge and a card
    // without one line their text up in the same column. Without it every priority 未設定 card in a
    // cell would sit 2px off the ones around it — the family edge could ignore this because 不整合 was
    // rare, and priority is not.
    &[data-priority-edge] {
      border-left-width: 3px;
      padding-left: calc(0.5rem - 2px);
    }

    &[data-priority-edge="high"] {
      border-left-color: var(--priority-high);
    }

    &[data-priority-edge="medium"] {
      border-left-color: var(--priority-medium);
    }

    &[data-priority-edge="low"] {
      border-left-color: var(--priority-low);
    }
  }

  // 印グリフ (decision-22): 族の色は図形そのものが持ち、チップの背景も枠も無い。カード左 3px の
  // 族色は TASK-77 で外れ、decision-23 がその縁を priority へ渡した — 不整合をカードで述べるのは
  // この図形だけである。`cursor: help` は 印チップ と同じ理由 (doc-11 §3): 図形は理由の全部ではない。
  .inconsistent {
    display: inline-flex;
    align-items: center;
    color: var(--mark-inconsistent);
    // 1em はこの箱の font-size に従う (doc-11 §2.4). .8rem は隣の 横断タスクID (.72rem) と
    // カード title (.85rem) の間で、印チップ の .65rem ではない — 語を持たない図形は、同じ高さの
    // 文字より小さく見えるためである。アイコン専用の寸法つまみは足していない。
    font-size: var(--text-lg);
    // `.line` は baseline 揃えで、`Icon.svelte` の SVG は `display: block` なので baseline を
    // 持たない（行末で揃えられ、文字より下がって見える）。この 1 つだけ中央で揃える。
    align-self: center;
    cursor: help;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .identity {
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  // title の行数保証 (doc-7 §3): `--title-lines` 行で切り詰める。`-webkit-line-clamp` は WKWebView・
  // WebView2 の両方が解する唯一の形で、`max-height` を行数から計算する方式と違い、切り詰めた最後の行に
  // 省略記号が付く（1 行しか出さない S で、続きがあることを読めるようにするため）。
  // `overflow-wrap` が要るのは、折り返さない長い 1 語は clamp の対象になる行が 1 本しかできないためで、
  // 途中で切れずに横へ伸びてしまう。
  .title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--title-lines);
    // 前置き版だけを書かない: WebView2 の Chromium が標準の `line-clamp` を解する版へ上がったあとも
    // 同じ行数で切り詰まるようにする（両方書けば、どちらを解する版でも表示は 1 つに決まる）。
    line-clamp: var(--title-lines);
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: var(--text-xl);
    line-height: 1.3;
  }

  .marks {
    gap: 0.2rem;
  }

  // priority チップ (decision-23): 優先度色 を 印チップ配色規則 (decision-12) の形で描く — 文字＝
  // 優先度色、背景＝12% 混色、枠＝45% 混色。**族の色ではないので decision-6 の族の分離は破っていない**
  // (印がこの色を借りることはない)。無彩 3 段だった間は、同じ priority を縁が色で・チップが濃淡で
  // 述べていて、1 枚のカードが 1 つのことを 2 通りの表現で言っていた。
  //
  // 角丸は 3px (doc-11 §2.2 の チップ 3px). 999px だった間、priority は角丸の軸では 通常ラベル と
  // 同じ形をしていた — その 999px は画面設計案 04 の契約 #4「Type とラベルを混ぜない」が
  // 通常ラベル に与えた形であって、priority のものではない。
  //
  // priority 未知 は色を持たない基本の姿のまま (優先度の縁 と同じ判断): 3 段のどれかへ寄せると、
  // 画面が frontmatter の書いていないことを述べる。語だけは原文のまま出る。
  .priority {
    padding: 0 0.3rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    font-size: var(--text-sm);
    text-transform: uppercase;
    letter-spacing: 0.02em;

    // 段の色は `--step` として届き、各段はそれだけを設定する — チップは段を名指すだけで色相を
    // 選ばない。印チップ が族に対して取っているのと同じ形である。
    &[data-priority="high"],
    &[data-priority="medium"],
    &[data-priority="low"] {
      border-color: color-mix(in srgb, var(--step) 45%, transparent);
      background: color-mix(in srgb, var(--step) 12%, transparent);
      color: var(--step);
    }

    &[data-priority="high"] {
      --step: var(--priority-high);
    }

    &[data-priority="medium"] {
      --step: var(--priority-medium);
    }

    &[data-priority="low"] {
      --step: var(--priority-low);
    }
  }

  .type,
  .label,
  .assignee,
  .status,
  .storage {
    font-size: var(--text-sm);
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

  // 保存区分印 と 未分類区画の原文 status は族でも Type でもない中立の情報 (doc-11 §3): outline only,
  // `--muted`, no family colour. They say どこに置かれているか・元の語は何か, not that anything is wrong.
  .status,
  .storage {
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    color: var(--muted);
  }
</style>
