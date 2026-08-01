---
id: TASK-87
title: gh 照会に終了期限・取消・同時実行上限を設ける
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
documentation:
  - backlog/docs/doc-6 - タスクID-からの-Git・Pull-Request-履歴参照-設計.md
priority: medium
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
history.rs は抽出した PR を iterator の map で 1 件ずつ同期的に解決し、意図的に期限を設けず gh api の終了を待つ。フロントエンドの history-read.ts は呼出しトークンで古い応答を画面状態へ保存しないが、バックエンドへ取消を伝える経路が無い。そのため通信または gh が終了しなければ履歴読込が完了せず、複数 PR を参照するタスクでは前の PR が終わるまで次を取れず、タスクを切り替えても画面に反映されない古い呼出しの子プロセスが残り、再取得は新しい照会を増やすだけで古い照会を止めない。この処理は共通 mutex を外して実行されるため全バックエンド操作は止めないが、履歴読込の完了性とプロセス資源の管理に問題が残る。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 4、推奨順 4。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gh 子プロセスを保持し、期限到達またはフロントエンドからの取消で終了させる
- [ ] #2 複数 PR を並列取得する場合に同時実行数の上限がある
- [ ] #3 タスク切替と再取得が古い子プロセスを終了する試験がある
- [ ] #4 期限到達が PR 単位の LookupFailed として表示され、他の PR の結果が維持される
<!-- AC:END -->
