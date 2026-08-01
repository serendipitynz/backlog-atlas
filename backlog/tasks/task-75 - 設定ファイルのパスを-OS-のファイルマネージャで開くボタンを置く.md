---
id: TASK-75
title: 設定ファイルのパスを OS のファイルマネージャで開くボタンを置く
status: To Do
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - settings
  - 'kind:feature'
milestone: m-2
dependencies: []
priority: low
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
設定画面に設定ファイルのパスを出しているので、そのまま Finder（macOS）・エクスプローラ（Windows）・ファイルマネージャ（Linux）で開くボタンを添える。起動は TASK-44 で実装した OS 関連付け起動の経路を再利用し、シェル文字列を組み立てない。台帳ファイルのパスにも同じボタンを置くか判断する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 設定ファイルのパスの横に、OS のファイルマネージャで場所を開くボタンがある
- [ ] #2 起動が引数配列で行われ、シェル文字列を組み立てていない
- [ ] #3 ファイルが存在しない場合の表示が決まっている
- [ ] #4 台帳ファイルにも置くかどうかの判断が記録されている
<!-- AC:END -->
