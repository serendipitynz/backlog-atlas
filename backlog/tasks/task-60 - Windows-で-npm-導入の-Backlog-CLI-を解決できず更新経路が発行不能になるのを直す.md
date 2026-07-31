---
id: TASK-60
title: Windows で npm 導入の Backlog CLI を解決できず更新経路が発行不能になるのを直す
status: To Do
assignee: []
created_date: '2026-07-31 20:55'
labels:
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Windows で Backlog CLI が解決できず、doc-5 の更新アダプター全体（タスク作成・更新・マイルストーン・文書）が発行不能になる。2026-08-01 に実機で確認した（画面上部の帯が「PATH 上に backlog CLI が見つかりません。作成・更新は発行できません」を出す）。

原因は 2 つの事実の組み合わせで、PATH の設定とは無関係である。

1. npm が Windows に作るのは backlog.ps1 / backlog.cmd で、backlog.exe を作らない。実測: Get-Command backlog の CommandType は ExternalScript、Source は …\backlog.ps1。
2. Rust 標準ライブラリの Windows 実装は、拡張子を含まない名前に .exe のみを付けて PATH を探し、PATHEXT を歩かない（library/std/src/sys/process/windows.rs の resolve_exe。CreateProcessW の「拡張子が無ければ .exe を付ける」規則に合わせたもの）。update.rs:826 は Command::new("backlog") である。

対比が診断を裏づける。同じ環境で git（wslgit の git.exe）と gh（gh.exe）は解決でき、Git 履歴欄はコミットを返す。差は拡張子だけである。

decision-11 は「macOS・Linux・Windows で同一に動く必要がある」と述べており、これは表明済みの要件に対する欠陥である。decision-7 は「doc-5 は実行ファイルの解決だけを差し替え可能にしてある」としており、修正はその継ぎ目（BacklogCli の実装）の内側で行える。decision-7 の前提「開発者＝利用者の PATH に backlog が既に入っている」は利用者の視点では成立しており、破れているのは実装側の解決規則である。

注意: .cmd / .ps1 を起動すると cmd.exe / powershell.exe がチェーンに入り引数を再解釈する。これは AGENTS の「シェル文字列へ連結せず固定引数配列で実行する」と、TASK-44（decision-15）が ShellExecuteW を選んで避けた問題そのものである。Rust 1.77 以降は .bat / .cmd 起動時のエスケープを修正済み（CVE-2024-24576）だが、シェルを経由する位置づけは decision として明記すること。.ps1 は実行ポリシーも絡むためさらに重い。

候補は少なくとも 4 つあり、いずれも選定理由と導入範囲を decision に書く: (a) PATH と PATHEXT を自前で解決して実行ファイルの絶対パスを Command へ渡す (b) sidecar 同梱（decision-7 の同梱検討契機に当たる） (c) アプリ設定で実行ファイルのパスを指定させる（decision-13 の外部エディタ指定と同型） (d) npm パッケージの cli.js を node 経由で起動する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Windows で npm 導入の Backlog CLI を解決し、CLI 縮退が解けることを実機で確認する
- [ ] #2 採る手段を decision として記録する（シェルを経由する場合はその位置づけと AGENTS との関係を明記）
- [ ] #3 実行ファイルの解決を BacklogCli の実装内に閉じ、doc-5 の操作写像を変えない
- [ ] #4 macOS・Linux の解決経路を壊していないことを確認する
<!-- AC:END -->
