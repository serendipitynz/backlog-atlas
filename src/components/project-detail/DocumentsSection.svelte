<script lang="ts">
  // 文書区画 (doc-10 §5): 文書一覧 (16rem) beside the 文書ペイン, the screen's own second and third
  // column after the 区画ナビ. Each column scrolls on its own — a deliberate departure from
  // design 07's single scroller, recorded in doc-10 §5 — so choosing a document swaps the pane while
  // the list keeps its scroll position. The 破棄前確認 stays above the columns: it must be visible
  // whatever either column has scrolled to.
  //
  // 編集セッションと選択、そしてそこから導かれる値は親が持つ (doc-10 §1 の 区画切替 が入力を落とさない
  // のはそれが理由である)。ここが持つのは描画と、押されたこと・打たれた字の受け渡しだけである。
  import Body from "../Body.svelte";
  import Editor from "../Editor.svelte";
  import Icon from "../../lib/icons/Icon.svelte";
  import ListEditor from "./ListEditor.svelte";
  import ListHead from "./ListHead.svelte";
  import type { Availability } from "../../lib/availability";
  import {
    DOC_TYPES,
    omitsSentence,
    type DocDraft,
    type DocSession,
    type IssueAvailability,
  } from "../../lib/manage";
  import { fileInconsistencyReasons, inconsistencyLabel, unmappedFileReason } from "../../lib/mark";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import { MAC_KEYBOARD } from "../../lib/platform";
  import { displayPath, issueControlTitle } from "../../lib/project-detail";
  import { ariaKeyShortcuts, shortcutHint } from "../../lib/shortcuts";
  import type { Document, UnmappedFile } from "../../lib/wire";

  interface Props {
    /** 台帳エントリの project_root。表示パス を組むのに要る。 */
    projectRoot: string;
    /** 読み取れた文書、または `null` (読み取り中)。ルート読取不能 は `unreadableNote` が述べる。 */
    documents: readonly Document[] | null;
    /** ルート読取不能 のときに一覧の代わりに立つ文 (doc-10 §8)、または `null`。 */
    unreadableNote: string | null;
    unmappedDocuments: readonly UnmappedFile[];
    /** 破棄前確認 が立っているか。`document` が `null` なら閉じようとしている。 */
    pending: { document: Document | null } | null;
    onleaveConfirmed: () => void;
    onbackToInput: () => void;
    /** 発行が進行中である間、一覧のカードと 編集 は同じ理由で押せない (doc-11 §5)。 */
    issuance: Availability;
    issuing: boolean;
    /** 発行中の 編集 の `title`。押せるときは操作の説明、押せないときはその理由。 */
    issuanceTitle: (hint: string) => string;
    /** いま 文書ペイン が開いている文書の id、または `null`。 */
    selection: string | null;
    /** その文書を現在の読み取りから解決したもの。 */
    selectedDocument: Document | null;
    /** 選択されている文書の 表示パス。読めないときは `null` (doc-10 §5)。 */
    selectedPath: string | null;
    /** 閲覧ヘッダ に出す 理由行 (decision-24)。 */
    reasons: readonly string[];
    /** 編集セッション、または `null`。 */
    session: DocSession | null;
    /** 編集セッション が未保存入力を持つ (tags の下書きを含む)。 */
    editorDirty: boolean;
    setDoc: <K extends keyof DocDraft>(key: K, value: DocDraft[K]) => void;
    /** まだ 追加 されていない tag の下書き。 */
    newTag: string;
    setNewTag: (value: string) => void;
    updateIssue: IssueAvailability;
    oncreateOpen: () => void;
    onselect: (document: Document) => void;
    onstartEdit: () => void;
    oncloseEditor: () => void;
    onupdate: () => void;
    /**
     * 文書ペイン の要素を親へ渡す。選択が替わったときにスクロールを頭へ戻すのは親の仕事なので
     * (選択を持っているのが親である)、要素の参照だけこちらから渡す。**入力ではない。**
     */
    onpane: (element: HTMLDivElement | undefined) => void;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let {
    projectRoot,
    documents,
    unreadableNote,
    unmappedDocuments,
    pending,
    onleaveConfirmed,
    onbackToInput,
    issuance,
    issuing,
    issuanceTitle,
    selection,
    selectedDocument,
    selectedPath,
    reasons: openReasons,
    session,
    editorDirty,
    setDoc,
    newTag,
    setNewTag,
    updateIssue,
    oncreateOpen,
    onselect,
    onstartEdit,
    oncloseEditor,
    onupdate,
    onpane,
    onopenlink,
    readimage,
  }: Props = $props();

  const t = messages();

  /** Where a 一覧列's cards and the 閲覧ヘッダ's 編集 send `aria-describedby` (doc-11 §5). */
  const EDIT_BLOCKED_ID = "detail-doc-edit-blocked";
  const UPDATE_BLOCKED_ID = "detail-doc-update-blocked";
  /** The same for the 閲覧ヘッダ's 編集: a different sentence, since that one is about editing. */
  const EDIT_HELD_ID = "detail-doc-edit-held";

  let pane = $state<HTMLDivElement | undefined>(undefined);
  $effect(() => onpane(pane));
</script>

<!-- 文書区画 (doc-10 §5): 文書一覧 (16rem) beside the 文書ペイン, the screen's own second and
     third column after the 区画ナビ. Each column scrolls on its own — a deliberate departure
     from design 07's single scroller, recorded in doc-10 §5 — so choosing a document swaps
     the pane while the list keeps its scroll position. The 破棄前確認 stays above the
     columns: it must be visible whatever either column has scrolled to. -->
<section class="split-section">
  {#if unreadableNote !== null}
    <h2>{t().projectDetail.documentsHeading}</h2>
    <p class="unreadable">{unreadableNote}</p>
  {:else if documents === null}
    <h2>{t().projectDetail.documentsHeading}</h2>
    <p class="neutral">{t().state.loading}</p>
  {:else}
    {#if pending !== null}
      <!-- 破棄前確認: 未保存入力 is held and the requested action would drop it. The action
           itself has not been applied. -->
      <div class="confirm">
        <span>
          {#if pending.document === null}
            {t().projectDetail.documentUnsavedOnClose}
          {:else}
            {t().projectDetail.documentUnsavedOnOpen(pending.document.id)}
          {/if}
        </span>
        <button type="button" onclick={onleaveConfirmed}>{t().projectDetail.discardAndContinue}</button>
        <button type="button" onclick={onbackToInput}>{t().projectDetail.backToInput}</button>
      </div>
    {/if}

    <div class="columns">
      <div class="list-column">
        <!-- 一覧見出し行 (doc-10 §1, TASK-117): the count and the 作成の入口 on one line, at
             the head of the column and outside its scroller — so both stay readable however
             far the cards are scrolled. The count is the cards' own (目視反映), which is why
             the 写せなかったファイル below are not in it (decision-24). -->
        <ListHead
          count={t().projectDetail.documentsCount(documents.length)}
          entry={t().projectDetail.documentNew}
          hint={t().projectDetail.documentNewHint}
          onopen={oncreateOpen}
        />
        {#if documents.length === 0}
          <p class="neutral">{t().projectDetail.documentsEmpty}</p>
        {:else}
          {#if issuance.state === "withheld"}
            <!-- Every card is held by the same one thing (doc-11 §5): the reason is written
                 once above the list and each card is bound to it. They stay `aria-disabled`
                 so they keep taking focus, which is what makes the binding reachable
                 without a pointer. -->
            <p class="reason" id={EDIT_BLOCKED_ID}>
              {t().projectDetail.documentIssuingBlocksOthers(issuance.reason)}
            </p>
          {/if}
          <ul class="cards">
            {#each documents as document (document.id)}
              {@const current = selection === document.id}
              {@const editing = session?.baseline.id === document.id}
              {@const reasons = fileInconsistencyReasons(document.health, "document")}
              <li>
                <!-- カード (doc-10 §5): the whole area is the selection — no separate 編集
                     button, and the current card is marked (目視反映: which document is
                     being read must be readable from the list). No path here: the 表示パス
                     moved to the 文書ペイン (doc-10 §5's recorded departure). Since TASK-116
                     the emphasis says「読んでいる」and the chip below says「編集している」:
                     a selection opens 閲覧 and no 編集セッション. -->
                <button
                  type="button"
                  class="card"
                  class:current
                  aria-current={current ? "true" : undefined}
                  aria-disabled={issuing}
                  aria-describedby={issuing ? EDIT_BLOCKED_ID : undefined}
                  title={issuance.state === "withheld"
                    ? issuance.reason
                    : t().projectDetail.documentOpenHint}
                  onclick={() => !issuing && onselect(document)}
                >
                  <span class="card-head">
                    <span class="id">{document.id}</span>
                    <span class="meta">{document.type ?? t().projectDetail.typeUnset}</span>
                    {#if editing}
                      <span class="editing">{t().projectDetail.editing}</span>
                    {/if}
                    {#if editing && editorDirty}
                      <!-- 未保存入力のある文書には印を付ける (doc-10 §5). Only one 編集セッション
                           exists at a time, so only one card can carry it; it is shown on the
                           list side so that「まだ送っていない」stays readable even when the
                           editor has scrolled out of view. -->
                      <span class="unsaved">{t().projectDetail.unsaved}</span>
                    {/if}
                    {#if reasons.length > 0}
                      <!-- 不整合印 (decision-22, widened to 管理ファイル 1 件 by decision-24):
                           one ⚠️, no family name and no 由来名. `role="img"` on the wrapper
                           because `Icon.svelte` is always `aria-hidden` (doc-11 §2.4). The
                           lines themselves are read in the 閲覧ヘッダ, which is what the
                           selection opens — the ⚠️ is allowed only where そこが用意されて
                           いる (doc-11 §2.4, decision-24 as TASK-116 revised it). -->
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
                  <span class="card-title">{document.title}</span>
                  {#if document.tags.length > 0}
                    <span class="meta">tags: {document.tags.join(", ")}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if unmappedDocuments.length > 0}
          <!-- 写せなかったファイルの一覧 (doc-10 §1, decision-24): not cards — these have no
               id, so there is nothing to select or load into the pane. The heading above
               still counts only the cards; this region states its own count. -->
          <div class="unmapped">
            <h3>{t().projectDetail.unmappedFiles(unmappedDocuments.length)}</h3>
            <ul>
              {#each unmappedDocuments as file (file.sourcePath)}
                <li>
                  <code>{displayPath(file.sourcePath, projectRoot)}</code>
                  <span class="reason-line">{unmappedFileReason(file)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- 文書ペイン (doc-10 §5): three states in one column — the update form alone while a
           session is open, 閲覧 while a document is merely selected, and a line saying what
           the column is for while nothing is. Renamed from 編集ペイン by TASK-116: selection
           opens 閲覧, so editing is one state of three. -->
      <div class="pane" bind:this={pane}>
        {#if session !== null}
          <div class="sub-panel">
            <h3>{t().projectDetail.documentUpdateHeading(session.baseline.id)}</h3>

            <label class="field">
              <span class="label">{t().field.titleRequired}</span>
              <input
                type="text"
                value={session.draft.title}
                oninput={(event) => setDoc("title", event.currentTarget.value)}
              />
            </label>

            <div class="field">
              <span class="label">{t().field.body}</span>
              <Editor
                label={t().field.body}
                value={session.draft.content}
                rows={14}
                onchange={(value) => setDoc("content", value)}
                onsave={onupdate}
              />
              <p class="hint">
                {t().projectDetail.bodyReplaceNote}
              </p>
            </div>

            <div class="row">
              <label class="field">
                <span class="label">type</span>
                <select
                  value={session.draft.docType}
                  onchange={(event) => setDoc("docType", event.currentTarget.value)}
                >
                  <option value="">{t().projectDetail.keepUnchanged}</option>
                  {#each DOC_TYPES as value (value)}
                    <option {value}>{value}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span class="label">{t().projectDetail.pathLabel}</span>
                <!-- 表示パス (doc-10 §5), repeated here from the 閲覧ヘッダ: this field is a
                     move request holding no current value, and「空欄なら変更しません」only
                     reads against where the file is now. One derivation for both places
                     (`selectedPath`, from the current read) — the baseline would put a
                     second reading of the same file on screen beside the card's ⚠️. -->
                <!-- `null` is a state the design reaches: the `$effect` above exempts an
                     open session from the drop rule, so a document broken or removed
                     externally leaves the editor standing with nothing to resolve. Printing
                     the null would put「現在の所在:」over an empty path, which asserts a
                     location rather than admitting there is none (PR #72 1R [P2]). -->
                {#if selectedPath === null}
                  <span class="path">
                    {t().projectDetail.pathUnreadable}
                  </span>
                {:else}
                  <span class="path">{t().projectDetail.pathCurrent} <code>{selectedPath}</code></span>
                {/if}
                <input
                  type="text"
                  placeholder={t().projectDetail.pathPlaceholder}
                  value={session.draft.path}
                  oninput={(event) => setDoc("path", event.currentTarget.value)}
                />
              </label>
            </div>

            <div class="field">
              <span class="label">tags</span>
              <ListEditor
                values={session.draft.tags}
                apply={(next) => setDoc("tags", next)}
                draft={newTag}
                setDraft={setNewTag}
                placeholder={t().projectDetail.addTag}
              />
            </div>

          </div>
          <!-- 発行の行 (doc-11 §11): this 編集セッション is the only 発行 this column holds, so
               the row pins to the bottom of the column and is read wherever the form has been
               scrolled to. **Outside the framed 更新フォーム above**, the way the 設定モーダル's
               下部操作行 sits outside its body: a row inside that frame is held off the column's
               edges by the frame's own border and padding, and cannot reach the edge it pins
               to (目視 2026-08-10). The reason the 発行 is withheld goes in with it. -->
          <div class="issue">
            <!-- 無効化の理由 (doc-11 §5 の 2 つ目の形). Always in the DOM, because
                 `aria-describedby` points at it: hidden when the 区画 already states it
                 (doc-11 §8), visible otherwise. -->
            <span
              id={UPDATE_BLOCKED_ID}
              class={updateIssue.state === "blocked" &&
              omitsSentence(updateIssue.reason)
                ? "unseen"
                : "reason"}
            >
              {updateIssue.state === "blocked" ? updateIssue.reason : ""}
            </span>
            <!-- 併記 は控えの `title` と `aria-keyshortcuts`、そしてキーボード操作一覧が担う
                 (doc-7 §2.1)。可視の 1 行はここに置かない。 -->
            <div class="actions">
              <!-- 取りやめ → 発行 (doc-11 §11): one order everywhere, since the row is centred. -->
              <button type="button" onclick={oncloseEditor}>{t().action.cancel}</button>
              <button
                type="button"
                aria-disabled={updateIssue.state !== "ready"}
                aria-describedby={updateIssue.state === "blocked" ? UPDATE_BLOCKED_ID : undefined}
                aria-keyshortcuts={ariaKeyShortcuts("saveEditSession", MAC_KEYBOARD)}
                title={issueControlTitle(
                  updateIssue,
                  t().projectDetail.documentUpdate,
                  shortcutHint("saveEditSession", MAC_KEYBOARD),
                )}
                onclick={() => updateIssue.state === "ready" && onupdate()}
              >
                {t().projectDetail.documentUpdate}
              </button>
            </div>
          </div>
        {:else if selectedDocument !== null}
          {@const document = selectedDocument}
          <!-- 閲覧 (doc-10 §5, TASK-116): what the selection opens. No input of any kind, so
               nothing here can hold 未保存入力 and no 破棄前確認 can arise from reading. -->
          <div class="sub-panel">
            <!-- 閲覧ヘッダ: title and 編集 on one line, then ID・type・tags・表示パス, then
                 the 理由行 (選択を解除 left this row with TASK-121). The heading is the
                 document's own title rather
                 than a sentence about it — the pane is showing that document, and a title is
                 what names it. -->
            <div class="view-head">
              <h3>{document.title}</h3>
              <!-- Held while a 発行 is in flight, and the reason is reachable without a
                   pointer: `aria-disabled` keeps the button focusable and points at the
                   sentence below, which is route (b) of doc-11 §5. `disabled` would need an
                   always-visible 補助文 instead, and a `title` alone is neither. -->
              <button
                type="button"
                aria-disabled={issuing}
                aria-describedby={issuing ? EDIT_HELD_ID : undefined}
                title={issuanceTitle(t().projectDetail.documentEditOpenHint)}
                onclick={() => !issuing && onstartEdit()}
              >
                {t().action.edit}
              </button>
              <!-- No 選択を解除 here since TASK-121 (doc-10 §5). The reason it was placed —
                   the create form's 未保存入力 sitting off screen while still counting
                   toward the screen's 破棄前確認 — died with TASK-117's 作成モーダル, and
                   the reason written in its place (always being able to return to「何も
                   選んでいない」) was judged insufficient at 目視. Nothing is lost by not
                   returning: 閲覧 shows every value the card carries and holds no input. -->
            </div>
            {#if issuance.state === "withheld"}
              <p class="reason" id={EDIT_HELD_ID}>
                {t().projectDetail.documentIssuingBlocksEdit(issuance.reason)}
              </p>
            {/if}
            <p class="meta-line">
              <span class="id">{document.id}</span>
              <span>{document.type ?? t().projectDetail.typeUnset}</span>
              <span>
                {document.tags.length > 0
                  ? `tags: ${document.tags.join(", ")}`
                  : t().projectDetail.tagsNone}
              </span>
            </p>
            <!-- 表示パス (doc-10 §5): which file this is, project-relative. -->
            <p class="path"><code>{selectedPath}</code></p>
            {#if openReasons.length > 0}
              <!-- 理由行 (decision-22, doc-10 §5 as TASK-116 revised it): the place doc-11
                   §2.4 requires the ⚠️'s full reason to be readable without hovering. It
                   sits here, not in the update form, because 選択 is what opens this and the
                   guarantee is about the place the selection reaches. No 区画 of its own —
                   one line per reason is the whole of it. -->
              <!-- Keyed by index, not by the string: two reasons can read identically
                   (two same-named unclosed SECTION pairs, two stray `:END`s), and a
                   duplicate key throws in production Svelte (PR #71 [P2]). -->
              <ul class="reason-lines">
                {#each openReasons as reason, at (at)}
                  <li>{reason}</li>
                {/each}
              </ul>
            {/if}
            <!-- 本文: the string as read. Nothing formats Markdown in this build, so a
                 rendered look would be a claim the screen cannot keep — the same treatment
                 タスク詳細 gives Description. -->
            {#if (document.body ?? "") === ""}
              <p class="neutral">{t().projectDetail.bodyEmpty}</p>
            {:else}
              <div class="read-body-slot"><Body source={document.body ?? ""} {onopenlink} {readimage} /></div>
            {/if}
          </div>
        {:else}
          <!-- 非選択時の文書ペイン (doc-10 §5). The 作成フォーム left this column for the
               作成モーダル (TASK-117) and the 提供しない操作区画 was dropped altogether
               (TASK-123), so what remains is the line saying what the column is for. It is
               what keeps the column from reading as an empty box the user has broken.
               doc-11 §6's `—` is not this: that mark stands for a value that is absent, and
               what is absent here is a selection. -->
          <p class="neutral">{t().projectDetail.documentNotSelected}</p>
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

    // 編集セッション中は下端に発行の行が居るので、この列自身の下 padding は要らない — 残すと行が
    // 縁から浮き、スクロールの末尾でそのぶん持ち上がる (目視 2026-08-10)。
    &:has(.issue) {
      padding-bottom: 0;
    }

    // 発行の行 は框の外 — 列の子として直接置いているので、引き出しは要らない。左右は列の padding を
    // 打ち消して縁まで届かせ、内側の余白は行が自分で持つ。
    > .issue {
      margin-right: -0.75rem;
      margin-left: -0.6rem;
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

  .path {
    @include shared.path;
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

    .actions {
      @include shared.issue-actions;
    }

    .reason {
      @include shared.issue-reason;
    }
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
