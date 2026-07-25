---
id: TASK-43
title: コミット・PR 関連解決の参照手段を実装し Git 履歴欄に関連 PR を出す
status: To Do
assignee: []
created_date: '2026-07-25 10:26'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-30
  - TASK-35
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-6 §6 は remote ホスト種別ごとの参照手段（ホストの API 等）を「種別ごとの後追加（別途依存判断）」としており、TASK-30 は PrCommitSource trait の構造だけを固定して実装を送りにした。そのため TASK-35 の Git 履歴欄は関連解決の状態（remote ホスト判別済み／remote 不在／種別判別不能）しか出せず、doc-8 §5 の「各コミットに関連 Pull Request を紐づけて示す」解決済み経路が未達である。GitHub の参照手段を実装し、関連解決結果を Tauri コマンド境界へ通して Git 履歴欄に表示する。新規依存（HTTP クライアント等）の採否は decision として記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GitHub の PR コミット集合取得を実装し remote ホスト種別ごとの参照手段として注入する
- [ ] #2 関連解決結果を Tauri コマンド境界の payload へ通す
- [ ] #3 Git 履歴欄で各コミットに関連 Pull Request を紐づけて表示し、関連なし・参照不能・対象外を区別する
- [ ] #4 新規依存の採否と範囲を decision として記録する
<!-- AC:END -->
