<script lang="ts">
  // Type と通常ラベルは別区画 (doc-8 §4): two sections, never one label list.
  import DetailSection from "../DetailSection.svelte";
  import { typeNotEditable } from "../../lib/edit";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { TypeValue } from "../../lib/wire";

  interface Props {
    types: readonly TypeValue[];
    layout: PlacementLayout;
    /** Whether an 編集セッション is open — Type is read-only in one, and says so. */
    editing: boolean;
  }

  let { types, layout, editing }: Props = $props();

  const t = messages();
</script>

<DetailSection title="Type" section="type" {layout}>
  <ul class="chips">
    {#if types.length === 0}
      <!-- Type 未設定 は破線輪郭のチップ (doc-11 §3), カードと同じ形で. A sentence here and a chip on
           the card made the same 未設定 read as two different findings. -->
      <li class="type unset">{t().state.typeUnset}</li>
    {:else}
      {#each types as value, index (index)}
        <li class="type" class:unknown={!value.known}>
          {value.value}{value.known ? "" : t().state.valueUnknown}
        </li>
      {/each}
    {/if}
  </ul>
  {#if editing}
    <p class="hint">{typeNotEditable()}</p>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .chips {
    @include shared.chips;
  }

  // Same rule as the card's (doc-11 §3), so the two screens do not draw the same distinction two
  // ways: Type は塗り＋太字＋角丸 3px、通常ラベルは輪郭ピル＋細字＋`--muted`. Here the two are already
  // separate 区画 (doc-8 §4), and the chip shapes keep them apart once both are on screen at once.
  .type {
    padding: 0 0.35rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--fg) 13%, transparent);
    font-weight: 600;

    &.unset {
      background: none;
      border: 1px dashed var(--line-strong);
      color: var(--muted);
      font-weight: 400;
    }

    &.unknown {
      background: none;
      border: 1px solid var(--line-strong);
    }
  }

  p {
    @include shared.paragraph;
  }

  .hint {
    @include shared.hint;
  }
</style>
