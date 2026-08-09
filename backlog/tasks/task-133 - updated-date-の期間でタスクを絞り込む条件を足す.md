---
id: TASK-133
title: updated date の期間でタスクを絞り込む条件を足す
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: high
ordinal: 130500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。現在の絞り込みは Type・通常ラベル・priority・assignee・テキスト・不整合・保存区分の 7 ファセット (doc-7 §5) で、日付の条件を持たない。updated date について指定期間のタスクだけを表示する条件を足す。

ユーザーが挙げた形:
- start 〜 end (両端指定)
- start 〜 now (始端指定)
- 〜 end (終端指定)
- in X days / weeks / months (始端指定のショートカット)

**決定先行**: doc-7 §5 のファセット列に 8 つ目を足す。既存の 7 つはすべて「値の集合から選ぶ」形で、値一覧ポップオーバー (検索 + スクロール + 件数) を共通部品として使っている (doc-12 §4.1)。期間は値の集合ではないので、トークンの見え方も値の選び方もこの部品に乗らない。決めるのはその置き方と、トークン 1 つが期間 1 つを表すのか始端・終端で 2 つになるのか、および `in X days` を評価する時点 (絞り込みを掛けた時刻か、画面を開いた時刻か)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 updated date の期間で絞り込め、両端指定・始端指定・終端指定の 3 形が指定できる
- [ ] #2 in X days / weeks / months のショートカットが指定でき、評価する時点が doc-7 §5 に書かれている
- [ ] #3 期間の条件が絞り込みトークンとして帯に出て、既定に戻す と 直前の 1 つを戻す が効く
- [ ] #4 doc-7 §5 のファセット列に本条件が加わっている
<!-- AC:END -->
