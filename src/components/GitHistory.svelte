<script lang="ts">
  // Git 履歴欄 (doc-8 §5): one task's commit list and the state of its 関連 PR resolution, side by
  // side. Read-only — nothing here writes to the Git repository (doc-8 §5) — and every absence
  // names itself, because "no commit yet", "this root is not a Git repository" and "the Git read
  // failed" call for different actions from the user (decision-6).
  //
  // How much of that is shown depends on the 詳細配置 (doc-8 §5 配置ごとの粒度): 件数のみ, 直近 2 件,
  // or 全件＋関連解決の状態. The narrow placements omit the 関連解決の状態 because it means "今は
  // 確かめられない" rather than "関連が無い" and does not fit one line without being misread — so
  // doc-8 §5 requires them to carry a 導線 to the placement that does show it, which `onexpand` is.
  import {
    commitCountLine,
    commitList,
    relationAvailability,
    relationLine,
    type HistoryState,
  } from "../lib/detail";
  import { RECENT_COMMIT_LIMIT, type HistoryDetail } from "../lib/placement";
  import type { ProjectEntry } from "../lib/wire";

  interface Props {
    history: HistoryState;
    /** The owning ledger entry — its Git remote 有無属性 is what names remote 不在 (decision-6). */
    entry: ProjectEntry | null;
    /** 配置ごとの粒度 (doc-8 §5). */
    detail: HistoryDetail;
    /** Go to 全面シングルビュー, where the full list and the 関連解決の状態 are. `null` when there. */
    onexpand: (() => void) | null;
    onreload: () => void;
  }

  let { history, entry, detail, onexpand, onreload }: Props = $props();

  let commits = $derived(commitList(history));
  let relation = $derived(relationAvailability(entry, history));
  let countLine = $derived(commitCountLine(commits));
  let relationSummary = $derived(relationLine(relation));
  /** 直近 2 件 (doc-8 §5) — and how many the placement is not showing. */
  let shown = $derived(
    commits.state === "commits" && detail === "recent"
      ? commits.commits.slice(0, RECENT_COMMIT_LIMIT)
      : commits.state === "commits"
        ? commits.commits
        : [],
  );
  let remaining = $derived(commits.state === "commits" ? commits.commits.length - shown.length : 0);

  /** Author date is strict ISO 8601 (doc-6 §3); show it without inventing a timezone for it. */
  function day(date: string): string {
    return date.slice(0, 10);
  }
</script>

