---
id: TASK-188
title: 画面に残る設計文の写しを数え直して落とす
status: To Do
assignee: []
created_date: '2026-08-16 11:13'
labels:
  - 'kind:chore'
milestone: m-3
dependencies: []
ordinal: 179700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-11 §8 の落とす 4 種のうち **設計文の写し**（設計文書の本文の一文を、指示対象を利用者の側へ置き換えずに画面へ刷ったもの）に当たる画面文を、全画面で数え直して落とす。**日英の両方**が対象である — 写しは 文言表 の 2 ファイルに 1 つずつあるので、片方だけ直すともう片方に残る。

**起票のきっかけはオーナーの目視**（2026-08-16、TASK-184 の英語表示確認）。「slug の説明が長い。他の説明文も同様。ちょっと冗長傾向にありそう。日本語も含め」という指摘で、**冗長さの好みではなく既存の契約違反として扱えることが分かった**ため起票した。

**実例（この 1 件は確認済み）** — プロジェクト詳細の `slugImmutable`。doc-10 §4.1 が画面に要求しているのは 2 点だけである: 「変更するには登録を解除して登録し直すこと」「そのとき履歴表示の同一性が切れること」。ところが画面は doc-10 の**設計上の理由文**（「slug は横断タスクID の左辺として全タスクの参照に使われ」）まで写している。これは doc-11 §8 の 設計文の写し そのものである。

- 現状(EN, 約 45 語): `The slug is the left-hand side of every cross-project task ID, so it is referenced by every task and no way to change it is offered. Using a different one means unregistering and registering again, and the Git history view's identity is broken at that point.`
- 現状(JA): `slug は横断タスクID の左辺として全タスクの参照に使われるため、変更手段を提供しません。別の slug にするには登録を解除して登録し直すことになり、そのとき Git 履歴表示の同一性は切れます。`
- 案(EN, 約 25 語): `It cannot be changed. To use a different slug, unregister and register again — the Git history view's identity is broken at that point.`
- 案(JA): `変更できません。別の slug にするには登録を解除して登録し直すことになり、そのとき Git 履歴表示の同一性が切れます。`

**範囲はオーナーが 2026-08-16 に「doc-11 §8 違反だけ」と確定した。** gui-text-minimal（区画の説明は 1 文、項目ごとの解説は `?` ポップアップへ）まで広げない — あちらは `?` の導線が無い区画に新規実装が要り、doc-10/11 の改訂を伴うので決定先行になる。本タスクは**判定基準が doc-11 §8 に既にあるので争点を持たない。**

**数え方**: 画面文（`ja.ts`）の各文について、その文が doc の本文の一文と同じことを述べていないかを見る。**列挙で始めない** — 文言表 の全項目を舐めて判定する。判定した結果は「落とした / 残した（残した理由）」の両方を記録する。doc が画面に要求している項目そのものは落とさない（doc-11 §8 は書き方の規則であって、掲示要求を無効にしない）。

**文言を押さえている試験も一緒に動く。** 文言表 の 2 ファイルだけで閉じる作業ではない — `src/lib/project-detail.test.ts` は `slugImmutableNote()` が「登録を解除して登録し直す」と「同一性は切れます」の 2 つを含むことを主張しており（`:385`・`:386`）、上の 案(JA) は後者を「同一性**が**切れます」に変えるので、**そのままでは落ちる。** 着手する回は `ja.ts`・`en.ts` を触る前に、落とす文それぞれについて**その文言を主張している試験を grep で探す。** 取得子名（`slugImmutableNote`）でも、文字列の断片でも引ける。**これは列挙ではなく手順である** — ほかにも在りうるので、1 件ずつ数え直す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 画面文のうち doc-11 §8 の 設計文の写し に当たるものを、文言表 の全項目を舐めて判定してある。列挙ではなく網羅であることを、判定した件数と判定基準で示してある
- [ ] #2 当たると判定した文を日英の両方で落としてある。doc が画面に要求している項目は落としていない
- [ ] #3 slugImmutable が doc-10 §4.1 の要求 2 点だけになっている
- [ ] #4 落とした文・残した文とその理由が Implementation Notes に記録してある
<!-- AC:END -->
