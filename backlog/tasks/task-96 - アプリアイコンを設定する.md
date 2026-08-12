---
id: TASK-96
title: アプリアイコンを設定する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-12 00:02'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-95
priority: high
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src-tauri/icons が Tauri の既定素材のままである。Backlog Atlas のアイコンを用意し、tauri build が macOS の .icns、Windows の .ico、Linux の png、および Windows Store 用の Square*.png をすべて生成できる元画像から作る。tauri icon コマンドで派生させる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 元画像（1024x1024 以上）がリポジトリにある
- [x] #2 src-tauri/icons の全ファイルが元画像から生成されており、既定素材が残っていない
- [ ] #3 macOS・Windows・Linux の 3 環境でビルドしたバンドルにアイコンが反映されている
<!-- AC:END -->
