---
id: TASK-27
title: ドメインモデルの型定義を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:07'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-25
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4 §3 の設計に従い、Backlog 管理ファイルの内容を写す Atlas 内部のメモリ上データ構造（タスク・設定・マイルストーン・文書）を型として定義する。判別できた事実と、未確定・不足の明示を同居させ、縮退表示へ回せるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タスク・設定・マイルストーン・文書の型を定義し、1プロジェクト内で id により相互参照できる
- [ ] #2 タスクに project（走査元ルート由来）と storageState（active/draft/completed/archive）を frontmatter とは独立の軸で保持する
- [ ] #3 type（kind 由来）と通常ラベルを分離して保持し、生の labels を混在させない
- [ ] #4 AC を #N・本文・checked 状態の並びで保持し、health（正常/縮退）と不足フィールドを保持する
<!-- AC:END -->
