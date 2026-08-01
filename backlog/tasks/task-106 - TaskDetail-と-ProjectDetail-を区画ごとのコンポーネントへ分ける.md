---
id: TASK-106
title: TaskDetail と ProjectDetail を区画ごとのコンポーネントへ分ける
status: To Do
assignee: []
created_date: '2026-08-01 00:44'
updated_date: '2026-08-01 00:45'
labels:
  - maintainability
  - ui
  - 'kind:refactor'
milestone: m-3
dependencies:
  - TASK-92
priority: low
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TaskDetail.svelte と ProjectDetail.svelte は script が各約 610 行だが、markup と SCSS を含めると 2,000 行を超える。表示区画が仕様どおり 1 画面へ集約されていることには理由があるが、入力状態・発行状態・競合表示・破棄確認・各区画の SCSS を同時に追う必要がある。TASK-92 は App.svelte だけを対象にしているのでこの 2 ファイルは残る。

区画切替で入力を失わないために 1 コンポーネントへ集約したのが元の設計判断（m-1 TASK-55）なので、分割はその制約を壊さない形で行う — 状態は親が持ち、子は描画と入力の受け渡しに限る。m-2 の UI 改修（TASK-62・63・64・71・72・73）が両ファイルの構造を変えるため、その後に着手する。

_sandbox/repository-quality-assessment-2026-08-01.md の可読性節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 両ファイルが区画ごとのコンポーネントへ分かれ、1 ファイルが markup と SCSS を含めて 2,000 行を下回る
- [ ] #2 区画を切り替えても未保存入力が失われない（m-1 TASK-55 の設計判断を維持）
- [ ] #3 分割の前後で既存のテストが通り、画面の挙動が変わっていない
<!-- AC:END -->
