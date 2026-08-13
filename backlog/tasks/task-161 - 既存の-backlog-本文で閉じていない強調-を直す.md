---
id: TASK-161
title: 既存の backlog 本文で閉じていない太字強調を直す
status: To Do
assignee: []
created_date: '2026-08-13 05:03'
updated_date: '2026-08-13 05:29'
labels:
  - docs
  - 'kind:chore'
milestone: m-3
dependencies:
  - TASK-162
priority: medium
ordinal: 154700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 のユーザー指摘由来（README.ja.md について「強調表現の前後には半角スペースを入れないと強調として認識されないことがあります」）。TASK-90 の回に README 和英・AGENTS 和英・同セッションで書いたタスク本文は直し、規約を AGENTS.md / AGENTS.ja.md の「作業上の規約」へ入れた。本タスクは既存分である。

**原因は CommonMark の閉じ側の判定である。** 閉じる `**` は right-flanking でなければならず、直前が Unicode 句読点の場合は直後が空白か句読点でなければそれを満たさない。日本語では強調の中で文が終わる書き方が大半なので、`**〜である。**次の文` が軒並みこれに当たる。`**Ubuntu なら 24.04 以降**で`（直前が句読点でない）は問題なく描画される。

**Atlas 自身が描画対象である。** タスク・文書の本文は markdown-it で描く（decision-25）ので、崩れは GitHub だけでなくアプリの画面に出る。

**実測（2026-08-13、markdown-it で全文描画し code span を除いて数えた）。CLI が本文を書けるかどうかで 2 つに分かれる。**

- **書ける**: tasks 23 ファイル・140 箇所（`backlog task edit` の `-d` / `--notes` / `--plan` / `--acceptance-criteria`）、docs 7 ファイル・160 箇所（`backlog doc update --content`）。多い順に doc-11（76）・doc-10（34）・TASK-145（28）・doc-8（24）・TASK-129（16）・TASK-156（16）・doc-7（16）・TASK-125（14）・TASK-130（8）。
- **書けない**: decisions 9 ファイル・94 箇所。多い順に decision-30（36）・decision-28（26）・decision-29（18）。**`backlog decision` は `create` のみで、その options は `<title>` と `-s` だけ**（1.49.3 で実測）。つまり decision の本文は create でも update でも CLI から書けない。**直接編集が許されるかどうかは AGENTS.md「更新」節の読みが割れており、TASK-162 がそれを確定する。**
- milestones は該当 0 件。

**目視で数えない。** 行単位の走査は 2 種類の誤検出を出す — code span 内の `**`（`src/**/*.test.ts`）と、行をまたぐ強調（どちらも正しく描画される）。全文を描画し、code span を除いてから数える。

**サブコマンド名を実測で確かめる。** 起票時の初稿は `backlog doc edit` と書いており、PR #109 の 4R で [P2] になった。正しくは `backlog doc update` である。

公開阻害には当たらない（アプリは動作し、崩れるのは本文の見え方だけ）ので、指示書の規則どおり m-3 に置いた。ユーザーが m-2 へ繰り上げてよい。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog/tasks と backlog/docs の本文に、閉じていない太字強調が残っていない（markdown-it で全文描画し、code span を除いて 0 件）
- [ ] #2 tasks と docs の修正が Backlog CLI 経由で行われている（task edit の -d / --notes / --plan / --acceptance-criteria、doc update --content）
- [ ] #3 backlog/decisions の 9 ファイルは、TASK-162 が確定した読みに沿って扱われている。直接編集が是と確定したなら直されており、非と確定したならその時点で手段が無いことと未修正である旨が記録されている
- [ ] #4 その検査が再現できる形で残っている（行単位の走査ではなく全文描画で数える）
<!-- AC:END -->
