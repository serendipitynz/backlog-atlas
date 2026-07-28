---
id: TASK-45
title: 参照追随書き換えの照合規則を doc-9 に定めマイルストーン改称・削除・アーカイブを有効化する
status: To Do
assignee: []
created_date: '2026-07-27 23:53'
updated_date: '2026-07-27 23:54'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-40
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-9 §4.2 は参照追随書き換え（milestone rename／remove --task-handling clear|reassign）の書き換え対象集合をどう照合するか定めておらず、境界（sync.rs の operation_target）はこれらを照合不能として CLI 起動前に拒否する。milestone archive も読み取り層がマイルストーンのファイルパスを持たないため同様に拒否される。このため TASK-40 の GUI はマイルストーン作成のみを発行でき、改称・削除・アーカイブは入口を無効化して理由を表示している（TASK-40 AC #5 は未達）。doc-9 §7 が挙げる拡張点（対象集合を読み取り時点のドメインモデルから決める規則と、集合に対する照合の合否規則）を定め、実装と GUI 入口の有効化までを行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc-9 §4.2 を拡張し、マイルストーン操作の書き換え対象集合の決定規則と照合の合否規則を定める（全件一致か、版ずれしたタスクだけを更新前競合として提示するか）
- [ ] #2 読み取り層がマイルストーンのファイルパスを保持し、fan-out を伴わない操作（rename --no-update-tasks・remove --task-handling keep・archive）を 1 対 1 照合できるようにする
- [ ] #3 sync.rs の operation_target を拡張後の規則に合わせ、照合不能で拒否する範囲を規則が定めた範囲だけに狭める
- [ ] #4 TASK-40 の管理画面で改称・削除・アーカイブの入口を有効化する（削除は --task-handling <clear|keep|reassign>、reassign では --reassign-to <milestone> を必須入力として渡す）
<!-- AC:END -->
