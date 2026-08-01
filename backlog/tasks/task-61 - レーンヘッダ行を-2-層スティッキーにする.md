---
id: TASK-61
title: レーンヘッダ行を 2 層スティッキーにする
status: To Do
assignee: []
created_date: '2026-07-31 23:29'
updated_date: '2026-08-01 00:37'
labels:
  - ui
  - swimlane
  - 'kind:bug'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: high
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
画面設計案 01 は列ヘッダ行（top:0 / z-index:3 / 高さ 2rem）とレーンヘッダ行（top:2rem / z-index:2）の 2 層をスティッキーにしている。現在の実装は Swimlane.svelte の列ヘッダ 1 層だけがスティッキーで、レーンヘッダ行はスクロールで流れる。プロジェクトを見失うだけでなく、TASK-62 の「このプロジェクトのレーンへ」の着地先が視界外に出る原因にもなっている。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 縦スクロール中、列ヘッダ行とレーンヘッダ行の両方が常に見える
- [ ] #2 レーンヘッダ行が列ヘッダ行の下に重ならず、画面設計案 01 と同じ 2 段の重なり順になる
- [ ] #3 行折畳み・列折畳みの状態を変えてもスティッキーの位置がずれない
<!-- AC:END -->
