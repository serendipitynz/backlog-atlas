---
id: TASK-94
title: 規模別の起動時間・再読込時間・thread 数を計測する
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
labels:
  - performance
  - 'kind:research'
milestone: m-3
dependencies: []
priority: low
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
workspace_open は登録順に全プロジェクトを直列で開き、各ルートで config・milestones・documents・decisions・tasks・drafts・completed・archive を読んで参照を解決する。起動時間は全登録ルートの管理ファイル数と filesystem 待ちの合計になる。監視通知は変更ファイル数にかかわらず対象ルート全体を再読込し、ReloadEvent でプロジェクト snapshot 全体をフロントエンドへ送り、フロントエンドは rows・全タスク一覧・facet・件数を再計算して各セルを再ソートする。この方式は一貫性が分かりやすく cache invalidation を避けられるが、1 ルートに数千件、多数ルートの同時監視、外部ツールが短い間隔で書き続ける場合に I/O と再計算が目立つ。監視は 1 ルートごとに debounce thread と watch loop thread が少なくとも 2 本あり、ルート数に比例して増える。現状で遅いという実測は無いので、部分再読込のような設計を複雑にする変更の前に計測を置く。_sandbox/repository-quality-assessment-2026-08-01.md のパフォーマンス節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ルートごとのファイル数・読取時間・snapshot サイズ・フロントエンド再計算時間が測れる
- [ ] #2 多数ルート登録時の thread 数と notify watcher 数が測れる
- [ ] #3 計測結果から、部分再読込や監視イベント集約が必要かどうかの判断が記録されている
<!-- AC:END -->
