<script lang="ts">
  // Git 履歴欄 (doc-8 §5): one task's commit list and the state of its 関連 PR resolution, side by
  // side. Read-only — nothing here writes to the Git repository (doc-8 §5) — and every absence
  // names itself, because "no commit yet", "this root is not a Git repository" and "the Git read
  // failed" call for different actions from the user (decision-6).
  //
  // How much of that is shown depends on the 詳細配置 (doc-8 §5 配置ごとの粒度): 件数のみ, 直近 2 件,
  // or 全件＋関連解決の状態. What the two narrow placements leave out is the *per-cause account*, not
  // the state itself — the state means "今は確かめられない" rather than "関連が無い", so hiding it
  // altogether is what would be misread (doc-8 §5). They therefore state it in one line and carry the
  // 導線 to the placement that writes each cause out, which `onexpand` is.
  import {
    commitCountLine,
    commitList,
    pullRequestsByCommit,
    relationAccounts,
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
  let relationSummary = $derived(relationLine(relation, history));
  /** 各コミットに関連 Pull Request を紐づけて示す (doc-8 §5). */
  let relatedPrs = $derived(pullRequestsByCommit(history));
  let accounts = $derived(relationAccounts(history));

  /**
   * A Pull Request's short name for a commit row. The full URL is the Pull Request 区画's (doc-8 §4);
   * repeating it under every commit would crowd the list out of the narrow placements.
   */
  function prLabel(url: string): string {
    const number = url.match(/\/(?:pull|pull-requests)\/(\d+)/)?.[1];
    return number === undefined ? url : `#${number}`;
  }
  /** 直近 2 件 (doc-8 §5) — and how many the placement is not showing. */
  let shown = $derived(
    commits.state === "commits" && detail === "recent"
      ? commits.commits.slice(0, RECENT_COMMIT_LIMIT)
      : commits.state === "commits"
        ? commits.commits
        : [],
  );
  let remaining = $derived(commits.state === "commits" ? commits.commits.length - shown.length : 0);
  /**
   * なぜ再取得が押せないか、押せないときだけ (doc-11 §5). One value for both the withheld state and the
   * sentence beside the button: derived apart, a control can end up blocked with nothing said about it.
   */
  let reloadBlocked = $derived(history.state === "loading" ? "取得中です" : null);

  /** Author date is strict ISO 8601 (doc-6 §3); show it without inventing a timezone for it. */
  function day(date: string): string {
    return date.slice(0, 10);
  }
</script>

<div class="git">
  <!-- No heading of its own: this is the body of the Git 履歴欄 区画, and `DetailSection` already
       names it — a second heading would put the same words twice, once foldable and once not. -->
  <div class="tools">
    <button
      type="button"
      onclick={onreload}
      disabled={reloadBlocked !== null}
      title={reloadBlocked ?? "Git 履歴を取り直します"}
    >
      再取得
    </button>
    <!-- 無効化の理由を常時表示で添える (doc-11 §5): a disabled button takes no focus, so a `title` would
         leave the reason out of reach from the keyboard and from a screen reader. -->
    {#if reloadBlocked !== null}
      <span class="reason">{reloadBlocked}。完了するまで再取得はできません。</span>
    {/if}
  </div>

  {#if detail === "count"}
    <!-- 件数のみ (doc-8 §5 併置サイドバー). The two lines keep their own family (decision-6): a
         narrower placement narrows the text, never the distinction between the kinds of absence. -->
    <p class={countLine.kind} class:absence={commits.state === "noCommits"}>{countLine.text}</p>
    <p class={relationSummary.kind}>{relationSummary.text}</p>
  {:else}
    {#if shown.length > 0}
      <ol class="commits">
        {#each shown as commit (commit.id)}
          <li>
            <span class="sha">{commit.shortId}</span>
            <span class="summary">{commit.summary}</span>
            <!-- 各コミットに関連 Pull Request を紐づけて示す (doc-8 §5). Only a *resolved* pairing gets a
                 chip; 参照不能 と 対象外 は下の関連解決の状態が引き受ける。 -->
            {#each relatedPrs.get(commit.id) ?? [] as url (url)}
              <!-- Text, not a link: an <a href> inside the Tauri WebView would navigate the app window
                   away from Atlas (the same rule TaskDetail's URLs follow). -->
              <span class="pr" title={url}>{prLabel(url)}</span>
            {/each}
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
      <p class="neutral absence">対応コミット無し（このリポジトリに TASK-ID を含むコミットがありません）</p>
    {:else if commits.state === "noRepository"}
      <p class="setting">
        Git 対象不在: {commits.projectRoot} は Git リポジトリではないため、ローカル履歴も関連解決も出せません。
      </p>
    {:else if commits.state === "unreadable"}
      <p class="failure">Git 履歴を読めません: {commits.detail}</p>
    {:else if commits.state === "noTaskId"}
      <p class="setting">TASK-ID が読めないため、コミット検索の鍵がありません。</p>
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
          <!-- The gate doc-6 §5/§6 puts on 関連解決 is open, so every extracted PR has an outcome.
               全面 is where doc-8 §5 asks for those causes to be written out one by one, with whether
               each is something the user can clear. -->
          <p class={relationSummary.kind}>
            {relationSummary.text}（remote ホスト判別済み: {relation.host}）
          </p>
          {#if accounts.length > 0}
            <ul class="accounts">
              {#each accounts as account (account.pullRequest)}
                <li>
                  <span class="url">{account.pullRequest}</span>
                  <span class={account.kind}>{account.text}</span>
                </li>
              {/each}
            </ul>
          {/if}
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
         関連解決の状態, which exists even for a task with no commits.
         The label names the operation instead of copying doc-8 §5's sentence (doc-11 §8 の設計文の写し).
         It is deliberately *not* attributed to 画面設計案 02: doc-12 §3 transcribes that 導線 as
         「残り 1 件と関連 PR は全面表示で →」, a count form this button cannot take — it is offered
         even when there is nothing left to expand. That difference is TASK-80's. -->
    <p>
      <button type="button" class="expand" onclick={onexpand}> 全面表示で開く → </button>
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
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a `:disabled` rule here would outrank it.
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

  // 関連 PR の印: 輪郭ピル (doc-11 §3) — a commit row's own family, distinct from the summary text.
  .pr {
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .accounts {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-direction: column;
      font-size: 0.7rem;
    }
  }

  .url {
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
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
  // `HistoryLine.kind` の `neutral` (lib/detail.ts) is decision-6's family, and it covers more than
  // 正常な不在: コミット n 件, 読み込み中, 関連 PR の状態 all arrive under it. So the class carries 副次
  // の `--muted`, and 弱 の `--faint` is opted into by the one line that really is an absence
  // (doc-11 §2.1). Painting the whole class 弱 put the 再取得 の無効化理由 — the only always-visible
  // reason a keyboard user has for that control — at 1.79:1–3.19:1 on the recorded themes.
  .neutral {
    color: var(--muted);
  }

  // 正常な不在 (doc-11 §6), the same 弱 as 空セル の `—`.
  .absence {
    color: var(--faint);
  }

  // 無効化の理由 (doc-11 §5): 副次の文であり、弱めてよいものではない。
  .reason {
    color: var(--muted);
  }

  .setting {
    padding: 0.2rem 0.35rem;
    border-left: 2px solid var(--line-strong);
    background: var(--inset);
  }

  .failure {
    color: var(--mark-unreadable);
  }
</style>
