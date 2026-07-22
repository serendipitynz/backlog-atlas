---
id: TASK-35
title: タスク詳細画面の表示系（Type/References/PR/Git 履歴/縮退）を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-22 12:07'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-30
  - TASK-33
  - TASK-34
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §3-5 の設計に従い、1タスクの全項目を1画面で見せる詳細画面の表示系を実装する。読み取りはドメインモデルから写し、Git・PR 参照は doc-6 の出力を用いる。単一プロジェクト文脈だが見出しには横断タスクID を併記する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 見出しに横断タスクID+title・status（正準対応併記）・priority・assignee・milestone を出す
- [ ] #2 Type と通常ラベルを別区画に分離し、Pull Request URL を References と分離して独立表示する
- [ ] #3 Description・AC（checked 可視化）・実装計画/ノート・dependencies（未解決印）を表示する
- [ ] #4 Git 履歴欄にコミット一覧（新しい順）と関連 PR を出し、0件時は対応コミット無しを示す
- [ ] #5 縮退時は判別できた項目のみ出して不足を明示し、参照系はどの保存区分でも読み取り表示する
<!-- AC:END -->
