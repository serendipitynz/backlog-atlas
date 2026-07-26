<script lang="ts">
  // タスク詳細画面 (doc-8): one task's every item on one surface, and the entry point for the
  // editing operations doc-8 §6 defines (TASK-36). Every edit is issued through the Backlog 更新
  // アダプター (doc-5) by the shell — this panel builds the 更新操作 and never touches a file.
  //
  // 参照系 (Type・References・Pull Request・Git 履歴) is read and shown for every 保存区分
  // (doc-8 §6.5); what changes with the 保存区分 is which operations are *offered*, and an
  // operation that is not offered carries the reason it is not (doc-5 §5).
  //
  // Bodies are shown as the file wrote them, not rendered as Markdown: a Markdown renderer is a
  // new production dependency, which AGENTS requires confirming before introducing.
  //
  // URLs are text, not links, for the same reason inverted: an <a href> inside the Tauri WebView
  // would navigate the app window away from Atlas, and opening an external browser needs a
  // capability this build does not have.
  import Editor from "./Editor.svelte";
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
  import {
    FILE_MISSING_REASON,
    PRIORITIES,
    TYPE_NOT_EDITABLE,
    acDeltaDroppedByRebase,
    acRows,
    buildSave,
    canRemoveLast,
    divergence,
    editAvailability,
    externallyChanged,
    isDirty,
    milestoneOptions,
    optionsFor,
    rebaseOnto,
    setAcMode,
    setField,
    setNotesMode,
    startSession,
    toggleAcCheck,
    toggleAcRemoval,
    transitionOffers,
    type ApplyOutcome,
    type EditSession,
    type SaveState,
    type TransitionOffer,
  } from "../lib/edit";
  import { CANONICAL_COLUMN_LABEL } from "../lib/swimlane";
  import type {
    CliReadiness,
    ProjectEntry,
    ProjectSnapshot,
    ReferenceKind,
    StorageState,
    TaskView,
    UpdateOperation,
  } from "../lib/wire";

  interface Props {
    view: TaskView;
    /** The snapshot the task was read from — milestone and dependency ids resolve inside it. */
    snapshot: ProjectSnapshot;
    /**
     * The file left the read result while this panel was open (an external move or delete), so
     * `view` is the last read that resolved it rather than the current one. The panel stays up
     * with its 未保存入力 instead of vanishing (doc-8 §6.4); nothing can be issued against a file
     * that is no longer there, so every operation is withheld with that as the reason.
     */
    missing: boolean;
    entry: ProjectEntry | null;
    history: HistoryState;
    /** 縮退 (doc-5 §5): `null` while the probe is still running. */
    readiness: CliReadiness | null;
    /** Issue one 更新操作 through the boundary. The shell owns the call and the re-read. */
    onapply: (action: UpdateOperation[]) => Promise<ApplyOutcome>;
    /** Follow a dependency to its task (doc-8 §3 解決先タスクへ辿れる). */
    onselect: (view: TaskView) => void;
    onreloadHistory: () => void;
    /** Whether an 編集セッション holds 未保存入力 — the shell guards selection changes with it. */
    ondirty: (dirty: boolean) => void;
    onclose: () => void;
  }

  let {
    view,
    snapshot,
    missing,
    entry,
    history,
    readiness,
    onapply,
    onselect,
    onreloadHistory,
    ondirty,
    onclose,
  }: Props = $props();

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

  // --- 編集セッション (doc-8 §6.3) ---------------------------------------------------------

  /** `null` outside a session: the panel is display-only until 編集 is pressed (明示保存の前提). */
  let session = $state<EditSession | null>(null);
  let saveState = $state<SaveState>({ state: "idle" });
  /** A destructive action awaiting its second press — see `CONFIRMED_ACTIONS` below. */
  let confirming = $state<string | null>(null);
  let busy = $state(false);
  /** Draft text of the "add one" boxes, which are inputs rather than part of the session. */
  let newLabel = $state("");
  let newDependency = $state("");
  let newReference = $state("");
  let newCriterion = $state("");

  let availability = $derived(editAvailability(view, readiness, missing));
  let dirty = $derived(session !== null && isDirty(session));
  let transitions = $derived(
    transitionOffers(view, { readiness, hasUnsavedInput: dirty, fileMissing: missing }),
  );
  /** 編集中の継続検出 (doc-8 §6.4): stated, never acted on — the input stays as the user left it. */
  let externalChange = $derived(
    !missing && session !== null && externallyChanged(session, view),
  );
  let plan = $derived(session === null ? null : buildSave(session));
  let acView = $derived(session === null ? [] : acRows(session));

  // The session belongs to one file. A different task in the same panel starts from that task's
  // own read rather than inheriting a draft written against another one; the shell asks before
  // it lets the selection change while the session is dirty.
  $effect(() => {
    const path = view.task.sourcePath;
    if (session !== null && session.baseline.task.sourcePath !== path) {
      session = null;
      saveState = { state: "idle" };
      confirming = null;
    }
  });

  $effect(() => {
    ondirty(dirty);
  });

  function edit<K extends keyof EditSession["draft"]>(
    key: K,
    value: EditSession["draft"][K],
  ): void {
    if (session !== null) session = setField(session, key, value);
  }

  function clearAddBoxes(): void {
    newLabel = "";
    newDependency = "";
    newReference = "";
    newCriterion = "";
  }

  function startEditing(): void {
    session = startSession(view);
    saveState = { state: "idle" };
    confirming = null;
    acDeltaDropped = false;
    clearAddBoxes();
  }

  function cancelEditing(): void {
    // 破棄前確認 (doc-8 §6.3): only when there is something to lose.
    if (dirty && confirming !== "cancel") {
      confirming = "cancel";
      return;
    }
    session = null;
    confirming = null;
    saveState = { state: "idle" };
    clearAddBoxes();
  }

  async function save(): Promise<void> {
    if (missing || session === null || plan === null || plan.state !== "ready" || busy) return;
    const submitted = plan.submitted;
    busy = true;
    try {
      const outcome = await onapply(plan.action);
      switch (outcome.state) {
        case "applied": {
          // 事後通知 (doc-9 §5): the re-read is already on `view`, so the comparison is against
          // what the file says now, not against what the CLI reported.
          const diverged = divergence(submitted, view);
          session = null;
          confirming = null;
          clearAddBoxes();
          saveState =
            diverged.length === 0 ? { state: "applied" } : { state: "diverged", fields: diverged };
          break;
        }
        case "conflict":
          // 未保存入力を保持したまま (doc-8 §6.4): the session stays open and the two paths of
          // doc-9 §5 are offered below.
          saveState = { state: "conflict", path: outcome.path };
          break;
        case "failed":
          // CLI 失敗 (doc-5 §5): nothing changed, the display is untouched, and the input stays
          // so the same save can be retried (doc-8 §6.3).
          saveState = { state: "failed", detail: outcome.detail };
          break;
      }
    } finally {
      busy = false;
    }
  }

  /** doc-9 §5 (i): drop the 未保存入力 and start again from the re-read the conflict brought. */
  function restartFromLatest(): void {
    session = startSession(view);
    saveState = { state: "idle" };
  }

  /** doc-9 §5 (ii): keep the input and move the session's baseline onto the latest read. */
  function reapplyOntoLatest(): void {
    if (session === null) return;
    // Stated before the rebase, since afterwards the two baselines are the same and the drop is
    // no longer visible — and a silently dropped AC operation is exactly what doc-8 §6.4 forbids.
    acDeltaDropped = acDeltaDroppedByRebase(session, view);
    session = rebaseOnto(session, view);
    saveState = { state: "idle" };
  }

  /** Whether the last rebase had to drop index-bound AC operations (see `acDeltaForCli`). */
  let acDeltaDropped = $state(false);

  function requestClose(): void {
    // 破棄前確認 (doc-8 §6.3): closing the panel loses 未保存入力 exactly as キャンセル does, so
    // it asks with the same words rather than being the one exit that does not.
    if (dirty && confirming !== "close") {
      confirming = "close";
      return;
    }
    onclose();
  }

  /**
   * Transitions ask for a second press. Not a general habit — none of these has a reverse
   * operation in v1.47.1 (doc-5 §3.1), so an accidental one cannot be undone from Atlas at all.
   */
  async function runTransition(offer: TransitionOffer): Promise<void> {
    if (!offer.enabled || busy) return;
    if (confirming !== offer.kind) {
      confirming = offer.kind;
      return;
    }
    confirming = null;
    busy = true;
    try {
      const outcome = await onapply([offer.operation]);
      saveState =
        outcome.state === "applied"
          ? { state: "applied" }
          : outcome.state === "conflict"
            ? { state: "conflict", path: outcome.path }
            : { state: "failed", detail: outcome.detail };
    } finally {
      busy = false;
    }
  }

  function addTo(values: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || values.includes(trimmed) ? values : [...values, trimmed];
  }

  function addCriterion(): void {
    if (session === null || session.draft.ac.mode !== "delta") return;
    const text = newCriterion.trim();
    if (text === "") return;
    const delta = session.draft.ac.delta;
    session = setField(session, "ac", {
      mode: "delta",
      delta: { ...delta, add: [...delta.add, text] },
    });
    newCriterion = "";
  }
