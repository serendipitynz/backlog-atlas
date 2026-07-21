---
id: TASK-4
title: プロジェクト台帳と横断タスクIDを設計する
status: Done
assignee: []
created_date: '2026-07-21 08:49'
updated_date: '2026-07-21 09:39'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-2
documentation:
  - doc-2
  - doc-1
  - doc-3
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
登録された複数プロジェクトを管理するプロジェクト台帳を設計する。保存場所・形式、Backlog ルートの登録・削除、project-slug と Backlog ルート／プロジェクトルートの対応、Git remote 有無などの台帳属性を含む。横断タスクID <project-slug>:<TASK-ID> の生成・解析・表示規則、および『プロジェクトはタスクを読み込んだ Backlog ルートから決定する』規則（project:<slug> ラベルは使わない）を定める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 台帳の保存場所・形式と、Backlog ルートの登録・削除手順を定義している
- [x] #2 台帳エントリの属性（slug、project root、Backlog root、Git remote 有無）を定義している
- [x] #3 横断タスクID の生成・解析・表示規則と、Backlog ルートからのプロジェクト決定規則を定義している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
台帳ファイルを Tauri app_config_dir 直下の単一 TOML（projects.toml, schema_version 付き）と定め、Backlog 管理ファイルとは別経路で Atlas が読み書きする境界を明示。台帳エントリ属性を slug（一意・不変）・project_root・backlog_root・git_remote_present の 4 つに固定。Backlog ルートの登録（ルート解決→slug 一意性→remote 判定→追記）・削除（対象に触れず登録から外す）・更新手順を定義。横断タスクID は <slug>:<TASK-ID> を最初の : で解析（slug が : を含まない前提で一意）、生成は保存せず slug＋frontmatter id から都度導出、表示は横断面で slug 前置・正本側は TASK-N のまま。プロジェクト決定は読み込んだ Backlog ルート↔台帳エントリの 1 対 1 対応で行い project:<slug> ラベルは使わない。設計は doc-3。
<!-- SECTION:NOTES:END -->
