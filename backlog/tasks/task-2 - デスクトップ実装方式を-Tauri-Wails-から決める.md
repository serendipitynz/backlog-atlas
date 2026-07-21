---
id: TASK-2
title: デスクトップ実装方式を Tauri / Wails から決める
status: Done
assignee: []
created_date: '2026-07-21 08:47'
updated_date: '2026-07-21 08:54'
labels:
  - 'kind:research'
milestone: m-0
dependencies: []
references:
  - backlog/decisions/decision-1 - デスクトップ実装方式に-Tauri-を採用する.md
documentation:
  - doc-2
  - doc-1
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog Atlas のデスクトップ実装方式を Tauri と Wails から一つ選ぶ。Atlas プロセスは一度だけ起動し、複数の Backlog ルートを読む前提（doc-2）。選定は配布方法・Backlog CLI 呼び出し・UI 技術に波及するため、他の設計タスクに先行して確定し、backlog/decisions に ADR として記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 評価軸（言語・配布サイズ・CLI/プロセス起動の扱い・UI 技術・個人利用での保守性）を明示している
- [x] #2 Tauri と Wails を評価軸で比較し、採用方式と却下理由を述べている
- [x] #3 採用結果を backlog/decisions に decision として記録している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tauri と Wails を評価軸（言語・配布サイズ・CLI/プロセス起動・sidecar 同梱・Git 連携・UI・保守・セキュリティ）で比較。sidecar 一級サポートとエコシステム規模、シェル非連結方針との親和から Tauri（Rust）を採用。結果を decision-1 に記録。UI フレームワークと Git 連携手段は後続タスクへ委ねる。
<!-- SECTION:NOTES:END -->
