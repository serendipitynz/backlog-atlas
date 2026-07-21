---
id: TASK-16
title: タスク保存区分をドメインモデルに持たせ、スイムレーン既定表示を active に限定する
status: Done
assignee: []
created_date: '2026-07-21 20:40'
updated_date: '2026-07-22'
labels:
  - 'kind:bug'
milestone: m-0
dependencies:
  - TASK-5
  - TASK-11
documentation:
  - doc-4
  - doc-7
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4:26 の走査は tasks に加え drafts/completed/archive も対象にするが、ドメインモデルにタスク保存区分（active/draft/completed/archive など）が無い。そのまま doc-7:23 のスイムレーンへ渡すと、完了整理済み・アーカイブ・draft のタスクが通常の進捗カードに混入する。保存区分をモデルへ追加し、スイムレーンは active task のみを既定表示にする。（設計レビュー P1）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-4 のドメインモデルにタスク保存区分（走査元ディレクトリ由来）を定義している
- [x] #2 読み取り層が各タスクへ保存区分を付与する規則を定義している
- [x] #3 doc-7 スイムレーンが既定で active task のみ表示し、他区分の扱いを定義している
<!-- AC:END -->
