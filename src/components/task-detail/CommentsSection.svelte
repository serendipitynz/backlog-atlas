<script lang="ts">
  // TASK-185 の 3 区画のひとつ。読み取りのまま描く理由は `FinalSummarySection.svelte` と同じ。
  import Body from "../Body.svelte";
  import DetailSection from "../DetailSection.svelte";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { Comment } from "../../lib/wire";

  interface Props {
    comments: readonly Comment[];
    layout: PlacementLayout;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let { comments, layout, onopenlink, readimage }: Props = $props();

  const t = messages();
</script>

<DetailSection
  title={t().taskDetail.commentsHeading}
  section="comments"
  {layout}
  count={t().taskDetail.commentCount(comments.length)}
>
  {#if comments.length === 0}
    <p class="neutral">{t().state.none}</p>
  {:else}
    <ul class="comments">
      {#each comments as comment, index (index)}
        <li>
          <!-- author と created は無いことがある (doc-4 §4)。中立表示 で「記録が無い」と述べる —
               欄ごと落とすと、書かれなかったことと読めなかったことが同じ絵になる (doc-11 §6)。 -->
          <p class="comment-head">
            <span class:neutral={comment.author === null}>
              {comment.author ?? t().taskDetail.commentAuthorUnknown}
            </span>
            <span class:neutral={comment.created === null}>
              {comment.created ?? t().taskDetail.commentCreatedUnknown}
            </span>
          </p>
          <Body source={comment.body} {onopenlink} {readimage} />
        </li>
      {/each}
    </ul>
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  // 1 件ずつを面ではなく間隔で分ける — doc-11 §3 のチップ 4 系統にも カード にも当たらないものなので、
  // 枠を与えると 5 つ目の面が現れる。
  .comments {
    @include shared.value-list;

    gap: 0.6rem;
  }

  // author の長さに上限は無い — frontmatter ではなく本文の行だが、決めるのは書き手である。
  // 併置サイドバーの 252px で実測すると、切れずに続く 60 字の author が区画の外へ出た
  // (2026-08-17、WebKit)。**行を増やして受ける** — doc-11 §13 が長さを止めるのは固定帯の中の行で、
  // ここは固定帯ではないので、止める理由がそのままは及ばない。
  .comment-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
