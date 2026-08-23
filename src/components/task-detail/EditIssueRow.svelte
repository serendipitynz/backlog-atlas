<script lang="ts">
  // 発行の行 (doc-11 §11): the 編集セッション is the only 発行 the panel holds and the panel scrolls,
  // so the row pins to its bottom. Inside it goes what has to be read *before* the press — the reason
  // 保存 is withheld, and the chord that runs it. The result of the press does not: a save that lands
  // ends the session (doc-8 §6.3), so a sentence in this row would go down with the row. Those stay in
  // the 編集卓 (`EditConsole.svelte`), which is drawn whether or not a session is open.
  import type { SaveAvailability } from "../../lib/edit";
  import { omitsSentence } from "../../lib/manage";
  import { messages } from "../../lib/messages-context";
  import { MAC_KEYBOARD } from "../../lib/platform";
  import { ariaKeyShortcuts, shortcutHint } from "../../lib/shortcuts";

  interface Props {
    /** One decision for the save control's enabled state and its reason (doc-5 §5). */
    gate: SaveAvailability;
    /** 発行中。控えの語が 保存中 になる。 */
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }

  let { gate, busy, onsave, oncancel }: Props = $props();

  const t = messages();

  /** The reason element — named so `aria-describedby` can point at it (doc-11 §5). */
  const REASON_ID = "task-detail-save-reason";
</script>

<div class="issue">
  <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because `aria-describedby` points at
       it; printed unless the reason is one §8 licences the screen to leave unsaid. 変更はまだありません
       is such a reason (licence ②: the form itself says what to do next), so the row stays quiet
       until there is something to say. The chord's 併記 is not here at all any more — doc-7 §2.1
       takes `title` and `aria-keyshortcuts` plus the キーボード操作一覧 as discharging it. -->
  <span
    class="hint"
    id={REASON_ID}
    class:unseen={gate.state === "ready" || omitsSentence(gate.reason)}
  >
    {gate.state === "ready" ? "" : gate.reason}
  </span>
  <div class="issue-actions">
    <!-- 取りやめ → 発行 (doc-11 §11). -->
    <button type="button" onclick={oncancel}>{t().action.cancel}</button>
    <!-- `aria-disabled` rather than `disabled`: this control's 保留理由 are of both kinds (doc-11 §8)
         — 発行中 and ファイルが無い are caused from outside the form and keep a printed line, 変更は
         まだありません is licensed away — and one control may not take focus or not depending on why
         it is withheld. The panel's `save()` holds the same gate, so a press while withheld issues
         nothing. -->
    <button
      type="button"
      class="primary"
      aria-disabled={gate.state !== "ready"}
      aria-describedby={gate.state === "ready" ? undefined : REASON_ID}
      aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
      title={gate.state === "ready"
        ? t().taskDetail.saveWithChord(shortcutHint("saveEditSession", MAC_KEYBOARD))
        : gate.reason}
      onclick={onsave}
    >
      {busy ? t().action.saving : t().action.save}
    </button>
  </div>
</div>

<style lang="scss">
  @use "./shared" as shared;

  /*
   * 発行の行 (doc-11 §11), pinned against the same box the 見出し band pins against — `.detail` is the
   * scroll container in all three placements, so one rule covers them. The sideways pull-out and the
   * opaque background are the band's requirements read the other way up: a transparent pinned row is
   * one the body scrolls *through*, and a row that stops at the panel's padding leaves a strip of
   * text showing beside it.
   *
   * Unlike the band, this row may grow: the withheld reason is a sentence of unknown length. That is
   * affordable here and was not there — the band takes its height off the top of the body permanently,
   * while this row stands only during a session and is what the session is being read for.
   */
  .issue {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 calc(var(--panel-padding) * -1);
    padding: 0.45rem var(--panel-padding) 0.5rem;
    border-top: 1px solid var(--line);
    background: var(--panel);

    .hint {
      margin: 0;
      text-align: center;
      font-size: var(--text-sm);
    }
  }

  .issue-actions {
    display: flex;
    // 行の中で中央 (doc-11 §11).
    justify-content: center;
    gap: 0.3rem;
  }

  // 保留理由 の行は 弱 (`--muted` ではなく 0.65) を取る — 分割前は `.issue .hint` の隣に
  // `.hint` の地が居て、そこから opacity が来ていた。`.issue .hint` は margin と揃えだけを持つので、
  // この 1 つを落とすと理由の行が本文と同じ濃さで立つ (TASK-106 の実測で 0.65 → 1 と出た)。
  .hint {
    @include shared.hint;
  }

  /*
   * doc-11 §8 licences the screen not to *print* 変更はまだありません, and doc-11 §5 keeps it reachable
   * all the same, because 保存 points at it with `aria-describedby`.
   */
  .unseen {
    @include shared.unseen;
  }

  button {
    @include shared.button;
  }

  button.primary {
    @include shared.button-primary;
  }
</style>
