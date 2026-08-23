<script lang="ts">
  // 一覧の編集 (doc-10 §7): 新規タスク区画 の 通常ラベル と Acceptance Criteria が同じ形で使う。
  // 行ごとの 削除 と、末尾の 1 件追加だけを持つ。
  //
  // 値は親の入力状態が持つ。ここは受け取った配列と下書き文字列を描き、押されたときに次の値を親へ
  // 渡すだけである — 区画切替でこの要素が消えても入力が残るのは、それが理由である (doc-10 §1)。
  //
  // **タスク詳細側の同名コンポーネントとは別物である** — あちらは行を `.url` として縦に積み、空の
  // 一覧でも `<ul>` を出す。ここは札として横に並べ、空なら `<ul>` ごと出さない。
  import { messages } from "../../lib/messages-context";

  interface Props {
    values: string[];
    /** 次の集合。行の削除と 1 件追加のどちらもこれで渡る。 */
    apply: (next: string[]) => void;
    /** まだ 追加 されていない入力欄の中身。親が持つ。 */
    draft: string;
    setDraft: (value: string) => void;
    placeholder: string;
  }

  let { values, apply, draft, setDraft, placeholder }: Props = $props();

  const t = messages();

  function addTo(current: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || current.includes(trimmed) ? current : [...current, trimmed];
  }
</script>

{#if values.length > 0}
  <ul class="list-edit">
    {#each values as value, index (index)}
      <li>
        <span class="value">{value}</span>
        <button
          type="button"
          class="mini"
          onclick={() => apply(values.filter((_, at) => at !== index))}
        >
          {t().action.remove}
        </button>
      </li>
    {/each}
  </ul>
{/if}
<div class="add-row">
  <input
    type="text"
    {placeholder}
    value={draft}
    oninput={(event) => setDraft(event.currentTarget.value)}
  />
  <button
    type="button"
    class="mini"
    onclick={() => {
      apply(addTo(values, draft));
      setDraft("");
    }}
  >
    {t().action.add}
  </button>
</div>

<style lang="scss">
  @use "./shared" as shared;

  .list-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      font-size: var(--text-md);
    }
  }

  .add-row {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  input[type="text"] {
    @include shared.form-control;
  }

  button {
    @include shared.button;

    &.mini {
      padding: 0 0.3rem;
      font-size: var(--text-sm);
    }
  }
</style>
