---
id: TASK-103
title: 多言語対応（英語・日本語）を実装する
status: To Do
assignee: []
created_date: '2026-07-31 23:35'
updated_date: '2026-08-01 00:38'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-79
priority: medium
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
UI の文言を英語と日本語で切り替えられるようにする。m-2 の UI 改修（TASK-61〜80）で文言そのものが動くため、文言が固まる前に抽出すると同じ箇所を 2 度触ることになる。v0.1.0 の対象利用者は日本語で、README は既に和英そろっているので、UI 改修が終わった後に 1 度だけ抽出するほうが総コストが低い。切替は既定を OS の言語に追随させ、アプリ設定で永続する（テーマと同じ方式）。抽出漏れを検出する手段を含める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 全画面の文言が外部化され、英語と日本語で切り替わる
- [ ] #2 既定が OS の言語に追随し、選択がアプリ設定に永続する
- [ ] #3 抽出漏れの文言を検出する手段がある
- [ ] #4 production dependency を増やすかどうか判断され、増やす場合は理由が記録されている
- [ ] #5 英語表示で 1280x800 のレイアウトが崩れない
<!-- AC:END -->
