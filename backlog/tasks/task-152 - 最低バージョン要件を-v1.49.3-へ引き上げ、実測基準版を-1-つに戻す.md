---
id: TASK-152
title: 最低バージョン要件を v1.49.3 へ引き上げ、実測基準版を 1 つに戻す
status: To Do
assignee: []
created_date: '2026-08-12 02:47'
updated_date: '2026-08-12 03:19'
labels:
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-154
priority: high
ordinal: 146700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-7 の最低バージョン要件を v1.48.0 から v1.49.3 へ引き上げる。2026-08-12 に TASK-99 のセッションで、ユーザーが 1.50.x を「公開から日が短すぎる」として採らず 1.49.3 まで上げると確定した（~/.npmrc の min-release-age=7 と同じ基準で、1.49.3 は公開 9 日・1.50.0 は 3 日）。decision-7 の「上限は固定しない」は動かさないので、1.50.x 利用者は従来どおり縮退の対象外のまま動く。技術的障害が無いことは TASK-99 のセッションで実測済みで、次の 4 点が根拠である。①Atlas が発行する 13 サブコマンド・34 オプション（update.rs の allowed_options）は v1.49.3 に全部存在し、削除も改名も 0 件。1.48.0 からの増分は task edit の --append-plan と doc create の --plain だけで、Atlas はどちらも発行しない ②管理ファイルの書式（frontmatter の鍵集合・SECTION マーカー・本文の並び）は同一で、読み取り層は影響を受けない ③doc-5 §3.1 が「CLI から行えない」と書いた 3 操作（--ref "" / --depends-on "" / -a "" の沈黙無変更）は v1.49.3 でも同じで、反転は v1.50.0 から。実バイナリで v1.48.0 と v1.49.3 の両方に同じ操作列を流して確認した ④doc-5 §3 と §3.4 が記録する他の実測（--acceptance-criteria の全置換と --check-ac との併用不可、--add-label のフラグ繰り返しが累積、--priority の拒否メッセージの表記、未宣言 status の拒否、task complete が非 Done で失敗、draft promote の採番し直し）も v1.49.3 で成立を確認済み。作業の本体は実測基準版の書き換えである。TASK-99 のセッションでは、その規模を PR #102 の適用前の main で 179 箇所（docs 41・decisions 16・src-tauri/src 62・src 58・AGENTS 2）と数えた。この 179 は着手時に使う値ではない — PR #102 自身が 5 箇所を足しており、同 PR の時点では 184 になっている。**着手前に依存先の TASK-154 が数え直した値を使う**（TASK-154 の AC #5 がそれを求めており、TASK-154 は集約によってこの数そのものを減らすので、引き上げ時に実際に触る箇所は 184 より少ない）。過去の記録である backlog/tasks の 23 箇所は書き換えない。src-tauri/wire-fixtures/ の記録 2 箇所は生成物なので手で編集せず、ATLAS_RECORD_WIRE_FIXTURES=1 cargo test で再記録して commit する。TASK-58 が v1.47.1 から v1.48.0 へ上げたときと同型の作業で、そのとき decision-7 に書いた「doc の実測記述の基準版を 1 つに保つための選択」という理由がそのまま当てはまる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision-7 の最低バージョン要件が v1.49.3 になり、引き上げの理由と、1.50.x を採らなかった理由が書かれている
- [ ] #2 update.rs の MIN_VERSION が v1.49.3 で、probe が v1.49.3 未満を Unsupported に落とすことが試験で固定されている
- [ ] #3 docs・decisions・src-tauri/src・src・AGENTS が実測基準版として名指しする版が v1.49.3 に揃っている（過去の記録である backlog/tasks は対象外）
- [ ] #4 利用者が画面で読む 3 つの理由文の版表記が v1.49.3 になっている
- [ ] #5 README の導入要件が v1.49.3 以上になっている
<!-- AC:END -->
