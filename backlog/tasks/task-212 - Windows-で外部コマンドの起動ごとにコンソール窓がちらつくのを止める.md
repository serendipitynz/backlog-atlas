---
id: TASK-212
title: Windows で外部コマンドの起動ごとにコンソール窓がちらつくのを止める
status: To Do
assignee: []
created_date: '2026-10-20 03:03'
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
- [ ] #1 Windows の実機で、タスクを選んでも git・gh の起動でコンソール窓が現れない
- [ ] #2 Backlog CLI が見つかる環境で、起動時の確認と更新でもコンソール窓が現れない
- [ ] #3 見えること自体が目的の起動（端末など）は窓を消さず、どの起動を対象外にしたかが doc か decision に書かれている
- [ ] #4 新しい起動箇所が窓を消す指定を付け忘れたら、検査が落ちる
<!-- AC:END -->
