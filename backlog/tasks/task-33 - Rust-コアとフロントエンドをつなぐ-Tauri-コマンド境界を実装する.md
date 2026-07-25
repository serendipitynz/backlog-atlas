---
id: TASK-33
title: Rust コアとフロントエンドをつなぐ Tauri コマンド境界を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-25 03:50'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-29
  - TASK-30
  - TASK-31
  - TASK-32
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-1 の Tauri 構成で、Rust コア（台帳・読み取り層・status/Type・Git/PR 参照・更新アダプター・競合検出）をフロントエンドへ公開する Tauri コマンド境界を実装する。読み取り系と更新系の経路を分けたまま橋渡しする（decision-2）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 台帳・読み取り・更新アダプター・Git/PR 参照・競合検出をフロントへ公開する Tauri コマンドを定義する
- [x] #2 読み取り系（解析）と更新系（CLI 委譲）の経路分離をコマンド境界でも保つ
- [x] #3 エラー・縮退・競合を型付きの結果としてフロントへ返す
- [x] #4 利用者入力はコアの固定インターフェース（引数配列渡し）へ渡し、シェル文字列へ連結しない
- [x] #5 正規化済み status（正準列対応）と Type をフロントへ公開するコマンドを含める（TASK-29 の成果を境界に載せ、正規化前に完了しない）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rust コアとフロントを繋ぐ Tauri コマンド境界を src-tauri/src/commands.rs に実装した（Tauri を知る唯一のモジュール。lib.rs は run() とハンドラ登録に戻し、台帳コマンドも境界へ集約）。公開コマンドは 14 本: 台帳（ledger_list/register/remove/update・cross_task_id_generate/parse）、読み取り（workspace_open・project_open・project_close・project_watch_start/stop・task_history_read）、更新（cli_probe・update_apply）。

読み取り系と更新系の経路分離（decision-2・AC #2）は署名で担保した: 読み取り系は ScanSource か Git 読取だけを取り BacklogCli を一切名指さず、更新系 Workspace::apply だけが CliCapability を要求する（probe でしか作れない型なので、CLI 不在・版不足では型として更新へ到達できない＝doc-5 §5 の縮退が構造）。AC #5 は ProjectSnapshot が各タスクを TaskView{task, interpretation} として返すことで満たす。解釈は interpret_task をセッションにキャッシュせず境界で毎回計算する（別名表は台帳属性で随時変わるため、モデル再読込なしに現在の表で解釈できる）。AC #3 は CommandError（13 variant）で、コア各層の区別を保ったまま型付きで返す: 特に doc-9 §5 が要求する「照合不能 UncheckableTarget（版ずれを確かめる方法が無い）」と「更新前競合 UpdateResult::Conflict（確かめた結果ずれていた）」を別の型・別の形（Err と Ok）に分けた。ルート読取不能は ProjectLoad::Unreadable として値で返し、1 ルートの失敗が他行を巻き込まない（doc-7 §6）。AC #4 は UpdateOperation 系へ Deserialize を付け、フロントの JSON を並行 wire 型を挟まずコアの固定インターフェースへ直接 deserialize する構成にした（境界に文字列を組み立てる経路が存在しない）。NoteEdit だけ内部タグでは String payload を表せないため隣接タグ（mode/text）。

ファイル監視の配線（TASK-32 が「TASK-33 の仕事」と明記した部分）は project_watch_start がスレッドを起こし、デバウンス済みバッチごとにルート再読込して project-reloaded イベントで ReloadEvent{slug, load} を push する。再読込のたびに台帳を読み直すのは別名表の変更を取りこぼさないため。ReloadReason に ManualRefresh を追加（TASK-32 AC #6 の想定どおり契機は variant 追加で同一経路に載る。監視は doc-9 §3 でも保証されておらず、起動失敗時は利用者起点の再読込だけが外部変更を拾う手段になる）。空の action は UpdateRejected で拒否（1 呼び出しも起こさずに成功と報告しないため）。

コミット⇄PR 関連解決は境界に出していない: PrCommitSource の具体実装は doc-6 §6 のとおり種別ごとの後追加（TASK-30 で別途依存判断へ送り済み）で、常に空の関連一覧を返すと「取得成功だが関連なし」という解決済み状態を騙ることになるため、remote ゲート（TaskHistory.remote）だけを出し関連は実装と同時に載せる。App.svelte の greet スモークテストは cli_probe（縮退表示の最小の実物）へ置換。

PR #9 のレビュー（外部 bot）で 3 巡し、以下は初版から変わった箇所なので設計判断として残す。

(1) 台帳の root 変更による session/watch の陳腐化 [P1]。Ledger::update は project_root と backlog_root を同時に変更でき slug は不変なので、移動を検知する経路が無かった。結果 update_apply が旧 root のパスを照合したうえで新 project_root で CLI を起動でき、doc-9 §4 の照合が無関係なバイト列に対して通る。ledger_update で更新前後の root を比較し、移動時のみ session と watch を解放する。その場で再初期化せず close にしたのは、移動後の root は別のファイル集合であり「更新すべき model」が存在しないため。別名のみの編集では発火しない（解釈は呼び出しごとに計算するので再読込不要）。

(2) メインスレッド占有 [P2] と、その修正が生んだ競合 [P1]。Tauri は非 async コマンドを WebView の event loop と同じスレッドで走らせるため、全 14 コマンドを #[tauri::command(async)] にした（全数適用。コマンドが呼び出しを増やすたび線引きを再検討する必要が出るうえ、例外に値するほど軽いものが無い）。ただしこれはメインスレッドが暗黙に与えていた直列化を手放す変更でもあり、(a) 台帳の load→mutate→save に lost update、(b) 新 root 保存と session 無効化の間に update_apply が割り込む窓、が開いた。初版の (1) の修正は逐次実行前提でのみ正しかった。AtlasState に lifecycle ロックを追加し、台帳を変更するコマンドと entry を読んでから workspace に作用するコマンドは本体全体で保持する。台帳アクセサ（load_ledger・entry_for・mutate_ledger）は Lifecycle ガードを参照で受け取るので、ロック保持は忘れうる習慣ではなく欠けたら通らない引数になる（更新経路の CliCapability と同じ構造的手法）。update_apply は entry 読み取りだけでなく更新全体で保持する（doc-9 §4 が照合しているのは「この entry の root」と「この session の model と版指標」の対応そのもののため）。watch スレッドも同じロックを取るため、ロック保持下の join は確実な deadlock になる。そこで停止を 2 段に割り、detach_watch/detach_project がロック保持下で停止シグナルと登録解除を行い（これが台帳書き込みとの不可分性を作る）、join_watch がロック解放後に待つ。コマンド復帰前には join し終えるので、フロントが応答を得た時点でスレッドは消えている。ロック順は全体で lifecycle → watches → workspace、watch スレッドの lifecycle → workspace はその前置部分なので循環しない。

検証（マージ後の main）: cargo test 206 passed / 1 ignored（うち commands 16 件）・clippy --all-targets -D warnings clean・cargo fmt --check clean・cargo doc --no-deps --document-private-items 未解決リンク 0・svelte-check 0 errors・vite build 成功。
<!-- SECTION:NOTES:END -->
