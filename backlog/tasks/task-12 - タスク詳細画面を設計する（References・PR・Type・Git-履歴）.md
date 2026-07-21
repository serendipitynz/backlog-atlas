---
id: TASK-12
title: タスク詳細画面を設計する（References・PR・Type・Git 履歴）
status: To Do
assignee: []
created_date: '2026-07-21 08:49'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-5
  - TASK-8
  - TASK-10
documentation:
  - doc-2
  - doc-1
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
単一タスクの詳細画面を設計する。Description / AC / labels に加え、References、抽出した Pull Request URL、Type、タスクID に対応する Git 履歴を独立して表示する。Git・PR 参照は TASK-10 の設計を用いる。編集操作は Backlog 更新アダプター経由。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 詳細に表示する項目（Description、AC、Type、References、PR URL、Git 履歴）を定義している
- [ ] #2 PR URL と Type を通常ラベル・References から分離表示する構成を定義している
- [ ] #3 詳細からの編集操作を Backlog 更新アダプター経由に位置づけている
<!-- AC:END -->
