<script lang="ts">
  import DetailSection from "../DetailSection.svelte";
  import ListEditor from "./ListEditor.svelte";
  import type { DependencyLink } from "../../lib/detail";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { TaskView } from "../../lib/wire";

  interface Props {
    dependencies: readonly DependencyLink[];
    /** 編集セッションの下書き、または `null` (セッション無し)。 */
    draft: string[] | null;
    apply: (next: string[]) => void;
    entry: string;
    setEntry: (value: string) => void;
    layout: PlacementLayout;
    /** 解決先タスクへ辿る (doc-8 §3)。選択の変更はシェルが持つ。 */
    onselect: (view: TaskView) => void;
  }

  let { dependencies, draft, apply, entry, setEntry, layout, onselect }: Props = $props();

  const t = messages();
</script>

<DetailSection
  title="dependencies"
  section="dependencies" {layout}
  count={t().state.count(dependencies.length)}
>
  {#if draft === null}
    {#if dependencies.length === 0}
      <p class="neutral">{t().state.none}</p>
    {:else}
      <ul class="deps">
        {#each dependencies as dependency, index (index)}
          <li>
            {#if dependency.target === null}
              <span class="id">{dependency.id}</span>
              <span class="mark unmapped">{t().taskDetail.unresolved}</span>
            {:else}
              {@const target = dependency.target}
              <button type="button" onclick={() => onselect(target)}>
                {dependency.id}
                <span class="dep-title">{target.task.title ?? t().state.titleUnknown}</span>
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <ListEditor values={draft} {apply} draft={entry} setDraft={setEntry} placeholder="TASK-ID" />
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .deps {
    @include shared.value-list;

    li {
      display: flex;
      align-items: baseline;
      gap: 0.3rem;

      button {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        padding: 0.1rem 0.35rem;
        border: 1px solid var(--line-strong);
        border-radius: 4px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--text-md);
        text-align: left;
        cursor: pointer;

        &:hover {
          border-color: var(--line-strong);
        }
      }
    }
  }

  .dep-title {
    opacity: 0.7;
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
