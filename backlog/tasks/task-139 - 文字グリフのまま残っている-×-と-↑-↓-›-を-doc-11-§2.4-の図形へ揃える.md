---
id: TASK-139
title: 文字グリフのまま残っている × と ↑ ↓ › を doc-11 §2.4 の図形へ揃える
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
labels:
  - ui
  - design-system
  - 'kind:refactor'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: high
ordinal: 136500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-80 の洗い出しで確定した追随項目。doc-11 §2.4 は画面の記号を lucide の図形 (viewBox 24・線幅 2・1em) へ揃えると定めているが、文字グリフのまま残っている箇所が 2 群ある。

① `×` が 3 か所 — 上部帯の通知の閉じる・絞り込みトークンの解除・status 別名表の行削除。doc-11 §7 が「本節はモーダル以外の × を覆わない…TASK-80 が実装と画面設計案の差分としてまとめて扱う」と本タスクへ預けている。図形 `x` は `src/lib/icons/lucide.ts` に既にある。
② `↑`・`↓`・`›` — doc-7 §5.2 が「文字グリフのままで、置き換えの対象に入っていない (doc-11 §2.4 が挙げる 5 タスクのどれもこの 3 つを扱わない。差の当否は TASK-80 が判断する)」と本タスクへ預けている。`arrow-up`・`arrow-down` は既にあり、`›` に当たる図形は追加が要る。

揃える理由は doc-11 §2.4 が既に持っている — 文字グリフは字面と大きさがフォントによって変わり、画面共通の寸法規則に乗らない。**同じ行に並ぶ控えの高さが揃う条件でもある** (TASK-74 の実測: 図形の箱は自分の 1em で、文字の行箱から高さをもらわない)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 上部帯の通知・絞り込みトークンの解除・status 別名表の行削除の × が doc-11 §2.4 の図形になっている
- [ ] #2 ↑ ↓ › が図形になっているか、文字グリフのまま残す理由が doc-7 §5.2 に書かれている
- [ ] #3 画面に文字グリフの記号が残っていないことを数えた結果が Implementation Notes にある
- [ ] #4 doc-11 §7 と doc-7 §5.2 の TASK-80 への預けが閉じている
<!-- AC:END -->
