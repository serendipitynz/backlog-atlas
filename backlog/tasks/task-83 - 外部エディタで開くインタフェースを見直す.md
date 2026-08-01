---
id: TASK-83
title: 外部エディタで開くインタフェースを見直す
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - task-detail
  - 'kind:feature'
milestone: m-3
dependencies: []
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: low
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の「外部エディタで開く」区画のインタフェースは見直しが必要だが、現実装で当面は成立する。$EDITOR で開く／OS の関連付けで開くの 2 経路の出し方、frontmatter がそのまま見えること・CLI のスキーマ保護を受けないことの伝え方を含めて再設計する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 2 経路の出し方が決まっている
- [ ] #2 スキーマ保護を受けない旨の伝え方が、TASK-79 の説明文の方針と矛盾しない
<!-- AC:END -->
