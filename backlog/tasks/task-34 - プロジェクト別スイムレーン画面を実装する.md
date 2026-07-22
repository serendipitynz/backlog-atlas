---
id: TASK-34
title: プロジェクト別スイムレーン画面を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-29
  - TASK-33
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-7 の設計に従い、project を行・status を列に複数プロジェクトのタスクを同時表示するスイムレーン画面を実装する。列は正準4列で固定し、プロジェクト横断の縦読みを成立させる。既定表示は active タスクに限定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 行=プロジェクト・列=正準4列固定・セル=タスクカードで構成し、既定は active タスクのみ表示する
- [ ] #2 どの正準列にも対応づかない未対応 status を未対応区画へ集め、元の status 文字列を示す
- [ ] #3 カードに横断タスクID・title・Type・通常ラベル・priority・assignee・health 印・保存区分印を載せる
- [ ] #4 セル内は priority 降順→ordinal 昇順→updated_date 新しい順の安定並びにする
- [ ] #5 Type/通常ラベル/priority/assignee/テキスト/縮退/保存区分でフィルタでき、ルート読取不能行と空セルを区別する
- [ ] #6 プロジェクト行は台帳順を既定とし、行の並べ替えと一時的な表示・非表示ができる（doc-7 §5）
<!-- AC:END -->
