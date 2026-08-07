---
id: TASK-125
title: キーボード操作一覧の列構成と「両画面」の語を見直す
status: To Do
assignee: []
created_date: '2026-08-07 22:25'
updated_date: '2026-08-07 23:32'
labels:
  - ui
  - design-system
  - 'kind:refactor'
milestone: m-2
dependencies: []
priority: high
ordinal: 122500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-79 の目視で起票。一覧モーダルの「入力欄内」「打ち消す既定動作」の 2 列は利用者に不要、「発火する画面」は「利用可能画面」とすべき、「両画面」という値は何を指すか読めない、という 3 点。doc-7 §2.1 が割り当て一覧の列を「キー・操作・発火する画面・入力欄内で発火するか」と列挙しているので、列を落とすには同節の改訂が要る。TASK-79 は文言の一掃に限ったので分けた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 一覧の列が利用者に要るものだけになっている
- [ ] #2 画面を指す列の見出しと値が、利用者に読める語になっている
- [ ] #3 doc-7 §2.1 の列の列挙が改訂後の構成と一致している
<!-- AC:END -->
