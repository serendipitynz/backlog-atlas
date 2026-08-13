---
id: TASK-164
title: 画面全体の文字サイズと本文の可読性を見直す
status: To Do
assignee: []
created_date: '2026-08-13 08:34'
labels:
  - ui
  - readability
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 157700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-118 の実機目視 (2026-08-13) 由来。ユーザーが backlog browser と Atlas を並べて比較し、**「マークダウンのレンダリングは正直 backlog browser の方が読みやすい。Atlas は全体的にテキストサイズが小さい」** と述べた。**ユーザーが「別タスクで調整したい」と明示している。**

対象は 1 画面ではない。本文の整形表示 (doc-8 §9・doc-11 §14) はタスク詳細・文書・マイルストーン・決定事項の 4 か所が同じ規則を引いており、文字サイズは `app.scss` と各コンポーネントに散っている。**どこが基準の 1 か所なのかを先に数える** — doc-11 §2.2 の寸法段階が文字サイズを持っているか、持っていないなら「実装が何か所で別々に決めているか」を数えるところから始める (TASK-141 がフォーム部品の高さで踏んだ型)。

**比較対象の実物がある**: backlog browser を同じ台帳で開けばよく、ユーザーが画面写真を出せる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 文字サイズを決めている箇所を実装から数え上げ、基準の置き場を 1 か所に決めて doc-11 へ書いた
- [ ] #2 整形表示の本文について、変更前後の寸法を実エンジンで測って記録した (行の高さ・段落間・見出しとの比)
- [ ] #3 4 か所 (タスク詳細・文書・マイルストーン・決定事項) すべてに同じ基準が効いていることを検査で保つ
- [ ] #4 ユーザーの目視で backlog browser と並べて読みやすさを確認した
<!-- AC:END -->
