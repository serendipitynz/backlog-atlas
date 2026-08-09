---
id: TASK-138
title: 押せない控えのマウスカーソルを変えるのをやめる
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
updated_date: '2026-08-09 05:22'
labels:
  - ui
  - design-system
  - 'kind:chore'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
priority: high
ordinal: 135500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。押せない控えにマウスを載せると `?` カーソルになるが、ツールチップが出るわけではないので混乱する、という指摘。「押せないボタンに対してカーソル変更はしなくてよいかも」。

**決定先行**: `cursor: help` は doc-11 §2.3・§5 の無効化提示 3 点 (破線枠・opacity .45・`cursor: help`) の 1 つで、`app.scss` の 1 箇所が全画面ぶんをまとめて持っている。さらに画面設計案 06 の契約 #9 が同じ 3 点を挙げている (doc-12 §7.1) ので、落とすのは原文からの意図的な逸脱になる。

ユーザーの指摘の前提は「何も起きない」だが、`app.scss` の註は `cursor: help` を `title` と対で置いており、`title` を持つ控えでは実際にツールチップが出る。**どの控えが `title` を持ち、どれが持たないかを先に数える** — 「何も起きない」のが一部なら、落とすのは `cursor: help` ではなく `title` の欠落のほうかもしれない。数えた結果を添えて、3 点のうち何を落とすかを決める。

印チップ (doc-11 §3) とカードの図形も `cursor: help` を持つが、これらは押せない控えではなく説明を持つ印なので対象が違う。落とす範囲をどちらかに決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 押せない控えに `cursor: help` を与えていない
- [ ] #2 無効化提示として残る点が doc-11 §2.3・§5 に書かれている
- [ ] #3 押せない控えのうち `title` を持つものと持たないものを数えた結果が Implementation Notes にある
- [ ] #4 印チップ（doc-11 §3）とカードの図形の `cursor: help` を対象に含めるかどうかが決まり、理由が doc にある
- [ ] #5 画面設計案 06 の契約 #9 からの逸脱として doc-11 に理由が記録されている
<!-- AC:END -->
