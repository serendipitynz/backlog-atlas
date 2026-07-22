---
id: TASK-33
title: Rust コアとフロントエンドをつなぐ Tauri コマンド境界を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-29
  - TASK-30
  - TASK-31
  - TASK-32
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-1 の Tauri 構成で、Rust コア（台帳・読み取り層・status/Type・Git/PR 参照・更新アダプター・競合検出）をフロントエンドへ公開する Tauri コマンド境界を実装する。読み取り系と更新系の経路を分けたまま橋渡しする（decision-2）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 台帳・読み取り・更新アダプター・Git/PR 参照・競合検出をフロントへ公開する Tauri コマンドを定義する
- [ ] #2 読み取り系（解析）と更新系（CLI 委譲）の経路分離をコマンド境界でも保つ
- [ ] #3 エラー・縮退・競合を型付きの結果としてフロントへ返す
- [ ] #4 利用者入力はコアの固定インターフェース（引数配列渡し）へ渡し、シェル文字列へ連結しない
- [ ] #5 正規化済み status（正準列対応）と Type をフロントへ公開するコマンドを含める（TASK-29 の成果を境界に載せ、正規化前に完了しない）
<!-- AC:END -->
