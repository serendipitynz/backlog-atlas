---
id: TASK-31
title: Backlog 更新アダプター（操作写像・引数配列・CLI 失敗処理）を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-26
  - TASK-28
priority: high
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5 の設計に従い、Atlas の更新操作を対象プロジェクトを作業ディレクトリとする Backlog CLI 呼び出しへ変換するアダプターを実装する。管理対象 Markdown を直接書き換えず、書き換えるのは Backlog CLI である（decision-2・AGENTS）。CLI は v1.47.1 を動作確認済み範囲とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task create/edit（title/description/status/label/AC 増減・チェック/AC 差し替え複合/ref 非空全置換/plan/notes/depends）と draft promote/archive・task demote/archive/complete・doc/milestone の操作写像を実装する
- [ ] #2 current_dir に project_root を固定し、各引数を配列要素として渡す（シェル非連結）
- [ ] #3 終了コードで成否判定し、CLI 失敗時はドメインモデルを変えず stderr を失敗理由として保持する
- [ ] #4 複数サブコマンドに分ける操作は途中失敗で以降を中止し、再読込で観測できる状態にする
- [ ] #5 v1.47.1 に無い操作（マイルストーン説明更新・AC単一差し替え・ref 空集合化）を提供せず、未知オプションは起動前に拒否する
- [ ] #6 起動時に backlog --version で書き込み CLI の版を取得し、動作確認範囲（v1.47.1）の能力・オプションを検査する。CLI 不在・非対応版では更新操作を提供せず読み取り専用に縮退する（decision-7・doc-4 §4）
<!-- AC:END -->
