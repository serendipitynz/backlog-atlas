---
id: TASK-216
title: completed・archive のタスクを盤面へ戻す操作を Atlas が提供するかを決める
status: To Do
assignee: []
created_date: '2026-11-11 05:58'
labels:
  - 'kind:research'
milestone: m-4
dependencies:
  - TASK-208
priority: medium
ordinal: 207700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.54.0 で task restore が入り、archive と completed のタスクを盤面（tasks/）へ戻せるようになった（2026-11-11 に v1.54.0 で実測。TASK-208）。decision-51 §6 は、Atlas が戻す操作を持つかを CLI の版とは別の製品判断として決めずに残した。

TASK-208 が最低バージョン要件を v1.54.0 へ上げたので、タスク詳細の completed・archive に出る理由文 noWayBackFromClosed（「completed・archive から戻す操作は CLI にないため提供しません」、英語版も同旨）は、動作保証のどの版についても偽になった。doc-8 §6.5 と edit.ts・TaskDetail.svelte の註は、TASK-208 が「Atlas に戻す操作が無い」の形へ改めてある。

本タスクは、restore を提供するかを決め、提供するなら操作写像（update.rs・wire.ts・edit.ts）と画面へ足し、提供しないなら理由文を真の文へ直す。どちらでも、TASK-208 が入ったリリースの画面に偽の理由文を残さない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Atlas が task restore を提供するかが決まり、理由が decision か doc に書かれている
- [ ] #2 タスク詳細の completed・archive に出る文が、v1.54.0 以上の CLI について真である（和英とも）
- [ ] #3 doc-8 §6.5 が決定に合わせて改訂されている
<!-- AC:END -->
