---
id: TASK-110
title: Backlog v1.48.0 の type フィールドと decision-5 の Type 導出の食い違いを解消する
status: To Do
assignee: []
created_date: '2026-08-01 07:57'
labels:
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-58
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-58 の実測により、Backlog CLI v1.48.0 が `task create --type` / `task edit --type` を受け取り、frontmatter に `type:` フィールドを書くことが分かった（設定既定の値域は bug・feature・enhancement・task・chore・docs・spike。空値を渡すと解除される）。v1.47.1 には無かったオプションである。

一方 Atlas は decision-5 により Type を `kind:` ラベルの接頭辞除去で導出しており、frontmatter の `type:` を読まない。したがって v1.48.0 の CLI で Type を付けたタスクは、Atlas の画面では Type 不在として表示される。利用者から見ると、CLI で設定した値が反映されない機能欠落に見える。

公開阻害の判定: ユーザーが v0.1.0 までと列挙した範囲には入らないが、未対応のまま公開すると利用者の誤解を招くため公開阻害に当たると判断し m-2 に置く。ただし `type:` は `--type` を明示的に渡したときにだけ書かれ、`task create` の既定では付かない。

このタスクで決めること: `type:` フィールドを読むか、読むなら `kind:` ラベル由来の Type とどちらを優先するか、両方ある場合をどう表示するか（decision-5 は複数 kind・未知値・不在を分けて表示する規則を持つので、その枠組みへ載せる）。既存 decision-5 の判断を変えるので決定先行タスクとして扱い、decision を先に確定してから doc-4・doc-8 と実装へ入る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frontmatter の type: を読むかどうかと、kind: ラベル由来 Type との優先関係を decision として残す
- [ ] #2 decision-5 のどの判断を変えるか（または変えないか）を新 decision 本文に書く
- [ ] #3 doc-4 の読み取り層と doc-8 の Type 表示を決定に合わせて改訂する
- [ ] #4 決定が読み取りを伴う場合、type: を持つタスクの表示を実装しテストで固定する
<!-- AC:END -->
