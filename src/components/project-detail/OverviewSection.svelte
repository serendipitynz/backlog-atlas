<script lang="ts">
  // 概要区画 (doc-10 §4): the ledger file is the only thing it writes, so CLI 縮退 does not reach it.
  //
  // 入力は親が持つ (`edit` は親の `$state` で、欄はその項目を書く) — 区画切替が入力を落とさないのは
  // それが理由である (doc-10 §1)。ここが持つのは描画と、押されたこと・打たれた字の受け渡しだけである。
  import Icon from "../../lib/icons/Icon.svelte";
  import type { Availability } from "../../lib/availability";
  import {
    CANONICAL_STATUS_NAMES,
    aliasKeyEffect,
    type EntryEdit,
    type FieldProblem,
    type LedgerField,
    type RefusalReport,
  } from "../../lib/ledger";
  import { omitsSentence } from "../../lib/manage";
  import { messages } from "../../lib/messages-context";
  import {
    aliasEffectNote,
    overviewReadOnlyNote,
    slugImmutableNote,
    unregisterScopeNote,
    type GitRemoteLine,
    type OverviewSave,
    type RedetectControl,
    type SubmittedAttribute,
  } from "../../lib/project-detail";
  import type { ProjectEntry } from "../../lib/wire";

  interface Props {
    /** The 台帳エントリ this 区画 is about. Readable even when its root is not (doc-10 §8). */
    entry: ProjectEntry;
    /** 台帳読取専用 (doc-3 §2.2): the inputs and 登録解除 are held, not just the save (doc-10 §8). */
    ledgerReadOnly: boolean;
    /** The 保存 が済んだことを述べる文 (doc-10 §4.1)、または `null`。 */
    notice: (() => string) | null;
    /** 発行前の入力。親の `$state` そのもので、欄はこの項目を書き換える。 */
    edit: EntryEdit;
    /** ルート移動になる編集について述べる文 (doc-10 §4.1)、または `null`。 */
    moveNote: string | null;
    /** 欄ごとの入力問題 (doc-3 §3)。 */
    editIssues: FieldProblem[];
    /** 送る属性 (doc-10 §4.1): 保存の直前に列挙するもの。 */
    submitted: readonly SubmittedAttribute[];
    /** 台帳側が拒否した理由、または `null`。 */
    entryReport: RefusalReport | null;
    saveControl: OverviewSave;
    unregisterAvailable: Availability;
    /** 再検出 の控えの状態と語 (doc-10 §4.1)。 */
    redetect: RedetectControl;
    /** Git remote の現在値の行 (doc-10 §4.1)。 */
    remoteLine: GitRemoteLine;
    /** 記録と検出が食い違っていることを述べる文、または `null`。 */
    remoteDisagreement: string | null;
    /** `config.yml` が宣言している原文 status、または `null` (読み取れていない)。 */
    declaredStatuses: readonly string[] | null;
    /** 登録解除 の確認入力 (slug 入力一致、doc-10 §4.3)。 */
    unregisterInput: string;
    setUnregisterInput: (value: string) => void;
    onpickRoot: (field: "projectRoot" | "backlogRoot") => void;
    onfollowBacklogDefault: () => void;
    onaddAliasRow: () => void;
    onremoveAliasRow: (index: number) => void;
    onredetect: () => void;
    onsave: () => void;
    onunregister: () => void;
  }

  let {
    entry,
    ledgerReadOnly,
    notice: overviewNotice,
    edit,
    moveNote,
    editIssues,
    submitted,
    entryReport,
    saveControl,
    unregisterAvailable,
    redetect,
    remoteLine,
    remoteDisagreement,
    declaredStatuses,
    unregisterInput,
    setUnregisterInput,
    onpickRoot,
    onfollowBacklogDefault,
    onaddAliasRow,
    onremoveAliasRow,
    onredetect,
    onsave,
    onunregister,
  }: Props = $props();

  const t = messages();

  /** Where the held controls send `aria-describedby` (doc-11 §5). */
  const READ_ONLY_ID = "overview-blocked";
  const SAVE_BLOCKED_ID = "overview-save-blocked";
  const UNREGISTER_BLOCKED_ID = "overview-unregister-blocked";
  const REDETECT_BLOCKED_ID = "overview-redetect-blocked";

  function problemsFor(problems: FieldProblem[], field: LedgerField): string[] {
    return problems.filter((problem) => problem.field === field).map((problem) => problem.message);
  }
</script>

<!-- 概要区画 (doc-10 §4): the ledger file is the only thing it writes, so CLI 縮退 does not
     reach it. -->
