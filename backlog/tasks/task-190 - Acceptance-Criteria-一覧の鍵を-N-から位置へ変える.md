---
id: TASK-190
title: 'Acceptance Criteria 一覧の鍵を #N から位置へ変える'
status: To Do
assignee: []
created_date: '2026-08-16 21:41'
labels:
  - robustness
milestone: m-4
dependencies: []
ordinal: 181700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の Acceptance Criteria 一覧は `{#each task.acceptanceCriteria as item (item.number)}` と書かれており、**`#N` の一意性を読み取り層が保証していない。**

`parse_ac_item` は行に書かれた番号をそのまま持つので、**手で書いた `- [ ] #1` が 2 行あるとタスク詳細パネルごと落ちる。** Svelte の `each_key_duplicate` は本番ビルドでも throw する。

**2026-08-17 に実測した**（TASK-185 の回。同型だった Definition of Done 側を `?dod=dup` のつまみで測ったもの）。WebKit・全面配置で `pageerror` が 1 件 (`Svelte error: each_key_duplicate`) 立ち、`.detail` そのものが DOM から消えた。位置を鍵にすると 0 件になり、2 行とも描かれる。

**CLI はこの状態を作らない**（`--ac` は max+1 を振る）ので、入口は手編集と外部エディタ経路（doc-8 §7）である。**TASK-185 は自分が足した Definition of Done 側だけを位置鍵にし、こちらは AGENTS の「触っていないコードを直さず起票する」に従って残した。**

**同じ形が他にもあるかを着手時に数え直す** — 一覧を `(item.number)` や `(item.id)` のように内容由来の鍵で回している `{#each}` は、その値の一意性を読み取り層が保証しているかを見る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Acceptance Criteria 一覧が同じ #N を 2 行持っても、タスク詳細パネルが落ちずに両方描かれる
- [ ] #2 内容由来の鍵で回している {#each} を数え直し、一意性を読み取り層が保証していないものが他に無いことを確かめてある
<!-- AC:END -->
