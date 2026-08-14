---
id: TASK-169
title: 公開文書が参照する _sandbox/ のパスの扱いを決める
status: To Do
assignee: []
created_date: '2026-08-14 00:34'
labels:
  - docs
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 160700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-102 (2026-08-14 のパブリック化) 由来。**`backlog/decisions/` と `backlog/docs/` の committed 文書が `_sandbox/` 配下を約 140 箇所参照している** (`git grep -oh "_sandbox/[A-Za-z0-9_./-]*" -- backlog/` で数えた。distinct なパスは 58)。`_sandbox/` はリポジトリに入らないので、**公開後の読者はこれを辿っても何も見つからない。**

README は `backlog/decisions/` と `backlog/docs/` を設計の根拠の置き場として読者に示しているので、読者はそこへ来る。

**公開阻害には当たらないと判断して m-3 へ回した** (TASK-102 の回)。理由: 参照されているのは測定スクリプトと対応表で、いずれも**出所の註**であって読者が行動の根拠にする記述ではない。根拠そのものは文書本文が持っている。差し戻し・データ損失・操作不能のいずれも招かない。

**選択肢は少なくとも 3 つあり、どれを採るかがこのタスクの成果物である。**
1. そのままにする — 出所を記録した事実は残る。読者は辿れないが、辿れないことは害ではない。
2. 註の書き方を変える — 「`_sandbox/csp-check/measure-csp.mjs` にある」を「セッションの作業領域で測った」に書き換え、パスを名乗らない。**約 140 箇所の書き換えになる。**
3. 参照されているものをリポジトリへ入れる — 測定スクリプトだけでも `scripts/` へ移す。対応表は別の性質 (先行確定の記録) なので同じ扱いにできない。

**種類ごとに答えが違う可能性がある** — 測定スクリプト・対応表・実装報告書・画像の 4 種が混ざっている。まず種類ごとに数え直す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 参照されている _sandbox/ のパスを種類ごとに数え上げ、種類ごとに 1・2・3 のどれを採るかを決めた
- [ ] #2 決めた方針を実施し、公開リポジトリの読者が辿れない参照が残っていないか、または残す理由が文書に書かれている状態にした
<!-- AC:END -->
