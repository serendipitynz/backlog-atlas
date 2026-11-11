---
id: TASK-216
title: completed・archive のタスクを盤面へ戻す操作（task restore）を提供する
status: Done
assignee: []
created_date: '2026-11-11 05:58'
updated_date: '2026-11-11 09:12'
labels:
  - 'kind:feature'
milestone: m-4
dependencies:
  - TASK-208
priority: medium
ordinal: 207700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.54.0 で task restore が入り、archive と completed のタスクを盤面（tasks/）へ戻せるようになった（2026-11-11 に v1.54.0 で実測。TASK-208）。decision-51 §6 は、Atlas が戻す操作を持つかを CLI の版とは別の製品判断として残していた。2026-11-11 にオーナーが提供すると決めた。

TASK-208 が最低バージョン要件を v1.54.0 へ上げたので、タスク詳細の completed・archive に出る理由文 noWayBackFromClosed（「completed・archive から戻す操作は CLI にないため提供しません」、英語版も同旨）は、動作保証のどの版についても偽になっている。本タスクは、restore を状態遷移として操作写像（update.rs の UpdateOperation と allowed_options、wire.ts、edit.ts の transitionOffers）と画面へ足し、noWayBackFromClosed を取り除く。

着手時に測って決めること: restore 後の status と id、References・dependencies の扱い。同じ id の 2 件があるときの拒否（decision-51 §5）。実行前確認（doc-11 §12）の文。doc-9 §4 の更新前競合の検出が、移動元の管理ファイルに掛かること。決定は decision-51 の改訂節か新しい decision に書き、doc-5 §3 の表・§3.2 と doc-8 §6.5（「Atlas に戻す操作が無い」の段落と completed・archive の項）を改める。edit.ts と TaskDetail.svelte の註も、TASK-208 が「Atlas に戻す操作が無い」と書いた箇所を直す。

TASK-208 が入るリリースに本タスクも入れる。入れないと、偽の理由文がそのリリースの画面に残る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タスク詳細の completed・archive のタスクに盤面へ戻す状態遷移が出て、v1.54.0 以上の CLI の task restore で active へ戻る
- [x] #2 提供する決定と restore 後の status・id・リンクの扱いが decision に書かれ、doc-5 §3・§3.2 と doc-8 §6.5 が改訂されている
- [x] #3 noWayBackFromClosed が無くなり、completed・archive に出る文が v1.54.0 以上の CLI について真である（和英とも）
- [x] #4 restore も doc-9 §4 の更新前競合の検出を通り、wire-fixtures と invoke-signature の検査が通る
- [x] #5 上の 1 と 3 を入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. v1.54.0 の task restore を測る（済み）。archive/tasks と completed のタスクを、中身を変えずに tasks/ へ移し、id・status・References・dependencies を保つ。ほかのファイルは変えない。active には not archived で、アーカイブした draft には not found で、同じ id の 2 件には ambiguous で終了コード 1 になる。
2. decision-51 に「§6 の改訂」節を足し、restore を提供すると記録する。
3. update.rs に UpdateOperation::TaskRestore を足す。sync.rs の照合対象はそのタスクのファイル 1 件にする（戻す前の場所にあるファイル）。
4. wire.ts と edit.ts の transitionOffers を変える。completed と archive のタスク（TASK-N）には「active へ戻す」を出す。archive の draft（DRAFT-N）には、戻す操作は CLI にないと理由を述べる。App.svelte の遷移一覧に足し、noWayBackFromClosed を取り除く。
5. 文言表の和英に transition.taskRestore を足す。文はオーナーが選んだ「active へ戻す」案。
6. doc-5 §3 の表と §3.2、doc-8 §6.5 を改める。edit.ts・TaskDetail.svelte の「戻す操作が無い」註も直す。
7. 試験を足し、修正を外すと落ちることを確かめる。pnpm test・check・lint と cargo の 3 つを通す。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 着手時の判断（2026-11-11、オーナー）

- 控えの語と確認文は「active へ戻す」案にした。控えは「active へ戻す…」、効果は「id・status・References・dependencies は保持されます」、確認文は「このタスクを active へ戻します。id・status・References・dependencies は保持されます。」、進む側は「active へ戻す」で、英語版も同じ内容にした。保存区分の絞り込みに出ている語（active・completed・archive）をそのまま使うので、どこへ戻るかが語で分かる。
- 決定は decision-51 に「§6 の改訂」節を足して記録した。decision-48 の「上げ先の改訂」と同じ形である。対応表は本文より先に、TASK-216 の対応表 初版として確定した。

## 実測（2026-11-11、v1.54.0）

