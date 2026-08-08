---
id: TASK-124
title: Git remote を現在値の表示と再判定ボタンに分ける
status: In Review
assignee: []
created_date: '2026-08-07 22:25'
updated_date: '2026-08-08 04:55'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
priority: high
ordinal: 121500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-79 の目視で起票。概要区画は「Git remote を再判定する（現在: あり）」というチェックボックス 1 つで、いま何が判定されているかを述べていない。ユーザーの求めは、判定済みの remote の値（例 git@github.com:serendipitynz/backlog-atlas.git）を表示し、再判定は独立したボタンにすること。台帳エントリの更新経路（doc-10 §4.1）と読み取り層が返す remote 情報に触れるので、表示できる値が何かを先に確かめる。文言ではなく操作と表示の構成の変更なので TASK-79 から分けた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 現在判定されている Git remote の値が概要区画で読める
- [x] #2 再判定が独立した操作になっている
- [x] #3 doc-10 の該当節が改訂されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決めたこと（決定先行・決 印は後付け）

着手時の判定で契約変更が要ると分かった。**decision は書かず doc 改訂だけ**（doc-3 §3.2/§4.3、doc-10 §3/§4.1/§9）。

- **remote 現在値は読み取り値で、台帳へは保存しない。** 台帳が持つのは `git_remote_present` の真偽値だけで、URL の欄は無い。保存案は退けた — `LoadedLedger::load` に下位版を読む腕が無く（`v < KNOWN` は `UnsupportedSchemaVersion`）、スキーマ版を上げると既存台帳が読めなくなる。加えて、プロジェクトルートの Git 設定を台帳が写して持つと「写しと現物のどちらが正か」という問いを新たに作る。
- **再検出は押した時点で発行する。** `EntryEdit` から `redetectGitRemote` を落としたので、保存に載る余地そのものが無くなり、送信属性一覧にも現れない。
- **語は「再検出」へ統一。** doc-3 と画面が「再判定」、doc-10 と画面設計案 07 が「再検出」で割れていた（TASK-122 と同型）。
- 2026-08-08 にユーザーが 3 点とも確定（原文の提示は不要と回答）。

## 読み取り層で分かったこと

`history.rs` の `detect_remote_host` は `git remote get-url` で URL を読んでいるが、`kind`/`owner`/`repo` だけを写して URL を捨てていた。しかも `RemoteHostKind` は `gitHub` の 1 値なので、GitHub 以外の remote はこの経路では丸ごと落ちる。AC #1 が求める値は、読み取り層が現に読んでいて露出していない 1 つの文字列だった。

`GitRemoteRead` は decision-6 の書き分けをそのまま 4 状態に持つ（`configured` / `remoteAbsent` / `noRepository` / `unreadable`）。対象不在の判定は `git remote` の終了コードではなく既存の `is_git_repo` に載せた — 非リポジトリと存在しないパスがどちらも 128 で、区別には locale 依存の stderr 解析が要るうえ、次の行動は同じだったため。

`git_remote_read` は独立コマンドにした。`ledger_list` に載せると起動時に全エントリぶん git を起こすことになり、開いていない概要区画のための費用になる。

## 実測（借り物 playwright・WebKit / Chromium、1280×800、`_sandbox/project-detail-check/`）

`?remote=` と `?recorded=0`・`?readonly=1` のつまみを足して測った。

- 4 状態＋未取得の Git remote 欄の高さ: 未取得 70.75 / configured 70.75 / remoteAbsent 99.5 / noRepository 99.5 / unreadable 70.75px（WebKit。Chromium は 71.78〜101.33px）。**横スクロールはどの条件でも 0。**
- 記録と検出が食い違う条件（`?remote=configured&recorded=0`）で状態文が出て、欄は 93.13px。
- URL は 1280・1024 では 1 行（18px）、520px 幅で 2 行（36px）に折り返し、`overflow-wrap: anywhere` が効いている。
- 台帳読取専用で控えは `disabled`、理由「台帳が読み取り専用のため、Git remote の再検出はできません。」が常時表示（doc-11 §5）。
- **既存側との突き合わせで 1 件直した**: 値の行に `font-size: 0.75rem` を書いていたところ、同じ欄一覧の slug の `.value-line` が 12.48px で 0.48px ずれていた。自前の font-size を外して継承へ戻し、両者 12.48px・code 11.856px で一致。

**測っていないもの**: 実機 WKWebView、再検出を押してから答えが返るまでの中間状態の見え方、remote を複数持つ実リポジトリでの名前併記の読みやすさ。

## 試験

- Rust 382 件（`choose_remote_name` の origin 優先、4 状態の判別、記録と検出が食い違っても `detect_remote_host` の門は台帳の真偽値のままであること）。
- フロント 686 件。`wire_tokens.json` に `GitRemoteRead` の 4 トークンを記録し、`git_remote_read.json` を新規記録。`wire-fixture.test.ts` は keys・値型・トークンの 3 経路に加えて `gitRemoteLine` を payload の上で走らせている。
- `pnpm run check` 0 errors、`pnpm run build` / `cargo fmt --check` / `cargo clippy` とも通過。
<!-- SECTION:NOTES:END -->
