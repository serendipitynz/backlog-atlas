---
id: TASK-142
title: 文書・マイルストーン・タスクの本文を Markdown として描く
status: In Review
assignee: []
created_date: '2026-08-09 05:02'
updated_date: '2026-08-11 08:43'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
  - backlog/docs/doc-10 - プロジェクト詳細画面-設計.md
priority: high
ordinal: 139500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。現在は本文をファイルが書いたままの文字列として出しており (`TaskDetail.svelte` の註が理由を「Markdown レンダラは新規本番依存で AGENTS が導入前の確認を求めるため」と書いている)、見出しも強調も表も生の記法のまま読ませている。

ユーザーの求め (原文):
- マークダウンをそのまま表示するのではなく、レンダリングしてほしい。`~/Projects/_snz/mallow` 的
- frontmatter も mallow 的にパース
- コードのシンタックスハイライトは不要
- mermaid は対応できたら嬉しい
- backlog.md でのブラウザ表示は対応済みなので、それに準拠する形

**依存ゲート (AGENTS Dependencies)**: 新規本番依存の追加前に選定理由と導入範囲をユーザーへ確認する。mallow が使っているのは `markdown-it` + プラグイン数点 + `mermaid` + `yaml` で、シンタックスハイライトの `shiki` は本件では要らない。**着手時に、入れる依存とその範囲を確定してからでないと実装へ入らない。**

**決定先行**: 描く先が 3 画面ある (タスク詳細の Description・実装計画・実装ノート、プロジェクト詳細の文書本文、マイルストーンの説明)。決めることは、①どの本文を描き、どれを生のまま残すか (編集フォームの入力欄は生のままである必要がある)、②`<a href>` をどう扱うか — 現在の註は「Tauri の WebView 内の `<a href>` はアプリ窓を Atlas から離れさせる」ためリンクにしていないと書いており、Markdown を描くとリンクが本文の中に現れる、③mermaid を入れるかどうか (入れると依存が大きく増える)、④backlog.md のブラウザ表示に準拠する範囲。

決めた結果は doc-8 (タスク詳細) と doc-10 (文書・マイルストーン) の両方へ書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 導入する本番依存とその範囲がユーザーの確認を経て決まり、decision または doc に記録されている
- [x] #2 タスク・文書・マイルストーンの本文が Markdown として描かれる
- [x] #3 frontmatter が本文と分けて扱われる
- [x] #4 本文中のリンクを押したときの挙動が決まっており、アプリ窓が Atlas から離れない
- [x] #5 mermaid を入れるかどうかが決まり、理由が記録されている
- [x] #6 編集フォームの入力欄が生の Markdown のままである
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測（2026-08-11）

**着手前**（争点の材料。値は decision-25 の Context にも入っている）:

- 台帳が現に使う記法（`backlog/` 184 ファイル、コメント除去後）: インライン `code` 5,983／強調 3,917／
  見出し 1,015／GFM 表 659／タスクリスト 624／コードフェンス 24／生 HTML 24／リンク 19。
  **0 件: 作図フェンス・GitHub alert・脚注・画像・裸 URL。**
- AC 項目 624 件のうちインライン記法を使うのは 9 件（1%）。強調・リンク・見出し・入れ子は 0 件。
- backlog.md v1.48.0 のブラウザ表示: react-markdown ＋ GFM（表・autolink・脚注）＋ GitHub alert ＋
  タスクリスト ＋ mermaid ＋ DOMPurify 3.4.0。シンタックスハイライトと shortcode emoji は無し。

**出荷物の増分**（`pnpm run build` の前後）: 起動時に読む分が 359,833 B → 483,744 B（**+123,911 B**。
JS 297,098 → 418,855、CSS 62,735 → 64,889）、遅延 chunk が 0 → **3,434,499 B**（63 本）。
mermaid が動的 import であることは出荷物の中の `import("./mermaid.core-*.js")` で確認した。

**実エンジン 2 つ × 窓 3 条件**（`_sandbox/task-142/measure-body.mjs`、値は `body.json`、画像は `shots/`）:
3 区画とも整形表示になり、記法は h1/h2/h3・強調・インラインコード 4・GFM 表・引用・タスクリスト
（印 2 件）・リンク 2 本が描かれ、`img` 0・`details` 0（生 HTML は文字のまま）・作図結果 1 件。
**横あふれはパネル 0・本文ブロック 0・表 0・作図結果 0** で、コードフェンスだけが自分の中で
132〜390px スクロールする（doc-11 §14.2 の意図どおり）。字は本文 11.84px・h1 12.48px・h3 11.84px
（doc-11 §2.2 の 2 段）、リンクは `rgb(33, 100, 143)`＝`--info`。
**押下は境界へ `{url: "https://example.test/spec"}` として届き、窓は Atlas から離れなかった**（AC #4）。
`./doc-3.md` はリンクにならず文字のまま残った。ページ例外 0 件。

**CSP**（`measure-csp-built.mjs`、`csp-built.json`。出荷形＝外部 CSS 1 本を CSP ヘッダ付きで配って測った）:
`style-src 'self'` では**作図結果 は描かれるが色を失い**（`fill` が `rgb(236,236,255)` → `rgb(0,0,0)`）、
違反が WebKit 111・Chromium 192 件。`'unsafe-inline'` を足すと 0 件で色も戻る。
**作図フェンスを持たない整形表示の本文は同じ CSP で違反 0 件**（両エンジン）なので、要求しているのは
mermaid だけである。結果は doc-11 §14.5 が記録し、TASK-98 が選ぶ。

## 契約と実装の対応

- decision-25（判断 3 つ: 整形手段 `markdown-it` 15.0.0／本文リンクの 既定ブラウザ起動／
  作図の `mermaid` 11.16.1）。却下候補は判断ごとに分けて記録。
- doc-8 **§9 新設**（何を整形するか・記法の範囲・本文リンクと既定ブラウザ起動・見え方の帰属）、
  §7 に入口の書き分けを 1 項。doc-10 §5・§6 は §9 を引く形へ改訂。
- doc-11 **§14 新設**＋§2.2 の表へ「整形表示の中の見出し」1 行。**節番号は動かしていない。**
- 実装: `src/lib/markdown.ts`（純関数）・`src/lib/markdown-figure.ts`（DOM と遅延読込）・
  `src/components/Body.svelte`（**Atlas で唯一の `{@html}`**）・`src/lib/icons/lucide.ts` の
  `ICON_SVG_ATTRS`／`iconMarkup`・Rust の `editor::browser_url`／`open_url` と `body_link_open`。

## 測っていないもの

- **画面目視は未実施**（この環境は `screencapture` を持たない）。実エンジンの数値と画像は上のとおり
  取れているので、目視へ回すのは実機 webview の描画差と読み心地である。
- **右クリックの文脈メニューから「リンクを開く」を選んだときに窓が離れるか**は測っていない。
  押下（`click`・`auxclick`）は両エンジンで捕まえているが、webview の文脈メニューは playwright から
  出せない。AC #4 が言う「押したとき」の範囲外だが、実機で確かめられる項目として目視へ回す。
- **作図結果 の色が 10 テーマそれぞれで読めるか**は測っていない。doc-11 §14.5 が明暗 2 通りだけと
  定めたので、テーマごとの検算は対象外である（decision-12 の収録条件は色値集合に掛かる）。
<!-- SECTION:NOTES:END -->
