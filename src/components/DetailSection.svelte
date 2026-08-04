<script lang="ts">
  // One 区画 of the task detail (doc-8 §3), drawn as the placement's assignment table says.
  //
  // The two dispositions are two different elements, because doc-8 §3 makes them two different
  // things rather than two starting points: 常設 is open with no way to close it, 折畳み is closed
  // and openable. 画面設計案 02 draws exactly that difference — a 常設 区画 carries a rule running
  // right from its name and no mark, a 折畳み 区画 carries the 開閉印 and no rule (doc-12 §3) — so
  // the heading says which of the two it is before the user tries to click it.
  //
  // Until TASK-73 both were one `<details>` that differed only in `open`, on the reading that doc-8's
  // "既定で" meant an initial value. The 原文 settles it the other way.
  import type { Snippet } from "svelte";
  import Icon from "../lib/icons/Icon.svelte";
  import { DISCLOSURE_ICON, type Disposition } from "../lib/placement";

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

  // Bound to the element so the 開閉印 can face the way the 区画 actually is, and re-seeded whenever
  // the placement moves this 区画: a placement is a whole set of folds rather than a starting point
  // that decays, so a 折畳み 区画 is 既定で閉じた every time one is chosen (doc-8 §3).
  let open = $state(false);
  $effect(() => {
    open = disposition === "always";
  });
</script>

{#if disposition === "always"}
  <section class="section">
    <h3 class="section-title">
      {title}
      {#if count !== null}
        <span class="count">{count}</span>
      {/if}
    </h3>
    <div class="content">
      {@render children()}
    </div>
  </section>
{:else}
  <details class="section" bind:open>
    <summary class="section-title">
      <!-- 開閉印 (doc-8 §3): いまの状態を指す — chevron-down は開いている区画, chevron-right は
           閉じている区画. 可視の文言を持つ控えの中のアイコン (doc-11 §2.4) なので `aria-label` を
           与えない: 名前は区画名が持っており、開閉は `<summary>` 自身がツリーへ出している. -->
      <Icon name={DISCLOSURE_ICON[open ? "open" : "closed"]} />
      {title}
      {#if count !== null}
        <span class="count">{count}</span>
      {/if}
    </summary>
    <div class="content">
      {@render children()}
    </div>
  </details>
{/if}

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  // 区画見出し (doc-12 §7.1 のトークン). ラテン名だけが大文字になる — 日本語名にこの変換は効かず、
  // doc-8 §3 はそれを体裁の一部として扱う (別扱いの根拠にしない).
  .section-title {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0;
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }

  h3.section-title::after {
    // 区画境界 (doc-12 §3): 区画名の右から幅いっぱいへ伸びる罫線 1 本. 常設区画にだけ引くので、
    // 罫線の有無が開閉印の有無と同じことを述べる — 折畳み区画には引かない.
    content: "";
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  summary.section-title {
    // The UA marker is what TASK-73 replaces; leaving it would print two 開閉印 side by side.
    // Both properties are needed — WebKit answers to the pseudo-element, Chromium to `list-style`.
    list-style: none;
    cursor: pointer;

    &::-webkit-details-marker {
      display: none;
    }
  }

  .count {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: normal;
    text-transform: none;
    opacity: 0.65;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }
</style>
