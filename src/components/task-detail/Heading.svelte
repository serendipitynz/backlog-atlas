<script lang="ts">
  // 見出し (doc-8 §3): 常設 in all three placements, and the only 区画 fixed against the panel's top
  // edge — the ID コピー, the 前後移動 and 閉じる have to be reachable without scrolling (doc-8 §2.2).
  //
  // 主要属性の属性表 is the third row and deliberately stands *outside* that band: 固定行の高さの上限
  // (doc-11 §13) shuts it out, since six values reflow as the surface narrows.
  //
  // Every sentence the heading's own controls speak is drawn below it (`HeadingNotes.svelte`), for the
  // same reason: a band cannot grow without taking that height from the body permanently.
  import Icon from "../../lib/icons/Icon.svelte";
  import { priorityStep } from "../../lib/card";
  import {
    crossIdUnavailable,
    type MilestoneRef,
  } from "../../lib/detail";
  import {
    PRIORITIES,
    milestoneOptions,
    optionsFor,
    type EditAvailability,
    type EditSession,
  } from "../../lib/edit";
  import { inconsistencyLabel } from "../../lib/mark";
  import { messages } from "../../lib/messages-context";
  import {
    PLACEMENTS,
    PLACEMENT_ICON,
    STEP_ICON,
    placementSwitchName,
  } from "../../lib/placement";
  import { detailPlacementLabel } from "../../lib/settings";
  import {
    CANONICAL_COLUMN_LABEL,
    laneGroupLabel,
    laneNeighbourLabel,
    noLaneCellReason,
    type LaneNeighbours,
  } from "../../lib/swimlane";
  import type {
    DetailPlacement,
    ProjectSnapshot,
    StatusMapping,
    StorageState,
    Task,
    TaskView,
  } from "../../lib/wire";

  /** 横断タスクID のコピー の状態 (doc-8 §2.2)。開いているタスクのものだけが渡る。 */
  export type CopyNotice =
    | { state: "copied" }
    | { state: "fading" }
    | { state: "failed"; text: string };

  interface Props {
    task: Task;
    /** milestone と dependency の id はこの中で解決される。 */
    snapshot: ProjectSnapshot;
    /** 横断タスクID を併記 (doc-8 §2, doc-3 §5.3)。解析不能なファイルはファイル名で名指しされる。 */
    identity: string;
    /** コピーの対象。組めないときは `null` (doc-4 §5)。 */
    crossId: string | null;
    copyNotice: CopyNotice | null;
    /** Whether the control is showing its 成功 figure — `clipboard-check` — rather than `clipboard`. */
    copied: boolean;
    /** フェードの時間。CSS の transition とスクリプトのタイマーを 1 つの数にする (doc-8 §2.2)。 */
    fadeMs: number;
    oncopy: () => void;
    status: StatusMapping | null;
    milestone: MilestoneRef | null;
    /** 不整合の理由行 (decision-22)。1 件以上あれば ⚠️ が立つ。 */
    reasons: readonly string[];
    /** The file left the read result while the panel was open (doc-8 §6.4). */
    missing: boolean;
    neighbours: LaneNeighbours | null;
    onmove: (target: TaskView | null) => void;
    placement: DetailPlacement;
    defaultPlacement: DetailPlacement;
    onplacement: (placement: DetailPlacement) => void;
    onclose: () => void;
    /** The 編集セッション, or `null` outside one. */
    session: EditSession | null;
    edit: <K extends keyof EditSession["draft"]>(key: K, value: EditSession["draft"][K]) => void;
    /** 編集入口 (doc-8 §3) の可否と理由 (doc-8 §6.5, doc-5 §5)。 */
    availability: EditAvailability;
    onedit: () => void;
  }

  let {
    task,
    snapshot,
    identity,
    crossId,
    copyNotice,
    copied,
    fadeMs,
    oncopy,
    status,
    milestone,
    reasons,
    missing,
    neighbours,
    onmove,
    placement,
    defaultPlacement,
    onplacement,
    onclose,
    session,
    edit,
    availability,
    onedit,
  }: Props = $props();

  const t = messages();

  const STORAGE_LABEL: Record<StorageState, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };
