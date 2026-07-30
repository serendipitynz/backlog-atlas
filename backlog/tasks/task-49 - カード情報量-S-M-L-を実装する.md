---
id: TASK-49
title: カード情報量 S/M/L を実装する
status: Done
assignee: []
created_date: '2026-07-28 23:15'
updated_date: '2026-07-30 12:06'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-46
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-7 §3 は、タスクカードの固定項目表を、カード情報量（S・M・L）による割当表へ改めた。可変長の項目（通常ラベル・assignee）はカードの行数を予測できなくするため L 限定とし、S・M では title の行数を保証する。状態の印（縮退・版ずれ・保存区分・未対応列の原文 status）はどの段でも落とさない。落とすと、問題のあるタスクが正常なカードに見えるためである。設定値はアプリ設定（decision-13）に持つ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-7 §3 の割当表どおりに、段ごとに Type・通常ラベル・assignee の表示が増減する
- [x] #2 状態の印は S・M・L のいずれでも落とさない
- [x] #3 title の行数が段ごとに 1 行・2 行・3 行で切り詰められる
- [x] #4 選択した段がアプリ設定へ永続し、既定は M である
<!-- AC:END -->
