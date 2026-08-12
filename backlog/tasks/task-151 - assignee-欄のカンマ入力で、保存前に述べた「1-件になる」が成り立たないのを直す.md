---
id: TASK-151
title: assignee 欄のカンマ入力で、保存前に述べた「1 件になる」が成り立たないのを直す
status: To Do
assignee: []
created_date: '2026-08-12 02:45'
labels:
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 145700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の編集セッションが assignee を保存する前に出す控え（src/lib/edit.ts の assigneeCollapseWarning）は「assignee は 1 件しか保てないため、保存すると入力した 1 件だけになります」と述べるが、入力にカンマが含まれると成り立たない。Backlog CLI の task edit は -a の値を parseDelimitedStringList でカンマ分割するため（cli.ts:2959）、-a "dave,erin" は assignee を 2 件書く。v1.48.0 と v1.49.3 の実バイナリで測って同じ結果で、版差ではない。task create 側は分割しない（cli.ts:1803）ので create と edit が非対称であり、doc-5 §3 の assignee 写像が「カンマ区切りの値は分割されず 1 件の文字列として保存され（実測）」と書いているのは create 側の挙動で、Atlas が assignee に使う edit 側（TASK-57 の決定。doc-5 §3・doc-8 §6）には当たらない。したがって直す対象は 2 つある。①doc-5 §3 と doc-8 §6 の実測記述（1 件化がカンマ入力では起きないこと）②画面が保存前に述べる保証。保存後は divergence（edit.ts:878）が集合比較で食い違いを拾い事後通知に載せるので、黙って食い違うわけではなく、偽なのは保存前の断言だけである。TASK-99 のセッションで最低バージョン要件の引き上げ可否を実測している最中に見つけた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc-5 §3 の assignee 写像が、create と edit でカンマの扱いが違う事実を実測として持っている
- [ ] #2 doc-8 §6 の 1 件化の記述が、カンマ入力では 1 件化しないことを含んでいる
- [ ] #3 画面が保存前に述べる内容が、カンマを含む入力でも成り立つ
- [ ] #4 カンマを含む assignee 入力に対する挙動が試験で固定されている
<!-- AC:END -->
