---
id: TASK-52
title: 上部帯を重要度の固定順で積む
status: To Do
assignee: []
created_date: '2026-07-28 23:16'
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
- [ ] #1 確認・継続検出停止・通知・行非表示を doc-11 §4 の固定順で積む（出現順にしない）
- [ ] #2 確認と継続検出停止に閉じる操作を置かない（回答・再読込で消える）
- [ ] #3 通知だけが × で閉じられる
- [ ] #4 行非表示の帯に族の色を与えない（利用者が自分で隠した中立の状態として出す）
- [ ] #5 CLI 縮退と台帳読取専用も帯として出し、個々の操作の無効化理由と重複してよい（ホバーできない環境で理由に到達できなくならないため）
<!-- AC:END -->
