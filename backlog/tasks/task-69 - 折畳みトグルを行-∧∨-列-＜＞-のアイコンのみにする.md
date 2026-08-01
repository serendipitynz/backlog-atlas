---
id: TASK-69
title: 折畳みトグルを行 ∧∨ / 列 ＜＞ のアイコンのみにする
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 00:41'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-67
documentation:
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: medium
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
スイムレーンの行折畳みを ∧（展開は ∨）、列折畳みを ＜（展開は ＞）だけで表す。文言は出さない。lucide の chevron 系アイコンでもよい。画面設計案 01 とは異なる変更なので doc-7 の該当節を改訂する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 行折畳みが ∧ / ∨、列折畳みが ＜ / ＞ のアイコンのみで、文言が出ていない
- [ ] #2 aria-label と title で操作内容が読める
- [ ] #3 画面設計案 01 から意図的に外れた点とその理由が doc-7 に記録されている
<!-- AC:END -->
