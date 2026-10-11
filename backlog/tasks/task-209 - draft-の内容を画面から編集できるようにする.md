---
id: TASK-209
title: draft の内容を画面から編集できるようにする
status: To Do
assignee: []
created_date: '2026-10-11 19:31'
labels:
  - 'kind:feature'
milestone: m-4
dependencies:
  - TASK-208
priority: medium
ordinal: 200700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.51.0 で draft edit が新設された。task edit と同じ 48 オプションを持ち、位置引数は draft の id 1 個である。status は Draft だけを受け付け、それ以外を渡すと Invalid status で終了コード 1 になる（2026-10-12 に v1.53.0 で実測）。doc-5 §3.3 は draft の内容編集を出さない理由を「CLI に draft を対象にした task edit 相当が無い」としており、画面（文言表の draftReadOnly）も同じ理由を述べている。decision-48 はこれを提供すると決めた。最低バージョン要件が v1.51.0 になってから着手する（TASK-208）。active タスクの編集セッション（doc-8 §6）を draft に開く範囲、status を編集欄から外すこと、doc-9 §4 の更新前競合の検出が draft の管理ファイルにも掛かることを、doc-5 §3.3 と doc-8 §6.5 の改訂として決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 draft の title・description・AC・References などを、タスク詳細から draft edit で保存できる。status は編集欄に出さない
- [ ] #2 doc-5 §3.3・§3 の表と doc-8 §6.5 が改訂され、draftReadOnly の理由文が draft の内容編集についての真の文になっている
- [ ] #3 draft の保存も doc-9 §4 の更新前競合の検出を通る
- [ ] #4 update.rs の allowed_options に draft edit の行があり、操作写像の検査がそれを通す
<!-- AC:END -->
