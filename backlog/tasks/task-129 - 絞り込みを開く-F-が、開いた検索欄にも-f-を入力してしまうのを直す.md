---
id: TASK-129
title: 絞り込みを開く F が、開いた検索欄にも f を入力してしまうのを直す
status: In Review
assignee: []
created_date: '2026-08-08 23:08'
updated_date: '2026-08-08 23:39'
labels:
  - ui
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 126500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 の TASK-125 の目視で起票。`F` は割り当て一覧の `addFilter`（絞り込みを追加・値一覧を開く）で、押すと値一覧ポップオーバーが開き、`FilterPopover.svelte` の $effect が検索欄へフォーカスを移す。ところが同じ行の `preventsDefault` が null なので、シェル（`App.svelte` の window handler）は event.preventDefault() を呼ばない。keydown の既定動作がそのまま進み、その時点でフォーカスを得ている検索欄へ f が 1 文字入る。結果、値一覧は開いた瞬間に「f を含む値」だけへ絞られ、日本語の値では 0 件に見える — 利用者には「絞り込める値が無い」と読める。

doc-7 §2.1 は「既定動作の打ち消し（preventDefault）は、それが要るキーだけに限り、割り当て一覧に明記する」と定めており、この行はそれが要るのに持っていない。**契約の変更ではなく、既存契約に対する欠陥**である。呼び出し側は既に preventsDefault !== null で分岐しているので、直すのは記録の 1 欄。

**同型を数え上げること。**単独キーで、押した先が文字を取る欄へフォーカスを移すものが他に無いかを見る（`toggleMenu` の M はメニューを開くが、フォーカス先がボタンなら文字は入らない。結論は実測で出す）。修飾キー付きの 2 件（⌘N・⌘,）は文字を生まないので当たらない。

TASK-125 とは無関係の既存挙動で、同タスクの目視で見つかったもの。同じ `shortcuts.ts` の記録を触るので、対応順では TASK-125 の隣に置く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 F で値一覧を開いたとき、検索欄に文字が入らない
- [x] #2 打ち消す既定動作が割り当て一覧に明記されている（doc-7 §2.1）
- [x] #3 同型（押した先が文字を取る欄へフォーカスを移す単独キーで、打ち消しを持たないもの）が他に無いことを確かめ、結果が記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**decision も doc 改訂も要らなかった。**doc-7 §2.1 は「既定動作の打ち消し（`preventDefault`）は、それが要るキーだけに限り、割り当て一覧に明記する」を既に要求しており、`addFilter` はそれが要るのに持っていなかった。**契約の変更ではなく、既存契約に対する欠陥**である。直したのは記録の 1 欄で、呼び出し側（`App.svelte` の window handler）は `preventsDefault !== null` で既に分岐している。

**欠陥の成立順序**（実測で確かめた）。`f` の keydown → window handler が `addFilter` に一致 → `setFilterPopover(true)` → Svelte の `$effect` が `FilterPopover.svelte` の検索欄へフォーカスを移す → **その後**にブラウザが keydown の既定動作を行い、`f` が今フォーカスを得た検索欄へ入る。単独キーは文字入力中には発火しないので（`firesInTextEntry: false`）、押した時点でフォーカスは欄の外にある — つまり **`firesInTextEntry` が見ているのは「既に caret がある欄」だけで、その操作自身が開く欄は見えない**。この 1 文を `preventsDefault` の TSDoc へ足した（次に行が増えたときの検査になる）。

**選ばなかった直し方 2 つ。**①検索欄へフォーカスを移さない — `FilterPopover.svelte` が「その後の打鍵が利用者に見えない場所へ行く」として退けた形へ戻すことになる。②既定動作の後までフォーカスを遅らせる — エンジンが既定動作をいつ行うかにポップオーバーを結びつける。§2.1 が用意しているのは打ち消しのほうである。

