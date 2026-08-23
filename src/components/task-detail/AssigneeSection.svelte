<script lang="ts">
  // assignee (doc-8 §3): 見出しから外して本文側の区画へ置いた (TASK-72). 画面設計案 02 の属性表には
  // あるが、本書は意図的に外れている (doc-12 §3) — 属性表を 2 列に保ったまま created と updated を
  // 別のセルへ割くためで、assignee は編集セッションでだけ書き換える値なので、常に読める必要がある
  // 見出しの側に要らない。割当表にはこの区画自身の行がある (TASK-73 まで通常ラベルの行を借りていた)。
  import DetailSection from "../DetailSection.svelte";
  import ListEditor from "./ListEditor.svelte";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    assignee: readonly string[];
    draft: string[] | null;
    apply: (next: string[]) => void;
    entry: string;
    setEntry: (value: string) => void;
    layout: PlacementLayout;
  }

  let { assignee, draft, apply, entry, setEntry, layout }: Props = $props();

  const t = messages();
</script>

<DetailSection
  title="assignee"
  section="assignee" {layout}
  count={t().state.count(assignee.length)}
>
  {#if draft === null}
    {#if assignee.length === 0}
      <p class="neutral">{t().state.none}</p>
    {:else}
      <p>{assignee.join(", ")}</p>
    {/if}
  {:else}
    <!-- 担当の設定・付け替えはこの画面で閉じる (doc-5 §3・doc-10 §7, TASK-57). 全置換 —
         編集側の `-a` は値をカンマ区切りの集合として読み、frontmatter の一覧を丸ごと置き換える. -->
    <ListEditor
      values={draft}
      {apply}
      draft={entry}
      setDraft={setEntry}
      placeholder={t().taskDetail.addAssignee}
    />
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
