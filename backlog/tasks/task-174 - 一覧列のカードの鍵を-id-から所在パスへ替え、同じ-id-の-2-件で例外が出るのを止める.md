---
id: TASK-174
title: 一覧列のカードの鍵を id から所在パスへ替え、同じ id の 2 件で例外が出るのを止める
status: In Review
assignee: []
created_date: '2026-08-14 12:27'
updated_date: '2026-09-17 00:21'
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
- [x] #1 3 区画の一覧列が、同じ id を持つ管理ファイルを 2 件持つルートでも例外を出さずに描ける
- [x] #2 id で対象を解決している箇所（選択・強調・編集中チップ・閲覧の対象）を数え上げ、鍵の変更で壊れないことを確かめている
- [x] #3 doc-4 §7 の「画面はこの状態を支えていない」の記述が、直した後の状態に合わせて改められている
- [x] #4 重複 id を持つルートを入力にした検査があり、修正を外すと落ちる
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-17。TASK-190 と合併して 1 セッションで実施した（m-4 対応順 #2）。**同型の数え直しは
TASK-190 の Implementation Notes が持つ**（84 件中 12 か所、入口 4 つ）。ここは id で解決している
箇所の数え上げと doc-4 §7 を持つ。

## 鍵を所在パスへ替えた

3 区画の一覧列（`DocumentsSection`・`MilestonesSection`・`DecisionsSection`）に加えて、
**同じ列から選択肢を作っている 3 か所も同型だった** — マイルストーンの付け替え先、新規タスク区画の
マイルストーン選択、タスク詳細のマイルストーン選択。`sourcePath` は 3 種の wire 型がすべて持ち、
1 ルートの中で一意である。

## id で対象を解決している箇所（AC #2）

**20 か所あり、どれも鍵の変更では壊れない** — 鍵は描くための識別子で、これらは値の照合だからである。
壊れないことは `pnpm test` 全体（1,356 件）が緑であることと、新しい 12 case が 2 件とも描いた上で
押せる状態にあることで確かめた。

- `ProjectDetail.svelte` — 選択の保持と解決が 3 区画で各 4 か所（`docSelection = document.id`、
  再押下の抑止、`find((c) => c.id === selection)`、発行後の乖離比較 `session.baseline.id`）。
  加えてマイルストーンだけ操作対象の一致確認（`milestoneSelection !== milestone.id`）と画面文の 1 か所。
- 3 つの区画コンポーネント — カードの強調（`selection === …id`）と 編集中チップ
  （`session?.baseline.id === document.id`）、マイルストーンの保持件数
  （`tasks.filter((view) => view.task.milestone === milestone.id)`）。

**保持件数と付け替え先の値は id のままでよい** — タスクの frontmatter がマイルストーンを id で参照して
おり、CLI に渡すのも id だからである。ここを所在パスへ替えると Backlog のデータモデルと食い違う。

**選択を所在パスへ替えなかったのは意図的である。** `milestone rename` はマイルストーンのファイル名も
書き換える（doc-9 §4.2.1 の実測）ので、所在パスで持つと改称のたびに選択が落ちる。いまは id で持って
いるので改称をまたいで選択が立っており、`ProjectDetail.svelte` がその理由を註に持っている。
**その結果、同じ id の 2 件では先に読まれたほうが開く（先頭一致）** — これは TASK-205 で扱う。

## doc-4 §7（AC #3）

「画面がその 2 件を描けるかは別の話で、支えていない」の項を改めた。**「支えている」とは書いていない** —
描けることと選べることは別で、選択は 先頭一致 のままだからである。節は 2 件とも描くことと、どちらの
カードを押しても先に読まれたほうが開くことを述べ、直す先として TASK-205 を名指す。CLI 経由
（`backlog doc update doc-4 --content`）で書き戻したので、変わったのは当該項と `updated_date` だけ。

## 検査（AC #4）

`src/duplicate-key.component.test.ts` の「同じ id の管理ファイル 2 件」6 case。同じ id を持つ文書・
マイルストーン・決定事項を 2 件持つルートを入力にして、6 か所それぞれを 1 つずつ元の id 鍵へ戻すと
対応する case が赤くなることを確かめてある。付け替え先だけは 3 件（`m-9` と `m-1` 2 件）で組む —
候補は選択中の id を除いて作られるので、同じ id の 2 件を選ぶと候補が空になりその `{#each}` が回らない。

`pnpm test`・`pnpm run check`・`pnpm run lint` の 3 本とも緑。Rust は触っていない。
**画面目視は要らない**（理由は TASK-190 の Notes）。
<!-- SECTION:NOTES:END -->
