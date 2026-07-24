---
id: TASK-30
title: コミット検索・PR URL 抽出・remote 種別判別・コミット/PR 関連解決を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-24 07:02'
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
- [x] #1 project_root を作業ディレクトリに、素の TASK-ID を語境界照合でコミット検索し新しい順に返す（TASK-1 と TASK-12 の取り違えを抑制）
- [x] #2 References の URL から PR URL 抽出規則で Pull Request URL を選び、複数 PR を丸めず全て保持する
- [x] #3 git_remote_present が真かつ remote ホスト種別を判別できた場合のみコミット・PR 関連解決を行う
- [x] #4 Git remote 不在でもローカルコミット履歴は表示し、縮退させるのは remote 依存機能に限る
- [x] #5 Git・remote 参照は固定サブコマンドと引数配列で実行し、シェル文字列へ連結しない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
コミット検索・PR URL 抽出・remote ホスト種別判別・コミット/PR 関連解決を読み取り専用モジュール src-tauri/src/history.rs に実装した（read/interpret/ledger と並ぶ層）。実装手段は Git CLI を固定サブコマンド・引数配列・作業ディレクトリ固定で呼ぶ方式を選択（既存 ledger の detect_git_remote と同方針、新規依存なし）。コミット検索は git log --grep で大小無視の部分一致で候補を絞り、語境界照合を Rust 側の権威判定にして TASK-1 が TASK-12 を拾う取り違えを抑止した（git の正規表現改行意味論に依存しないため）。search_commits は非 Git リポジトリ(対象不在)と該当0件(該当なし)を別扱いにし、remote 非依存のローカル履歴を常に成立させた（doc-6 §6, AC #4）。関連解決は doc-6 §6 の『種別を鍵に参照手段を選ぶ』構造だけを固定し、PR コミット集合取得を PrCommitSource trait で注入。各 PR を自身の座標で問い合わせ、AC #3 ゲート（project remote 判別）は公開エントリ resolve_task_relations に集約した。GitHub の実ネットワーク実装は §6 の言うとおり種別ごとの後追加（別途依存判断）。PR #6 でレビュー3ラウンド、指摘4件対応の上 approved・merged。
<!-- SECTION:NOTES:END -->
