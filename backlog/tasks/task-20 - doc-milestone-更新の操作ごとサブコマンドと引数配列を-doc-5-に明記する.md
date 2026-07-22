---
id: TASK-20
title: doc/milestone 更新の操作ごとサブコマンドと引数配列を doc-5 に明記する
status: Done
assignee: []
created_date: '2026-07-21 20:40'
updated_date: '2026-07-22'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-9
documentation:
  - doc-5
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5:43 は文書とマイルストーンを「該当サブコマンド」で済ませ、TASK-9 AC #1 の「操作ごとのサブコマンドと引数配列」を満たしていない。v1.47.1 では文書は doc create/doc update、マイルストーンは milestone add/rename/remove/archive。マイルストーン説明の更新コマンドは無いため、GUI で提供できる操作範囲も明記する。（設計レビュー P2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc/milestone の各操作に対応するサブコマンドと引数配列を列挙している
- [x] #2 v1.47.1 に存在しない操作（マイルストーン説明更新など）を明記している
- [x] #3 上記制約に基づき GUI が提供する操作範囲を定義している
<!-- AC:END -->
