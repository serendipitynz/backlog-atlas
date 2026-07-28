<script lang="ts">
  // 文書・マイルストーン管理と新規タスク作成の入口 (doc-5 §3.2, TASK-40).
  //
  // Every action here is issued as a 更新操作 through the Backlog 更新アダプター (TASK-31) over the
  // command boundary (TASK-33): this component holds no filesystem call and no path, so the doc-2
  // invariant — 管理対象 Markdown を GUI から直接書き換えない — is structural rather than a rule to
  // remember. The screen's only outputs are `UpdateOperation[]` values handed to `onissue`.
  //
  // The rules live in `lib/manage.ts` as pure functions; this component is layout, local form state
  // and the callbacks. Text inputs bind to *local* state and are never rewritten while the user is
  // typing — the IME rule `FilterBar` and `ProjectLedger` follow — so nothing reformats a field
  // mid-composition.
  import Editor from "./Editor.svelte";
  import { PRIORITIES } from "../lib/edit";
  import {
    DOC_TYPES,
    EMPTY_DOC_CREATE,
    EMPTY_MILESTONE_ADD,
    EMPTY_TASK_CREATE,
    MILESTONE_DESCRIPTION_NOT_EDITABLE,
    WITHHELD_MILESTONE_OPERATIONS,
    buildDocCreate,
    buildDocUpdate,
    buildMilestoneAdd,
    buildTaskCreate,
    docDivergence,
    hasDocCreateInput,
    hasMilestoneAddInput,
    hasTaskCreateInput,
    isDocDirty,
    issueAvailability,
    outcomeMessage,
    setDocField,
    startDocSession,
    type DocCreateInput,
    type DocDraft,
    type DocSession,
    type IssueOutcome,
    type IssuePlan,
    type MilestoneAddInput,
    type TaskCreateInput,
  } from "../lib/manage";
  import type { CliReadiness, Document, ProjectSnapshot, UpdateOperation } from "../lib/wire";

  interface Props {
    /**
     * The projects whose roots are currently readable, in ledger order. Only these: 文書・マイル
     * ストーン belong to one Backlog root, and an operation is issued against an *open* project —
     * a root Atlas cannot read has no document list to act on either.
     */
    projects: ProjectSnapshot[];
    /** True while the workspace is still being read: an empty list is not yet known to be empty. */
    loading: boolean;
    /** Whether a supported `backlog` exists (doc-5 §5 縮退); `null` until the probe answers. */
    readiness: CliReadiness | null;
    /** Issue one screen action against one project (doc-5 §3, doc-9 §4). */
    onissue: (slug: string, action: UpdateOperation[]) => Promise<IssueOutcome>;
    /** True while the 文書編集セッション holds 未保存入力 — what makes leaving the screen ask first. */
    ondirty: (dirty: boolean) => void;
  }

  let { projects, loading, readiness, onissue, ondirty }: Props = $props();

  /** The project the user picked; `null` follows the list's first entry. */
  let requested = $state<string | null>(null);
  let project = $derived(projects.find((entry) => entry.slug === requested) ?? projects[0] ?? null);

  /** True while an action is in flight — every 発行 control is withheld, not only the one pressed. */
  let busy = $state(false);
  /**
   * The last action's result. Its tone follows doc-9 §5's families: an ordinary notice for a CLI
   * failure or a 更新前競合, and 照合不能's own colour for the one that is neither (`mark-undetectable`),
   * so the user cannot read it as "a conflict happened".
   */
  let message = $state<{ tone: "ok" | "warn" | "undetectable"; text: string } | null>(null);

  // --- 新規タスク作成 (doc-5 §3, AC #1) --------------------------------------------------------

  let taskInput = $state<TaskCreateInput>({ ...EMPTY_TASK_CREATE });
  let newLabel = $state("");
  let newCriterion = $state("");
  let taskPlan = $derived(buildTaskCreate(taskInput));
  let taskIssue = $derived(issueAvailability(taskPlan, { readiness, busy }));

  // --- 文書 (doc-5 §3.2, AC #2) ----------------------------------------------------------------

  let docInput = $state<DocCreateInput>({ ...EMPTY_DOC_CREATE });
  let docCreatePlan = $derived(buildDocCreate(docInput));
  let docCreateIssue = $derived(issueAvailability(docCreatePlan, { readiness, busy }));

  /** The document being edited, with its session. One at a time: two would both claim 発行. */
  let docSession = $state<DocSession | null>(null);
  let newTag = $state("");
  let docUpdatePlan = $derived(docSession === null ? null : buildDocUpdate(docSession));
  let docUpdateIssue = $derived(
    docUpdatePlan === null
      ? ({ state: "blocked", reason: "編集する文書を選んでください" } as const)
      : issueAvailability(docUpdatePlan, { readiness, busy }),
  );
  let docDirty = $derived(docSession !== null && isDocDirty(docSession));
  /**
   * What the user asked for while 未保存入力 was held, kept until they answer — and **not applied in
   * the meantime**. Same shape as the shell's 破棄前確認 (doc-8 §6.3): the input is the user's, so it
   * is never discarded without being asked, and neither is the target it was typed against.
   *
   * `document` `null` means "close the editor"; `project` carries the slug the switch would move to.
   * The slug lives here rather than in `requested` because `project` derives from `requested`: moving
   * it before the answer would repoint 発行先 at the new root while the *old* root's document session
   * is still open, and issuing then would send that document's id and body to the other Backlog root
   * (review [P1]).
   */
  type Pending = { to: "document"; document: Document | null } | { to: "project"; slug: string };
  let pending = $state<Pending | null>(null);

  // --- マイルストーン (doc-5 §3.2, AC #3/#5) ----------------------------------------------------

  let milestoneInput = $state<MilestoneAddInput>({ ...EMPTY_MILESTONE_ADD });
  let milestonePlan = $derived(buildMilestoneAdd(milestoneInput));
  let milestoneIssue = $derived(issueAvailability(milestonePlan, { readiness, busy }));

  /**
   * Everything the screen holds that has not been issued (review [P2]). Not just the 文書編集
   * セッション: a create form is unmounted by a screen switch exactly as the session is, and its
   * values are the user's input all the same — the shell's 破棄前確認 has to cover them or leaving
   * the tab discards them without a word. The three add-row boxes count too: text typed but not yet
   * committed with 追加 is the easiest thing to lose and the least visible.
   */
  let dirty = $derived(
    docDirty ||
      hasTaskCreateInput(taskInput) ||
      hasDocCreateInput(docInput) ||
      hasMilestoneAddInput(milestoneInput) ||
      newLabel.trim() !== "" ||
      newCriterion.trim() !== "" ||
      newTag.trim() !== "",
  );

  // The shell asks before this screen is left with 未保存入力, so it has to know while it is held.
  $effect(() => {
    ondirty(dirty);
  });

  function tone(outcome: IssueOutcome): "ok" | "warn" | "undetectable" {
    if (outcome.state === "applied") return "ok";
    // 照合不能 (doc-9 §4.2) gets its own family: it is not a failure of this action and not a
    // divergence, and doc-9 §5 forbids it reading as either.
    return outcome.state === "uncheckable" ? "undetectable" : "warn";
  }

  /** Issue one action against the selected project and state what became of it (doc-9 §5). */
  async function issue(action: UpdateOperation[], done: string): Promise<IssueOutcome | null> {
    const target = project;
    if (target === null) return null;
    busy = true;
    message = null;
    try {
      const outcome = await onissue(target.slug, action);
      message = { tone: tone(outcome), text: outcomeMessage(outcome, done) };
      return outcome;
    } finally {
      busy = false;
    }
  }

  async function createTask(): Promise<void> {
    if (taskIssue.state !== "ready" || taskPlan.state !== "ready") return;
    const outcome = await issue(taskPlan.action, "タスクを作成しました。");
    // Cleared only on success: a failed create leaves the input so it can be corrected and retried.
    if (outcome?.state === "applied") {
      taskInput = { ...EMPTY_TASK_CREATE };
      newLabel = "";
      newCriterion = "";
    }
  }

  async function createDoc(): Promise<void> {
    if (docCreateIssue.state !== "ready" || docCreatePlan.state !== "ready") return;
    const outcome = await issue(docCreatePlan.action, "文書を作成しました。");
    if (outcome?.state === "applied") docInput = { ...EMPTY_DOC_CREATE };
  }

  async function updateDoc(): Promise<void> {
    const session = docSession;
    const plan = docUpdatePlan;
    if (session === null || plan === null || plan.state !== "ready") return;
    if (docUpdateIssue.state !== "ready") return;
    const submitted = plan.submitted;
    const outcome = await issue(plan.action, "文書を更新しました。");
    if (outcome?.state !== "applied") return;
    // 防げない喪失の事後通知 (doc-9 §5): the re-read has already replaced `projects` by now, so the
    // document below is the post-update one. `--content` full-replaces the body (doc-5 §3.1), which
    // is why this comparison matters more for a document than for anything else on screen.
    const diverged = docDivergence(
      submitted,
      project?.documents.find((entry) => entry.id === session.baseline.id) ?? null,
    );
    // Closed on success: the baseline this session was built on is the pre-update read, and keeping
    // it open would compare the next edit against a version that no longer exists.
    docSession = null;
    newTag = "";
    if (diverged.length > 0) {
      message = {
        tone: "warn",
        text:
          `更新は適用されましたが、再読込した内容が送信した内容と一致しません（${diverged.join("・")}）。` +
          "照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。更新前競合検出は " +
          "best-effort であり、この窓に入った更新が上書きで失われた場合、その内容は表示も復元も" +
          "できません（doc-9 §4.1）。",
      };
    }
  }

  async function addMilestone(): Promise<void> {
    if (milestoneIssue.state !== "ready" || milestonePlan.state !== "ready") return;
    const outcome = await issue(milestonePlan.action, "マイルストーンを作成しました。");
    if (outcome?.state === "applied") milestoneInput = { ...EMPTY_MILESTONE_ADD };
  }

  /** Open one document's 編集セッション, asking first when another one's input would be lost. */
  function edit(document: Document): void {
    // Already open: pressing 編集 again would restart the session and drop the input without asking.
    if (docSession?.baseline.id === document.id) return;
    // Only the session is at risk here — the create forms stay mounted — so this asks about `docDirty`
    // rather than the whole screen's `dirty`.
    if (docDirty) {
      pending = { to: "document", document };
      return;
    }
    openDocument(document);
  }

  function openDocument(document: Document): void {
    docSession = startDocSession(document);
    newTag = "";
    message = null;
  }

  function closeEditor(): void {
    if (docDirty) {
      pending = { to: "document", document: null };
      return;
    }
    docSession = null;
    newTag = "";
  }

  /** Take the action the user just confirmed, discarding the 未保存入力 it costs. */
  function leaveConfirmed(): void {
    const target = pending;
    pending = null;
    if (target === null) return;
    if (target.to === "document") {
      if (target.document === null) {
        docSession = null;
        newTag = "";
      } else {
        openDocument(target.document);
      }
      return;
    }
    moveTo(target.slug);
  }

  /**
   * Switch the target project. Everything on this screen is scoped to one Backlog root — the open
   * document, but also the status/milestone values the create form offers — so the move resets all of
   * it rather than carrying values that name things the other root does not have.
   */
  function selectProject(slug: string, control: HTMLSelectElement): void {
    if (slug === project?.slug) return;
    if (dirty) {
      pending = { to: "project", slug };
      // The select is uncontrolled until `requested` moves, and `requested` must not move before the
      // answer ([P1]). Put the widget back to the project still in effect, so what it shows is the
      // root an issue would actually go to.
      control.value = project?.slug ?? "";
      return;
    }
    moveTo(slug);
  }

  function moveTo(slug: string): void {
    requested = slug;
    docSession = null;
    taskInput = { ...EMPTY_TASK_CREATE };
    docInput = { ...EMPTY_DOC_CREATE };
    milestoneInput = { ...EMPTY_MILESTONE_ADD };
    newLabel = "";
    newCriterion = "";
    newTag = "";
    message = null;
  }

  function setDoc<K extends keyof DocDraft>(key: K, value: DocDraft[K]): void {
    if (docSession === null) return;
    docSession = setDocField(docSession, key, value);
  }

  function addTo(values: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || values.includes(trimmed) ? values : [...values, trimmed];
  }

  /** The reason a control is withheld, for its `title`. Empty when it is offered. */
  function why(availability: { state: string; reason?: string }): string {
    return availability.state === "blocked" ? (availability.reason ?? "") : "";
  }

  /** The plan's own reason, shown under a form — `null` while it is ready to issue. */
  function planReason(plan: IssuePlan | null): string | null {
    return plan !== null && plan.state === "blocked" ? plan.reason : null;
  }
