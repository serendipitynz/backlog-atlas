<script lang="ts">
  // この画面が上げる被せ層 — 作成モーダル (doc-10 §1, TASK-117) と 注記モーダル (doc-10 §7, TASK-123).
  // 区画の外にあるのは、被せ層 がどの区画の一部でもないからである: `Modal.svelte` は窓の上へ固定の背景を
  // 描き、層は 共通入口 の 3 つと同じように 上部帯 まで覆う。
  //
  // One `Modal` for all three contents rather than one each: 被せ層 は 1 枚だけ (doc-7 §2.1), and the
  // caller's `layerOpen` already makes that structural. It carries the same three obligations here as
  // anywhere — focus held inside, Escape, focus back to the 入口 the layer captured as it mounted.
  //
  // 入力は親が持つ (`docInput`・`milestoneInput` は親の `$state`)。層が閉じるときに何を捨てるかは
  // 親の 破棄前確認 が決める。
  import Modal from "../Modal.svelte";
  import { AVAILABLE, type Availability } from "../../lib/availability";
  import type { DiscardAnswers } from "../../lib/edit";
  import {
    DOC_TYPES,
    omitsSentence,
    taskCreateLaterFields,
    taskCreateNote,
    type DocCreateInput,
    type IssueAvailability,
    type MilestoneAddInput,
  } from "../../lib/manage";
  import { messages } from "../../lib/messages-context";
  import { withheldTitle } from "../../lib/project-detail";

  interface Props {
    /** どの層が開いているか。`null` のときこのコンポーネントは何も描かない。 */
    layerOpen: "document" | "milestone" | "task-note" | null;
    /** 作成モーダル のうちどちらか、または `null` (注記モーダル)。 */
    createOpen: "document" | "milestone" | null;
    /** 層の名前 — 読み上げに出る (doc-11 §7)。 */
    label: string;
    /**
     * 閉じる を保留する理由 (doc-11 §7)。作成モーダル では 発行中 がそれで、守っているのは
     * すでに管理ファイルへ送った 作成 である — その上で 破棄して閉じる を出すと、いま書かれている
     * 入力について尋ねることになる。
     */
    issuance: Availability;
    /** 破棄前確認 の 2 つの答え、または `null` (捨てるものが無い)。 */
    confirm: DiscardAnswers | null;
    onclose: () => void;
    /** 発行前の入力。親の `$state` そのもので、欄はこの項目を書き換える。 */
    docInput: DocCreateInput;
    docCreateIssue: IssueAvailability;
    oncreateDoc: () => void;
    milestoneInput: MilestoneAddInput;
    milestoneIssue: IssueAvailability;
    onaddMilestone: () => void;
    /** 注記モーダル の名前 (doc-10 §7)。 */
    noteLabel: string;
  }

  let {
    layerOpen,
    createOpen,
    label,
    issuance,
    confirm,
    onclose,
    docInput,
    docCreateIssue,
    oncreateDoc,
    milestoneInput,
    milestoneIssue,
    onaddMilestone,
    noteLabel,
  }: Props = $props();

  const t = messages();
</script>

