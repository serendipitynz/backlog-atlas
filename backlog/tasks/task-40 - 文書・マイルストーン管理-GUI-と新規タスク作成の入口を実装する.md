---
id: TASK-40
title: 文書・マイルストーン管理 GUI と新規タスク作成の入口を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:29'
updated_date: '2026-07-22 12:33'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-31
  - TASK-33
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5 §3.2 の文書・マイルストーン操作と task create に対応する利用者向け GUI の入口を実装する。すべて Backlog 更新アダプター（TASK-31）経由で発行し、管理対象 Markdown を GUI から直接書き換えない（doc-2）。公開は TASK-33 のコマンド境界を用いる。v1.47.1 CLI に無い操作は入口を設けない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新規タスク作成の入口を GUI に設け、doc-5 の task create 写像へ発行する（title/description/status/labels/priority/milestone/AC）
- [ ] #2 文書の作成（title/type/path）と更新（title/本文全置換/type/path/tags）を GUI から発行し、本文は全置換のみで部分編集は全文を渡すことに帰着させる（doc-5 §3.2）
- [ ] #3 作成後のマイルストーン説明編集は CLI 経路が無いため GUI に出さず、制約由来と分かる表示にする（doc-5 §3.1・§3.2）
- [ ] #4 すべて更新アダプター（TASK-31）経由で、管理対象 Markdown を GUI から直接書き換えない（doc-2）
- [ ] #5 マイルストーンの作成（名称・作成時の説明）・改称・削除（--task-handling <clear|keep|reassign>、reassign 選択時は --reassign-to <milestone> を必須入力として渡す）・アーカイブを GUI から発行する（doc-5 §3.2）
<!-- AC:END -->
