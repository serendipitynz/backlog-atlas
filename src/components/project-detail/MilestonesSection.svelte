<script lang="ts">
  // マイルストーン区画 (doc-10 §6): マイルストーン一覧 — this 区画's 一覧列 (§1) — beside the
  // マイルストーンペイン, the same three columns the 文書区画 has. Each column scrolls on its own and
  // the 破棄前確認 stays above both, for the reasons doc-10 §5 records and §6 repeats.
  //
  // 編集セッションと選択、改称・削除・アーカイブ の入力は親が持つ (doc-10 §1 の 区画切替 が入力を
  // 落とさないのはそれが理由である)。ここが持つのは描画と、押されたこと・打たれた字の受け渡しだけである。
  import Body from "../Body.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import ListHead from "./ListHead.svelte";
  import type { Availability } from "../../lib/availability";
  import {
    buildMilestoneDescribe,
    milestoneKeepLeavesDanglingReferences,
    milestoneRemoveMovesTheFile,
    omitsSentence,
    type IssueAvailability,
    type IssuePlan,
    type MilestoneRemoveInput,
    type MilestoneRenameInput,
  } from "../../lib/manage";
  import { fileInconsistencyReasons, inconsistencyLabel, unmappedFileReason } from "../../lib/mark";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import { displayPath, withheldTitle } from "../../lib/project-detail";
  import type { Milestone, TaskView, UnmappedFile } from "../../lib/wire";

  /** 改称・削除・アーカイブ のうち、いま開いている 1 つ (doc-10 §6)。 */
  type Operation = "rename" | "remove" | "archive";

  interface Props {
    /** 台帳エントリの project_root。表示パス を組むのに要る。 */
    projectRoot: string;
    /** 読み取れたマイルストーン、または `null` (読み取り中)。 */
    milestones: readonly Milestone[] | null;
    /** 所属タスク件数 を数える対象 (doc-10 §6)。 */
    tasks: readonly TaskView[];
    /** ルート読取不能 のときに一覧の代わりに立つ文 (doc-10 §8)、または `null`。 */
    unreadableNote: string | null;
    unmappedMilestones: readonly UnmappedFile[];
    /** 破棄前確認 が立っているか。`milestone` が `null` なら編集を閉じようとしている。 */
    pending: { milestone: Milestone | null } | null;
    onleaveConfirmed: () => void;
    onbackToInput: () => void;
    /** 発行が進行中である間、一覧のカードと 編集 は同じ理由で押せない (doc-11 §5)。 */
    issuance: Availability;
    issuing: boolean;
    issuanceTitle: (hint: string) => string;
    /** いま マイルストーンペイン が開いているマイルストーンの id、または `null`。 */
    selection: string | null;
    /** そのマイルストーンを現在の読み取りから解決したもの。 */
    selected: Milestone | null;
    /** 編集セッション が開いているか (doc-10 §6 の 編集への切替)。 */
    sessionOpen: boolean;
    /** 編集セッション が未保存入力を持つ (改称・削除の入力、または編集された説明)。 */
    dirty: boolean;
    /** 閲覧ヘッダ に出す 理由行 (decision-24)。 */
    reasons: readonly string[];
    /** いま開いている 改称・削除・アーカイブ、または `null`。 */
    operation: Operation | null;
    renameInput: MilestoneRenameInput;
    removeInput: MilestoneRemoveInput;
    /** 説明 の欄に出す文字列 — 下書きがあればそれ、無ければ読み取り値 (decision-21)。 */
    descriptionText: string;
    setDescriptionDraft: (value: string) => void;
    /** いま開いている操作の 更新操作、または `null`。 */
    opPlan: (milestone: Milestone) => IssuePlan | null;
    /** 書き換え対象集合 (doc-9 §4.2.2)。 */
    targetsOf: (
      milestone: Milestone,
      plan: IssuePlan | null,
    ) => { fanOut: boolean; tasks: readonly TaskView[] };
    availabilityOf: (plan: IssuePlan) => IssueAvailability;
    oncreateOpen: () => void;
    onselect: (milestone: Milestone) => void;
    onstartEdit: () => void;
    oncloseEdit: () => void;
    onsaveDescription: (milestone: Milestone) => void;
    onopenOperation: (kind: Operation) => void;
    oncloseOperation: () => void;
    onrun: (milestone: Milestone, kind: Operation) => void;
    /**
     * マイルストーンペイン の要素を親へ渡す。選択が替わったときにスクロールを頭へ戻すのは親の仕事
     * なので (選択を持っているのが親である)、要素の参照だけこちらから渡す。**入力ではない。**
     */
    onpane: (element: HTMLDivElement | undefined) => void;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let {
    projectRoot,
    milestones,
    tasks,
    unreadableNote,
    unmappedMilestones,
    pending,
    onleaveConfirmed,
    onbackToInput,
    issuance,
    issuing,
    issuanceTitle,
    selection,
    selected,
    sessionOpen,
    dirty,
    reasons: openReasons,
    operation,
    renameInput,
    removeInput,
    descriptionText,
    setDescriptionDraft,
    opPlan,
    targetsOf,
    availabilityOf,
    oncreateOpen,
    onselect,
    onstartEdit,
    oncloseEdit,
    onsaveDescription,
    onopenOperation,
    oncloseOperation,
    onrun,
    onpane,
    onopenlink,
    readimage,
  }: Props = $props();

  const t = messages();

  /** Where a 一覧列's cards and the 閲覧ヘッダ's 編集 send `aria-describedby` (doc-11 §5). */
  const SELECT_BLOCKED_ID = "detail-milestone-select-blocked";
  const DESCRIBE_BLOCKED_ID = "detail-milestone-describe-blocked";
  /** The same for the マイルストーン閲覧ヘッダ's 編集 (doc-10 §6, TASK-121). */
  const EDIT_HELD_ID = "detail-milestone-edit-held";

  let pane = $state<HTMLDivElement | undefined>(undefined);
  $effect(() => onpane(pane));
</script>

<!-- マイルストーン区画 (doc-10 §6): マイルストーン一覧 — this 区画's 一覧列 (§1) — beside the
     マイルストーンペイン, the same three columns the 文書区画 has. Each column scrolls on its
     own and the 破棄前確認 stays above both, for the reasons doc-10 §5 records and §6
     repeats. -->
<section class="split-section">
  {#if unreadableNote !== null}
    <h2>{t().projectDetail.milestonesHeading}</h2>
    <p class="unreadable">{unreadableNote}</p>
  {:else if milestones === null}
    <h2>{t().projectDetail.milestonesHeading}</h2>
    <p class="neutral">{t().state.loading}</p>
  {:else}
    {#if pending !== null}
      <!-- 破棄前確認 (doc-10 §6): the open 編集セッション holds 未保存入力 and the requested
           move would drop it. The move itself has not been applied. The two paths are 別の
           マイルストーンを選ぶ and 編集を閉じる since TASK-121 — the second used to be
           選択を解除する, and the count of two is unchanged by the swap. -->
      <div class="confirm">
        <span>
          {#if pending.milestone === null}
            {t().projectDetail.milestoneUnsavedOnClose}
          {:else}
            {t().projectDetail.milestoneUnsavedOnOpen(pending.milestone.id)}
          {/if}
        </span>
        <button type="button" onclick={onleaveConfirmed}>{t().projectDetail.discardAndContinue}</button>
        <button type="button" onclick={onbackToInput}>{t().projectDetail.backToInput}</button>
      </div>
    {/if}

    <div class="columns">
      <div class="list-column">
        <!-- 一覧見出し行 (doc-10 §1, TASK-117) — the same row as the 文書一覧's, from the
             same snippet. §1 puts it on the 一覧列 rather than on the 区画, so the two that
             can add an object cannot come to differ in how one is added. -->
        <ListHead
          count={t().projectDetail.milestonesCount(milestones.length)}
          entry={t().projectDetail.milestoneNew}
          hint={t().projectDetail.milestoneNewHint}
          onopen={oncreateOpen}
        />
        {#if milestones.length === 0}
          <p class="neutral">{t().projectDetail.milestonesEmpty}</p>
        {:else}
          {#if issuance.state === "withheld"}
            <!-- Every card is held by the same one thing (doc-11 §5): written once above the
                 list and each card bound to it. They stay `aria-disabled` so they keep
                 taking focus, which is what makes the binding reachable without a pointer. -->
            <p class="reason" id={SELECT_BLOCKED_ID}>
              {t().projectDetail.milestoneIssuingBlocksOthers(issuance.reason)}
            </p>
          {/if}
          <ul class="cards">
            {#each milestones as milestone (milestone.id)}
              {@const held = tasks.filter(
                (view) => view.task.milestone === milestone.id,
              ).length}
              {@const current = selection === milestone.id}
              {@const editing = current && sessionOpen}
              {@const reasons = fileInconsistencyReasons(milestone.health, "milestone")}
              <li>
                <!-- カード (doc-10 §6): id・title・所属タスク件数. No 説明 — the 一覧列 is
                     16rem and the description is stated in the pane instead (§6's recorded
                     departure). Since TASK-121 the emphasis says「読んでいる」and the chip
                     below says「編集している」, the same split the 文書カード makes: a
                     selection opens 閲覧 and no 編集セッション. -->
                <button
                  type="button"
                  class="card"
                  class:current
                  aria-current={current ? "true" : undefined}
                  aria-disabled={issuing}
                  aria-describedby={issuing ? SELECT_BLOCKED_ID : undefined}
                  title={issuanceTitle(t().projectDetail.milestoneOpenHint)}
                  onclick={() => !issuing && onselect(milestone)}
                >
                  <span class="card-head">
                    <span class="id">{milestone.id}</span>
                    <span class="meta">{t().projectDetail.heldTasks(held)}</span>
                    {#if editing}
                      <span class="editing">{t().projectDetail.editing}</span>
                    {/if}
                    {#if editing && dirty}
                      <!-- 未保存入力の印 (doc-10 §6): only the card with the open 編集
                           セッション can carry it, and it is shown here so「まだ発行して
                           いない」stays readable when the マイルストーンペイン has scrolled
                           out of view. -->
                      <span class="unsaved">{t().projectDetail.unsaved}</span>
                    {/if}
                    {#if reasons.length > 0}
                      <!-- 不整合印 — same figure and same rule as the 文書カード (doc-10 §6
                           defers to §5 here rather than deciding it again). -->
                      <span
                        class="inconsistent"
                        role="img"
                        aria-label={inconsistencyLabel(reasons)}
                        title={inconsistencyLabel(reasons)}
                      >
                        <Icon name="triangle-alert" />
                      </span>
                    {/if}
                  </span>
                  <span class="card-title">{milestone.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if unmappedMilestones.length > 0}
          <!-- 写せなかったファイルの一覧 — same form as the 文書区画's (doc-10 §1/§6). -->
          <div class="unmapped">
            <h3>{t().projectDetail.unmappedFiles(unmappedMilestones.length)}</h3>
            <ul>
              {#each unmappedMilestones as file (file.sourcePath)}
                <li>
                  <code>{displayPath(file.sourcePath, projectRoot)}</code>
                  <span class="reason-line">{unmappedFileReason(file)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- マイルストーンペイン (doc-10 §6, renamed from 操作ペイン by TASK-121): 非選択時 の
           1 行, then 閲覧 while a milestone is merely selected, then the 編集セッション
           alone once 編集 is pressed. The same three states — and the same order of
           branches — as the 文書ペイン's, since selection now opens the same thing in both.
           The name follows §5's rule that a column is named for what it opens. -->
      <div class="pane" bind:this={pane}>
        {#if selected !== null && sessionOpen}
          {@const milestone = selected}
          {@const plan = opPlan(milestone)}
          {@const open = operation}
          {@const opIssue = plan === null ? null : availabilityOf(plan)}
          {@const targets = targetsOf(milestone, plan)}
          {@const describeIssue = availabilityOf(
            buildMilestoneDescribe(milestone, descriptionText),
          )}
          <!-- 編集セッション (doc-8 §1, doc-10 §6): everything that takes input or issues a
               write is behind 編集への切替, so that 閲覧 keeps the property §5 gave it —
               holding no input, and therefore never raising a 破棄前確認 from reading. -->
          <div class="sub-panel">
            <!-- Which milestone this session is about, in the place the 文書区画's update
                 form states the same thing. The 一覧 says it too (emphasis and 編集中 chip),
                 but the two columns scroll apart — the selected card can be above the
                 viewport while this pane is being typed into, which is the direction §6
                 already argues in for the 未保存 chip. -->
            <h3>{t().projectDetail.milestoneEditHeading(milestone.id)}</h3>
            <!-- 説明 (doc-10 §6): stated on this column rather than on the card, which is the
                 second of this 区画's departures from design 07 — and editable, which is the
                 third (decision-21). The box is not one of the 改称・削除・アーカイブ
                 operations: it is open for as long as the session is, because the
                 description is what this column states about the milestone and editing it is
                 that statement being corrected. -->
            <label class="field">
              <span class="label">{t().field.description}</span>
              <textarea
                rows="4"
                placeholder={t().projectDetail.milestoneDescriptionPlaceholder}
                value={descriptionText}
                oninput={(event) =>
                  setDescriptionDraft(event.currentTarget.value)}
              ></textarea>
            </label>
            <!-- Not pinned (doc-11 §11): this column holds 改称・削除・アーカイブ as well, so no
                 one 発行 owns its bottom row. 取りやめ → 発行 all the same. -->
            <div class="actions">
              <button type="button" onclick={oncloseEdit}>{t().action.cancel}</button>
              <button
                type="button"
                aria-disabled={describeIssue.state !== "ready"}
                aria-describedby={describeIssue.state === "blocked" ? DESCRIBE_BLOCKED_ID : undefined}
                title={withheldTitle(describeIssue)}
                onclick={() =>
                  describeIssue.state === "ready" && onsaveDescription(milestone)}
              >
                {t().projectDetail.milestoneDescriptionSave}
              </button>
              <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). See the 文書ペイン's copy above. -->
              <span
                id={DESCRIBE_BLOCKED_ID}
                class={describeIssue.state === "blocked" &&
                omitsSentence(describeIssue.reason)
                  ? "unseen"
                  : "reason"}
              >
                {describeIssue.state === "blocked" ? describeIssue.reason : ""}
              </span>
            </div>

            <!-- 改称・削除・アーカイブ (doc-10 §6). doc-9 §4.2 defines the 照合 for all
                 three, which is why Atlas offers them at all (TASK-45).
                 アーカイブ takes no input, but it issues a write, and §6 keeps every issuing
                 operation on this side of 編集への切替 rather than splitting the three. -->
            <div class="actions">
              <button
                type="button"
                aria-expanded={open === "rename"}
                disabled={issuing}
                title={issuanceTitle("")}
                onclick={() => onopenOperation("rename")}
              >
                {t().projectDetail.rename}
              </button>
              <button
                type="button"
                aria-expanded={open === "remove"}
                disabled={issuing}
                title={issuanceTitle("")}
                onclick={() => onopenOperation("remove")}
              >
                {t().projectDetail.remove}
              </button>
              <button
                type="button"
                aria-expanded={open === "archive"}
                disabled={issuing}
                title={issuanceTitle("")}
                onclick={() => onopenOperation("archive")}
              >
                {t().projectDetail.archive}
              </button>
            </div>

            {#if open !== null}
              <div class="sub-panel">
                {#if open === "rename"}
                  <h3>{t().projectDetail.rename}</h3>
                  <label class="field">
                    <span class="label">{t().projectDetail.renameNewName}</span>
                    <input
                      type="text"
                      value={renameInput.to}
                      oninput={(event) => (renameInput.to = event.currentTarget.value)}
                    />
                  </label>
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={renameInput.updateTasks}
                      onchange={(event) =>
                        (renameInput.updateTasks = event.currentTarget.checked)}
                    />
                    <span>{t().projectDetail.renameUpdatesTasks}</span>
                  </label>
                  <!-- 改称が id を変えないことの測定は doc-9 §4.2.1 にあり、版は画面に出さない
                       (decision-27). -->
                  <p class="hint">
                    {t().projectDetail.renameNote(milestone.id)}
                  </p>
                {:else if open === "remove"}
                  <h3>{t().projectDetail.remove}</h3>
                  <p class="hint">{milestoneRemoveMovesTheFile()}</p>
                  <fieldset class="handling">
                    <legend>{t().projectDetail.removeTasksLegend}</legend>
                    {#each [{ mode: "clear", label: t().projectDetail.removeTasksClear }, { mode: "keep", label: t().projectDetail.removeTasksKeep }, { mode: "reassign", label: t().projectDetail.removeTasksReassign }] as choice (choice.mode)}
                      <label class="check">
                        <input
                          type="radio"
                          name={`handling-${milestone.id}`}
                          checked={removeInput.handling === choice.mode}
                          onchange={() =>
                            (removeInput.handling = choice.mode as
                              | "clear"
                              | "keep"
                              | "reassign")}
                        />
                        <span>{choice.label}</span>
                      </label>
                    {/each}
                  </fieldset>
                  {#if removeInput.handling === "keep"}
                    <p class="hint">{milestoneKeepLeavesDanglingReferences()}</p>
                  {/if}
                  {#if removeInput.handling === "reassign"}
                    <label class="field">
                      <span class="label">{t().projectDetail.reassignTarget}</span>
                      <select
                        value={removeInput.reassignTo}
                        onchange={(event) =>
                          (removeInput.reassignTo = event.currentTarget.value)}
                      >
                        <option value="">{t().projectDetail.chooseOne}</option>
                        {#each milestones.filter((candidate) => candidate.id !== milestone.id) as candidate (candidate.id)}
                          <option value={candidate.id}>
                            {candidate.id}
                            {candidate.title}
                          </option>
                        {/each}
                      </select>
                    </label>
                  {/if}
                {:else}
                  <h3>{t().projectDetail.archive}</h3>
                  <p class="hint">
                    {t().projectDetail.archiveNote}
                  </p>
                {/if}

                <!-- 実行前に書き換え対象集合を示す (doc-10 §6, doc-9 §4.2.2/§4.2.3): what the
                     user decides from has to be what the check protects. -->
                <div class="targets">
                  <h4>{t().projectDetail.rewriteTargetsHeading}</h4>
                  <ul class="paths">
                    <li>{milestone.sourcePath}</li>
                  </ul>
                  {#if targets.fanOut}
                    <p class="meta">
                      {t().projectDetail.rewriteTargets(targets.tasks.length)}
                    </p>
                    {#if targets.tasks.length > 0}
                      <ul class="paths">
                        {#each targets.tasks as view (view.task.sourcePath)}
                          <li>{view.task.id ?? view.task.sourcePath}</li>
                        {/each}
                      </ul>
                    {/if}
                  {:else}
                    <p class="meta">{t().projectDetail.rewriteNone}</p>
                  {/if}
                </div>

                <div class="actions">
                  <!-- 取りやめ → 発行 (doc-11 §11). Not pinned: see the 説明を保存 row above. -->
                  <button type="button" onclick={oncloseOperation}>{t().action.cancel}</button>
                  <button
                    type="button"
                    disabled={opIssue?.state !== "ready"}
                    title={opIssue === null ? "" : withheldTitle(opIssue)}
                    onclick={() =>
                      open !== null && onrun(milestone, open)}
                  >
                    {open === "rename"
                      ? t().projectDetail.issueRename
                      : open === "remove"
                        ? t().projectDetail.issueRemove
                        : t().projectDetail.issueArchive}
                  </button>
                  {#if opIssue?.state === "blocked" && !omitsSentence(opIssue.reason)}
                    <span class="reason">{opIssue.reason}</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {:else if selected !== null}
          {@const milestone = selected}
          {@const held = tasks.filter(
            (view) => view.task.milestone === milestone.id,
          ).length}
          <!-- 閲覧 (doc-10 §6, TASK-121): what the selection opens. No input of any kind, so
               nothing here can hold 未保存入力 and no 破棄前確認 can arise from reading —
               the property §5 attached to this word, kept by using the same word. -->
          <div class="sub-panel">
            <!-- 閲覧ヘッダ: title and 編集 on one line, then id・所属タスク件数, then the
                 理由行. The heading is the milestone's own title rather than a sentence
                 about it, for the reason the 文書区画's copy gives. -->
            <div class="view-head">
              <h3>{milestone.title}</h3>
              <!-- Held while a 発行 is in flight, and the reason is reachable without a
                   pointer — route (b) of doc-11 §5, the same treatment the 文書区画's
                   編集 gets. -->
              <button
                type="button"
                aria-disabled={issuing}
                aria-describedby={issuing ? EDIT_HELD_ID : undefined}
                title={issuanceTitle(t().projectDetail.milestoneEditOpenHint)}
                onclick={() => !issuing && onstartEdit()}
              >
                {t().action.edit}
              </button>
            </div>
            {#if issuance.state === "withheld"}
              <p class="reason" id={EDIT_HELD_ID}>
                {t().projectDetail.milestoneIssuingBlocksEdit(issuance.reason)}
              </p>
            {/if}
            <p class="meta-line">
              <span class="id">{milestone.id}</span>
              <span>{t().projectDetail.heldTasks(held)}</span>
            </p>
            {#if openReasons.length > 0}
              <!-- 理由行 (decision-22, doc-10 §6 as TASK-121 revised it): the place doc-11
                   §2.4 requires the ⚠️'s full reason to be readable without hovering. It
                   moved here from the pane's heading when the selection started opening
                   閲覧 — decision-24's rule (under the heading of whatever the selection
                   opens) did not change, only the place it points at. -->
              <!-- Keyed by index for the reason the 文書区画's copy gives. -->
              <ul class="reason-lines">
                {#each openReasons as reason, at (at)}
                  <li>{reason}</li>
                {/each}
              </ul>
            {/if}
            <!-- 説明 (doc-10 §6): the current value, read-only. Same treatment as the
                 文書区画's 本文 — the string as read, with doc-8 §2.1's 48rem line length on
                 it, since this column takes whatever width is left. -->
            {#if (milestone.description ?? "") === ""}
              <p class="neutral">{t().projectDetail.milestoneDescriptionEmpty}</p>
            {:else}
              <div class="read-body-slot"><Body source={milestone.description ?? ""} {onopenlink} {readimage} /></div>
            {/if}
          </div>
        {:else}
          <!-- 非選択時のマイルストーンペイン (doc-10 §6, TASK-117). The same single line the
               文書ペイン draws in this state: the 作成フォーム went to the 作成モーダル, and
               what used to differ — this 区画 had no 提供しない操作 to list where the 文書区画
               had one — stopped differing when TASK-123 dropped that 区画 from both. The
               column is still drawn — folding it would move the cards' width every time a
               selection came and went (§5・§6) — and the line says what the column is for.
               Since TASK-121 this state is reached only by the three occasions §6 lists, not
               by a press: 選択を解除 is gone. -->
          <p class="neutral">{t().projectDetail.milestoneNotSelected}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  @use "./shared" as shared;

  .split-section {
    @include shared.split-section;

    > h2,
    > .confirm,
    > .unreadable,
    > .neutral {
      @include shared.split-section-inset;
    }
  }

  .columns {
    @include shared.columns;
  }

  .list-column {
    @include shared.list-column;
  }

  .cards {
    @include shared.cards;

    li {
      @include shared.cards-item;
    }
  }

  .card {
    @include shared.card;

    &.current {
      @include shared.card-current;
    }

    .card-head {
      @include shared.card-head;
    }

    .id {
      @include shared.card-id;
    }

    .meta {
      @include shared.card-meta;
    }

    .card-head .meta {
      @include shared.card-head-meta;
    }

    .card-title {
      @include shared.card-title;
    }
  }

  .editing {
    @include shared.editing-mark;
  }

  .unsaved {
    @include shared.unsaved-mark;
  }

  .pane {
    @include shared.pane;

    > :first-child {
      margin-top: 0;
    }
  }

  h2 {
    @include shared.heading-2;
  }

  h3 {
    @include shared.heading-3;
  }

  .sub-panel {
    @include shared.sub-panel;
  }

  .view-head {
    @include shared.view-head;

    h3 {
      @include shared.view-head-heading;
    }

    button {
      flex: none;
    }
  }

  .meta-line {
    @include shared.meta-line;

    .id {
      @include shared.meta-line-id;
    }
  }

  .read-body-slot {
    @include shared.read-body-slot;
  }

  .inconsistent {
    @include shared.inconsistent-glyph;
  }

  .reason-lines {
    @include shared.reason-lines;

    li {
      @include shared.reason-lines-item;
    }
  }

  .unmapped {
    @include shared.unmapped-list;

    h3 {
      @include shared.unmapped-heading;
    }

    ul {
      @include shared.unmapped-items;
    }

    li {
      @include shared.unmapped-item;
    }

    code {
      @include shared.unmapped-path;
    }
  }

  .reason-line {
    @include shared.reason-line;
  }

  .field {
    @include shared.field;
  }

  .label {
    @include shared.field-label;
  }

  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.55rem;
    font-size: var(--text-md);
  }

  /* 参照するタスクの扱い (doc-10 §6): the same framed group the alias table uses, so a required
     choice reads as one field rather than three loose radios. */
  .handling {
    margin: 0 0 0.6rem;
    padding: 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    legend {
      font-size: var(--text-md);
      opacity: 0.8;
    }

    .check {
      margin-bottom: 0.25rem;
    }
  }

  /* 書き換え対象集合 (doc-9 §4.2.2) shown before the operation is issued. */
  .targets {
    margin: 0 0 0.55rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--inset);

    h4 {
      margin: 0 0 0.25rem;
      font-size: var(--text-md);
      opacity: 0.85;
    }
  }

  .paths {
    margin: 0 0 0.25rem;
    padding-left: 1rem;
    font-size: var(--text-md);
    word-break: break-all;
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

  .confirm {
    @include shared.confirm-band;

    button {
      @include shared.confirm-band-button;
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

  .unseen {
    @include shared.unseen;
  }

  code {
    @include shared.code;
  }
</style>
