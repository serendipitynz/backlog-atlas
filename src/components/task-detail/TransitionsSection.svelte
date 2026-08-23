<script lang="ts">
  // 状態遷移・外部エディタ は doc-8 §3 の 1 行であり、同じ割当（3 配置とも折畳み。既定は併置・モーダルで
  // 閉、全面で開）で動く。2 つのコンポーネントに分けてあるのは操作の系統が違うためで、開き方は
  // 1 つの規則に従う — 親がこの 2 つを 1 区画として並べる。
  import DetailSection from "../DetailSection.svelte";
  import { confirmMarkedLabel, type TransitionOffer, type TransitionOffers } from "../../lib/edit";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    transitions: TransitionOffers;
    /** 発行中。全ての遷移が同じ理由で押せない (doc-11 §5)。 */
    busy: boolean;
    /** 実行前確認 (doc-11 §12) を通して発行する。層はシェルのものなので、押下はここで完結しない。 */
    onrun: (offer: TransitionOffer, control: HTMLButtonElement) => void;
    layout: PlacementLayout;
  }

  let { transitions, busy, onrun, layout }: Props = $props();

  const t = messages();

  /** Why every 状態遷移 is withheld while one is in flight (doc-11 §5: 理由の無い無効化を残さない). */
  const busyReason = (): string => t().taskDetail.transitionBusy;

  /**
   * What the 状態遷移 row says beside its control: the 保留理由 while it is withheld, and what the
   * transition would do while it is not. One place, because the same string is the `title` and the
   * line under the button — and reading it off `availability` keeps the sentence and the withholding
   * from being able to disagree (doc-11 §5).
   */
  function note(offer: TransitionOffer): string {
    return offer.availability.state === "withheld" ? offer.availability.reason : offer.effect;
  }
</script>

<DetailSection title={t().taskDetail.transitionsHeading} section="transitions" {layout}>
  {#if transitions.state === "none"}
    <!-- 提供しない理由であって不在ではない (doc-11 §5): 空表示の弱 (`--faint`) で描くと、読ませたい
         理由が一番読みにくい文字になる。 -->
    <p class="withheld-reason">{transitions.reason}</p>
  {:else}
    {#if busy}
      <!-- 発行中は全ての遷移が同じ理由で押せない (doc-11 §5): the offers' own reasons say nothing about
           it, so it is stated once for the list rather than left to each button's `title`. -->
      <p class="hint">{busyReason()}</p>
    {/if}
    <ul class="transition-list">
      {#each transitions.offers as offer (offer.kind)}
        <li>
          <button
            type="button"
            class="transition"
            disabled={offer.availability.state === "withheld" || busy}
            title={busy ? busyReason() : note(offer)}
            onclick={(event) => onrun(offer, event.currentTarget)}
          >
            <!-- 語尾の … (doc-11 §12): every 状態遷移 asks first, so the mark is unconditional here. -->
            {confirmMarkedLabel(offer.label)}
          </button>
          <span class="effect">{note(offer)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .transition-list {
    @include shared.value-list;

    li {
      @include shared.inline-row;
    }
  }

  .effect {
    @include shared.effect;
  }

  button {
    @include shared.button;
  }

  p {
    @include shared.paragraph;
  }

  // 正常な不在の 弱 ではなく 副次 (doc-11 §2.1): 提供しない理由であって不在ではないので、
  // 読ませたい文が一番読みにくい文字になってはいけない。
  .withheld-reason {
    color: var(--muted);
  }

  .hint {
    @include shared.hint;
  }
</style>
