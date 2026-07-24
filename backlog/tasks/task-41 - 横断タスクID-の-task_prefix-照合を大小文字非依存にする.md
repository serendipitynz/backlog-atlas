---
id: TASK-41
title: 横断タスクID の task_prefix 照合を大小文字非依存にする
status: To Do
assignee: []
created_date: '2026-07-24 00:21'
updated_date: '2026-07-24 00:21'
labels:
  - 'kind:bug'
milestone: m-1
dependencies: []
references:
  - src-tauri/src/ledger.rs
  - src-tauri/src/read.rs
documentation:
  - doc-3
  - doc-4
priority: medium
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
台帳の横断タスクID 検査（doc-3 §5.2）が task_prefix を大小文字を区別して照合するため、Backlog CLI の既定初期化で作られたルートが自身のタスク ID を弾く。v1.47.1 実測で backlog init --defaults は config.yml に task_prefix: "task"（小文字）を書く一方、生成される ID は TASK-N（大文字）であり、parse_cross_task_id("<slug>:TASK-1", "task", None) が InvalidTaskId を返す。読み取り層（TASK-28）は同じ問題に当たり独自の大小文字非依存判定を持つが、台帳側は当該 PR の範囲外として据え置いた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src-tauri/src/ledger.rs の task_prefix 照合を大小文字非依存にし、task_prefix: "task" のルートで TASK-N の横断タスクID が生成・解析できる
- [ ] #2 task_prefix が小文字・ID が大文字のケースの回帰テストを追加する
- [ ] #3 ledger.rs と read.rs の接頭辞判定ヘルパを共有するか別々に保つかを、doc-3 §5.2（横断タスクID 契約）と doc-4 §3.4（保存区分との整合）が別契約である点を踏まえて判断し、根拠を Implementation Notes に記録する
<!-- AC:END -->
