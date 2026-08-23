<script lang="ts">
  import DetailSection from "../DetailSection.svelte";
  import ListEditor from "./ListEditor.svelte";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    /** 読み取り時点の通常ラベル。編集セッション中は `draft` が描かれる。 */
    labels: readonly string[];
    /** 編集セッションの下書き、または `null` (セッション無し)。 */
    draft: string[] | null;
    apply: (next: string[]) => void;
    /** まだ 追加 されていない入力欄の中身。 */
    entry: string;
    setEntry: (value: string) => void;
    layout: PlacementLayout;
  }

  let { labels, draft, apply, entry, setEntry, layout }: Props = $props();

  const t = messages();
</script>

<DetailSection
  title={t().field.plainLabels}
  section="labels" {layout}
  count={t().state.count(labels.length)}
>
  {#if draft === null}
    {#if labels.length === 0}
      <p class="neutral">{t().state.none}</p>
    {:else}
      <ul class="chips">
        {#each labels as label, index (index)}
          <li class="label">{label}</li>
        {/each}
      </ul>
    {/if}
  {:else}
    <ListEditor
      values={draft}
      {apply}
      draft={entry}
      setDraft={setEntry}
      placeholder={t().field.addLabel}
    />
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .chips {
    @include shared.chips;
  }

  .label {
    padding: 0 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
