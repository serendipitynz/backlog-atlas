---
id: decision-50
title: 外部プログラムは窓なし起動で起動し、外部で開く だけを除く
date: '2026-10-20 21:17'
status: accepted
---
## Context

TASK-212 の要求である。2026-10-20、TASK-206 を Windows の実機で確認していたとき（NSIS で導入した
ビルド）、タスクを選ぶたびにコンソール窓が一瞬現れて消えた。Backlog CLI が見つからない状態でも起きた
ので、CLI の有無とは関係が無い。

**原因は起動の側にある。** Windows では、コンソールを持たないプロセスがコンソールプログラムを起動すると、
窓を作らない指定が無い限り、子のために新しいコンソール窓が作られる。release ビルドの Atlas は
`windows_subsystem = "windows"`（`src-tauri/src/main.rs`）なのでコンソールを持たず、`src-tauri/src` には
`creation_flags` が 1 か所も無かった（2026-10-20 に grep で確認）。タスクを選ぶと Git 履歴と PR の読取
（doc-8・doc-6）が `git` と `gh` を起動するので、選ぶたびに窓が出る。**開発ビルドは自分のコンソールを
持ち、子はそれを継ぐ** — `pnpm tauri dev` で再現しないのはこのためである。

用語は doc-8 §7 と decision-45 に従う。本決定で導入する新語は **窓なし起動** の 1 語である。

**窓なし起動** とは、Atlas が外部プログラムを起動するとき、Windows では子プロセスに
`CREATE_NO_WINDOW` を付けてコンソール窓を作らせない起動を指す。`subprocess::windowless` が作る
`Command` による起動がそれで、macOS と Linux では何も付かない。

起動箇所は、TASK-212 の着手時点で `Command::new` が本体に 5 か所あった（§3 の検査で数えた。テストを
含めると 12 か所）。

- `ExternalProgram::command`（`src-tauri/src/external.rs`）— `git` と `gh` の全起動がここを通る。Git 履歴
  （`history.rs`）、remote の有無（`ledger.rs`）、PR 照会（`history.rs`）、版の告知（`release.rs`、
  decision-44）。
- `probe_program`（同）— 設定画面の 解決結果の表示（decision-29）が実行する `--version`。
- `SystemBacklog::run`（`update.rs`）— Backlog CLI の全起動。起動時の版の照会と更新操作の両方。
- `Launcher::spawn` と `Launcher::spawn_observed`（`editor.rs`）— 外部で開く（decision-45 §4）。

## Decision

### 1. Atlas が出力を読むために起動するプログラムは、すべて窓なし起動で起動する

上の 5 か所のうち、外部で開く を除く 3 か所がこれに当たる。どれも Atlas が出力を読むために起動しており、
利用者が見る必要のあるものは何も表示しない。**窓が出ても利用者に渡るものは無く、残るのは画面のちらつき
だけである。**

付けるのは `CREATE_NO_WINDOW` であって、`DETACHED_PROCESS` ではない。前者は子に窓の無いコンソールを
与え、子が起動する孫（`gh` が起動する `git` など）はそのコンソールを継ぐ。後者は子にコンソールを
与えないので、孫のコンソールプログラムがそれぞれ自分の窓を作りうる。**後者のこの挙動は Microsoft の
文書から読んだもので、実測していない。** 前者で足りるので、測る理由も無かった。

定数は `windows-sys` を通さず、`subprocess.rs` に値を書いている。Cargo.toml は `windows-sys` の用途を
`ShellExecuteW` の 1 関数と書いており（decision-15）、その範囲を 1 つの定数のために広げるには及ばない。

### 2. 外部で開く は対象外とし、起動箇所で除外を明示する

外部で開く が起動するプログラムは、見せること自体が目的である。**外部で開く がプロセスを起動する 2 経路
（`Launcher::spawn`・`Launcher::spawn_observed`）には窓なし起動を付けない。**

