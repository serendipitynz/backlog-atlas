---
id: TASK-14
title: 同一 Backlog ルート更新時の競合検出と再読み込みを設計する
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 10:34'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-9
  - TASK-5
documentation:
  - doc-2
  - doc-1
  - doc-9
priority: medium
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
同じ Backlog ルートを複数ウィンドウまたは複数プロセス（他の backlog 操作を含む）が更新する場合の競合検出と再読み込み方法を設計する。Atlas 側のファイル監視・再読み込み契機、更新アダプター実行前後の整合確認を含む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 外部変更の検出契機（ファイル監視・更新後の再読み込みなど）を定義している
- [x] #2 更新アダプター実行前後の競合検出と再読み込みの流れを定義している
- [x] #3 検出した競合を利用者へ提示する方針を定義している
<!-- AC:END -->
