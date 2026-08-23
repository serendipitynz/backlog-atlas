<script lang="ts">
  // 新規タスク区画 (doc-10 §7).
  //
  // 入力は親が持つ (`taskInput` は親の `$state` で、欄はその項目を書く) — 区画切替が入力を落とさない
  // のはそれが理由である (doc-10 §1)。ここが持つのは描画と、発行が押されたことの受け渡しだけである。
  import Editor from "../Editor.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import ListEditor from "./ListEditor.svelte";
  import { PRIORITIES } from "../../lib/edit";
  import { omitsSentence, type IssueAvailability, type TaskCreateInput } from "../../lib/manage";
  import { messages } from "../../lib/messages-context";
  import { MAC_KEYBOARD } from "../../lib/platform";
  import { issueControlTitle } from "../../lib/project-detail";
  import { ariaKeyShortcuts, shortcutHint } from "../../lib/shortcuts";
  import type { Milestone } from "../../lib/wire";

  interface Props {
    /** ルート読取不能 のときに欄の代わりに立つ文 (doc-10 §8)、または `null`。 */
    unreadableNote: string | null;
    /**
     * 欄が出ているか。**親が持つ 1 つの述語である** — 発行の行 が出ているかで 区画の下 padding が
     * 決まり (doc-11 §11)、それを決めるのは親の `.panel` なので、同じ値を 2 か所で組み立てない。
     */
    formShown: boolean;
    /** 宣言済みの原文 status (doc-10 §7): `-s` はこれ以外を受け取らない。 */
    statuses: readonly string[];
    milestones: readonly Milestone[];
    /** 発行前の入力。親の `$state` そのもので、欄はこの項目を書き換える。 */
    taskInput: TaskCreateInput;
    /** まだ 追加 されていない通常ラベル・受入条件の下書き。 */
    newLabel: string;
    setNewLabel: (value: string) => void;
    newCriterion: string;
    setNewCriterion: (value: string) => void;
    /** 発行の可否と理由 (doc-5 §5)。 */
    taskIssue: IssueAvailability;
    oncreate: () => void;
    onopenNote: () => void;
    /** 注記モーダル の名前。層が読み上げられる名前と同じものを控えが持つ (doc-10 §7)。 */
    noteLabel: string;
  }

  let {
    unreadableNote,
    formShown,
    statuses,
    milestones,
    taskInput,
    newLabel,
    setNewLabel,
    newCriterion,
    setNewCriterion,
    taskIssue,
    oncreate,
    onopenNote,
    noteLabel,
  }: Props = $props();

  const t = messages();
</script>

