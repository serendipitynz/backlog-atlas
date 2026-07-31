---
id: TASK-52
title: 上部帯を重要度の固定順で積む
status: In Review
assignee: []
created_date: '2026-07-28 23:16'
updated_date: '2026-07-31 08:50'
labels:
  - 'kind:refactor'
milestone: m-1
dependencies:
  - TASK-50
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-11 §4 と doc-7 §5.3 は、フィルタ帯の下に積む告知（確認・継続検出停止・通知・行非表示）を、出現順ではなく重要度の固定順で積むと定めた。現行 `App.svelte` は notice・confirm・unwatched・hidden-rows をマークアップの記述順で出しており、帯が積まれるほど回答待ちの確認が下へ押し出されうる。順序を固定し、閉じられる帯と閉じられない帯を分ける。継続検出停止と確認に閉じる操作を与えないのは、無視できる形にすると「継続検出が止まったまま古い表示を見続ける」経路ができるためである。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 通知だけが × で閉じられる
- [x] #2 行非表示の帯に族の色を与えない（利用者が自分で隠した中立の状態として出す）
- [x] #3 CLI 縮退と台帳読取専用を独立した帯として doc-11 §4 の位置（② と ③）に置き、同時に立ちうる帯を 6 本までに保つ
- [x] #4 上部帯 6 種を doc-11 §4 の固定順で積み、出現順にしない
- [x] #5 確認・CLI 縮退・台帳読取専用・継続検出停止に閉じる操作を置かない（回答・復旧・再読込で消える）
<!-- AC:END -->
