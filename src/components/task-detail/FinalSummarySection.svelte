<script lang="ts">
  // TASK-185 の 3 区画のひとつ。**編集セッション 中も読み取りのまま描く** — 画面からの書き戻しは
  // 持つと決まっているが、この回の範囲ではない (doc-5 §3.2)。編集の枝を空で置くと、その区画だけ
  // 保存の宛先が無い編集卓に見える。
  import Body from "../Body.svelte";
  import DetailSection from "../DetailSection.svelte";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    finalSummary: string | null;
    layout: PlacementLayout;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let { finalSummary, layout, onopenlink, readimage }: Props = $props();

  const t = messages();
</script>

<DetailSection title={t().taskDetail.finalSummaryHeading} section="finalSummary" {layout}>
  {#if finalSummary}
    <Body source={finalSummary} {onopenlink} {readimage} />
  {:else}
    <p class="neutral">{t().state.none}</p>
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
