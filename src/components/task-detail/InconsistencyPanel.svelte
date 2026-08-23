<script lang="ts">
  // 不整合区画 (decision-22, doc-8 §3): 3 配置とも常設で、折り畳めない。折畳みへ落とすと問題のある
  // タスクが正常に見えるためであり（doc-8 §3）、それは開閉できる折畳みでも「前のタスクで閉じた状態」が
  // 引き継がれる形で起こりうる。**理由行だけを並べ、族名も総称も行には出さない** — 何件あるかと
  // 「不整合である」ことは、区画が在ることと見出しの ⚠️ が既に述べている。
  import Icon from "../../lib/icons/Icon.svelte";
  import { messages } from "../../lib/messages-context";
  import { DISCLOSURE_ICON } from "../../lib/placement";
  import type { UnknownSection } from "../../lib/wire";

  interface Props {
    /** 不整合の理由行 (decision-22)。カード・見出し・この区画は同じ derivation から出る。 */
    reasons: readonly string[];
    unknownSections: readonly UnknownSection[];
  }

  let { reasons, unknownSections }: Props = $props();

  const t = messages();
</script>

<!-- 条件は理由行の有無だけである。未知セクションは読み取り層が想定外スキーマとして記録する
     (`domain.rs` の `UnknownSection`) ので、それを持つタスクは必ず理由行を持つ — `||` で足すと、
     ⚠️ の無いタスクに「⚠️ 不整合」の見出しを描く枝ができる。 -->
{#if reasons.length > 0}
  <section class="inconsistency-panel">
    <h3>
      <span class="glyph"><Icon name="triangle-alert" /></span>
      {t().taskDetail.inconsistentHeading}
    </h3>
    {#each reasons as reason, index (index)}
      <p>{reason}</p>
    {/each}
    <!-- 未知セクション は区画ではなく不整合区画の中の項目だが、開閉の記号は折畳み区画に揃える
         (doc-8 §3) — 同じ面の中で UA 既定マーカーと 開閉印 が並ぶと、同じ操作が 2 通りの記号で
         出ることになる。向きは `[open]` から CSS で選ぶ: 開いているかを持つのは要素自身で、
         それを写した変数を別に置くと、タスクを移った先の別のセクションへ前の開閉が付く
         (この一覧の鍵は index であり、節の名前ではない)。 -->
    {#each unknownSections as section, index (index)}
      <details class="unknown">
        <summary>
          <!-- `mark` ではない: そのクラスは 状態の印 チップ (doc-11 §3) が取っており、
               開閉印はその 4 系統のどれでもない。 -->
          <span class="disclosure closed"><Icon name={DISCLOSURE_ICON.closed} /></span>
          <span class="disclosure open"><Icon name={DISCLOSURE_ICON.open} /></span>
          {t().taskDetail.unknownSection(section.name)}
        </summary>
        <pre class="body">{section.body}</pre>
      </details>
    {/each}
  </section>
{/if}

<style lang="scss">
  @use "./shared" as shared;

  section {
    @include shared.section;
  }

  // 不整合区画 (decision-22). 面の左端の 3px は残る — doc-11 §2.3 の 問題の縁 のうち外れたのは
  // カードの側だけで、こちらは区画そのものが何の区画かを述べている（カードでは ⚠️ がそれを述べる）。
  .inconsistency-panel {
    padding: 0.35rem 0.45rem;
    border-left: 3px solid var(--mark-inconsistent);
    background: color-mix(in srgb, var(--mark-inconsistent) 10%, transparent);

    // 区画見出しの中の 印グリフ (decision-22): 見出しの語と同じ色で、同じ 1em に従う。
    h3 {
      margin: 0;
      font-size: var(--text-lg);
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--mark-inconsistent);
    }

    .glyph {
      display: inline-flex;
    }

    details {
      font-size: var(--text-md);
    }
  }

  .unknown {
    summary {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      // 開閉印 が UA 既定マーカーの代わりに立つ (doc-8 §3). WebKit は擬似要素、Chromium は
      // `list-style` に答えるので、両方を書かないと片方の webview で記号が 2 つ出る。
      list-style: none;
      cursor: pointer;

      &::-webkit-details-marker {
        display: none;
      }
    }

    .disclosure.open {
      display: none;
    }

    &[open] .disclosure.open {
      display: block;
    }

    &[open] .disclosure.closed {
      display: none;
    }
  }

  .body {
    margin: 0;
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);
    font-family: inherit;
    font-size: var(--text-md);
    line-height: 1.5;
    // Long lines wrap instead of scrolling the panel sideways; newlines are kept as written.
    white-space: pre-wrap;
    word-break: break-word;
  }

  p {
    @include shared.paragraph;
  }
</style>
