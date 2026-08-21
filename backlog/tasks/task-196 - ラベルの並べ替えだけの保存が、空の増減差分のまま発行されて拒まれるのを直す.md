---
id: TASK-196
title: ラベルの並べ替えだけの保存が、空の増減差分のまま発行されて拒まれるのを直す
status: To Do
assignee: []
created_date: '2026-08-20 00:07'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
ordinal: 187700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の編集セッションでラベルを並べ替えただけの保存が、addLabels・removeLabels のどちらも空の task edit として発行され、アダプターに NothingToEdit で拒まれる。実測 2026-08-20（buildSave の返り値で確認。labels が ['a','b'] のタスクで a を消して打ち直すと、集合は元へ戻るが並びが変わるため触れた項目のままになり、plan は state: ready・edit: { addLabels: [], removeLabels: [] } を返す）。拒むのは src-tauri/src/update.rs の plan_task_edit で、空の増減にはオプションを出さないため !inv.has_options() に落ちる（an_empty_task_edit_is_refused が同じ経路を押さえている）。CLI を起動しないのでデータは失われず、誤った書き込みも起きないが、利用者から見ると保存が失敗として提示される。原因は 2 つのどちらかで、どちらを採るかがこのタスクの判断である: (i) 発行する facet が 1 つも無い保存を nothingToSave として扱う、(ii) ラベルの並びは CLI が表せない値なので、並べ替えだけの変更を触れた項目に数えない。CLI にラベルの全置換は無く、増減しか無いので、並びそのものを Atlas から変える手段は無い（doc-5 §3）。TASK-155 のセッションで、カンマを含むラベルの保存を拒む関門を入れているときに見つけた。そのタスクの拒否から戻る道がここを通る — カンマを含むラベルを消した後に同じ値を打ち直すと、この状態になる。次リリース基準では m-4 と判定した（v0.2.0 に載っても、失われるものは無く、誤った書き込みも起きない）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 並べ替えだけの保存で、利用者に失敗が提示されない
- [ ] #2 CLI がラベルの並びを表せないことが、画面と doc のどちらで述べられるかが決まっている
- [ ] #3 空の増減差分が発行されないことが試験で固定されている
<!-- AC:END -->
