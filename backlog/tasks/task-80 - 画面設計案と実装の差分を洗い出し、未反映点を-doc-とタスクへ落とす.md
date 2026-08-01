---
id: TASK-80
title: 画面設計案と実装の差分を洗い出し、未反映点を doc とタスクへ落とす
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - design-system
  - 'kind:research'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-12 - 画面設計案の引用箇所転記.md
priority: medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在の UI が画面設計案のビジュアルデザインに合っていないという指摘は個別列挙で受けている。列挙から漏れた差分を取りこぼさないよう、画面設計案 01・02・03・04・05・06・07 と実装を突き合わせて差分を網羅する。差分ごとに、実装が追随すべきもの・意図的に外れたもの（doc を改訂すべきもの）・画面設計案側が古いものへ分け、前 2 者をタスクへ落とす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 画面設計案 7 枚すべてについて差分の一覧がある
- [ ] #2 各差分が 追随する / 意図的に外れる / 画面設計案が古い のいずれかに分類されている
- [ ] #3 追随するものと意図的に外れるものがタスクまたは doc 改訂として起票されている
<!-- AC:END -->
