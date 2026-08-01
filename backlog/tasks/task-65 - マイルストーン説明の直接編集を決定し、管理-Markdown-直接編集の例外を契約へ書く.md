---
id: TASK-65
title: マイルストーン説明の直接編集を決定し、管理 Markdown 直接編集の例外を契約へ書く
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - project-detail
  - decision
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-58
  - TASK-64
documentation:
  - backlog/docs/doc-5 - Backlog-更新アダプター-設計.md
  - backlog/docs/doc-9 - 同一-Backlog-ルート更新時の競合検出と再読み込み-設計.md
priority: high
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.47.1 の milestone は list/add/rename/remove/archive のみで update/edit が無く、説明は milestone add -d の作成時にしか設定できない（実測確認済み）。作成後に説明を直せないのは実運用で困るため、マイルストーンの Description 節に限って Atlas が管理 Markdown を直接書き換えることを認める。これは AGENTS.md §Updates と decision-2 の「更新は Backlog CLI へ委譲する」に対する契約変更であり、根拠を decision として残さずに実装してはならない。範囲は Description 節の本文のみとし、frontmatter（id・title）には触れない。書き込みは一時ファイル置換で原子的に行い、更新前に doc-9 の外部変更検出を通す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 例外の範囲・理由・書き込み方法・触らない範囲を定めた decision が backlog/decisions/ にある
- [ ] #2 AGENTS.md と AGENTS.ja.md の §Updates が同じ内容で改訂され、両者が矛盾しない
- [ ] #3 doc-5 と doc-10 の「作成後の説明の編集は提供しない」記述が改訂されている
- [ ] #4 説明の更新が Description 節だけを置き換え、frontmatter と他の節が 1 バイトも変わらない試験がある
- [ ] #5 更新前に外部変更を検出した場合は書き込まずバージョン不整合として返す試験がある
- [ ] #6 書き込み途中に失敗しても旧ファイルが残る試験がある
<!-- AC:END -->
