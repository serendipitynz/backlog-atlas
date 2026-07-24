---
id: TASK-42
title: 不正な status 別名の未対応化を台帳 load から解釈まで一貫させる
status: To Do
assignee: []
created_date: '2026-07-24 04:01'
labels:
  - 'kind:bug'
milestone: m-1
dependencies: []
priority: medium
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
status 別名表（doc-3 §3.3）の値が正準4列でないとき（例: 手編集した Done = "Shipped"）、doc-3 §3.3 は「不正として無視し、当該 status を未対応として扱う」と定める。現状はこの規則が台帳層と解釈層で食い違い、実経路（load→sanitize→interpret）では未対応化に到達しない。

TASK-26 実装（ledger.rs validate_and_sanitize）は不正な別名値をキーごと削除する（status_aliases.retain(|_, v| is_canonical_status(v))）。TASK-29 実装（interpret/status.rs map_status）は別名が無ければ名称一致へフォールバックする。したがって Done = "Shipped" のエントリでは、load 時に Done キーが消え、interpret では別名不在として Done が名称一致で Done 列へ配置される。doc-3 §3.3 の「当該 status を未対応にする」が効かない。

TASK-29 の PR #5 で Codex が [P2] として指摘。TASK-29 の AC 範囲外（解釈層のコメントは実態どおり修正済み）のため、doc-3 §3.3 と TASK-26 AC #5（値は正準4列に限る）の突き合わせを含めて本タスクで扱う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 load→sanitize→interpret の実経路で、正準4列でない別名値を持つ status が未対応（column None）かつ強い縮退印になることを保証する
- [ ] #2 台帳層で不正別名をキーごと削除する現行実装（TASK-26）と、doc-3 §3.3「不正として無視し当該 status を未対応にする」の突き合わせを行い、削除する／別名不正として保持する／load を拒否する のいずれを採るか根拠を Implementation Notes に記録する
- [ ] #3 実経路（LoadedLedger::load を通す）を検証する統合回帰テストを追加する
- [ ] #4 TASK-26 AC #5「status_aliases の値は正準4列のいずれかに限る」の解釈（保持するが無効化する等）と齟齬がないことを確認する
<!-- AC:END -->
