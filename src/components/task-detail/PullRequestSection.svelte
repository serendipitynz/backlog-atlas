<script lang="ts">
  // Pull Request URL は References と分離して独立表示 (doc-8 §4). Both sections stay visible in
  // every 保存区分 (doc-8 §6.5) — they are 参照系, which reading never depends on edit rights.
  import DetailSection from "../DetailSection.svelte";
  import type { PullRequestRef } from "../../lib/wire";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    pullRequests: readonly PullRequestRef[];
    layout: PlacementLayout;
    /** Whether an 編集セッション is open — References が全置換であることの注記が出る条件。 */
    editing: boolean;
  }

  let { pullRequests, layout, editing }: Props = $props();

  const t = messages();
</script>

<DetailSection
  title="Pull Request"
  section="pullRequest" {layout}
  count={t().state.count(pullRequests.length)}
>
  {#if pullRequests.length === 0}
    <p class="neutral">{t().taskDetail.noPullRequests}</p>
  {:else}
    <ul class="prs">
      {#each pullRequests as pr, index (index)}
        <li>
          <span class="url">{pr.url}</span>
          <span class="meta">
            {pr.host ?? t().taskDetail.hostUnknown}{pr.owner && pr.repo
              ? ` / ${pr.owner}/${pr.repo}`
              : ""}{pr.number === null ? "" : ` / #${pr.number}`}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if editing}
    <p class="hint">
      {t().taskDetail.pullRequestNote}
    </p>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .prs {
    @include shared.value-list;

    li {
      @include shared.inline-row;
    }
  }

  .url {
    @include shared.url;
  }

  .meta {
    font-size: var(--text-sm);
    opacity: 0.6;
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }

  .hint {
    @include shared.hint;
  }
</style>
