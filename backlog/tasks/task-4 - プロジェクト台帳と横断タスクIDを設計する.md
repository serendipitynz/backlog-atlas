---
id: TASK-4
title: プロジェクト台帳と横断タスクIDを設計する
status: To Do
assignee: []
created_date: '2026-07-21 08:49'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-2
documentation:
  - doc-2
  - doc-1
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
登録された複数プロジェクトを管理するプロジェクト台帳を設計する。保存場所・形式、Backlog ルートの登録・削除、project-slug と Backlog ルート／プロジェクトルートの対応、Git remote 有無などの台帳属性を含む。横断タスクID <project-slug>:<TASK-ID> の生成・解析・表示規則、および『プロジェクトはタスクを読み込んだ Backlog ルートから決定する』規則（project:<slug> ラベルは使わない）を定める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 台帳の保存場所・形式と、Backlog ルートの登録・削除手順を定義している
- [ ] #2 台帳エントリの属性（slug、project root、Backlog root、Git remote 有無）を定義している
- [ ] #3 横断タスクID の生成・解析・表示規則と、Backlog ルートからのプロジェクト決定規則を定義している
<!-- AC:END -->
