<script lang="ts">
  // 決定事項区画 (doc-10 §10, TASK-118).
  //
  // The third 一覧列-holding 区画, and the only one that never issues: `backlog decision` has `create`
  // alone, whose options are `<title>` and `-s`, so there is no 作成の入口, no 編集への切替 and no
  // 編集セッション here. Everything the other two need in order to *hold* input has no subject in this
  // 区画 and is therefore absent rather than disabled (doc-11 §5: 理由の無い無効化を置かない).
  //
  // 選択と、その選択から導かれる値は親が持つ (doc-10 §1 の 区画切替 が入力を落とさないのと同じ理由)。
  // ここが持つのは描画と、押されたことの受け渡しだけである。
  import Body from "../Body.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import { fileInconsistencyReasons, inconsistencyLabel, unmappedFileReason } from "../../lib/mark";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import { displayPath } from "../../lib/project-detail";
  import type { Decision, ProjectEntry, ProjectSnapshot, UnmappedFile } from "../../lib/wire";

  interface Props {
    /** 台帳エントリ。表示パス を組むのに要る。 */
    entry: ProjectEntry;
    /** 読み取り結果。`null` は読み取り中 (ルート読取不能 は `unreadableNote` が述べる)。 */
    project: ProjectSnapshot | null;
    /** ルート読取不能 のときに一覧の代わりに立つ文 (doc-10 §8)、または `null`。 */
    unreadableNote: string | null;
    unmappedDecisions: readonly UnmappedFile[];
    /** いま 決定事項ペイン が開いている決定事項の id、または `null`。 */
    selection: string | null;
    /** その決定事項を現在の読み取りから解決したもの。 */
    selected: Decision | null;
    /** 選択されている決定事項の 表示パス。 */
    selectedPath: string | null;
    /** 閲覧ヘッダ に出す 理由行 (decision-24)。 */
    reasons: readonly string[];
    onselect: (decision: Decision) => void;
    /**
     * 決定事項ペイン の要素を親へ渡す。選択が替わったときにスクロールを頭へ戻すのは親の仕事なので
     * (選択を持っているのが親である)、要素の参照だけこちらから渡す。**入力ではない。**
     */
    onpane: (element: HTMLDivElement | undefined) => void;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let {
    entry,
    project,
    unreadableNote,
    unmappedDecisions,
    selection,
    selected,
    selectedPath,
    reasons: openReasons,
    onselect,
    onpane,
    onopenlink,
    readimage,
  }: Props = $props();

  const t = messages();

  let pane = $state<HTMLDivElement | undefined>(undefined);
  $effect(() => onpane(pane));
</script>

<!-- 決定事項区画 (doc-10 §10, TASK-118): 決定事項一覧 — this 区画's 一覧列 (§1) — beside the
     決定事項ペイン, the same three columns the other two 一覧列-holding 区画 have. Each column
     scrolls on its own, for the reason doc-10 §5 records.

     No 破棄前確認 stands above the columns here, and no 作成の入口 sits in the 一覧見出し行:
     this 区画 issues nothing, so it holds no 未保存入力 to protect and has no 発行 to offer.
     Nothing states *why* editing is absent — no control is shown, so doc-11 §8's 本則
     (画面が操作も欄も見せていないものについて、なぜ無いかを述べない) applies with no
     exception left in it (TASK-123). -->
<section class="split-section">
  {#if unreadableNote !== null}
    <h2>{t().projectDetail.decisionsHeading}</h2>
    <p class="unreadable">{unreadableNote}</p>
  {:else if project === null}
    <h2>{t().projectDetail.decisionsHeading}</h2>
    <p class="neutral">{t().state.loading}</p>
  {:else}
    <div class="columns">
      <div class="list-column">
        <!-- 一覧見出し行 (doc-10 §1) without its 作成の入口: `backlog decision create` exists,
             but it takes a title and a status and cannot write a body, so a 作成 here would
             produce a decision no screen in Atlas can then fill in. The count is the cards'
             own, which is why the 写せなかったファイル below are outside it (decision-24). -->
        <div class="list-head">
          <h2>{t().projectDetail.decisionsCount(project.decisions.length)}</h2>
        </div>
        {#if project.decisions.length === 0}
          <p class="neutral">{t().projectDetail.decisionsEmpty}</p>
        {:else}
          <ul class="cards">
            {#each project.decisions as decision (decision.id)}
              {@const current = selection === decision.id}
              {@const reasons = fileInconsistencyReasons(decision.health, "decision")}
              <li>
                <!-- カード (doc-10 §10): the whole area is the selection, and the current one
                     is marked — the same form the other two 一覧列 take. Cards are never
                     withheld here: opening one drops nothing, so a 発行 elsewhere in the
                     screen is not a reason to stop a reader (doc-11 §5). id・title・status
                     are what a reader picks by; date and 本文 are read in the pane. -->
                <button
                  type="button"
                  class="card"
                  class:current
                  aria-current={current ? "true" : undefined}
                  title={t().projectDetail.decisionOpenHint}
                  onclick={() => onselect(decision)}
                >
                  <span class="card-head">
                    <span class="id">{decision.id}</span>
                    <span class="meta status">{decision.status ?? t().projectDetail.statusUnset}</span>
                    {#if reasons.length > 0}
                      <!-- 不整合印 (decision-22, decision-24): one ⚠️, no family name. The
                           lines themselves are read in the 閲覧ヘッダ, the place doc-11 §2.4
                           requires before this mark may be drawn at all. -->
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
                  <span class="card-title">{decision.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if unmappedDecisions.length > 0}
          <!-- 写せなかったファイルの一覧 (doc-10 §1, decision-24). doc-10 §9 required this to
               arrive together with the normal list, never before it: on its own it would tell
               a reader Atlas handles decisions while giving them no decision to find. -->
          <div class="unmapped">
            <h3>{t().projectDetail.unmappedFiles(unmappedDecisions.length)}</h3>
            <ul>
              {#each unmappedDecisions as file (file.sourcePath)}
                <li>
                  <code>{displayPath(file.sourcePath, entry.project_root)}</code>
                  <span class="reason-line">{unmappedFileReason(file)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- 決定事項ペイン (doc-10 §10): two states, not the other two 区画's three — 閲覧 while
           a decision is selected, and a line saying what the column is for while none is.
           The missing third is the 編集セッション, which this 区画 cannot open. -->
      <div class="pane" bind:this={pane}>
        {#if selected !== null}
          {@const decision = selected}
          <!-- 閲覧 (doc-10 §10): what the selection opens. It is the only thing selection can
               open here, so 閲覧 is the whole of the pane rather than one state of three. -->
          <div class="sub-panel">
            <!-- 閲覧ヘッダ (doc-10 §5, widened by §10): title on the first line — no 編集
                 beside it, since this 区画 has no 編集への切替 — then id・status・date・
                 表示パス, then the 理由行. -->
            <div class="view-head">
              <h3>{decision.title}</h3>
            </div>
            <p class="meta-line">
              <span class="id">{decision.id}</span>
              <span class="status">{decision.status ?? t().projectDetail.statusUnset}</span>
              <span>{decision.date ?? t().projectDetail.dateUnset}</span>
            </p>
            <!-- 表示パス (doc-10 §5): which file this is, project-relative. -->
            <p class="path"><code>{selectedPath}</code></p>
            {#if openReasons.length > 0}
              <!-- 理由行 (decision-22, decision-24): the place doc-11 §2.4 requires the ⚠️'s
                   full reason to be readable without hovering. Keyed by index, not by the
                   string — two reasons can read identically and a duplicate key throws in
                   production Svelte (PR #71 [P2]). -->
              <ul class="reason-lines">
                {#each openReasons as reason, at (at)}
                  <li>{reason}</li>
                {/each}
              </ul>
            {/if}
            <!-- 本文: 整形表示 (doc-8 §9, decision-25). Not decided again here — doc-8 §9
                 states that it is not confined to タスク詳細, and this is the same object it
                 names: 管理ファイルの本文 1 つを読むだけの表示. -->
            {#if (decision.body ?? "") === ""}
              <p class="neutral">{t().projectDetail.bodyEmpty}</p>
            {:else}
              <div class="read-body-slot">
                <Body source={decision.body ?? ""} {onopenlink} {readimage} />
              </div>
            {/if}
          </div>
        {:else}
          <!-- 非選択時の決定事項ペイン (doc-10 §10). The column is not collapsed and the
               区画 does not fall to two columns: the cards' width would move every time a
               selection came and went (doc-10 §5's reason, taken as it stands). -->
          <p class="neutral">{t().projectDetail.decisionNotSelected}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  @use "./shared" as shared;

  .split-section {
    @include shared.split-section;

    > h2,
    > .neutral {
      @include shared.split-section-inset;
    }
  }

  .columns {
    @include shared.columns;
  }

  .list-column {
    @include shared.list-column;
  }

  .list-head {
    @include shared.list-head;

    h2 {
      @include shared.heading-2;
      @include shared.list-head-heading;
    }
  }

  .cards {
    @include shared.cards;

    li {
      @include shared.cards-item;
    }
  }

  .card {
    @include shared.card;

    &.current {
      @include shared.card-current;
    }

    .card-head {
      @include shared.card-head;
    }

    .id {
      @include shared.card-id;
    }

    .meta {
      @include shared.card-meta;
    }

    .card-head .meta {
      @include shared.card-head-meta;
    }

    .card-title {
      @include shared.card-title;
    }
  }

  .pane {
    @include shared.pane;

    > :first-child {
      margin-top: 0;
    }
  }

  h2 {
    @include shared.heading-2;
  }

  h3 {
    @include shared.heading-3;
  }

  .sub-panel {
    @include shared.sub-panel;
  }

  .view-head {
    @include shared.view-head;

    h3 {
      @include shared.view-head-heading;
    }
  }

  .meta-line {
    @include shared.meta-line;

    .id {
      @include shared.meta-line-id;
    }
  }

  // 決定事項の status は 中立の情報 の 3 つ目で、輪郭のみ・`--muted`・角丸 3px を取る (doc-11 §3。
  // `TaskCard.svelte` の 保存区分印 と 未分類区画の原文 status が同じ姿である)。族の色も優先度色も
  // 与えないのは、この値に台帳の側が宣言する集合が無いためで、上流 browser が 4 語を色で描くことは
  // その理由を変えない — doc-11 §3 がその判断を持つ。**同じ 一覧列 に並ぶ 文書の `type` と
  // マイルストーンの件数は素のテキストのまま**なので、`.card-head .meta` そのものではなくこの class に
  // 付ける。一覧のカードと閲覧ヘッダで同じ姿になるよう、規則はこの 1 か所だけに置く。
  //
  // **カード側を `.card .card-head` で限るのは、`color` を順序に頼らず勝たせるためである** — カードの
  // span は `.meta` も持ち、`.card .meta` が `--muted` を宣言している (0,2,0)。裸の `.status` (0,1,0) では
  // その宣言が勝ち、doc-11 §3 が姿の一部として挙げている `--muted` だけがこの規則の外に出る。いまはどちらも
  // 同じ値なので画面は変わらないが、`.card .meta` を動かした回にカードと閲覧ヘッダが離れる (PR #140 の [P3])。
  .card .card-head .status,
  .meta-line .status {
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    // 語を割ってよい。frontmatter の status は任意の文字列で、`decision create -s` は長さを見ない —
    // 42 字の 1 語を差し替えて測ると、札は一覧列の右端を 2.25px 越えて枠が切れた (素のテキストだった
    // ときは 10.28px 内側に収まっていた。差は札の左右余白と枠の 12.53px である)。`.card-title` が
    // 同じ列で同じ理由から取っている手当てと同じものを取る。
    overflow-wrap: anywhere;
    color: var(--muted);
  }

  button {
    @include shared.button;
  }

  .path {
    @include shared.path;
  }

  .read-body-slot {
    @include shared.read-body-slot;
  }

  .inconsistent {
    @include shared.inconsistent-glyph;
  }

  .reason-lines {
    @include shared.reason-lines;

    li {
      @include shared.reason-lines-item;
    }
  }

  .unmapped {
    @include shared.unmapped-list;

    h3 {
      @include shared.unmapped-heading;
    }

    ul {
      @include shared.unmapped-items;
    }

    li {
      @include shared.unmapped-item;
    }

    code {
      @include shared.unmapped-path;
    }
  }

  .reason-line {
    @include shared.reason-line;
  }

  .neutral {
    @include shared.neutral;
  }

  .unreadable {
    @include shared.unreadable;
  }

  code {
    @include shared.code;
  }
</style>
