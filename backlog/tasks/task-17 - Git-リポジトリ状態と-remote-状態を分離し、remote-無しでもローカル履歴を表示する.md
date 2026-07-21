---
id: TASK-17
title: Git リポジトリ状態と remote 状態を分離し、remote 無しでもローカル履歴を表示する
status: Done
assignee: []
created_date: '2026-07-21 20:40'
updated_date: '2026-07-22'
labels:
  - 'kind:bug'
milestone: m-0
dependencies:
  - TASK-13
  - TASK-10
references:
  - backlog/decisions/decision-6 - 不在・欠損は対象不在・読取不能・該当なしを区別して表示する.md
documentation:
  - doc-6
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-6:15 は「remote が無い」を「Git 対象不在」に含めるが、doc-6:43 では remote が無くてもローカルコミット検索は成立する。現状では remote 未設定のローカルリポジトリで Git 履歴まで非表示になり、元要望の履歴参照が失われる。Git リポジトリ状態（対象不在/読取不能/該当なし）と remote 状態を分離して判定・表示する。（設計レビュー P1）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-6 の状態区分から remote 有無を独立させている
- [x] #2 remote 無しでもローカルコミット履歴を表示する方針を doc-6 に反映している
- [x] #3 remote 依存（PR 参照など）と非依存（ローカル履歴）の縮退範囲を区別している
<!-- AC:END -->