<div class="git">
  <!-- No heading of its own: this is the body of the Git 履歴欄 区画, and `DetailSection` already
       names it — a second heading would put the same words twice, once foldable and once not. -->
  <div class="tools">
    <button type="button" onclick={onreload} disabled={history.state === "loading"}>
      再取得
    </button>
  </div>

  {#if detail === "count"}
    <!-- 件数のみ (doc-8 §5 併置サイドバー). The two lines keep their own family (decision-6): a
         narrower placement narrows the text, never the distinction between the kinds of absence. -->
    <p class={countLine.kind}>{countLine.text}</p>
    <p class={relationSummary.kind}>{relationSummary.text}</p>
  {:else}
    {#if shown.length > 0}
      <ol class="commits">
        {#each shown as commit (commit.id)}
          <li>
            <span class="sha">{commit.shortId}</span>
            <span class="summary">{commit.summary}</span>
            <span class="meta">{day(commit.date)} / {commit.author}</span>
          </li>
        {/each}
      </ol>
      {#if remaining > 0}
        <p class="neutral">ほか {remaining} 件（全件は全面シングルビューで読めます）</p>
      {/if}
    {:else if commits.state === "noCommits"}
      <!-- コミット該当なし is a normal state (未着手・未コミット), so it is neutral, not an error
           (decision-6 エラー提示方針). -->
      <p class="neutral">対応コミット無し（このリポジトリに TASK-ID を含むコミットがありません）</p>
    {:else if commits.state === "noRepository"}
      <p class="setting">
        Git 対象不在: {commits.projectRoot} は Git リポジトリではないため、ローカル履歴も関連解決も出せません。
      </p>
    {:else if commits.state === "unreadable"}
      <p class="failure">Git 履歴を読めません: {commits.detail}</p>
    {:else if commits.state === "noTaskId"}
      <p class="setting">TASK-ID が読めないため、コミット検索の鍵がありません（doc-6 §3）。</p>
    {:else}
      <p class="neutral">読み込み中…</p>
    {/if}

    {#if detail === "full"}
      <div class="relation">
        <!-- Only the *state* of 関連解決 belongs here. The Pull Requests themselves are the Pull
             Request 区画's (doc-8 §4), which doc-8 §5 keeps independent of the commit list whenever the
             relation cannot be resolved — repeating the URLs here would make it look like a resolved
             pairing. -->
        <h4>関連 Pull Request</h4>
        {#if relation.state === "hostDetermined"}
          <!-- The gate doc-6 §5/§6 puts on 関連解決 is open, but no host reference means exists in this
               build — doc-6 §6 leaves each host's API to a per-kind addition. Saying so is required:
               an empty relation list would read as "resolved, no shared commit". -->
          <p class="neutral">
            remote ホスト判別済み（{relation.host}）。関連解決の参照手段は未実装のため、コミット一覧と
            Pull Request は各々独立に表示しています（doc-6 §6）。
          </p>
        {:else if relation.state === "remoteAbsent"}
          <p class="setting">
            Git remote 不在（台帳の Git remote 有無属性が偽）のため関連解決なし。ローカルコミット履歴は
            上のとおり表示します。台帳の設定で解消できます。
          </p>
        {:else if relation.state === "hostUndetermined"}
          <p class="setting">
            remote ホスト種別を判別できないため関連解決の対象外です（未対応ホスト、または remote を
            読めません）。
          </p>
        {:else if relation.state === "notRead"}
          <p class="setting">関連解決は未実施です（{relation.detail}）。</p>
        {:else}
          <p class="neutral">読み込み中…</p>
        {/if}
      </div>
    {:else}
      <p class={relationSummary.kind}>{relationSummary.text}</p>
    {/if}
  {/if}

  {#if onexpand !== null}
    <!-- 省いた配置には、全面で読める旨の導線を必ず添える (doc-8 §5). Always offered from the two
         narrow placements, including when there is nothing to expand: what the full view adds is the
         関連解決の状態, which exists even for a task with no commits. -->
    <p>
      <button type="button" class="expand" onclick={onexpand}>
        全面シングルビューで全件と関連解決の状態を読む
      </button>
    </p>
  {/if}
</div>

<style lang="scss">
  .git {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .tools {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  button {
    padding: 0 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  .commits {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.4rem;
      font-size: 0.72rem;
    }
  }

  .sha {
    font-family: ui-monospace, monospace;
    opacity: 0.8;
  }

  .summary {
    flex: 1;
    min-width: 8rem;
  }

  .meta {
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .relation {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;

    h4 {
      margin: 0.2rem 0 0;
      font-size: 0.72rem;
      opacity: 0.8;
    }
  }

  p {
    margin: 0;
    font-size: 0.72rem;
  }

  // 正常な不在は中立、設定・未設定は中間、失敗はエラー (decision-6 エラー提示方針). The families are
  // `lib/mark.ts` の MarkKind: `neutral` and `setting` deliberately carry no hue — a colour would
  // contradict "これは正常" and "設定で解消できる" — and only the failure takes one.
  .neutral {
    opacity: 0.7;
  }

  .setting {
    padding: 0.2rem 0.35rem;
    border-left: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    background: color-mix(in srgb, canvastext 4%, transparent);
  }

  .failure {
    color: var(--mark-unreadable);
  }
</style>
