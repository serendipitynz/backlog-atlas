<script lang="ts">
  // プロジェクトを登録 (doc-3 §4.1). 台帳全体に対する操作なので、1 プロジェクトに閉じた操作を集めた
  // プロジェクト詳細画面 (doc-10) ではなく、スイムレーンの固定ヘッダから開く (doc-3 §4・doc-7 §2.1)。
  //
  // TASK-39 の台帳管理画面から、この登録フォームだけを取り出したものである。台帳の一覧・更新・削除は
  // プロジェクト詳細画面の概要区画へ移った (doc-10 §4) ので、ここに残るのは「まだ台帳に無いものを 1 件
  // 足す」だけになる。検査規則は `lib/ledger.ts` のものをそのまま使う。
  //
  // 書くのは台帳ファイルだけで、対象プロジェクトの管理ファイル・Git には触れない (doc-3 §2.1)。
  // テキスト欄は局所状態に束ね、入力中に書き換えない (IME 中の再描画で変換が壊れるため) — 「既定に
  // 合わせる」たぐいの便宜は利用者が押すボタンにしてある。
  import {
    EMPTY_REGISTER_INPUT,
    parentPath,
    registerProblems,
    resolvedBacklogRoot,
    toRegisterRequest,
    type FieldProblem,
    type LedgerActionResult,
    type LedgerField,
    type RefusalReport,
    type RegisterInput,
  } from "../lib/ledger";
  import type { ProjectEntry, RegisterRequest } from "../lib/wire";

  interface Props {
    /** 既登録の slug を見るためだけに要る: 画面で分かる衝突はその場で言う (権威は Rust 側)。 */
    entries: ProjectEntry[];
    /** 読み取り専用の台帳 (doc-3 §2.2) では登録できない。理由付きで止める。 */
    readOnly: boolean;
    /** 台帳コマンドが 1 本走っている間 (App.svelte が直列化している)。 */
    busy: boolean;
    /** 台帳ファイルの場所 (doc-3 §2.1)。`null` は未確認。 */
    ledgerPath: string | null;
    onpickDirectory: (title: string) => Promise<string | null>;
    ondefaultSlug: (projectRoot: string) => Promise<string | null>;
    onregister: (request: RegisterRequest) => Promise<LedgerActionResult>;
    onclose: () => void;
  }

  let {
    entries,
    readOnly,
    busy,
    ledgerPath,
    onpickDirectory,
    ondefaultSlug,
    onregister,
    onclose,
  }: Props = $props();

  let input = $state<RegisterInput>({ ...EMPTY_REGISTER_INPUT });
  /**
   * プロジェクトルートから導出される既定の slug (doc-3 §3.1)。欄には書き込まず横に出す: 欄が空である
   * ことが「導出させる」の意味なので、埋めると台帳側の導出が画面の送った値に化ける。
   */
  let defaultSlug = $state<string | null>(null);
  /** 未取得 と 導出できない を分ける。後者だけが slug の指定を必須にする。 */
  let defaultSlugKnown = $state(false);
  let report = $state<RefusalReport | null>(null);
  let submitting = $state(false);
  let registered = $state<string | null>(null);

  let taken = $derived(entries.map((entry) => entry.slug));
  let issues = $derived(registerProblems(input, taken));
  let previewBacklogRoot = $derived(resolvedBacklogRoot(input));
  let canRegister = $derived(!readOnly && !busy && !submitting && issues.length === 0);

  const BLOCKED_ID = "register-blocked";
  const READ_ONLY_ID = "register-read-only";
  const READ_ONLY_PICK_REASON =
    "台帳が読み取り専用のため、フォルダを選んでも登録できません（doc-3 §2.2）。";

  /**
   * なぜ登録できないか、できないときだけ (doc-11 §5). 1 本の文字列が「押せない状態」と「ボタンの下の
   * 文」の両方を決めるので、2 つが食い違いようがない。欄ごとの指摘は別に出ているが、それが登録を
   * 止めていることは改めて述べる — 指摘が読めることと、なぜ押せないかが分かることは別である。
   */
  let blocked = $derived(
    readOnly
      ? "台帳が読み取り専用のため、プロジェクトを登録できません（doc-3 §2.2）。"
      : busy || submitting
        ? "台帳の更新を実行中です。完了するまで登録は始められません。"
        : issues.length > 0
          ? "入力に問題があります（各欄の指摘を参照）。"
          : null,
  );

  async function readDefaultSlug(): Promise<void> {
    const projectRoot = input.projectRoot.trim();
    if (projectRoot === "") {
      defaultSlug = null;
      defaultSlugKnown = false;
      return;
    }
    defaultSlug = await ondefaultSlug(projectRoot);
    defaultSlugKnown = true;
  }

  async function pickProjectRoot(): Promise<void> {
    const picked = await onpickDirectory("プロジェクトルートを選択");
    if (picked === null) return;
    input.projectRoot = picked;
    await readDefaultSlug();
  }

  /**
   * doc-3 §4.1 step 1 は Backlog ルートの指定も許す。プロジェクトルートは Git・PR 参照の基点として
   * 必要なので (doc-3 §3)、Backlog ルートを選んだときはその親を**欄に**入れて利用者に直させる。
   * 黙って推測して送ると、別のリポジトリがエントリに結び付く。
   */
  async function pickBacklogRoot(): Promise<void> {
    const picked = await onpickDirectory("Backlog ルートを選択");
    if (picked === null) return;
    input.backlogRoot = picked;
    if (input.projectRoot.trim() === "") {
      const parent = parentPath(picked);
      if (parent !== null) {
        input.projectRoot = parent;
        await readDefaultSlug();
      }
    }
  }

  async function submit(): Promise<void> {
    if (!canRegister) return;
    submitting = true;
    report = null;
    try {
      const result = await onregister(toRegisterRequest(input));
      if (result.state === "refused") {
        report = result.report;
        return;
      }
      registered = result.slug;
      input = { ...EMPTY_REGISTER_INPUT };
      defaultSlug = null;
      defaultSlugKnown = false;
    } finally {
      submitting = false;
    }
  }

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }
</script>

