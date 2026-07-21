---
id: TASK-11
title: プロジェクト別スイムレーン画面を設計する
status: To Do
assignee: []
created_date: '2026-07-21 08:49'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-5
  - TASK-7
  - TASK-8
documentation:
  - doc-2
  - doc-1
priority: medium
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
プロジェクトごとの行とステータスごとの列で複数プロジェクトのタスクを同時表示するスイムレーン画面を設計する。列は status 正規化（TASK-7）、Type 表示は kind 導出規則（TASK-8）に従う。行=プロジェクト、列=status、セル=タスクカードの構成、フィルタ・並び順を含む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 行=プロジェクト、列=status、セル=タスクカードのレイアウトを定義している
- [ ] #2 タスクカードに表示する項目（横断タスクID、Type、labels、priority など）を定義している
- [ ] #3 フィルタ・並び順とプロジェクト/status のマッピング方針を定義している
<!-- AC:END -->
