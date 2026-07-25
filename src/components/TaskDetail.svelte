<script lang="ts">
  // タスク詳細画面 (doc-8): one task's every item on one surface. This is the display half
  // (TASK-35); the editing operations doc-8 §6 defines are TASK-36, so nothing here writes —
  // 参照系 (Type・References・Pull Request・Git 履歴) is read and shown for every 保存区分
  // (doc-8 §6.5), and no control implies an edit that does not exist yet.
  //
  // Bodies are shown as the file wrote them, not rendered as Markdown: a Markdown renderer is a
  // new production dependency, which AGENTS requires confirming before introducing.
  //
  // URLs are text, not links, for the same reason inverted: an <a href> inside the Tauri WebView
  // would navigate the app window away from Atlas, and opening an external browser needs a
  // capability this build does not have.
  import GitHistory from "./GitHistory.svelte";
  import { cardIdentity, crossTaskId } from "../lib/card";
  import {
    acProgress,
    degradeSummary,
    dependencyLinks,
    milestoneRef,
    referenceSplit,
    type HistoryState,
  } from "../lib/detail";
  import { CANONICAL_COLUMN_LABEL } from "../lib/swimlane";
  import type { ProjectEntry, ProjectSnapshot, ReferenceKind, StorageState, TaskView } from "../lib/wire";

  interface Props {
    view: TaskView;
    /** The snapshot the task was read from — milestone and dependency ids resolve inside it. */
    snapshot: ProjectSnapshot;
    entry: ProjectEntry | null;
    history: HistoryState;
    /** Follow a dependency to its task (doc-8 §3 解決先タスクへ辿れる). */
    onselect: (view: TaskView) => void;
    onreloadHistory: () => void;
    onclose: () => void;
  }

  let { view, snapshot, entry, history, onselect, onreloadHistory, onclose }: Props = $props();

  const STORAGE_LABEL: Record<StorageState, string> = {
    active: "active",
    draft: "draft",
    completed: "completed",
    archive: "archive",
  };

  const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
    milestone: "milestone",
    documentation: "documentation",
    reference: "references",
  };

  let task = $derived(view.task);
  let status = $derived(view.interpretation.status);
  let types = $derived(view.interpretation.types);
  let milestone = $derived(milestoneRef(view, snapshot.milestones));
  let dependencies = $derived(dependencyLinks(view, snapshot.tasks));
  let references = $derived(referenceSplit(view));
  let ac = $derived(acProgress(view));
  let degrade = $derived(degradeSummary(view));
</script>

