---
id: TASK-166
title: 決定事項の status の見せ方を決める
status: To Do
assignee: []
created_date: '2026-08-13 08:34'
updated_date: '2026-08-13 08:36'
labels:
  - ui
  - project-detail
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 159700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-118 の実機目視 (2026-08-13) 由来。ユーザーが backlog browser と比較して **「強いて言えば `accepted` が backlog browser の方が目立っている」** と述べた。あちらは緑のチップとして描き、Atlas は閲覧ヘッダの meta 行とカードに素のテキストで出している。

**これは doc-11 §3 の チップの 4 系統 に触れる判断である。** 現在チップを持つのは印の族(decision-6・decision-22) と priority (decision-23) で、**status に色や形を与えるなら 5 系統目を足すか、既存のどれかに帰属させるかを決めることになる。** 加えて決定事項の status は frontmatter の任意項目で、`accepted`/`proposed` 以外の値も来うる (タスクの status とは無関係。`domain.rs` の`Decision::status` の註)。**未知の値をどう描くかが、色を与える場合の争点になる** — decision-5 のType が未知・不在を分けて描いているのと同じ形の判断が要る。

**TASK-118 では素のテキストのままにした** (契約の変更になるため)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 決定事項の status を色・形で述べるかどうかが決まり、その根拠が doc-11 か decision に書かれている
- [ ] #2 色を与える場合、未知の値と status 未設定の描き方が決まっている
- [ ] #3 表示テーマ 10 組すべてで収録条件を満たすことを実測で確かめた (色を与える場合のみ)
<!-- AC:END -->
