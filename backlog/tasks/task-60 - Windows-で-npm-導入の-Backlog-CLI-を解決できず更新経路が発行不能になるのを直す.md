---
id: TASK-60
title: Windows で npm 導入の Backlog CLI を解決できず更新経路が発行不能になるのを直す
status: In Review
assignee: []
created_date: '2026-07-31 20:55'
updated_date: '2026-08-01 09:35'
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

1. npm が Windows の bin ディレクトリへ置くのは shim 3 本（backlog / backlog.cmd / backlog.ps1）だけで、backlog.exe を置かない。実測: Get-Command backlog の CommandType は ExternalScript、Source は …\backlog.ps1。同ディレクトリの一覧も backlog・backlog.cmd・backlog.ps1 の 3 本のみ。
2. Rust 標準ライブラリの Windows 実装は、拡張子を含まない名前に .exe のみを付けて PATH を探し、PATHEXT を歩かない（library/std/src/sys/process/windows.rs の resolve_exe。set_extension("exe") を無条件に適用するため、拡張子なしの backlog そのものも候補にならず、見つからなければ NotFound を返して終わる）。update.rs:826 は Command::new("backlog") である。

対比が診断を裏づける。同じ環境で git（wslgit の git.exe）と gh（gh.exe）は解決でき、Git 履歴欄はコミットを返す。差は拡張子だけである。

decision-11 は「macOS・Linux・Windows で同一に動く必要がある」と述べており、これは表明済みの要件に対する欠陥である。decision-7 は「doc-5 は実行ファイルの解決だけを差し替え可能にしてある」としており、修正はその継ぎ目（BacklogCli の実装）の内側で行える。decision-7 の前提「開発者＝利用者の PATH に backlog が既に入っている」は利用者の視点では成立しており、破れているのは実装側の解決規則である。

## シェル経由は避けられる（2026-08-01 の追加調査）

npm パッケージを解剖した結果、**ネイティブの実行ファイルは存在する**。backlog.md パッケージはプラットフォーム別のサブパッケージを持ち、Windows では node_modules/backlog.md/node_modules/backlog.md-windows-x64/backlog.exe が実体である（resolveBinary.cjs が require.resolve でこれを引く。binary 名は win32 のとき backlog.exe）。3 本の shim と cli.js は、いずれも最終的にこのバイナリを spawn しているだけである。macOS で実測すると、当該バイナリ（68MB）は直接実行でき --version が 1.47.1 を返す。

したがって .cmd / .ps1 を起動する必要は無い。本物の PE 実行ファイルの絶対パスを Command::new へ渡せばインタプリタはチェーンに入らず、AGENTS の「シェル文字列へ連結せず固定引数配列で実行する」を新しい例外なしで満たせる。**シェル経由の位置づけを decision に書く必要は生じない見込みである。**

## 候補

- **(a) アプリ設定で実行ファイルのパスを指定させる** … decision-13 の外部エディタ指定と同型。npm のレイアウトを知る必要が無く、実装が最小。利用者が backlog.exe の場所を知る必要がある点が費用。
- **(b) PATH を自前で歩き、PATHEXT ではなく実行可能な実体を探す** … bin ディレクトリに .exe が無いので、これ単体では解決しない。shim を読んで実体へ辿る実装は npm の内部構造に依存する。
- **(c) プラットフォーム別サブパッケージの実行ファイルを解決する** … npm の global prefix から backlog.md-<platform>-<arch>/backlog(.exe) を引く。インタプリタ無しで解決できるが、パッケージの内部レイアウトという実装詳細に依存する。
- **(d) sidecar 同梱** … decision-7 の同梱検討契機に当たる。解決問題は消えるが、版管理・プラットフォーム別バイナリ・更新追随の継続コストを decision-7 が挙げたとおり負う。
- **却下の見込み: cli.js を node 経由で起動する** … cli.js は結局同じバイナリを spawn するだけなので、プロセスが 1 段増えるだけで (c) に劣る。
- **却下の見込み: .cmd / .ps1 を起動する** … cmd.exe / powershell.exe が引数を再解釈する。AGENTS と、TASK-44（decision-15）が ShellExecuteW を選んで避けた問題そのもの。Rust 1.77 以降は .bat / .cmd のエスケープを修正済み（CVE-2024-24576）だが、上記のとおり避けられるので選ぶ理由が無い。.ps1 は実行ポリシーも絡む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Windows で npm 導入の Backlog CLI を解決し、CLI 縮退が解けることを実機で確認する
- [x] #2 採る手段を decision として記録する（シェルを経由する場合はその位置づけと AGENTS との関係を明記）
- [x] #3 実行ファイルの解決を BacklogCli の実装内に閉じ、doc-5 の操作写像を変えない
- [x] #4 macOS・Linux の解決経路を壊していないことを確認する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-01 に decision-16 として決定し、実装した。

**採った手段**: 実行ファイル解決の順序（①アプリ設定 `backlog_cli` ②Windows で PATH 上に
`backlog.exe` が無い場合に npm の shim の所在から辿るプラットフォーム別実行ファイル
③プログラム名 `backlog`）。候補 (a) と (c) の併用で、(b) は単体で解決しないため不採用、
(d) sidecar 同梱は decision-7 の同梱検討契機に属する判断なので TASK-99 へ残した。

**シェル経由は回避できた**: npm パッケージの解剖で、`.cmd`/`.ps1` を起動せずとも
`backlog.md-<platform>-<arch>/backlog[.exe]` を直接起動できることを確認した
（macOS で 70,612,322 バイト、`--version` が 1.48.0 を返す）。AGENTS.md / AGENTS.ja.md は
改訂していない。

**AC #4 の確認内容**: macOS は順序の 3 段目に到達し、`Command::new` へ渡すプログラム名が
`"backlog"` のまま変わらない。実 CLI を使う 2 件の ignored テスト
（`commands::tests::the_frontend_edit_reaches_the_real_cli` ほか）を
`cargo test -- --include-ignored` で通し、実物の CLI へ届くことを実測した（301 件全通過）。
Linux は `SubPackage::current().is_windows()` が偽で同じ 3 段目へ落ちる同一経路であり、
`update::tests::without_a_setting_a_unix_host_still_gets_the_bare_name` が固定している。
**Linux 実機では走らせていない。**

**AC #1 は未達**: Windows 実機での確認はユーザーへ依頼した。
<!-- SECTION:NOTES:END -->
