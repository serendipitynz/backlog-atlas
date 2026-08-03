---
id: TASK-112
title: フィルタ帯の先頭に funnel アイコンを置き、テキスト欄の属性名を撤去する
status: In Review
assignee: []
created_date: '2026-08-03 05:57'
updated_date: '2026-08-03 07:52'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-68
priority: medium
ordinal: 68500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
フィルタ帯の先頭にはテキスト検索欄があり、その属性名として「テキスト」が入力欄の左に出ている（TASK-68 が入力欄の上から左へ移した位置）。「テキスト」という語は何を絞り込むのかを述べておらず、画面を見た利用者に伝わらない。

帯の先頭に lucide の funnel を 1 つ置き、それを**帯全体（絞り込み）の目印**とする。「テキスト」の可視文言は撤去し、入力欄が何を受け取るかは placeholder「横断タスクID・title」が担う。文字が消えると入力欄が名前を失うので、読み上げ用に `aria-label` を置く。

**funnel を入力欄のラベルにしない**のは、漏斗が指すのは絞り込み全般であって「テキスト」ではないためである。入力欄の位置に置くと「この入力欄＝絞り込み」と読め、隣の「＋ 絞り込み」やトークン群と指示対象が重なる。帯そのものの目印にすれば図形と指示対象が一致する。ユーザーが 2026-08-03 に 3 案（帯全体の目印／テキスト欄のラベルとして funnel／テキスト欄には search を使う）から 1 案目を選択した。

**決定先行の判定が要る。** doc-7 §5.2 は「選択中の条件は絞り込みトークンとして帯に並べる」と帯の中身を定めるが、帯の**先頭に何を置くか**は定めていない。doc-11 §2.4 のアイコン規則は「アイコンのみのボタン」を対象に書かれており、**押せない目印としてのアイコン**を扱っていない（`aria-label` 必須・`aria-hidden` 常時、という 2 つの規則がボタン前提で書かれている）。どちらの doc をどう改訂するかは着手時に判定する。

**写し元**は lucide-react v1.17.0（ISC）の `dist/esm/icons/funnel.mjs`。`__iconNode` は `path` 1 本なので `IconShape` に新しいメンバーは要らず、`drawnShape` の網羅 switch は不変のままでよい（2026-08-03 に確認）。所在は `~/Projects/_ai_group/joinsure-ai-demo-insurance-advisor/node_modules/lucide-react/`。

**ついでに直す出典の不正確さ**: `src/lib/icons/lucide.ts` の冒頭は写し元を「lucide v1.17.0」と書いているが、実際に写したのは **lucide-react** v1.17.0 の同名ファイルである（`menu.mjs` の `__iconNode` がモジュール内の `ICONS.menu` と一致することを 2026-08-03 に確認した）。アイコンデータは両パッケージで同一なので図形は正しいが、出典はパッケージ名まで正確に書く（TASK-97 が ISC 告知を扱うときに読む記述でもある）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 帯の先頭に lucide funnel のアイコンが 1 つ出ており、押せる操作ではない（aria-hidden を持ち、doc-11 §2.4 の 1em・currentColor の規則に従う）
- [x] #2 「テキスト」の可視文言が帯から消えており、テキスト入力欄が aria-label で名前を持つ（文字が無くなっても入力欄の用途が読み上げから分かる）
- [x] #3 帯の高さが TASK-68 の 1 行（--bar-control）のままで、アイコンが他の控えと同じ上下中心に揃っている。実エンジンで測って数値を Implementation Notes に書く
- [x] #4 src/lib/icons/lucide.ts の出典記述が、実際に写したパッケージ（lucide-react v1.17.0）を名指ししている
- [x] #5 帯の先頭に押せない目印を置くことの根拠が doc に書かれている（doc-7 §5.2 か doc-11 §2.4。どちらへ書くかは着手時の決定先行判定で決める）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-03 に実装した。触ったのは `FilterBar.svelte`（先頭に目印を足し、`.caption` を撤去）と
`src/lib/icons/lucide.ts`（funnel の追加と出典の訂正）、doc-7・doc-11・doc-12 の 3 本。

