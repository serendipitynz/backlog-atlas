<script lang="ts">
  // 編集（明示保存） (doc-8 §3): 常設 in all three. Nothing here writes as you type, and Enter is
  // not one of the save keys (doc-8 §6.2). The buttons are in the 見出し (`Heading.svelte`); what is
  // left here is every sentence that explains, warns or foretells.
  import { discardConfirmProceed, type EditAvailability, type SaveState } from "../../lib/edit";
  import { conflictSetDetail, versionConflictReason, type VersionConflict } from "../../lib/mark";
  import { messages } from "../../lib/messages-context";

  interface Props {
    /** Whether an 編集セッション is open. */
    editing: boolean;
    availability: EditAvailability;
    /** 未保存入力 を持つ (doc-8 §6.3 の予告の条件)。 */
    dirty: boolean;
    /** 編集中の継続検出 (doc-8 §6.4): stated, never acted on. */
    externalChange: boolean;
    saveState: SaveState;
    /** 以前の訪問で記録された バージョン不整合 (doc-9)、または `null`。 */
    conflict: VersionConflict | null;
    /** 直近の rebase が index に依る AC 操作を落としたか (doc-8 §6.4)。 */
    acDeltaDropped: boolean;
    /** doc-9 §5 (i): drop the 未保存入力 and start again from the re-read the conflict brought. */
    onrestart: () => void;
    /** doc-9 §5 (ii): keep the input and move the session's baseline onto the latest read. */
    onreapply: () => void;
    /** 記録された バージョン不整合 を保存せずに退ける。 */
    onacknowledge: () => void;
  }

  let {
    editing,
    availability,
    dirty,
    externalChange,
    saveState,
    conflict,
    acDeltaDropped,
    onrestart,
    onreapply,
    onacknowledge,
  }: Props = $props();

  const t = messages();
</script>

