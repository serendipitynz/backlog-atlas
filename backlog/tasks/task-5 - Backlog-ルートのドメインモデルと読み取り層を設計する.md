---
id: TASK-5
title: Backlog ルートのドメインモデルと読み取り層を設計する
status: To Do
assignee: []
created_date: '2026-07-21 08:49'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-3
documentation:
  - doc-2
  - doc-1
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog ルートから読むタスク・設定・マイルストーン・文書のドメインモデルと読み取り層を設計する。読み取り方式の decision（TASK-3）に従い、frontmatter/本文/AC/References/labels を Atlas 内部表現へ写像する。エラー時（不正な frontmatter、欠損ファイル）の扱いを含む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タスク・設定・マイルストーン・文書の内部表現と、Backlog 管理ファイルからの写像を定義している
- [ ] #2 labels から Type と通常ラベルを分離する境界を読み取り層に位置づけている
- [ ] #3 解析エラー・欠損時の扱いを定義している
<!-- AC:END -->
