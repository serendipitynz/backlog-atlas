<script lang="ts">
  import DetailSection from "../DetailSection.svelte";
  import Editor from "../Editor.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import type { AcProgress } from "../../lib/detail";
  import type { AcRow, EditSession } from "../../lib/edit";
  import { setAcMode, toggleAcCheck, toggleAcRemoval } from "../../lib/edit";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { AcceptanceCriterion } from "../../lib/wire";

  interface Props {
    items: readonly AcceptanceCriterion[];
    progress: AcProgress;
    /** The 編集セッション, or `null` outside one. Owned by the panel; written back through `setSession`. */
    session: EditSession | null;
    /** 項目単位操作 の行 (`acRows`)。セッションが無いときは空。 */
    rows: readonly AcRow[];
    /** モードや完了印の切替は次のセッションを丸ごと返すので、1 つの受け渡し口で足りる。 */
    setSession: (next: EditSession) => void;
    /** 全体差し替え の欄。`edit("ac", …)` を通す。 */
    setAc: (value: EditSession["draft"]["ac"]) => void;
    /** まだ 追加 されていない新しい受入条件の文。 */
    entry: string;
    setEntry: (value: string) => void;
    addEntry: () => void;
    onsave: () => void;
    layout: PlacementLayout;
  }

  let {
    items,
    progress,
    session,
    rows,
    setSession,
    setAc,
    entry,
    setEntry,
    addEntry,
    onsave,
    layout,
  }: Props = $props();

  const t = messages();
</script>

<DetailSection title="Acceptance Criteria" section="ac" {layout} {progress}>
  {#if session === null}
    {#if progress.total === 0}
      <p class="neutral">{t().state.none}</p>
    {:else}
      <ul class="ac">
        {#each items as item (item.number)}
          <li class:checked={item.checked}>
            <!-- 族を持たない状態の印 (doc-11 §2.4): not pressable outside an 編集セッション, so the
                 name goes on the wrapper. `role="img"` is required, not decoration — with the figure
                 `aria-hidden` this span has no content left, and `aria-label` on a bare span is not
                 announced. While it printed a glyph, the glyph itself was the name. -->
            <span class="box" role="img" aria-label={item.checked ? t().taskDetail.done : t().taskDetail.notDone}>
              <Icon name={item.checked ? "square-check" : "square"} />
            </span>
            <span class="number">#{item.number}</span>
            <span class="text">{item.text}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- 項目単位操作 と 全体差し替え を区別する (doc-5 §3/§3.1): the CLI has no single option that
         sets all criteria, so the composite replacement is its own mode, entered on purpose. -->
    <div class="modes">
      <button
        type="button"
        class="mini"
        class:on={session.draft.ac.mode === "delta"}
        onclick={() => setSession(setAcMode(session, "delta"))}
      >
        {t().taskDetail.criteriaModeItems}
      </button>
      <button
        type="button"
        class="mini"
        class:on={session.draft.ac.mode === "replace"}
        onclick={() => setSession(setAcMode(session, "replace"))}
      >
        {t().taskDetail.criteriaModeReplace}
      </button>
    </div>

    {#if session.draft.ac.mode === "delta"}
      <ul class="ac">
        {#each rows as row (row.number)}
          <li class:checked={row.checked} class:removed={row.removed}>
            <!-- 編集セッション中は同じ印がアイコンのみのボタンになる (doc-11 §2.4). The figure pair is
                 the one 閲覧 draws, so the項 does not change appearance when the session opens; what
                 changes is that it can be pressed. The state the figure shows is in the name already
                 (「を完了にする」 can only be said of an unchecked one), so nothing is added for it. -->
            <button
              type="button"
              class="box"
              aria-label={t().taskDetail.toggleCriterion(row.number, row.checked)}
              onclick={() => setSession(toggleAcCheck(session, row.number))}
            >
              <Icon name={row.checked ? "square-check" : "square"} />
            </button>
            <span class="number">#{row.number}</span>
            <span class="text">{row.text}</span>
            <button
              type="button"
              class="mini"
              onclick={() => setSession(toggleAcRemoval(session, row.number))}
            >
              {row.removed ? t().taskDetail.undoRemove : t().action.remove}
            </button>
          </li>
        {/each}
      </ul>
      {#each session.draft.ac.delta.add as text, index (index)}
        <p class="hint">{t().taskDetail.pendingAdd(text)}</p>
      {/each}
      <div class="add-row">
        <input
          type="text"
          placeholder={t().field.addCriterion}
          value={entry}
          oninput={(event) => setEntry(event.currentTarget.value)}
        />
        <button type="button" class="mini" onclick={addEntry}>{t().action.add}</button>
      </div>
    {:else}
      {@const replaced = session.draft.ac.mode === "replace" ? session.draft.ac.items : []}
      <ul class="ac-replace">
        {#each replaced as item, index (index)}
          <li>
            <label class="check">
              <input
                type="checkbox"
                checked={item.checked}
                onchange={(event) =>
                  setAc({
                    mode: "replace",
                    items: replaced.map((each, at) =>
                      at === index ? { ...each, checked: event.currentTarget.checked } : each,
                    ),
                  })}
              />
              {t().taskDetail.done}
            </label>
            <Editor
              label={`Acceptance Criterion ${index + 1}`}
              value={item.text}
              rows={2}
              onchange={(value) =>
                setAc({
                  mode: "replace",
                  items: replaced.map((each, at) => (at === index ? { ...each, text: value } : each)),
                })}
              {onsave}
            />
            <button
              type="button"
              class="mini"
              onclick={() =>
                setAc({ mode: "replace", items: replaced.filter((_, at) => at !== index) })}
            >
              {t().action.remove}
            </button>
          </li>
        {/each}
      </ul>
      <button
        type="button"
        class="mini"
        onclick={() =>
          setAc({ mode: "replace", items: [...replaced, { text: "", checked: false }] })}
      >
        {t().taskDetail.addItem}
      </button>
      <p class="hint">
        {t().taskDetail.replaceAllNote}
      </p>
    {/if}
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .ac {
    @include shared.value-list;

    li {
      @include shared.checklist-item;

      &.checked .text {
        opacity: 0.65;
      }

      // A criterion marked for removal is still listed: the save has not happened, and taking it out
      // of the list would hide what the mark is about to do.
      &.removed .text {
        text-decoration: line-through;
        opacity: 0.55;
      }
    }

    .box {
      @include shared.checklist-box;
    }

    button.box {
      padding: 0;
      border: none;
      background: none;
    }
  }

  .number {
    @include shared.number;
  }

  .ac-replace {
    @include shared.value-list;

    li {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid var(--line);
    }
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--text-sm);
  }

  .modes {
    @include shared.control-group;

    button {
      @include shared.control-group-button;
    }
  }

  .add-row {
    @include shared.add-row;

    input {
      @include shared.add-row-input;
    }
  }

  input[type="text"] {
    @include shared.form-control;
  }

  button {
    @include shared.button;
  }

  button.mini {
    @include shared.button-mini;
  }

  button.mini.on {
    @include shared.button-mini-on;
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
