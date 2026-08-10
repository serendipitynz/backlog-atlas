---
id: TASK-138
title: 押せない控えのマウスカーソルを変えるのをやめる
status: Done
assignee: []
created_date: '2026-08-09 05:02'
updated_date: '2026-08-10 21:55'
labels:
  - ui
  - design-system
  - 'kind:chore'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
priority: high
ordinal: 135500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。押せない控えにマウスを載せると `?` カーソルになるが、ツールチップが出るわけではないので混乱する、という指摘。「押せないボタンに対してカーソル変更はしなくてよいかも」。

**決定先行**: `cursor: help` は doc-11 §2.3・§5 の無効化提示 3 点 (破線枠・opacity .45・`cursor: help`) の 1 つで、`app.scss` の 1 箇所が全画面ぶんをまとめて持っている。さらに画面設計案 06 の契約 #9 が同じ 3 点を挙げている (doc-12 §7.1) ので、落とすのは原文からの意図的な逸脱になる。

**押せない控えから `cursor: help` を落とすことは確定である**（ユーザーの指示。AC #1）。棚卸しで決めるのは残りの 2 つで、①`title` を持たない控えがどれだけあるか — `app.scss` の註は `cursor: help` を `title` と対で置いており、`title` が無い控えではカーソルだけが何かを約束していたことになるので、カーソルを落とした後に`title` を足す先がそこから決まる。②印チップとカードの図形（doc-11 §3）も `cursor: help` を持つが、これらは押せない控えではなく説明を持つ印なので、同じ扱いにするかどうかを決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 押せない控えに `cursor: help` を与えていない
- [x] #2 無効化提示として残る点が doc-11 §2.3・§5 に書かれている
- [x] #3 押せない控えのうち `title` を持つものと持たないものを数えた結果が Implementation Notes にある
- [x] #4 印チップ（doc-11 §3）とカードの図形の `cursor: help` を対象に含めるかどうかが決まり、理由が doc にある
- [x] #5 画面設計案 06 の契約 #9 からの逸脱として doc-11 に理由が記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 棚卸し（AC #3）

`disabled` または `aria-disabled` を束縛する markup の**記述**を数えた（画面に出る控えの個数ではない —
`{#each}` の中の 1 記述は行数ぶんの控えを描く）。対象は `app.scss` の無効化提示が選ぶ 5 セレクタで、
`button` / `input` / `select` / `textarea` である。

- **合計 50 件**（button 45・input 4・select 1・textarea 0）。
- **`title` 属性を持つ 39 件 / 持たない 11 件。**
- そのうち、**押せないときに `title` が保留理由を運ぶのは 37 件**。残り 2 件は押せないときも動作の名を
  出す（`HeaderMenu.svelte:99` は行の note、`ProjectDetail.svelte:1485` は静的な「この行を削除」）。
- したがって**カーソルが予告した説明がそこに無いのは 13 件**（`title` 属性を持たない 11 件 ＋ 保留理由ではなく動作の名を出す 2 件）である。

**13 件とも doc-11 §5 の到達経路を既に持っており、カーソルを落とした後に `title` を足す先は 1 件も無い。**
9 件（概要区画の `ledgerReadOnly` が掛かる入力と控え）は常時表示の補助文 `OVERVIEW_READ_ONLY_NOTE` が、
残り 4 件（`ProjectDetail.svelte:1437` の再検出・`FilterPopover.svelte:296` の 始端にする・
`HeaderMenu.svelte:99`・`ProjectDetail.svelte:1485`）は `aria-describedby` か同じ補助文が理由を届ける。

## 印の扱い（AC #4）

**印チップ（doc-11 §3）と 印グリフ の `cursor: help` は落とさない**（ユーザーが確定）。理由は doc-11 §5 と
§3 の 1 文ずつが持つ。実装は 4 か所（`Swimlane.svelte:749` の印チップ、`TaskCard.svelte:235`・
`TaskDetail.svelte:2448`・`ProjectDetail.svelte:3352` の印グリフ）で、印チップは `&[title]` に鍵が掛かり、
印グリフは `title={inconsistencyLabel(reasons)}` を無条件に伴う。**「カーソルが変わるのにツールチップが
出ない」という指摘の前提が、この 4 か所では成り立たない。**

## 実測（`_sandbox/app-check/` を WebKit・Chromium で 1280x800。スイムレーン・設定モーダル・タスク詳細）

| 状態 | 押せない控えの cursor | 印の cursor |
|---|---|---|
| 変更前（`cursor: help`） | help | help |
| 宣言を落としただけ | **pointer** | help |
| 採った形（`cursor: default`） | default | help |

**着手して分かったのはこれである。**「カーソルを変えない」を宣言の撤去と読むと、押せる控えを描いている
`cursor: pointer` 30 本（14 の Svelte ファイル）が通り、**押せない控えが「押せる」と約束する手の形になる** —
指摘の裏返しである。`cursor: help` はそれを上書きしていた。無効化提示は地の矢印を明示する形
（`cursor: default`）を採った。**利用者の語が述べているのは見え方であって、宣言の有無ではない。**

素の要素で測った内訳は両エンジンとも、`input:disabled`・`select:disabled`・`textarea:disabled`・
`button:disabled`・`button[aria-disabled]` の 5 つがすべて `default`。**押せる控えは変えていない** —
画面上の 56 件が両エンジンとも `pointer` のままで、有効な `input` も WebKit `auto` / Chromium `text` の
ままである。変わるのは無効側だけである。

**カーソルはスクリーンショットに写らない。**数値が取れるのはここまでなので、目視では実際にホバーして
確かめてもらう。

## doc 改訂

**decision は書いていない。**doc-11 §2.3（表の 無効 の行）・§5（見た目の項、契約 #9 からの逸脱 2 項、
印を落とさない項）・§10、doc-12 §7.1・§7.2・§9。**doc-11 §3 は規則を動かさず、§5 を指す 1 文ずつを
足しただけである。節番号はどれも動かしていない。**

**契約 #9 の 4 点目（`title` 必須）を採っていないことは、2026-08-11 まで逸脱として記録が無かった** —
doc-11 §5 は規則も理由も前から持っていたが、それが画面設計案 06 からの逸脱だという帰属だけが無かった。
ユーザーの確定により、カーソルの逸脱と同じ PR・同じ項で記録した（4 点のうちどれが生きているかを
1 か所で読めるようにするため）。

対応表は `_sandbox/referent-table/referent-table-task-138.md` 第 2 版。
<!-- SECTION:NOTES:END -->
