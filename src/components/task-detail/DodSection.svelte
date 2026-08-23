<script lang="ts">
  // TASK-185 の 3 区画のひとつ。読み取りのまま描く理由は `FinalSummarySection.svelte` と同じ。
  import DetailSection from "../DetailSection.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import type { AcProgress } from "../../lib/detail";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { AcceptanceCriterion } from "../../lib/wire";

  interface Props {
    items: readonly AcceptanceCriterion[];
    progress: AcProgress;
    layout: PlacementLayout;
  }

  let { items, progress, layout }: Props = $props();

  const t = messages();
</script>

<!-- 達成数 は出るが 達成割合のバー は出ない — バーは 区画境界 そのもので、折畳みの区画は
     区画境界 を持たないためである (doc-8 §3)。`DetailSection` がその判定を持っているので、
     ここは AC と同じ prop を渡すだけでよい。 -->
<DetailSection
  title={t().taskDetail.definitionOfDoneHeading}
  section="dod"
  {layout}
  {progress}
>
  {#if progress.total === 0}
    <p class="neutral">{t().state.none}</p>
  {:else}
    <ul class="ac">
      <!-- 位置で鍵を作る（#N ではなく）。読み取り層は番号の一意性を保証しない — CLI は
           max+1 を振るが、手で書いたファイルは `#1` を 2 行持てる。Svelte の
           `each_key_duplicate` は本番でも throw するので、鍵が重なるとタスク詳細ごと落ちる。 -->
      {#each items as item, index (index)}
        <li class:checked={item.checked}>
          <span class="box" role="img" aria-label={item.checked ? t().taskDetail.done : t().taskDetail.notDone}>
            <Icon name={item.checked ? "square-check" : "square"} />
          </span>
          <span class="number">#{item.number}</span>
          <span class="text">{item.text}</span>
        </li>
      {/each}
    </ul>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .ac {
    @include shared.value-list;

    li {
      @include shared.checklist-item;

      &.checked .text {
        opacity: 0.65;
      }
    }

    .box {
      @include shared.checklist-box;
    }
  }

  .number {
    @include shared.number;
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