**決定先行判定: decision は不要、doc-11 §2.4 と doc-7 §5.2 を改訂した（doc 改訂だけで足りた 3 例目）。**
争点は「押せない図形を帯の先頭に置いてよい」という許可が、doc-7 §5.2（帯の中身は定めるが先頭は定めない）
にも doc-11 §2.4（アイコンのみのボタンしか扱わない）にも無かったこと。2026-08-03 にユーザーが
「doc-11 §2.4 と doc-7 §5.2 の 2 か所を改訂・decision は書かない」を 4 案から選択した。
decision-12 の色値一式には触れていない（`currentColor` のみで新しい変数は無い）。

**doc-11 §2.4 に 操作に属さないアイコン を足した。** 押せる控えの内側に無く、置かれた帯・区画が
何を扱う場所かを図形だけで示すアイコンを指す（§1 の用語にも置いた）。規則は 3 つ —
(1) 図形が示すことは同じ帯・区画の中の語も述べていなければならない（アイコンは常に装飾なので、
読み上げには図形が何も残らない）、(2) 隣の控えの `<label>` の中に入れない（指示対象が帯全体で、
入力欄 1 つより広いため）、(3) `aria-label`・`title`・フォーカスを与えない（押しても何も起きない
要素が操作として読み上げられる）。doc-7 §5.2 には帯の先頭の構成と、テキスト欄が可視属性名を
持たない根拠を書いた。doc-12 §4.3 には「funnel は 03 に無い Atlas 側の追加」を記録した（差の当否は
TASK-80）。

**実測（WebKit と Chromium、1280×800、`_sandbox/filter-check/`）。** 基準は TASK-68 の実測値。

- **帯の高さは 32.98px で TASK-68 から変わっていない**（両エンジン、`?view=default`）。先頭に目印を
  足しても帯は 1 行のままで、グリッドの高さを奪っていない（AC #3）。
- **funnel の箱は 11.52×11.52px**。`Icon.svelte` の 1em に帯の `font-size: .72rem` が掛かった値で、
  アイコン専用の寸法は与えていない。
- **上下中心は 15.99px で、帯の全部の控えと一致する** — テキスト入力・＋ 絞り込み・トークン・
  直前の 1 つを戻す・全解除 がすべて高さ 22.39px / 中心 15.99px、funnel も中心 15.99px（AC #3）。
  折り返した `?view=many`（帯 60.19px）でも 5 つとも中心 29.59px で揃う。
- **stroke は `--muted` が解決した色**（`color(srgb 0.168627 0.196078 0.25098 / 0.62)`）。`.marker` の
  `color` を `Icon.svelte` の `currentColor` が引いている。
- **`aria-hidden="true"`・`tabIndex -1`・button/a/label の内側ではない**（AC #1）。Tab を 6 回押しても
  目印には止まらない（WebKit は input → body、Chromium は input → ＋ 絞り込み）。
- **帯から「テキスト」の文字列が消えている**（`.caption` は 0 個、帯の `textContent` に「テキスト」を
  含まない）。入力欄は `aria-label="テキストで絞り込み"` と `placeholder="横断タスクID・title"` を
  持つ（AC #2）。
- 図形は lucide-react v1.17.0 の `funnel.mjs` の `d` と 1 文字も違わないことを、描画後の `<path>` の
  `d` 属性で確かめた（AC #4 の出典訂正と同じ確認）。`menu.mjs` の `__iconNode` も `ICONS.menu` と
  一致することを確かめてある。
- テーマ 2 つ（atlas-light・atlas-dark）で 4 倍解像度の画像を撮り、漏斗の形が 11.52px でも潰れずに
  読めることを確認した。

**測っていないもの（目視で見てほしい範囲）**: 実機 Tauri（WKWebView）での見え方と、11.52px の
funnel が「絞り込みの帯だ」と伝わるかどうか。前者は借り物 WebKit と同系だが同一ではなく、後者は
測れる対象ではない。

**新しいテストは足していない。** 図形データの契約は型が持つ（`IconShape` の網羅 `switch`。TASK-67 が
そう作り、テストは書かなかった）。可視文言の撤去と `aria-label` は 1 画面の中の話で、AGENTS の
「コンポーネントテストは画面横断契約だけを固定する」に当たらない。`pnpm test` 534 件・
`pnpm run check` 287 ファイル 0 エラー・`pnpm run build` はいずれも通る。Rust 側は触っていないので
`cargo` は走らせていない。
<!-- SECTION:NOTES:END -->
