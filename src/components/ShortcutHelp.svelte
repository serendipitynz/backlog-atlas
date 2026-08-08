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
</script>

<section>
  <!-- The way out is the × `Modal.svelte` draws in the corner (doc-11 §7, TASK-76); this file used to
       put a 閉じる text button beside the heading. That control mattered to this modal for a reason
       neither of the others had: `Modal.svelte` focuses the first focusable control on mount, and
       `focus()` scrolls it into the backdrop's scroll area, so with the only control *below* a nine-row
       table a short window opened the list already scrolled past its own heading. The × is first in the
       dialog and at the top of it, which is the same guarantee from the layer's side. -->
  <header>
    <h2>キーボード操作の一覧</h2>
  </header>

  <!-- doc-7 §2.1 の 3 列: キー・操作・使える場所。**この表は割り当て一覧そのものではない** — the 一覧 is
       the five-欄 record in `shortcuts.ts`, and §2.1 asks this modal for three of those 欄 (TASK-125).
       入力欄内で発火するか and 打ち消す既定動作 stay in the record, which is where §2.1's 明記 clause and
       every caller read them; what a user needs before pressing is which key does what, where. -->
  <table>
    <thead>
      <tr>
        <th scope="col">キー</th>
        <th scope="col">操作</th>
        <th scope="col">使える場所</th>
      </tr>
    </thead>
    <tbody>
      {#each SHORTCUTS as binding (binding.action)}
        <tr>
          <td class="chord">{chordLabel(binding.chord, MAC_KEYBOARD)}</td>
          <td>{binding.operation}</td>
          <td>{SCOPE_LABEL[binding.scope]}</td>
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
    margin-bottom: 0.25rem;
  }

  h2 {
    // 画面見出し (doc-11 §2.2).
    margin: 0;
    font-size: 0.92rem;
    font-weight: 650;
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
</style>
