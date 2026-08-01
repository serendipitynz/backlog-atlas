---
id: TASK-59
title: テストフィクスチャの POSIX 前提を外し Windows で cargo test を通す
status: In Review
assignee: []
created_date: '2026-07-31 20:08'
updated_date: '2026-08-01 11:51'
labels:
  - 'kind:bug'
milestone: m-2
dependencies: []
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
手書き TOML のテストフィクスチャが POSIX のパス表記を前提にしているため、Windows 上の cargo test が 3 件失敗する（2026-08-01、TASK-44 AC #3 の実機確認中に判明。278 件中 3 件 FAILED）。テストスイートを Windows で走らせたのがこのときが初めてだった。

製品コードは正しい。台帳の書き込みは ledger.rs:537 で toml::to_string_pretty を通すのでエスケープは処理され、is_absolute() がプラットフォーム固有に振る舞うのは doc-3 §3 の「既存の絶対ディレクトリ」の要求どおりである。壊れているのは手書きフィクスチャだけで、該当は 4 箇所（commands.rs:1606、ledger.rs:1220・1225・1278）。

原因は 2 種類。

1. ledger::tests::load_rejects_corrupt_ledger と ledger::tests::load_keeps_invalid_status_alias_for_the_interpretation_layer は project_root = "/a" を書く。Windows では /a は絶対パスではない（Path::is_absolute() はドライブ接頭辞か UNC を要求する）ため、ledger.rs:469 の NonAbsoluteRoot が先に返り、前者は期待する DuplicateSlug に到達せず、後者は load().unwrap() で panic する。

2. commands::tests::an_invalid_alias_in_the_ledger_file_leaves_that_status_unmapped は実 temp パスを使うので絶対だが、C:\Users\... を TOML の二重引用符文字列へ直接埋めているため \U 等が不正なエスケープになり TOML の解析が失敗する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 3 件のフィクスチャの絶対パス生成をプラットフォーム依存にし、Windows でも絶対パスになるようにする
- [x] #2 TOML へパスを埋める箇所をエスケープする（またはリテラル文字列を使う）
- [x] #3 同じ前提を持つ他のフィクスチャが無いか、手書き TOML とパス直書きを走査して確かめる
- [ ] #4 Windows 上で cargo test の全件が通ることを確認する（例外: history::tests::search_matches_task_id_in_commit_body は git の実体が wslgit である環境でのみ落ちる。wslgit は Windows 側の git 呼び出しを bash コマンド文字列へ組み直すため、フィクスチャが複数行の -m で渡すコミットメッセージが再クォートされる。原因の族が本タスクの POSIX パス前提と別であり、製品コードは run_git が log・-z・--format=…・--fixed-strings・--grep=<TASK-ID>・commit id・パスしか渡さず、改行を含む引数を git へ渡す経路が存在しないため、この 1 件は本タスクの対象外とする）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-01 に実装した。

**AC #1**: `ledger.rs` に `absolute_root(name)` を置き、Windows では `C:\<name>`、それ以外では
`/<name>` を返す。`cfg!` は 2 つのリテラルの選択だけを持ち、述語は入っていない（m-1 TASK-44 の
規則）。`is_absolute` はプラットフォーム固有なので TASK-60 の `SubPackage` のように両ホストから
両分岐を検査することはできない。代わりに `an_absolute_root_is_absolute_on_this_platform` が
走っているホストでの絶対性を主張するので、綴りを間違えたホストでそのテストが落ちる。

**AC #2**: 同じ場所に `toml_path(path)` を置き、台帳の `save` が使うのと同じシリアライザに
引用符とエスケープを任せた。`commands.rs` のフィクスチャは実 temp パスを埋めるので、
`"{}"` では Windows の `C:\Users\…` の `\U` が不正なエスケープになり、対象の別名に届く前に
TOML の解析が失敗していた。`a_path_embedded_in_toml_survives_the_round_trip` は綴りではなく
往復を主張する — どの引用形式を選ぶかはシリアライザの領分で（バックスラッシュを含むパスには
リテラル文字列、`'` を含むパスには基本文字列を選ぶ）、こちらの契約は値がそのまま読み戻ることだから。

**この 2 つを `tests` の外の `pub(crate)`（`#[cfg(test)]`）にした理由**: 同じ台帳 TOML を手書きする
フィクスチャが `ledger` と `commands` の両方にあり、`commands` 側に写しを置くと、上の 2 つの
主張が通らない写しが残る。`TempDir` が 6 モジュールに複製されているのは `tempfile` 依存を
避けるためで、こちらは検査対象そのものなので写さない。

**AC #3 の走査結果**: 2 つの失敗の型を尽くした。(1) POSIX リテラルが `is_absolute` に届く経路 —
`is_absolute` の呼び出しは 3 箇所（`ledger.rs` の `validate` と `require_absolute`、`read.rs` の
実パスへの主張）だけで、フィクスチャを阻むのは前 2 つ。そこへ届くのは `load`/`save`/`register`/
`validate` を呼ぶテストで、POSIX リテラルを持つものは直した 3 件で全部だった。`ledger_with` の
`/x`（cross-task-id の 7 件）・`update.rs` の `/projects/atlas` と `/opt/backlog/does-not-exist`・
`sync.rs`・`editor.rs` のリテラルは検証にもファイルシステムにも届かない（2026-08-01 の Windows
実測でもこれらは通っていた）。(2) パスを引用符付き文字列へ埋める経路 — 直した後は
`fs::write` 21 箇所のうちパスを文字列化するのは `toml_path` だけで、`format!` を伴う残り 1 件は
serde の JSON を書く wire fixture の記録側。

**`wire_fixtures.rs` の POSIX リテラルは直さない**: `/repos/atlas/…` 等はどの機械でも
バイト同一の記録を作るために捏造した絶対パスで、AGENTS のテスト節がそれを要求している。
プラットフォーム依存にすると記録が機械ごとに変わり、フロントエンド側のテストが読む
コミット済みファイルと一致しなくなる。

**macOS での実測**: `cargo test` 300 件（従来 298 + 新規 2）・`cargo test -- --include-ignored`
304 件がすべて通り、`cargo fmt --check` と `cargo clippy --all-targets` は無指摘。
フロントエンドには触っていない（wire 型の増減が無いので fixture の再記録も不要）。

**AC #4 は未達**: Windows 実機での全件確認はユーザーへ依頼した。AC #4 に書いた例外
（`history::tests::search_matches_task_id_in_commit_body`）は 2026-08-01 の実測で
4 failed のうちの 1 件として現れたもので、ユーザーが 3 択から「AC に例外と理由を書く」を選んだ。
<!-- SECTION:NOTES:END -->
