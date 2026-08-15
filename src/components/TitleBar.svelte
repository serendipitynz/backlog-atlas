<script lang="ts">
  // タイトルバーの帯 (decision-31), drawn only where 重ね型 is in force — macOS, where
  // `titleBarStyle: "Overlay"` makes the OS bar transparent and gives the page the window's whole
  // height, so this row stands exactly where the OS one stood and costs no content. Windows・Linux
  // mount nothing here; which of the two a build is in is `OVERLAY_TITLE_BAR` (`platform.ts`).
  //
  // **Linux drew this bar for a while and no longer does** (decision-31 の Linux の改訂). Its title
  // write is accepted and then not drawn, so the bar was put *under* the OS decorations instead — and
  // there the decoration already prints the app name one line above, so the bar repeated it and charged
  // 32px of content for the repetition. The owner saw it on the real machine and turned it down.
  //
  // 窓装飾は OS のまま (decision-31): the traffic lights are AppKit's, so this bar has no control of its
  // own to minimise, zoom or close with, and it must not grow one — 自前装飾 is what that decision
  // declined, and it declined it partly because a bar carrying window operations collides with doc-7
  // §2.1 の 粒度の違う操作を同じ場所に混ぜない.
  interface Props {
    /** The whole line, already assembled by `title.ts` — this component decides nothing about it. */
    title: string;
  }

  let { title }: Props = $props();
</script>

<!-- `data-tauri-drag-region` is the whole of what makes the window movable here: tauri's own script
     answers a press on the region with `start_dragging` and a double press with
     `internal_toggle_maximize`, on all three platforms. It sits on the bar rather than on the text so
     that the empty width — most of the bar — drags too. -->
<div class="title-bar" data-tauri-drag-region>
  <!-- 帯の語 (decision-31): the app's name, and on the swimlane 総件数 after it. Not a heading — there
       is no 画面名 any more, and a level-1 heading whose text is the product would put the window's
       identity into the document outline where the screen's used to be.

       **Not `aria-hidden`, though it looks like window chrome.** On this platform the window's own title
       is left as `tauri.conf.json` set it — the app's name, nothing more — so this line is the only
       place 総件数 exists at all, and hiding it would put both ratios out of a screen reader's reach
       rather than merely repeating what the OS says. -->
  <span class="line" data-tauri-drag-region>{title}</span>
</div>

<style lang="scss">
  // 取り戻す高さ 32.0 pt (decision-31 の実測): the height AppKit's own title bar takes on the machine
  // that measurement was made on, so the bar Atlas draws stands exactly where the OS one stood and the
  // 46.83px の固定ヘッダ is what the content gets back. A literal rather than a token because it is an
  // OS dimension rather than one of doc-11 §2.2's steps — nothing else in the app may take this value.
  //
  // The 信号機帯 ends at 69 pt (decision-31 の実測) and the bar's own text starts at 78, which is that
  // edge plus a gap of the same order as the 余白 either side of it.
  //
  // **全画面でも inset は落とさない** (TASK-176 が決めた側). macOS hides the traffic lights while the
  // window is full screen, but it slides the whole title bar — buttons included — back down whenever
  // the pointer reaches the top edge, so the 78px is still holding a place that is used. The other
  // permitted outcome (dropping it) would move the app's name and 総件数 sideways on every entry into
  // and exit from full screen, and it would have to learn the window's state to do it: a page cannot
  // read macOS full screen from CSS, and `core:window:allow-is-fullscreen` is not one of the two
  // permissions decision-31 allows this change to add. There is deliberately no full-screen branch
  // below — that absence is what says the choice was made, and it is checkable by reading this rule.
  .title-bar {
    // The 32 is the whole strip, 罫線 included — this bar stands where the OS one stood, so a border
    // added outside the number would push the screen down by exactly what the 固定ヘッダ gave back.
    // There is no global reset (TASK-115), which is why this is stated here.
    box-sizing: border-box;

    display: flex;
    height: 32px;
    align-items: center;
    padding: 0 0.75rem 0 78px;
    // The bar is part of the window frame rather than part of the screen under it, so it takes the
    // same 罫線 the フィルタ帯 and the プロジェクト詳細 ヘッダ take (doc-11 §2.1) and no background of
    // its own — a filled strip would read as a 帯 in doc-11 §4's sense, which is a thing with something
    // to report.
    border-bottom: 1px solid var(--line);
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
