---
id: TASK-1
title: Backlog Atlas の専用リポジトリを初期化する
status: Done
assignee: []
created_date: '2026-07-21 00:17'
updated_date: '2026-07-21 00:17'
labels:
  - 'kind:maintenance'
dependencies: []
references: []
documentation:
  - backlog/docs/doc-2 - Backlog-Atlas-開始指示書.md
priority: medium
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog Atlas を実装する専用リポジトリを作成し、Backlog.md を正本として扱うための README とエージェント規約を整える。対象はこのリポジトリ（`backlog-atlas`）自身。このタスクはリポジトリ初期化と運用文書の作成までであり、Tauri/Wails の選定、アプリ本体、Backlog CLI の sidecar 同梱、リモート作成、commit は含めない。詳細は doc-2 を参照する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 指定パスに Git リポジトリがあり、現在のブランチが main である
- [x] #2 README.md、README.ja.md、AGENTS.md、AGENTS.ja.md、.gitignore が作成されている
- [x] #3 両 README は Backlog.md を正本として残し、Backlog CLI 経由で更新する境界を同じ意味で説明している
- [x] #4 両 AGENTS 文書は、Markdown の直接編集を禁じ、Backlog CLI とタスク ID による Git 履歴参照を指示している
- [x] #5 依存関係、アプリ本体、sidecar 同梱、リモート、Git commit を作らずに初期化結果を確認している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
リポジトリを main で初期化し、README.md / README.ja.md / AGENTS.md / AGENTS.ja.md / .gitignore を作成。両 README・両 AGENTS は正本の配置と Backlog CLI 委譲の境界を英日一対一で記述。初期化時点では依存関係・アプリ本体・sidecar・リモート・commit を作らず結果を確認済み（README/AGENTS の commit はその後の明示依頼で別途作成）。
<!-- SECTION:NOTES:END -->