<section class="console">
  {#if !editing}
    {#if availability.state !== "editable"}
      <!-- 無効化提示 (doc-11 §5): the disabled 編集 button in the heading carries this in its
           `title`, and doc-11 §5 refuses to leave a reason on hover alone. -->
      <p class="hint">{availability.reason}</p>
    {/if}
  {:else}
    <!-- The chord's 併記 and the reason 保存 is withheld moved to the 発行の行 (doc-11 §11,
         `EditIssueRow.svelte`): both have to be read at the moment the control is pressed, and that
         control is no longer here. Enter's own meaning stays stated at the field itself
         (`Editor.svelte`), where the key is pressed. -->
    {#if dirty}
      <!-- 破棄前確認 (doc-8 §6.3) を、押す前に読める形で置く: 入力を失う操作の前には同じ確認が
           上部帯に出る、という予告である。§6.3 の 5 経路をここへ数え上げないのは doc-11 §8 の
           設計文の写しに当たるためで、予告として要るのは「確認を通る」ことだけである。 -->
      <p class="hint">{t().taskDetail.unsavedWarn(discardConfirmProceed())}</p>
    {/if}
    {#if externalChange}
      <!-- 編集中の継続検出 (doc-8 §6.4). 不整合 の色を取り、generic notice ではない: the version has
           *been observed* to move against this session's baseline. It is not recorded on the card,
           though — no save has been attempted, and doc-8 §6.4 keeps this stated rather than acted
           on, so it belongs to the live session and ends with it. -->
      <p class="conflict">{t().taskDetail.externallyChanged}</p>
    {/if}
  {/if}

  {#if saveState.state === "applied"}
    <p class="ok">{t().taskDetail.saved}</p>
  {:else if saveState.state === "failed"}
    <!-- CLI 失敗 (doc-5 §5): the display above is unchanged and the input is still here. -->
    <p class="warn">{t().action.saveFailed(saveState.detail)}</p>
  {:else if saveState.state === "uncheckable"}
    <!-- 照合不能 (doc-9 §4.2/§5): its own family (`undetectable`), because 版がずれているとは
         限らず、確かめる方法が無い — doc-9 §5 requires this not to read as a conflict, and forbids
         offering an unchecked run as the way around it. -->
    <p class="undetectable">{saveState.detail}</p>
  {:else if saveState.state === "conflict"}
    <!-- 防げる競合の未然提示 (doc-9 §5): the check stopped this before the CLI ran. -->
    <div class="conflict">
      <p>{t().taskDetail.conflictStopped(conflictSetDetail(saveState))}</p>
      <div class="buttons">
        <button type="button" onclick={onrestart}>
          {t().taskDetail.conflictDiscard}
        </button>
        <button type="button" onclick={onreapply}>
          {t().taskDetail.conflictReapply}
        </button>
      </div>
      <p class="hint">{t().taskDetail.conflictReapplyNote}</p>
    </div>
  {:else if saveState.state === "diverged"}
    <!-- 防げない喪失の事後通知 (doc-9 §4.1/§5). Deliberately worded apart from the conflict
         above: this one was *not* prevented, and what an overwrite removed cannot be shown. -->
    <div class="conflict">
      <p>{t().taskDetail.postCheckMismatch(saveState.fields)}</p>
      <p class="hint">{t().taskDetail.postCheckNote}</p>
    </div>
  {:else if conflict !== null}
    <!-- A バージョン不整合 recorded on an earlier visit to this task: the banners above belong to
         the save that just happened, and this one is what the swimlane card is still marking. Kept
         dismissible so the mark can be retired without a save — the input it belonged to is gone,
         so neither doc-9 §5 path applies any more. -->
    <div class="conflict">
      <p>{versionConflictReason(conflict)}</p>
      <p class="hint">{t().taskDetail.postCheckFresh}</p>
      <div class="buttons">
        <button type="button" onclick={onacknowledge}>
          {t().taskDetail.acknowledge}
        </button>
      </div>
    </div>
  {/if}

  {#if acDeltaDropped}
    <!-- Stated rather than done quietly: the rebase kept every other field's input, and a
         silently dropped AC operation would look like the save simply ignored it. -->
    <p class="warn">{t().taskDetail.criteriaReordered}</p>
  {/if}
</section>

<style lang="scss">
  @use "./shared" as shared;

  section {
    @include shared.section;
  }

  .console {
    gap: 0.3rem;
    padding: 0.4rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;

    // 述べることが無いときは枠ごと消す。TASK-72 が押しボタンを見出しへ移してから、この区画は文だけを
    // 持つようになり、何も述べない状態 (編集できるタスクを編集していないとき) が通常になった — 空の枠は
    // 読むものが 1 つあるように見えて何も無い。doc-11 §6 の 正常な不在 に当たらないので目印も置かない:
    // そこが要求しているのは「空セル」のように不在そのものが情報である場合で、ここは言うことが無いだけ。
    // 上の `{#if}` 群の条件を書き写さず要素の有無で見るのは、二重に持つと片方だけが動くためである。
    &:not(:has(*)) {
      display: none;
    }
  }

  // 控えの群 (doc-11 §2.2): the two ways out of a 更新前競合 (doc-9 §5), side by side with no field
  // between them. The panel's step, like the groups in its heading — neither answer is a 発行 (§11):
  // one re-reads, the other re-applies what is already typed, and the 保存 that follows is elsewhere.
  .buttons {
    @include shared.control-group;

    button {
      @include shared.control-group-button;
    }
  }

  button {
    @include shared.button;
  }

  p {
    @include shared.paragraph;
  }

  .hint {
    @include shared.hint;
  }

  .ok {
    @include shared.ok;
  }

  .warn {
    @include shared.warn;
  }

  // 更新前競合の告知 は 不整合 の色を取る (decision-22): バージョン不整合 が持っていた紫の族は廃されたので、
  // 同じ 1 つの事象（バージョン不整合）を告知と理由行で 2 色に描くことがなくなった。generic notice
  // blue (`--info`) へは戻さない — 通知は族ではなく、青い確認は不整合ではない (doc-11 §2.1)。
  .conflict {
    @include shared.band;

    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    border-left-color: var(--mark-inconsistent);
    background: color-mix(in srgb, var(--mark-inconsistent) 14%, transparent);
  }

  // 照合不能 は不整合ではない: 版がずれているとは限らず、確かめる方法が無い (doc-9 §4.2/§5).
  .undetectable {
    @include shared.band;

    border-left-color: var(--mark-undetectable);
    background: color-mix(in srgb, var(--mark-undetectable) 14%, transparent);
  }
</style>
