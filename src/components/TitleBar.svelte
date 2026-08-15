<script lang="ts">
  // タイトルバーの帯 (decision-31), drawn where `DRAWN_TITLE_BAR` says so — macOS and Linux. Two
  // placements, one bar:
  //
  // - **macOS: 重ね型.** `titleBarStyle: "Overlay"` makes the OS bar transparent and gives the page the
  //   window's whole height, so this row stands exactly where the OS one stood and costs no content.
  // - **Linux: 内容上の帯** (decision-31 の Linux の改訂). The OS bar is opaque and its height cannot be
  //   taken, so this row comes out of the content — 32px of it. That is the price of the platform, paid
  //   because the window's own title is *accepted and then not drawn* there: `set_title` is not refused
  //   and `title()` reads the new value back, while the decoration keeps the old one (measured on the
  //   owner's GNOME/Wayland machine, 2026-08-15).
  //
  // Windows mounts nothing here: its title bar shows what the window's title is set to, measured.
  //
  // 窓装飾は OS のまま (decision-31): the traffic lights are AppKit's, so this bar has no control of its
  // own to minimise, zoom or close with, and it must not grow one — 自前装飾 is what that decision
  // declined, and it declined it partly because a bar carrying window operations collides with doc-7
  // §2.1 の 粒度の違う操作を同じ場所に混ぜない.
  interface Props {
    /** The whole line, already assembled by `title.ts` — this component decides nothing about it. */
    title: string;
    /**
     * 重ね型 (decision-31): whether this bar stands *over* the OS's title bar rather than under it. The
     * one thing it changes here is the 信号機帯's room on the left — there are no traffic lights to
     * avoid where the bar sits inside the content area.
     */
    overlay: boolean;
  }

  let { title, overlay }: Props = $props();
</script>

<!-- `data-tauri-drag-region` is the whole of what makes the window movable here: tauri's own script
     answers a press on the region with `start_dragging` and a double press with
     `internal_toggle_maximize`, on all three platforms. It sits on the bar rather than on the text so
     that the empty width — most of the bar — drags too. -->
<div class="title-bar" class:overlay data-tauri-drag-region>
  <!-- 帯の語 (decision-31): the app's name, and on the swimlane 総件数 after it. Not a heading — there
       is no 画面名 any more, and a level-1 heading whose text is the product would put the window's
       identity into the document outline where the screen's used to be.

       **Not `aria-hidden`, though it looks like window chrome.** On macOS the window's own title is left
       as `tauri.conf.json` set it — the app's name, nothing more — and on Linux the title is written but
       not drawn, so on both this line is the only place 総件数 is legible at all. Hiding it would put
       both ratios out of a screen reader's reach rather than merely repeating what the OS says. -->
  <span class="line" data-tauri-drag-region>{title}</span>
</div>

<style lang="scss">
  // 取り戻す高さ 32.0 pt (decision-31 の実測): the height AppKit's own title bar takes on the machine
  // that measurement was made on, so under 重ね型 the bar Atlas draws stands exactly where the OS one
  // stood and the 46.83px の固定ヘッダ is what the content gets back. A literal rather than a token
  // because it is an OS dimension rather than one of doc-11 §2.2's steps — nothing else may take it.
  //
  // **The same 32px is what the 内容上の帯 costs on Linux** (decision-31 の Linux の改訂): there the
  // OS bar is opaque and its height cannot be taken, so this row comes out of the content. One height
  // rather than two, because it is one bar — a Linux-only value would be a second number saying what
  // the same row is.
  .title-bar {
    // The 32 is the whole strip, 罫線 included — this bar stands where the OS one stood, so a border
    // added outside the number would push the screen down by exactly what the 固定ヘッダ gave back.
    // There is no global reset (TASK-115), which is why this is stated here.
    box-sizing: border-box;

    display: flex;
    height: 32px;
    align-items: center;
    padding: 0 0.75rem;
    // The bar is part of the window frame rather than part of the screen under it, so it takes the
    // same 罫線 the フィルタ帯 and the プロジェクト詳細 ヘッダ take (doc-11 §2.1) and no background of
    // its own — a filled strip would read as a 帯 in doc-11 §4's sense, which is a thing with something
    // to report.
    border-bottom: 1px solid var(--line);
  }

  // 信号機帯 (decision-31 の実測): its right edge is at 69 pt, and the bar's text starts at 78 — that
  // edge plus a gap of the same order as the 余白 either side of it. **Only under 重ね型**: elsewhere the
  // bar sits below the OS's own decorations and there are no buttons to avoid.
  //
  // **全画面でも落とさない** (TASK-176 が決めた側). macOS hides the traffic lights while the window is
  // full screen, but it slides the whole title bar — buttons included — back down whenever the pointer
  // reaches the top edge, so the 78px is still holding a place that is used. The other permitted outcome
  // (dropping it) would move the app's name and 総件数 sideways on every entry into and exit from full
  // screen, and it would have to learn the window's state to do it: a page cannot read macOS full screen
  // from CSS, and `core:window:allow-is-fullscreen` is not one of the two permissions decision-31 allows
  // this change to add. There is deliberately no full-screen branch here — that absence is what says the
  // choice was made, and it is checkable by reading this rule.
  .title-bar.overlay {
    padding-left: 78px;
  }

  // 副次 (doc-11 §2.1): the window's name and what it is showing, not something to read before the
  // screen. `tabular-nums` for the same reason the 総件数 had it beside the 画面名 — a changing count
  // must not shift the words after it.
  .line {
    overflow: hidden;
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