**AC #3 の数え上げ — 指摘された 1 件ではなく型で全数えた**（TASK-125 が渡した教訓）。型は「単独キーで、押した先が文字を取る欄へフォーカスを移し、打ち消しを持たないもの」。押鍵ごとに本物のシェルで `document.activeElement` と画面上の全入力欄の値を測った（借り物 playwright、WebKit、`_sandbox/app-check/?n=6&pri=mixed`、1280×900）。

| 押したキー | 押した後のフォーカス | 文字を取る欄か | 打ち消し |
|---|---|---|---|
| `F` addFilter | `input[type=search]`（値一覧の検索欄） | **はい** | **無かった → 足した** |
| `M` toggleMenu | メニュー先頭の `button`（プロジェクトを登録 ⌘N） | いいえ | 不要 |
| `Backspace` undoFilter | `body`（移さない） | いいえ | 既にある（履歴の「戻る」） |
| `Escape` closeOverlay | 開く前の操作（＋ 絞り込み の `button`） | いいえ | 不要（Escape は文字を生まない） |
| `⌘,` openSettings | モーダルの「閉じる」`button` | いいえ | 不要（修飾キー付きは文字を生まない） |
| `⌘N` openRegister | モーダルの「閉じる」`button` | いいえ | 既にある（WebView の新規ウィンドウ） |

**当たるのは `F` の 1 件だけ。**Description が名指ししていた `M` は、実測でもボタン止まりだった。**修飾キー付きの 2 件は、開くモーダルの中に文字欄があるにもかかわらず欄へ届かない** — `Modal.svelte` が先頭の focusable として「閉じる」を取るためで、文字を生まないことに加えてもう 1 枚の理由があった。

**変更前と変更後の両方を測った**（同じハーネス・同じ押鍵）。

| | 変更前 | 変更後 |
|---|---|---|
| `F` 直後の検索欄の値 | `"f"` | `""` |
| `F` 直後に出ている値 | **3 件 / 3 区画** | **19 件 / 6 区画** |
| `F` の次に `a` を打つ | `"fa"` → **0 件**「「fa」に一致する値はありません」 | `"a"` → 9 件 |

**19 → 3 であって 19 → 0 でないのは、ハーネスの標本の値が ASCII だからである**（`f` を含む値が 3 件残った）。Description の「日本語の値では 0 件に見える」はラベルが日本語のワークスペース側の数で、**この標本では再現しない**。同じ 1 つの欠陥の、標本違いの見え方である。**変更後も次の `a` は普通に入る**ことが、止めたのが「開く押鍵 1 つ」だけで以降の入力ではないことを示す。

**試験は 1 件足した**（`shortcuts.test.ts`）。既存の「打ち消しを持つ行の一覧」へ `addFilter` を加えたうえで、**指摘の 1 件ではなく型を押さえる 1 件**を新設した — 「押した先が文字を取る欄へフォーカスを移す単独キー」の集合を持ち、その各行が修飾キー無しかつ打ち消しを持つことを見る。集合の中身は上の実測で決めたもので、同じ形の行が増えたらここへ足すことを TSDoc が述べている。

**欄へ文字が入らないこと自体は unit でも component でも押さえられない。**`shortcuts.ts` は DOM を読まない純関数であり、**`jsdom` は keydown の既定動作（文字挿入）を実装していない**（実測: `input` にフォーカスを当てて `keydown` を dispatch しても `value` は `""` のまま）。押さえられるのは記録の側で、欠陥そのものの証拠は上の実エンジン実測である。

**フロントエンドのフォーマッタは無い**ので当てていない。静的解析は `pnpm run check`（svelte-check、292 ファイル・0 errors / 0 warnings。`_sandbox/app-check/vite.config.ts` を拾う既知の 1 行は出る）、試験は `pnpm test`（701 件・28 ファイル）、`pnpm run build` も通した。**Rust 側は 1 行も触っていない**ので `cargo test` / `cargo fmt` / `cargo clippy` は実行していない。
<!-- SECTION:NOTES:END -->
