---
id: TASK-87
title: gh 照会に終了期限・取消・同時実行上限を設ける
status: Done
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-02 02:50'
labels:
  - robustness
  - rust
  - 'kind:bug'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-6 - タスクID-からの-Git・Pull-Request-履歴参照-設計.md
priority: medium
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
history.rs は抽出した PR を iterator の map で 1 件ずつ同期的に解決し、意図的に期限を設けず gh api の終了を待つ。フロントエンドの history-read.ts は呼出しトークンで古い応答を画面状態へ保存しないが、バックエンドへ取消を伝える経路が無い。そのため通信または gh が終了しなければ履歴読込が完了せず、複数 PR を参照するタスクでは前の PR が終わるまで次を取れず、タスクを切り替えても画面に反映されない古い呼出しの子プロセスが残り、再取得は新しい照会を増やすだけで古い照会を止めない。この処理は共通 mutex を外して実行されるため全バックエンド操作は止めないが、履歴読込の完了性とプロセス資源の管理に問題が残る。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 4、推奨順 4。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 gh 子プロセスを保持し、期限到達またはフロントエンドからの取消で終了させる
- [x] #2 複数 PR を並列取得する場合に同時実行数の上限がある
- [x] #3 タスク切替と再取得が古い子プロセスを終了する試験がある
- [x] #4 期限到達が PR 単位の LookupFailed として表示され、他の PR の結果が維持される
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-02 に実装した。PR #44 は外部レビュー 2 ラウンド (いずれも [P1] 1 件) を経て APPROVED、同日マージ。

**先に確定したこと（決定先行）**: 本タスクは対応順の表に決 印が無かったが、指示書の定義
（既存 decision・doc の契約を変える）に当たるので、実装より先に **decision-19** を書いて
ユーザーの確認を得た（決 印の後付けは TASK-84・85 に続いて 3 例目）。変えた契約は
decision-14 Consequences の 2 項（「呼び出しにタイムアウトを設けていない」「PR ごとに 1 回
`gh` を起動する」の直列部分）と、doc-8 §5 の参照失敗の原因の型。ユーザーが選んだのは
**gh 照会期限 30 秒**（CLI 終了期限と同値）・**`LookupFailure::TimedOut` を新設**・
**取消コマンド＋バックエンドの引き継ぎの両方**・**同時照会上限 2** の 4 点。
対応表は `_sandbox/referent-table-task-87-gh-bounds.md` 第 2 版に先行確定した。
AGENTS.md / AGENTS.ja.md は改訂していない（`gh` の期限・並列に触れる記述が無く、新しい例外も
要らなかったため。TASK-60・85 と同じ）。doc-6 §6 に「参照手段に掛ける 3 つの上限」を、
doc-8 §5 に「参照不能の原因は 4 つ」を足し、decision-14 の該当 2 項に注記した。

**期限付き待機を共有モジュールへ移した**: `update.rs` に閉じていた `Reapable`・`poll_until`・
`wait_until`・配管の読み切りを **`src-tauri/src/subprocess.rs`** へ移し、`SystemBacklog::run` と
`gh` 照会の両方が `subprocess::launch(&mut Command, deadline, &Cancel)` を通る形にした。
書き起こさなかった理由は、その実装が「掲げた期限の外側に無条件の待ちを残さない」ために
PR #43 のレビュー 5 ラウンドを要したものであり、2 つ目の写しは同じ穴を独立に持ち得るから。
`Stopped::Ended` は**どちらの上限で終わったかを報告しない** — ハンドルを持つのは呼び出し側で、
取消を持たない `update.rs` に到達不能な分岐を書かせないため。

**AC #1 期限と取消**: `Cancel` は `Arc<AtomicBool>`。`poll_until` が 20 ms ごとに期限と取消の
両方を見る。取消が立っていた場合でも**回収（reap）には取消を渡さない** — 渡すと 1 回も
poll せずに戻り、「終了させたのにまだ走っている」と偽の detail を書くことになる
（`a_cancelled_wait_still_reaps_within_the_grace` がこれを固定）。`gh` 側は
`GH_DEADLINE`（30 秒）で `subprocess::launch` を呼び、`Stopped::Ended` を
`RelationError::timed_out` に、取消が立っていれば `resolve_one` が `Cancelled` に読み替える。

**AC #2 同時照会上限**: `resolve_relations` を `map` から `std::thread::scope` +
`AtomicUsize` のカーソル + mpsc 収集へ替えた。ワーカーは `CONCURRENT_LOOKUPS`（2）と
PR 件数の小さいほうだけ立て、結果は添字で元の順へ戻す。`PrCommitSource` に `Sync` を
supertrait として足した（テスト用 fake の `RefCell` は `Mutex` にした — 本番と同じ条件で
呼ばれるべきなので）。

**AC #3 取消の 2 経路**: `AtlasState` に `history_reads: Mutex<HistoryReads>` を足し、
`task_history_read` が読取識別子で登録し guard で必ず外す。
(1) 新しい読取が始まると同じ (slug, TASK-ID) の古い読取を取り消す（引き継ぎ）。
(2) `task_history_cancel(read_id)` が読取識別子で名指しの読取だけを取り消す。
画面側は `createHistoryLoader` が `load` の直前と `abandon()`（詳細を閉じたとき）で送る。