{#if layerOpen !== null}
  <Modal
    {label}
    closeAvailability={createOpen === null ? AVAILABLE : issuance}
    confirmDiscard={confirm}
    {onclose}
  >
    {#if createOpen === "document"}
      <div class="modal-form">
        <h2>{t().projectDetail.documentCreateHeading}</h2>
        <!-- 欄は 1 欄ずつ縦に積む (doc-10 §1): 作成モーダルの「同じ型」に欄の積み方が入るので、
             マイルストーン側と並び方が違う形はもう取れない。横 1 行だったのは §1 が積み方を
             覆っていなかった間のことで、実装の逸脱ではない。 -->
        <label class="field">
          <span class="label">{t().field.titleRequired}</span>
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
            <option value="">{t().projectDetail.cliDefault}</option>
            {#each DOC_TYPES as value (value)}
              <option {value}>{value}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="label">path</span>
          <input
            type="text"
            placeholder={t().projectDetail.docPathPlaceholder}
            value={docInput.path}
            oninput={(event) => (docInput.path = event.currentTarget.value)}
          />
        </label>
        <!-- 本文の欄をここに出さないことについては何も述べない (doc-10 §5, doc-11 §8): 画面が欄を
             見せていないものについて、なぜ無いかを述べない、が本則である。代替経路の案内 にも
             当たらない — この層は `doc create` が受け取る 3 項目を全部出しており、欄の不在を
             作っていない (§7 の 注記モーダル と分かれるのはそこである)。作成した文書へ本文を
             入れる先は文書ペインの編集セッションで、そこには欄がある。 -->
        <!-- No 下部操作行 (doc-11 §7): 「文書を作成」 writes but does not leave the layer, so there is
             only one way out and nothing for a second wording to tell apart. What the × does with
             what is typed here is said by the 破棄前確認 instead. **The pinned 発行の行 below is not one**
             (doc-11 §11): that row carries a 発行, and a 下部操作行 carries exits. -->
        <div class="issue">
          {#if docCreateIssue.state === "blocked" && !omitsSentence(docCreateIssue.reason)}
            <span class="reason">{docCreateIssue.reason}</span>
          {/if}
          <div class="actions">
            <button
              type="button"
              disabled={docCreateIssue.state !== "ready"}
              title={withheldTitle(docCreateIssue)}
              onclick={oncreateDoc}
            >
              {t().projectDetail.documentCreate}
            </button>
          </div>
        </div>
      </div>
    {:else if layerOpen === "task-note"}
      <!-- 注記モーダル (doc-10 §7). 代替経路の案内 (doc-11 §8) and nothing else: where these are
           added, never why the form has no input for them. No 下部操作行 — the layer holds no
           下書き, so it has no exit that writes and leaves for the ✕ to be told apart from
           (doc-11 §7 の条件). -->
      <div class="modal-form note">
        <h2>{noteLabel}</h2>
        <p>{taskCreateNote()}</p>
        <ul>
          {#each taskCreateLaterFields() as field (field)}
            <li>{field}</li>
          {/each}
        </ul>
      </div>
    {:else}
      <div class="modal-form">
        <h2>{t().projectDetail.milestoneCreateHeading}</h2>
        <label class="field">
          <span class="label">{t().projectDetail.nameRequired}</span>
          <input
            type="text"
            value={milestoneInput.name}
            oninput={(event) => (milestoneInput.name = event.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="label">{t().field.description}</span>
          <input
            type="text"
            value={milestoneInput.description}
            oninput={(event) => (milestoneInput.description = event.currentTarget.value)}
          />
        </label>
        <!-- 発行の行 (doc-11 §11), as the 文書を作成 layer above. -->
        <div class="issue">
          {#if milestoneIssue.state === "blocked" && !omitsSentence(milestoneIssue.reason)}
            <span class="reason">{milestoneIssue.reason}</span>
          {/if}
          <div class="actions">
            <button
              type="button"
              disabled={milestoneIssue.state !== "ready"}
              title={withheldTitle(milestoneIssue)}
              onclick={onaddMilestone}
            >
              {t().projectDetail.milestoneCreate}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </Modal>
{/if}

<style lang="scss">
  @use "./shared" as shared;

  /*
   * The inside of a 作成モーダル (doc-10 §1). No border of its own — the layer `Modal.svelte` draws is
   * already a box, and a second one inside it would read as a 区画 within the 被せ層.
   *
   * The right padding clears the ×, which `Modal.svelte` puts out of the flow above whatever the
   * caller draws first. The two numbers are that layer's own custom properties, so moving the × moves
   * the room kept for it here without this file restating either.
   */
  .modal-form {
    padding: 0.75rem;
    padding-right: calc(var(--modal-close-inset) * 2 + var(--modal-close-size));
    // The 発行の行 pins to the bottom of the layer's scrolling region (doc-11 §11); a padding here
    // would hold it that far off the edge it pins to, and it carries its own instead.
    padding-bottom: 0;

    > :first-child {
      margin-top: 0;
    }

    // 区切りは層の幅いっぱいに引く — 設定モーダルの下部操作行と同じ見え方にする (目視 2026-08-10)。
    // 右は × のぶんまで戻す: 行の中身は × を避ける必要が無く、避けているのは上の欄だけである。
    .issue {
      margin-right: calc(-1 * (var(--modal-close-inset) * 2 + var(--modal-close-size)));
      margin-left: -0.75rem;
    }
  }

  // 注記モーダル (doc-10 §7): one sentence and the names under it. No `code`, no per-item reason —
  // what the layer is for is 代替経路の案内 alone (doc-11 §8).
  .note {
    // Keeps the bottom padding the other two give up: this layer holds no 発行, so there is no row
    // pinned to the bottom edge to carry it (doc-11 §11 — 発行の控えを持たない面は本節の外である).
    padding-bottom: 0.75rem;

    ul {
      margin: 0.35rem 0 0;
      padding-left: 1.1rem;
    }

    li {
      margin-bottom: 0.2rem;
    }
  }

  h2 {
    @include shared.heading-2;
  }

  .field {
    @include shared.field;
  }

  .label {
    @include shared.field-label;
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

    .actions {
      @include shared.issue-actions;
    }

    .reason {
      @include shared.issue-reason;
    }
  }

  .reason {
    @include shared.muted-note;
  }
</style>