<!-- 新規タスク区画 (doc-10 §7) -->
<section>
  <!-- 区画見出しの横に 注記の入口 (doc-10 §7, TASK-123). アイコンのみのボタン (doc-11 §2.4):
       the figure carries no word, so the `aria-label` carries the name — the same name the
       layer it raises is announced by, since that is what the reader is being offered.
       Until TASK-123 the five fields sat at the foot of this 区画 at all times, 361px of an
       885px 区画 and the reason the form did not fit its scroller (measured). -->
  <div class="section-head">
    <h2>{t().projectDetail.taskNewHeading}</h2>
    <!-- Only where the form is. What the note answers is「この欄はどこにあるのか」, a
         question a reader has while filling the form in — beside a 読み込み中 or a
         ルート読取不能 message there is no form to have it about, and an entry offering
         advice about one is the noise this task exists to remove. Same placement rule the
         作成の入口 follows one 区画 over. -->
    {#if formShown}
      <button
        type="button"
        class="note-entry"
        aria-label={noteLabel}
        title={noteLabel}
        onclick={onopenNote}
      >
        <Icon name="circle-question-mark" />
      </button>
    {/if}
  </div>

  {#if unreadableNote !== null}
    <p class="unreadable">{unreadableNote}</p>
  {:else if !formShown}
    <p class="neutral">{t().state.loading}</p>
  {:else}
    <label class="field">
      <span class="label">{t().field.titleRequired}</span>
      <input
        type="text"
        value={taskInput.title}
        oninput={(event) => (taskInput.title = event.currentTarget.value)}
      />
    </label>

    <div class="field">
      <span class="label">description</span>
      <Editor
        label="description"
        value={taskInput.description}
        rows={5}
        onchange={(value) => (taskInput.description = value)}
        onsave={oncreate}
      />
    </div>

    <div class="row">
      <label class="field">
        <span class="label">status</span>
        <select
          value={taskInput.status}
          onchange={(event) => (taskInput.status = event.currentTarget.value)}
        >
          <!-- 未指定 stays selectable throughout: leaving `--status` off is what makes
               `default_status` apply, and that is a different request from setting one. -->
          <option value="">{t().projectDetail.configDefaultStatus}</option>
          <!-- 選択肢は宣言済みの原文 status に限る (doc-10 §7): `-s` takes only what
               `config.yml` declares, and an undeclared value is refused with exit code 1.
               Canonical column names are deliberately not listed. -->
          {#each statuses as status (status)}
            <option value={status}>{status}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span class="label">priority</span>
        <select
          value={taskInput.priority}
          onchange={(event) => (taskInput.priority = event.currentTarget.value)}
        >
          <option value="">{t().projectDetail.unset}</option>
          {#each PRIORITIES as priority (priority)}
            <option value={priority}>{priority}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span class="label">milestone</span>
        <select
          value={taskInput.milestone}
          onchange={(event) => (taskInput.milestone = event.currentTarget.value)}
        >
          <option value="">{t().projectDetail.unset}</option>
          {#each milestones as milestone (milestone.id)}
            <option value={milestone.id}>{milestone.id} {milestone.title}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="field">
      <span class="label">{t().field.plainLabels}</span>
      <ListEditor
        values={taskInput.labels}
        apply={(next) => (taskInput.labels = next)}
        draft={newLabel}
        setDraft={setNewLabel}
        placeholder={t().field.addLabel}
      />
      <p class="hint">
        {t().projectDetail.labelNote}
      </p>
    </div>

    <div class="field">
      <span class="label">Acceptance Criteria</span>
      <ListEditor
        values={taskInput.acceptanceCriteria}
        apply={(next) => (taskInput.acceptanceCriteria = next)}
        draft={newCriterion}
        setDraft={setNewCriterion}
        placeholder={t().field.addCriterion}
      />
    </div>

    <!-- 発行の行 (doc-11 §11): the only 発行 this 区画 holds, and the form is long enough to
         carry it off screen, so it pins to the bottom of the 区画. -->
    <div class="issue">
      {#if taskIssue.state === "blocked" && !omitsSentence(taskIssue.reason)}
        <span class="reason">{taskIssue.reason}</span>
      {/if}
      <!-- 併記 は控えの `aria-keyshortcuts`・`title` とキーボード操作一覧が担う (doc-7 §2.1)。 -->
      <div class="actions">
        <button
          type="button"
          disabled={taskIssue.state !== "ready"}
          aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
          title={issueControlTitle(
                    taskIssue,
                    t().projectDetail.taskCreate,
                    shortcutHint("saveEditSession", MAC_KEYBOARD),
                  )}
          onclick={oncreate}
        >
          {t().projectDetail.taskCreate}
        </button>
      </div>
    </div>
  {/if}

</section>

<style lang="scss">
  @use "./shared" as shared;

  h2 {
    @include shared.heading-2;
  }

  // 区画見出しと、その横に置く入口 (doc-10 §7). `baseline` so the figure sits on the heading's own
  // line rather than on the middle of its box, which is where an icon beside text is looked for.
  //
  // The h2 keeps its own `margin: 0 0 0.5rem` — zeroing it here would close the gap below the
  // heading that every other 区画 has, and the 一覧見出し行 (the same shape one column over) does not
  // zero it either.
  .section-head {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }

  // 注記の入口: アイコンのみのボタン (doc-11 §2.4). The figure is 1em of whatever box it sits in, so
  // the size comes from this button's font-size and nothing here names a second one.
  .note-entry {
    padding: 0.15rem;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: var(--text-lg);
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--fg);
    }

    // 選択の描き方 (doc-11 §2.3), the same ring 作成の入口 carries: the entry is reachable by
    // keyboard (doc-10 §7 の AC), and a control that takes focus without showing it is reachable
    // only in the accessibility tree.
    &:focus-visible {
      outline: 2px solid var(--sel);
      outline-offset: 1px;
    }
  }

  .field {
    @include shared.field;
  }

  .label {
    @include shared.field-label;
  }

  .row {
    @include shared.row;

    .field {
      @include shared.row-field;
    }
  }

  input[type="text"],
  select {
    @include shared.form-control;
  }

  button {
    @include shared.button;
  }

  .actions {
    @include shared.actions;
  }

  .issue {
    @include shared.issue-row;

    // 発行の行 は框の外 — `.panel` の横 padding を打ち消して縁まで届かせ、内側の余白は行が自分で持つ。
    margin-right: -0.75rem;
    margin-left: -0.75rem;

    .actions {
      @include shared.issue-actions;
    }

    .reason {
      @include shared.issue-reason;
    }
  }

  .hint,
  .reason {
    @include shared.muted-note;
  }

  .neutral {
    @include shared.neutral;
  }

  .unreadable {
    @include shared.unreadable;
  }
</style>
