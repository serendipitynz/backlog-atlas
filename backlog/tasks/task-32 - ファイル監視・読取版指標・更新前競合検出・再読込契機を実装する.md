---
id: TASK-32
title: ファイル監視・読取版指標・更新前競合検出・再読込契機を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-24 23:55'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-28
  - TASK-31
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-9 の設計に従い、同一 Backlog ルートを別ウィンドウ・別プロセス・素の backlog が更新する場合の外部変更検出と再読み込みを実装する。Atlas は CLI をまたぐロックを持たず、読んだ版と実ファイルの一致を更新直前に確かめる楽観的検出に徹する（best-effort）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ルートの管理ファイル群をファイル監視で購読し、通知を短い時間窓で束ねて再構築単位で読み直す
- [x] #2 読取版指標（mtime・サイズ一次、必要時ハッシュ）を読むたびに記録する
- [x] #3 更新前競合検出で読取版指標と現ファイルが不一致なら CLI を起動せず競合を提示する
- [x] #4 CLI 成功後は再読込契機で対象を読み直し、ドメインモデルと読取版指標を更新する
- [x] #5 best-effort の限界（照合後競合窓での上書き喪失）を防げる競合と区別して扱う。監視は読み取り専用とする
- [x] #6 再読込契機は将来のブランチ切替など追加の再走査契機も同一経路で扱える構造にする（decision-3・TASK-28 の走査元境界と整合）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
同一 Backlog ルートの外部変更検出と再読込を src-tauri/src/sync.rs に実装した（read/update/history/ledger と並ぶ層）。crate API として公開し Tauri コマンド配線は TASK-33 に委ねる（update・history と同方針）。読取版指標は VersionStamp（mtime・サイズ・内容ハッシュ）を VersionIndex に保持し、RecordingSource デコレータが読み取り層の読取りと同時に stamp を採るため、指標はモデルが解析したバイト列そのものを指す（read_project 後に別パスで走査する当初実装は、その間の外部変更でモデル=版A・指標=版B となり照合が誤って InSync を返す窓があった＝レビュー [P1]）。照合はサイズ不一致を即 Conflict とし、サイズ一致時は必ず内容ハッシュで確定する。mtime は一次signal として記録するが判定の決め手にはしない（粗い mtime では同サイズ・同 mtime でも同長改変を隠しうるため、偽 InSync による上書きを避け偽 Conflict＝再読込を促すだけの安全側へ倒す）。再読込は SyncState::reload 一箇所に集約し ReloadReason（UpdateApplied・PartialUpdateFailed・ExternalChange）で契機を記録、source を引数に取るため将来のブランチ切替（decision-3）も同一経路に載る（AC #6）。guarded_update が照合→CLI 実行→再読込を一体化し、対象は呼出側任せにせずモデルから TargetResolution で内部導出する。三値（Checkable=タスク・draft・DocUpdate／NoExistingFile=作成のみ／Unresolvable=起動前に拒否）により、全操作が「照合済み」「正当に未照合」「拒否」のいずれかに必ず落ち、未照合で CLI に到達する経路が無い。文書照合のため domain::Document に source_path を追加した（doc update --content は本文全文置換のため未照合だと外部編集を上書きする）。マイルストーンの rename/remove は参照タスク群も書き換える fan-out があり doc-9 §4 が照合方法を定めていないため、規則を捏造せずこの境界で拒否した（有効化には doc-9 の拡張が必要＝後続課題）。再読込失敗は GuardError::Reload{applied} で「CLI 未実行・再試行安全」と「適用済み・再試行危険」を区別する。ファイル監視は notify 8（decision-11）でルートを再帰購読し、管理ファイル判定で無関係な変更を落とす。デバウンスは依存を増やさず自作の純粋ロジック（時刻注入で単体テスト可能）とし、need_rescan()・watcher エラーは WatchBatch::Rescan として観測可能にした（変更ファイルを特定できないときルートを読み直す doc-9 §3 の要求）。監視は書き込みを一切行わない（AC #5）。best-effort の限界（照合後競合窓での上書き喪失）は doc-9 §4.1 のまま保証水準として明記。PR #8 でレビュー3ラウンド: [P1] 上記の指標窓、[P1] サンドボックス macOS が FSEvents を配送しないため実監視 e2e テストを #[ignore]（サンドボックス外では pass、AC #5 は配送非依存の別テストで担保）、[P2] need_rescan/watcher エラー黙殺、[P2] 照合対象の呼出側依存、[P2] 再読込失敗時の適用済み情報喪失、[P2] 照合不能な更新を作成と同一扱い（三値化で解消）を修正。191 tests・clippy -D warnings・fmt clean で approved・merged。
<!-- SECTION:NOTES:END -->
