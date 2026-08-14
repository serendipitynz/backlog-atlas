---
id: TASK-174
title: 一覧列のカードの鍵を id から所在パスへ替え、同じ id の 2 件で例外が出るのを止める
status: To Do
assignee: []
created_date: '2026-08-14 12:27'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
ordinal: 165700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-165 の実測由来（2026-08-14）。**同じ id を持つ管理ファイルが 1 つのルートに 2 件あると、その種別の一覧列が例外を投げて描けない。** オーナーの環境で再現を確認済み（`Svelte error: each_key_duplicate — Keyed each block has duplicate key 'doc-5' at indexes 0 and 1`、`ProjectDetail.svelte`）。

**原因は一覧列のカードの鍵が id であること。** 文書・マイルストーン・決定事項の 3 区画とも `{#each … (…​.id)}` で、Svelte は重複した鍵に対して製品ビルドでも `each_key_duplicate` を投げる（`svelte/src/internal/client/dom/blocks/each.js` を読んで確認）。**読み取り層の側は決着している** — doc-4 §7 が「同じ id を持つ 2 件は読み取り順のまま残る」と定めており、モデルは 2 件とも持っている。**残っているのは画面側だけである。**

**候補は鍵を `sourcePath` へ替えること。** 3 種の wire 型がすべて持っており（`Milestone`・`Document`・`Decision`）、1 ルートの中で一意である。**替えると鍵が変わるので、選択・強調・編集中チップが id で解決している箇所が影響を受けるかを数えること。**

**doc-4 §7 が「画面はこの状態を支えていない」と書いているので、直したらその記述も改める。** 支えるようになった時点で偽になる文である。

**次リリース基準の判定はオーナーが 2026-08-14 に行い、m-4 とした**（CLI は重複 id を作らず、手でファイルを複製したときに生じる状態であるため）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3 区画の一覧列が、同じ id を持つ管理ファイルを 2 件持つルートでも例外を出さずに描ける
- [ ] #2 id で対象を解決している箇所（選択・強調・編集中チップ・閲覧の対象）を数え上げ、鍵の変更で壊れないことを確かめている
- [ ] #3 doc-4 §7 の「画面はこの状態を支えていない」の記述が、直した後の状態に合わせて改められている
- [ ] #4 重複 id を持つルートを入力にした検査があり、修正を外すと落ちる
<!-- AC:END -->
