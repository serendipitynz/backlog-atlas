---
id: TASK-85
title: 共通 mutex を分割し backlog 子プロセスへ終了期限を設ける
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
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AtlasState.lifecycle がアプリ全体に 1 個しかなく、台帳を変更するコマンドと、台帳エントリを読んだ後に workspace へ作用するコマンドが処理全体でこの mutex を保持する。update_apply は取得後に CLI 版確認・更新実行・更新後の再読込まで行い、SystemBacklog::run は Command::output() で子プロセスの終了を期限も取消もなく待つ。そのため backlog が停止するか長時間終了しないと、更新対象とは別のプロジェクトの再読込・開閉・手動再取得・更新、台帳の読取・登録・更新・登録解除、アプリ設定の読取・保存まで完了しない。commands.rs は同じ mutex を保持したまま無期限の gh を待つ危険を認識してそちらは回避しているのに、backlog では回避していない。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 1、推奨順 2。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 台帳の read-modify-write を守る mutex と、各プロジェクトの workspace 更新を守る mutex が分かれている
- [ ] #2 同じプロジェクトの台帳エントリ・workspace・読取時版の組合せは従来どおり守られている
- [ ] #3 backlog 子プロセスに終了期限があり、期限到達時に子プロセスを終了させて失敗として返す
- [ ] #4 停止する偽 CLI を使い、対象プロジェクトの更新待ち中でも別プロジェクトの読取とアプリ設定の読取が完了する試験がある
<!-- AC:END -->
