---
id: TASK-216
title: completed・archive のタスクを盤面へ戻す操作（task restore）を提供する
status: To Do
assignee: []
created_date: '2026-11-11 05:58'
updated_date: '2026-11-11 06:12'
labels:
  - 'kind:feature'
milestone: m-4
dependencies:
  - TASK-208
priority: medium
ordinal: 207700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.54.0 で task restore が入り、archive と completed のタスクを盤面（tasks/）へ戻せるようになった（2026-11-11 に v1.54.0 で実測。TASK-208）。decision-51 §6 は、Atlas が戻す操作を持つかを CLI の版とは別の製品判断として残していた。2026-11-11 にオーナーが提供すると決めた。

TASK-208 が最低バージョン要件を v1.54.0 へ上げたので、タスク詳細の completed・archive に出る理由文 noWayBackFromClosed（「completed・archive から戻す操作は CLI にないため提供しません」、英語版も同旨）は、動作保証のどの版についても偽になっている。本タスクは、restore を状態遷移として操作写像（update.rs の UpdateOperation と allowed_options、wire.ts、edit.ts の transitionOffers）と画面へ足し、noWayBackFromClosed を取り除く。

着手時に測って決めること: restore 後の status と id、References・dependencies の扱い。同じ id の 2 件があるときの拒否（decision-51 §5）。実行前確認（doc-11 §12）の文。doc-9 §4 の更新前競合の検出が、移動元の管理ファイルに掛かること。決定は decision-51 の改訂節か新しい decision に書き、doc-5 §3 の表・§3.2 と doc-8 §6.5（「Atlas に戻す操作が無い」の段落と completed・archive の項）を改める。edit.ts と TaskDetail.svelte の註も、TASK-208 が「Atlas に戻す操作が無い」と書いた箇所を直す。

TASK-208 が入るリリースに本タスクも入れる。入れないと、偽の理由文がそのリリースの画面に残る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タスク詳細の completed・archive のタスクに盤面へ戻す状態遷移が出て、v1.54.0 以上の CLI の task restore で active へ戻る
- [ ] #2 提供する決定と restore 後の status・id・リンクの扱いが decision に書かれ、doc-5 §3・§3.2 と doc-8 §6.5 が改訂されている
- [ ] #3 noWayBackFromClosed が無くなり、completed・archive に出る文が v1.54.0 以上の CLI について真である（和英とも）
- [ ] #4 restore も doc-9 §4 の更新前競合の検出を通り、wire-fixtures と invoke-signature の検査が通る
- [ ] #5 上の 1 と 3 を入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->
