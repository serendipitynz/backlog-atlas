---
id: TASK-59
title: テストフィクスチャの POSIX 前提を外し Windows で cargo test を通す
status: To Do
assignee: []
created_date: '2026-07-31 20:08'
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
- [ ] #1 3 件のフィクスチャの絶対パス生成をプラットフォーム依存にし、Windows でも絶対パスになるようにする
- [ ] #2 TOML へパスを埋める箇所をエスケープする（またはリテラル文字列を使う）
- [ ] #3 同じ前提を持つ他のフィクスチャが無いか、手書き TOML とパス直書きを走査して確かめる
- [ ] #4 Windows 上で cargo test の全件が通ることを確認する
<!-- AC:END -->
