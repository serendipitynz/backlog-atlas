---
id: TASK-37
title: 外部エディタ経路を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-26 08:45'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-32
  - TASK-35
  - TASK-36
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §7 の設計に従い、タスクの管理ファイルを利用者の外部エディタで開く経路を実装する。書くのは外部エディタ（利用者）であり Atlas は書かない不変を保つ。ただし CLI のスキーマ保護を受けない例外経路である点を扱う。長文編集を使い慣れた道具へ逃がす用途。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 対象タスクの管理ファイルそのものを $EDITOR / OS 関連付けで開き、Atlas 自身は書き込まない
- [x] #2 外部エディタの保存を doc-9 のファイル監視が拾い、再読込でドメインモデルへ反映する（終了検知に依存しない）
- [x] #3 開く前に frontmatter を壊すと縮退表示になる旨を示し、壊れた場合は doc-4 の縮退表示で受ける
- [x] #4 GUI 内編集セッションと外部エディタ編集の二重取り込みを 6.4 の扱いで避ける
- [x] #5 最後の参照削除など CLI で不能な操作の案内先として機能する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
doc-8 §7 の外部エディタ経路を実装した。層は src-tauri/src/editor.rs（read/update/history/sync/ledger と並ぶ新層。読み取りでも CLI 更新でもなく「起動だけ」を持つ）、境界は commands::editor_probe / commands::task_file_open、画面側の規則は src/lib/external-editor.ts（純関数）、面は TaskDetail の「外部エディタで開く」区画。

新規の本番依存は入れていない。関連付け起動は tauri-plugin-opener / shell を使わず std::process::Command で macOS `open` / それ以外（Windows を除く）`xdg-open --` を直接起動する（history.rs の git 起動と同方針）。Windows では関連付け起動を提供しない: 唯一の無依存手段である `cmd /c start` は cmd.exe にコマンド行を再解釈させ、Command::args の argv 境界が子がインタプリタになった時点で失われるため、管理ファイル名に含まれる & ^ %…% が別コマンドとして実行され得る（scanner は誰が書いた .md でも受け入れる）。正しい起動子は ShellExecuteW 相当で新規本番依存の確認ゲート対象のため、association を None として理由付きで無効化し（$VISUAL/$EDITOR は Windows でも使える）、Win32 対応は TASK-44 に切り出した。起動子がコマンドインタプリタ（cmd/sh/powershell/pwsh）でないことは、プラットフォーム非依存の不変条件として試験に固定してある。

シェルは一切介さないため、$EDITOR 値の解析は ASCII 空白での分割（先頭=プログラム、残り=先行引数）に限定し、クォート・`~` 展開・変数展開は提供しない（実行ファイルのパスに空白を含む値は表現できず spawn 失敗として報告される）。

起動方式は $VISUAL/$EDITOR（Configured）と OS 関連付け（Association）を fallback chain にせず 2 つの独立した操作として並べた。GUI プロセスから端末専用エディタ（vim 等）を起動すると端末が無く即終了して「何も起きない」ように見えるため、どちらを意図したかは利用者しか知らない。$VISUAL を $EDITOR より優先するのは POSIX 慣行（EDITOR は行エディタでもよく、VISUAL が画面指向）に合わせ、長文編集というこの経路の用途に一致するため。Configured は能動化していても端末専用エディタの注意（CONFIGURED_TERMINAL_CAVEAT）を併記する。

対象ファイルはフロントの値を信用せず、開いているモデルが持つ task の source_path と一致するものだけを起動する（Workspace::open_in_editor。一致しなければ CommandError::UnknownTaskFile で起動しない）。これは doc-9 §4 で guarded_update が対象を呼出側任せにせずモデルから導出するのと同じ規則。CLI 能力検査（cli_probe）と保存区分では門を作らない: doc-8 §6.5・doc-5 §3.1 が draft・completed・archive の内容編集や References/dependencies の最後の 1 件削除の案内先としてこの経路を指しているため、そこで無効化すると必要な場所で消える。TASK-ID を読めない解析不能ファイルもパスで識別するので開ける。

