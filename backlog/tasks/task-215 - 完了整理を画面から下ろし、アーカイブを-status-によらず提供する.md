---
id: TASK-215
title: 完了整理を画面から下ろし、アーカイブを status によらず提供する
status: To Do
assignee: []
created_date: '2026-11-11 02:40'
updated_date: '2026-11-11 02:42'
labels:
  - 'kind:bug'
milestone: m-4
dependencies:
  - TASK-208
priority: high
ordinal: 206700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-213 の実測（2026-11-11）で、Done のタスクの閉じ方が CLI の版で逆転していることが分かった。v1.50.1 から v1.53.0 までは、Done のタスクに対して task complete だけが通り、task archive は「Done tasks should be completed, not archived」で終了コード 1 になる。v1.54.0 で task complete が削除され、それ以降は task archive だけが status によらず通る。edit.ts の transitionOffers は、アーカイブを status によらず押せる状態で出し、完了整理を Done のときだけ押せる状態で出している。そのため Done のタスクには、どの版でも必ず失敗する操作が 1 つ画面に出ている。

TASK-213 の決定で、最低バージョン要件を v1.54.0 へ上げ（TASK-208）、完了整理を画面から下ろし、アーカイブを status によらず提供することになった。本タスクは、TASK-208 が最低バージョン要件を上げた後に、操作写像（update.rs の TaskComplete、wire.ts、edit.ts）と文言表から完了整理を取り除き、アーカイブの確認文を v1.54.0 以降の挙動（id とリンクを保つ）に合わせる。

update.rs の UpdateOperation::TaskArchive の註は「succeeds regardless of status」と述べており、v1.53.0 以前では偽だった（TASK-213 の実測）。v1.54.0 以上を最低バージョン要件にした後では真になるが、書き換える行の隣にあるので、本タスクで doc-5 §3 と照らして直す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タスク詳細の状態遷移に完了整理が出ず、update.rs・wire.ts・edit.ts・文言表の両言語から task complete の経路が無くなっている
- [ ] #2 Done のタスクでアーカイブが押せ、v1.54.0 以上の CLI で成功する
- [ ] #3 アーカイブの確認文と効果の説明が、v1.54.0 以降の挙動（id と References・dependencies を保つ）と食い違っていない
- [ ] #4 wire-fixtures と invoke-signature の検査が、操作の削除を反映して通る
- [ ] #5 上の 1 と 2 を入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->
