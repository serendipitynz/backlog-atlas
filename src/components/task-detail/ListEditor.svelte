<script lang="ts">
  // 一覧の編集 (doc-5 §3.1): 4 つの区画 (assignee・通常ラベル・dependencies・References) が同じ形で
  // 使う。行ごとの 削除 と、末尾の 1 件追加だけを持つ — どの一覧も CLI 側は集合の全置換なので、
  // 並べ替えも部分更新もこの控えの外にある。
  //
  // 値は親の 編集セッション が持つ。ここは受け取った配列と下書き文字列を描き、押されたときに次の値を
  // 親へ渡すだけである — 区画切替や折畳みでこの要素が消えても入力が残るのは、それが理由である。
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

<!-- 削除 は最後の 1 件も外せる: `--clear-refs`・`--clear-deps`・`-a ""` が空集合化を行う
     (doc-5 §3.1, TASK-153). 無効化と理由文はこの版で無くなった区画である. -->
<ul class="list-edit">
  {#each values as value, index (index)}
    <li>
      <span class="url">{value}</span>
      <button
        type="button"
        class="mini"
        title={t().action.remove}
        onclick={() => apply(values.filter((_, at) => at !== index))}
      >
        {t().action.remove}
      </button>
    </li>
  {/each}
</ul>
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
    @include shared.value-list;

    li {
      @include shared.inline-row;
    }
  }

  .url {
    @include shared.url;
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
</style>
