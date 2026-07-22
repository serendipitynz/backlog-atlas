---
id: TASK-25
title: Tauri + Rust プロジェクト雛形と検証基盤を作る
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:maintenance'
milestone: m-1
dependencies: []
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-1（Tauri/Rust）に基づき、Atlas プロセス本体の骨格を作る。フロントエンド構成（フレームワーク・ビルドの有無）は decision に無いため本タスクで決定し、選定理由と範囲を Implementation Notes に記録する（別 decision は立てない）。doc-8 は Ace の vendored + textarea フォールバック（serenebach パターン）を前提にしている点を考慮する。ユーザー方針により Tailwind は導入せず、スコープドスタイル（scoped SCSS 等）を基本とする。ビルド・テスト・整形・静的解析を通せる状態にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tauri + Rust の最小アプリが起動し、空ウィンドウを表示できる
- [ ] #2 フロントエンド構成（フレームワーク・ビルド有無）を決定し、選定理由と範囲を Implementation Notes に記録している
- [ ] #3 cargo build / test / fmt / clippy 相当がエラーなく通る
- [ ] #4 Tailwind を導入していない（スコープドスタイル方針を採る）
- [ ] #5 AGENTS の依存追加ルールに従い、新規本番依存の選定理由を記録している
- [ ] #6 新規本番依存（未決定のフロントエンド構成、後続の parser・Git・file watcher・editor 等）は、導入前に選定理由と導入範囲を確認することを明示的なゲートにする（事後記録だけでは満たさない、AGENTS）
<!-- AC:END -->
