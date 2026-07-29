<script lang="ts">
  // One 区画 of the task detail (doc-8 §3), drawn as the placement's assignment table says: 常設 is
  // 既定で開いた状態, 折畳み is 見出しと件数だけを見せて既定で閉じた状態.
  //
  // Both are the same element — a `<details>` whose `open` starts from the disposition — because
  // doc-8 §3 defines the two by their *default* state ("既定で"), not by whether the user may change
  // it. Making 常設 a plain block would take the fold away from the wide placements, where a long
  // Description is exactly the thing one wants out of the way while reading the AC list.
  //
  // Switching the placement re-applies `open`, so a placement is a whole set of folds rather than a
  // starting point that decays: the user's own toggles hold until they choose another placement.
  import type { Snippet } from "svelte";
  import type { Disposition } from "../lib/placement";

  interface Props {
    title: string;
    disposition: Disposition;
    /**
     * 見出しに添える件数 (doc-8 §3: 折畳み（件数を見せる）). Shown open or closed — a count that
     * appears only while folded would vanish exactly when the list it counts is not on screen.
     */
    count?: string | null;
    children: Snippet;
  }

  let { title, disposition, count = null, children }: Props = $props();
</script>

<details class="section" open={disposition === "always"}>
  <summary>
    <h3>{title}</h3>
    {#if count !== null}
      <span class="count">{count}</span>
    {/if}
  </summary>
  <div class="content">
    {@render children()}
  </div>
</details>

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  summary {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    // The disclosure triangle is kept: it is the only thing that says a section can be folded at
    // all, and a fold the user cannot see is one they cannot use.
    cursor: pointer;

    h3 {
      display: inline;
      margin: 0;
      font-size: 0.8rem;
    }
  }

  .count {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }
</style>
