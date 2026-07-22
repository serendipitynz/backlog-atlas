---
id: TASK-39
title: 台帳・プロジェクト登録・管理画面を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:29'
updated_date: '2026-07-22 12:33'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-33
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 §4 の台帳操作（登録・削除・更新）に対応する利用者向け GUI 面を実装する。README scope の「複数プロジェクトの登録・管理」の入口。台帳ファイルは Atlas が読み書きし、いずれの Backlog ルートにも書き込まない（doc-3 §2.1、decision-2 の境界の外側）。バックエンドは TASK-26、公開は TASK-33 のコマンド境界を用いる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 台帳エントリ一覧を表示し、登録（プロジェクトルート/Backlog ルート指定→backlog_root 解決・config.yml/tasks 確認・slug 導出/一意性検査・git_remote_present 判定）を GUI から行う（doc-3 §4.1）
- [ ] #2 削除（slug 指定でエントリ除去、対象プロジェクトの管理ファイル・Git に触れない）を GUI から行う（doc-3 §4.2）
- [ ] #3 更新（backlog_root・git_remote_present 再判定・status_aliases・表示並び順、slug 不変、同一プロジェクト移動は project_root と backlog_root の両方更新）を GUI から行う（doc-3 §4.3）
- [ ] #4 台帳ファイルの読み書きは Atlas が行い、いずれの Backlog ルートにも Atlas の登録情報を書き込まない（doc-3 §2.1）
- [ ] #5 登録失敗（ルート読取不能・slug 衝突）を理由付きで提示する（doc-3 §4.1）
- [ ] #6 slug は project_root 由来の既定を導出しつつ利用者が別 slug を指定でき、[a-z0-9][a-z0-9-]*（コロン・空白禁止）を検査する。衝突・不正時は別 slug 指定で回復させる（doc-3 §3.1）
<!-- AC:END -->
