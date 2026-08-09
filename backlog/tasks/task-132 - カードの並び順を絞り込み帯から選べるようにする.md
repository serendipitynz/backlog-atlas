---
id: TASK-132
title: カードの並び順を絞り込み帯から選べるようにする
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
updated_date: '2026-08-09 05:22'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: high
ordinal: 129500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。現在セル内の並びは `swimlane.ts` の `compareCards` が固定で持ち (priority 降順 → ordinal 昇順 → updated_date 新しい順、doc-7 §5)、利用者は変えられない。絞り込み設定帯から並び順を選べるようにする。

ユーザーが挙げた順序:
- priority 降順 (既定: HIGH > MED > LOW > none) / 昇順 (none > LOW > MED > HIGH)
- task id 昇順・降順
- updated date 昇順・降順
- created date 昇順・降順
- milestone 昇順・降順

**決定先行**: doc-7 §5 が並びを「セル内の安定並び」として固定で定めており、選べるようにするのは契約の変更である。決めることは 3 つ — 選んだ並びをアプリ設定へ永続するか (カードサイズ・詳細配置は永続する)、同順のときに何を第 2 キーにするか (現在の 3 段のうち残す段)、値を持たないタスク (milestone 不在・priority 不在) をどちらの端へ置くか。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 絞り込み帯から並び順を選べ、選んだ順でセル内のカードが並ぶ
- [ ] #2 priority・task id・updated date・created date・milestone の 5 属性について昇順・降順が選べる
- [ ] #3 選んだ並びが同順になったときの決定的な比較規則が順序ごとに決まっており、doc-7 §5 に書かれている
- [ ] #4 値を持たないタスクの置き場が順序ごとに決まっており、doc-7 §5 に書かれている
- [ ] #5 既定の並びが現在の `compareCards` と同じ順序（priority 降順 → ordinal 昇順 → updated_date 新しい順）を保っており、3 段とも試験がある
- [ ] #6 選んだ並びをアプリ設定へ永続するかどうかが決まり、理由が doc-7 §5 に書かれている
<!-- AC:END -->
