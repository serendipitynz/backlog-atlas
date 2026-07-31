<script lang="ts">
  // プロジェクト詳細画面 (doc-10, TASK-55): 1 プロジェクトについてできることを 1 画面へ集める。
  //
  // TASK-39 の台帳管理画面（全プロジェクトの台帳）と TASK-40 のプロジェクト管理画面（1 プロジェクトの
  // 文書・マイルストーン・新規タスク）は粒度が違うものを並べていたので、利用者は同じプロジェクトを
  // 扱うのに 2 画面を行き来していた。ここは粒度を 1 プロジェクトへ揃えたもので、旧 2 画面は残らない。
  // 台帳全体に対する唯一の操作である「登録」だけは固定ヘッダへ移した（doc-3 §4・doc-7 §2.1）。
  //
  // 書き込み先は区画で分かれる。概要区画は台帳ファイルだけを書き (doc-3 §2.1)、文書・マイルストーン・
  // 新規タスクは Backlog 更新アダプター (doc-5) 経由で対象プロジェクトの管理ファイルを書く。この
  // コンポーネントはファイルパスも `invoke` も持たないので、doc-2 の境界は構造として保たれる。
  //
  // 規則は `lib/project-detail.ts`（画面の骨格・概要区画）と `lib/ledger.ts`・`lib/manage.ts`（要求値の
  // 組み立て）が純関数で持ち、ここは配置と局所フォーム状態とコールバックである。テキスト欄は局所状態に
  // 束ね、入力中に書き換えない（IME の変換が壊れるため）。
  import { untrack } from "svelte";
  import Editor from "./Editor.svelte";
  import { PRIORITIES } from "../lib/edit";
  import {
    CANONICAL_STATUS_NAMES,
    aliasKeyEffect,
    editOf,
    editProblems,
    resolvedBacklogRoot,
    toUpdateRequest,
    type EntryEdit,
    type FieldProblem,
    type LedgerActionResult,
    type LedgerField,
    type RefusalReport,
  } from "../lib/ledger";
  import {
    DOC_TYPES,
    EMPTY_DOC_CREATE,
    EMPTY_MILESTONE_ADD,
    EMPTY_TASK_CREATE,
    ISSUE_BUSY_REASON,
    TASK_CREATE_OMITTED_FIELDS,
    TASK_CREATE_SCOPE_NOTE,
    WITHHELD_DOCUMENT_OPERATIONS,
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
    type MilestoneAddInput,
    type TaskCreateInput,
    type WithheldOperation,
  } from "../lib/manage";
  import {
    ALIAS_EFFECT_NOTES,
    DETAIL_SECTIONS,
    LEDGER_READ_ONLY_BAND,
    OVERVIEW_READ_ONLY_NOTE,
    SLUG_IMMUTABLE_NOTE,
    UNREGISTER_SCOPE_NOTE,
    cliDegradedBand,
    movesRoot,
    overviewBlocked,
    rootMoveNote,
    submittedAttributes,
    unregisterBlocked,
    type DetailSection,
  } from "../lib/project-detail";
  import type {
    CliReadiness,
    Document,
    ProjectEntry,
    ProjectLoad,
    UpdateOperation,
    UpdateRequest,
  } from "../lib/wire";

  interface Props {
    /** この画面が扱う台帳エントリ。ルートが読めなくてもこれは読めている（doc-10 §8）。 */
    entry: ProjectEntry;
    /** そのルートの読み取り結果。`undefined` はまだ読んでいない。 */
    load: ProjectLoad | undefined;
    /** 台帳が読み取り専用 (doc-3 §2.2)。概要区画だけに効く。 */
    ledgerReadOnly: boolean;
    /** 台帳コマンドが 1 本走っている間（App.svelte が直列化している）。 */
    ledgerBusy: boolean;
    /** 対応 CLI があるか (doc-5 §5)。`null` は確認中。文書・マイルストーン・新規タスクだけに効く。 */
    readiness: CliReadiness | null;
    onpickDirectory: (title: string) => Promise<string | null>;
    onupdate: (request: UpdateRequest) => Promise<LedgerActionResult>;
    onremove: (slug: string) => Promise<LedgerActionResult>;
    /** 1 件の更新操作を発行する (doc-5 §3, doc-9 §4)。再読込は shell が持つ。 */
    onissue: (slug: string, action: UpdateOperation[]) => Promise<IssueOutcome>;
    /** この画面が未保存入力を抱えている間。画面を離れるときに shell が確認するために要る。 */
    ondirty: (dirty: boolean) => void;
    /** 出口 (doc-10 §2)。 */
    onback: () => void;
    ontoLane: () => void;
  }

  let {
    entry,
    load,
    ledgerReadOnly,
    ledgerBusy,
    readiness,
    onpickDirectory,
    onupdate,
    onremove,
    onissue,
    ondirty,
    onback,
    ontoLane,
  }: Props = $props();

  let section = $state<DetailSection>("overview");

  let project = $derived(load?.state === "loaded" ? load.project : null);
  /** ルート読取不能 (doc-10 §8)。概要区画は出し、他の 3 区画は一覧を出せない。 */
  let unreadable = $derived(load?.state === "unreadable" ? load.error : null);

  let readOnlyBand = $derived(ledgerReadOnly ? LEDGER_READ_ONLY_BAND : null);
  let degradedBand = $derived(cliDegradedBand(readiness));

  // --- 概要区画: 台帳エントリ (doc-10 §4) ------------------------------------------------------

  /**
   * 台帳エントリの編集フォーム。`entry` から一度写し、以後は利用者のものとして保つ — 保存が通った
   * あとに写し直さないのは、`entry` が更新されれば `toUpdateRequest` が `null`（＝変更なし）を返し、
   * フォームが自然に「送るものが無い」状態へ落ち着くからである。写し直すと、保存と同時に外部で
   * 別の変更が入っていた場合に利用者の入力を黙って上書きすることになる。
   */
  let edit = $state<EntryEdit>(untrack(() => editOf(entry)));
  let unregisterInput = $state("");
  let entryReport = $state<RefusalReport | null>(null);
  let overviewNotice = $state<string | null>(null);

  let editIssues = $derived(editProblems(edit));
  let updateRequest = $derived(toUpdateRequest(entry, edit));
  /** 送信属性一覧 (doc-10 §4.1)。保存ボタンの直前に常時出す（ホバーに隠さない。doc-11 §5）。 */
  let submitted = $derived(updateRequest === null ? [] : submittedAttributes(entry, updateRequest));
  let moveNote = $derived(rootMoveNote(entry, edit));

  const OVERVIEW_BLOCKED_ID = "overview-blocked";
  const UNREGISTER_BLOCKED_ID = "overview-unregister-blocked";

  let saveBlocked = $derived(
    // 障害の順に見る: 書けない台帳が何より先で、走っている操作が次、最後が入力とその中身。
    overviewBlocked({ readOnly: ledgerReadOnly, busy: ledgerBusy }) ??
      (editIssues.length > 0
        ? "入力に問題があります（各欄の指摘を参照）。"
        : updateRequest === null
          ? "変更がありません（送る属性がありません）。"
          : null),
  );
  let unregisterReason = $derived(
    unregisterBlocked(unregisterInput, entry.slug, {
      readOnly: ledgerReadOnly,
      busy: ledgerBusy,
    }),
  );

  /** そのプロジェクトが宣言している status。ルートが読めていないときは `null`（判定できない）。 */
  let declaredStatuses = $derived(project?.config.statuses ?? null);

  function addAliasRow(): void {
    edit.aliases.push({ key: "", value: CANONICAL_STATUS_NAMES[0] });
  }

  function removeAliasRow(index: number): void {
    edit.aliases.splice(index, 1);
  }

  /** いま欄にあるプロジェクトルートに対する既定の Backlog ルートを入れる (doc-3 §3)。 */
  function followBacklogDefault(): void {
    edit.backlogRoot = resolvedBacklogRoot({
      projectRoot: edit.projectRoot,
      backlogRoot: "",
      slug: "",
    });
  }

  async function pickRoot(field: "projectRoot" | "backlogRoot"): Promise<void> {
    const picked = await onpickDirectory(
      field === "projectRoot" ? "プロジェクトルートを選択" : "Backlog ルートを選択",
    );
    if (picked === null) return;
    edit[field] = picked;
  }

  async function save(): Promise<void> {
    const request = updateRequest;
    if (saveBlocked !== null || request === null) return;
    entryReport = null;
    overviewNotice = null;
    const result = await onupdate(request);
    if (result.state === "refused") {
      entryReport = result.report;
      return;
    }
    // 再判定は「1 回の要求」であって設定値ではない (doc-3 §4.3)。押しっぱなしにすると、以後の保存が
    // すべて再判定を伴ってしまうので、通ったところで落とす。
    edit.redetectGitRemote = false;
    if (movesRoot(request)) {
      // 移動が成立したら、開いている編集セッションは閉じる (doc-10 §4.1)。この画面は slug でしか
      // key 付けされておらず、slug は移動しても変わらないので、閉じないとセッションは生き残る。
      // 残ると、旧ルートで読んだ本文を文書 ID だけで新ルートへ送れてしまい、同じ ID の文書が新ルート
      // にあれば実行前照合は新ルートの最新読み取りに対して通る — `--content` は全置換なので、旧ルート
      // の内容で丸ごと上書きされる (review [P1])。
      docSession = null;
      newTag = "";
      pendingDocument = null;
      // status と milestone は旧ルートの ID 空間の値である (doc-3 §5.3)。同じ理由で持ち越さない:
      // 打った文字列ではなく選択なので、落としても利用者の入力は失われない。
      taskInput.status = "";
      taskInput.milestone = "";
      overviewNotice =
        `${result.slug} を移動しました。開いていた文書の編集セッションは、旧ルートの読み取りに` +
        "基づくため閉じました（doc-10 §4.1）。";
      return;
    }
    overviewNotice = `${result.slug} の台帳エントリを更新しました。`;
  }

  async function unregister(): Promise<void> {
    if (unregisterReason !== null) return;
    entryReport = null;
    const result = await onremove(entry.slug);
    if (result.state === "refused") entryReport = result.report;
    // 成功時にこの画面を閉じるのは shell の役目である (`removeProject`)。ここから `onback` を呼ぶと
    // 破棄前確認に当たり、もう存在しない登録について「入力を残しますか」と尋ねることになる。
  }

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }

  // --- 発行 (doc-5 §3, doc-9 §5) ---------------------------------------------------------------

  /** 発行が 1 本走っている間。押されたものだけでなく、すべての発行操作を止める。 */
  let busy = $state(false);
  /**
   * 直前の発行結果。色は doc-9 §5 の族に従う: CLI 失敗と更新前競合は中立の通知、照合不能だけは
   * 自分の族の色を取り、「競合が起きた」と読めないようにする。
   */
  let message = $state<{ tone: "ok" | "warn" | "undetectable"; text: string } | null>(null);

  function tone(outcome: IssueOutcome): "ok" | "warn" | "undetectable" {
    if (outcome.state === "applied") return "ok";
    return outcome.state === "uncheckable" ? "undetectable" : "warn";
  }

  async function issue(action: UpdateOperation[], done: string): Promise<IssueOutcome | null> {
    if (project === null) return null;
    busy = true;
    message = null;
    try {
      const outcome = await onissue(entry.slug, action);
      message = { tone: tone(outcome), text: outcomeMessage(outcome, done) };
      return outcome;
    } finally {
      busy = false;
    }
  }

  // --- 新規タスク区画 (doc-10 §7) --------------------------------------------------------------

  let taskInput = $state<TaskCreateInput>({ ...EMPTY_TASK_CREATE });
  let newLabel = $state("");
  let newCriterion = $state("");
  let taskPlan = $derived(buildTaskCreate(taskInput));
  let taskIssue = $derived(issueAvailability(taskPlan, { readiness, busy }));

  async function createTask(): Promise<void> {
    if (taskIssue.state !== "ready" || taskPlan.state !== "ready") return;
    const outcome = await issue(taskPlan.action, "タスクを作成しました。");
    // 成功したときだけ空にする: 失敗した入力は直して出し直せるように残す。
    if (outcome?.state === "applied") {
      taskInput = { ...EMPTY_TASK_CREATE };
      newLabel = "";
      newCriterion = "";
    }
  }

  // --- 文書区画 (doc-10 §5) ---------------------------------------------------------------------

  let docInput = $state<DocCreateInput>({ ...EMPTY_DOC_CREATE });
  let docCreatePlan = $derived(buildDocCreate(docInput));
  let docCreateIssue = $derived(issueAvailability(docCreatePlan, { readiness, busy }));

  /** 編集中の文書とそのセッション。1 度に 1 件: 2 つ開くと、どちらも発行を名乗ることになる。 */
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
   * 文書エディタが抱えているもの。追加行のテキストはエディタとともに消えるが、「追加」を押すまで
   * どの項目も変えないので `docDirty` だけでは守られない — 閉じたり別の文書を開いたりすると、
   * 打ったタグが黙って消える。
   */
  let docEditorDirty = $derived(docDirty || newTag.trim() !== "");
  /** 未保存入力を抱えたまま求められた行き先。答えるまで**適用しない**（doc-8 §6.3 と同じ形）。 */
  let pendingDocument = $state<{ document: Document | null } | null>(null);

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
    const submittedDoc = plan.submitted;
    const outcome = await issue(plan.action, "文書を更新しました。");
    if (outcome?.state !== "applied") return;
    // 防げない喪失の事後通知 (doc-9 §5)。この時点で再読込は済んでいるので、下の文書は更新後のもの。
    // `--content` は本文を全置換する (doc-5 §3.1) ので、この照合は文書でとりわけ効く。
    const diverged = docDivergence(
      submittedDoc,
      project?.documents.find((candidate) => candidate.id === session.baseline.id) ?? null,
    );
    // 成功したら閉じる: このセッションの baseline は更新前の読み取りで、開いたままにすると次の編集を
    // もう存在しない版と比べることになる。
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

  /** 文書の編集セッションを開く。別の入力が失われるときは先に尋ねる。 */
  function editDocument(document: Document): void {
    // 既に開いている: もう一度押すとセッションを張り直して、尋ねずに入力を落とすことになる。
    if (docSession?.baseline.id === document.id) return;
    if (docEditorDirty) {
      pendingDocument = { document };
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
    if (docEditorDirty) {
      pendingDocument = { document: null };
      return;
    }
    docSession = null;
    newTag = "";
  }

  function leaveConfirmed(): void {
    const target = pendingDocument;
    pendingDocument = null;
    if (target === null) return;
    if (target.document === null) {
      docSession = null;
      newTag = "";
      return;
    }
    openDocument(target.document);
  }

  function setDoc<K extends keyof DocDraft>(key: K, value: DocDraft[K]): void {
    if (docSession === null) return;
    docSession = setDocField(docSession, key, value);
  }

  // --- マイルストーン区画 (doc-10 §6) ------------------------------------------------------------

  let milestoneInput = $state<MilestoneAddInput>({ ...EMPTY_MILESTONE_ADD });
  let milestonePlan = $derived(buildMilestoneAdd(milestoneInput));
  let milestoneIssue = $derived(issueAvailability(milestonePlan, { readiness, busy }));

  async function addMilestone(): Promise<void> {
    if (milestoneIssue.state !== "ready" || milestonePlan.state !== "ready") return;
    const outcome = await issue(milestonePlan.action, "マイルストーンを作成しました。");
    if (outcome?.state === "applied") milestoneInput = { ...EMPTY_MILESTONE_ADD };
  }

  // --- 未保存入力 (doc-8 §6.3) -------------------------------------------------------------------

  /**
   * この画面が抱えている未保存入力。区画切替では何も失われない（この 1 コンポーネントが全区画の状態を
   * 持っており、区画は表示の切替でしかない。doc-10 §1）が、画面を離れると全部が消える — だから
   * shell の破棄前確認は 4 区画すべてを見る必要がある。3 つの追加行も入る: 「追加」を押していない
   * テキストは、いちばん失いやすく、いちばん見えにくい。
   */
  let dirty = $derived(
    updateRequest !== null ||
      unregisterInput.trim() !== "" ||
      docEditorDirty ||
      hasTaskCreateInput(taskInput) ||
      hasDocCreateInput(docInput) ||
      hasMilestoneAddInput(milestoneInput) ||
      newLabel.trim() !== "" ||
      newCriterion.trim() !== "",
  );

  $effect(() => {
    ondirty(dirty);
  });

  // --- 表示の小道具 -------------------------------------------------------------------------------

  /** 一覧の 編集 が同じ理由で押せないときの理由の置き場 (doc-11 §5)。 */
  const DOC_EDIT_BLOCKED_ID = "detail-doc-edit-blocked";

  function why(availability: { state: string; reason?: string }): string {
    return availability.state === "blocked" ? (availability.reason ?? "") : "";
  }

  function addTo(values: string[], value: string): string[] {
    const trimmed = value.trim();
    return trimmed === "" || values.includes(trimmed) ? values : [...values, trimmed];
  }

  /** ルートが読めないと出せない一覧の代わりに出す文 (doc-10 §8)。 */
  let unreadableNote = $derived(
    unreadable === null
      ? null
      : "ルートが読めないため、この区画の一覧と発行は出せません。概要区画でルートを直してください" +
        "（台帳エントリ自体は読めています。doc-10 §8）。",
  );
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

{#snippet withheld(title: string, operations: WithheldOperation[])}
  <!-- 提供しない操作区画 (doc-10 §1/§6, doc-11 §5): 押せないボタンを並べる代わりに、名称・CLI 上の
       写像先・理由の 3 点を並べる。無効化は「今は条件が揃っていない」を意味するが、ここに並ぶのは
       Atlas がこの版で出さないと決めたもので、別のことを言っている。 -->
  <div class="withheld">
    <h3>{title}</h3>
    <ul>
      {#each operations as operation (operation.kind)}
        <li>
          <span class="label">{operation.label}</span>
          <code>{operation.mapping}</code>
          <p>{operation.reason}</p>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<div class="detail">
  <!-- ヘッダ (doc-10 §3): 識別と往復だけ。ここは何も書かない。 -->
  <header class="head">
    <div class="identity">
      <span class="name">{project?.config.projectName ?? entry.slug}</span>
      <span class="slug">{entry.slug}</span>
    </div>
    <span class="counts">
      {#if project !== null}
        タスク {project.tasks.length} ・ 文書 {project.documents.length} ・ マイルストーン
        {project.milestones.length}
      {:else if unreadable !== null}
        <span class="unreadable-count">件数はルート読取不能のため出せません</span>
      {:else}
        読み込み中…
      {/if}
    </span>
    <div class="exits">
      <button type="button" onclick={onback}>← スイムレーン</button>
      <button type="button" onclick={ontoLane}>このプロジェクトのレーンへ</button>
    </div>
  </header>

  <!-- 2 本の帯 (doc-10 §3): 互いに独立で、片方だけが立つ。どちらの文も、影響が及ばない区画を
       名指ししてある — 並んで立ったときに「全部だめになった」と読まれないようにするため。 -->
  {#if readOnlyBand !== null}
    <p class="band read-only">{readOnlyBand}</p>
  {/if}
  {#if degradedBand !== null}
    <p class="band degraded">{degradedBand}</p>
  {/if}

  <div class="body">
    <!-- 区画切替 (doc-10 §1): 画面遷移ではなく同一画面内の表示切替。全区画の入力はこの 1 コンポーネント
         が持っているので、区画を移っても入力は消えない。 -->
    <nav class="sections" aria-label="区画">
      {#each DETAIL_SECTIONS as item (item.id)}
        <button
          type="button"
          class:current={section === item.id}
          aria-current={section === item.id ? "true" : undefined}
          onclick={() => (section = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="panel">
      {#if message !== null}
        <p class={message.tone}>{message.text}</p>
      {/if}

      {#if section === "overview"}
        <!-- 概要区画 (doc-10 §4): 書く先は台帳ファイルだけ。CLI 縮退の影響を受けない。 -->
        <section>
          <h2>概要（台帳エントリ）</h2>

          {#if ledgerReadOnly}
            <!-- doc-10 §8 は入力と登録解除の両方を無効化するよう求めている。押せない保存だけを残すと、
                 書き換えられない値を編集でき、その入力が未保存入力に数えられて、あとで「保存できなかった
                 変更を破棄しますか」と尋ねることになる (review [P2])。`disabled` を使えるのは、この文が
                 操作の近くに常時出ているからである (doc-11 §5)。 -->
            <p class="blocked-note" id={OVERVIEW_BLOCKED_ID}>{OVERVIEW_READ_ONLY_NOTE}</p>
          {/if}

          {#if overviewNotice}
            <p class="ok">{overviewNotice}</p>
          {/if}

          <div class="field">
            <span class="label">slug</span>
            <p class="value-line"><code>{entry.slug}</code></p>
            <!-- 押せない入力欄を置かない (doc-10 §4.1): 出すのは値と、変えたいときに何をすることに
                 なるかである。 -->
            <p class="hint">{SLUG_IMMUTABLE_NOTE}</p>
          </div>

          <label class="field">
            <span class="label">project_root</span>
            <span class="row-inline">
              <input
                type="text"
                bind:value={edit.projectRoot}
                spellcheck="false"
                disabled={ledgerReadOnly}
              />
              <button type="button" disabled={ledgerReadOnly} onclick={() => pickRoot("projectRoot")}>
                選択…
              </button>
            </span>
          </label>
          {#if moveNote !== null}
            <p class="hint">{moveNote}</p>
          {/if}
          {#each problemsFor(editIssues, "projectRoot") as text (text)}
            <p class="problem">{text}</p>
          {/each}

          <label class="field">
            <span class="label">backlog_root</span>
            <span class="row-inline">
              <input
                type="text"
                bind:value={edit.backlogRoot}
                spellcheck="false"
                disabled={ledgerReadOnly}
              />
              <button type="button" disabled={ledgerReadOnly} onclick={() => pickRoot("backlogRoot")}>
                選択…
              </button>
              <button type="button" disabled={ledgerReadOnly} onclick={followBacklogDefault}>
                既定に合わせる
              </button>
            </span>
          </label>
          {#each problemsFor(editIssues, "backlogRoot") as text (text)}
            <p class="problem">{text}</p>
          {/each}

          <label class="check">
            <input type="checkbox" bind:checked={edit.redetectGitRemote} disabled={ledgerReadOnly} />
            <span>
              Git remote を再判定する（現在: {entry.git_remote_present ? "あり" : "なし"}）
            </span>
          </label>

          <fieldset class="aliases">
            <legend>status 別名表（doc-3 §3.3）</legend>
            <p class="hint">
              プロジェクト固有の status を正準ステータス列へ対応づけます。既定は空で、Backlog.md 既定の
              4 status は名称一致するため設定は要りません。
            </p>
            {#each edit.aliases as row, index (index)}
              {@const effect =
                declaredStatuses === null ? null : aliasKeyEffect(row.key, declaredStatuses)}
              {@const note = effect === null ? null : ALIAS_EFFECT_NOTES[effect]}
              {@const invalidValue = !CANONICAL_STATUS_NAMES.includes(row.value)}
              <div class="alias-row">
                <input
                  type="text"
                  placeholder="プロジェクトの status"
                  list={`declared-${entry.slug}`}
                  bind:value={row.key}
                  disabled={ledgerReadOnly}
                />
                <span aria-hidden="true">→</span>
                <select bind:value={row.value} disabled={ledgerReadOnly}>
                  {#each CANONICAL_STATUS_NAMES as name (name)}
                    <option value={name}>{name}</option>
                  {/each}
                  {#if invalidValue}
                    <!-- 不正な別名を台帳から削除しない (doc-3 §3.3, TASK-42)。選択肢に無い値を持つ行を
                         そのまま出すのが、この画面での「削除しない」の実装である: 正準 4 列だけを
                         並べると、開いただけで値が最初の選択肢へすり替わり、保存で消えてしまう。 -->
                    <option value={row.value}>{row.value}（不正: 正準列ではありません）</option>
                  {/if}
                </select>
                <button
                  type="button"
                  title="この行を削除"
                  disabled={ledgerReadOnly}
                  onclick={() => removeAliasRow(index)}
                >
                  ×
                </button>
                {#if row.key.trim() !== ""}
                  {#if note !== null}
                    <!-- 別名が実際に効くか (doc-10 §4.2)。効かない 1 態だけが縮退の族の色を取る。 -->
                    <span class="alias-effect" class:ineffective={note.ineffective} title={note.note}>
                      {note.label}
                    </span>
                  {:else}
                    <span class="alias-effect">
                      ルート読取不能のため、この別名が効くかを判定できません
                    </span>
                  {/if}
                {/if}
              </div>
              {#if row.key.trim() !== "" && note !== null}
                <p class="alias-note" class:ineffective={note.ineffective}>{note.note}</p>
              {/if}
            {/each}
            <div class="row-inline">
              <button type="button" disabled={ledgerReadOnly} onclick={addAliasRow}>別名を追加</button>
              {#if declaredStatuses !== null}
                <datalist id={`declared-${entry.slug}`}>
                  {#each declaredStatuses as status (status)}
                    <option value={status}></option>
                  {/each}
                </datalist>
              {/if}
            </div>
            {#each problemsFor(editIssues, "aliases") as text (text)}
              <p class="problem">{text}</p>
            {/each}
          </fieldset>

          <!-- 送る属性を保存の直前に列挙する (doc-10 §4.1)。変えたつもりの属性ではなく、要求値に
               実際に載る属性が並ぶ — 移動のときに両ルートが載ることも、ここに現れる。 -->
          <div class="submit-preview">
            <h3>保存で送る属性</h3>
            {#if submitted.length === 0}
              <p class="neutral">変更なし（送る属性はありません）。</p>
            {:else}
              <ul class="submitted">
                {#each submitted as attribute (attribute.attribute)}
                  <li>
                    <code>{attribute.attribute}</code>
                    <span class="from">{attribute.from}</span>
                    <span aria-hidden="true">→</span>
                    <span class="to">{attribute.to}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          {#if entryReport !== null}
            <p class="problem">{entryReport.message}</p>
          {/if}

          <div class="actions">
            <button
              type="button"
              class="primary"
              aria-disabled={saveBlocked !== null}
              aria-describedby={saveBlocked === null
                ? undefined
                : ledgerReadOnly
                  ? OVERVIEW_BLOCKED_ID
                  : "overview-save-blocked"}
              title={saveBlocked ?? "上に並べた属性を台帳へ書きます"}
              onclick={save}>保存</button
            >
          </div>
          {#if saveBlocked !== null && !ledgerReadOnly}
            <!-- 台帳読取専用のときは帯が理由そのものなので、同じ文を 2 度置かない (doc-11 §5)。 -->
            <p class="blocked-note" id="overview-save-blocked">{saveBlocked}</p>
          {/if}

          <!-- 登録解除 (doc-10 §4.3): 危険区画として他の操作と分ける。 -->
          <div class="danger">
            <h3>登録解除</h3>
            <p>{UNREGISTER_SCOPE_NOTE}</p>
            <label class="field">
              <span class="label">確認: slug を入力してください</span>
              <input
                type="text"
                placeholder={entry.slug}
                spellcheck="false"
                bind:value={unregisterInput}
                disabled={ledgerReadOnly}
              />
            </label>
            <div class="actions">
              <button
                type="button"
                aria-disabled={unregisterReason !== null}
                aria-describedby={unregisterReason === null
                  ? undefined
                  : ledgerReadOnly
                    ? OVERVIEW_BLOCKED_ID
                    : UNREGISTER_BLOCKED_ID}
                title={unregisterReason ?? "この登録を台帳から外します"}
                onclick={unregister}>台帳から外す</button
              >
            </div>
            {#if unregisterReason !== null && !ledgerReadOnly}
              <p class="blocked-note" id={UNREGISTER_BLOCKED_ID}>{unregisterReason}</p>
            {/if}
          </div>
        </section>
      {:else if section === "documents"}
        <!-- 文書区画 (doc-10 §5) -->
        <section>
          <h2>文書</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            {#if pendingDocument !== null}
              <!-- 破棄前確認: 未保存入力があり、求められた操作はそれを落とす。まだ適用していない。 -->
              <div class="confirm">
                <span>
                  {#if pendingDocument.document === null}
                    文書の編集に未保存入力があります。編集を閉じると破棄されます。
                  {:else}
                    文書の編集に未保存入力があります。{pendingDocument.document.id} を開くと破棄されます。
                  {/if}
                </span>
                <button type="button" onclick={leaveConfirmed}>破棄して続行</button>
                <button type="button" onclick={() => (pendingDocument = null)}>入力に戻る</button>
              </div>
            {/if}

            {#if project.documents.length === 0}
              <p class="neutral">文書はありません。</p>
            {:else}
              {#if busy}
                <!-- 一覧の 編集 はすべて同じ理由で押せない (doc-11 §5): 理由は一覧の上に 1 度書き、
                     各ボタンをそこへ結ぶ。ボタンは `aria-disabled` のままにして、フォーカスを受け
                     続けられるようにする — それが結びをポインタ無しで辿れるようにする手段である。 -->
                <p class="reason" id={DOC_EDIT_BLOCKED_ID}>
                  {ISSUE_BUSY_REASON}。完了するまで文書の編集は開けません。
                </p>
              {/if}
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
                      {#if docSession?.baseline.id === document.id && docEditorDirty}
                        <!-- 未保存入力のある文書には印を付ける (doc-10 §5)。編集セッションは 1 度に
                             1 件なので印が付きうるのも 1 件だが、一覧の側に出すのは、エディタを
                             スクロールで見失っても「まだ送っていない」ことが読めるようにするため。 -->
                        <span class="unsaved">未保存</span>
                      {/if}
                      <button
                        type="button"
                        class="mini"
                        aria-disabled={busy}
                        aria-describedby={busy ? DOC_EDIT_BLOCKED_ID : undefined}
                        title={busy ? ISSUE_BUSY_REASON : "この文書を編集します"}
                        onclick={() => !busy && editDocument(document)}
                      >
                        {docSession?.baseline.id === document.id ? "編集中" : "編集"}
                      </button>
                    </div>
                    <!-- パス (doc-10 §5)。読み取り層が走査で得た `source_path` であって、`-p` に渡す
                         docs 相対パスではない — 更新欄の path が現在値を持たない理由がこれである。 -->
                    <p class="path"><code>{document.sourcePath}</code></p>
                  </li>
                {/each}
              </ul>
            {/if}

            {#if docSession !== null}
              {@const session = docSession}
              <div class="sub-panel">
                <h3>{session.baseline.id} を更新（doc update）</h3>

                <label class="field">
                  <span class="label">title</span>
                  <input
                    type="text"
                    value={session.draft.title}
                    oninput={(event) => setDoc("title", event.currentTarget.value)}
                  />
                </label>

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
                  <label class="field">
                    <span class="label">type</span>
                    <select
                      value={session.draft.docType}
                      onchange={(event) => setDoc("docType", event.currentTarget.value)}
                    >
                      <option value="">—（変更しない）</option>
                      {#each DOC_TYPES as value (value)}
                        <option {value}>{value}</option>
                      {/each}
                    </select>
                  </label>

                  <label class="field">
                    <span class="label">path（移動する場合のみ）</span>
                    <input
                      type="text"
                      placeholder="空欄なら変更しません"
                      value={session.draft.path}
                      oninput={(event) => setDoc("path", event.currentTarget.value)}
                    />
                  </label>
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

            <div class="sub-panel">
              <h3>文書を作成（doc create）</h3>
              <div class="row">
                <label class="field">
                  <span class="label">title（必須）</span>
                  <input
                    type="text"
                    value={docInput.title}
                    oninput={(event) => (docInput.title = event.currentTarget.value)}
                  />
                </label>
                <label class="field">
                  <span class="label">type</span>
                  <select
                    value={docInput.docType}
                    onchange={(event) => (docInput.docType = event.currentTarget.value)}
                  >
                    <option value="">—（CLI の既定）</option>
                    {#each DOC_TYPES as value (value)}
                      <option {value}>{value}</option>
                    {/each}
                  </select>
                </label>
                <label class="field">
                  <span class="label">path</span>
                  <input
                    type="text"
                    placeholder="docs 配下の下位パス（任意）"
                    value={docInput.path}
                    oninput={(event) => (docInput.path = event.currentTarget.value)}
                  />
                </label>
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
          {/if}

          {@render withheld("現時点で提供しない操作（文書）", WITHHELD_DOCUMENT_OPERATIONS)}
        </section>
      {:else if section === "milestones"}
        <!-- マイルストーン区画 (doc-10 §6) -->
        <section>
          <h2>マイルストーン</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            {#if project.milestones.length === 0}
              <p class="neutral">マイルストーンはありません。</p>
            {:else}
              <ul class="records">
                {#each project.milestones as milestone (milestone.id)}
                  {@const held = project.tasks.filter(
                    (view) => view.task.milestone === milestone.id,
                  ).length}
                  <li>
                    <div class="record-head">
                      <span class="id">{milestone.id}</span>
                      <span class="title">{milestone.title}</span>
                      <span class="meta">所属タスク {held} 件</span>
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

            <div class="sub-panel">
              <h3>マイルストーンを作成（milestone add）</h3>
              <label class="field">
                <span class="label">名称（必須）</span>
                <input
                  type="text"
                  value={milestoneInput.name}
                  oninput={(event) => (milestoneInput.name = event.currentTarget.value)}
                />
              </label>
              <label class="field">
                <span class="label">説明（作成時のみ設定できます）</span>
                <input
                  type="text"
                  value={milestoneInput.description}
                  oninput={(event) => (milestoneInput.description = event.currentTarget.value)}
                />
              </label>
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
          {/if}

          {@render withheld(
            "現時点で提供しない操作（マイルストーン）",
            WITHHELD_MILESTONE_OPERATIONS,
          )}
        </section>
      {:else}
        <!-- 新規タスク区画 (doc-10 §7) -->
        <section>
          <h2>新規タスク</h2>

          {#if unreadableNote !== null}
            <p class="unreadable">{unreadableNote}</p>
          {:else if project === null}
            <p class="neutral">読み込み中…</p>
          {:else}
            <label class="field">
              <span class="label">title（必須）</span>
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
                onsave={createTask}
              />
            </div>

            <div class="row">
              <label class="field">
                <span class="label">status</span>
                <select
                  value={taskInput.status}
                  onchange={(event) => (taskInput.status = event.currentTarget.value)}
                >
                  <!-- 未指定は最後まで選べる: `--status` を落とすことが `default_status` を効かせる
                       手段であり、値を選ぶのとは別の要求である。 -->
                  <option value="">—（config.yml の既定 status に任せる）</option>
                  <!-- 選択肢は宣言済みの原文 status に限る (doc-10 §7): `-s` は config.yml が宣言する
                       値だけを受け取り、未宣言の値は終了コード 1 で拒否される。正準ステータス列名を
                       並べない。 -->
                  {#each project.config.statuses as status (status)}
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
                  <option value="">—（未設定）</option>
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
                  <option value="">—（未設定）</option>
                  {#each project.milestones as milestone (milestone.id)}
                    <option value={milestone.id}>{milestone.id} {milestone.title}</option>
                  {/each}
                </select>
              </label>
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
                Type（kind ラベル）はここでは扱いません。`task create --labels` は 1 個のカンマ区切り値
                を取るため、「,」を含むラベルは発行しません。
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
          {/if}

          <!-- 出さない項目は製品判断として書く (doc-10 §7)。「CLI に無い」とは書かない — v1.47.1 の
               `task create` は実測でこれらを受け取るので、事実に反する。 -->
          <div class="scope">
            <h3>この区画が欄を出さない項目</h3>
            <p>{TASK_CREATE_SCOPE_NOTE}</p>
            <ul>
              {#each TASK_CREATE_OMITTED_FIELDS as field (field.label)}
                <li>
                  <span class="label">{field.label}</span>
                  <code>{field.flag}</code>
                  <p>{field.reason}</p>
                  <p class="after">作成後: {field.after}</p>
                </li>
              {/each}
            </ul>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    font-size: 0.78rem;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--line);
    background: var(--inset);
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }

  .name {
    font-size: 0.95rem;
    font-weight: 600;
  }

  // 副次 (doc-11 §2.1): テーマ自身の色であって `--fg` に掛けた不透明度ではない。
  .slug,
  .counts {
    color: var(--muted);
    font-size: 0.72rem;
  }

  .unreadable-count {
    color: var(--mark-unreadable);
  }

  .exits {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  // 上部の帯 (doc-10 §3)。台帳読取専用も CLI 縮退も decision-6 の 印の族 ではない — 読み取りが縮退した
  // わけではないので、族の色を借りずに中立の情報色を取る。
  .band {
    margin: 0;
    padding: 0.4rem 0.75rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.74rem;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sections {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.2rem;
    width: 9rem;
    padding: 0.6rem 0.4rem;
    border-right: 1px solid var(--line);

    button {
      text-align: left;

      &.current {
        border-color: var(--info);
        background: color-mix(in srgb, var(--info) 14%, transparent);
      }
    }
  }

  .panel {
    flex: 1;
    min-width: 0;
    padding: 0.6rem 0.75rem 1.5rem;
    overflow-y: auto;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.88rem;
  }

  h3 {
    margin: 0 0 0.35rem;
    font-size: 0.78rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.55rem;
    min-width: 12rem;
  }

  .label {
    font-size: 0.72rem;
    opacity: 0.85;
  }

  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.55rem;
    font-size: 0.75rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;

    .field {
      flex: 1;
    }
  }

  .row-inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }

  .value-line {
    margin: 0;
  }

  input[type="text"],
  select {
    padding: 0.25rem 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--inset);
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
  }

  .row-inline input[type="text"] {
    flex: 1;
    min-width: 0;
  }

  button {
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); ここに `:disabled` を書くと勝ってしまう。

    &.mini {
      padding: 0 0.3rem;
      font-size: 0.68rem;
    }

    &.primary {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  .aliases {
    margin: 0 0 0.6rem;
    padding: 0.45rem;
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
    margin-bottom: 0.2rem;

    input[type="text"] {
      width: 12rem;
    }
  }

  // 別名 1 行の効き方 (doc-10 §4.2)。効かない 1 態だけが縮退の族の色を取り、残りは副次の文の色に
  // とどめる — 「効くが宣言に裏づけが無い」宣言集合なしを、効かない別名と同じ色で出さないため。
  .alias-effect {
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-degraded);
    }
  }

  .alias-note {
    margin: 0 0 0.35rem;
    color: var(--muted);
    font-size: 0.68rem;

    &.ineffective {
      color: var(--mark-degraded);
    }
  }

  .submit-preview {
    margin: 0.6rem 0;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
  }

  .submitted {
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem;
      padding: 0.12rem 0;
      font-size: 0.72rem;
    }

    .from {
      color: var(--muted);
    }

    .to {
      font-weight: 600;
    }
  }

  // 危険区画 (doc-10 §4.3): 他の操作と区画を分ける。確認は slug の入力一致で、doc-11 §5 の二度押しより
  // 強い条件になっている。
  .danger {
    margin-top: 1rem;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--mark-unreadable) 45%, transparent);
    border-radius: 4px;

    p {
      margin: 0 0 0.4rem;
      font-size: 0.74rem;
    }
  }

  .records {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;

    li {
      padding: 0.3rem 0;
      border-bottom: 1px solid var(--line);
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
      color: var(--muted);
      font-size: 0.7rem;
    }
  }

  .description {
    margin: 0.2rem 0 0;
    font-size: 0.74rem;
    white-space: pre-wrap;
  }

  .path {
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.68rem;
    word-break: break-all;
  }

  // 未保存入力の印 (doc-10 §5)。decision-6 の 印の族 ではない — 縮退でも版ずれでもなく、利用者が
  // まだ送っていないだけなので、中立の情報色を取る。
  .unsaved {
    padding: 0 0.3rem;
    border: 1px solid color-mix(in srgb, var(--info) 45%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    color: var(--info);
    font-size: 0.66rem;
  }

  .sub-panel {
    margin-top: 0.6rem;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 5px;
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
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      font-size: 0.72rem;
    }
  }

  .add-row {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .hint,
  // 無効化の理由 (doc-11 §5) は副次の文なので `--muted` (doc-11 §2.1)。不透明度にしないのは、理由が
  // どの表示テーマでも読めていなければならないためである。
  .reason,
  .blocked-note {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .neutral {
    margin: 0.2rem 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  // 直せる入力の指摘。decision-6 の 読取不能 の色は使わない: 利用者が直せる入力であって、Atlas が
  // 読めなかったルートではない。
  .problem {
    margin: 0.15rem 0;
    color: var(--mark-degraded);
    font-size: 0.72rem;
  }

  // ルート読取不能 (doc-7 §6, decision-6)。空の一覧と決して同じ見た目にならないようにする。
  .unreadable {
    margin: 0.3rem 0;
    color: var(--mark-unreadable);
    font-size: 0.74rem;
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
    color: var(--muted);
    font-size: 0.74rem;
  }

  // 照合不能 は競合でも失敗でもない (doc-9 §4.2/§5): 自分の族の色を取り、版ずれと読み違えられない
  // ようにする（decision-6 の「三者を同じ印へ混ぜない」）。
  .warn,
  .undetectable,
  .withheld,
  .scope {
    margin: 0.4rem 0;
    padding: 0.35rem 0.45rem;
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

  // 提供しない操作区画 と 出さない項目 は同じ形で並べる — 「押せないボタンが無いこと」と「出さないと
  // 決めたこと」は、並べ方が同じでないと読み分けられない。色は分ける: 前者は照合不能・CLI 制約の族、
  // 後者は Atlas 自身の製品判断なので中立に置く。
  .scope {
    border-left-color: var(--line-strong);
    background: var(--inset);
  }

  .withheld,
  .scope {
    margin-top: 0.9rem;

    ul {
      margin: 0;
      padding-left: 1rem;
    }

    li {
      margin-bottom: 0.45rem;
    }

    code {
      font-size: 0.7rem;
    }

    p {
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.7rem;
    }

    .label {
      margin-right: 0.3rem;
      font-weight: 600;
      opacity: 1;
    }
  }

  code {
    font-size: 0.95em;
  }
</style>
