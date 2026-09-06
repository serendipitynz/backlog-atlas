---
id: TASK-204
title: 操作の結果を短いフェードで示す規約を doc-11 に定め、実装する
status: To Do
assignee: []
created_date: '2026-09-05 23:59'
labels:
  - ui
  - design-system
  - 'kind:feature'
milestone: m-4
dependencies:
  - TASK-201
priority: medium
ordinal: 195700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
利用者の要求（2026-09-06）。派手な動きは要らないが、操作に対する画面の返事として短いフェードを入れ、どこが変わったのかを利用者が読み取れるようにする。v0.3.0 に入れる。

## いま木にある動きは 2 か所だけである

`src/components/Swimlane.svelte` の 列間ドロップ の着地強調（`landed-fade`、1.6s、`animationend` で class を外す）と、`src/components/task-detail/Heading.svelte` の コピー成功 のフェード（`--copy-fade` を CSS の transition とスクリプトのタイマーで 1 つの数として持つ）である。 CSS の `transition:` と `animation:` の宣言は木に合わせて 2 つしか無い。

どちらも押下の一回きりの返事であって、常時掛かる transition ではない。 Swimlane の註はそれを選んだ理由を持ち、Heading の註は「休んでいる間は transition を持たない」理由を持ち、`TaskCard.svelte` は保留中の見せ方に animation ではなく `--faint` を選んだ理由を持つ。 新しい節はこの 3 つの判断を材料にできる。

doc-11 には動きの節が無く、§2.2 の寸法トークンに時間もイージングも無い。 そして `prefers-reduced-motion` を読む箇所は木に 0 件である。 動きを増やすほど、この 2 つの不在が効く。

## 決めること（実装より先に確定する）

doc-11 へ節を足すので、契約を先に決める。

- どの変化に動きを付けるか。 候補は、モーダルの開閉（doc-11 §7）・値一覧ポップオーバーの開閉（doc-7 §5.2）・タスク詳細パネルの開閉・上部帯の通知の出入り（doc-11 §4）・絞り込みによるカードの出入り・行折畳み。 全部には付けないことを先に決める。
- どの変化に付けないか、その理由。 上の 3 つの既存の判断が、そのまま新しい節の判断材料である。
- 時間とイージングをトークンにするか。 するなら doc-11 §2.2 へ行が増え、TASK-201 のトークン走査に載る。
- `prefers-reduced-motion` をどう扱うか。 動きを消すか、短くするか。 OS の設定を読む箇所が木に無いので、これは新しい依存ではなくメディアクエリ 1 つで済む。
- 語。 動きに関する語を doc-1 と m-4 の対応表へ足してから本文と画面文を書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc-11 に動きの節が足され、どの変化に動きを付けどれに付けないかと、その理由が書かれている
- [ ] #2 既存の 2 か所（列間ドロップの着地強調・コピー成功のフェード）が新しい節とどういう関係にあるかが書かれている
- [ ] #3 prefers-reduced-motion を尊重する経路があり、動きを止めた状態でも操作の結果が画面から読める
- [ ] #4 時間とイージングをトークンにする場合、doc-11 §2.2 に載り、TASK-201 の走査と食い違わない
- [ ] #5 付けた動きが派手ではない水準に収まっていることを、画面目視でユーザーが確認している
<!-- AC:END -->
