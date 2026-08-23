<script lang="ts">
  // 外部エディタ経路 (doc-8 §7). Atlas starts the editor and writes nothing; the editor's save comes
  // back through the file watch (doc-9 §3), so nothing here waits for it to close. Offered for every
  // 保存区分 and independently of the CLI probe: this is where doc-8 §6.5 and doc-5 §3.1 send the
  // edits Atlas itself cannot issue.
  import DetailSection from "../DetailSection.svelte";
  import { confirmMarkedLabel } from "../../lib/edit";
  import {
    frontmatterNotice,
    needsConfirmation,
    rereadRootLabel,
    unsavedInputWarning,
    watchStoppedNote,
    type EditorOffer,
  } from "../../lib/external-editor";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    /** 管理ファイルのパス (doc-8 §7)。画面でこれを出しているのはここだけである。 */
    sourcePath: string;
    offers: readonly EditorOffer[];
    /** 継続検出 が止まっている (doc-9 §3.1)。起動より前に述べ、読み直しを添える。 */
    watchStopped: boolean;
    /** 編集セッション が未保存入力を持つ。二重取り込みの回避 (doc-8 §6.4)。 */
    dirty: boolean;
    /** 直近の起動の結果、または `null`。開いているタスクのものだけが渡る。 */
    notice:
      | { state: "launched"; summary: string }
      | { state: "deferred" | "failed"; detail: string }
      | null;
    onreread: () => void;
    onopen: (offer: EditorOffer, control: HTMLButtonElement) => void;
    layout: PlacementLayout;
  }

  let { sourcePath, offers, watchStopped, dirty, notice, onreread, onopen, layout }: Props =
    $props();

  const t = messages();

  /** The 保留理由, or the caveat that stands while the route is open. */
  function note(offer: EditorOffer): string | null {
    return offer.availability.state === "withheld" ? offer.availability.reason : offer.caveat;
  }
</script>

<DetailSection title={t().taskDetail.externalEditorHeading} section="transitions" {layout}>
  <!-- 管理ファイルのパス (doc-8 §7): 見出しから移した (TASK-72). 開く操作の隣がパスの置き場である —
       何を開こうとしているのかは押す前に読めていなければならない。画面でこのパスを出しているのは
       ここだけなので、不整合や外部変更の切り分けでファイルを特定する手掛かりもここにある。 -->
  <p class="path">{sourcePath}</p>
  <!-- 開く前に示す (doc-8 §7 難点と受け方): the frontmatter is exposed and the CLI's schema checking
       is bypassed, so this is stated before a launch rather than after a degraded read. -->
  <p class="warn">{frontmatterNotice()}</p>
  {#if watchStopped}
    <!-- 継続検出が止まっている場合の書き戻し (doc-8 §7): said before the launch, with the re-read
         that is the only thing which will bring the edit back. -->
    <p class="warn">{watchStoppedNote()}</p>
    <p><button type="button" class="mini" onclick={onreread}>{rereadRootLabel()}</button></p>
  {/if}
  {#if dirty}
    <!-- 二重取り込みの回避 (doc-8 §6.4): stated here, and the launch asks before it starts
         (doc-11 §12) with this same text as the question. The input is not discarded either way. -->
    <p class="warn">{unsavedInputWarning()}</p>
  {/if}
  <ul class="editor-list">
    {#each offers as offer (offer.method)}
      <li>
        <button
          type="button"
          disabled={offer.availability.state === "withheld"}
          title={note(offer) ?? offer.command}
          onclick={(event) => onopen(offer, event.currentTarget)}
        >
          <!-- 語尾の … only while the launch asks (doc-11 §12): the question is raised by 未保存入力,
               and a mark left on when nothing will be asked predicts nothing. -->
          {needsConfirmation(dirty) ? confirmMarkedLabel(offer.label) : offer.label}
        </button>
        <span class="effect">{offer.availability.state === "ready" ? offer.command : ""}</span>
        {#if note(offer) !== null}
          <span class="effect">{note(offer)}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if notice !== null && notice.state === "launched"}
    <p class="ok">{notice.summary}</p>
  {:else if notice !== null}
    <!-- `deferred` and `failed` both read as "not opened, and here is why"; the notice above says
         what to do next in either case. -->
    <p class="warn">{notice.detail}</p>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .editor-list {
    @include shared.value-list;

    li {
      @include shared.inline-row;
    }
  }

  .effect {
    @include shared.effect;
  }

  .path {
    word-break: break-all;
    opacity: 0.7;
  }

  button {
    @include shared.button;
  }

  button.mini {
    @include shared.button-mini;
  }

  p {
    @include shared.paragraph;
  }

  .ok {
    @include shared.ok;
  }

  .warn {
    @include shared.warn;
  }
</style>
