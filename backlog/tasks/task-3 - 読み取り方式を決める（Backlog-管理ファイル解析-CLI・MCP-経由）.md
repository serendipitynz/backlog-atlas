---
id: TASK-3
title: 読み取り方式を決める（Backlog 管理ファイル解析 / CLI・MCP 経由）
status: Done
assignee: []
created_date: '2026-07-21 08:48'
updated_date: '2026-07-21 09:20'
labels:
  - 'kind:research'
milestone: m-0
dependencies: []
references:
  - backlog/decisions/decision-2 - 読み取りは-Backlog-管理ファイルの直接解析を採用する.md
documentation:
  - doc-2
  - doc-1
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
各 Backlog ルートのタスク・設定・マイルストーン・文書をどう読むかを決める。候補は (a) Backlog.md 管理ファイルの直接解析、(b) Backlog CLI 経由、(c) MCP 経由。ファイル解析を採る場合は Backlog.md のバージョン差と cross-branch 状態の扱いを明示する（doc-2）。更新は別途 Backlog CLI へ委譲する前提は不変。結果を decision に記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 3 候補を、バージョン差耐性・実装量・cross-branch 対応・更新経路との整合で比較している
- [x] #2 採用方式と却下理由を述べ、ファイル解析採用時はバージョン差と cross-branch の扱いを明示している
- [x] #3 採用結果を backlog/decisions に decision として記録している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
導入済み backlog CLI(v1.47.1) を実測し JSON 等の機械可読出力が無い（--plain のみ）ことを確認。frontmatter+SECTION 区切りの管理ファイルの方が版差に強く反応的に読めるため直接解析(a)を採用。CLI 整形出力解析(b)は版差脆弱、MCP(c)は常駐禁止の起動モデルに抵触。バージョン差はサポート範囲固定＋想定外スキーマの縮退表示、cross-branch は初期版 current checkout 限定（TASK-6 で確定）。結果を decision-2 に記録。
<!-- SECTION:NOTES:END -->
