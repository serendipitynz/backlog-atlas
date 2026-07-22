---
id: TASK-26
title: プロジェクト台帳（projects.toml）の読み書きと登録・削除・更新を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:33'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-25
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 の設計に従い、Atlas が読み込む対象プロジェクトの台帳を実装する。台帳ファイルは Tauri の app_config_dir 直下に単一 projects.toml として置き、いずれの Backlog ルートにも書き込まない。台帳は Backlog CLI の管理対象外であり、Atlas 自身が読み書きする（decision-2 の境界の外側）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 schema_version を検査し、未知の上位版は上書き破壊しないよう読み取り専用で縮退する
- [ ] #2 登録: プロジェクトルート指定から backlog_root を解決し config.yml と tasks/ の存在を確認、slug 導出・一意性検査、git_remote_present 判定を行いエントリを追記する
- [ ] #3 削除: slug 指定でエントリを外し、対象プロジェクトの管理ファイル・Git には触れない
- [ ] #4 更新: slug は不変、backlog_root・git_remote_present（再判定）・status_aliases・表示並び順を変更できる
- [ ] #5 status_aliases は任意（省略時は空）で、値は正準4列のいずれかに限る
- [ ] #6 同一プロジェクトの移動では slug を保ったまま project_root と backlog_root の両方を更新する（doc-3 §4.3）
- [ ] #7 横断タスクID の生成・解析を実装する: 最初の : で分割、左辺 slug を台帳で検査、右辺を task_prefix の通常 ID または DRAFT-N で検査、単一プロジェクト文脈でのみ無修飾 ID を許可（doc-3 §5）
- [ ] #8 slug 契約を実装する: 既定は project_root 由来で導出、利用者指定の別 slug を許可、[a-z0-9][a-z0-9-]*（コロン・空白禁止）と台帳内一意性を検査する（doc-3 §3.1）
<!-- AC:END -->