</script>

{#snippet listEditor(
  values: string[],
  apply: (next: string[]) => void,
  draft: string,
  setDraft: (value: string) => void,
  placeholder: string,
  lastRemovalReason: string | null,
)}
  <ul class="list-edit">
    {#each values as value, index (index)}
      {@const removable = lastRemovalReason === null || canRemoveLast(values)}
      <li>
        <span class="url">{value}</span>
        <button
          type="button"
          class="mini"
          disabled={!removable}
          title={removable ? "削除" : (lastRemovalReason ?? "")}
          onclick={() => apply(values.filter((_, at) => at !== index))}
        >
          削除
        </button>
      </li>
    {/each}
  </ul>
  {#if lastRemovalReason !== null && values.length === 1}
    <p class="hint">{lastRemovalReason}</p>
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
      {#if missing}
        <span class="mark degraded">ファイル不明</span>
      {/if}
      <button type="button" class="close" onclick={requestClose}>
        {confirming === "close" ? "破棄して閉じる" : "閉じる"}
      </button>
      {#if confirming === "close"}
        <button type="button" class="close" onclick={() => (confirming = null)}>やめる</button>
      {/if}
    </div>

    {#if missing}
      <!-- doc-8 §6.4: an external move does not get to take the 未保存入力 with it. The panel
           stays up showing the last read that resolved, so the input can be copied out before it
           is discarded on purpose. -->
      <p class="warn">{FILE_MISSING_REASON}</p>
    {/if}

    {#if session === null}
      <h2>{task.title ?? "（title 不明）"}</h2>
    {:else}
      <label class="field">
        <span>title</span>
        <input
          type="text"
          value={session.draft.title}
          oninput={(event) => edit("title", event.currentTarget.value)}
        />
      </label>
    {/if}

    <dl class="facts">
      <dt>status</dt>
      <dd>
        {#if session !== null}
          <select
            aria-label="status"
            value={session.draft.status}
            onchange={(event) => edit("status", event.currentTarget.value)}
          >
            {#each optionsFor(task.status, snapshot.config.statuses) as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if status === null}
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
      <dd>
        {#if session !== null}
          <select
            aria-label="priority"
            value={session.draft.priority}
            onchange={(event) => edit("priority", event.currentTarget.value)}
          >
            {#each optionsFor(task.priority, PRIORITIES) as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else}
          {task.priority ?? "—"}
        {/if}
      </dd>

      <dt>assignee</dt>
      <dd>{task.assignee.length > 0 ? task.assignee.join(", ") : "—"}</dd>

      <dt>milestone</dt>
      <dd>
        {#if session !== null}
          <select
            aria-label="milestone"
            value={session.draft.milestone}
            onchange={(event) => edit("milestone", event.currentTarget.value)}
          >
            {#each milestoneOptions(snapshot, task.milestone) as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if milestone === null}
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

  <!-- 編集セッションの操作卓 (doc-8 §6.3). 明示保存 only: nothing on this panel writes as you
       type, and Enter is not one of the save keys (doc-8 §6.2). -->
  <section class="console">
    {#if session === null}
      {#if availability.state === "editable"}
        <button type="button" class="primary" onclick={startEditing}>編集</button>
      {:else}
        <button type="button" class="primary" disabled title={availability.reason}>編集</button>
        <p class="hint">{availability.reason}</p>
      {/if}
    {:else}
      <div class="buttons">
        <button
          type="button"
          class="primary"
          disabled={busy || plan === null || plan.state !== "ready"}
          title={plan !== null && plan.state === "refused" ? plan.reason : "保存 (Cmd/Ctrl+Enter)"}
          onclick={save}
        >
          {busy ? "保存中…" : "保存"}
        </button>
        <button type="button" onclick={cancelEditing}>
          {confirming === "cancel" ? "破棄してよいですか？（もう一度押す）" : "キャンセル"}
        </button>
        {#if confirming === "cancel"}
          <button type="button" onclick={() => (confirming = null)}>編集に戻る</button>
        {/if}
      </div>
      <p class="hint">
        保存は保存ボタンか Cmd/Ctrl+Enter です。Enter は改行（IME 変換中は変換確定）で、保存には
        割り当てません（doc-8 §6.2）。
      </p>
      {#if plan !== null && plan.state === "refused"}
        <p class="warn">{plan.reason}</p>
      {:else if plan !== null && plan.state === "nothingToSave"}
        <p class="hint">変更はまだありません。</p>
      {/if}
      {#if externalChange}
        <p class="warn">
          このタスクのファイルが編集中に外部で変わりました。入力はそのまま保持しています。保存時に
          更新前競合検出を通します（doc-8 §6.4）。
        </p>
      {/if}
    {/if}

    {#if saveState.state === "applied"}
      <p class="ok">保存しました。</p>
    {:else if saveState.state === "failed"}
      <!-- CLI 失敗 (doc-5 §5): the display above is unchanged and the input is still here. -->
      <p class="warn">保存できませんでした: {saveState.detail}</p>
    {:else if saveState.state === "conflict"}
      <!-- 防げる競合の未然提示 (doc-9 §5): the check stopped this before the CLI ran. -->
      <div class="conflict">
        <p>
          更新前競合を検出したため、CLI を起動せずに保存を止めました（{saveState.path} が読み取り後に
          外部で変わりました）。未保存入力は保持しています。
        </p>
        <div class="buttons">
          <button type="button" onclick={restartFromLatest}>
            最新を読み直してやり直す（入力を破棄）
          </button>
          <button type="button" onclick={reapplyOntoLatest}>
            入力を保持して最新版へ再適用する
          </button>
        </div>
        <p class="hint">
          再適用は、触った項目だけを最新版の上に載せ直します（触っていない項目は最新のままです）。
          内容を確かめてからもう一度保存してください。
        </p>
      </div>
    {:else if saveState.state === "diverged"}
      <!-- 防げない喪失の事後通知 (doc-9 §4.1/§5). Deliberately worded apart from the conflict
           above: this one was *not* prevented, and what an overwrite removed cannot be shown. -->
      <div class="conflict">
        <p>
          保存は適用されましたが、再読込した内容が送信した内容と一致しません（{saveState.fields.join(
            "・",
          )}）。照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。
        </p>
        <p class="hint">
          更新前競合検出は best-effort であり、この窓に入った外部更新は防げません。窓内に入った更新が
          上書きで失われた場合、その内容は表示も復元もできません（doc-9 §4.1）。
        </p>
      </div>
    {/if}

    {#if acDeltaDropped}
      <!-- Stated rather than done quietly: the rebase kept every other field's input, and a
           silently dropped AC operation would look like the save simply ignored it. -->
      <p class="warn">
        最新版では Acceptance Criteria の並びが変わっていたため、番号で指していた削除・チェックの
        指定は取り消しました（同じ番号が別の項目を指すため）。必要なら指定し直してください。
      </p>
    {/if}
  </section>

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
    {#if session !== null}
      <p class="hint">{TYPE_NOT_EDITABLE}</p>
    {/if}
  </section>

  <section>
    <h3>通常ラベル</h3>
    {#if session === null}
      {#if task.labels.length === 0}
        <p class="neutral">なし</p>
      {:else}
        <ul class="chips">
          {#each task.labels as label, index (index)}
            <li class="label">{label}</li>
          {/each}
        </ul>
      {/if}
    {:else}
      {@render listEditor(
        session.draft.labels,
        (next) => edit("labels", next),
        newLabel,
        (value) => (newLabel = value),
        "追加するラベル",
        null,
      )}
    {/if}
  </section>

  <section>
    <h3>Description</h3>
    {#if session === null}
      {#if task.description}
        <pre class="body">{task.description}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <Editor
        label="Description"
        value={session.draft.description}
        rows={8}
        onchange={(value) => edit("description", value)}
        onsave={save}
      />
    {/if}
  </section>

  <section>
    <h3>Acceptance Criteria <span class="count">{ac.checked} / {ac.total}</span></h3>
    {#if session === null}
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
    {:else}
      <!-- 項目単位操作 と 全体差し替え を区別する (doc-5 §3/§3.1): the CLI has no single option that
           sets all criteria, so the composite replacement is its own mode, entered on purpose. -->
      <div class="modes">
        <button
          type="button"
          class="mini"
          class:on={session.draft.ac.mode === "delta"}
          onclick={() => (session = setAcMode(session!, "delta"))}
        >
          項目単位（増減・チェック）
        </button>
        <button
          type="button"
          class="mini"
          class:on={session.draft.ac.mode === "replace"}
          onclick={() => (session = setAcMode(session!, "replace"))}
        >
          全体差し替え
        </button>
      </div>

      {#if session.draft.ac.mode === "delta"}
        <ul class="ac">
          {#each acView as row (row.number)}
            <li class:checked={row.checked} class:removed={row.removed}>
              <button
                type="button"
                class="box"
                aria-label={`#${row.number} を${row.checked ? "未完了" : "完了"}にする`}
                onclick={() => (session = toggleAcCheck(session!, row.number))}
              >
                {row.checked ? "☑" : "☐"}
              </button>
              <span class="number">#{row.number}</span>
              <span class="text">{row.text}</span>
              <button
                type="button"
                class="mini"
                onclick={() => (session = toggleAcRemoval(session!, row.number))}
              >
                {row.removed ? "削除を取り消す" : "削除"}
              </button>
            </li>
          {/each}
        </ul>
        {#each session.draft.ac.delta.add as text, index (index)}
          <p class="hint">追加予定: {text}</p>
        {/each}
        <div class="add-row">
          <input
            type="text"
            placeholder="追加する Acceptance Criterion"
            value={newCriterion}
            oninput={(event) => (newCriterion = event.currentTarget.value)}
          />
          <button type="button" class="mini" onclick={addCriterion}>追加</button>
        </div>
        <p class="hint">
          既存項目の本文は項目単位では変えられません（CLI に本文編集の手段がないため）。本文を変える
          ときは全体差し替えを使います。
        </p>
      {:else}
        {@const items = session.draft.ac.mode === "replace" ? session.draft.ac.items : []}
        <ul class="ac-replace">
          {#each items as item, index (index)}
            <li>
              <label class="check">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onchange={(event) =>
                    edit("ac", {
                      mode: "replace",
                      items: items.map((entry, at) =>
                        at === index
                          ? { ...entry, checked: event.currentTarget.checked }
                          : entry,
                      ),
                    })}
                />
                完了
              </label>
              <Editor
                label={`Acceptance Criterion ${index + 1}`}
                value={item.text}
                rows={2}
                onchange={(value) =>
                  edit("ac", {
                    mode: "replace",
                    items: items.map((entry, at) =>
                      at === index ? { ...entry, text: value } : entry,
                    ),
                  })}
                onsave={save}
              />
              <button
                type="button"
                class="mini"
                onclick={() =>
                  edit("ac", {
                    mode: "replace",
                    items: items.filter((_, at) => at !== index),
                  })}
              >
                削除
              </button>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          class="mini"
          onclick={() =>
            edit("ac", { mode: "replace", items: [...items, { text: "", checked: false }] })}
        >
          項目を追加
        </button>
        <p class="hint">
          保存時に既存の全項目を削除してから、ここにある項目を並び順どおり作り直します（1 回の
          task edit にまとめます。doc-5 §3）。
        </p>
      {/if}
    {/if}
  </section>

  <section>
    <h3>実装計画</h3>
    {#if session === null}
      {#if task.implementationPlan}
        <pre class="body">{task.implementationPlan}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <Editor
        label="実装計画"
        value={session.draft.plan}
        onchange={(value) => edit("plan", value)}
        onsave={save}
      />
    {/if}
  </section>

  <section>
    <h3>実装ノート</h3>
    {#if session === null}
      {#if task.implementationNotes}
        <pre class="body">{task.implementationNotes}</pre>
      {:else}
        <p class="neutral">なし</p>
      {/if}
    {:else}
      <div class="modes">
        <button
          type="button"
          class="mini"
          class:on={session.draft.notesMode === "set"}
          onclick={() => (session = setNotesMode(session!, "set"))}
        >
          置換（--notes）
        </button>
        <button
          type="button"
          class="mini"
          class:on={session.draft.notesMode === "append"}
          onclick={() => (session = setNotesMode(session!, "append"))}
        >
          追記（--append-notes）
        </button>
      </div>
      <Editor
        label={session.draft.notesMode === "append" ? "実装ノート（追記）" : "実装ノート"}
        value={session.draft.notes}
        onchange={(value) => edit("notes", value)}
        onsave={save}
      />
    {/if}
  </section>

  <section>
    <h3>dependencies</h3>
    {#if session === null}
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
    {:else}
      {@render listEditor(
        session.draft.dependencies,
        (next) => edit("dependencies", next),
        newDependency,
        (value) => (newDependency = value),
        "TASK-ID",
        "dependencies は最後の 1 件を削除できません（CLI に空集合化の手段がないため。doc-5 §3.1）",
      )}
      <p class="hint">保存時は既存を含む全集合で置き換えます（doc-5 §3 の非空全置換）。</p>
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
    {#if session !== null}
      <p class="hint">
        Pull Request URL の登録は References の編集です（doc-8 §6）。下の References 欄へ足すと、
        既存参照を含む非空全集合で置き換えます。
      </p>
    {/if}
  </section>

  <section>
    <h3>References</h3>
    {#if session === null}
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
    {:else}
      <!-- The list is every reference, Pull Request URLs included: `--ref` replaces the whole set,
           so editing anything less would drop the rest (doc-5 §3, doc-8 §6). -->
      {@render listEditor(
        session.draft.references,
        (next) => edit("references", next),
        newReference,
        (value) => (newReference = value),
        "URL",
        "References は最後の 1 件を削除できません（CLI に空集合化の手段がないため。doc-5 §3.1）",
      )}
      <p class="hint">保存時は既存を含む全集合で置き換えます（doc-5 §3 の非空全置換）。</p>
    {/if}
  </section>

  <!-- 状態遷移の入口 (doc-8 §6.5, doc-5 §3.2/§3.3). Offered per 保存区分; an operation the CLI does
       not have is not drawn at all, and one it has but cannot run now says why. -->
  <section class="transitions">
    <h3>状態遷移</h3>
    {#if transitions.state === "none"}
      <p class="neutral">{transitions.reason}</p>
    {:else}
      <ul class="transition-list">
        {#each transitions.offers as offer (offer.kind)}
          <li>
            <button
              type="button"
              class="transition"
              disabled={!offer.enabled || busy}
              title={offer.reason ?? offer.effect}
              onclick={() => runTransition(offer)}
            >
              {confirming === offer.kind ? `${offer.label}：実行してよいですか？（もう一度押す）` : offer.label}
            </button>
            {#if confirming === offer.kind}
              <button type="button" class="mini" onclick={() => (confirming = null)}>やめる</button>
            {/if}
            <span class="effect">{offer.reason ?? offer.effect}</span>
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
    管理ファイルは Backlog CLI 経由でのみ更新します。外部エディタ経路は TASK-37 で実装します。
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
  .prs,
  .list-edit,
  .ac-replace,
  .transition-list {
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

    // A criterion marked for removal is still listed: the save has not happened, and taking it out
    // of the list would hide what the mark is about to do.
    &.removed .text {
      text-decoration: line-through;
      opacity: 0.55;
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
  .prs li,
  .list-edit li {
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

  // --- editing ---------------------------------------------------------------------------

  .console {
    gap: 0.3rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 4px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .add-row {
    display: flex;
    gap: 0.3rem;

    input {
      flex: 1;
      min-width: 0;
    }
  }

  input[type="text"],
  select {
    padding: 0.15rem 0.3rem;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, canvas 88%, canvastext 12%);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.7rem;

    span {
      opacity: 0.6;
    }
  }

  button {
    padding: 0.1rem 0.4rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  button.primary {
    background: color-mix(in srgb, currentColor 14%, transparent);
    font-weight: 600;
  }

  button.mini {
    font-size: 0.68rem;
  }

  button.mini.on {
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .ac button.box {
    padding: 0;
    border: none;
    background: none;
    font-size: 0.8rem;
  }

  .ac-replace li {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
  }

  .transition-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
  }

  .effect {
    flex-basis: 100%;
    font-size: 0.68rem;
    opacity: 0.6;
  }

  .hint {
    font-size: 0.68rem;
    opacity: 0.65;
  }

  .ok {
    font-size: 0.7rem;
    opacity: 0.8;
  }

  // 競合・失敗は縮退印と別の表現 (doc-9 §5): the file reads fine, its version moved.
  .warn,
  .conflict {
    padding: 0.3rem 0.4rem;
    border-left: 3px solid #2f6f9f;
    background: color-mix(in srgb, #2f6f9f 12%, transparent);
    font-size: 0.72rem;
  }

  .conflict {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
</style>
