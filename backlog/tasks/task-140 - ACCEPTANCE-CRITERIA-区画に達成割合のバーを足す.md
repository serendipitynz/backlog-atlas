---
id: TASK-140
title: ACCEPTANCE CRITERIA 区画に達成割合のバーを足す
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: high
ordinal: 137500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-80 の洗い出しで確定した追随項目 (TASK-73 の目視が 2026-08-04 に見つけ、ここへ積んでいたもの)。画面設計案 02 は ACCEPTANCE CRITERIA 区画だけ、常設区画の罫線の位置に達成数 (`2 / 3`) と達成割合のバーを入れる (doc-12 §3、3 図とも)。実装は達成数だけを持ちバーが無い。

doc-8 §3 の割当表は AC の内容を「`#N` 項目と checked 状態、達成数」とし、バーに触れていないので、追随するには割当表の側も書き足す。

罫線の位置に入るので、`DetailSection.svelte` の常設区画の見出し (区画名 + 右へ伸びる細い罫線) の中に置く形になる。doc-11 §2.2 の寸法段階に乗る太さを選ぶ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ACCEPTANCE CRITERIA 区画に達成割合のバーが出る
- [ ] #2 AC が 0 件のときの見え方が決まっている
- [ ] #3 doc-8 §3 の割当表に達成割合のバーが書かれている
- [ ] #4 3 配置とも同じ形で出ている
<!-- AC:END -->
