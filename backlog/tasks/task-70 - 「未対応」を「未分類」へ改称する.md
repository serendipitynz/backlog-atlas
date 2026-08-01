---
id: TASK-70
title: 「未対応」を「未分類」へ改称する
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - swimlane
  - terminology
  - 'kind:refactor'
milestone: m-2
dependencies: []
documentation:
  - backlog/decisions/decision-4 - status-はプロジェクト個別を許し正準ステータス列へ対応づける.md
priority: high
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
列対応規則でどの正準ステータス列にも対応づかなかった status とその置き場を「未対応」と呼んでいるが、status の値そのものは欠けていないので誤りである。Atlas が分類できなかったことを表す「未分類」へ改める。公開語彙なので、公開後に直すと互換の話になる。改称対象は decision-4・doc-7・doc-11・doc-12 の該当箇所と、実装の表示文字列（swimlane.ts の UNMAPPED_LABEL とその周辺の説明文）。コード識別子の unmapped は指示対象が変わらないため据え置いてよいが、判断を doc に残す。なお現在この列が見えないのは未実装ではなく、該当タスクが 1 件も無い間は列を出さない設計（doc-7 §2.2）による。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision-4・doc-7・doc-11・doc-12 の「未対応 status」「未対応区画」「未対応列」が「未分類」系へ改められている
- [ ] #2 画面に出る文字列が「未分類」になっている
- [ ] #3 コード識別子を据え置く／変える判断とその理由が doc に記録されている
- [ ] #4 該当タスクが 1 件も無い間は列が出ない挙動が変わっていない
<!-- AC:END -->