- `task restore` は、archive/tasks/ と completed/ のタスクを、管理ファイルの内容ハッシュを変えずに tasks/ へ移す。ファイル名、id、status（In Progress も Done も）、References、dependencies は保たれる。ほかの管理ファイル（そのタスクを依存や参照に持つタスクを含む）は書き換わらない。
- 失敗するもの（いずれも終了コード 1 で、何も動かない）:
  - active のタスク（「is not archived. It is already on the board」）
  - アーカイブした draft（not found。v1.54.0 に draft を戻す手段は無い）
  - 同じ id の 2 件（「is ambiguous」と `backlog doctor` の案内）
  - 存在しない id（not found）

## 実装

- `update.rs` に `UpdateOperation::TaskRestore` を足した（`task restore <TASK-N>`、位置引数だけ）。`sync.rs` の照合対象は、ほかのタスク操作と同じく、そのタスクの管理ファイル 1 件（戻す前の場所）である。`commands.rs` の境界の試験に `taskRestore` を足した。
- `wire.ts`・`edit.ts`・`App.svelte` の遷移一覧に `taskRestore` を足した。`transitionOffers` は、completed・archive のタスクに「active へ戻す」だけを出す。archive の draft（id が `DRAFT-N`）には出さず、「archive の draft を戻す操作は CLI にないため提供しません」を理由に述べる。
  - draft かどうかは id の接頭辞で見分ける。doc-4 §3.4 が `DRAFT` を `task_prefix` によらず固定しており、読み取り層は置き場所と食い違う id を縮退させるので、archive の `DRAFT-N` は archive/drafts にある。
- 偽になっていた `noWayBackFromClosed` を取り除き、archive の draft にだけ掛かる `noWayBackForArchivedDraft` に置き換えた。
- 実行前確認は 5 件とも通す。doc-8 §6.5 は、その理由を「戻せないから」から「どの遷移も押した瞬間に開いているタスクを今の保存区分から外し、詳細を閉じるから」に改めた。アーカイブと「active へ戻す」は、互いを押す前の状態へ戻し合うようになったためである。edit.ts と TaskDetail.svelte の註は、理由を doc-8 §6.5 へ送る形にした。

## doc

- doc-5: §3 の表に「active へ戻す（`task restore`）」の行を足した。§3.2 の「保存区分別の可否」に提供の範囲を書いた。§3.7 の取り込まない一覧から `task restore` を外した。
- doc-8 §6.5: completed・archive の項に「active へ戻す」を書いた。状態遷移を 5 件に戻し、逆操作で絞らない理由を書き直した。版差記録の最後の文を「Atlas は TASK-216 から発行する」にした。

## 検査（AC #5）

- `edit.test.ts` に次の 3 本を足した。
  - completed・archive のタスクに「active へ戻す」だけが出ること（AC #1）
  - archive の draft には出さず、理由を述べること（AC #3）
  - 「active へ戻す」の文が保つものを和英とも述べること（AC #3）
- 状態遷移の全件の試験に archive を足した。
- `edit.ts`・`wire.ts`・文言表の和英を HEAD の内容に戻すと、9 本が落ちることを確かめた。
- `pnpm test`（54 ファイル・1399 件）、`pnpm run check`（0 errors）、`pnpm run lint`、`src-tauri/` での `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test`（485 件）が通った。1 回目の `pnpm test` では、doc-8 で閉じる `**` と次の `**` がつながった 1 か所を emphasis-closing.test.ts が見つけたので、間に空白を入れて直した。

AC #4 を試験でも押さえるため、sync.rs に 1 本足した。archive/tasks にあるタスクへの restore の照合対象が、戻す前の場所のファイルになることを確かめる。これで cargo test は 486 件になり、cargo clippy も通った。

## レビュー 1 回目（PR #171、Claude Code）

[P2] 1 件・[P3] 2 件で、すべて直した。

- [P2] doc-8 §6.5 の「アーカイブと active へ戻すは互いを戻し合う（id も管理ファイルの中身も変わらない。実測）」のうち、アーカイブ側の中身は測っていなかった。v1.54.0 で測った。作成から 61 秒後、`updated_date` が書き換わりうる分解能を越えてからアーカイブし、戻すまでの間、内容ハッシュは変わらなかった（In Progress と Done の 2 件）。文は真だったので doc-8 はそのままにし、測定を decision-51 の「§6 の改訂」節に書き足した。
- [P3] edit.test.ts の註に「Atlas は TASK-216 まで restore を出さない」が残っていた。文言表の註の「restoring from Atlas is TASK-216」と併せて直した。
- [P3] decision-51 §6 の項に改訂節への案内が無く、そこで読み止めると TASK-216 より前の答えになっていた。decision-13・decision-31 の形に合わせて「下の『§6 の改訂』を先に読むこと」を書き足した。
<!-- SECTION:NOTES:END -->
