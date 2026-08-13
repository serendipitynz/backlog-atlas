---
id: TASK-161
title: 既存の backlog 本文で閉じていない太字強調を直す
status: To Do
assignee: []
created_date: '2026-08-13 05:03'
updated_date: '2026-08-13 05:03'
labels:
  - docs
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: medium
ordinal: 154700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 のユーザー指摘由来（README.ja.md について「強調表現の前後には半角スペースを入れないと強調として認識されないことがあります」）。TASK-90 の回に README 和英・AGENTS 和英・同セッションで書いたタスク本文は直し、規約を AGENTS.md / AGENTS.ja.md の「作業上の規約」へ入れた。本タスクは既存分である。

**原因は CommonMark の閉じ側の判定である。** 閉じる `**` は right-flanking でなければならず、直前が Unicode 句読点の場合は直後が空白か句読点でなければそれを満たさない。日本語では強調の中で文が終わる書き方が大半なので、`**〜である。**次の文` が軒並みこれに当たる。`**Ubuntu なら 24.04 以降**で`（直前が句読点でない）は問題なく描画される。

**Atlas 自身が描画対象である。** タスク・文書の本文は markdown-it で描く（decision-25）ので、崩れは GitHub だけでなくアプリの画面に出る。

**実測（2026-08-13、markdown-it で全文描画し code span を除いて数えた）: 39 ファイル・394 箇所。** 多い順に doc-11（76）・decision-30（36）・doc-10（34）・TASK-145（28）・decision-28（26）・doc-8（24）・decision-29（18）・TASK-129（16）・TASK-156（16）・doc-7（16）・TASK-125（14）・TASK-130（8）。

**目視で数えない。** 行単位の走査は 2 種類の誤検出を出す — code span 内の `**`（`src/**/*.test.ts`）と、行をまたぐ強調（どちらも正しく描画される）。全文を描画し、code span を除いてから数える。

**管理ファイルなので Backlog CLI 経由で直す**（AGENTS.md「更新」節）。docs は `backlog doc edit --content`、decisions も同様に、タスクは `--description` / `--notes`。本文をバイト同一で書き戻せることは確認済みの経路である。

公開阻害には当たらない（アプリは動作し、崩れるのは本文の見え方だけ）ので、指示書の規則どおり m-3 に置いた。ユーザーが m-2 へ繰り上げてよい。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog/tasks・backlog/docs・backlog/decisions・backlog/milestones の本文に、閉じていない強調が残っていない（markdown-it で全文描画し、code span を除いて 0 件）
- [ ] #2 その検査が再現できる形で残っている（同じ判定を後から流せる。行単位の走査ではなく全文描画で数える）
- [ ] #3 修正が Backlog CLI 経由で行われている（管理ファイルを直接編集していない）
<!-- AC:END -->