</script>

{#snippet listEditor(
  values: string[],
  apply: (next: string[]) => void,
  draft: string,
  setDraft: (value: string) => void,
  placeholder: string,
)}
  {#if values.length > 0}
    <ul class="list-edit">
      {#each values as value, index (index)}
        <li>
          <span class="value">{value}</span>
          <button
            type="button"
            class="mini"
            onclick={() => apply(values.filter((_, at) => at !== index))}
          >
            削除
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="add-row">
    <input
      type="text"
      {placeholder}
      value={draft}
      oninput={(event) => setDraft(event.currentTarget.value)}
    />
    <button
      type="button"
      class="mini"
      onclick={() => {
        apply(addTo(values, draft));
        setDraft("");
      }}
    >
      追加
    </button>
  </div>
{/snippet}

<div class="manage">
  {#if loading}
    <p class="status">読み込み中…</p>
  {:else if project === null}
    <p class="status">
      読み取れるプロジェクトがありません。台帳画面から登録するか、読取不能な行を再読込してください。
    </p>
  {:else}
    <header class="target">
      <label>
        対象プロジェクト
        <select
          value={project.slug}
          onchange={(event) => selectProject(event.currentTarget.value, event.currentTarget)}
        >
          {#each projects as entry (entry.slug)}
            <option value={entry.slug}>{entry.slug}</option>
          {/each}
        </select>
      </label>
      <!-- 発行先を明示する: every operation below runs the CLI with *this* project as its working
           directory (doc-5 §4), and the ID space is the project's own (doc-3 §5.3). -->
      <span class="hint">
        以下の操作はすべて {project.slug} の Backlog ルートに対して、Backlog CLI 経由で発行します
        （管理ファイルを画面から直接書き換えることはありません）。
      </span>
    </header>

    {#if message !== null}
      <p class={message.tone}>{message.text}</p>
    {/if}

    {#if pending !== null}
      <!-- 破棄前確認: 未保存入力 is held and the requested action would drop it. The action itself has
           not been applied — in particular the target project is still the one shown above, so an
           issue made while this banner is up goes to the root the input was typed against. -->
      <div class="confirm">
        <span>
          {#if pending.to === "project"}
            未保存の入力があります。対象プロジェクトを {pending.slug} へ切り替えると、開いている文書の
            編集と作成フォームの入力は破棄されます（発行先はまだ {project.slug} のままです）。
          {:else if pending.document === null}
            文書の編集に未保存入力があります。編集を閉じると破棄されます。
          {:else}
            文書の編集に未保存入力があります。{pending.document.id} を開くと破棄されます。
          {/if}
        </span>
        <button type="button" onclick={leaveConfirmed}>破棄して続行</button>
        <button type="button" onclick={() => (pending = null)}>入力に戻る</button>
      </div>
    {/if}

    <!-- 新規タスク作成 (doc-5 §3 の task create 写像, AC #1) -->
    <section>
      <h2>新規タスク作成</h2>
      <div class="field">
        <label for="task-title">title（必須）</label>
        <input
          id="task-title"
          type="text"
          value={taskInput.title}
          oninput={(event) => (taskInput.title = event.currentTarget.value)}
        />
      </div>

      <div class="field">
        <span class="label">description</span>
        <Editor
          label="description"
          value={taskInput.description}
          rows={5}
          onchange={(value) => (taskInput.description = value)}
          onsave={createTask}
        />
      </div>

      <div class="row">
        <div class="field">
          <label for="task-status">status</label>
          <select
            id="task-status"
            value={taskInput.status}
            onchange={(event) => (taskInput.status = event.currentTarget.value)}
          >
            <!-- 未指定 stays selectable throughout: leaving `--status` off is what makes the
                 project's `default_status` apply, and that is a different request from setting one. -->
            <option value="">—（config.yml の既定 status に任せる）</option>
            {#each project.config.statuses as status (status)}
              <option value={status}>{status}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="task-priority">priority</label>
          <select
            id="task-priority"
            value={taskInput.priority}
            onchange={(event) => (taskInput.priority = event.currentTarget.value)}
          >
            <option value="">—（未設定）</option>
            {#each PRIORITIES as priority (priority)}
              <option value={priority}>{priority}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="task-milestone">milestone</label>
          <select
            id="task-milestone"
            value={taskInput.milestone}
            onchange={(event) => (taskInput.milestone = event.currentTarget.value)}
          >
            <option value="">—（未設定）</option>
            {#each project.milestones as milestone (milestone.id)}
              <option value={milestone.id}>{milestone.id} {milestone.title}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="field">
        <span class="label">通常ラベル</span>
        {@render listEditor(
          taskInput.labels,
          (next) => (taskInput.labels = next),
          newLabel,
          (value) => (newLabel = value),
          "追加するラベル",
        )}
        <p class="hint">
          Type（kind ラベル）はここでは扱いません。`task create --labels` は 1 個のカンマ区切り値を
          取るため、「,」を含むラベルは発行しません。
        </p>
      </div>

      <div class="field">
        <span class="label">Acceptance Criteria</span>
        {@render listEditor(
          taskInput.acceptanceCriteria,
          (next) => (taskInput.acceptanceCriteria = next),
          newCriterion,
          (value) => (newCriterion = value),
          "追加する Acceptance Criterion",
        )}
      </div>

      <div class="actions">
        <button
          type="button"
          disabled={taskIssue.state !== "ready"}
          title={why(taskIssue)}
          onclick={createTask}
        >
          タスクを作成（task create）
        </button>
        {#if taskIssue.state === "blocked"}
          <span class="reason">{taskIssue.reason}</span>
        {/if}
      </div>
    </section>

    <!-- 文書 (doc-5 §3.2, AC #2) -->
    <section>
      <h2>文書</h2>

      {#if project.documents.length === 0}
        <p class="neutral">文書はありません。</p>
      {:else}
        <ul class="records">
          {#each project.documents as document (document.id)}
            <li>
              <div class="record-head">
                <span class="id">{document.id}</span>
                <span class="title">{document.title}</span>
                <span class="meta">{document.type ?? "type 未設定"}</span>
                {#if document.tags.length > 0}
                  <span class="meta">tags: {document.tags.join(", ")}</span>
                {/if}
                <button
                  type="button"
                  class="mini"
                  disabled={busy}
                  onclick={() => edit(document)}
                >
                  {docSession?.baseline.id === document.id ? "編集中" : "編集"}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if docSession !== null}
        {@const session = docSession}
        <div class="editor-panel">
          <h3>{session.baseline.id} を更新（doc update）</h3>

          <div class="field">
            <label for="doc-edit-title">title</label>
            <input
              id="doc-edit-title"
              type="text"
              value={session.draft.title}
              oninput={(event) => setDoc("title", event.currentTarget.value)}
            />
          </div>

          <div class="field">
            <span class="label">本文（全置換）</span>
            <Editor
              label="本文"
              value={session.draft.content}
              rows={14}
              onchange={(value) => setDoc("content", value)}
              onsave={updateDoc}
            />
            <p class="hint">
              `doc update --content` は本文を全置換します（v1.47.1 に部分更新はありません。doc-5
              §3.1）。この欄は読み取った本文全文で、発行時はここにある全文をそのまま渡します。
            </p>
          </div>

          <div class="row">
            <div class="field">
              <label for="doc-edit-type">type</label>
              <select
                id="doc-edit-type"
                value={session.draft.docType}
                onchange={(event) => setDoc("docType", event.currentTarget.value)}
              >
                <option value="">—（変更しない）</option>
                {#each DOC_TYPES as value (value)}
                  <option {value}>{value}</option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="doc-edit-path">path（移動する場合のみ）</label>
              <input
                id="doc-edit-path"
                type="text"
                placeholder="空欄なら変更しません"
                value={session.draft.path}
                oninput={(event) => setDoc("path", event.currentTarget.value)}
              />
            </div>
          </div>

          <div class="field">
            <span class="label">tags</span>
            {@render listEditor(
              session.draft.tags,
              (next) => setDoc("tags", next),
              newTag,
              (value) => (newTag = value),
              "追加するタグ",
            )}
          </div>

          <div class="actions">
            <button
              type="button"
              disabled={docUpdateIssue.state !== "ready"}
              title={why(docUpdateIssue)}
              onclick={updateDoc}
            >
              文書を更新（doc update）
            </button>
            <button type="button" onclick={closeEditor}>閉じる</button>
            {#if docUpdateIssue.state === "blocked"}
              <span class="reason">{docUpdateIssue.reason}</span>
            {/if}
          </div>
        </div>
      {/if}

      <div class="create-panel">
        <h3>文書を作成（doc create）</h3>
        <div class="row">
          <div class="field">
            <label for="doc-title">title（必須）</label>
            <input
              id="doc-title"
              type="text"
              value={docInput.title}
              oninput={(event) => (docInput.title = event.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="doc-type">type</label>
            <select
              id="doc-type"
              value={docInput.docType}
              onchange={(event) => (docInput.docType = event.currentTarget.value)}
            >
              <option value="">—（CLI の既定）</option>
              {#each DOC_TYPES as value (value)}
                <option {value}>{value}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="doc-path">path</label>
            <input
              id="doc-path"
              type="text"
              placeholder="docs 配下の下位パス（任意）"
              value={docInput.path}
              oninput={(event) => (docInput.path = event.currentTarget.value)}
            />
          </div>
        </div>
        <p class="hint">
          本文は `doc create` では渡せません（doc-5 §3 の create 写像は title・type・path のみ）。
          作成後、上の一覧から「編集」して本文を入れます。
        </p>
        <div class="actions">
          <button
            type="button"
            disabled={docCreateIssue.state !== "ready"}
            title={why(docCreateIssue)}
            onclick={createDoc}
          >
            文書を作成
          </button>
          {#if docCreateIssue.state === "blocked"}
            <span class="reason">{docCreateIssue.reason}</span>
          {/if}
        </div>
      </div>
    </section>

    <!-- マイルストーン (doc-5 §3.2, doc-9 §4.2, AC #3/#5) -->
    <section>
      <h2>マイルストーン</h2>

      {#if project.milestones.length === 0}
        <p class="neutral">マイルストーンはありません。</p>
      {:else}
        <ul class="records">
          {#each project.milestones as milestone (milestone.id)}
            <li>
              <div class="record-head">
                <span class="id">{milestone.id}</span>
                <span class="title">{milestone.title}</span>
              </div>
              {#if milestone.description}
                <p class="description">{milestone.description}</p>
              {:else}
                <p class="neutral">説明なし</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <!-- 作成後の説明編集は GUI に出さない (AC #3): the absence is stated where the descriptions
           are, and stated as a CLI constraint rather than as a missing feature. -->
      <p class="hint">{MILESTONE_DESCRIPTION_NOT_EDITABLE}</p>

      <div class="create-panel">
        <h3>マイルストーンを作成（milestone add）</h3>
        <div class="field">
          <label for="milestone-name">名称（必須）</label>
          <input
            id="milestone-name"
            type="text"
            value={milestoneInput.name}
            oninput={(event) => (milestoneInput.name = event.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label for="milestone-description">説明（作成時のみ設定できます）</label>
          <input
            id="milestone-description"
            type="text"
            value={milestoneInput.description}
            oninput={(event) => (milestoneInput.description = event.currentTarget.value)}
          />
        </div>
        <div class="actions">
          <button
            type="button"
            disabled={milestoneIssue.state !== "ready"}
            title={why(milestoneIssue)}
            onclick={addMilestone}
          >
            マイルストーンを作成
          </button>
          {#if milestoneIssue.state === "blocked"}
            <span class="reason">{milestoneIssue.reason}</span>
          {/if}
        </div>
      </div>

      <!-- 照合不能により提供しない操作 (doc-9 §4.2/§5). Listed rather than omitted: doc-9 §5 requires
           the user to be told that the operation is not provided *and* that the reason is the absence
           of a check, not a detected divergence. No unchecked route is offered as a way around. -->
      <div class="withheld">
        <h3>現時点で提供しない操作</h3>
        <ul>
          {#each WITHHELD_MILESTONE_OPERATIONS as entry (entry.kind)}
            <li>
              <span class="label">{entry.label}</span>
              <code>{entry.mapping}</code>
              <p>{entry.reason}</p>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}
</div>

<style lang="scss">
  .manage {
    flex: 1;
    min-height: 0;
    padding: 0 0.75rem 1.5rem;
    overflow-y: auto;
    font-size: 0.78rem;
  }

  .target {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.4rem 0;

    label {
      display: flex;
      align-items: baseline;
      gap: 0.3rem;
      font-size: 0.74rem;
    }
  }

  section {
    margin-top: 1rem;
    padding-top: 0.6rem;
    border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.86rem;
  }

  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.5rem;
    min-width: 12rem;

    label,
    .label {
      font-size: 0.72rem;
      opacity: 0.85;
    }
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;

    .field {
      flex: 1;
    }
  }

  input[type="text"],
  select {
    padding: 0.25rem 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, canvas 88%, canvastext 12%);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
  }

  .list-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.3rem;
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 3px;
      font-size: 0.72rem;
    }
  }

  .add-row {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .records {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;

    li {
      padding: 0.3rem 0;
      border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
    }
  }

  .record-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;

    .id {
      font-family: ui-monospace, monospace;
      font-size: 0.72rem;
    }

    .meta {
      font-size: 0.7rem;
      opacity: 0.7;
    }
  }

  .description {
    margin: 0.2rem 0 0;
    font-size: 0.74rem;
    white-space: pre-wrap;
  }

  .editor-panel,
  .create-panel {
    margin-top: 0.6rem;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 5px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  button {
    padding: 0.15rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &.mini {
      padding: 0 0.3rem;
      font-size: 0.68rem;
    }
  }

  .hint,
  .reason {
    margin: 0.2rem 0 0;
    font-size: 0.7rem;
    opacity: 0.75;
  }

  .neutral {
    margin: 0.2rem 0;
    font-size: 0.72rem;
    opacity: 0.6;
  }

  .status {
    padding: 0.6rem 0;
    opacity: 0.7;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.74rem;
  }

  .ok {
    margin: 0.4rem 0;
    font-size: 0.74rem;
    opacity: 0.85;
  }

  // 照合不能 は競合でも失敗でもない (doc-9 §4.2/§5): its own family's colour, so it cannot be read
  // as a 版ずれ (decision-6 の「三者を同じ印へ混ぜない」).
  .warn,
  .undetectable,
  .withheld {
    margin: 0.4rem 0;
    padding: 0.3rem 0.4rem;
    border-left: 3px solid;
    font-size: 0.74rem;
  }

  .warn {
    border-left-color: var(--info);
    background: color-mix(in srgb, var(--info) 12%, transparent);
  }

  .undetectable,
  .withheld {
    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }

  .withheld {
    margin-top: 0.8rem;

    ul {
      margin: 0;
      padding-left: 1rem;
    }

    li {
      margin-bottom: 0.4rem;
    }

    code {
      font-size: 0.7rem;
    }

    p {
      margin: 0.15rem 0 0;
      font-size: 0.7rem;
      opacity: 0.85;
    }

    .label {
      margin-right: 0.3rem;
      font-weight: 600;
    }
  }
</style>
