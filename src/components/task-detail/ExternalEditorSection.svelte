<script lang="ts">
  // 外部エディタ経路 (doc-8 §7) の区画に残った 2 つ (decision-45 §8). **起動の控えは 1 つも無い** —
  // 行は ☰ の 外部で開く へ移った (doc-7 §2.1)。残るのは、押す前に何を開くかを読む場所と、
  // 継続検出 が止まっている間だけ出る再読込である。どちらも doc-8 §7 自身の要件で、あちらが
  // 「戻ってきたときに読み直せる」を対象を選んでいる画面に求めている。
  import DetailSection from "../DetailSection.svelte";
  import { rereadRootLabel, watchStoppedNote } from "../../lib/external-editor";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    /** 管理ファイルのパス (doc-8 §7)。この画面でこれを出しているのはここだけである。 */
    sourcePath: string;
    /** 継続検出 が止まっている (doc-9 §3.1)。止まっている間だけ再読込を出す。 */
    watchStopped: boolean;
    onreread: () => void;
    layout: PlacementLayout;
  }

  let { sourcePath, watchStopped, onreread, layout }: Props = $props();

  const t = messages();
</script>

<DetailSection title={t().taskDetail.externalEditorHeading} section="transitions" {layout}>
  <!-- 管理ファイルのパス (doc-8 §7): 見出しから移した (TASK-72)。押す前に何を開くかを読む場所が
       ここだからである — 2026-08-25 に理由がそう改まった (decision-45 §8)。起動の控えがメニューへ
       移ったので隣に開く操作はもう無いが、読む必要は消えていない。画面でこのパスを出しているのは
       ここだけなので、不整合や外部変更の切り分けでファイルを特定する手掛かりもここにある。 -->
  <p class="path">{sourcePath}</p>
  {#if watchStopped}
    <!-- 継続検出が止まっている場合の書き戻し (doc-8 §7): the re-read is the only thing which will
         bring the edit back. **注意文そのものはサブメニューが出す** (decision-45 §9) — こちらは
         タスクを開いていないと読めないので、4 種のうち 1 種にしか届かない。 -->
    <p class="warn">{watchStoppedNote()}</p>
    <p><button type="button" class="mini" onclick={onreread}>{rereadRootLabel()}</button></p>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .path {
    word-break: break-all;
    opacity: 0.7;
  }

  button.mini {
    @include shared.button-mini;
  }

  p {
    @include shared.paragraph;
  }

  .warn {
    @include shared.warn;
  }
</style>
