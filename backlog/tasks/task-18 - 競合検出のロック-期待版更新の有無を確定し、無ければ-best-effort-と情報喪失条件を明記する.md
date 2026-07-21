---
id: TASK-18
title: 競合検出のロック/期待版更新の有無を確定し、無ければ best-effort と情報喪失条件を明記する
status: Done
assignee: []
created_date: '2026-07-21 20:40'
updated_date: '2026-07-22'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-14
documentation:
  - doc-9
priority: medium
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-9:40 の版照合後、CLI 実行開始までに外部更新が入る余地があり、ロック無しの「照合→CLI 更新」では同一フィールドを古い入力で上書きしうる。Backlog CLI と共有できるロックまたは期待版付き更新が可能かを確定し、不可なら保証ではなく best-effort と明記し、競合時に情報が失われる条件を設計へ残す。（設計レビュー P2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backlog CLI と共有可能なロックまたは期待版付き更新の可否を確認・記載している
- [x] #2 保証できない場合は best-effort と明記し、情報喪失が起こる条件を列挙している
- [x] #3 利用者への競合提示（doc-9 の提示方針）と情報喪失条件の関係を定義している
<!-- AC:END -->
