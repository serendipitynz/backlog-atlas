---
id: TASK-38
title: 不在・読取不能・該当なしの表示区別を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-22 12:07'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-34
  - TASK-35
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8/doc-7/doc-6 の後続として、decision-6 に従い対象不在・読取不能・該当なしを一つの空白にまとめず別状態として区別する横断的な表示を実装する。競合（版ずれ）は解析縮退とも別事象として区別する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象不在・読取不能・該当なしを別状態として表示し分ける
- [ ] #2 スイムレーンでルート読取不能行（行単位）と空セル（該当タスク無し）を区別する
- [ ] #3 Git 履歴でコミット0件・remote 不在・関連解決不能・Git 対象不在を区別して示す
- [ ] #4 タスクの縮退印（解析起因）と競合（版ずれ）を別表現にし、スイムレーン・詳細へ横断的に適用する
<!-- AC:END -->
