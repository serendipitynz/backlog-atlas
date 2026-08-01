---
id: TASK-101
title: バージョンタグからのリリースワークフローを作る
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 01:52'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-95
  - TASK-96
  - TASK-99
  - TASK-100
  - TASK-104
priority: high
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
~/Projects/_snz/mallow の .github/workflows/release.yml を範に、v* タグの push（または手動実行）で draft release を作り、matrix ビルドで各プラットフォームのバンドルを release id 指定でアップロードする構成にする。mallow は tauri.conf.json の version とタグの食い違いをビルド前に落とす検査、release id 指定で matrix が release 作成を競合しない構成、.github/release.yml でのリリースノート分類も持っているので、そこも踏襲する。バンドルの対象プラットフォームは TASK-99 の判断結果に従う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 v* タグの push で draft release が作られ、各プラットフォームのバンドルが添付される
- [ ] #2 タグと tauri.conf.json / package.json の version が食い違う場合、ビルド前に失敗する
- [ ] #3 matrix ジョブが release 作成で競合しない
- [ ] #4 リリースノートがマージ済み Pull Request から生成される
- [ ] #5 手動実行でも同じ結果になる
- [ ] #6 CI が Node の版を直書きせず node-version-file: .node-version を読む
<!-- AC:END -->
