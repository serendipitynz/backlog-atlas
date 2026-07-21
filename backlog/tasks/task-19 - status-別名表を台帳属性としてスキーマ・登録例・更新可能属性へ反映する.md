---
id: TASK-19
title: status 別名表を台帳属性としてスキーマ・登録例・更新可能属性へ反映する
status: Done
assignee: []
created_date: '2026-07-21 20:40'
updated_date: '2026-07-22'
labels:
  - 'kind:bug'
milestone: m-0
dependencies:
  - TASK-4
  - TASK-7
references:
  - backlog/decisions/decision-4 - status-はプロジェクト個別を許し正準ステータス列へ対応づける.md
documentation:
  - doc-3
priority: medium
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3:59 は台帳属性を4項目に固定するが、後発の decision-4:53 は status 別名表を台帳属性として要求している。doc-3 の TOML スキーマ、登録例、更新可能属性に status 別名表を追加し、decision-4 と整合させる。（設計レビュー P2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-3 の台帳 TOML スキーマに status 別名表を追加している
- [x] #2 登録例と更新可能属性に別名表を反映している
- [x] #3 decision-4 の正準ステータス対応づけと台帳属性が整合している
<!-- AC:END -->
