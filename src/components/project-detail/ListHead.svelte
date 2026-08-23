<script lang="ts">
  // 一覧見出し行 (doc-10 §1, TASK-117). One component for the 一覧列 that have a 作成の入口, because
  // §1 makes the row a property of the column rather than of any one 区画 — written out per 区画,
  // they would start to differ in exactly the way §1 rules out. What each 区画 supplies is its own
  // wording. **決定事項区画 does not use this**: it has nothing to add to its list, so §1 leaves it
  // the heading alone and this row's second half has no subject there.
  //
  // The 作成の入口 is never withheld: it issues nothing, and the reason a 作成 cannot be issued
  // right now (CLI 縮退, a write in flight) is printed beside the 発行 control inside the layer,
  // which is where it can actually be read.
  import Icon from "../../lib/icons/Icon.svelte";

  interface Props {
    /** 件数を含む見出しの語。区画ごとに違うのはこの文だけである。 */
    count: string;
    /** 作成の入口 の語。 */
    entry: string;
    hint: string;
    onopen: () => void;
  }

  let { count, entry, hint, onopen }: Props = $props();
</script>

<div class="list-head">
  <h2>{count}</h2>
  <!-- 可視の文言を持つ控えの中のアイコン (doc-11 §2.4): the wording is the button's name, so the
       figure takes no `aria-label` of its own and adds nothing to the accessibility tree. -->
  <button type="button" class="create-entry" title={hint} onclick={onopen}>
    <Icon name="plus" />
    {entry}
  </button>
</div>

<style lang="scss">
  @use "./shared" as shared;

  .list-head {
    @include shared.list-head;

    h2 {
      @include shared.heading-2;
      @include shared.list-head-heading;
    }
  }

  /*
   * 作成の入口 (doc-10 §1). A 控え with visible wording *and* a figure, which is doc-11 §2.4's
   * 可視の文言を持つ控えの中のアイコン — so the figure is `aria-hidden` and adds no name.
   *
   * `font-size` is what sizes the ＋ (doc-11 §2.4 の 1em), so the figure follows the wording rather
   * than carrying a second size knob of its own.
   */
  .create-entry {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line-strong);
    // カード・ボタン 4px (doc-11 §2.2).
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-md);
    white-space: nowrap;
    cursor: pointer;

    // hover は 枠線 --line → --line-strong (doc-11 §2.3); at rest this one is already the stronger
    // line, so the change is the background wash the other 控え use.
    &:hover {
      background: color-mix(in srgb, var(--fg) 8%, transparent);
    }

    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }
</style>
