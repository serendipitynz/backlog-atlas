---
id: TASK-184
title: 抽出漏れの走査を足し、英語表示のレイアウトを確かめる
status: Done
assignee: []
created_date: '2026-08-15 22:19'
updated_date: '2026-08-16 12:06'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-187
ordinal: 175700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-35 §4 の 2 段目 — 源泉に残った日本語を落とす走査 — を `screen-text.test.ts` の 4 本目として足し、英語表示のレイアウトを確かめる。

**この行は 2026-08-16 に TASK-182 から分けて起票され、同じ日に依存を付け替えた。** 走査は抽出が終わるまで通らない — 源泉に残った日本語で落ちるのが走査の役目なので、除外表を持たない限り最後に入る。**抽出は同日 2 つに割れた**（TASK-183 が 取得子側の画面文、TASK-187 が `msg()` 側の画面文）ので、**依存は TASK-187 である** — TASK-183 だけが済んだ時点では `src/lib/**/*.ts` に画面文の日本語が残っており、そこで走らせれば必ず落ちる。

**源泉は `screen-text.test.ts` が既に数えている 4 つである** — フロントエンドの `.ts` と `.svelte`、crate の `.rs`、`index.html` の `<title>`、`tauri.conf.json` の窓 `title`。**源泉を数え落とさないための検査も既に在る**（`scans the crate and both titles too`）。**語の一覧より先に源泉の一覧を数える** — フロントエンドだけ見ると crate の失敗理由を落とす。

**crate の走査には決めることが 1 つ残っている。** Rust は試験を同じファイルの `#[cfg(test)] mod` に置くので、素の走査は試験の assert 文言と日本語を含む試験関数名（`an_unset_指定_leaves_the_bare_name_for_the_os` など）に当たる。フロントエンドの走査はこれを `SKIPPED`（`\.test\.` ほか）で外しており、その註は「利用者が読むものではない」と述べている。**同じ規則を Rust が試験を置く場所へ当てるだけなので新しい例外ではないが、decision-35 §4 は「例外は 文言表 2 ファイルだけ」と書いている** — 着手セッションは §4 にその一文を足すところから始める。**AGENTS の「コードコメントは英語散文＋日本語領域語」が試験名の日本語を認めているので、試験の側を英語へ書き換える案は採らない。**

**英語レイアウトの実測は借り物 playwright で行う**（引き継ぎ指示書の「実エンジンでの実測」。`_sandbox/app-check/` は本物の `App.svelte` を本物の `commands.ts` の上に立てる型 3）。**数と画像は別のものを見ているので、測れるところを目視へ丸投げしない。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 抽出漏れを検出する走査が screen-text.test.ts に在り、源泉に日本語を残すと落ちることを確かめてある。除外は decision-35 §4 が挙げる 文言表 の 2 ファイルだけで、走査自身がその 2 つを除いていることを検査が示す
- [x] #2 英語表示で 1280x800 のレイアウトが崩れない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 走査の実装 (AC #1)

`screen-text.test.ts` の 4 本目として入れた。**範囲は既存の 4 つの源泉と同じ** — フロントエンドの
`.ts`/`.svelte`（`SKIPPED` を除く）、crate の `.rs`、`index.html`、`tauri.conf.json`。

**着手時に源泉を数え直した**（2026-08-16）。フロントエンドは **775 行・2 ファイルで、その 2 つが
文言表 そのもの**（`ja.ts` 774・`en.ts` 1）＝ TASK-183・187 の抽出は完了している。`index.html` と
`tauri.conf.json` は 0 行（どちらも `Backlog Atlas`）。

**crate は 34 行・8 ファイルで、指示書が第 17 版に書いていた「14 行・3 ファイル」は部分列挙だった** —
`commands.rs` 12・`history.rs` 5・`update.rs` 5・`external.rs` 4・`read/id_order.rs` 4・`settings.rs` 2・
`ledger.rs` 1・`sync.rs` 1。**34 行すべてが `#[cfg(test)] mod tests` の中**にあり、
これを外すと crate も 0 行になる。decision-35 §4 にこの範囲の一文を足した（除外ではなく源泉の外である、
という位置づけ）。

**試験モジュールの終端は波括弧の計数ではなく rustfmt の字下げで採る** — 文字列リテラルの中の波括弧
（`settings.rs` の `"{forbidden} is …"`）を知る必要が出るためで、CI が `cargo fmt --check` を回している
以上、属性の字下げ ＋ `}` の行が終端である。**終端が見つからない mod は剥がさず残す**（剥がしすぎると
本物の画面文が隠れる）。crate の 17 個の mod は全部終端が取れている。

