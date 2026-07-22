---
id: TASK-23
title: 'doc-1 用語対応表の project:<slug> ラベル判定を「Backlog ルートから決定」に修正する'
status: Done
assignee: []
created_date: '2026-07-21 20:41'
updated_date: '2026-07-22'
labels:
  - 'kind:bug'
milestone: m-0
dependencies: []
documentation:
  - doc-1
priority: medium
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-1:19 だけが project:<slug> ラベルによるプロジェクト判定を残し、doc-2 以降の「読み込んだ Backlog ルートから決定」と矛盾する。先行対応表 doc-1 を後続設計に合わせて修正する。（設計レビュー P2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-1 の project 判定記述を「Backlog ルートから決定」に修正している
- [x] #2 doc-2 以降の設計と用語対応表が矛盾しないことを確認している
<!-- AC:END -->
