---
id: TASK-5
title: Backlog ルートのドメインモデルと読み取り層を設計する
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 09:39'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-3
documentation:
  - doc-2
  - doc-1
  - doc-4
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog ルートから読むタスク・設定・マイルストーン・文書のドメインモデルと読み取り層を設計する。読み取り方式の decision（TASK-3）に従い、frontmatter/本文/AC/References/labels を Atlas 内部表現へ写像する。エラー時（不正な frontmatter、欠損ファイル）の扱いを含む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タスク・設定・マイルストーン・文書の内部表現と、Backlog 管理ファイルからの写像を定義している
- [x] #2 labels から Type と通常ラベルを分離する境界を読み取り層に位置づけている
- [x] #3 解析エラー・欠損時の扱いを定義している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ドメインモデル（タスク・設定・マイルストーン・文書の型定義）と読み取り層（config.yml 解決→ディレクトリ走査→frontmatter+SECTION 解析→ドメインモデル構築、現在 checkout 限定・読み取り専用）を分離して定義。タスク項目は id/title/status/type/通常ラベル/assignee/priority/ordinal/milestone/日付/dependencies/references/description/AC(#N と checked)/plan/notes/health を frontmatter・SECTION から写像。labels→Type と通常ラベルの分離境界を読み取り層に位置づけ（kind: 接頭辞で分離、Type 値の導出規則は TASK-8、未確定間は kind 生値を Type 候補として保持）。エラーは解析不能・想定外スキーマ・参照欠損・ルート読取不能の 4 事象に分け、破棄せず health＋不足内容を保持して縮退表示へ回す。ルート致命はルート読取不能として台帳エントリ単位に分離し他プロジェクトへ波及させない。設計は doc-4。
<!-- SECTION:NOTES:END -->
