---
id: TASK-36
title: タスク詳細の GUI 編集（編集部品・IME・明示保存・保存区分別可否）を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-22 12:33'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-31
  - TASK-32
  - TASK-35
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §6 の設計に従い、タスク詳細からの編集操作を実装する。すべて Backlog 更新アダプター（doc-5）経由で発行し、管理ファイルを直接書き換えない。元要望中核である GUI 編集操作（複数行・選択・置換・全選択・IME 安全性・明示保存）を満たす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 編集部品は textarea を基本形とし Ace へ昇格する（Ace 読込失敗時も textarea で編集継続でき、操作は変わらない）
- [ ] #2 IME の composition 中の Enter を確定に消費し、Enter を保存に割り当てない（改行と保存を分ける）
- [ ] #3 保存は doc-5 の操作写像へ発行し、CLI 失敗時は表示を変えず理由を示し未保存入力を保持して再試行できる
- [ ] #4 保存時に更新前競合検出を通し、保存区分別（active/draft/completed・archive）に提供操作を能動化・無効化する
- [ ] #5 明示保存（ボタン/Cmd/Ctrl+Enter）とキャンセル（破棄前確認）で編集セッションの未保存入力を扱う
- [ ] #6 GUI は doc-5 の制約を先取りする: References は既存を含む非空全集合で置換し最後の1件削除を無効化、AC 全体差し替え（複合）と項目単位操作を区別、マイルストーン説明更新など非対応操作は最初から提示しない（アダプタで後追い拒否にしない）
- [ ] #7 競合時は未保存入力を保持し、(i)最新を再読込してやり直す (ii)入力を保持して最新版へ再適用する の2経路を提示し、防げる競合と照合後競合窓の事後通知を区別する（doc-9 §5・doc-8 §6.4）
- [ ] #8 active には状態遷移の入口 task demote/task archive/task complete を提供し（task complete は status が Done のときのみ能動化、非 Done は理由付き無効化）、draft には draft promote/draft archive を提供、completed・archive は内容編集を出さず読み取り専用にする（doc-8 §6.5・doc-5 §3.2/§3.3）
<!-- AC:END -->
