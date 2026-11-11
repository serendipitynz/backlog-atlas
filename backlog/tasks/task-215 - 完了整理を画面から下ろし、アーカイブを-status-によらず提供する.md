---
id: TASK-215
title: 完了整理を画面から下ろし、アーカイブを status によらず提供する
status: Done
assignee: []
created_date: '2026-11-11 02:40'
updated_date: '2026-11-11 08:27'
labels:
  - 'kind:bug'
milestone: m-4
dependencies:
  - TASK-208
priority: high
ordinal: 206700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-213 の実測（2026-11-11）で、Done のタスクの閉じ方が CLI の版で逆転していることが分かった。v1.50.1 から v1.53.0 までは、Done のタスクに対して task complete だけが通り、task archive は「Done tasks should be completed, not archived」で終了コード 1 になる。v1.54.0 で task complete が削除され、それ以降は task archive だけが status によらず通る。edit.ts の transitionOffers は、アーカイブを status によらず押せる状態で出し、完了整理を Done のときだけ押せる状態で出している。そのため Done のタスクには、どの版でも必ず失敗する操作が 1 つ画面に出ている。

TASK-213 の決定で、最低バージョン要件を v1.54.0 へ上げ（TASK-208）、完了整理を画面から下ろし、アーカイブを status によらず提供することになった。本タスクは、TASK-208 が最低バージョン要件を上げた後に、操作写像（update.rs の TaskComplete、wire.ts、edit.ts）と文言表から完了整理を取り除き、アーカイブの確認文を v1.54.0 以降の挙動（id とリンクを保つ）に合わせる。

update.rs の UpdateOperation::TaskArchive の註は「succeeds regardless of status」と述べており、v1.53.0 以前では偽だった（TASK-213 の実測）。v1.54.0 以上を最低バージョン要件にした後では真になるが、書き換える行の隣にあるので、本タスクで doc-5 §3 と照らして直す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タスク詳細の状態遷移に完了整理が出ず、update.rs・wire.ts・edit.ts・文言表の両言語から task complete の経路が無くなっている
- [x] #2 Done のタスクでアーカイブが押せ、v1.54.0 以上の CLI で成功する
- [x] #3 アーカイブの確認文と効果の説明が、v1.54.0 以降の挙動（id と References・dependencies を保つ）と食い違っていない
- [x] #4 wire-fixtures と invoke-signature の検査が、操作の削除を反映して通る
- [x] #5 上の 1 と 2 を入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 着手時の判断（2026-11-11、オーナー）

- アーカイブの効果の行と確認文は「保持を述べる形」にした。「この操作は戻せません」を落とし、v1.54.0 の `task archive` が保つもの（id・References・dependencies）を述べる。和英とも同じにした。戻せないと書き続けると、Atlas から戻せるようにする TASK-216 が入った時点で偽になり、CLI からはすでに `task restore` で戻せる。
- オーナーの問いに答えるため、v1.54.0 の `backlog task --help` で確かめた。Done のタスクを盤面から外す手段は、CLI でも `task archive` だけである。`task complete` は削除され、`task delete` はアーカイブ済みのタスクだけを対象にし、`task demote` は draft へ戻す操作である。Done のまま盤面に置く使い方は、CLI でも Atlas でも変わらない。

## 実装

- `update.rs`・`sync.rs`・`commands.rs` から `UpdateOperation::TaskComplete` を取り除いた。`TaskArchive` の註は「status によらず成功し、id・References・dependencies を保つ（v1.54.0）」に直した（本タスクの本文が求めていたもの）。
- `UpdateOperation::TaskComplete` を使っていた試験 3 本（失敗の報告、部分適用、照合込みの失敗）は、`TaskArchive` と v1.54.0 の実際の拒否文（`Task ID … is ambiguous`。decision-51 §5）に置き換えた。境界の試験は、`{"op":"taskComplete"}` を拒むことを確かめる形に替えた。
- `wire.ts`・`edit.ts`（`TransitionKind`・`COMPLETABLE_STATUS`・`transitionOffers`）・`App.svelte` の遷移一覧・文言表の和英（`taskComplete`・`completableOnly`・`statusUnreadableShort`）から完了整理を取り除いた。後の 2 つは完了整理にしか使われていなかった。
- 「5 件」を前提にしていた註は 4 件に直した（edit.ts・TaskDetail.svelte・文言表）。

## doc

- doc-5 §3: 完了整理の行を落とした。§3.2 の active の状態遷移を、demote と archive の 2 つに書き直した。
- doc-8 §6.5: active の項を書き直し、「5 件」を「4 件」にした。戻す操作の段落を、アーカイブだけの話にして TASK-216 を指すようにした。
- doc-11 §12: 状態遷移の件数を書かない形にした。同じ節が「件数を書かない規則」を述べているのに、「5 件」と書いていたため。

## 検査（AC #5）

- 新しく足した・書き換えた試験は 3 本ある。
  - active に出る遷移が status によらず demote と archive だけであること
  - Done のタスクでアーカイブが能動化すること
  - アーカイブの文が保持するものを和英とも述べること
- `edit.ts`・`wire.ts`・文言表の和英を HEAD の内容に戻すと、4 本が落ちることを確かめた（上の 1 本目と 3 本目に、件数の試験と片道の試験が加わる）。
- 「Done のタスクでアーカイブが能動化する」は旧コードでも通る（旧コードもアーカイブを status で絞っていなかった）。そこで、アーカイブを Done で差し控える変異を入れ、落ちることを別に確かめた。
- Done のタスクへの `task archive` が v1.54.0 で成功すること（AC #2 の後半）は、TASK-213 と TASK-208 の実測（v1.54.0 で終了コード 0）による。
- `pnpm test`（54 ファイル・1397 件）、`pnpm run check`（0 errors）、`pnpm run lint`、`src-tauri/` での `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test`（485 件）がすべて通った。wire-fixtures は変わらない（`UpdateOperation` は記録の対象外）。invoke-signature の走査も通った。

## レビュー 1 回目（PR #170、Claude Code）

[P3] 3 件で、すべて直した。

- update.rs の位置引数だけを取るサブコマンドの列挙に、`task complete` が残っていた。
- 英語版のアーカイブの文が `references` を小文字で書いていた。英語の文言表のほかの箇所と画面の区画名は `References` なので、大文字にそろえ、試験もそれに合わせた。
- edit.test.ts の註が、タスクのアーカイブを「戻せる」側に分類していた。Atlas から戻せるのは TASK-216 が入ってからである。戻せるのは CLI の `task restore` で、Atlas はまだ発行しないので、確認文は保たれるものを述べる、という形に直した。
<!-- SECTION:NOTES:END -->