Atlas は書かない（AC #1）: この経路にファイルを開く・作る・書くコードは無く、効果は「パスを引数に持つプロセスを 1 つ起動する」だけ。実ファイルを置いて起動後に内容が変わらないことを試験で固定した（将来この経路が書き込みを始めたら試験が落ちる）。書き戻しは doc-9 の監視に委ね、終了検知は実装していない（AC #2）。SystemLauncher は spawn 後に wait せず（待つと編集中ずっとコマンドが返らない）、代わりに回収用スレッドで wait して Unix の zombie 蓄積を避ける。`sleep 30` を起動して即座に返ることを試験で固定した。

書き戻しの経路は「ルートの監視」と「再読込イベントの購読」の両方が生きていて初めて成立する。片方でも欠けると外部エディタの保存は画面へ届かないため、起動前に監視開始（冪等）を await し、購読失敗も記録して、該当行（購読が死んでいれば全行）に projectOpen 裏付けの明示的な「再読込」操作を出す。タスクを開き直すだけでは既存 snapshot から解決するだけで読み直さないため、案内はその操作を名前で指す。外部エディタ経路自体は監視が動かない機械でも残す（CLI で不能な編集の逃がし先を、そこでこそ奪わないため）。

二重取り込み（AC #4）は 6.4 の扱いに乗せた: 起動は編集セッションに一切触らず（未保存入力を保存も破棄もしない）、未保存入力があるときだけ警告と 2 度押し確認を出す。以降は既存の継続検出（externallyChanged の告知）と保存時の更新前競合検出が受ける。確認と起動結果の表示は履歴読取（TASK-35）と同じくパスで鍵付けした: 再読込ごとに view オブジェクトは作り直されるため、同一性で持つと別タスクに「起動しました」が残る。

AC #3 は起動前に常時表示する FRONTMATTER_NOTICE（frontmatter 露出・壊すと次の読み取りで縮退表示・CLI のスキーマ検査を通らない）で満たし、壊れた場合は doc-4 §5 の既存縮退表示が受ける（TASK-35 実装、破棄しない）。AC #5 は EXTERNAL_EDITOR_ROUTE を一箇所で定義し、References/dependencies の最後の 1 件削除と draft・completed・archive の読み取り専用理由が同じ「この画面下部の『外部エディタで開く』」を指すようにした（従来は抽象的な「外部エディタ経路」で行き先が無かった）。TaskDetail 側に重複していた最後の 1 件削除の文言も定数へ寄せた。

検証: cargo test --lib 228 passed / 3 ignored、clippy -D warnings clean、cargo fmt clean、vitest 127 passed、svelte-check 0 errors、vite build 成功。実エディタが画面に出るところまでの手動確認は行っていない（sync.rs の実監視 e2e と同じ理由でサンドボックス依存）。Windows 上での確認手段が無いことは TASK-44 の AC に含めた。

付随修正: src/lib/edit.ts の sameCriteria が区切りに生の NUL バイトをソースへ直書きしていたため、ファイルが binary 扱いになり grep/diff が中身を見なくなっていた。挙動同一の `\0` エスケープへ置き換えた。

レビュー履歴（PR #13）: 1巡目 [P1] Windows の cmd /c start をシェル経由のまま出荷しない（上記の Windows 無効化と不変条件試験で対応、Win32 対応は TASK-44）。1巡目 [P2] 監視を開始できなかった場合に起動を続け、案内文の「タスクを開き直す」が再読込にならなかった（unwatched の記録と projectOpen 裏付けの再読込操作で対応）。2巡目 [P2] 通知購読の失敗は unwatched に入らないため復旧操作へ到達できなかった（reloadFeed として記録し、購読が死んでいれば全登録行へ再読込操作を出す）。2巡目 [P3] 本ノート前段が cmd /c start を使うと書いたままだった（本文を現在の実装へ更新）。
<!-- SECTION:NOTES:END -->
