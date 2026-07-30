<script lang="ts">
  // 台帳管理画面 (doc-3 §4, TASK-39): the 登録・削除・更新 of doc-3's ledger operations, as the
  // screen the README's「複数プロジェクトの登録・管理」points at.
  //
  // Every action here goes through the ledger commands and touches nothing else: no Backlog root's
  // management files, no Git repository, no `backlog` CLI (doc-3 §2.1/§4.2). The one thing written is
  // the ledger file, by Atlas, in its own app-config dir — which is why this screen shows that path
  // rather than hiding it.
  //
  // The rules live in `lib/ledger.ts` as pure functions; this component is layout, local form state
  // and the callbacks. Text inputs bind to *local* state and are never rewritten while the user is
  // typing — the same IME rule `FilterBar` follows — so the "follow the default" conveniences are
  // buttons the user presses, not effects that reformat a field mid-composition.
  import {
    CANONICAL_STATUS_NAMES,
    EMPTY_REGISTER_INPUT,
    aliasKeyEffect,
    editOf,
    editProblems,
    parentPath,
    registerProblems,
    resolvedBacklogRoot,
    toRegisterRequest,
    toUpdateRequest,
    type EntryEdit,
    type FieldProblem,
    type LedgerActionResult,
    type LedgerField,
    type RefusalReport,
    type RegisterInput,
  } from "../lib/ledger";
  import type { ProjectEntry, ProjectLoad, RegisterRequest, UpdateRequest } from "../lib/wire";

  interface Props {
    entries: ProjectEntry[];
    /** True when the ledger is read-only (doc-3 §2.2): every edit here is withheld with the reason. */
    readOnly: boolean;
    /** Each entry's read outcome, so the list can say whether Atlas can actually read the root. */
    loads: Record<string, ProjectLoad>;
    /**
     * True while *any* ledger command is in flight. The shell issues them one at a time — two in
     * flight can answer out of order and the loser's snapshot would roll the list back — so every
     * control that writes the ledger is withheld while one is running, not just the one that started
     * it. Distinct from this screen's own `registerBusy` / `busySlug`, which say *which* control is
     * acting and are only about what is shown.
     */
    busy: boolean;
    /** True while the ledger is being read: an empty list is not yet known to be empty. */
    listLoading: boolean;
    /**
     * Why the list could not be read, when that is why it is empty. Kept apart from an empty ledger
     * because the two call for opposite things: one is "register your first project", the other is
     * "the ledger file could not be read" — and presenting the second as the first invites a
     * registration into a ledger that will refuse it.
     */
    listFailure: string | null;
    /** The ledger file's path (doc-3 §2.1); `null` until it is known. */
    ledgerPath: string | null;
    /** Open the OS folder picker; resolves to `null` when the user cancels. */
    onpickDirectory: (title: string) => Promise<string | null>;
    /** The slug a project root would get by default (doc-3 §3.1), asked of the Rust side. */
    ondefaultSlug: (projectRoot: string) => Promise<string | null>;
    onregister: (request: RegisterRequest) => Promise<LedgerActionResult>;
    onupdate: (request: UpdateRequest) => Promise<LedgerActionResult>;
    onremove: (slug: string) => Promise<LedgerActionResult>;
  }

  let {
    entries,
    readOnly,
    loads,
    busy,
    listLoading,
    listFailure,
    ledgerPath,
    onpickDirectory,
    ondefaultSlug,
    onregister,
    onupdate,
    onremove,
  }: Props = $props();

  // --- 登録 (doc-3 §4.1) ---------------------------------------------------------------------

  let registerInput = $state<RegisterInput>({ ...EMPTY_REGISTER_INPUT });
  /**
   * The default slug for the project root as it currently reads (doc-3 §3.1). Shown beside the slug
   * field rather than written into it: the field being empty is what *means* "derive it", so filling
   * it in would turn the ledger's own derivation into a value this screen sent.
   */
  let defaultSlug = $state<string | null>(null);
  /** Distinguishes 未取得 from「導出できない」— the second is what makes a slug mandatory (AC #6). */
  let defaultSlugKnown = $state(false);
  let registerReport = $state<RefusalReport | null>(null);
  let registerBusy = $state(false);
  let registered = $state<string | null>(null);

  let taken = $derived(entries.map((entry) => entry.slug));
  let registerIssues = $derived(registerProblems(registerInput, taken));
  let previewBacklogRoot = $derived(resolvedBacklogRoot(registerInput));
  let canRegister = $derived(!readOnly && !busy && !registerBusy && registerIssues.length === 0);
  /**
   * なぜ登録できないか、できないときだけ (doc-11 §5). Same shape as `entryActionsBlocked`: one string
   * that drives both the withheld state and the sentence under the button, so the two cannot disagree.
   * 入力の指摘 (`registerIssues`) は欄ごとに出ているが、それが登録を止めていることは別に述べる。
   */
  let registerBlocked = $derived(
    readOnly
      ? "台帳が読み取り専用のため、プロジェクトを登録できません（doc-3 §2.2）。"
      : busy || registerBusy
        ? "台帳の更新を実行中です。完了するまで登録は始められません。"
        : registerIssues.length > 0
          ? "入力に問題があります（各欄の指摘を参照）。"
          : null,
  );

  async function readDefaultSlug(): Promise<void> {
    const projectRoot = registerInput.projectRoot.trim();
    if (projectRoot === "") {
      defaultSlug = null;
      defaultSlugKnown = false;
      return;
    }
    defaultSlug = await ondefaultSlug(projectRoot);
    defaultSlugKnown = true;
  }

  async function pickRegisterProjectRoot(): Promise<void> {
    const picked = await onpickDirectory("プロジェクトルートを選択");
    if (picked === null) return;
    registerInput.projectRoot = picked;
    await readDefaultSlug();
  }

  /**
   * doc-3 §4.1 step 1 lets the user name the Backlog root instead of the project root. The project
   * root is still required — it is the base for Git・PR 参照 (doc-3 §3) — so picking a Backlog root
   * offers its parent as the project root *in the field*, for the user to accept or correct. Guessing
   * it silently would attach the wrong repository to the entry.
   */
  async function pickRegisterBacklogRoot(): Promise<void> {
    const picked = await onpickDirectory("Backlog ルートを選択");
    if (picked === null) return;
    registerInput.backlogRoot = picked;
    if (registerInput.projectRoot.trim() === "") {
      const parent = parentPath(picked);
      if (parent !== null) {
        registerInput.projectRoot = parent;
        await readDefaultSlug();
      }
    }
  }

  async function submitRegister(): Promise<void> {
    if (!canRegister) return;
    registerBusy = true;
    registerReport = null;
    try {
      const result = await onregister(toRegisterRequest(registerInput));
      if (result.state === "refused") {
        registerReport = result.report;
        return;
      }
      registered = result.slug;
      registerInput = { ...EMPTY_REGISTER_INPUT };
      defaultSlug = null;
      defaultSlugKnown = false;
    } finally {
      registerBusy = false;
    }
  }

  // --- 更新・削除 (doc-3 §4.2/§4.3) -----------------------------------------------------------

  /** The entry being edited, with its form. One at a time: two open forms would both claim 保存. */
  let editing = $state<{ slug: string; edit: EntryEdit } | null>(null);
  /**
   * A refused 更新・削除・並べ替え, tagged with the entry it was about. Tagged rather than global: a
   * removal's refusal has to appear next to *that* entry's confirmation, and an edit's next to its
   * form — a single screen-level message would put a removal failure under whichever form is open.
   */
  let entryReport = $state<{ slug: string; report: RefusalReport } | null>(null);
  /** The entry whose removal is awaiting confirmation — doc-3 §4.2 is easy to misread as deleting. */
  let removing = $state<string | null>(null);
  let busySlug = $state<string | null>(null);
  let notice = $state<string | null>(null);

  let editIssues = $derived(editing === null ? [] : editProblems(editing.edit));
  let editEntry = $derived(entries.find((entry) => entry.slug === editing?.slug) ?? null);

  function startEdit(entry: ProjectEntry): void {
    editing = { slug: entry.slug, edit: editOf(entry) };
    entryReport = null;
    removing = null;
    notice = null;
  }

  function cancelEdit(): void {
    editing = null;
    entryReport = null;
  }

  /** The refusal to show for one entry, if the last one was about it. */
  function reportFor(slug: string): RefusalReport | null {
    return entryReport?.slug === slug ? entryReport.report : null;
  }

  /** Where an entry's blocked controls send `aria-describedby` (doc-11 §5). */
  const ENTRY_BLOCKED_ID = "ledger-entry-blocked";
  const REGISTER_BLOCKED_ID = "ledger-register-blocked";
  const READ_ONLY_ID = "ledger-read-only";
  const READ_ONLY_PICK_REASON =
    "台帳が読み取り専用のため、フォルダを選んでも登録できません（doc-3 §2.2）。";
  const orderId = (slug: string): string => `ledger-order-${slug}`;
  /** One edit form is open at a time (`editing`), so its reason needs no per-entry id. */
  const EDIT_BLOCKED_ID = "ledger-edit-blocked";

  /**
   * なぜ登録済みエントリの操作が押せないか、押せないときだけ (doc-11 §5). One reason for 並べ替え・編集・
   * 削除・保存 together, because one thing blocks them all at a time — so it is written once above the
   * list and each control is bound to it, instead of the same sentence appearing on every entry.
   */
  let entryActionsBlocked = $derived(
    // Ordered as the obstacles are: a ledger that cannot be written blocks everything whatever else
    // is going on, and an action already in flight is the next thing in the way.
    readOnly
      ? "台帳が読み取り専用のため、登録済みプロジェクトの並べ替え・編集・削除はできません（doc-3 §2.2）。"
      : busy || busySlug !== null
        ? "台帳の更新を実行中です。完了するまで次の操作は始められません。"
        : null,
  );

  /** 開いている編集フォームの 保存 が押せない理由 (doc-11 §5). Its 入力の指摘 are shown field by field
   * above the button; that they are what stops the save is a separate thing to say. */
  let editSaveBlocked = $derived(
    entryActionsBlocked ??
      (editIssues.length > 0 ? "入力に問題があります（上の指摘を参照）。" : null),
  );

  /** Which of the two reasons an arrow is stopped by — the shared one, or its own end of the list. */
  function arrowBlocked(index: number, direction: -1 | 1): string | null {
    if (entryActionsBlocked !== null) return entryActionsBlocked;
    if (direction === -1 && index === 0) return "先頭のため、これ以上は上へ動かせません。";
    if (direction === 1 && index === entries.length - 1) {
      return "末尾のため、これ以上は下へ動かせません。";
    }
    return null;
  }

  /**
   * The element that carries a blocked control's reason: the one shared by the whole list when that is
   * what stopped it, and otherwise `ownId` — the element the caller put its own reason in. An arrow's
   * `ownId` is the entry's 表示順 (「n / m 番目」), which is the end-of-list reason stated as a fact and
   * is on screen whether or not any arrow is blocked — the device タスク詳細's 前後移動 already uses.
   */
  function blockedBy(reason: string | null, ownId: string): string | undefined {
    if (reason === null) return undefined;
    return reason === entryActionsBlocked ? ENTRY_BLOCKED_ID : ownId;
  }

  /**
   * Move one entry in the display order (doc-3 §4.3). Awaited rather than fired and forgotten: a
   * refusal here — a ledger that turned read-only since the screen was drawn, an entry another window
   * removed — would otherwise be a button that silently did nothing.
   */
  async function reorder(slug: string, newIndex: number): Promise<void> {
    busySlug = slug;
    entryReport = null;
    try {
      const result = await onupdate({ slug, new_index: newIndex });
      if (result.state === "refused") entryReport = { slug, report: result.report };
    } finally {
      busySlug = null;
    }
  }

  /** The statuses this project declares, or `null` when its root is not currently readable. */
  function declaredStatuses(slug: string): string[] | null {
    const load = loads[slug];
    return load?.state === "loaded" ? load.project.config.statuses : null;
  }

  function readState(slug: string): { label: string; kind: "loaded" | "unreadable" | "pending" } {
    const load = loads[slug];
    if (load === undefined) return { label: "未読み込み", kind: "pending" };
    return load.state === "loaded"
      ? { label: "読み取り可", kind: "loaded" }
      : { label: "ルート読取不能", kind: "unreadable" };
  }

  function addAliasRow(): void {
    editing?.edit.aliases.push({ key: "", value: CANONICAL_STATUS_NAMES[0] });
  }

  function removeAliasRow(index: number): void {
    editing?.edit.aliases.splice(index, 1);
  }

  /** Set the Backlog root to the default under the project root as the form now has it (doc-3 §3). */
  function followBacklogDefault(): void {
    if (editing === null) return;
    editing.edit.backlogRoot = resolvedBacklogRoot({
      projectRoot: editing.edit.projectRoot,
      backlogRoot: "",
      slug: "",
    });
  }

  async function pickEditRoot(field: "projectRoot" | "backlogRoot"): Promise<void> {
    if (editing === null) return;
    const picked = await onpickDirectory(
      field === "projectRoot" ? "プロジェクトルートを選択" : "Backlog ルートを選択",
    );
    if (picked === null) return;
    editing.edit[field] = picked;
  }

  async function submitEdit(): Promise<void> {
    if (editing === null || editEntry === null || readOnly || editIssues.length > 0) return;
    const request = toUpdateRequest(editEntry, editing.edit);
    if (request === null) {
      // Nothing to write: reported rather than sent, so a no-op does not rewrite the ledger file
      // and does not look like a move (which would close the project's open session).
      entryReport = { slug: editing.slug, report: { message: "変更がありません。", field: null } };
      return;
    }
    busySlug = editing.slug;
    entryReport = null;
    try {
      const result = await onupdate(request);
      if (result.state === "refused") {
        entryReport = { slug: request.slug, report: result.report };
        return;
      }
      notice = `${result.slug} の台帳エントリを更新しました。`;
      editing = null;
    } finally {
      busySlug = null;
    }
  }

  async function confirmRemove(slug: string): Promise<void> {
    busySlug = slug;
    entryReport = null;
    try {
      const result = await onremove(slug);
      if (result.state === "refused") {
        entryReport = { slug, report: result.report };
        return;
      }
      removing = null;
      if (editing?.slug === slug) editing = null;
      notice = `${slug} を台帳から外しました（対象プロジェクトのファイルは変更していません）。`;
    } finally {
      busySlug = null;
    }
  }

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }
</script>

