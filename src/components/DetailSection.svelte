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
    /**
     * 行長上限 を掛ける区画かどうか (doc-8 §2.1, `PROSE_SECTIONS`). Caps the content only, never the
     * heading: the 区画境界 has to keep running to the edge of the 区画 (doc-8 §3), and a rule that
     * stopped where the text did would say the 区画 is narrower than it is.
     */
    prose?: boolean;
    children: Snippet;
  }

  let { title, disposition, count = null, prose = false, children }: Props = $props();

  // Bound to the element so the 開閉印 can face the way the 区画 actually is, and re-seeded whenever
  // the placement moves this 区画: a placement is a whole set of folds rather than a starting point
  // that decays, so a 折畳み 区画 is 既定で閉じた every time one is chosen (doc-8 §3).
  let open = $state(false);
  $effect(() => {
    open = disposition === "always";
  });
</script>

<!-- The 区画名 is an `<h3>` in both branches, so which one a placement chose never decides whether the
     区画 has a heading at all: 実装計画 is a heading in 全面 and would stop being one in 併置. A
     `<summary>` may hold one heading element, which is what lets the 折畳み branch keep it. -->
{#snippet sectionTitle(ruled: boolean)}
  <h3 class="section-title" class:ruled>
    {title}
    {#if count !== null}
      <span class="count">{count}</span>
    {/if}
  </h3>
{/snippet}

{#if disposition === "always"}
  <section class="section">
    {@render sectionTitle(true)}
    <div class="content" class:prose>
      {@render children()}
    </div>
  </section>
{:else}
  <details class="section" bind:open>
    <summary>
      <!-- 開閉印 (doc-8 §3): いまの状態を指す — chevron-down は開いている区画, chevron-right は
           閉じている区画. 可視の文言を持つ控えの中のアイコン (doc-11 §2.4) なので `aria-label` を
           与えない: 名前は区画名が持っており、開閉は `<summary>` 自身がツリーへ出している. -->
      <Icon name={DISCLOSURE_ICON[open ? "open" : "closed"]} />
      {@render sectionTitle(false)}
    </summary>
    <div class="content" class:prose>
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

  .section-title.ruled::after {
    // 区画境界 (doc-12 §3): 区画名の右から幅いっぱいへ伸びる罫線 1 本. 常設区画にだけ引くので、
    // 罫線の有無が開閉印の有無と同じことを述べる — 折畳み区画には引かない.
    content: "";
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  summary {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    // 開閉印 の 1em を決めるのはこの箱で (doc-11 §2.4), 隣の 区画名 と同じ寸法でなければならない —
    // `<h3>` が自分で `.68rem` を取るので、ここを既定のままにすると図形だけ 16px で描かれる.
    font-size: 0.68rem;
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

  // 行長上限 (doc-8 §2.1): 48rem, the 主列 the 中央モーダル already has. Held in `placement.ts` and
  // handed down as a custom property so the number the test reads and the number the browser lays
  // out are the same one. Bites hardest in 全面シングルビュー (956px の主列 → 768px の本文); the
  // 併置サイドバー is under it at 480px and never feels it.
  .content.prose {
    max-width: var(--prose-max-width);
  }
</style>
