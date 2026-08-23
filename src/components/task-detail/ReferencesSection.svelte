<script lang="ts">
  import DetailSection from "../DetailSection.svelte";
  import ListEditor from "./ListEditor.svelte";
  import type { PlainReference } from "../../lib/detail";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    references: readonly PlainReference[];
    /** 編集セッションの下書き、または `null` (セッション無し)。 */
    draft: string[] | null;
    apply: (next: string[]) => void;
    entry: string;
    setEntry: (value: string) => void;
    layout: PlacementLayout;
  }

  let { references, draft, apply, entry, setEntry, layout }: Props = $props();

  const t = messages();
</script>

<!-- 折畳み（件数を見せる） (doc-8 §3): the count is on the summary, so a folded References still
     says how many there are. -->
<DetailSection
  title="References"
  section="references" {layout}
  count={t().state.count(references.length)}
>
  {#if draft === null}
    {#if references.length === 0}
      <p class="neutral">{t().state.none}</p>
    {:else}
      <ul class="refs">
        {#each references as reference, index (index)}
          <li>
            <span class="url">{reference.value}</span>
            {#if reference.dangling}
              <span class="mark unmapped">{t().taskDetail.referenceMissing}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- The list is every reference, Pull Request URLs included: `--ref` replaces the whole set,
         so editing anything less would drop the rest (doc-5 §3, doc-8 §6). -->
    <ListEditor values={draft} {apply} draft={entry} setDraft={setEntry} placeholder="URL" />
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .refs {
    @include shared.value-list;

    li {
      @include shared.inline-row;
    }
  }

  .url {
    @include shared.url;
  }

  .mark {
    @include shared.mark;
  }

  .mark.unmapped {
    @include shared.mark-unmapped;
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