**文字クラスに CJK 約物を入れてある。** 取り残しは仮名を含むとは限らず、
`` `${slug}（${detail}）` `` は語をすべて補間で抜いた日本語の文である。約物を含めても
文言表 の外では 0 行なので、例外は増えていない。

### 落ちることの確認

修正を外して落ちるかを、源泉ごとに 1 件ずつ植えて測った（植えた後の実行 → 復元、を 10 通り）。

| 植えたもの | 結果 |
|---|---|
| `src/lib/token.ts` に日本語の文字列 | 1 失敗 |
| `src/components/Swimlane.svelte` に日本語のマークアップ | 1 失敗 |
| `src-tauri/src/editor.rs` の試験モジュールの**外**に日本語 | 1 失敗 |
| `src-tauri/src/editor.rs` の試験モジュールの**中**に日本語 | 14 通過（＝正しく外れている） |
| `index.html` の `<title>` を日本語に | 1 失敗 |
| `tauri.conf.json` の窓 `title` を日本語に | 1 失敗 |
| 約物だけの取り残し `` `${a}（${b}）` `` | 1 失敗 |
| コメントに日本語 | 14 通過（AGENTS が認めている） |
| 走査から 文言表 の除外を外す | 1 失敗（＝除外は現に効いている） |
| 走査から試験モジュールの剥がしを外す | 1 失敗（＝剥がしは現に効いている） |

## 英語表示のレイアウト (AC #2)

`_sandbox/app-check/`（型 3）に `?lang=ja|en` を渡し、playwright の WebKit を 1280x800 で回して
**10 状態**を日英で測った: スイムレーン・メニュー・絞り込みポップオーバー・タスク詳細（概要／編集／Git 履歴）・
プロジェクト詳細・設定・プロジェクト登録・キーボード操作一覧。**日本語を「変更前」として同じ状態を測り、
DOM の位置で突き合わせている。**

- **全 10 状態・両言語とも `document.scrollWidth` は 1280 = ビューポート幅**（横スクロールは出ていない）。
- **英語で新たに切れる／画面外へ出る要素は 0 件**（`scrollWidth > clientWidth` かつ `overflow` が
  `hidden`/`clip`、または右端が 1280 超）。日英の該当数は状態ごとに一致した。
- **英語で新たに省略記号が付く要素も 0 件。**

**数で見えなかった欠陥が 1 件あり、画像で見つかった** — 絞り込み帯の検索欄の placeholder である。
この `input` は幅指定を持たず既定の内在幅（余白を除いて **152px**）で、
`Cross-project task ID / title` は **152px** ちょうどで WebKit が語の途中（`/ t`）で切っていた。
日本語の `横断タスクID・title` は 100px で収まる。**placeholder は `scrollWidth` を動かさないので、
数値の走査では原理的に出ない。** `Cross-project ID / title`（**125px**）へ縮めた。
省いた語は `filter.textLabel`（`Filter by text`、aria-label）が持っている。

**同型を数え直した**ところ、英語 placeholder で幅に触れるものは他に無かった（6 状態の全 `placeholder` を
実測）。

**併せて英語のラベル 1 件を直した。** `columnFoldLabel` が `column` を重ねており、
`Fold the To Do column column` になっていた（`name` は `columnHeadName` が `To Do column` を、
`unmappedHeadName` が `Unmapped area` を渡すので、名詞は既に `name` の側にある）。
`Fold the ${name}` にして `Fold the To Do column` / `Fold the Unmapped area` になった。
**日本語は同型ではない** — あちらは操作自身に 列折畳み という名がある。
10 状態の英語ラベル全件を語の重なりで走査し、単一ラベル内の重複はこの 1 件だけだった
（他は兄弟要素の連結で、プロジェクト名＋slug など）。

## 走査していないもの

- **crate の `#[cfg(test)]` が付いた「本体と同じファイルの mod」以外**は剥がさず走査している。
  内訳は 3 つ — `ledger.rs` の関数 2 件、`store.rs` の試験用の型、そして **`lib.rs` が
  `#[cfg(test)] mod csp;` / `mod wire_fixtures;` と宣言する別ファイル 2 つ**（計 1,637 行）である。
  **3 つ目は 1R の [P3] で指摘されて数え直した** — 初版のこの一覧は前 2 つだけを挙げており、
  1,637 行を数え落としていた。どれも日本語はコメントに限られるので現に通っている。
  **外す側ではなく見る側に倒してある**（見逃すのではなく余計に鳴る向き）。
- **1280x800 以外の寸法**と、**実機の WKWebView・WebView2・WebKitGTK。** 借り物 playwright の WebKit は
  WKWebView と同系だが同一ではない。
<!-- SECTION:NOTES:END -->
