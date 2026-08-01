---
id: TASK-82
title: メニューをタイトルバーへ統合できるか判断する
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - swimlane
  - 'kind:research'
milestone: m-3
dependencies: []
priority: low
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
スイムレーンのメニューをアプリのタイトルバーへ統合できないか調べる。Tauri で行うには decorations:false にして自前のタイトルバーを描くことになり、macOS・Windows・Linux の 3 環境ぶんのウィンドウ操作（ドラッグ移動・最大化・閉じる・信号機ボタンの位置）を自前で持つ必要がある。TASK-66 で「プロジェクト別スイムレーン」見出し横に件数を出す代替を満たしているため公開阻害ではない。調査の結果として実装しない判断も成果とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3 環境それぞれの実装コストと副作用（OS 標準のウィンドウ操作が失われる範囲）が書かれている
- [ ] #2 統合する／しないの判断と理由が記録されている
- [ ] #3 統合する場合の実装タスクが起票されている
<!-- AC:END -->
