---
id: TASK-201
title: デザイントークンの参照が実在するかを走査する
status: To Do
assignee: []
created_date: '2026-08-27 23:43'
updated_date: '2026-08-27 23:44'
labels:
  - test
  - ui
  - 'kind:chore'
milestone: m-4
dependencies:
  - TASK-83
priority: low
ordinal: 192700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`var(--…)` が実在する **デザイントークン**（doc-11 §2）を指しているかを確かめる走査を置く。**入力は `src/` の `.svelte` と `.scss` のスタイル全部である。**

**起票の由来は TASK-83 の実機目視である**（2026-08-28、オーナー）。サブメニューの CSS が `var(--border)` と `var(--warn)` を書いており、**どちらも `app.scss` に無いトークンだった**。**CSS は無効値のとき宣言ごと捨てる**ので、`border: 1px solid var(--border)` は枠を 1 本も描かず、`color: var(--warn)` は色を変えなかった。**画面は「不自然」に見えるだけで、どの検査も赤くならなかった。**

**この型が静かに通る理由は 2 つある。** ①`pnpm run check` は Svelte の `<style>` の中の CSS を型検査しない。②`pnpm run lint` は Biome で規則 1 つ（`style/useBlockStatements`）だけを有効にしており、CSS を読まない（decision-32）。**したがって現在この木にトークン名を確かめる機構は無い。**

**着手時に数え直すこと。** TASK-83 の回に測った時点では、外していたのは上記 2 つだけだった（`app.scss` の定義 23 個、`var()` での参照 50 個、コンポーネント側でローカルに定義しているもの 37 個）。**「未解決」に見えて正しいものが 13 個ある** — inline の `style="--x: …"` で与えているもの（`--section-nav-width`・`--panel-padding` など）で、**走査はこれを偽陽性にしてはならない。** これが本タスクの主な難所である。

**決めることが 2 つある。**

- **どこに置くか。** 既存の走査（`screen-text.test.ts`・`comment-citation.test.ts`・`sandbox-reference.test.ts`）と同じ `unit` の一員にするのが素直だが、**入力がソースの木そのもの**である点はあの 3 本と同じなので、あちらの読み方（ファイルを読んで正規表現で当たる形）を踏襲できるかを見る。
- **inline で与える名前をどう扱うか。** `style="--x: …"` の宣言を走査自身が集めるか、あるいは「inline で与える名前は `app.scss` の隣に宣言する」といった規約を先に置くか。**前者は走査の側が 2 つの構文を読むことになり、後者は規約を守る機構が要る。** どちらを採るかは着手回の判断で、決めたら doc-11 §2 か decision-32 のどちらに書くかも併せて決める。

**m-4 とした理由**: 走査そのものは利用者が受け取るものを変えない（開発側の検査である）。**TASK-83 が入れた欠陥は既に直っており**、次に出す版に未対応のまま載るものではない。

**依存に TASK-83 を置いてある** — あの回の実測（外していたのは 2 つだけ、偽陽性になりうるのは 13 個）が本タスクの出発点だからである。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/ の .svelte と .scss にある var(--…) の参照が、app.scss のトークンかコンポーネント内の宣言か inline style の宣言のいずれかに解決することを走査が確かめ、解決しない参照で落ちる
- [ ] #2 TASK-83 が外していた 2 つ（--border・--warn）を戻すと走査が落ちることを確かめる
- [ ] #3 inline style で与えている 13 個が偽陽性にならない。inline の扱いをどちらに決めたかと、その置き場（doc-11 §2 か decision-32）が書かれている
<!-- AC:END -->
