---
id: TASK-10
title: タスクID からの Git・Pull Request 履歴参照を設計する
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 10:07'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-4
  - TASK-5
documentation:
  - doc-2
  - doc-1
  - doc-6
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスクID を、そのタスクを所有するプロジェクトのリポジトリの Git 履歴で検索し、対応コミットを表示する仕組みを設計する。Pull Request URL はタスクの References から抽出する。remote が対応する場合はコミットと Pull Request の関連解決も設計に含める。台帳の Git remote 属性（TASK-4）を用いる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タスクID → 所有プロジェクトのリポジトリ Git log → コミット一覧の検索経路を定義している
- [x] #2 References からの Pull Request URL 抽出規則を定義している
- [x] #3 remote 対応時のコミットと Pull Request の関連解決方針を定義している
<!-- AC:END -->
