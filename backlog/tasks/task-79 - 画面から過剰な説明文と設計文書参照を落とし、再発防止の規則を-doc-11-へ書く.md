---
id: TASK-79
title: 画面から過剰な説明文と設計文書参照を落とし、再発防止の規則を doc-11 へ書く
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - design-system
  - 'kind:refactor'
milestone: m-2
dependencies:
  - TASK-62
  - TASK-63
  - TASK-66
  - TASK-67
  - TASK-68
  - TASK-71
  - TASK-72
  - TASK-73
  - TASK-74
  - TASK-76
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
priority: high
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
「絞り込みは既定のままです。戻す条件も解除する条件もありません。」のような説明的な内容が設定画面・プロジェクト詳細を中心に散見される。そのような説明が必要だと感じる時点で UI として問題がある。必要な説明は残す（プロジェクトの登録解除のように、押した結果が取り返しにつくかどうかを述べるもの）が、状態を読めば分かることの言い換えは落とす。残すものはツールチップへ移して実操作のノイズを抑える。doc-3 §4.2 のような設計文書の節参照は利用者に意味がないので全廃する。設計文の一文がそのままボタンラベルになっている箇所（GitHistory.svelte の「全面シングルビューで全件と関連解決の状態を読む」など。画面設計案 02 では「全面表示で開く →」）も同種の問題として直す。個別画面ぶんは各画面のタスクの受入条件で片付け、このタスクは残余の一掃と規則の明文化に絞る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 画面に doc-N §X 形式の設計文書参照が 1 つも出ていない
- [ ] #2 設計文の一文をそのままラベル・説明にしている箇所が無くなっている
- [ ] #3 残した説明について、残す判断の基準が doc-11 に書かれている
- [ ] #4 ツールチップへ移したものが、キーボードとスクリーンリーダーから読める
<!-- AC:END -->