<aside class="detail" aria-label="タスク詳細">
  <header class="heading">
    <div class="line">
      <!-- 横断タスクID を併記 (doc-8 §2, doc-3 §5.3): the panel is single-project, but the heading
           still says which project's task this is. A 解析不能 file has no id, so it is named by
           its file — the only stable handle it has (doc-4 §5). -->
      <span class="identity">{cardIdentity(view)}</span>
      {#if crossTaskId(view) === null}
        <span class="mark missing">TASK-ID 不明</span>
      {/if}
      {#if degrade.degraded}
        <span class="mark degraded">縮退</span>
      {/if}
      <button type="button" class="close" onclick={onclose}>閉じる</button>
    </div>

    <h2>{task.title ?? "（title 不明）"}</h2>

    <dl class="facts">
      <dt>status</dt>
      <dd>
        {#if status === null}
          <span class="mark missing">status を読めません</span>
        {:else}
          <span class="raw">{status.raw}</span>
          <!-- 正準対応を併記 (AC #1): 未対応 status is stated as such rather than shown blank. -->
          {#if status.column === null}
            <span class="mark unmapped">正準列 未対応</span>
          {:else}
            <span class="column">正準列: {CANONICAL_COLUMN_LABEL[status.column]}</span>
          {/if}
          {#if status.declaration === "undeclared"}
            <span class="mark unmapped">config.yml 未宣言</span>
          {:else if status.declaration === "noDeclaredSet"}
            <span class="mark neutral">config.yml に status 宣言なし</span>
          {:else if status.declaration === "draft"}
            <span class="mark neutral">draft の既知 status</span>
          {/if}
        {/if}
      </dd>

      <dt>priority</dt>
      <dd>{task.priority ?? "—"}</dd>

      <dt>assignee</dt>
      <dd>{task.assignee.length > 0 ? task.assignee.join(", ") : "—"}</dd>

      <dt>milestone</dt>
      <dd>
        {#if milestone === null}
          —
        {:else}
          {milestone.id}
          {#if milestone.title === null}
            <span class="mark unmapped">未解決</span>
          {:else}
            <span class="resolved">{milestone.title}</span>
          {/if}
        {/if}
      </dd>

      <dt>保存区分</dt>
      <dd>
        {task.storageState === null
          ? "保存区分不明"
          : STORAGE_LABEL[task.storageState]}
      </dd>

      <dt>日付</dt>
      <dd>
        created {task.createdDate ?? "—"} / updated {task.updatedDate ?? "—"}
      </dd>

      <dt>ファイル</dt>
      <dd class="path">{task.sourcePath}</dd>
    </dl>
  </header>

  <!-- Type と通常ラベルは別区画 (doc-8 §4): two sections, never one label list. -->
  <section>
    <h3>Type</h3>
    {#if types.length === 0}
      <p class="neutral">Type 未設定</p>
    {:else}
      <ul class="chips">
        {#each types as value, index (index)}
          <li class="type" class:unknown={!value.known}>
            {value.value}{value.known ? "" : "（未知）"}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>通常ラベル</h3>
    {#if task.labels.length === 0}
      <p class="neutral">なし</p>
    {:else}
      <ul class="chips">
        {#each task.labels as label, index (index)}
          <li class="label">{label}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Description</h3>
    {#if task.description}
      <pre class="body">{task.description}</pre>
    {:else}
      <p class="neutral">なし</p>
    {/if}
  </section>

  <section>
    <h3>Acceptance Criteria <span class="count">{ac.checked} / {ac.total}</span></h3>
    {#if ac.total === 0}
      <p class="neutral">なし</p>
    {:else}
      <ul class="ac">
        {#each task.acceptanceCriteria as item (item.number)}
          <li class:checked={item.checked}>
            <span class="box" aria-label={item.checked ? "完了" : "未完了"}>
              {item.checked ? "☑" : "☐"}
            </span>
            <span class="number">#{item.number}</span>
            <span class="text">{item.text}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>実装計画</h3>
    {#if task.implementationPlan}
      <pre class="body">{task.implementationPlan}</pre>
    {:else}
      <p class="neutral">なし</p>
    {/if}
  </section>

  <section>
    <h3>実装ノート</h3>
    {#if task.implementationNotes}
      <pre class="body">{task.implementationNotes}</pre>
    {:else}
      <p class="neutral">なし</p>
    {/if}
  </section>

  <section>
    <h3>dependencies</h3>
    {#if dependencies.length === 0}
      <p class="neutral">なし</p>
    {:else}
      <ul class="deps">
        {#each dependencies as dependency, index (index)}
          <li>
            {#if dependency.target === null}
              <span class="id">{dependency.id}</span>
              <span class="mark unmapped">未解決</span>
            {:else}
              {@const target = dependency.target}
              <button type="button" onclick={() => onselect(target)}>
                {dependency.id}
                <span class="dep-title">{target.task.title ?? "（title 不明）"}</span>
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Pull Request URL は References と分離して独立表示 (doc-8 §4). Both sections stay visible in
       every 保存区分 (doc-8 §6.5) — they are 参照系, which reading never depends on edit rights. -->
  <section>
    <h3>Pull Request</h3>
    {#if references.pullRequests.length === 0}
      <p class="neutral">References に Pull Request URL はありません</p>
    {:else}
      <ul class="prs">
        {#each references.pullRequests as pr, index (index)}
          <li>
            <span class="url">{pr.url}</span>
            <span class="meta">
              {pr.host ?? "ホスト種別 不明"}{pr.owner && pr.repo
                ? ` / ${pr.owner}/${pr.repo}`
                : ""}{pr.number === null ? "" : ` / #${pr.number}`}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>References</h3>
    {#if references.references.length === 0}
      <p class="neutral">なし</p>
    {:else}
      <ul class="refs">
        {#each references.references as reference, index (index)}
          <li>
            <span class="url">{reference.value}</span>
            {#if reference.dangling}
              <span class="mark unmapped">参照欠損</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <GitHistory {history} {entry} onreload={onreloadHistory} />

  {#if degrade.degraded || task.unknownSections.length > 0}
    <!-- 縮退表示 (doc-4 §5, doc-8 §3): the panel above already showed every item it could read;
         this states what is missing, so 判別できた項目 and 不足 are never confused. -->
    <section class="degrade-panel">
      <h3>縮退（判別できなかった項目）</h3>
      {#if degrade.missingRequired.length > 0}
        <p>解析不能: {degrade.missingRequired.join("・")} を読めません</p>
      {/if}
      {#each degrade.schemaIssues as issue, index (index)}
        <p>想定外スキーマ: {issue}</p>
      {/each}
      {#each degrade.danglingReferences as dangling, index (index)}
        <p>参照欠損: {REFERENCE_KIND_LABEL[dangling.kind]} {dangling.target}</p>
      {/each}
      {#each task.unknownSections as section, index (index)}
        <details>
          <summary>未知セクション {section.name}（保持のみ）</summary>
          <pre class="body">{section.body}</pre>
        </details>
      {/each}
    </section>
  {/if}

  <footer class="note">
    表示のみ（TASK-35）。編集操作は TASK-36、外部エディタ経路は TASK-37 で実装します。
  </footer>
</aside>

<style lang="scss">
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    // Fixed share of the width: the grid beside it is the element that gives way (it scrolls).
    flex: none;
    width: min(30rem, 45vw);
    padding: 0.6rem 0.75rem 1rem;
    border-left: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    background: color-mix(in srgb, canvas 94%, canvastext 6%);
    // Scrolls inside itself so the swimlane keeps its own scroll position while the panel is open.
    overflow-y: auto;
  }

  .heading {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;

    h2 {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.35;
    }
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }

  .identity {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .close {
    margin-left: auto;
    padding: 0 0.4rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .facts {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 0.15rem 0.5rem;
    margin: 0;
    font-size: 0.74rem;

    dt {
      opacity: 0.6;
    }

    dd {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.3rem;
    }
  }

  .path {
    word-break: break-all;
    opacity: 0.7;
  }

  .raw {
    font-weight: 600;
  }

  .column,
  .resolved {
    opacity: 0.7;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    h3 {
      margin: 0;
      font-size: 0.8rem;
    }
  }

  .count {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }

  .body {
    margin: 0;
    padding: 0.35rem 0.45rem;
    border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, canvas 88%, canvastext 12%);
    font-family: inherit;
    font-size: 0.74rem;
    line-height: 1.5;
    // Long lines wrap instead of scrolling the panel sideways; newlines are kept as written.
    white-space: pre-wrap;
    word-break: break-word;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.7rem;
  }

  // Same shapes as the card's (doc-7 §3): Type is a filled chip, 通常ラベル an outlined one, so
  // the two 区画 read as different kinds of thing here too (doc-8 §4).
  .type {
    padding: 0 0.35rem;
    border-radius: 3px;
    background: color-mix(in srgb, currentColor 16%, transparent);

    &.unknown {
      background: none;
      border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    }
  }

  .label {
    padding: 0 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 999px;
  }

  .ac,
  .deps,
  .refs,
  .prs {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.74rem;
  }

  .ac li {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;

    &.checked .text {
      opacity: 0.65;
    }
  }

  .number {
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .deps li {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;

    button {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      padding: 0.1rem 0.35rem;
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.74rem;
      text-align: left;
      cursor: pointer;

      &:hover {
        border-color: color-mix(in srgb, currentColor 50%, transparent);
      }
    }
  }

  .dep-title {
    opacity: 0.7;
  }

  .refs li,
  .prs li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .url {
    word-break: break-all;
  }

  .meta {
    font-size: 0.68rem;
    opacity: 0.6;
  }

  .mark {
    padding: 0 0.3rem;
    border-radius: 3px;
    font-size: 0.66rem;
  }

  // 解析縮退・未対応・中立の印を混ぜない (decision-6): a parse degrade is marked, an unmapped or
  // dangling reference is outlined, and a merely-informative state stays plain.
  .mark.degraded,
  .mark.missing {
    background: #b8860b;
    color: #fff;
  }

  .mark.unmapped {
    border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  }

  .mark.neutral {
    opacity: 0.65;
  }

  p {
    margin: 0;
    font-size: 0.74rem;
  }

  .neutral {
    opacity: 0.7;
  }

  .degrade-panel {
    padding: 0.35rem 0.45rem;
    border-left: 3px solid #b8860b;
    background: color-mix(in srgb, #b8860b 10%, transparent);

    details {
      font-size: 0.72rem;
    }
  }

  .note {
    font-size: 0.68rem;
    opacity: 0.55;
  }
</style>
