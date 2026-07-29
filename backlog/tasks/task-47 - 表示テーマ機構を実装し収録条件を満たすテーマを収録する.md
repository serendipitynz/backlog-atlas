---
id: TASK-47
title: 表示テーマ機構を実装し収録条件を満たすテーマを収録する
status: To Do
assignee: []
created_date: '2026-07-28 23:14'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-46
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-12 は、色値一式を表示テーマ単位で一箇所に定義し、利用者がアプリ設定で 1 組を選べるようにすると決めた。現行 `src/app.scss` は族の色を `:root` に置き、地と文字は CSS システム色 `canvas`/`canvastext` を直接参照、罫線は `currentColor` の color-mix で導いており、色値の派生元が二箇所に分かれている。これを `[data-theme="…"]` のブロック群へ移し、システム色の直接参照を全コンポーネントから外す。

収録条件（4 族と --info の 5 つすべてで、印の文字と 12% 混色背景の比が 4.5:1 以上）は、設計案 05 が示した 10 組の色値のままでは満たせない。--bg に対して実計算すると 50 セル中 21 セルが 4.5:1 を下回り、最小は Solarized Light の照合不能で 3.28:1、既定の Atlas Light でも縮退が 3.91:1 である。族に割り当てた色相の役割（黄土・紫・灰青・赤・青）を保ったまま明度・彩度を調整して収録条件を満たす。満たせない組は収録しない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 [data-theme] のブロック群を app.scss に置き、色値がそこだけに在る（コンポーネントは変数名と color-mix のみを参照する）
- [ ] #2 canvas・canvastext・currentColor 由来の色参照を全コンポーネントから外し、--bg・--fg・--line 経由にする
- [ ] #3 収録する全テーマ・全 5 族について、印の文字と 12% 混色背景の比が 4.5:1 以上であることを検算で示す（カード面 --panel とレーンヘッダ行面 --inset の両方で）
- [ ] #4 各ブロックが color-scheme を宣言し、フォームコントロールとスクロールバーの明暗が追従する
- [ ] #5 既定は OS の明暗に追従して Atlas Light / Atlas Dark を選び、利用者が明示的に選んだ後はその選択が優先される（アプリ設定へ永続）
<!-- AC:END -->
