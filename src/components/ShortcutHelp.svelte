<script lang="ts">
  // 割り当て一覧 (doc-7 §2.1) as the screen shows it — the contents of the 一覧モーダル that TASK-67 moved
  // this table into. On screen it is called キーボード操作の一覧 and the doc's term is 割り当て一覧: one
  // thing with two words for it, so the two are tied together here. `shortcuts.ts` is its 正本.
  //
  // **Why it left the menu.** It used to sit inside the header menu as a closed `details`, which made the
  // menu two things at once: the entries a user picks from, and a reference table folded up underneath
  // them. The table is the longer of the two by far, so opening it pushed the menu past its own
  // `max-height` and left the entries scrolled away above. A modal is the layer this app already has for
  // something read rather than picked (doc-7 §2.1), and it can hold the whole list at once.
  //
  // Printed from `SHORTCUTS`, never from a copy: doc-7 §2.1 asks for the list in 1 箇所, and a table
  // typed out here would be a second place — one that keeps saying `⌘N` after the assignment moves.
  import { SCOPE_LABEL, SHORTCUTS, chordLabel } from "../lib/shortcuts";
  import { MAC_KEYBOARD } from "../lib/platform";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();
</script>

<section>
  <!-- 閉じる sits beside the heading, as `Settings.svelte` and `ProjectRegister.svelte` both do, and for
       a reason this modal has more of than either: `Modal.svelte` focuses the first focusable control on
       mount, and `focus()` scrolls it into the backdrop's scroll area. With the only control below a
       nine-row table, a window shorter than the dialog would open the list already scrolled past its own
       heading and first rows. -->
  <header>
    <h2>キーボード操作の一覧</h2>
    <button type="button" class="close" onclick={onclose}>閉じる</button>
  </header>
  <p class="lead">
    修飾キーはこの OS の表記で出しています。入力欄・編集部品の内側では、単独キーの割り当ては発火しません。
  </p>

  <!-- doc-7 §2.1 の 4 列: キー・操作・発火する画面・入力欄内で発火するか。打ち消す既定動作も同じ行に
       出す — §2.1 requires preventDefault を割り当て一覧に明記する, and this is that list. -->
  <table>
    <thead>
      <tr>
        <th scope="col">キー</th>
        <th scope="col">操作</th>
        <th scope="col">発火する画面</th>
        <th scope="col" class="fires">入力欄内</th>
        <th scope="col">打ち消す既定動作</th>
      </tr>
    </thead>
    <tbody>
      {#each SHORTCUTS as binding (binding.action)}
        <tr>
          <td class="chord">{chordLabel(binding.chord, MAC_KEYBOARD)}</td>
          <td>{binding.operation}</td>
          <td>{SCOPE_LABEL[binding.scope]}</td>
          <td class="fires">{binding.firesInTextEntry ? "発火する" : "発火しない"}</td>
          <td>{binding.preventsDefault ?? "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style lang="scss">
  section {
    padding: 0.75rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  h2 {
    // 画面見出し (doc-11 §2.2).
    margin: 0;
    font-size: 0.92rem;
    font-weight: 650;
  }

  .close {
    margin-left: auto;
  }

  // 副次 (doc-11 §2.1): it describes the table rather than being read on its own.
  .lead {
    margin: 0 0 0.6rem;
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.4;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.7rem;
  }

  th,
  td {
    padding: 0.25rem 0.3rem;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  th {
    // 区画見出し (doc-11 §2.2).
    color: var(--muted);
    font-weight: 650;
    letter-spacing: 0.05em;
  }

  .chord {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  // 発火する / 発火しない is a two-value answer, so it is never worth two lines. Measured in WebKit and
  // Chromium: without this the column wraps on *every* row and doubles the height of the whole table,
  // which is what pushes the long sentences in the two columns beside it out of one screen.
  .fires {
    white-space: nowrap;
  }

  button {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--line-strong);
    // カード・ボタン 4px (doc-11 §2.2).
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
</style>
