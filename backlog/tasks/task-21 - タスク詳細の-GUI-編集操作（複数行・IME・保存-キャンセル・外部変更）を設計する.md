---
id: TASK-21
title: タスク詳細の GUI 編集操作（複数行・IME・保存/キャンセル・外部変更）を設計する
status: Done
assignee: []
created_date: '2026-07-21 20:41'
updated_date: '2026-07-22'
labels:
  - 'kind:feature'
milestone: m-0
dependencies:
  - TASK-12
  - TASK-14
documentation:
  - doc-8
priority: medium
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8:56 は編集対象の列挙にとどまり、元要望中核の GUI 編集操作を設計していない。複数行入力、マウス選択・置換、全選択、日本語 IME 変換確定中の Enter の扱い、明示保存・キャンセル、未保存入力と外部変更（doc-9 競合）の扱いを、doc-8 の受入条件として設計する。（設計レビュー P2）

編集部品の第一候補は Ace とする（serenebach に vendored + textarea フォールバックの導入実績があり、日本語入力の実績と BSD 3-Clause の同梱手順も既知）。素の textarea を基本形として Ace へ昇格する serenebach のパターンを流用し、Ace 読込失敗時も編集不能にしない。

あわせて、外部エディタで開く経路を設計に含める。タスクファイルを直接開く方式は Atlas 自身が書かないため doc-2 の境界（管理対象 Markdown を直接編集しない）を破らず、書き戻しは doc-9 の外部変更検出で拾える。frontmatter が利用者へ露出する難点と、一時ファイル + Backlog CLI 書き戻し方式（エディタ終了検知が要る）との比較は、本タスクの設計時に確定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 複数行入力・マウス選択/置換・全選択の編集操作を定義している
- [x] #2 日本語 IME 変換確定中の Enter と保存の切り分けを定義している
- [x] #3 明示保存・キャンセル、未保存入力と外部変更（doc-9 競合）の扱いを定義している
- [x] #4 外部エディタで開く経路（開く対象・書き戻し・doc-9 競合との関係）を定義している
<!-- AC:END -->
