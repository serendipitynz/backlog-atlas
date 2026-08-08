---
id: TASK-129
title: 絞り込みを開く F が、開いた検索欄にも f を入力してしまうのを直す
status: To Do
assignee: []
created_date: '2026-08-08 23:08'
labels:
  - ui
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 126500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 の TASK-125 の目視で起票。`F` は割り当て一覧の `addFilter`（絞り込みを追加・値一覧を開く）で、押すと値一覧ポップオーバーが開き、`FilterPopover.svelte` の $effect が検索欄へフォーカスを移す。ところが同じ行の `preventsDefault` が null なので、シェル（`App.svelte` の window handler）は event.preventDefault() を呼ばない。keydown の既定動作がそのまま進み、その時点でフォーカスを得ている検索欄へ f が 1 文字入る。結果、値一覧は開いた瞬間に「f を含む値」だけへ絞られ、日本語の値では 0 件に見える — 利用者には「絞り込める値が無い」と読める。

doc-7 §2.1 は「既定動作の打ち消し（preventDefault）は、それが要るキーだけに限り、割り当て一覧に明記する」と定めており、この行はそれが要るのに持っていない。**契約の変更ではなく、既存契約に対する欠陥**である。呼び出し側は既に preventsDefault !== null で分岐しているので、直すのは記録の 1 欄。

**同型を数え上げること。**単独キーで、押した先が文字を取る欄へフォーカスを移すものが他に無いかを見る（`toggleMenu` の M はメニューを開くが、フォーカス先がボタンなら文字は入らない。結論は実測で出す）。修飾キー付きの 2 件（⌘N・⌘,）は文字を生まないので当たらない。

TASK-125 とは無関係の既存挙動で、同タスクの目視で見つかったもの。同じ `shortcuts.ts` の記録を触るので、対応順では TASK-125 の隣に置く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 F で値一覧を開いたとき、検索欄に文字が入らない
- [ ] #2 打ち消す既定動作が割り当て一覧に明記されている（doc-7 §2.1）
- [ ] #3 同型（押した先が文字を取る欄へフォーカスを移す単独キーで、打ち消しを持たないもの）が他に無いことを確かめ、結果が記録されている
<!-- AC:END -->
