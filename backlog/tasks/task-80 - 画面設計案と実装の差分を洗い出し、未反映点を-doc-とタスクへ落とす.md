---
id: TASK-80
title: 画面設計案と実装の差分を洗い出し、未反映点を doc とタスクへ落とす
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-04 10:11'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 先行して積んだ差分 (画面設計案 02、TASK-73 の目視より。2026-08-04)

TASK-73 の目視でユーザーが見つけた差分のうち、TASK-113 (区画の並び・全面の列構成) に束ねなかった 2 件。
どちらも触る契約が TASK-113 とは別なので、ここで分類する。

- **ACCEPTANCE CRITERIA の達成割合バー** — 原文は常設区画の罫線の位置に達成数 (`2 / 3`) と達成割合の
  バーを入れる (doc-12 §3)。実装は達成数だけを持ちバーが無い。doc-8 §3 の割当表は AC の内容を
  「`#N` 項目と checked 状態、達成数」とし、バーに触れていない。
- **通常ラベルを TYPE 区画の中の小見出しとして描くこと** — 原文は通常ラベルに罫線付きの区画見出しを
  与えず、TYPE 区画の中の小見出しにしている (doc-12 §3)。doc-8 §4 は Type と通常ラベルを別区画として
  出すことを AC の要請から定めているので、実装は別区画のままにしてある。意図的に外れる側の候補。
<!-- SECTION:NOTES:END -->
