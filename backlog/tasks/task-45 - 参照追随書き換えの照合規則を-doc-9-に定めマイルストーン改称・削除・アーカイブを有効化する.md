---
id: TASK-45
title: 参照追随書き換えの照合規則を doc-9 に定めマイルストーン改称・削除・アーカイブを有効化する
status: In Review
assignee: []
created_date: '2026-07-27 23:53'
updated_date: '2026-07-31 07:52'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-40
  - TASK-55
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-9 §4.2 は参照追随書き換え（milestone rename／remove --task-handling clear|reassign）の書き換え対象集合をどう照合するか定めておらず、境界（sync.rs の operation_target）はこれらを照合不能として CLI 起動前に拒否する。milestone archive も読み取り層がマイルストーンのファイルパスを持たないため同様に拒否される。このため TASK-40 の GUI はマイルストーン作成のみを発行でき、改称・削除・アーカイブは入口を無効化して理由を表示している（TASK-40 AC #5 は未達）。doc-9 §7 が挙げる拡張点（対象集合を読み取り時点のドメインモデルから決める規則と、集合に対する照合の合否規則）を定め、実装と GUI 入口の有効化までを行う。

GUI 側の入口は、画面設計案の反映で TASK-55（プロジェクト詳細画面、doc-10）へ移った。doc-10 §6 は、これら 3 操作を「無効化されたボタン」ではなく提供しない操作区画（名称・CLI 写像先・理由の 3 点）に置くと定めている。有効化とは、この区画から 3 項目を外して操作として出すことを指す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-9 §4.2 を拡張し、マイルストーン操作の書き換え対象集合の決定規則と照合の合否規則を定める（全件一致か、版ずれしたタスクだけを更新前競合として提示するか）
- [x] #2 読み取り層がマイルストーンのファイルパスを保持し、fan-out を伴わない操作（rename --no-update-tasks・remove --task-handling keep・archive）を 1 対 1 照合できるようにする
- [x] #3 sync.rs の operation_target を拡張後の規則に合わせ、照合不能で拒否する範囲を規則が定めた範囲だけに狭める
- [x] #4 プロジェクト詳細画面（doc-10 §6）のマイルストーン区画で改称・削除・アーカイブを有効化し、提供しない操作区画から該当 3 項目を外す（削除は --task-handling <clear|keep|reassign>、reassign では --reassign-to <milestone> を必須入力として渡す）
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
doc-9 §4.2 を拡張し（4.2.1〜4.2.4 へ分割）、マイルストーンの改称・削除・アーカイブを境界と GUI の双方で有効化した。

規則の土台は v1.47.1 の実測（2026-07-31、使い捨てルートで各操作を実行し mtime・サイズ・内容ハッシュで変化を確認。doc-9 §4.2.1 に表として記録）。ヘルプの文面と実際の書き換えが食い違う点が 3 つあり、これが決定規則を決めた:
- 参照の照合は id 完全一致に限らず、title の前後空白・大文字小文字を無視した一致でも成立する（読み取り層の参照解決は id 完全一致のみなので範囲が違う。内部空白の差異では一致しないことも確認）。
- 書き換えは tasks/（アクティブ）に限られ、drafts/・completed/・archive/tasks/ は同じ値を持っていても書き換わらない。
- rename は id を変えないため、値が id のタスクは「更新した」と報告されてもファイルは変わらない。remove はファイルを消さず archive/milestones/ へ移す（archive と同じ）。

決定規則（doc-9 §4.2.2）: 書き換え対象集合 = マイルストーンのファイル + 参照追随書き換えを伴う 3 操作（rename（--no-update-tasks なし）・remove --task-handling clear|reassign）でのみ参照タスク集合。残る 3 操作（rename --no-update-tasks・remove --task-handling keep・archive）は 1 対 1 照合。集合は CLI が書き換えうるファイルの上界として取り、CLI が実際には書き換えないファイル（値が id のタスク）も含める（書き換えを省く条件は v1.47.1 の挙動であって契約ではないため）。

合否規則（doc-9 §4.2.3）: 全件一致（1 件でも版ずれなら CLI 非起動）に加え、参照追随の 3 操作では未読タスクファイル（アクティブなタスクのディレクトリに在るのに読取版指標を持たないファイル）が無いことを求める。参照タスク集合がモデル依存であるため、読み取り後に増えたタスクは集合にも照合にも入らず、利用者が見て決めた対象と実際に書き換わる対象が食い違うため。無関係な新規タスクでも拒否になる（偽の競合。再読込 1 回で解消）。拒否時は版ずれと未読の両方を全件挙げる。

実装:
- domain::Milestone に source_path を追加し read_milestones が記録（Document と同じ facet）。1 対 1 照合の 3 操作がこのパスを対象にする（AC #2）。
- sync.rs: TargetResolution を 4 値化（NoExistingFile / Checkable(Vec) / ReferenceFollowing(Vec) / Unresolvable）。ReferenceFollowing のみ SyncState::unread_task_files（ScanDir::Tasks の走査と読取版指標の差分）を課す。guarded_update は最初の不一致で打ち切らず全件収集し、GuardedUpdate::Conflict{diverged, unread} を返す（AC #3）。照合不能は v1.47.1 の操作では発生しなくなり、モデルに無い operand の場合だけ残る。
- 境界・フロントの競合形は path: string から ConflictSet{diverged, unread} へ広げ、文面は mark.ts の conflictSetDetail 1 箇所に集約（doc-9 §4.2.3-3 の「全件挙げる」を提示側で担保）。
- manage.ts: referencingTasks（参照タスク集合を画面用に同じ規則で算出）・followsReferences（built operation から fan-out の有無を判定するので、表示と発行がずれない）・buildMilestoneRename/Remove/Archive。削除は --task-handling を未選択のまま発行できない（doc-10 §6 の必須の選択）。改称は現在名と CLI 基準で同一なら発行しない。WITHHELD_MILESTONE_OPERATIONS は説明編集 1 件だけになった（AC #4）。
- ProjectDetail.svelte: 各マイルストーンに改称・削除・アーカイブを置き、発行前に書き換え対象集合（マイルストーンのファイルと参照タスク件数・一覧）を出す。削除がファイルを消さないこと、keep が解決先の無い値を残すことを画面に書く。

検証: cargo test 261 件・clippy -D warnings・fmt clean、vitest 358 件、svelte-check 0 errors、vite build 成功。Tauri アプリを起動しての目視確認は行っていない（GUI 操作を自動化する手段がこのセッションに無いため）。
<!-- SECTION:NOTES:END -->
