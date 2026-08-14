<script lang="ts">
  // 列内新規タスク入力 (doc-7 §4.1): the entry at a レーンセル's end that creates a task in that
  // cell's column. It takes title only; the status is the column's 作成時 status 候補 and is always
  // readable here, whether there is one candidate or several.
  //
  // The rules are in `lib/lane-create.ts`; this is markup over them. Two presentations are kept
  // apart on purpose (doc-11 §5): a column with no candidate gets *no control* and a sentence,
  // while a CLI 縮退 gets the control, disabled, with its reason — the first is 提供しない, the
  // second「今は条件が揃っていない」.
  import type { LaneCreate } from "../lib/lane-create";
  import { omitsSentence } from "../lib/manage";
  import { ariaKeyShortcuts, matchShortcut, shortcutHint } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";
  import Icon from "../lib/icons/Icon.svelte";

  interface Props {
    /** Whether this column offers the entry, and its 作成時 status 候補 (doc-7 §4.1). */
    entry: LaneCreate;
    /** The column's name, for labelling the entry — the cell itself carries no visible heading. */
    label: string;
    /**
     * Whether the input is expanded on this cell. One cell across the grid holds it: two open inputs
     * would both claim 発行, and the shell holds only one action in flight (doc-5 §5).
     */
    open: boolean;
    title: string;
    /**
     * The candidate that will be passed as `-s`. Resolved by the shell (`laneCreateStatus`), never
     * chosen here, so what this shows and what is issued are the same string (doc-7 §4.1).
     */
    status: string;
    /** Why 発行 is withheld, or `null` — CLI 縮退, an action in flight, or an empty title (doc-5 §5). */
    blocked: string | null;
    /**
     * Why the entry itself may not be opened, or `null` (`laneCreateHold`). doc-7 §4.1 disables the
     * *entry* under CLI 縮退, so this is what the closed control states — leaving it pressable and
     * blocking only the 作成 would invite a title that can never be issued.
     */
    held: string | null;
    onopen: () => void;
    onclose: () => void;
    ontitle: (value: string) => void;
    onstatus: (value: string) => void;
    onsubmit: () => void;
  }

  let {
    entry,
    label,
    open,
    title,
    status,
    blocked,
    held,
    onopen,
    onclose,
    ontitle,
    onstatus,
    onsubmit,
  }: Props = $props();

  /** The input, so opening the entry puts the caret in it rather than leaving it to be found. */
  let titleInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) titleInput?.focus();
  });

  /**
   * 発行 by key (doc-7 §2.1), through the 割り当て一覧 — which TASK-56 built, and which is what this
   * component was waiting for: a bare Enter here would still be forbidden (§2.1 keeps 単独キー out of an
   * `input`), so the assignment is the modifier chord ⌘/Ctrl+Enter, the same shape 編集部品 uses for
   * 明示保存. やめる keeps no chord of its own beyond the 被せ層's Escape, which this entry is not one of.
   *
   * The IME guard is `matchShortcut`'s, applied to every assignment rather than re-argued here (a WebKit
   * composing keydown can arrive with `isComposing === false` and `keyCode === 229`).
   *
   * The buttons below stay the entry to both operations (§2.1 ショートカットだけが入口の操作を作らない).
   */
  function keydown(event: KeyboardEvent): void {
    const binding = matchShortcut(event, {
      scopes: ["laneCreate"],
      textEntry: true,
      mac: MAC_KEYBOARD,
    });
    if (binding?.action !== "submitLaneCreate") return;
    if (binding.preventsDefault !== null) event.preventDefault();
    // Withheld for the same reason the button is (doc-11 §5): the chord is not a way past a 縮退 or a
    // 発行中. The reason is already on screen below the button, so pressing it says nothing new.
    if (blocked === null) onsubmit();
  }
</script>

