---
id: TASK-28
title: 読み取り層（config 解決・走査・解析・保存区分・縮退）を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-27
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4 の設計に従い、台帳エントリが指す各 Backlog ルートを入力に、管理ファイルを解析してドメインモデルを構築する読み取り専用の層を実装する。書き込みは含まない。cross-branch は扱わず現在 checkout のみを対象とする（decision-2）。生成元の版に依存せず、スキーマ能力検査で読む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 config.yml を先に解決し、status 定義・task_prefix・ディレクトリ構成を得る
- [ ] #2 tasks/drafts/completed/archive/tasks/archive/drafts/milestones/docs/decisions を走査する（archive はネスト構造で辿る）
- [ ] #3 frontmatter（YAML）と SECTION/AC 区切り本文を解析し、走査元ディレクトリから保存区分を付与する
- [ ] #4 必須/任意/存在時構造検査の3分類でスキーマ能力検査を行い、任意項目の不在で正常タスクを縮退させない
- [ ] #5 解析不能・想定外スキーマ・参照欠損・ルート読取不能の4事象を区別し、1ファイルの事象を1タスクの縮退に閉じ込める
- [ ] #6 走査処理を差し替え可能な走査元境界に閉じ込め、cross-branch を現在 checkout に限定しつつ将来のブランチ切替を再走査契機にできる構造にする（decision-3）
<!-- AC:END -->
