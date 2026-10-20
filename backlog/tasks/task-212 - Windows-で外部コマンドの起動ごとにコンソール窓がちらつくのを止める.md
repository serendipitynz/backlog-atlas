---
id: TASK-212
title: Windows で外部コマンドの起動ごとにコンソール窓がちらつくのを止める
status: In Review
assignee: []
created_date: '2026-10-20 03:03'
updated_date: '2026-10-20 23:10'
labels:
  - 'kind:bug'
  - rust
  - 実機
milestone: m-4
dependencies: []
priority: medium
ordinal: 203700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Windows でタスクを選ぶたびに、コンソール窓が一瞬現れて消える（2026-10-20、TASK-206 の実機確認中にユーザーが観測。NSIS で導入したビルド）。Backlog CLI が見つからない状態でも起きるので、CLI の有無とは関係が無い。

原因の見立て: Windows では、GUI アプリがコンソールプログラムを起動すると、窓を作らない指定（`CREATE_NO_WINDOW`）が無い限りコンソール窓が作られる。src-tauri/src には `creation_flags` も `CREATE_NO_WINDOW` も 1 か所も無い（2026-10-20 に grep で確認）。タスクを選ぶと、タスク詳細の Git 履歴・PR の読取（doc-8・doc-6）が `git` と `gh` を起動するので、選ぶたびにちらつく。Backlog CLI が見つかる環境では、起動時の確認と更新ごとの `backlog` でも同じことが起きるはずである。

起動箇所は `Command::new` を grep すると subprocess.rs・external.rs・update.rs・history.rs・editor.rs・ledger.rs にある。窓を消すのは、見せる必要の無い起動に限る。外部エディタ経路（doc-8 §7）の端末起動のように、見えること自体が目的の起動には付けない。どの起動がどちらに当たるかは着手時に読み分け、契約に関わるなら doc/decision に書く。`ShellExecuteW`（decision-15）は対象外。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Windows の実機で、タスクを選んでも git・gh の起動でコンソール窓が現れない
- [x] #2 Backlog CLI が見つかる環境で、起動時の確認と更新でもコンソール窓が現れない
- [x] #3 見えること自体が目的の起動（端末など）は窓を消さず、どの起動を対象外にしたかが doc か decision に書かれている
- [x] #4 新しい起動箇所が窓を消す指定を付け忘れたら、検査が落ちる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src-tauri/src/subprocess.rs に、Windows では CREATE_NO_WINDOW を付けた Command を作る関数を 1 つ置く
2. git・gh（ExternalProgram::command）、backlog（SystemBacklog::run）、--version 確認（probe_program）をその関数経由にする。テストの固定具も同じ関数を使う
3. editor.rs の 外部で開く の 2 起動は対象外とし、理由付きの #[allow] で通す
4. src-tauri/clippy.toml の disallowed-methods で std::process::Command::new を禁じ、付け忘れを cargo clippy -D warnings で落とす（AC #4）
5. decision-50 に、窓を消す起動・消さない起動の区別と検査の機構を書く（AC #3）
6. cargo test/clippy/fmt、Windows ターゲットの cargo clippy、pnpm test/check/lint
7. AC #1・#2 は Windows 実機での確認をユーザーに依頼する
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
着手時の判定（2026-10-21、オーナー回答）: 窓を消す起動と消さない起動の区別は新しい decision-50 に書く。外部で開く（editor.rs）は行ごとに分けず、まとめて対象外にする。

実装: `subprocess::windowless(program)` を 1 つ置き、Windows では `CREATE_NO_WINDOW` を付けた `Command` を返す。`ExternalProgram::command`（git・gh。Git 履歴・remote の有無・PR 照会・版の告知）、`probe_program`（設定画面の `--version`）、`SystemBacklog::run`（Backlog CLI の全起動）をこれ経由にした。テストの固定具 7 か所も同じ関数を使う。`#[allow]` が付くのは外部で開く の 2 経路（`Launcher::spawn`・`spawn_observed`）だけ。

AC #4 の検査は、ソースの正規表現走査ではなく `src-tauri/clippy.toml` の `disallowed-methods`（`std::process::Command::new`）にした。clippy は名前解決後の呼び出し先を見るので、別名（`use … as Spawn`）・値渡し（`.map(Spawn::new)`）・完全修飾のどれも報告される（2026-10-21 に別クレートで実測）。CI の rust ジョブ（マージ要件）の `cargo clippy --all-targets -D warnings` で落ちる。

計測・確認（2026-10-21）:
- 着手時の clippy は 12 か所（本体 5・テスト 7）を報告し、grep の数と一致
- 変異検査: editor.rs の `#[allow]` を 1 つ外すと clippy が落ち、戻すと通る
- `cfg(windows)` の枝: macOS からはクレートごと Windows ターゲットで clippy できない（tauri-winres が `llvm-rc` を要する）。`windowless` と枝だけ取り出し、`x86_64-pc-windows-msvc` 向けに `#![deny(warnings)]` でコンパイルが通ることを確認。クレート全体の Windows コンパイルは CI の `rust (windows-latest)` が行う
- cargo test 484 passed・cargo fmt --check・cargo clippy（1.96.0 と 1.98.0）・pnpm test 1386 passed・pnpm run check・pnpm run lint すべて通過

未確認（オーナーの実機確認待ち）: AC #1・#2。release ビルドを Windows に入れて、タスク選択（git・gh）と、CLI がある環境での起動時・更新時（backlog）に窓が出ないこと。開発ビルドは Atlas 自身がコンソールを持つので再現しない。
未実測で残したもの: Windows の「Visual Studio Code で開く」は `code.cmd` を起動するので、`cmd.exe` の窓がちらつく可能性がある（decision-50 §2）。ちらつきが確認できれば別タスクにする。

Windows 実機の確認（2026-10-21、オーナー。このブランチの release ビルドを NSIS で導入）:
- AC #1 OK: タスク選択で git・gh が走っても、コンソール窓は出なかった
- AC #2 OK: Backlog CLI が見つかる環境で、起動時の確認と更新時にも窓は出なかった
- 確認の準備で分かったこと: fnm 配下に npm で入れた backlog は、Atlas からは見つからない。`fnm_multishells` はシェルごとの PATH で、GUI から起動した Atlas には届かない。版も 1.49.1 で最低版に届いていなかった。CLI を更新し、アプリ設定で backlog.exe の実体パスを指定して確認した（decision-29 の想定どおりの対処）。gh は winget で入れる案内をした。
- 外部で開く の「Visual Studio Code で開く」では、予想どおり `code.cmd` 経由で cmd.exe の窓が開いた。オーナーの判断で問題なしとし、別タスクは起こさない。decision-50 §2 と Consequences の「未実測」を、この結果に書き換えた。
<!-- SECTION:NOTES:END -->
