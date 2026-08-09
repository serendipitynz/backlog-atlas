---
id: TASK-130
title: メニューの余白・無効化の見え方・一覧を開く行の語を直す
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
labels:
  - ui
  - 'kind:chore'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-7 - プロジェクト別スイムレーン画面-設計.md
priority: high
ordinal: 127500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック 3 件。どれも固定ヘッダのメニュー (`HeaderMenu.svelte`・`header.ts`) の中で閉じる。

① メニューの幅が `min(24rem, 90vw)` 固定で、行の文字数に対して右側が大きく空く (`menu1.png`)。24rem は TASK-67 が表を持っていた頃の幅で、表を `ShortcutHelp.svelte` へ移した後も残っている。
② 「行非表示をすべて戻す」は非表示の行が無いとき無効化され、doc-11 §5 の破線枠が出る。戻す行があるときは枠が消えるので、利用者にはメニューの区切り線が現れたり消えたりして見える (`menu2.png`)。ユーザーの指摘は「一貫性を保て」。無効化提示そのものは doc-11 §5 の契約なので、変えるのは枠の見え方ではなく、行の群を分ける印を無効化と無関係に持たせるかどうかである。
③ 「キーボード操作表示…」を「キーボード操作一覧」にする。`header.ts` の `SHORTCUT_HELP_LABEL` が `…` を付けた理由 (行が一覧そのものではなく一覧へ導くこと) をユーザーの語で上書きする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 メニューの幅が、そこに並ぶ行の内容から決まっている
- [ ] #2 行の群を分ける印が、無効化されているかどうかで現れたり消えたりしない
- [ ] #3 一覧モーダルを開く行の語が「キーボード操作一覧」である
- [ ] #4 doc-7 §2.1 のメニュー行の語が実装と一致している
<!-- AC:END -->
