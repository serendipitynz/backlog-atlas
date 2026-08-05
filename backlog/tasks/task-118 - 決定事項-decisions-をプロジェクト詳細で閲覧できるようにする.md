---
id: TASK-118
title: 決定事項 (decisions) をプロジェクト詳細で閲覧できるようにする
status: To Do
assignee: []
created_date: '2026-08-05 08:18'
labels:
  - project-detail
milestone: m-3
dependencies: []
ordinal: 115500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #64 の目視フィードバック (2026-08-05) 由来。区画ナビに「決定事項」を足し、対象プロジェクトの backlog/decisions を一覧・閲覧できるようにする (閲覧のみ。v1.48.0 の CLI に decision の更新手段があるかは着手時に実測)。読み取り層は現在 decisions を読んでいないため、Rust 側の走査・wire 契約・fixture の拡張を伴う。公開阻害ではないため m-3 起票 (ユーザー判断で m-2 へ繰上げ可)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 区画ナビに決定事項があり、一覧と本文の閲覧ができる
- [ ] #2 読み取り層の decisions 走査が wire 契約と fixture に載っている
- [ ] #3 提供しない操作 (編集など) は理由つきで区画に載る
<!-- AC:END -->