<section>
  <h2>{t().projectDetail.overviewHeading}</h2>

  {#if ledgerReadOnly}
    <!-- doc-10 §8 asks for both the inputs and 登録解除 to be disabled. With only the save
         held back, the user could edit values that can never be written, that input would
         count as 未保存入力, and they would later be asked whether to discard changes that
         were never saveable (review [P2]). `disabled` is allowed because this sentence is on
         screen near the controls at all times (doc-11 §5). -->
    <p class="blocked-note" id={READ_ONLY_ID}>{overviewReadOnlyNote()}</p>
  {/if}

  {#if overviewNotice}
    <p class="ok">{overviewNotice()}</p>
  {/if}

  <div class="field">
    <span class="label">slug</span>
    <p class="value-line"><code>{entry.slug}</code></p>
    <!-- No unpressable field for it (doc-10 §4.1): what is shown is the value, and what
         changing it would take instead. -->
    <p class="hint">{slugImmutableNote()}</p>
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
      <button type="button" disabled={ledgerReadOnly} onclick={() => onpickRoot("projectRoot")}>
        {t().action.pick}
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
      <button type="button" disabled={ledgerReadOnly} onclick={() => onpickRoot("backlogRoot")}>
        {t().action.pick}
      </button>
      <button type="button" disabled={ledgerReadOnly} onclick={onfollowBacklogDefault}>
        {t().projectDetail.matchDefault}
      </button>
    </span>
  </label>
  {#each problemsFor(editIssues, "backlogRoot") as text (text)}
    <p class="problem">{text}</p>
  {/each}

  <div class="field">
    <span class="label">Git remote</span>
    <p class="value-line remote" class:setting={remoteLine.kind === "setting"} class:failure={remoteLine.kind === "failure"}>
      {#if remoteLine.address}
        <code>{remoteLine.text}</code>
        <span class="remote-name">{t().projectDetail.remoteName(remoteLine.name ?? "")}</span>
      {:else}
        {remoteLine.text}
      {/if}
    </p>
    {#if remoteDisagreement !== null}
      <p class="hint">{remoteDisagreement}</p>
    {/if}
    <span class="row-inline">
      <button
        type="button"
        disabled={redetect.state !== "ready"}
        aria-describedby={redetect.state === "withheld" ? REDETECT_BLOCKED_ID : undefined}
        onclick={onredetect}
      >
        {redetect.label}
      </button>
    </span>
    {#if redetect.state === "withheld"}
      <!-- doc-11 §5: a withheld control carries its reason in view, not on hover. The
           running state has no line of its own — its label is what says so. -->
      <p class="problem" id={REDETECT_BLOCKED_ID}>{redetect.reason}</p>
    {/if}
  </div>

  <fieldset class="aliases">
    <legend>{t().projectDetail.aliasLegend}</legend>
    <p class="hint">
      {t().projectDetail.aliasNote}
    </p>
    {#each edit.aliases as row, index (index)}
      {@const effect =
        declaredStatuses === null ? null : aliasKeyEffect(row.key, declaredStatuses)}
      {@const note = effect === null ? null : aliasEffectNote(effect)}
      {@const invalidValue = !CANONICAL_STATUS_NAMES.includes(row.value)}
      <div class="alias-row">
        <input
          type="text"
          placeholder={t().projectDetail.aliasKeyPlaceholder}
          list={`declared-${entry.slug}`}
          bind:value={row.key}
          disabled={ledgerReadOnly}
        />
        <!-- 値の対応を示す記号 (doc-11 §2.4). 操作に属さないアイコン: not inside a pressable
             control, and what it shows — 原文 status を正準列へ対応づける — is what the 区画's
             own hint sentence above says in words, which is the condition §2.4 puts on this
             type. So it carries no `aria-label`, no `title` and no focus. -->
        <Icon name="arrow-right" />
        <select bind:value={row.value} disabled={ledgerReadOnly}>
          {#each CANONICAL_STATUS_NAMES as name (name)}
            <option value={name}>{name}</option>
          {/each}
          {#if invalidValue}
            <!-- 不正な別名を台帳から削除しない (doc-3 §3.3, TASK-42). Showing the row with its
                 own out-of-range value *is* what「削除しない」means on this screen: listing
                 only the canonical four would swap the value for the first option the moment
                 the form opened, and the save would then drop it. -->
            <option value={row.value}>{t().projectDetail.aliasInvalid(row.value)}</option>
          {/if}
        </select>
        <!-- アイコンのみのボタン (doc-11 §2.4). 原文 is the wording「行を外す」; doc-10 §4.2
             records why this row takes a figure instead. The name has to name *which* row —
             with the glyph gone there is no visible name left, and the rows are otherwise
             alike. A row whose 原文 status is still empty has nothing to be called but its
             place in the table. -->
        <button
          type="button"
          class="drop"
          aria-label={row.key.trim() === ""
            ? t().projectDetail.aliasRemoveByIndex(index + 1)
            : t().projectDetail.aliasRemoveByKey(row.key)}
          title={t().projectDetail.aliasRemoveHint}
          disabled={ledgerReadOnly}
          onclick={() => onremoveAliasRow(index)}
        >
          <Icon name="x" />
        </button>
        {#if row.key.trim() !== ""}
          {#if note !== null}
            <!-- Whether the alias actually applies (doc-10 §4.2). Only the one ineffective
                 state takes the 不整合 family's colour. -->
            <span class="alias-effect" class:ineffective={note.ineffective} title={note.note}>
              {note.label}
            </span>
          {:else}
            <span class="alias-effect">
              {t().projectDetail.aliasUncheckable}
            </span>
          {/if}
        {/if}
      </div>
      {#if row.key.trim() !== "" && note !== null}
        <p class="alias-note" class:ineffective={note.ineffective}>{note.note}</p>
      {/if}
    {/each}
    <div class="row-inline">
      <button type="button" disabled={ledgerReadOnly} onclick={onaddAliasRow}>{t().projectDetail.aliasAdd}</button>
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

  <!-- 送る属性を保存の直前に列挙する (doc-10 §4.1). What is listed is what the request
       actually carries, not what the screen thinks it changed — a move carrying both roots
       shows up here. -->
  <div class="submit-preview">
    <h3>{t().projectDetail.attributesHeading}</h3>
    <!-- 状態文 (doc-11 §8): what this 区画 has to show when the list is empty. §8 puts 状態文
         outside its own scope, so the 一掃 that dropped this line as a 状態の言い換え
         (`8aa4be9`) was applying the wrong rule — and doc-10 §4.1 names「変更なし」as the
         word to use. It is also the 保存's 保留理由 stated by the 区画 itself (§8 の licence ①),
         which is why no second sentence is printed under the control. -->
    {#if submitted.length === 0}
      <p class="neutral">{t().projectDetail.attributesNone}</p>
    {:else}
      <ul class="submitted">
        {#each submitted as attribute (attribute.attribute)}
          <!-- 値の対応を示す記号 (doc-11 §2.4 の 操作に属さないアイコン). That type requires the
               区画's own words to say what the figure says, and here nothing did: the two
               values were told apart by the arrow alone, which is `aria-hidden`, so a reader
               heard「project_root 旧パス 新パス」. The words are 視覚的にのみ隠す (doc-11 §5 の
               2 つ目の形) — the figure already says it to the eye. -->
          <li>
            <code>{attribute.attribute}</code>
            <span class="unseen">{t().projectDetail.before}</span>
            <span class="from">{attribute.from}</span>
            <Icon name="arrow-right" />
            <span class="unseen">{t().projectDetail.after}</span>
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
      aria-disabled={saveControl.state !== "ready"}
      aria-describedby={saveControl.state === "ready"
        ? undefined
        : ledgerReadOnly
          ? READ_ONLY_ID
          : SAVE_BLOCKED_ID}
      title={saveControl.state === "withheld"
        ? saveControl.reason
        : t().projectDetail.saveHint}
      onclick={onsave}>{t().action.save}</button
    >
  </div>
  {#if !ledgerReadOnly}
    <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because `aria-describedby`
         points at it: hidden when the 区画 already states it (doc-11 §8), visible otherwise.
         On a read-only ledger the note above is the reason instead, so nothing is placed
         here at all. -->
    <p
      id={SAVE_BLOCKED_ID}
      class={saveControl.state === "withheld" && !omitsSentence(saveControl.reason)
        ? "blocked-note"
        : "unseen"}
    >
      {saveControl.state === "withheld" ? saveControl.reason : ""}
    </p>
  {/if}

  <!-- 登録解除 (doc-10 §4.3): a 危険区画, kept apart from the other operations. -->
  <div class="danger">
    <h3>{t().projectDetail.unregisterHeading}</h3>
    <p>{unregisterScopeNote()}</p>
    <label class="field">
      <span class="label">{t().projectDetail.unregisterConfirmLabel}</span>
      <input
        type="text"
        placeholder={entry.slug}
        spellcheck="false"
        value={unregisterInput}
        oninput={(event) => setUnregisterInput(event.currentTarget.value)}
        disabled={ledgerReadOnly}
      />
    </label>
    <div class="actions">
      <button
        type="button"
        aria-disabled={unregisterAvailable.state === "withheld"}
        aria-describedby={unregisterAvailable.state === "ready"
          ? undefined
          : ledgerReadOnly
            ? READ_ONLY_ID
            : UNREGISTER_BLOCKED_ID}
        title={unregisterAvailable.state === "withheld"
          ? unregisterAvailable.reason
          : t().projectDetail.unregisterHint}
        onclick={onunregister}>{t().projectDetail.unregister}</button
      >
    </div>
    {#if unregisterAvailable.state === "withheld" && !ledgerReadOnly}
      <p class="blocked-note" id={UNREGISTER_BLOCKED_ID}>{unregisterAvailable.reason}</p>
    {/if}
  </div>
</section>

<style lang="scss">
  @use "./shared" as shared;

  section {
    // 概要区画 は 一覧列 を持たないので、`.panel` の縦スクロールの中に素直に積む。
    display: block;
  }

  h2 {
    @include shared.heading-2;
  }

  h3 {
    @include shared.heading-3;
  }

  .field {
    @include shared.field;
  }

  .label {
    @include shared.field-label;
  }

  .row-inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;

    // 同じ行に並ぶ押しボタンはフォーム部品である (doc-11 §1・§2.2). The row is `center`, not the flex
    // default `stretch`, so the buttons do not pick the input's height up on their own — that is what
    // left 選択… 3.95px shorter than the path beside it (WebKit, 変更前実測).
    button {
      height: 1.75rem;
    }

    input[type="text"] {
      flex: 1;
      min-width: 0;
    }
  }

  .value-line {
    margin: 0;
  }

  // remote 現在値 (doc-10 §4.1). The three families are decision-6's, drawn as GitHistory.svelte
  // draws the same three — 正常な不在 は中立、設定で解消できるものは中間、失敗だけが族の色.
  .remote {
    margin-bottom: 0.35rem;
    // No font-size of its own: it is a `.value-line` like the slug's two fields above, and 実測 put
    // a size here 0.48px off that one (TASK-124). Two value lines in the same list differing for no
    // reason is what TASK-74 measured on two controls in one row.
    overflow-wrap: anywhere;

    &.setting {
      padding: 0.2rem 0.35rem;
      border-left: 2px solid var(--line-strong);
      background: var(--inset);
    }

    &.failure {
      color: var(--mark-unreadable);
    }
  }

  .remote-name {
    color: var(--muted);
  }

  input[type="text"],
  select {
    @include shared.form-control;
  }

  button {
    @include shared.button;

    &.primary {
      border-color: var(--info);
      background: color-mix(in srgb, var(--info) 14%, transparent);
    }
  }

  .actions {
    @include shared.actions;
  }

  .aliases {
    margin: 0 0 0.6rem;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    legend {
      font-size: var(--text-md);
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

    // 行削除 as an アイコンのみのボタン (doc-11 §2.4, doc-10 §4.2 の逸脱 1 件目). Centred and squared
    // off: the shared `button` padding above is sized for a word, and a figure given it sits in a box
    // wider than it is tall — beside an input and a select, that reads as a third field.
    // The height is the row's (doc-11 §2.2): this row is `center`, so nothing hands it down.
    .drop {
      display: inline-flex;
      height: 1.75rem;
      align-items: center;
      padding: 0.15rem 0.3rem;
    }
  }

  // How one alias row takes effect (doc-10 §4.2). Only the one ineffective state takes the 不整合
  // family's colour; the rest stay the colour of a secondary sentence — which is what keeps
  // 宣言集合なし, where the alias works without a declaration behind it, out of that mark.
  .alias-effect {
    color: var(--muted);
    font-size: var(--text-sm);

    &.ineffective {
      color: var(--mark-inconsistent);
    }
  }

  .alias-note {
    margin: 0 0 0.35rem;
    color: var(--muted);
    font-size: var(--text-sm);

    &.ineffective {
      color: var(--mark-inconsistent);
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
      font-size: var(--text-md);
    }

    .from {
      color: var(--muted);
    }

    .to {
      font-weight: 600;
    }
  }

  // 危険区画 (doc-10 §4.3): kept apart from the other operations. The confirmation is slug 入力一致,
  // a stricter condition than doc-11 §5's two-press default.
  .danger {
    margin-top: 1rem;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--mark-unreadable) 45%, transparent);
    border-radius: 4px;

    p {
      margin: 0 0 0.4rem;
      font-size: var(--text-md);
    }
  }

  .hint,
  .blocked-note {
    @include shared.muted-note;
  }

  .neutral {
    @include shared.neutral;
  }

  // A correctable input problem. decision-6's unreadable hue is deliberately not reused: this is
  // input the user can fix, not a root Atlas failed to read.
  .problem {
    margin: 0.15rem 0;
    color: var(--mark-inconsistent);
    font-size: var(--text-md);
  }

  .ok {
    @include shared.ok;
  }

  .unseen {
    @include shared.unseen;
  }

  code {
    @include shared.code;
  }
</style>
