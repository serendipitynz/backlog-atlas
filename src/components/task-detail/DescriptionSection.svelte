<script lang="ts">
  import Body from "../Body.svelte";
  import DetailSection from "../DetailSection.svelte";
  import Editor from "../Editor.svelte";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    description: string | null;
    /** 編集セッションの下書き、または `null` (セッション無し)。 */
    draft: string | null;
    onchange: (value: string) => void;
    onsave: () => void;
    layout: PlacementLayout;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let { description, draft, onchange, onsave, layout, onopenlink, readimage }: Props = $props();

  const t = messages();
</script>

<DetailSection title="Description" section="description" {layout}>
  {#if draft === null}
    {#if description}
      <Body source={description} {onopenlink} {readimage} />
    {:else}
      <p class="neutral">{t().state.none}</p>
    {/if}
  {:else}
    <Editor label="Description" value={draft} rows={8} {onchange} {onsave} />
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
