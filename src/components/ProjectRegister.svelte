<script lang="ts">
  // プロジェクトを登録 (doc-3 §4.1). A ledger-wide operation, so it opens from the swimlane's fixed
  // header (doc-3 §4, doc-7 §2.1) rather than from プロジェクト詳細画面 (doc-10), which collects the
  // operations closed on one project.
  //
  // This is TASK-39's 台帳管理画面 with only the registration form kept: listing, updating and
  // removing entries moved to the detail screen's 概要区画 (doc-10 §4), leaving this with one job —
  // adding something the ledger does not have yet. The checks are `lib/ledger.ts`'s, unchanged.
  //
  // The only thing written is the ledger file; no project's management files or Git are touched
  // (doc-3 §2.1). Text inputs bind to local state and are never rewritten while the user is typing
  // (a redraw mid-composition breaks the IME) — the "follow the default" conveniences are buttons
  // the user presses.
  import {
    EMPTY_REGISTER_INPUT,
    hasRegisterInput,
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
  import { omitsSentence } from "../lib/manage";
  import { OVERVIEW_INPUT_PROBLEMS_REASON } from "../lib/project-detail";
  import { createSlugPreviewLoader, type SlugPreview } from "../lib/slug-preview";
  import type { ProjectEntry, RegisterRequest } from "../lib/wire";

  interface Props {
    /** Only to see the taken slugs: a collision visible here is said here (the Rust side decides). */
    entries: ProjectEntry[];
    /** A read-only ledger (doc-3 §2.2) cannot be registered into. Held back with the reason. */
    readOnly: boolean;
    /** True while one ledger command is in flight (the shell serializes them). */
    busy: boolean;
    /**
     * True while *this form's* registration is unresolved. Held by the shell rather than here, as
     * `Settings` takes `saving`: the same fact has to withhold this form's 登録 *and* stop the モーダル
     * being dismissed out from under the write (`Modal.svelte`'s Escape reaches the shell, not this
     * component), and one fact must not be two flags.
     */
    submitting: boolean;
    onpickDirectory: (title: string) => Promise<string | null>;
    ondefaultSlug: (projectRoot: string) => Promise<string | null>;
    onregister: (request: RegisterRequest) => Promise<LedgerActionResult>;
    /**
     * Report whether anything has been typed that the ledger has not been told about. What the shell's
     * 破棄前確認 reads (doc-8 §6.3, doc-11 §7): this モーダル has no exit of its own, so the two that
     * would lose this input — the × and Escape — are both wired outside this component.
     */
    ondirty: (dirty: boolean) => void;
  }

  let {
    entries,
    readOnly,
    busy,
    submitting,
    onpickDirectory,
    ondefaultSlug,
    onregister,
    ondirty,
  }: Props = $props();

  let input = $state<RegisterInput>({ ...EMPTY_REGISTER_INPUT });
  /**
   * The default slug derived from the project root (doc-3 §3.1). Shown beside the field rather than
   * written into it: the field being empty is what *means*「導出させる」, so filling it in would turn
   * the ledger's own derivation into a value this screen sent.
   *
   * Which derivation this is showing is `slugPreview`'s to decide — the root can change while an
   * answer for the previous one is still in flight.
   */
  let preview = $state<SlugPreview>({ state: "unknown" });
  let report = $state<RefusalReport | null>(null);
  let registered = $state<string | null>(null);

  // 未保存入力があるか (doc-8 §6.3). The predicate is `ledger.ts`'s, beside the shape it reads and the
  // trimming that decides what could have been submitted at all.
  $effect(() => {
    ondirty(hasRegisterInput(input));
  });

  let taken = $derived(entries.map((entry) => entry.slug));
  let issues = $derived(registerProblems(input, taken));
  let previewBacklogRoot = $derived(resolvedBacklogRoot(input));
  let canRegister = $derived(!readOnly && !busy && !submitting && issues.length === 0);

  const BLOCKED_ID = "register-blocked";
  const READ_ONLY_ID = "register-read-only";
  const READ_ONLY_PICK_REASON =
    "台帳が読み取り専用のため、フォルダを選んでも登録できません。";

  /**
   * Why registration is held, and only when it is (doc-11 §5). One string drives both the withheld
   * state and the sentence under the button, so the two cannot disagree.
   *
   * **The input-problem reason is the shared constant**, not a second literal saying the same thing:
   * `omitsSentence` (doc-11 §8) is keyed on the string, and two copies would put this screen's copy
   * outside the licence the moment either was reworded. The name is 概要区画's because that 区画
   * needed it first; the fact is the same one — every problem is printed under the field it is about,
   * which is §8's licence ① and why the sentence is no longer drawn here (目視 2026-08-10).
   */
  let blocked = $derived(
    readOnly
      ? "台帳が読み取り専用のため、プロジェクトを登録できません。"
      : busy || submitting
        ? "台帳の更新を実行中です。完了するまで登録は始められません。"
        : issues.length > 0
          ? OVERVIEW_INPUT_PROBLEMS_REASON
          : null,
  );

  // `ondefaultSlug` is called through a closure rather than passed as the port itself: the prop is
  // read at call time, so the loader cannot outlive a change of it.
  const slugPreview = createSlugPreviewLoader({
    derive: (projectRoot) => ondefaultSlug(projectRoot),
    show: (value) => (preview = value),
  });

  async function readDefaultSlug(): Promise<void> {
    await slugPreview.load(input.projectRoot);
  }

  async function pickProjectRoot(): Promise<void> {
    const picked = await onpickDirectory("プロジェクトルートを選択");
    if (picked === null) return;
    input.projectRoot = picked;
    await readDefaultSlug();
  }

  /**
   * doc-3 §4.1 step 1 lets the user name the Backlog root instead. The project root is still needed
   * as the base for Git・PR 参照 (doc-3 §3), so picking a Backlog root offers its parent *in the
   * field* for the user to accept or correct. Guessing it silently would attach the wrong repository.
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
    report = null;
    // `submitting` is not set here: the shell raises it around the same call, because it also has to
    // turn the モーダル's own exits away for as long as this is unresolved (`Settings` の save と同型).
    const result = await onregister(toRegisterRequest(input));
    if (result.state === "refused") {
      report = result.report;
      return;
    }
    registered = result.slug;
    // Emptied, so what the form holds is again what the ledger has been told — which is what stops the
    // × raising a 破棄前確認 about input that has already been registered.
    input = { ...EMPTY_REGISTER_INPUT };
    slugPreview.clear();
  }

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }
</script>

<section class="register">
  <!-- 閉じる is not here any more (TASK-76): the way out is the × `Modal.svelte` draws in the corner
       (doc-11 §7). The 原文 pairs 登録 with a 取消 button (doc-12 §2.3) and this screen has never had
       one — that difference is TASK-80's, not this task's.
       This form holds 未保存入力 all the same, and still takes no 下部操作行 (doc-11 §7): 登録 writes to
       the ledger without leaving the layer, so there is no second way out for a wording to tell the
       first one from. What the × does with what has been typed is said by the 破棄前確認, not here. -->
  <header>
    <h2>プロジェクトを登録</h2>
  </header>

  <!-- 台帳ファイルの保存場所はこの層では述べない (doc-3 §2.1): パスを読む必要が生じるのは台帳を手で
       編集するときで、それを述べるのは 設定モーダル の ファイルの場所 区画 1 つである。ここが刷って
       いた「いずれの Backlog ルートにも書きません」は doc-3 §2.1 の一文の写しで、doc-11 §8 の
       設計文の写し に当たる。 -->

  {#if readOnly}
    <!-- A reason that applies to the whole screen (doc-11 §5). The 選択… buttons below point at it
         rather than repeating the sentence. -->
    <p class="readonly" id={READ_ONLY_ID}>
      台帳ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。
      登録はできません。
    </p>
  {/if}

  {#if registered}
    <p class="notice">{registered} を登録しました。スイムレーンに行が 1 本増えます。</p>
  {/if}

  <label>
    <span class="caption">プロジェクトルート（必須）</span>
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
      <code>config.yml</code> と <code>tasks/</code> を確認します。
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
        placeholder={preview.state === "derived" ? preview.slug : "英小文字・数字・ハイフン"}
        spellcheck="false"
        bind:value={input.slug}
      />
    </span>
  </label>
  {#if input.slug.trim() === ""}
    {#if preview.state === "derived"}
      <p class="hint">
        未指定なら <code>{preview.slug}</code> をプロジェクトルート名から導出して使います。
        別の slug を使う場合はここに入力してください。
      </p>
    {:else if preview.state === "underivable"}
      <!-- doc-3 §3.1: a directory name with no usable characters yields no default, so the user
           has to name one. -->
      <p class="problem">
        プロジェクトルート名から slug を導出できません。slug を指定してください。
      </p>
    {/if}
  {/if}
  {#each problemsFor(issues, "slug") as message (message)}
    <p class="problem">{message}</p>
  {/each}

  {#if report}
    <!-- A refused registration is shown with its reason (doc-3 §4.1); which field to go back to is
         `refusalReport`'s decision. -->
    <p class="problem">{report.message}</p>
  {/if}

  <!-- 発行の行 (doc-11 §11): pinned to the bottom of the layer's scrolling region. The reason 登録 is
       withheld goes inside the same pinned box — half of what pinning is for is that what the press
       has to say is on screen at the moment it is pressed. -->
  <div class="issue">
    <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM for `aria-describedby`; drawn unless
         §8 licences the screen to leave it unsaid — 入力に問題があります is such a reason (each field
         states its own problem), 台帳読取専用 と 実行中 are not (their cause is outside this form). -->
    <p
      class="blocked-note"
      id={BLOCKED_ID}
      class:unseen={blocked === null || omitsSentence(blocked)}
    >
      {blocked ?? ""}
    </p>
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
  </div>
</section>

<style lang="scss">
  .register {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    // No bottom padding: the 発行の行 below is pinned to the bottom of the scrolling region, and a
    // padding here would hold it that far off the edge it is pinned to.
    padding: 0.7rem 0.75rem 0;
    font-size: 0.8rem;
  }

  h2 {
    margin: 0;
    font-size: 0.9rem;
  }

  // 読み取り専用縮退 (doc-3 §2.2) is not one of decision-6's 印の族 — nothing is degraded about the
  // *reading* — so it takes the neutral info hue rather than borrowing a family's colour.
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

  /*
   * 発行の行 (doc-11 §11). `sticky` rather than a box outside the scroll: the scrolling region belongs
   * to `Modal.svelte` and this form is drawn inside it, so there is no outside to sit in. Opaque and
   * ruled off for the same reason the 見出し band in `TaskDetail.svelte` is — a transparent pinned box
   * is one the text scrolls *through*.
   */
  .issue {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    // Pulled out to the layer's edges and given that room back as padding, so the rule reads as the
    // layer's own division rather than as a line inside the form — the same as the 設定モーダル's
    // 下部操作行 (目視 2026-08-10). The form's own 42rem cap went with it: the dialog already caps the
    // layer at 44rem, and a form 0.5rem narrower than that only kept the rule off the edge.
    margin: 0.25rem -0.75rem 0;
    padding: 0.45rem 0.75rem 0.7rem;
    border-top: 1px solid var(--line);
    background: var(--panel);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    // 行の中で中央 (doc-11 §11).
    justify-content: center;
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
    // 無効化提示 lives in one place in app.scss (doc-11 §5); a `:disabled` rule here would outrank it.

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

  // A correctable input problem. decision-6's unreadable hue is deliberately not reused: this is
  // input the user can fix, not a root Atlas failed to read.
  .problem {
    margin: 0;
    color: var(--mark-inconsistent);
    font-size: 0.72rem;
  }

  // 無効化の理由 (doc-11 §5) is a secondary sentence, so `--muted` (doc-11 §2.1).
  .blocked-note {
    margin: 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  // doc-11 §5 の 2 つ目の形: 可視から外しても、`aria-describedby` の指す先はツリーに残す。
  // `display: none` も要素の取り外しもツリーから消すので、理由がどこにも無いのと同じになる。
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  code {
    font-size: 0.95em;
  }
</style>