{#if entry.state === "absent"}
  <!-- 入口を置かない (doc-7 §4.1): no disabled button, just the reason it is not here. Written where
       the entry would have been, which is what tells it apart from an operation that is present but
       blocked (doc-11 §5). -->
  <p class="absent">{entry.reason}</p>
{:else if !open}
  <!-- 縮退時は入口を無効化する (doc-7 §4.1). `aria-disabled` rather than `disabled` so the control keeps
       taking focus, and the reason travels in the accessible name — a `title` alone would be reachable
       from the pointer only, which doc-11 §5 rules out. It is not repeated as a visible sentence in
       every offering cell of every row: this reason is 画面全体に効く (CLI 縮退・発行中), and doc-11 §5
       puts those on the 上部帯 (② for the 縮退, doc-7 §5.3), where it is on screen without hovering. -->
  <button
    type="button"
    class="open"
    aria-disabled={held !== null}
    aria-label={held === null
      ? `${label} 列に新規タスクを作る`
      : `${label} 列の新規タスク入力は使えません: ${held}`}
    title={held ?? `${label} 列に新規タスクを作ります`}
    onclick={() => held === null && onopen()}
  >
    <!-- 可視の文言を持つ控えの中のアイコン (doc-11 §2.4). The same `plus` the 文書・マイルストーン の
         作成の入口 draws (doc-10 §1) — the mark for「ここから 1 件作る」is one figure, not one per
         screen.
         **The `aria-label` above stays**, under both of the exemptions §2.4 states for that type's
         first condition: 「新規」 does not say which of the row's cells this one is, and under CLI 縮退
         the name is the only place this control says why it cannot be pressed — the reason is
         画面全体に効く, so it lives on the 上部帯 (the paragraph above) and there is no element beside
         this button for `aria-describedby` to point at. Until the `＋` became a figure the type did
         not apply here at all. -->
    <Icon name="plus" />新規
  </button>
{:else}
  <div class="entry">
    <input
      bind:this={titleInput}
      type="text"
      value={title}
      placeholder="title（必須）"
      aria-label="{label} 列の新規タスクの title"
      aria-keyshortcuts={ariaKeyShortcuts("submitLaneCreate", MAC_KEYBOARD)}
      oninput={(event) => ontitle(event.currentTarget.value)}
      onkeydown={keydown}
    />

    <!-- 渡す値は候補の数によらず常に読める (doc-7 §4.1). One candidate is shown as text rather than as
         a select of one: there is nothing to choose, and a control that cannot change anything would
         read as though the value were the user's to pick. -->
    {#if entry.candidates.length === 1}
      <p class="passes">
        status: <code>{status}</code>
      </p>
    {:else}
      <label class="passes">
        <span>status</span>
        <select value={status} onchange={(event) => onstatus(event.currentTarget.value)}>
          <!-- Unkeyed: the options are static text, and `config.yml` is a hand-written file that can
               declare the same status twice — a keyed each would throw on the duplicate rather than
               render the list the project actually declares. -->
          {#each entry.candidates as candidate}
            <option value={candidate}>{candidate}</option>
          {/each}
        </select>
      </label>
    {/if}

    <!-- 発行の行 (doc-11 §11), left where it is: this 層 does not scroll, so nothing can carry the
         controls off screen and there is no pinning to do. 取りやめ → 発行 all the same. -->
    <div class="actions">
      <button type="button" onclick={onclose}>キャンセル</button>
      <!-- 無効化提示 (doc-11 §5): the control stays and keeps a reason. The sentence below is drawn
           only when the 区画 does not already state it — a title marked「（必須）」sitting empty is
           itself the 常時表示 reason §5 asks for (doc-11 §8). -->
      <button
        type="button"
        disabled={blocked !== null}
        aria-keyshortcuts={ariaKeyShortcuts("submitLaneCreate", MAC_KEYBOARD)}
        title={blocked ?? "このセルにタスクを作成します"}
        onclick={onsubmit}
      >
        作成
        <!-- 操作の近くに併記する (doc-7 §2.1 / AC #4); the chord is on `aria-keyshortcuts` as data. -->
        <span class="hint" aria-hidden="true">{shortcutHint("submitLaneCreate", MAC_KEYBOARD)}</span>
      </button>
    </div>
    {#if blocked !== null && !omitsSentence(blocked)}
      <p class="reason">{blocked}</p>
    {/if}
  </div>
{/if}

<style lang="scss">
  // 置かない理由 (doc-7 §4.1). `--muted` (doc-11 §2.1) — a 副次 sentence, not 弱 and not an empty
  // display, which is the colour the withheld reasons elsewhere on the grid already use.
  .absent {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
    line-height: 1.25;
  }

  // The closed entry sits at the cell's end as a quiet line: it is present in every offering cell of
  // every row, so it must not compete with the cards above it for attention. The frame is *solid*
  // even though the control is understated: doc-11 §5 makes 破線枠 the mark of 無効化, and a control
  // drawn dashed while pressable would be indistinguishable from the same button under CLI 縮退
  // (app.scss owns that style for the whole app).
  .open {
    display: inline-flex;
    gap: 0.2rem;
    align-items: center;
    align-self: flex-start;
    margin-top: 0.2rem;
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;

    &:hover:not([aria-disabled="true"]),
    &:focus-visible:not([aria-disabled="true"]) {
      color: var(--fg);
    }
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.2rem;
    padding: 0.35rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--inset);

    // フォーム部品の高さ (doc-11 §2.2): 1.4rem, not the form step — this is the 簡易版 of the create
    // form (doc-12 §8.6), drawn inside a レーンセル between cards, and the largest step would make the
    // two controls the tallest thing in the column. The two sit on separate lines here, so the rule
    // reaches them through the 入力欄の集まり they belong to rather than through a shared row.
    input,
    select {
      height: 1.4rem;
      min-width: 0;
      padding: 0.1rem 0.25rem;
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      background: var(--bg);
      color: inherit;
      font: inherit;
      font-size: var(--text-md);
    }
  }

  .passes {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);

    code {
      color: var(--fg);
      font-size: var(--text-sm);
    }
  }

  // The chord beside its operation (doc-7 §2.1 / AC #4). Quiet, and outside the accessible name: the
  // button's own label is the entry, and `aria-keyshortcuts` carries the chord for assistive tech.
  .hint {
    color: var(--muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: 0.25rem;

    button {
      display: inline-flex;
      gap: 0.25rem;
      align-items: baseline;
      padding: 0 0.35rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
      // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5); a `:disabled` rule here would outrank it.
    }
  }

  .reason {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    line-height: 1.25;
  }
</style>
