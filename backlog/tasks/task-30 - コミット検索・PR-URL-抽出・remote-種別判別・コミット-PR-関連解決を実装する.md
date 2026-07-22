---
id: TASK-30
title: コミット検索・PR URL 抽出・remote 種別判別・コミット/PR 関連解決を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:07'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-26
  - TASK-28
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-6 の設計に従い、あるタスクについて対応コミット一覧と Pull Request を求め、remote 対応時は両者の関連を解決する参照系を実装する。読み取り専用で、管理ファイルも Git リポジトリも書き換えない。実装手段（gix/git2 crate か Git CLI か）は固定引数・シェル非連結・作業ディレクトリ固定の制約下で選ぶ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 project_root を作業ディレクトリに、素の TASK-ID を語境界照合でコミット検索し新しい順に返す（TASK-1 と TASK-12 の取り違えを抑制）
- [ ] #2 References の URL から PR URL 抽出規則で Pull Request URL を選び、複数 PR を丸めず全て保持する
- [ ] #3 git_remote_present が真かつ remote ホスト種別を判別できた場合のみコミット・PR 関連解決を行う
- [ ] #4 Git remote 不在でもローカルコミット履歴は表示し、縮退させるのは remote 依存機能に限る
- [ ] #5 Git・remote 参照は固定サブコマンドと引数配列で実行し、シェル文字列へ連結しない
<!-- AC:END -->