- **起動指定 の行**（アプリ設定・`$VISUAL`・`$EDITOR`）には `vim` のようなコンソールエディタが入りうる。
  Windows ではそのコンソール窓がエディタそのものなので、消すと、エディタが誰にも触れない場所で
  動き続ける。
- **端末で開く**（`wt.exe`）は端末を出すための行である。
- 残りの行が起動するのは GUI のプログラム（`zed.exe`・`notepad++.exe`・`explorer.exe`）である。
  Microsoft の文書によれば、`CREATE_NO_WINDOW` はコンソールアプリケーションでないプロセスには
  無視されるので、付けても何も変わらない。

行ごとに分けず、外部で開く をまとめて除いたのは 2026-10-21 のオーナーの判断である。**その代償が
Windows の「Visual Studio Code で開く」に出る。** 起動するのは `code.cmd` というバッチファイルで、
バッチファイルは `cmd.exe` を通して走るので、`cmd.exe` の窓が開く。2026-10-21 に Windows の実機で
オーナーが確かめた。**オーナーはこれを問題なしとした**（同日）ので、行ごとに窓なし起動を持たせる
（decision-45 §5 の「観測する／しない」と同じく行の性質にする）作業は起こさない。

`ShellExecuteW`（OS の関連付け起動・既定ブラウザ起動、decision-15）はプロセスを起動する API では
なく、本決定の範囲外である。

### 3. 付け忘れは clippy の `disallowed-methods` で落とす

`src-tauri/clippy.toml` で `std::process::Command::new` を禁止する。`Command` を作ってよいのは
`subprocess::windowless` と、§2 の 2 経路だけである。どちらも起動箇所に
`#[allow(clippy::disallowed_methods)]` を書いて通す。**新しい起動箇所が窓なし起動を忘れると、
`cargo clippy --all-targets -- -D warnings` が落ちる。** これは CI の `rust (macos-latest)` と
`rust (windows-latest)` の工程で、マージ要件である（decision-33）。

**ソースを正規表現で走査する案は採らない。** `use std::process::Command as Spawn` のような別名や、
`Command::new` を値として渡す書き方は、走査の側でそれぞれ追わなければならない。clippy は名前解決の
後に呼び出し先を見るので、書き方に依らない。2026-10-21 に cargo clippy 1.96.0 で測った。別名経由・
`.map(Spawn::new)` のような値渡し・完全修飾の 3 つの書き方は、どれも報告された。このリポジトリでは
本体の 5 か所とテストの 7 か所の計 12 か所が報告され、`Command::new` の grep で数えた数と一致した。

**テストの固定具も `subprocess::windowless` を使う。** テストだけを許すと、`#[allow]` の集合が 2 経路
より大きくなり、本体の除外を読むときに混ざる。`subprocess` のテストでは、期限付き実行が本番と同じ
指定の子を相手にすることにもなる。

## Consequences

- 外部プログラムを起動するコードは `subprocess::windowless` で `Command` を作る。外部で開く に行を足す
  ときは §2 の 2 経路を通るので、何もしなくてよい。3 つ目の除外を作るには、起動箇所に `#[allow]` を
  書き、理由を本決定に書き足す。
- **窓が出ないことを確かめる自動の検査は無い。** コンソール窓の有無は、テストからは観測できない。
  検査が保つのは「指定を付けたこと」までで、窓が出ないことの確認は Windows の実機で行う（TASK-212 の
  AC #1・#2）。
- `cfg(windows)` の枝は、macOS の開発機ではクレートごとにはコンパイルできない（Windows ターゲットの
  ビルドスクリプトが `llvm-rc` を要する。2026-10-21 に確認）。TASK-212 では `windowless` とその枝だけを
  取り出して `x86_64-pc-windows-msvc` 向けにコンパイルした。クレート全体は CI の
  `rust (windows-latest)` がコンパイルする。
- Windows の「Visual Studio Code で開く」では、§2 のとおり `cmd.exe` の窓が開く。オーナーが受け入れた
  代償であって、欠陥として起票しない。