<section class="ledger">
  <!-- The screen is named by the shell's heading, so this starts at the section level rather than
       repeating it. -->
  <header>
    <p class="where">
      台帳ファイル: <code>{ledgerPath ?? "確認中…"}</code>
      <!-- doc-3 §2.1: the registration is Atlas's own configuration. Stated on the screen because
           the invariant is invisible otherwise — and it is what makes 登録・削除 safe to press. -->
      <span class="aside">
        （Atlas 専用の設定ファイルです。いずれの Backlog ルートにも登録情報は書きません）
      </span>
    </p>
    {#if readOnly}
      <!-- 画面全体に効く無効化理由 (doc-11 §5): the folder pickers below bind to this rather than
           repeating it, since it sits above them and is on screen the whole time it applies. -->
      <p class="readonly" id={READ_ONLY_ID}>
        台帳ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。
        登録・削除・更新はできません（doc-3 §2.2）。
      </p>
    {/if}
  </header>

  {#if notice}
    <p class="notice">{notice}</p>
  {/if}

  <!-- 一覧 (AC #1) ------------------------------------------------------------------------- -->
  <div class="entries">
    <h2>登録済みプロジェクト（{entries.length} 件）</h2>
    {#if entries.length === 0 && listLoading}
      <p class="empty">読み込み中…</p>
    {:else if entries.length === 0 && listFailure !== null}
      <p class="problem">
        台帳の一覧を読み込めていません（{listFailure}）。登録がないのではなく、
        台帳ファイルを読めていない可能性があります。
      </p>
    {:else if entries.length === 0}
      <p class="empty">まだ登録がありません。下の「プロジェクトを登録」から追加してください。</p>
    {:else}
      {#if entryActionsBlocked !== null}
        <!-- 無効化の理由は常時表示で置き、`title` を唯一の格納先にしない (doc-11 §5). Written once for the
             whole list: 並べ替え・編集・削除 are stopped by one thing at a time, and repeating it on
             every entry would put the same sentence on screen as many times as there are projects. -->
        <p class="blocked-note" id={ENTRY_BLOCKED_ID}>{entryActionsBlocked}</p>
      {/if}
      <ul>
        {#each entries as entry, index (entry.slug)}
          {@const state = readState(entry.slug)}
          {@const upBlocked = arrowBlocked(index, -1)}
          {@const downBlocked = arrowBlocked(index, 1)}
          <li>
            <div class="entry">
              <div class="identity">
                <span class="slug">{entry.slug}</span>
                <!-- doc-3 §3.1: the slug is the cross-task-id's left side and the key Git history is
                     shown under, so it cannot be edited — a rename is a remove and a re-register. -->
                <span class="immutable" title="slug は登録後は変更できません（doc-3 §3.1）">
                  slug 不変
                </span>
                <span class="read" data-kind={state.kind}>{state.label}</span>
              </div>
              <dl>
                <dt>プロジェクトルート</dt>
                <dd><code>{entry.project_root}</code></dd>
                <dt>Backlog ルート</dt>
                <dd><code>{entry.backlog_root}</code></dd>
                <dt>Git remote</dt>
                <dd>{entry.git_remote_present ? "あり" : "なし"}</dd>
                <dt>status 別名表</dt>
                <dd>
                  {#if entry.status_aliases && Object.keys(entry.status_aliases).length > 0}
                    {Object.entries(entry.status_aliases)
                      .map(([key, value]) => `${key} → ${value}`)
                      .join(" / ")}
                  {:else}
                    なし
                  {/if}
                </dd>
              </dl>
              <div class="controls">
                <!-- 押せない操作は消さずに残す (doc-11 §5). The arrows keep `aria-disabled` rather than
                     `disabled` so they still take focus and their `aria-describedby` is reachable
                     without a pointer; `title` repeats the reason for the pointer only. -->
                <button
                  type="button"
                  aria-label="{entry.slug} の表示順を上へ"
                  aria-disabled={upBlocked !== null}
                  aria-describedby={blockedBy(upBlocked, orderId(entry.slug))}
                  title={upBlocked ?? "表示順を上へ"}
                  onclick={() => upBlocked === null && reorder(entry.slug, index - 1)}>↑</button
                >
                <button
                  type="button"
                  aria-label="{entry.slug} の表示順を下へ"
                  aria-disabled={downBlocked !== null}
                  aria-describedby={blockedBy(downBlocked, orderId(entry.slug))}
                  title={downBlocked ?? "表示順を下へ"}
                  onclick={() => downBlocked === null && reorder(entry.slug, index + 1)}>↓</button
                >
                <!-- 端での無効化の理由は、この表示順そのものが担う (doc-11 §5): 「1 / 5 番目」は矢印が
                     押せるかどうかによらず出ているので、理由を読むためにホバーする必要がない。 -->
                <span class="ordinal" id={orderId(entry.slug)}>
                  表示順 {index + 1} / {entries.length} 番目
                </span>
                <button
                  type="button"
                  aria-disabled={entryActionsBlocked !== null}
                  aria-describedby={blockedBy(entryActionsBlocked, orderId(entry.slug))}
                  title={entryActionsBlocked ?? "この登録を編集します"}
                  onclick={() =>
                    entryActionsBlocked === null &&
                    (editing?.slug === entry.slug ? cancelEdit() : startEdit(entry))}
                >
                  {editing?.slug === entry.slug ? "編集をやめる" : "編集"}
                </button>
                <button
                  type="button"
                  aria-disabled={entryActionsBlocked !== null}
                  aria-describedby={blockedBy(entryActionsBlocked, orderId(entry.slug))}
                  title={entryActionsBlocked ?? "この登録を台帳から外します"}
                  onclick={() => {
                    if (entryActionsBlocked !== null) return;
                    removing = entry.slug;
                    entryReport = null;
                  }}>削除</button
                >
              </div>
            </div>

            {#if reportFor(entry.slug) !== null && editing?.slug !== entry.slug}
              <!-- A removal's or a reorder's refusal, next to the entry it was about (AC #5). The
                   edit form shows its own copy, so this stays out of the way while it is open. -->
              <p class="problem in-entry">{reportFor(entry.slug)?.message}</p>
            {/if}

            {#if removing === entry.slug}
              <!-- doc-3 §4.2: removal takes the project out of what Atlas reads. Spelled out because
                   a 削除 button next to a project reads like deleting the project. -->
              <div class="confirm">
                <p>
                  {entry.slug} を台帳から外します。Atlas が読む対象から外れるだけで、
                  <strong>対象プロジェクトの Backlog ルート・管理ファイル・Git には触れません</strong>。
                  タスクの正本はそのまま残ります。
                </p>
                <div class="row">
                  <button
                    type="button"
                    aria-disabled={entryActionsBlocked !== null}
                    aria-describedby={blockedBy(entryActionsBlocked, orderId(entry.slug))}
                    title={entryActionsBlocked ?? "この登録を台帳から外します"}
                    onclick={() => entryActionsBlocked === null && confirmRemove(entry.slug)}
                    >台帳から外す</button
                  >
                  <button type="button" onclick={() => (removing = null)}>やめる</button>
                </div>
              </div>
            {/if}

            {#if editing?.slug === entry.slug}
              <!-- 更新 (doc-3 §4.3, AC #3): backlog_root・移動・remote 再判定・別名表・並び順のみ。 -->
              <div class="edit">
                <label>
                  <span class="caption">プロジェクトルート</span>
                  <span class="field">
                    <input type="text" bind:value={editing.edit.projectRoot} spellcheck="false" />
                    <button type="button" onclick={() => pickEditRoot("projectRoot")}>選択…</button>
                  </span>
                </label>
                {#if editing.edit.projectRoot.trim() !== entry.project_root}
                  <p class="hint">
                    同一プロジェクトの移動として扱います。slug は {entry.slug} のまま、
                    プロジェクトルートと Backlog ルートの両方を更新します（doc-3 §4.3）。
                    移動すると開いているプロジェクトは閉じ、次の読み込みで新しいルートを読みます。
                  </p>
                {/if}
                {#each problemsFor(editIssues, "projectRoot") as message (message)}
                  <p class="problem">{message}</p>
                {/each}

                <label>
                  <span class="caption">Backlog ルート</span>
                  <span class="field">
                    <input type="text" bind:value={editing.edit.backlogRoot} spellcheck="false" />
                    <button type="button" onclick={() => pickEditRoot("backlogRoot")}>選択…</button>
                    <button type="button" onclick={followBacklogDefault}>既定に合わせる</button>
                  </span>
                </label>
                {#each problemsFor(editIssues, "backlogRoot") as message (message)}
                  <p class="problem">{message}</p>
                {/each}

                <label class="check">
                  <input type="checkbox" bind:checked={editing.edit.redetectGitRemote} />
                  <span>
                    Git remote を再判定する（現在: {entry.git_remote_present ? "あり" : "なし"}）
                  </span>
                </label>

                <fieldset class="aliases">
                  <legend>status 別名表（doc-3 §3.3）</legend>
                  <p class="hint">
                    プロジェクト固有の status を正準ステータス列へ対応づけます。既定は空で、
                    Backlog.md 既定の 4 status は名称一致するため設定は要りません。
                  </p>
                  {#each editing.edit.aliases as row, rowIndex (rowIndex)}
                    {@const statuses = declaredStatuses(entry.slug)}
                    <div class="alias-row">
                      <input
                        type="text"
                        placeholder="プロジェクトの status"
                        list={`declared-${entry.slug}`}
                        bind:value={row.key}
                      />
                      <span aria-hidden="true">→</span>
                      <select bind:value={row.value}>
                        {#each CANONICAL_STATUS_NAMES as name (name)}
                          <option value={name}>{name}</option>
                        {/each}
                      </select>
                      <button type="button" title="この行を削除" onclick={() => removeAliasRow(rowIndex)}>
                        ×
                      </button>
                      {#if statuses !== null && row.key.trim() !== "" && aliasKeyEffect(row.key, statuses) === "undeclared"}
                        <!-- decision-4: an alias's subject is a status the project *declares*, so this
                             one would leave its tasks in the 未対応区画 regardless. -->
                        <span class="alias-warn">
                          config.yml が宣言していない status のため、この別名は効きません
                        </span>
                      {/if}
                    </div>
                  {/each}
                  <div class="row">
                    <button type="button" onclick={addAliasRow}>別名を追加</button>
                    {#if declaredStatuses(entry.slug) !== null}
                      <datalist id={`declared-${entry.slug}`}>
                        {#each declaredStatuses(entry.slug) ?? [] as status (status)}
                          <option value={status}></option>
                        {/each}
                      </datalist>
                    {/if}
                  </div>
                  {#each problemsFor(editIssues, "aliases") as message (message)}
                    <p class="problem">{message}</p>
                  {/each}
                </fieldset>

                {#if reportFor(entry.slug) !== null}
                  <p class="problem">{reportFor(entry.slug)?.message}</p>
                {/if}

                <div class="row">
                  <button
                    type="button"
                    class="primary"
                    aria-disabled={editSaveBlocked !== null}
                    aria-describedby={blockedBy(editSaveBlocked, EDIT_BLOCKED_ID)}
                    title={editSaveBlocked ?? "この登録の変更を台帳へ書きます"}
                    onclick={() => editSaveBlocked === null && submitEdit()}>保存</button
                  >
                  <button type="button" onclick={cancelEdit}>取消</button>
                </div>
                <!-- 入力の指摘は上に出ているが、それが保存を止めていることは別に述べる (doc-11 §5):
                     指摘が読めることと、なぜボタンが押せないかが分かることは同じではない。 -->
                {#if editSaveBlocked !== null && editSaveBlocked !== entryActionsBlocked}
                  <p class="blocked-note" id={EDIT_BLOCKED_ID}>{editSaveBlocked}</p>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- 登録 (doc-3 §4.1, AC #1/#5/#6) -------------------------------------------------------- -->
  <div class="register">
    <h2>プロジェクトを登録</h2>
    {#if registered}
      <p class="notice">
        {registered} を登録しました。スイムレーンに行が追加されます。
      </p>
    {/if}

    <label>
      <span class="caption">プロジェクトルート</span>
      <span class="field">
        <input
          type="text"
          placeholder="/Users/you/Projects/example"
          spellcheck="false"
          bind:value={registerInput.projectRoot}
          onchange={readDefaultSlug}
        />
        <button
          type="button"
          aria-disabled={readOnly}
          aria-describedby={readOnly ? READ_ONLY_ID : undefined}
          title={readOnly ? READ_ONLY_PICK_REASON : "フォルダを選びます"}
          onclick={() => !readOnly && pickRegisterProjectRoot()}>選択…</button
        >
      </span>
    </label>
    {#each problemsFor(registerIssues, "projectRoot") as message (message)}
      <p class="problem">{message}</p>
    {/each}

    <label>
      <span class="caption">Backlog ルート（任意）</span>
      <span class="field">
        <input
          type="text"
          placeholder={previewBacklogRoot === "" ? "既定は <プロジェクトルート>/backlog" : previewBacklogRoot}
          spellcheck="false"
          bind:value={registerInput.backlogRoot}
        />
        <button
          type="button"
          aria-disabled={readOnly}
          aria-describedby={readOnly ? READ_ONLY_ID : undefined}
          title={readOnly ? READ_ONLY_PICK_REASON : "フォルダを選びます"}
          onclick={() => !readOnly && pickRegisterBacklogRoot()}>選択…</button
        >
      </span>
    </label>
    {#if registerInput.backlogRoot.trim() === "" && previewBacklogRoot !== ""}
      <p class="hint">
        指定しない場合は <code>{previewBacklogRoot}</code> を Backlog ルートとして
        <code>config.yml</code> と <code>tasks/</code> を確認します（doc-3 §4.1）。
      </p>
    {/if}
    {#each problemsFor(registerIssues, "backlogRoot") as message (message)}
      <p class="problem">{message}</p>
    {/each}

    <label>
      <span class="caption">slug（任意）</span>
      <span class="field">
        <input
          type="text"
          placeholder={defaultSlug ?? "英小文字・数字・ハイフン"}
          spellcheck="false"
          bind:value={registerInput.slug}
        />
      </span>
    </label>
    {#if registerInput.slug.trim() === ""}
      {#if defaultSlug !== null}
        <p class="hint">
          未指定なら <code>{defaultSlug}</code> をプロジェクトルート名から導出して使います（doc-3 §3.1）。
          別の slug を使う場合はここに入力してください。
        </p>
      {:else if defaultSlugKnown}
        <!-- doc-3 §3.1: a directory name with no usable characters yields no default, so the user
             has to name one — AC #6's other half of「既定を導出しつつ別 slug を指定できる」. -->
        <p class="problem">
          プロジェクトルート名から slug を導出できません。slug を指定してください。
        </p>
      {/if}
    {/if}
    {#each problemsFor(registerIssues, "slug") as message (message)}
      <p class="problem">{message}</p>
    {/each}

    {#if registerReport}
      <!-- 登録失敗を理由付きで提示する (AC #5)。回復先の欄は `refusalReport` が決める (AC #6)。 -->
      <p class="problem">{registerReport.message}</p>
    {/if}

    <div class="row">
      <button
        type="button"
        class="primary"
        aria-disabled={!canRegister}
        aria-describedby={canRegister ? undefined : REGISTER_BLOCKED_ID}
        title={registerBlocked ?? "入力の内容で台帳へ登録します"}
        onclick={submitRegister}
      >
        {registerBusy ? "登録中…" : "登録"}
      </button>
    </div>
    <!-- 押せない理由を常時表示で置く (doc-11 §5): the 選択… buttons above point here too — the ledger
         being read-only is what stops all three, and it is stated once for them. -->
    {#if registerBlocked !== null}
      <p class="blocked-note" id={REGISTER_BLOCKED_ID}>{registerBlocked}</p>
    {/if}
  </div>
</section>

<style lang="scss">
  .ledger {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.75rem;
    font-size: 0.8rem;
  }

  h2 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
  }

  header {
    margin-bottom: 0.8rem;
  }

  .where {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.85;
  }

  .aside {
    opacity: 0.75;
  }

  // 読み取り専用縮退 (doc-3 §2.2). Not one of decision-6's 印の族 — nothing is degraded about the
  // *reading* of a project here — so it takes the neutral info hue.
  .readonly {
    margin: 0.4rem 0 0;
    padding: 0.35rem 0.5rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.75rem;
  }

  .notice {
    margin: 0 0 0.6rem;
    padding: 0.35rem 0.5rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.75rem;
  }

  .empty {
    margin: 0;
    opacity: 0.7;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    margin-bottom: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 5px;
  }

  .entry {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .identity {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 12rem;
  }

  .slug {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .immutable {
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    font-size: 0.65rem;
    opacity: 0.7;
  }

  // ルート読取不能 is decision-6's unreadable family; 読み取り可 and 未読み込み carry no hue, since
  // neither is a degrade.
  .read {
    font-size: 0.7rem;

    &[data-kind="unreadable"] {
      color: var(--mark-unreadable);
    }

    &[data-kind="pending"],
    &[data-kind="loaded"] {
      opacity: 0.7;
    }
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.5rem;
    margin: 0;
    flex: 1;
    min-width: 16rem;
    font-size: 0.72rem;

    dt {
      opacity: 0.65;
    }

    dd {
      margin: 0;
      word-break: break-all;
    }
  }

  code {
    font-size: 0.95em;
  }

  .controls,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
  }

  // 端の矢印が押せない理由そのもの (doc-11 §5). Always on screen, not only while an arrow is blocked:
  // a reason that appears at the moment it applies is one more thing to notice, and this one reads as
  // an ordinary fact about the entry either way.
  .ordinal {
    color: var(--muted);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  // 無効化の理由 (doc-11 §5): 副次の文なので `--muted` (doc-11 §2.1).
  .blocked-note {
    margin: 0 0 0.4rem;
    color: var(--muted);
    font-size: 0.72rem;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a `:disabled` rule here would outrank it.

    &.primary {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  .confirm,
  .edit {
    padding: 0.5rem;
    border-top: 1px solid var(--line);
  }

  .confirm {
    background: color-mix(in srgb, var(--info) 8%, transparent);

    p {
      margin: 0 0 0.4rem;
      font-size: 0.75rem;
    }
  }

  .edit {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;

    &.check {
      flex-direction: row;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
    }
  }

  .caption {
    font-size: 0.7rem;
    opacity: 0.7;
  }

  .field {
    display: flex;
    gap: 0.25rem;

    input[type="text"] {
      flex: 1;
      min-width: 0;
      padding: 0.15rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
    }
  }

  .hint {
    margin: 0;
    font-size: 0.7rem;
    opacity: 0.75;
  }

  // A form problem or a refusal reason. decision-6's unreadable hue is deliberately *not* reused:
  // this is an input the user can correct, not a root Atlas failed to read.
  .problem {
    margin: 0;
    font-size: 0.72rem;
    color: var(--mark-degraded);

    // The copy that sits under an entry's controls rather than inside a form.
    &.in-entry {
      padding: 0 0.5rem 0.5rem;
    }
  }

  .aliases {
    margin: 0;
    padding: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    legend {
      font-size: 0.72rem;
      opacity: 0.8;
    }
  }

  .alias-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.25rem;

    input[type="text"] {
      width: 12rem;
      padding: 0.15rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
    }

    select {
      padding: 0.1rem 0.2rem;
      font: inherit;
      font-size: 0.75rem;
    }
  }

  .alias-warn {
    font-size: 0.68rem;
    color: var(--mark-degraded);
  }

  .register {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: 40rem;
    margin-top: 1rem;
    padding: 0.6rem;
    border: 1px solid var(--line);
    border-radius: 5px;
  }
</style>
