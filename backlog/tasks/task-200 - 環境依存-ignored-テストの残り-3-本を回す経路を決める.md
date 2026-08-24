---
id: TASK-200
title: 環境依存 ignored テストの残り 3 本を回す経路を決める
status: To Do
assignee: []
created_date: '2026-08-24 00:51'
labels:
  - test
  - rust
  - 'kind:chore'
milestone: m-4
dependencies:
  - TASK-108
priority: low
ordinal: 191700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
環境の性質を主張するために既定実行から外してある ignored テストは 4 本ある（`cargo test` が報告する ignored 8 本のうち、残る 4 本は 規模計測 で別族）。TASK-108 が経路を用意したのは監視の 1 本だけで、残る 3 本は誰も回していない。

- `commands.rs` の 2 本 — PATH 上の Backlog CLI を要する（JSON タスク詳細が実物の CLI を通ってファイルへ届くこと、AC 索引の付け替えが意図した条件に当たること）。
- `history.rs` の 1 本 — 認証済み `gh` と github.com への到達を要する。

問いは監視のときと違う。あちらは「プラットフォームが配送するか」だったが、こちらは「そのプログラムを CI が用意できるか」である。`e2e` ジョブは既に `backlog` をグローバル導入しており、`gh` はランナーに載っている — ただしどちらも測っていない。decision-43 の Decision 6 が範囲を監視の 1 本に限った理由と、その §後続への影響 が持つ問いの立て方を出発点にする。

decision-43 の §後続への影響 の最後の項（`#[ignore]` を付ける回はそれを回す経路も同じ回に決める）が、この 3 本が残った原因を述べている。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3 本それぞれについて、CI で回すか手順だけを記録するかが決まっている
- [ ] #2 回すと決めた分は、走ったテストが 1 本であることの確認を含む経路になっている
- [ ] #3 回さないと決めた分は、その理由が decision-43 の範囲の判断と矛盾しない形で記録されている
<!-- AC:END -->
