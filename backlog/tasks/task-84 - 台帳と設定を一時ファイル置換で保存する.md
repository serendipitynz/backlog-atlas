---
id: TASK-84
title: 台帳と設定を一時ファイル置換で保存する
status: In Review
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 21:41'
labels:
  - robustness
  - rust
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
settings::save と LoadedLedger::save が保存先へ直接 std::fs::write する。std::fs::write は既存ファイルを切り詰めてから書くため、切詰め後に容量不足・プロセス強制終了・OS 障害が起きると、空または途中までの TOML が残り得る。projects.toml が壊れると登録済みの全プロジェクトを開けず（LoadedLedger::load は読めない台帳をエラーにする）、settings.toml が壊れると既定値で起動して保存済みのテーマ・カード密度・監視設定・外部エディタ指定が失われたように見える。プロセス内 mutex は同時読み書きを防ぐが、プロセス終了や OS レベルの書込み失敗から既存ファイルを守らない。同一ディレクトリに一時ファイルを作り、完全な TOML を書いて閉じた後に保存先へ置き換える。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 2、推奨順 1。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 台帳と設定の保存が一時ファイル作成→書込み→置換で行われる
- [x] #2 必要とする耐久性の水準（ファイルと親ディレクトリの同期を行うか）が決まり、理由が記録されている
- [x] #3 一時ファイル作成・書込み・同期・rename の各失敗を注入できる保存境界がある
- [x] #4 失敗時に旧ファイルが変わらない試験が台帳と設定の両方にある
- [x] #5 成功時に新ファイル全体だけが見える試験が台帳と設定の両方にある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-02 に実装した。

**AC #2（先に決めたこと）**: 耐久性水準はユーザーが 3 択から選んだ。採ったのは
**一時ファイル + ファイル同期 + `rename`** で、**親ディレクトリ同期は行わない**。記録先も
3 択から選ばれ、**decision-17** を新規に書いた。引き継ぎ指示書は本タスクに決定先行の印を
付けていなかったが、指示書自身の定義（新しい decision を残す必要があるタスク）に当たるので、
実装より先に提示して確認した。決め手になった事実は、`rename` が同一ファイルシステム上でしか
働かないこと（一時ファイルを保存先の隣に作る理由）と、Windows でディレクトリのハンドルに
`FlushFileBuffers` が通るかをこの環境で測れないこと（親ディレクトリ同期を退ける理由）。
**掲げる保証は「書込み途中の失敗が保存先に中途の内容を残さない」ことだけ**で、電源断後に
何が残るかは掲げない（`rename` のディレクトリエントリを永続化していないため）。
**ファイル同期は省かなかった** — 省くと内容より先に `rename` が永続化され得て、中身の無い
ファイルが保存先の名前に残る。

**PR #42 のレビューで訂正した事実 2 件（round 1、[P2] 2 件）**: 当初 decision-17 の Context 3 は
「macOS の `fsync` はデバイスまで落とさない」と書いていたが、**Rust の `File::sync_all` は
Apple 向けに `fcntl(F_FULLFSYNC)` を呼ぶ**（rustc 1.96.0 の `sys/fs/unix.rs` で確認）ので、
この実装には当てはまらなかった。親ディレクトリ同期を退けた 3 理由のうち 1 つが消えたため
水準をユーザーへ再提示し、**ファイル同期までを維持**する判断を得た。あわせて Windows 側の
記述も直した — `OpenOptionsExt::custom_flags(FILE_FLAG_BACKUP_SEMANTICS)` で開くところまでは
safe な std で可能なので、「不可能」ではなく「その先が未測定」が真である（TASK-58 が doc-10 §1 へ
足した「提供しない理由は真であるものを書く」に当たる）。もう 1 件は、実装が立証しない
「電源断でも旧ファイルは無傷」を保証として書いていた点で、掲げる保証と掲げない保証を
分けて書き直した。

**AC #1・#3（`store` モジュール）**: `src-tauri/src/store.rs` を新設した。`replace` が
ディレクトリ作成 → 一時ファイル作成（`create_new`）→ 全量書込み → ファイル同期 → `rename` を
行い、どの段で失敗しても一時ファイルを片付けてから返す。`Files` trait が保存境界で、実物は
`SystemFiles`、試験用は `FakeFiles::failing_at(step)`。`Step` は 5 値の列挙で、`EVERY_STEP` が
その全体。失敗の注入先を値にしたのは、どの段を失敗させるかを試験が名指せるようにするため。
モジュール名を `sync` にしなかったのは、`sync` が既に doc-9 の鮮度追随層を指しているため
（対応表に理由を書いた）。`ledger::LoadedLedger::save_with` と `settings::save_with` が境界を
引数に取り、引数無しの `save` はそれぞれ `SystemFiles` を渡すだけになった。両者にあった
`create_dir_all` は `replace` に一本化した。

**AC #4・#5（試験）**: `store` に 8 件、`ledger`・`settings` に 2 件ずつ足した（Rust 300 → 312、
`--include-ignored` 304 → 316）。AC #4 は両モジュールで `EVERY_STEP` を回し、注入した失敗ごとに
バイト同一と**再読込できること**の両方を主張する（設定は decision-13 が既定値へ縮退するので、
バイトだけ見ていると「壊れた」と「保存していない」が区別できない）。AC #5 は
`store::assert_reached_only_by_rename` を両モジュールから呼び、保存先の名前に触れたのが
`rename` だけであることを主張する。

**mutation で確かめたこと（3 回）**: (1) `replace` を `std::fs::write` に戻すと 8 件が落ちる。
(2) ファイル同期を外すと 3 件が落ちる（AC #4 のループが Sync 段の失敗を注入できなくなるため）。
(3) **最初に書いた AC #5 は mutation を捕まえなかった** — 「保存先に触れた呼び出しが無い」だけを
主張していたので、保存境界を一切通らない実装では空集合を走査して通っていた。`rename` が
実際に起きたことを**積極的に**主張する形へ直し、その主張を `store` に 1 つ置いて両モジュールから
呼ぶことで、写しが片方だけ弱くなる余地も消した。同じ理由で、`Step::Write` の注入は何も書かずに
失敗するのではなく、**内容の前半を書いてから**失敗する（何も書かない注入では、報告書が挙げた
「途中まで書かれた TOML」を一度も作らずに「旧ファイルは無事」が通ってしまう）。

**契約の記録**: decision-17 を書き、doc-3 に §2.3「書き込み（一時ファイル置換）」を足し、
decision-13 の「後続への影響」から decision-17 を参照した。どちらも置き場・形式・縮退は
定めていたが書込みの手順は定めていなかったので、反転した判断は無い。AGENTS.md /
AGENTS.ja.md は改訂していない — 本決定は Atlas 自身の 2 ファイルの書き方であって、
AGENTS の「更新は Backlog CLI へ委譲する」境界には触れないため。対応表は
`_sandbox/referent-table-decision-17.md` に先行確定した。

**検証**: macOS で `cargo test` 312・`cargo test -- --include-ignored` 316 がすべて通り、
`cargo fmt --check`・`cargo clippy --all-targets` は無指摘。`pnpm test` 506・
`pnpm run check` 282 ファイル 0 エラー。wire 型は増減していないので fixture の再記録は不要。
Windows・Linux 実機は要さない（`rename`・`create_new`・`sync_all` はいずれも標準ライブラリの
プラットフォーム非依存な API で、プラットフォーム分岐を新たに入れていない）。
<!-- SECTION:NOTES:END -->
