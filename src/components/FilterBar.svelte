<script lang="ts">
  // フィルタ (doc-7 §5). Every control here only takes cards away; none of them can change the
  // rows or the columns. The 保存区分 control is the one that starts from a default rather than
  // from "off" — active alone — which is why it is drawn first and always shows its state.
  import {
    hasTypeSelection,
    toggleTypeSelection,
    toggleValue,
    typeSelectionKey,
    type CardFilter,
    type Facets,
    type StorageSelection,
    type TypeSelection,
  } from "../lib/filter";

  interface Props {
    filter: CardFilter;
    facets: Facets;
    /** Whether any read task has an indeterminate storage state (doc-4 §3.4). */
    hasIndeterminateStorage: boolean;
    onchange: (filter: CardFilter) => void;
    onreset: () => void;
  }

  let { filter, facets, hasIndeterminateStorage, onchange, onreset }: Props = $props();

  // The text box keeps its own state and is bound (DOM → state), never written back on every
  // keystroke: writing the value back mid-composition is what breaks IME input, and the filter
  // is not worth re-running on each intermediate 変換 candidate either. `isComposing` holds the
  // dispatch until the composition ends, and the effect only re-syncs when the filter is
  // changed from outside (the reset button).
  let text = $state("");
  $effect(() => {
    text = filter.text;
  });

  function commitText(event: Event): void {
    // `isComposing` is true for every keystroke of an IME composition; the browser fires one
    // more `input` once the composition is committed, which is the one that gets through.
    if ((event as InputEvent).isComposing) return;
    onchange({ ...filter, text });
  }

  const STORAGE_CHOICES: { value: StorageSelection; label: string }[] = [
    { value: "active", label: "active" },
    { value: "draft", label: "draft" },
    { value: "completed", label: "completed" },
    { value: "archive", label: "archive" },
  ];

  let storageChoices = $derived(
    hasIndeterminateStorage
      ? [...STORAGE_CHOICES, { value: "indeterminate" as StorageSelection, label: "保存区分不明" }]
      : STORAGE_CHOICES,
  );

  function typeLabel(selection: TypeSelection): string {
    switch (selection.kind) {
      case "value":
        return selection.value;
      case "unset":
        return "Type 未設定";
      case "unknown":
        return "未知 Type";
    }
  }
</script>

<div class="bar">
  <label class="text">
    <span class="caption">テキスト</span>
    <input
      type="search"
      placeholder="横断タスクID・title"
      bind:value={text}
      oninput={commitText}
    />
  </label>

  <fieldset>
    <legend>保存区分</legend>
    {#each storageChoices as choice (choice.value)}
      <label>
        <input
          type="checkbox"
          checked={filter.storage.includes(choice.value)}
          onchange={() =>
            onchange({ ...filter, storage: toggleValue(filter.storage, choice.value) })}
        />
        {choice.label}
      </label>
    {/each}
  </fieldset>

  {#if facets.types.length > 0}
    <fieldset>
      <legend>Type</legend>
      {#each facets.types as selection (typeSelectionKey(selection))}
        <label>
          <input
            type="checkbox"
            checked={hasTypeSelection(filter, selection)}
            onchange={() => onchange(toggleTypeSelection(filter, selection))}
          />
          {typeLabel(selection)}
        </label>
      {/each}
    </fieldset>
  {/if}

  {#if facets.priorities.length > 0}
    <fieldset>
      <legend>priority</legend>
      {#each facets.priorities as priority (priority)}
        <label>
          <input
            type="checkbox"
            checked={filter.priorities.includes(priority)}
            onchange={() =>
              onchange({ ...filter, priorities: toggleValue(filter.priorities, priority) })}
          />
          {priority}
        </label>
      {/each}
    </fieldset>
  {/if}

  {#if facets.labels.length > 0}
    <fieldset>
      <legend>ラベル</legend>
      {#each facets.labels as label (label)}
        <label>
          <input
            type="checkbox"
            checked={filter.labels.includes(label)}
            onchange={() => onchange({ ...filter, labels: toggleValue(filter.labels, label) })}
          />
          {label}
        </label>
      {/each}
    </fieldset>
  {/if}

  {#if facets.assignees.length > 0}
    <fieldset>
      <legend>assignee</legend>
      {#each facets.assignees as assignee (assignee)}
        <label>
          <input
            type="checkbox"
            checked={filter.assignees.includes(assignee)}
            onchange={() =>
              onchange({ ...filter, assignees: toggleValue(filter.assignees, assignee) })}
          />
          {assignee}
        </label>
      {/each}
    </fieldset>
  {/if}

  <fieldset>
    <legend>縮退</legend>
    <label>
      <input
        type="checkbox"
        checked={filter.degradedOnly}
        onchange={() => onchange({ ...filter, degradedOnly: !filter.degradedOnly })}
      />
      縮退のみ
    </label>
  </fieldset>

  <button type="button" class="reset" onclick={onreset}>既定に戻す</button>
</div>

<style lang="scss">
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.4rem 0.8rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    font-size: 0.75rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.5rem;
    margin: 0;
    padding: 0.1rem 0.4rem 0.2rem;
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 4px;
  }

  legend {
    padding: 0 0.2rem;
    font-size: 0.65rem;
    opacity: 0.7;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    white-space: nowrap;
  }

  .text {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
  }

  .caption {
    font-size: 0.65rem;
    opacity: 0.7;
  }

  input[type="search"] {
    padding: 0.15rem 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: canvas;
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
  }

  .reset {
    align-self: center;
    margin-left: auto;
    padding: 0.15rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }
</style>
