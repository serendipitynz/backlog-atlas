---
id: TASK-67
title: メニューをアイコンのみにし、キーボード操作を一覧モーダルへ移す
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
priority: high
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
メニューのボタンを lucide の menu アイコンだけにする（文言なし）。キーボード操作の一覧をメニューの中に常設するのをやめ、「キーボード操作表示...」というメニュー項目にして、選ぶとモーダルで一覧を出す。lucide は依存を増やさず、必要な SVG を src/lib/icons/ にインラインで持つ（ISC ライセンス、再配布可）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 メニューの開閉ボタンが lucide menu アイコンのみで、aria-label で用途が読める
- [ ] #2 メニューに「キーボード操作表示...」があり、選ぶとキーボード操作一覧がモーダルで出る
- [ ] #3 メニュー本体にキーボード操作の一覧が常設されていない
- [ ] #4 アイコンは src/lib/icons/ のインライン SVG で、production dependency が増えていない
<!-- AC:END -->
