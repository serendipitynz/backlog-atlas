---
id: TASK-70
title: 「未対応」を「未分類」へ改称する
status: In Review
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-03 20:35'
labels:
  - ui
  - swimlane
  - terminology
  - 'kind:refactor'
milestone: m-2
dependencies: []
documentation:
  - backlog/decisions/decision-4 - status-はプロジェクト個別を許し正準ステータス列へ対応づける.md
priority: high
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
列対応規則でどの正準ステータス列にも対応づかなかった status とその置き場を「未対応」と呼んでいるが、status の値そのものは欠けていないので誤りである。Atlas が分類できなかったことを表す「未分類」へ改める。公開語彙なので、公開後に直すと互換の話になる。改称対象は decision-4・doc-7・doc-11・doc-12 の該当箇所と、実装の表示文字列（swimlane.ts の UNMAPPED_LABEL とその周辺の説明文）。コード識別子の unmapped は指示対象が変わらないため据え置いてよいが、判断を doc に残す。なお現在この列が見えないのは未実装ではなく、該当タスクが 1 件も無い間は列を出さない設計（doc-7 §2.2）による。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-4・doc-7・doc-11・doc-12 の「未対応 status」「未対応区画」「未対応列」が「未分類」系へ改められている
- [x] #2 画面に出る文字列が「未分類」になっている
- [x] #3 コード識別子を据え置く／変える判断とその理由が doc に記録されている
- [x] #4 該当タスクが 1 件も無い間は列が出ない挙動が変わっていない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決定先行判定

**doc 改訂のみで decision は書かない** (TASK-66・67・112・69 に続く 5 例目)。改称そのものは
Description の時点でユーザーが決めており、decision-4 の判断 (どの正準ステータス列にも対応づかない
status を破棄せず専用の置き場を与える) は変わらない。変わるのは公開語彙の名前だけである。

**decision-4・decision-6 は本文を原地改訂した。** `backlog decision` は `create` しか持たず
(v1.48.0 実測)、AGENTS §Updates が CLI へ委譲すると定める対象は task・document・milestone の列挙で
decision を含まない。原地改訂は decision-5 (TASK-110 の `3db4d06`)・decision-13・decision-14
(TASK-85・87) に実績がある。doc は `backlog doc update <id> --content` で全置換した (引数配列渡し)。

## 対応表で分かれたもの

起点にした `_sandbox/referent-table-m2-scope-2026-08-01.md` 第 3 版の「未対応 status／未対応区画」の
1 行が、**2 つの指示対象を束ねていた**ので行を分けた (対応表 `referent-table-task-70.md` 第 2 版)。

- **未分類区画** … 1 つのプロジェクト行の中で、未分類 status のタスクのカードが並ぶかたまり。
  doc-7 §1 の定義 (行 × 正準ステータス列) に当たらないのでレーンセルではない。
- **未分類列** … その区画が全プロジェクト行にまたがって占める列位置。どの行にも未分類 status の
  タスクが無くなると消える。列折畳みの対象だが「展開中の最後の 1 列」には数えない。

doc-7 §2.2 は既に両者を書き分けていたので、改称は語だけで足りた。

## 改称の範囲 (AC #1)

AC #1 が挙げる decision-4・doc-7・doc-11・doc-12 に加えて **decision-6・doc-3・doc-10 も改称した**。
同じ指示対象を指しており、残すと定義側 (decision-4) と使用側で語が食い違う。**対象外は 2 件**で、
どちらも doc-7 §2.2 に理由を書いた。

- **完了済みタスクの記録** (TASK-29・34・35・38・42・48・49・50・53・54・61・69・110) は実施時点の
  記録であって契約ではないので、当時の語のまま残す。
- **`GitHistory.svelte` の「未対応ホスト」** は remote のホスト種別を判別できない状態
  (doc-8 §5 の「remote 非対応」) を指しており、指示対象が別なので改称しない。

**doc-12 §5 の「未対応列」はユーザーが 2026-08-04 に「転記時の言い換え」と回答したので改称した。**
原文の語であれば doc-12 §1 の「原文の値のまま写す」に反するため据え置く必要があったが、
リポジトリ内からは判別できない (第 19 版の [P1] と同じ、リポジトリ外の原文への帰属の問題)。

## コード識別子 (AC #3)

`unmapped`・`UNMAPPED_LABEL`・`SwimlaneRow.unmapped`・列 id `"unmapped"` を**据え置いた**。理由を
doc-7 §2.2 に書いた — 英語の unmapped は「列へ対応づかない」ことをそのまま述べており、改称の理由
(「未対応」が値の欠落を含意する) が当たらない。

## 実測 (WebKit・Chromium、1280×800、`_sandbox/sticky-check/`)

TASK-69 のハーネスをそのまま使った (`?unmapped=` のつまみが未分類列の有無を切り替える)。

- **列ヘッダの高さは 5 列すべて 32.97px**。両エンジン・`atlas-light`・`atlas-dark`・折畳みの前後で
  同一で、TASK-69 が測った 32.97px から動いていない。「未対応」も「未分類」も 3 字なので、
  1 行保持 (doc-7 §2.2) に影響しない。
- **未分類列の頭は「＜ 未分類」の 1 行**、控えは左端。畳むと帯の幅 80px になり、控えの
  `aria-label` が「未分類区画の列折畳みを行う」→「未分類区画の列折畳みを解く」へ替わる。
- 4 倍解像度の画像で light・dark の両方の字形を確認した。

**測っていないもの** (目視依頼の範囲): タスク詳細の印「正準列 未分類」、設定モーダルのカード情報量の
説明文、プロジェクト詳細の別名効果 4 態のうち「宣言なし → 効果なし」の注記。いずれも既存の箱の中の
3 字置換で、寸法を持つ要素は増えていない。

## 検証

- `pnpm test` 533 passed (24 files)。`pnpm run check` 287 ファイル・エラー 0・警告 0。
- `cargo test` 345 passed / 4 ignored、`cargo test -- --include-ignored` 349 passed。
  `cargo fmt --check` 無指摘、`cargo clippy --all-targets` 無指摘。
- **AC #4 (該当タスクが 1 件も無い間は列が出ない) は挙動に触れていない**。`hasUnmapped` と
  `{#if hasUnmapped}` は無改変で、`swimlane.test.ts` の
  「leaves the 未分類区画 empty when every status maps」と
  「adds 未分類 only while the grid is showing that column」が引き続き固定している。
- フロントエンドに設定されたフォーマッタは無い (prettier は依存にも設定にも無い) ので、
  静的解析は `pnpm run check` を報告する。
<!-- SECTION:NOTES:END -->