**読取識別子は `<generation>:<call>` の文字列**（レビュー 2 ラウンドで 2 度直した箇所）。
当初は「フロントの呼出しトークンそのもの」にしたが、それだと **webview の再読込**で
呼出し番号が 1 から数え直され、`AtlasState` に残る旧読取と同じ名前が生じる。同じ名前の登録は
旧エントリを置換し、旧読取の guard が落ちるときに**新しいほうのエントリ**を外すので、
その画面の取消は走っている `gh` へ届かず、置換された旧照会にも届かない — decision-19 と AC #3 が
無くすはずの放置照会が、レジストリではなく識別子の側から戻ってくる。有効期限では直らず、
**重複しない名前**だけが直せる。そこで `createHistoryLoader` が自分を generation で刻む
（`crypto.randomUUID`、無い環境では時刻＋乱数。必要な性質は「1 プロセス内の 2 つのローダが
衝突しない」ことだけ）。識別子が一意なら、挿入が他の読取のエントリを置換することも、guard が
他人のエントリを外すことも、検査ではなく構成として起こらない。

**早着した取消を捨てない**: `task_history_read` と `task_history_cancel` は別々の `(async)`
コマンドなので Tauri は独立にスケジュールする。読取開始の直後に詳細を閉じる／タスクを切り替えると
**取消が先に走る**。走っているものだけを見るレジストリはその識別子を捨て、続く登録は取消済みでない
新しいハンドルを作って、既に去った画面のために期限まで待つ。**別のタスク**への切替には引き継ぎが
無いので、これを拾うものが他に無い。そこで宛先の無い取消を `HistoryReads::early` へ残し、登録が
それを消費する。保持は `EARLY_CANCEL_RETENTION`（5 秒）で切る — 識別子が一意になった後は
正しさではなくメモリを縛るだけの上限で、コメントにもそう書いた。

**AC #4 期限到達は PR 単位**: `LookupFailure::TimedOut` を足し、`detail.ts` の
`lookupRemedy` に 4 つ目の文言を書いた（「Atlas が照会を打ち切りました…再取得で解消する
ことがあります」。解消は約束せず、`queryFailed` と違って何が起きたかは言える）。
`a_timed_out_lookup_fails_only_its_own_pull_request` が、1 件が期限到達でも他の PR の
`Resolved` が残ることを検査する。取消された読取は `CommandError::HistoryCancelled` で返す
（部分的な一覧を返すと、画面が移った先のタスクの答えと wire 上で区別できない）。

**期限の外側を数えた結果**: `gh` 経路に残る無条件の待ちは無い。`thread::scope` の join は
⌈件数÷2⌉ × (30 秒 + 後始末猶予) で有界、mpsc の受信は送信側が全て落ちるので終端する。
**コミット検索（`git log`）と `git remote` には期限も取消も置いていない** — ローカルで
完結し通信を伴わないため。これは見落としではなく decision-19 に明記した除外である。

**検証（マージ時点。レビュー 2 ラウンド後に測り直した値）**: `cargo test` 334 件（ignored 4）、
`cargo test -- --include-ignored` 338 件、`cargo fmt --check`・`cargo clippy --all-targets`
無指摘。`pnpm test` 513 件、`pnpm run check` 282 ファイル・0 errors。
wire fixture は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で再記録してコミットした
（`wire_tokens.json` に `timedOut`・`historyCancelled`、`command_errors.json` に
`historyCancelled` の標本。**読取識別子は文字列**なので、数値だった当初の記録は
round 2 の修正に合わせて録り直してある）。

**主張を壊して確かめた 5 件**: (1) `CONCURRENT_LOOKUPS` を 1 に戻すと
`no_more_than_the_concurrent_lookup_cap_run_at_once` の「実際に重なる」側が落ちる。
(2) `poll_until` から取消の判定を外すと、取消の試験が 600 秒の期限まで戻らなくなる。
(3) ローダの `load` から先行読取の取消を外すと `cancels the read it supersedes` が落ちる。
(4) 識別子から generation を落とすと
`two_loader_generations_reusing_a_call_number_stay_separate_reads` と
「1 プロセスの 2 ローダが最初の呼出しを別名で呼ぶ」の 2 件が落ちる。
(5) 早着取消の保持を外すと、取消が先に届いた読取が期限まで走る側の試験が落ちる。

**未測定として残したこと**: 強制終了が `gh` の孫プロセスへ届くかどうか。decision-18 が
`backlog` について残したのと同じ項で、decision-19 にも「残らないとは書かない」として記録した。

**レビューの教訓**: round 1 の修正コメントに自分で書いた「これで不可能になるわけではない」が、
そのまま round 2 の [P1] になった。限界を正直に書けたということは、その欠陥を理解している
ということである。**書けるなら直す** — 正直な但し書きは残った欠陥の説明であって、免責ではない。
<!-- SECTION:NOTES:END -->
