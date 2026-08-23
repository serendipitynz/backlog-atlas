<script lang="ts">
  // 見出しの操作が述べる文 (doc-8 §3, doc-11 §5): drawn *below* the 見出し rather than inside it. Every
  // one of these appears and disappears — a 既定 write that was refused, an end-of-cell move, an id that
  // cannot be built, the result of a copy, a file that left the read — so inside the 固定 band each of
  // them would grow it, and the failed-copy one would grow it and stay. The band is the three rows
  // doc-12 §3 transcribed and nothing else; height it takes is height the body never gets back.
  // Adjacency is what doc-11 §5 actually asks for (a reason readable without hovering), and these sit
  // immediately under the controls they speak for.
  import { crossIdUnavailable } from "../../lib/detail";
  import { fileMissingReason } from "../../lib/edit";
  import { messages } from "../../lib/messages-context";
  import { noLaneCellReason } from "../../lib/swimlane";
  import type { CopyNotice } from "./Heading.svelte";

  interface Props {
    /** Why the last 配置切替 could not be stored as the 既定 (doc-8 §2.2), or `null`. */
    persistenceNote: string | null;
    /** The grid is not showing this task at all, so 前後移動 has no cell to step in. */
    noNeighbours: boolean;
    /** 横断タスクID が組めない (doc-4 §5)。 */
    crossIdMissing: boolean;
    copyNotice: CopyNotice | null;
    /** Whether the copy is holding or fading its 成功 state (doc-8 §2.2 の 2 段)。 */
    copied: boolean;
    /** The file left the read result while the panel was open (doc-8 §6.4). */
    missing: boolean;
  }

  let { persistenceNote, noNeighbours, crossIdMissing, copyNotice, copied, missing }: Props =
    $props();

  const t = messages();
</script>

<div class="heading-notes">
  {#if persistenceNote !== null}
    <p class="hint">{persistenceNote}</p>
  {/if}
  {#if noNeighbours}
    <!-- 無効化提示 (doc-11 §5): the reason sits beside the control, not only in a tooltip. -->
    <p class="hint">{noLaneCellReason()}</p>
  {/if}
  {#if crossIdMissing}
    <p class="hint">{crossIdUnavailable()}</p>
  {/if}
  <!-- 成功・失敗を述べる語 (doc-11 §2.4, TASK-72). A live region because the control's own name must
       not change under the user: the figure and the 成功色 reach the eye, and this is what reaches
       the ear. `role="status"` — polite — so it waits for a pause rather than cutting in on whatever
       is being read; the copy has already happened either way. Always in the tree, empty when there is
       nothing to say: a region inserted at the moment it fills is not reliably announced. -->
  <div
    role="status"
    aria-live="polite"
    class="live"
    class:unseen={copyNotice?.state !== "failed"}
  >
    {#if copied}
      <p class="ok">{t().taskDetail.copied}</p>
    {:else if copyNotice !== null && copyNotice.state === "failed"}
      <p class="warn">
        {t().taskDetail.copyFailed}
        <input type="text" readonly value={copyNotice.text} aria-label={t().taskDetail.crossIdLabel} />
      </p>
    {/if}
  </div>
  {#if missing}
    <!-- doc-8 §6.4: an external move does not get to take the 未保存入力 with it. The panel
         stays up showing the last read that resolved, so the input can be copied out before it
         is discarded on purpose. -->
    <p class="warn">{fileMissingReason()}</p>
  {/if}
</div>

<style lang="scss">
  @use "./shared" as shared;

  /*
   * 見出しが述べる文の置き場: 固定帯のすぐ下、本文より前。
   *
   * `display: contents` so the group itself lays nothing out: its children become items of the panel's
   * own column and take that column's spacing, and — when there is nothing to say — this subtree
   * contributes no box at all. A wrapper with its own box would spend one of the panel's `gap`s
   * whether or not it had anything in it.
   */
  .heading-notes {
    display: contents;
  }

  /*
   * 成功の語は読み上げにだけ残す (doc-11 §2.4)。The figure already says it to the eye — `clipboard`
   * becomes `clipboard-check` and takes the 成功色 — so a sentence repeating that is one the sighted
   * reader has to read past every time they copy an id. What it must not do is disappear from the
   * accessibility tree, because the tree is the *only* place the result exists for a screen reader:
   * `aria-label` stays fixed on the button by doc-11 §2.4, and a figure announces nothing.
   *
   * Hence visually hidden rather than `display: none` or a removed element. Both of those take it out
   * of the tree, and an unmounted region announces nothing when it fills, which is the whole reason it
   * is kept mounted. Out of flow as well, so a silent round spends none of the panel's `gap`.
   *
   * The failure notice is not covered by this: it carries the id as selectable text, which is the only
   * way left to copy it, and no figure says that. It stays visible — which is why the class is driven
   * by the failure state rather than by "is there anything to say".
   */
  .unseen {
    @include shared.unseen;
  }

  input[type="text"] {
    @include shared.form-control;
  }

  p {
    @include shared.paragraph;
  }

  .hint {
    @include shared.hint;
  }

  .ok {
    @include shared.ok;
  }

  .warn {
    @include shared.warn;
  }
</style>
