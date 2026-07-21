---
id: TASK-9
title: Backlog 更新アダプターを設計する
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 10:07'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-3
  - TASK-5
documentation:
  - doc-2
  - doc-1
  - doc-5
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atlas の操作を対象プロジェクトでの Backlog CLI 呼び出しへ変換する Backlog 更新アダプターを設計する。対象プロジェクトを作業ディレクトリとし、固定したサブコマンドと引数配列で実行し、ユーザー入力をシェル文字列へ連結しない。対応する更新操作（タスク・文書・マイルストーンの作成/更新/status 変更など）とエラー・失敗時の扱いを定義する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 対象操作ごとに Backlog CLI のサブコマンドと引数配列の写像を定義している
- [x] #2 作業ディレクトリ指定と、ユーザー入力を引数配列で渡す（シェル連結しない）方式を定義している
- [x] #3 CLI 失敗・非ゼロ終了時の扱いと再読み込み契機を定義している
<!-- AC:END -->
