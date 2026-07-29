---
id: TASK-57
title: task create の引数範囲を doc-5 §3 の訂正へ揃える
status: Done
assignee: []
created_date: '2026-07-29 00:22'
updated_date: '2026-07-29 11:11'
labels:
  - 'kind:bug'
milestone: m-1
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5 §3 の作成行は、設計時（TASK-9）にタスク作成を title・description・status・labels・priority・milestone・AC に限ると記述していた。しかし v1.47.1 の `task create` は `-a`・`--plan`・`--notes`・`--ref`・`--depends-on` も受け取り、作成された管理ファイルへ保存する（一時プロジェクトで作成し `task view` で全項目の保持を確認、2026-07-29）。doc-5 §3 は訂正済みだが、この誤った前提が実装とその説明に残っている。

- `src-tauri/src/update.rs` の `TaskCreate` は「doc-5 の create map does not include plan/notes/dependencies/references, which are edit-time operations」というコメントとともに 7 項目に絞っている。
- `src/lib/manage.ts` の `TaskCreateInput` も同じ理由づけ（「offering them here would promise a create the CLI does not have」）で絞っている。

型の範囲を狭く保つ判断自体は残してよいが、その理由が事実と異なる。範囲を「Atlas が作成時に渡す範囲」として決め直し、コメント・doc 参照・試験の前提を訂正する。作成フォームの画面側は TASK-55 が実装する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 作成時に渡す項目の範囲を決め、決めた範囲と理由（製品判断であること）を update.rs の TaskCreate と manage.ts の TaskCreateInput のコメントへ書く
- [x] #2 「CLI に create の手段が無い」という記述をコード・画面文言から除去する
- [x] #3 範囲を広げる項目があれば境界の型・引数配列の組み立て・フォームまで通す
- [x] #4 作成に plan・notes・依存・参照が渡せないことを前提にした既存試験を訂正する
- [x] #5 assignee の GUI 経路を作成側か編集側のどちらで閉じるかを決め、決めた側の型（TaskCreate または TaskEdit）と引数配列へ通す（doc-5 §3・doc-10 §7）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決定

- **作成時に渡す範囲**（Atlas が `task create` の 1 回の呼び出しへ載せる項目集合）は title・description・status・labels・priority・milestone・AC のまま確定した。狭く保つ理由は製品判断であり、CLI の制約ではない（v1.47.1 は `-a`・`--plan`・`--notes`・`--ref`・`--depends-on` も受け取って保存する）。実装計画・ノート・参照・依存は作業の進行に伴って増える項目で、タスク詳細の編集経路（doc-8 §6）を持つ。
- **assignee は編集側で閉じる**。作成側だけに置くと「作成時にだけ設定できて後から変えられない」経路になるため、タスク詳細の編集セッション 1 箇所で設定・付け替えできるようにした。

## 実測（v1.47.1、2026-07-29）

- `task edit -a` は 1 値のみ: `-a` を反復しても最後の 1 件だけが残り、`-a "alice,bob"` は分割されず 1 件の文字列として保存される。
- 既に複数 assignee を持つタスクへ `-a dave` を渡すと、frontmatter の一覧が `dave` の 1 件へ置き換わる（assignee の 1 件化）。
- `task edit -a ""` は終了コード 0 で何も変えない（`--ref ""`・`--depends-on ""` と同型の沈黙無変更）。よって解除は CLI から行えない。

## 変更

- `update.rs`: `TaskCreate` の理由づけを製品判断へ書き換え、`TaskEdit.assignee` を追加して `--assignee` へ写像、allowlist へ追加、空値は `RejectReason::EmptyAssignee` で起動前に拒否。
- `wire.ts`・`edit.ts`・`TaskDetail.svelte`: 編集セッションに assignee 欄を追加。空欄は「変更しない」（`ASSIGNEE_NOT_CLEARABLE`）、複数 assignee のタスクは保存前に 1 件化を提示（`assigneeCollapseWarning`）、事後通知（`divergence`）は送った 1 件と再読込結果の一覧を突き合わせる。
- `manage.ts`: `TaskCreateInput` の理由づけを製品判断へ書き換え（範囲は現状維持）。
- 試験: 作成写像の試験名・注記を「Atlas が渡す範囲」へ訂正し、範囲外の項目を載せないことを固定する試験を追加。assignee の設定・空欄・1 件化・事後通知の試験を追加。
- doc-5 §3/§3.1/§3.2・doc-8 §6・doc-10 §7 に決定と実測を反映。

## AC #3 について

範囲を広げた項目は無い（作成側は現状維持）。assignee は AC #5 の決定に従い編集側の型・引数配列・画面まで通した。
<!-- SECTION:NOTES:END -->