</script>

<header class="heading">
  <div class="line id-line">
    <!-- 横断タスクID を併記 (doc-8 §2, doc-3 §5.3): the panel is single-project, but the heading
         still says which project's task this is. A 解析不能 file has no id, so it is named by
         its file — the only stable handle it has (doc-4 §5). -->
    <!-- 行に収まらない幅では末尾を落とす (doc-8 §2.2 の「1 行に収める」)。落ちるのは描かれる字だけで、
         全体は `title` が持ち、隣の控えは描かれた字ではなく値そのものをコピーする。 -->
    <span class="identity" title={identity}>{identity}</span>
    <!-- ID コピーは ID の右横 (doc-8 §2.2, TASK-72). アイコンのみのボタン (doc-11 §2.4): the figure
         carries no words, so `aria-label` holds the whole name — and it holds the *operation* name
         only. 成功 is said by the sentence below, which is a live region, rather than by a name that
         would change under a user who is looking for this button by it (doc-11 §2.4 の「持続する
         状態の印」はここに及ばない). 無効化提示 (doc-11 §5) keeps its reason beside the control as
         well as in `title`: the hint under this line carries it. -->
    <button
      type="button"
      class="copy"
      class:copied={copyNotice?.state === "copied"}
      class:fading={copyNotice?.state === "fading"}
      style="--copy-fade: {fadeMs}ms"
      disabled={crossId === null}
      aria-label={t().taskDetail.copyCrossId}
      title={crossId === null ? crossIdUnavailable() : t().taskDetail.copyCrossId}
      onclick={oncopy}
    >
      <Icon name={copied ? "clipboard-check" : "clipboard"} />
    </button>
    {#if crossId === null}
      <!-- 解析不能 (doc-4 §5): a required field the read layer could not get. Still a 印チップ and
           not part of the ⚠️ — it names the field that is missing *here*, where the ID would have
           been, which is a different act from listing the task's reasons (decision-22). -->
      <span class="mark" data-kind="inconsistent">{t().taskDetail.taskIdUnknown}</span>
    {/if}
    <!-- 不整合印 (decision-22): カードと同じ ⚠️ 1 つで、族名も由来名も出さない。理由は下の
         不整合区画が持つ。同じ 1 つの derivation から出るので、カード・見出し・区画が同じタスク
         について食い違うことがない。 -->
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
    {#if missing}
      <span class="mark" data-kind="unreadable">{t().taskDetail.fileUnknown}</span>
    {/if}

    <!-- 前後移動 (doc-8 §2.2) は 1 行目の右端、配置切替の手前 (画面設計案 02。doc-12 §3)。
         ↑↓ のアイコンのみのボタン (doc-11 §2.4) で、名前は `aria-label` が全部持つ — 操作の名前
         だけで、群の名前は入れない (doc-11 §2.4 が `aria-label` に操作の名前だけを求めている)。
         **群の名前を刷るのはこの 2 つの `title` だけで、どちらも `laneGroupLabel` から取る**
         (doc-8 §2.2)。`aria-label` が `title` に優先するので、群の名前はこの控えの説明であって
         名前ではない。
         2 つが別の語を刷れば、同じ群を同じ行の中で 2 つの語で呼ぶことになる。未分類区画はレーン
         セルではない (doc-7 §1)。**隣の位置表示は群の名前を持たない** — 1 行に収める必要があり、
         名前がその行の 97px を占めていた (TASK-72 の実測)。端での無効化の理由は隣の位置表示と
         下の控えが担う — 読めない位置に理由を隠さない、が doc-11 §5 の要求である。 -->
    <div class="nav">
      {#each [{ dir: "previous" }, { dir: "next" }] as const as step (step.dir)}
        {@const stepName =
          step.dir === "previous" ? t().taskDetail.previousTask : t().taskDetail.nextTask}
        {@const edge = step.dir === "previous" ? t().taskDetail.headEdge : t().taskDetail.tailEdge}
        {@const target = neighbours === null ? null : neighbours[step.dir]}
        <button
          type="button"
          class="step"
          disabled={target === null}
          aria-label={stepName}
          title={neighbours === null
            ? noLaneCellReason()
            : target === null
              ? t().taskDetail.atEdge(laneGroupLabel(neighbours.group), edge)
              : t().taskDetail.withinGroup(laneGroupLabel(neighbours.group), stepName)}
          onclick={() => onmove(target)}
        >
          <!-- 移動の図形 (doc-11 §2.4) は `placement.ts` の `STEP_ICON` が持つ — the family rule is
               cross-screen (this pair is 行の並べ替え's too), so the choice has to be somewhere a
               test can read it rather than here. -->
          <Icon name={STEP_ICON[step.dir]} />
        </button>
      {/each}
      <span class="position">
        {neighbours === null ? t().taskDetail.positionUnknown : laneNeighbourLabel(neighbours)}
      </span>
    </div>

    <!-- 配置の切替は「閉じる ×」と同じ操作群に置く (doc-8 §2.2): both answer "この面をどうするか",
         and neither belongs among the operations on the task's contents. -->
    <div class="frame">
      <div class="placement" role="group" aria-label={t().taskDetail.placementGroup}>
        {#each PLACEMENTS as candidate (candidate)}
          {@const isDefault = candidate === defaultPlacement}
          <!-- アイコンのみのボタン (doc-11 §2.4): the figure is decorative, so `aria-label` carries
               the whole name — 配置名, and 既定 for the one the 下線 marks. Both come from
               `placementSwitchName`, since a label and a title that disagreed would be two answers
               to the same question. -->
          <button
            type="button"
            class="switch"
            class:on={candidate === placement}
            class:is-default={isDefault}
            aria-pressed={candidate === placement}
            aria-label={placementSwitchName(detailPlacementLabel(candidate), isDefault)}
            title={placementSwitchName(detailPlacementLabel(candidate), isDefault)}
            onclick={() => onplacement(candidate)}
          >
            <Icon name={PLACEMENT_ICON[candidate]} />
          </button>
        {/each}
      </div>
      <button type="button" class="close" onclick={onclose}>{t().action.close}</button>
    </div>
  </div>


  <!-- 2 行目: title と編集入口 (画面設計案 02。doc-12 §3, doc-8 §3). 編集入口は押しボタンだけで、
       保存キーの注記・未保存の予告・バージョン不整合の告知は編集卓に残る — それらは長さが変わる文であり、
       見出しは固定されているので、伸びた分だけ本文の高さを奪うことになる。 -->
  <div class="line title-line">
    {#if session === null}
      <!-- 2 行を超える title は末尾を落とす (doc-11 §13)。全体は `title` が持つ — 落ちるのは
           描かれる字だけで、値は編集セッションの欄がそのまま持っている。 -->
      <h2 title={task.title ?? t().state.titleUnknown}>{task.title ?? t().state.titleUnknown}</h2>
    {:else}
      <label class="field">
        <span>title</span>
        <input
          type="text"
          value={session.draft.title}
          oninput={(event) => edit("title", event.currentTarget.value)}
        />
      </label>
    {/if}
    <!-- 編集入口 (doc-8 §3): drawn at the right end of the heading's title row so that the way into an
         edit is reachable without scrolling — the same requirement that fixes the heading at all.
         **保存 と キャンセル are not here** (2026-08-10, doc-11 §11): those are the 発行 and its
         取りやめ, and the rule puts them in a row pinned to the bottom of the panel. What stays is the
         entry, which issues nothing. The slot is empty during a session, and the 編集卓 keeps every
         sentence that outlives the press. -->
    <div class="entry">
      {#if session === null}
        <button
          type="button"
          class="primary"
          disabled={availability.state !== "editable"}
          title={availability.state === "editable" ? t().action.edit : availability.reason}
          onclick={onedit}
        >
          {t().action.edit}
        </button>
      {/if}
    </div>
  </div>
</header>

<!-- 主要属性の属性表 (doc-8 §3): 見出しの 3 行目でありながら、上の 2 行と違って固定帯の外に立つ。
     固定行の高さの上限 (doc-11 §13) がこの行を締め出す — 6 つの値は面が狭くなるほど折り返し、
     実測では 560px 幅の窓で 94.58px、320px で 162.58px を取っていた (WebKit・閲覧)。固定帯が
     それを背負うと、帯の残りが控え 1 つぶんを切って面の内容が届かなくなる。**この行を固定する
     理由は doc-8 §3 に書かれていない** — 同節が固定の理由に挙げるのは ID コピー・前後移動・
     閉じる の 3 つで、いずれも 1 行目の控えである。 -->
<dl class="facts">
  <dt>status</dt>
  <dd>
    {#if session !== null}
      <select
        aria-label="status"
        value={session.draft.status}
        onchange={(event) => edit("status", event.currentTarget.value)}
      >
        {#each optionsFor(task.status, snapshot.config.statuses) as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {:else if status === null}
      <span class="mark" data-kind="inconsistent">{t().taskDetail.statusUnreadable}</span>
    {:else}
      <span class="raw">{status.raw}</span>
      <!-- 正準対応を併記 (AC #1): 未分類 status is stated as such rather than shown blank. -->
      {#if status.column === null}
        <span class="mark unmapped">{t().taskDetail.canonicalUnmapped}</span>
      {:else}
        <span class="column">
          {t().taskDetail.canonicalColumn(CANONICAL_COLUMN_LABEL[status.column])}
        </span>
      {/if}
      {#if status.declaration === "undeclared"}
        <span class="mark unmapped">{t().taskDetail.configUndeclared}</span>
      {:else if status.declaration === "noDeclaredSet"}
        <span class="mark neutral">{t().taskDetail.configNoStatuses}</span>
      {:else if status.declaration === "draft"}
        <span class="mark neutral">{t().taskDetail.draftKnownStatus}</span>
      {/if}
    {/if}
  </dd>

  <dt>priority</dt>
  <!-- priority の値は 優先度色 で書く (decision-23): カードが色で述べていることを、詳細でも同じ
       色で述べる。札にはしない — 主要属性の値は素の文字で並んでおり、ここだけ札にすると
       doc-11 §3 のチップの 4 系統に 5 つ目が現れる。3 段のどれでもない値と `—` は色を持たない
       (`data-priority` が付かない)。編集中は `<select>` がプラットフォームの描画なので、色は
       閲覧時の値にだけ効く。 -->
  <dd data-priority={session === null ? priorityStep(task.priority) : null}>
    {#if session !== null}
      <select
        aria-label="priority"
        value={session.draft.priority}
        onchange={(event) => edit("priority", event.currentTarget.value)}
      >
        {#each optionsFor(task.priority, PRIORITIES) as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {:else}
      {task.priority ?? "—"}
    {/if}
  </dd>

  <dt>{t().taskDetail.storageTerm}</dt>
  <dd>
    {task.storageState === null ? t().state.storageUnknown : STORAGE_LABEL[task.storageState]}
  </dd>

  <dt>milestone</dt>
  <dd>
    {#if session !== null}
      <select
        aria-label="milestone"
        value={session.draft.milestone}
        onchange={(event) => edit("milestone", event.currentTarget.value)}
      >
        {#each milestoneOptions(snapshot, task.milestone) as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {:else if milestone === null}
      —
    {:else}
      {milestone.id}
      {#if milestone.title === null}
        <span class="mark unmapped">{t().taskDetail.unresolved}</span>
      {:else}
        <span class="resolved">{milestone.title}</span>
      {/if}
    {/if}
  </dd>

  <!-- created と updated は別のセル (画面設計案 02 の 3 段目。doc-12 §3). 1 セルに 2 つ収めると
       `tabular-nums` が桁を揃える相手を持たない — 揃えたい 2 つが同じ列に立って初めて効く。 -->
  <dt>created</dt>
  <dd class="date">{task.createdDate ?? "—"}</dd>

  <dt>updated</dt>
  <dd class="date">{task.updatedDate ?? "—"}</dd>
</dl>

<style lang="scss">
  @use "./shared" as shared;

  /*
   * 見出しは 3 配置とも固定 (doc-8 §3, AC #2). `.detail` is the scroll container (`overflow-y: auto`)
   * and this is its direct child, so `sticky` pins against that box in all three placements without
   * any per-placement rule.
   *
   * The band has to reach all four of the panel's edges, or the content scrolls through whatever it does
   * not cover. Sideways that is negative margins with matching padding, against the panel's horizontal
   * padding. Upwards it is the panel having *no* top padding and this element carrying it instead: a
   * negative top margin does not work, because a sticky box is pinned by its static position and the
   * pull-up is given straight back when it sticks. That was measured — the band settled 9.6px below the
   * panel's edge in both engines, and a screenshot showed the 縮退帯 riding through the gap.
   * `--panel` is the same requirement in the third dimension: a transparent sticky band is a band the
   * text scrolls *through*.
   *
   * What is fixed is deliberately only the three rows doc-12 §3 transcribed. Every sentence that comes
   * and goes is drawn outside it — the ones the heading's own controls speak (`HeadingNotes.svelte`)
   * and the ones the session speaks (the 編集卓) — because the band cannot grow without taking that
   * height from the body permanently, and the failed-copy notice would grow it and then stay.
   */
  .heading {
    /*
     * The height and the text size of every control in the heading's first row, as one value each —
     * the same reason `Swimlane.svelte` has `--head-control`. The ↑↓, the 3 配置切替 and 閉じる draw a
     * figure or a word in boxes that do not otherwise share anything, and a figure is `1em` of its own
     * box (doc-11 §2.4) rather than a line box handed down by the row: without one font-size taken by
     * all of them they would only line up by coincidence, and the coincidence differs by engine.
     * Declared here rather than on `.frame` because the ↑↓ group sits outside it and has to take the
     * same two numbers (TASK-72 moved 前後移動 into this row).
     */
    --frame-control: 1.4rem;
    --frame-text: var(--text-sm);

    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0 calc(var(--panel-padding) * -1);
    padding: 0.6rem var(--panel-padding) 0.4rem;
    border-bottom: 1px solid var(--line);
    background: var(--panel);

    h2 {
      margin: 0;
      font-size: var(--text-3xl);
      line-height: 1.35;
    }
  }

  // The band needs no per-placement rule sideways. There used to be one for the 中央モーダル, on the
  // grounds that its horizontal padding differed — it does not: `.detail` takes `--panel-padding` in
  // all three placements, so that rule wrote the same value back (TASK-115 measured 12px a side in
  // each). The pull-out above draws on that one value and reaches the edges of every placement.

  // 2 行目: title が伸びしろを取り、編集入口は右端で自分の幅のまま。
  .title-line {
    align-items: center;
    gap: 0.5rem;
    // The items stay on one line (`.line` above), and the title takes at most two — the clamp below
    // is what makes that true. The earlier note here read "one line in both states (目視 2026-08-04)",
    // which the 2026-08-11 measurement contradicts: the 目視 was done in a wide window, and in a
    // narrow one this row grows with the title it is drawing.

    /*
     * 2 行で止める (doc-11 §13). A title has no length limit — it is whatever the task's frontmatter
     * says — and this row is inside the 固定帯, so an unbounded one takes the 覆われない帯 with it:
     * measured at 480 characters the band went to -126.0px in a 640×480 窓 and every control in the
     * panel became unreachable (2026-08-11, both engines). §13 asks for exactly this — what stands in
     * a fixed row must not grow with what it is drawing — so the row keeps two lines and the whole
     * string stays in `title`, the same trade the id line makes one row up.
     *
     * `-webkit-line-clamp` rather than a `max-height` in `em`: the clamp counts line boxes, so it
     * lands on a line boundary in both engines instead of slicing one in half at whatever
     * `line-height` resolves to.
     */
    h2 {
      display: -webkit-box;
      flex: 1;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      min-width: 0;
      overflow: hidden;
    }

    // Editing: the label sits *beside* its input rather than above it, so the field is one line like
    // the `h2` it replaces. `min-width: 0` on both is what lets the input give way instead of pushing
    // 保存・キャンセル onto a line of their own — a flex item's default `min-width: auto` refuses to
    // shrink below its content.
    .field {
      flex: 1;
      min-width: 0;
      flex-direction: row;
      align-items: center;
      gap: 0.3rem;

      span {
        flex: none;
      }

      input {
        flex: 1;
        min-width: 0;
      }
    }
  }

  .entry {
    display: flex;
    flex: none;
    gap: 0.3rem;
    margin-left: auto;
  }

  /*
   * **この規則が `.title-line` より後ろに在ることは効いている。** 限定度が同じ (どちらも 0,1,0) なので
   * 並びが勝ち負けを決め、`align-items: baseline` と `gap: 0.35rem` が `.title-line` の
   * `align-items: center` と `gap: 0.5rem` を上書きしている — 分割前と同じ並びである。入れ替えると
   * title の行が 26.5px から 24.5px へ縮み、その 2px が見出しからパネルの高さまで伝わる (TASK-106 で
   * 分割前後を実測したとき出た唯一の差がこれだった)。並べ直すなら、どちらを効かせるかを先に決める。
   */
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }

  /*
   * 1 行に収める (doc-8 §2.2) は、収まる幅では守り、収まらない幅では折り返す。**収まらない幅がある** —
   * この行の控えの群は 253.73px (WebKit) / 257.14px (Chromium) を占め、縮まない。一方 併置サイドバーは
   * `min(30rem, 45vw)` なので、窓 590px あたりでパネルの内容幅がその数を切る (2026-08-11 実測)。
   *
   * `nowrap` で押し通すと、そこから下は**横あふれ**になる (560px 窓で 12 / 16px) か、ID の描画幅が 0 に
   * なる (600 / 620px 窓で実測) かのどちらかである。後者は doc-8 §2.2 が ID に与えた役目 —— 他所から
   * このタスクを指し示す唯一の手段 —— を画面から消す。
   *
   * だから ID に**下限**を与え、折り返しを許す。**この行が折り返しても 覆われない帯 (doc-11 §13) は
   * 割れない** — 帯を割っていたのは 3 行目の属性表で、それは固定帯の外へ出た。1 行に収めることは、
   * それ自体が目的だったのではなく、帯を守るための手段だった。
   *
   * `flex: 1 1 0` は「折り返すかどうかは下限で決め、収まったら余りを全部取る」を 1 つの宣言で書く形で
   * ある: 折り返しの判定が読むのは基準寸法を下限で留めた値なので、行は ID が下限を割るときにだけ
   * 折り返し、そうでなければ ID が余白を吸って全体が出る。
   */
  .id-line {
    // 控えと印は自分の寸法のまま。縮ませると図形と語が潰れ、doc-11 §2.2 の控えの群の 1 値も崩れる。
    > :not(.identity) {
      flex: none;
    }
  }

  // 前後移動 (doc-8 §2.2): 1 行目の右端、配置切替の手前。`margin-left: auto` はこちらが持ち、
  // `.frame` はその隣に続く — 2 つとも auto を持つと間が開いて 1 つの群に見えなくなる。
  .nav {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
    // The same two values the 操作群 beside it takes (`.frame`), so the ↑↓ and the 3 配置切替 line up
    // by one number rather than by coincidence.
    font-size: var(--frame-text);
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-control);
    height: var(--frame-control);
    padding: 0;
  }

  .position {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    opacity: 0.7;
  }

  .identity {
    // 下限 4rem は「`atlas:TASK-1` の頭が読める幅」で、`.copy` が同じ行に居られる最小でもある
    // (実測 64px ＝ 約 6 字 ＋ 省略記号)。0 を許すと、行は収まったまま ID が消える。
    flex: 1 1 0;
    min-width: 4rem;
    overflow: hidden;
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.75;
  }

  // 横断タスクID のコピー (doc-8 §2.2): アイコンのみのボタン sitting against the id it copies.
  .copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    // Square, and sized from the id beside it rather than from `--frame-control`: this control belongs
    // to the ID, not to the 操作群 at the other end of the line (doc-8 §2.2 puts those two apart).
    width: 1.35rem;
    height: 1.35rem;
    padding: 0;
    font-size: var(--text-md);
    // No transition at rest. `color` is the property the 成功色 and its fade both move (the figure is
    // `currentColor`, doc-11 §2.4), and a standing `transition: color` on this button animates *every*
    // change of it — 表示テーマ の切り替え included, which measured as this one control easing to its
    // new colour while the rest of the panel had already changed. The transition belongs to the fade,
    // so `.fading` is what carries it.

    /*
     * 成功色 (AC #5, TASK-72): `--info` の代替 — decision-12 と doc-11 §2.1 が `--info` を通知・確認の
     * 色と定めており、コピー成功は確認そのものである。新しい変数を起こしていないのは、成功が図形
     * (`clipboard-check`) で述べられていて色がその繰り返しだからで、色相を 1 つ増やしても新しい判別は
     * 生まれない。実測では 10 テーマとも `--info` 対 `--panel` が 5.67:1 以上あり、非文字要素の下限
     * 3:1 を満たす。
     *
     * `transition: none` on the way in: 成功は押した瞬間の返事なので、色が育つのを待たせない。
     * フェードは `.fading` に入った瞬間から始まり、図形は色が引き終わるまで `clipboard-check` の
     * ままで、そのあと `clipboard` へ戻る。時間はスクリプトの `COPY_FADE_MS` から `--copy-fade` で
     * 入ってくるので、フェードとそれを終わらせるタイマーは 1 つの数である。
     */
    &.copied {
      color: var(--info);
    }

    &.fading {
      color: inherit;
      transition: color var(--copy-fade) ease;
    }
  }

  // 配置の切替と閉じるは 1 つの操作群 (doc-8 §2.2).
  .frame {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .placement {
    display: flex;
    gap: 0.2rem;
  }

  .switch {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    // A step taller than the `--head-control` the 列・行折畳み use, because this control carries a
    // mark below its figure and that one does not: measured at 1.2rem the 既定印 sat against the
    // frame and read as part of it.
    height: var(--frame-control);
    // Square: an アイコンのみのボタン has nothing to be wider than its figure for, and three of them
    // side by side read as one group of switches only if they are the same size.
    width: var(--frame-control);
    padding: 0;
    font-size: var(--frame-text);

    &.on {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }

    /*
     * 既定印 (doc-8 §2.2): the 下線 画面設計案 02 puts on the button of the placement the next start
     * will open in (doc-12 §3). Its own element rather than a bottom border or an inset shadow —
     * both of those follow the border radius and end up reading as the button's own frame, which the
     * first measurement showed. Absolute, so it takes no part in the layout: the three switches stay
     * the same size whichever of them is the 既定.
     *
     * `--fg` rather than the `--line-strong` of the frame around it: a mark that shares the frame's
     * colour is a thicker frame. It stays 中立 (decision-6) all the same — being the 既定 is which
     * placement is stored, not a 族 of state — and `.on`'s `--info` border is left to say the other
     * thing, since いま出ている配置 と 次回開く配置 can be true of different buttons at once.
     */
    &.is-default::after {
      content: "";
      position: absolute;
      right: 0.25rem;
      bottom: 0.1rem;
      left: 0.25rem;
      height: 2px;
      border-radius: 1px;
      background: var(--fg);
    }
  }

  .close {
    // The height is written with a border and padding in play; app.scss folds them in for every
    // フォーム部品 (doc-11 §2.2), so this rule states only the placement. `inline-flex` centres the
    // word in that height — the switches beside it centre a figure the same way.
    display: inline-flex;
    align-items: center;
    height: var(--frame-control);
    padding: 0 0.4rem;
    font-size: var(--frame-text);
  }

  /*
   * 主要属性の属性表 (画面設計案 02。doc-12 §3): 3 段 2 列。Four grid tracks — label, value, label,
   * value — so the six items fall into three rows of two pairs in source order, which is the order
   * doc-8 §3 writes them in. The label tracks are `auto` rather than a fixed 5.5rem: with two pairs on
   * a line, a fixed label column spends width the values need, and the labels here are short.
   *
   * `--frame-control` is not involved: these rows carry text only, so the line box is the right thing
   * to size them. (An earlier note here said the table "drops to one pair per line under a narrow
   * box". It does not — the four tracks have no wrapping rule — and what it actually did was push the
   * panel sideways, measured at 35 / 66 / 84px of horizontal overflow in a 700 / 560 / 480px 窓 during
   * an 編集セッション, 変更前 2026-08-11. `minmax(0, 1fr)` lets the *track* reach zero; the `select` in
   * it kept its own `min-width: auto`, so the track could not take the value with it.)
   */
  .facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.15rem 0.5rem;
    margin: 0;
    font-size: var(--text-md);

    // 値は列の幅に従う。値が列を押し広げると、押し広げた分だけパネルが横へスクロールする。
    select {
      min-width: 0;
    }

    dt {
      opacity: 0.6;
    }

    dd {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.3rem;

      // priority の値 (decision-23): 素の文字なので満たすのは面に対する 4.5:1 のほう
      // (優先度色の収録条件)。`font-weight` は上げない — カードのチップと違い、ここは 6 つの属性が
      // 同じ体裁で並ぶ表であり、1 行だけ太くすると色ではなく太さが目を引く。
      &[data-priority="high"] {
        color: var(--priority-high);
      }

      &[data-priority="medium"] {
        color: var(--priority-medium);
      }

      &[data-priority="low"] {
        color: var(--priority-low);
      }
    }
  }

  .date {
    font-variant-numeric: tabular-nums;
  }

  .raw {
    font-weight: 600;
  }

  .column,
  .resolved {
    opacity: 0.7;
  }

  .mark {
    @include shared.mark;
  }

  // 印チップ配色規則 (decision-12): 文字＝族の色、背景＝族の色 12% 混色、枠＝族の色 45% 混色。
  // 族ごとに `--family` を置くだけで済むので、この 3 宣言が全部の族に効く。
  // 印の族を混ぜない (decision-6, decision-22): 各族の色は `app.scss` の 1 か所が持つ。
  .mark[data-kind] {
    border: 1px solid color-mix(in srgb, var(--family) 45%, transparent);
    background: color-mix(in srgb, var(--family) 12%, transparent);
    color: var(--family);
  }

  .mark[data-kind="inconsistent"] {
    --family: var(--mark-inconsistent);
  }

  .mark[data-kind="unreadable"] {
    --family: var(--mark-unreadable);
  }

  .mark.unmapped {
    @include shared.mark-unmapped;
  }

  // 中立の情報は族でも Type でもない (doc-11 §3): `--muted`, no family colour — it reports what the
  // project's config says, not that anything is wrong with it.
  .mark.neutral {
    color: var(--muted);
  }

  // 不整合印 (decision-22): 印グリフ なので族の色は図形自身が持ち、背景も枠も無い。カードと同じ扱いで、
  // 大きさは隣の 印チップ・横断タスクID より 1 段大きい .8rem — 語を持たない図形は、同じ高さの文字より
  // 小さく見えるためである（カード側と同じ理由・同じ値）。
  .inconsistent {
    display: inline-flex;
    align-items: center;
    align-self: center;
    color: var(--mark-inconsistent);
    font-size: var(--text-lg);
    cursor: help;
  }

  input[type="text"],
  select {
    @include shared.form-control;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: var(--text-sm);

    span {
      opacity: 0.6;
    }
  }

  button {
    @include shared.button;
  }

  button.primary {
    @include shared.button-primary;
  }
</style>
