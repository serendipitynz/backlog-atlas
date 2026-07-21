---
id: TASK-15
title: 開発時の backlog 呼び出しと sidecar 同梱の判断時点を決める
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 10:34'
labels:
  - 'kind:research'
milestone: m-0
dependencies:
  - TASK-2
  - TASK-9
documentation:
  - doc-2
  - doc-1
priority: low
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
開発時に利用者の PATH 上の backlog を呼ぶ前提を確認し、どの時点で sidecar 同梱を検討するかを決める。sidecar 同梱は配布方法の選択であり、Backlog Atlas がタスク正本を所有することを意味しない（doc-2）。decision に記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 開発時は PATH 上の backlog を用いる前提と、その最低バージョン要件を明示している
- [x] #2 sidecar 同梱を検討する判断時点・条件を定義している
- [x] #3 採用結果を backlog/decisions に decision として記録している
<!-- AC:END -->
