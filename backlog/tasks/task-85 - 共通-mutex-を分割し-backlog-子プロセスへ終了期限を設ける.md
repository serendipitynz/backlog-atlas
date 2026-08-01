---
id: TASK-85
title: 共通 mutex を分割し backlog 子プロセスへ終了期限を設ける
status: In Review
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 22:48'
labels:
  - robustness
  - rust
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AtlasState.lifecycle がアプリ全体に 1 個しかなく、台帳を変更するコマンドと、台帳エントリを読んだ後に workspace へ作用するコマンドが処理全体でこの mutex を保持する。update_apply は取得後に CLI 版確認・更新実行・更新後の再読込まで行い、SystemBacklog::run は Command::output() で子プロセスの終了を期限も取消もなく待つ。そのため backlog が停止するか長時間終了しないと、更新対象とは別のプロジェクトの再読込・開閉・手動再取得・更新、台帳の読取・登録・更新・登録解除、アプリ設定の読取・保存まで完了しない。commands.rs は同じ mutex を保持したまま無期限の gh を待つ危険を認識してそちらは回避しているのに、backlog では回避していない。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 1、推奨順 2。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 台帳の read-modify-write を守る mutex と、各プロジェクトの workspace 更新を守る mutex が分かれている
- [x] #2 同じプロジェクトの台帳エントリ・workspace・読取時版の組合せは従来どおり守られている
- [x] #3 backlog 子プロセスに終了期限があり、期限到達時に子プロセスを終了させて失敗として返す
- [x] #4 停止する偽 CLI を使い、対象プロジェクトの更新待ち中でも別プロジェクトの読取とアプリ設定の読取が完了する試験がある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-02 に実装した。

**先に確定したこと（決定先行）**: 本タスクは対応順の表に決 印が無かったが、指示書の定義
（既存 decision・doc の契約を変える）に当たるので、実装より先に **decision-18** を書いて
ユーザーの確認を得た。ユーザーが選んだのは、CLI 終了期限 **30 秒固定**（アプリ設定では
変えない）・decision を **1 本**にまとめる・wire の `partial` を **`reloadRequired` へ改称**
の 3 点。AGENTS.md / AGENTS.ja.md は改訂していない（排他や子プロセスの期限に触れる記述が
無く、新しい例外も要らなかったため。TASK-60 と同じ扱い）。

**AC #1 排他の分割**: `AtlasState` の `lifecycle: Mutex<()>` 1 本を、slug ごとの
プロジェクト単位ロック（`projects: Mutex<BTreeMap<String, Arc<Mutex<ProjectState>>>>`）と、
設定ファイルロック 2 本（`ledger_writes`・`settings_writes`）へ置き換えた。全プロジェクトの
セッションを 1 つの `Mutex<Workspace>` に持っていた形もやめ、`Workspace` は `ProjectState`
（1 プロジェクトぶんの `Option<ProjectSession>`）になった。ロック順は
プロジェクト単位ロック → 設定ファイルロック で固定し、設定ファイルロック 2 本の入れ子は禁止。
台帳とアプリ設定の**読取はロックを取らない** — decision-17 の一時ファイル置換により、
読み手が中途の内容を見ることが無くなったため（1 本のロックを読取にも掛けていた元の理由が
消えている）。

**AC #2 同一プロジェクトの組合せ**: `entry_for` の引数を slug から
プロジェクト単位ロックの保持証（`&Project<'_>`）に変えたので、ロックしていないプロジェクトの
エントリを読むことが型で書けない。試験は
`work_on_one_project_serializes_against_work_on_that_same_project_only`。

**AC #3 CLI 終了期限**: `SystemBacklog::run` を `Command::output()` から
spawn + 配管 + `try_wait` の反復（20 ms 間隔）+ 期限到達時の `kill`/`wait` に置き換えた。
新規依存は無い。標準出力・標準エラーは専用スレッドで最後まで読む。失敗は `RunError`
（`Spawn` / `TimedOut`）で、`FailureKind::TimedOut { after_ms }` として wire に出る。
試験は `a_process_that_outlives_the_deadline_is_killed_and_reported_as_timed_out`（否定形）と
`a_process_that_finishes_inside_the_deadline_returns_its_exit`（肯定形）、
`output_larger_than_a_pipe_buffer_comes_back_whole`。

**AC #4 停止する偽 CLI**: `a_stalled_update_holds_up_neither_another_project_nor_the_settings`。
alpha の更新が `backlog` の中で止まっている間に、beta の読取・台帳の読取・アプリ設定の
読取と保存がすべて完了することを検査し、あわせて alpha 自身のロックが実際に保持されている
ことも主張する（肯定形。これが無いと「誰も持っていないロック」を通っただけで通る）。

**期限到達は必ず要再読込**: 強制終了は捕捉できないので、1 回目の呼び出しでも管理ファイルを
書いたかどうかは分からない。`UpdateFailure.partial` を `reload_required` へ改称し、
`ReloadReason::PartialUpdateFailed` も `FailedUpdate` へ改称した。画面の文言は
`completedBefore > 0` と期限到達で書き分ける（後者は「既に適用済み」と書けない）。

**検証**: `cargo test` 319 件、`cargo test -- --include-ignored` 323 件（実 CLI を使う 2 件も
新しい待機経路を通って成功）、`cargo fmt --check`・`cargo clippy --all-targets` 無指摘。
`pnpm test` 508 件、`pnpm run check` 0 errors、`pnpm run build` 成功。
wire fixture は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で再記録してコミットした
（`update_result_ran_timed_out.json` を新設。`afterMs` を運ぶ標本が他に無く、型が
`wire.ts` だけに固定されるのを避けるため）。

**主張を壊して確かめた 2 件**: (1) `with_project` を全 slug 共通のロックへ退行させると AC #4 の
試験が落ちる。(2) 配管の読み出しを待機の後ろへ動かすと、512 KiB を書く正常なプロセスが
30 秒後に期限到達になる（`output_larger_than_a_pipe_buffer_comes_back_whole` が落ちる）。

**未測定として残したこと**: Backlog CLI が孫プロセスを作るかどうか。作る場合、強制終了は
孫に届かない。decision-18 に「残らないとは書かない」として記録した。
<!-- SECTION:NOTES:END -->
