---
id: decision-1
title: デスクトップ実装方式に Tauri を採用する
date: '2026-07-21 08:53'
status: accepted
---
## Context

Backlog Atlas のデスクトップ実装方式を Tauri と Wails から一つ選ぶ（TASK-2）。
本アプリの中核は、外部 CLI（Backlog CLI）と Git のサブプロセス実行、Backlog
管理ファイルの解析、複数プロジェクトのスイムレーン UI の三つである。Atlas
プロセスは一度だけ起動して複数の Backlog ルートを読み、更新は対象プロジェクトを
作業ディレクトリとする Backlog CLI 呼び出しへ委譲する（doc-2）。

評価軸は、バックエンド言語・配布サイズ・CLI/プロセス起動の扱い・sidecar 同梱・
Git 連携・UI 技術・エコシステム/保守・セキュリティ姿勢とした。両者ともシステム
WebView を用いる軽量枠組みで、配布サイズと UI 層（HTML/CSS/JS）はほぼ互角、
「固定サブコマンド＋引数配列、シェル非連結」も自然に満たせる。差が出たのは次の
二点である。

- sidecar 同梱（TASK-15）：Backlog CLI を将来同梱する選択肢を残す場合、Tauri は
  `externalBin` と sidecar Command API で一級サポートする。Wails は組込機構がなく
  自前実装（`go:embed`＋展開）が要る。
- 長期保守で扱う言語：個人利用の保守性はここに大きく依存する（Rust か Go か）。

## Decision

Tauri（Rust バックエンド＋ Web フロントエンド）を採用する。決め手は、(1) sidecar
同梱が一級サポートで TASK-15 の選択肢を素直に残せること、(2) エコシステムが大きく
UI の選択肢と参考例が豊富なこと、(3) 権限モデルが AGENTS のシェル非連結方針と
親和的なこと。長期保守の言語として Rust を採ることを作成者が選択した。

## Consequences

- 望ましい帰結
  - Backlog CLI の sidecar 同梱を、枠組みの一級機能として後から選べる（TASK-15）。
  - Rust の `std::process::Command` により、固定サブコマンドと引数配列での Backlog
    CLI・Git 実行を、シェル文字列へ連結せず実装できる。
  - システム WebView 利用で配布物が小さい。
- 費用・制約
  - バックエンドの保守言語が Rust になる。
  - Web フロントエンドの UI 技術（フレームワークか vanilla か）は本決定では未確定。
  - OS ごとの WebView 差異（WebView2 / WKWebView / WebKitGTK）を考慮する必要がある。
- 後続への影響
  - 読み取り方式は本決定では未確定（TASK-3 で決める）。
  - Git・Pull Request 連携の実装手段（`gix`/`git2` crate か CLI 呼び出しか）は
    TASK-10 で決める。
  - sidecar 同梱の判断時点は TASK-15 で決める。
