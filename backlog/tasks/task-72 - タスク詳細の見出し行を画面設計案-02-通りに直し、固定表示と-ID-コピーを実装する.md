---
id: TASK-72
title: タスク詳細の見出し行を画面設計案 02 通りに直し、固定表示と ID コピーを実装する
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 00:43'
labels:
  - ui
  - task-detail
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-67
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: high
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク ID を含む見出し行を画面設計案 02 の構成（ID・title・主要属性・日付・前後移動）に直し、中身をスクロールしても常に見えるよう固定する。doc-8 が ID コピーを URL の代替と位置づけているのに、スクロールで消えるのは導線として成立していない。コピーは ID の右横に lucide clipboard を置き、押下で横断タスクID（<project-slug>:<TASK-ID>）をコピーする。成功時はアイコンが clipboard-check に変わり、テーマの成功色へ一定時間変化してフェードアウトする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 見出し行の構成が画面設計案 02 と一致している
- [ ] #2 3 配置すべてで、中身をスクロールしても見出し行が常に見える
- [ ] #3 ID 右横の clipboard アイコン押下で横断タスクID がクリップボードへ入る
- [ ] #4 コピー成功時にアイコンが clipboard-check へ変わり、成功色になってフェードアウトし、元へ戻る
- [ ] #5 成功色を decision-12 の色値一式へ足すか既存の --info で代替するかの判断が記録され、足す場合は収録 10 テーマすべてに値があり src/lib/theme.test.ts が全ブロックの変数の揃いを検査する
<!-- AC:END -->
