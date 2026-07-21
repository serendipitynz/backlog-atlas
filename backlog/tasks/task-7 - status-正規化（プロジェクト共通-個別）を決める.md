---
id: TASK-7
title: status 正規化（プロジェクト共通 / 個別）を決める
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 09:51'
labels:
  - 'kind:research'
milestone: m-0
dependencies:
  - TASK-5
documentation:
  - doc-2
  - doc-1
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
プロジェクトごとに異なる status を許すか、初期版で共通の To Do / In Progress / In Review / Done を要求するかを決める。スイムレーンの列はこの結果に依存する。decision に記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 共通 status 要求か個別許容かを決め、理由を述べている
- [x] #2 個別を許す場合の列マッピング／未知 status の扱いを定義している
- [x] #3 採用結果を backlog/decisions に decision として記録している
<!-- AC:END -->
