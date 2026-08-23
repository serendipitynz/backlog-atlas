<script lang="ts">
  import Body from "../Body.svelte";
  import DetailSection from "../DetailSection.svelte";
  import Editor from "../Editor.svelte";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    implementationPlan: string | null;
    draft: string | null;
    onchange: (value: string) => void;
    onsave: () => void;
    layout: PlacementLayout;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let { implementationPlan, draft, onchange, onsave, layout, onopenlink, readimage }: Props =
    $props();

  const t = messages();
</script>

<DetailSection title={t().taskDetail.planHeading} section="plan" {layout}>
  {#if draft === null}
    {#if implementationPlan}
      <Body source={implementationPlan} {onopenlink} {readimage} />
    {:else}
      <p class="neutral">{t().state.none}</p>
    {/if}
  {:else}
    <Editor label={t().taskDetail.planHeading} value={draft} {onchange} {onsave} />
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
