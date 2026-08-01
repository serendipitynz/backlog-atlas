---
id: TASK-76
title: モーダルの閉じる操作を右上の × に統一する
status: To Do
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-01 00:43'
labels:
  - ui
  - design-system
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-74
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
モーダルの閉じるボタンの位置が統一されていない。共通の Modal コンポーネントが閉じる操作を持たず、各利用側が下部や見出し横に「閉じる」というテキストボタンを置いているためである。Modal 自身が右上の × を持ち、全モーダルがそれを使う形にする。文言ではなく × とし、aria-label で用途を示す。設定モーダルの下部固定ボタンとは役割が違う（× は破棄側）ので、両者の関係を doc-11 に書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Modal が右上の × を持ち、全モーダルが同じ位置・同じ見た目で閉じられる
- [ ] #2 × に aria-label があり、キーボードから到達できる
- [ ] #3 × と設定モーダルの「変更せずに閉じる」の役割の別が doc-11 に書かれている
- [ ] #4 各利用側から独自の「閉じる」テキストボタンが消えている（設定モーダル下部の「変更せずに閉じる」は TASK-74 が置く保存対の操作なので対象外）
<!-- AC:END -->
