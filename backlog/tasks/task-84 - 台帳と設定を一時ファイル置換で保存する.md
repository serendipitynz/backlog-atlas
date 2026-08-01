---
id: TASK-84
title: 台帳と設定を一時ファイル置換で保存する
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:38'
labels:
  - robustness
  - rust
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
settings::save と LoadedLedger::save が保存先へ直接 std::fs::write する。std::fs::write は既存ファイルを切り詰めてから書くため、切詰め後に容量不足・プロセス強制終了・OS 障害が起きると、空または途中までの TOML が残り得る。projects.toml が壊れると登録済みの全プロジェクトを開けず（LoadedLedger::load は読めない台帳をエラーにする）、settings.toml が壊れると既定値で起動して保存済みのテーマ・カード密度・監視設定・外部エディタ指定が失われたように見える。プロセス内 mutex は同時読み書きを防ぐが、プロセス終了や OS レベルの書込み失敗から既存ファイルを守らない。同一ディレクトリに一時ファイルを作り、完全な TOML を書いて閉じた後に保存先へ置き換える。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 2、推奨順 1。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 台帳と設定の保存が一時ファイル作成→書込み→置換で行われる
- [ ] #2 必要とする耐久性の水準（ファイルと親ディレクトリの同期を行うか）が決まり、理由が記録されている
- [ ] #3 一時ファイル作成・書込み・同期・rename の各失敗を注入できる保存境界がある
- [ ] #4 失敗時に旧ファイルが変わらない試験が台帳と設定の両方にある
- [ ] #5 成功時に新ファイル全体だけが見える試験が台帳と設定の両方にある
<!-- AC:END -->