<section class="register">
  <header>
    <h2>プロジェクトを登録</h2>
    <button type="button" class="close" onclick={onclose}>閉じる</button>
  </header>

  <p class="where">
    台帳ファイル: <code>{ledgerPath ?? "確認中…"}</code>
    <!-- doc-3 §2.1: 登録は Atlas 自身の設定である。画面に書くのは、この不変条件が見えないままだと
         「登録＝対象プロジェクトに何か書く」と読めてしまうからで、これが登録を押して安全な根拠になる。 -->
    <span class="aside">
      （Atlas 専用の設定ファイルです。いずれの Backlog ルートにも登録情報は書きません）
    </span>
  </p>

  {#if readOnly}
    <!-- 画面全体に効く無効化理由 (doc-11 §5)。下の 選択… はこれを指すだけで、同じ文を繰り返さない。 -->
    <p class="readonly" id={READ_ONLY_ID}>
      台帳ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。
      登録はできません（doc-3 §2.2）。
    </p>
  {/if}

  {#if registered}
    <p class="notice">{registered} を登録しました。スイムレーンに行が 1 本増えます。</p>
  {/if}

  <label>
    <span class="caption">プロジェクトルート</span>
    <span class="field">
      <input
        type="text"
        placeholder="/Users/you/Projects/example"
        spellcheck="false"
        bind:value={input.projectRoot}
        onchange={readDefaultSlug}
      />
      <button
        type="button"
        aria-disabled={readOnly}
        aria-describedby={readOnly ? READ_ONLY_ID : undefined}
        title={readOnly ? READ_ONLY_PICK_REASON : "フォルダを選びます"}
        onclick={() => !readOnly && pickProjectRoot()}>選択…</button
      >
    </span>
  </label>
  {#each problemsFor(issues, "projectRoot") as message (message)}
    <p class="problem">{message}</p>
  {/each}

  <label>
    <span class="caption">Backlog ルート（任意）</span>
    <span class="field">
      <input
        type="text"
        placeholder={previewBacklogRoot === ""
          ? "既定は <プロジェクトルート>/backlog"
          : previewBacklogRoot}
        spellcheck="false"
        bind:value={input.backlogRoot}
      />
      <button
        type="button"
        aria-disabled={readOnly}
        aria-describedby={readOnly ? READ_ONLY_ID : undefined}
        title={readOnly ? READ_ONLY_PICK_REASON : "フォルダを選びます"}
        onclick={() => !readOnly && pickBacklogRoot()}>選択…</button
      >
    </span>
  </label>
  {#if input.backlogRoot.trim() === "" && previewBacklogRoot !== ""}
    <p class="hint">
      指定しない場合は <code>{previewBacklogRoot}</code> を Backlog ルートとして
      <code>config.yml</code> と <code>tasks/</code> を確認します（doc-3 §4.1）。
    </p>
  {/if}
  {#each problemsFor(issues, "backlogRoot") as message (message)}
    <p class="problem">{message}</p>
  {/each}

  <label>
    <span class="caption">slug（任意）</span>
    <span class="field">
      <input
        type="text"
        placeholder={defaultSlug ?? "英小文字・数字・ハイフン"}
        spellcheck="false"
        bind:value={input.slug}
      />
    </span>
  </label>
  {#if input.slug.trim() === ""}
    {#if defaultSlug !== null}
      <p class="hint">
        未指定なら <code>{defaultSlug}</code> をプロジェクトルート名から導出して使います（doc-3 §3.1）。
        別の slug を使う場合はここに入力してください。
      </p>
    {:else if defaultSlugKnown}
      <!-- doc-3 §3.1: 使える文字が 1 つも無いディレクトリ名からは既定が出ないので、指定してもらう。 -->
      <p class="problem">
        プロジェクトルート名から slug を導出できません。slug を指定してください。
      </p>
    {/if}
  {/if}
  {#each problemsFor(issues, "slug") as message (message)}
    <p class="problem">{message}</p>
  {/each}

  {#if report}
    <!-- 登録失敗は理由付きで出す (doc-3 §4.1)。どの欄へ戻ればよいかは `refusalReport` が決める。 -->
    <p class="problem">{report.message}</p>
  {/if}

  <div class="row">
    <button
      type="button"
      class="primary"
      aria-disabled={!canRegister}
      aria-describedby={canRegister ? undefined : BLOCKED_ID}
      title={blocked ?? "入力の内容で台帳へ登録します"}
      onclick={submit}
    >
      {submitting ? "登録中…" : "登録"}
    </button>
  </div>
  {#if blocked !== null}
    <p class="blocked-note" id={BLOCKED_ID}>{blocked}</p>
  {/if}
</section>

<style lang="scss">
  .register {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: 42rem;
    padding: 0.7rem 0.75rem 1rem;
    font-size: 0.8rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 0.9rem;
  }

  .close {
    margin-left: auto;
  }

  .where {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.85;
  }

  .aside {
    opacity: 0.75;
  }

  // 読み取り専用縮退 (doc-3 §2.2) は decision-6 の 印の族 ではない — 読み取りが縮退したわけではない
  // ので、族の色を借りずに中立の情報色を取る。
  .readonly,
  .notice {
    margin: 0;
    padding: 0.35rem 0.5rem;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.75rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
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

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
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
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); ここに `:disabled` を書くと勝ってしまう。

    &.primary {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  .hint {
    margin: 0;
    font-size: 0.7rem;
    opacity: 0.75;
  }

  // 直せる入力の指摘。decision-6 の 読取不能 の色はあえて使わない: これは利用者が直せる入力であって、
  // Atlas が読めなかったルートではない。
  .problem {
    margin: 0;
    color: var(--mark-degraded);
    font-size: 0.72rem;
  }

  // 無効化の理由 (doc-11 §5) は副次の文なので `--muted` (doc-11 §2.1)。
  .blocked-note {
    margin: 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  code {
    font-size: 0.95em;
  }
</style>
