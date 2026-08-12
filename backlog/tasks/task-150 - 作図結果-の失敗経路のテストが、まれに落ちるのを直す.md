---
id: TASK-150
title: 作図結果 の失敗経路のテストが、まれに落ちるのを直す
status: To Do
assignee: []
created_date: '2026-08-12 00:00'
labels:
  - 'kind:bug'
  - test
milestone: m-3
dependencies: []
priority: medium
ordinal: 144700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/lib/markdown-figure.component.test.ts の 1 件『keeps the fence inside the 本文 and adds nothing outside it』が、フルスイートの実行でまれに落ちる。TASK-96 のセッション (2026-08-12) の実測は、フルスイート 11 回中 1 回の失敗で、落ちたのはそのセッションの最初の 1 回だけだった。その回だけ environment 29.32s・import 11.93s と他の回の 5〜8 倍かかっており、時間に依存した失敗と見える。単独実行では 10 回中 0 回、node_modules/.vite と .vite を消したうえでのフルスイートでも 3 回中 0 回で、要求して再現させることはできていない。

このテストが押さえている契約は doc-11 §14.5 の『描けなかった作図結果 は本文の外に何も残さない』で、mermaid の suppressErrorRendering が document.body へ自分の入れ物を挿さないことを検査している。まれに落ちるままだと、TASK-101 が作るリリースワークフローが CI で pnpm test を実行したときに、変更と無関係にタグの発行が止まりうる。

公開阻害には当たらないと判断した (利用者の誤解・データ損失・操作不能を招かず、公開の差し戻しにもならない。CI が止まっても再実行で通る) ため m-3 に置く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 落ちる条件が実測で特定されている (何が時間に依存しているのか、mermaid の初期化・vitest の待ち・jsdom のいずれか)
- [ ] #2 同じ契約を、時間に依存しない形で押さえ直すか、待ちを明示して安定させるかのどちらかになっている
- [ ] #3 フルスイートを連続 20 回実行して 0 回落ちることを実測している
<!-- AC:END -->
