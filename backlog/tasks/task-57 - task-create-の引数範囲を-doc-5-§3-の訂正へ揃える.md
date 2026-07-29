---
id: TASK-57
title: task create の引数範囲を doc-5 §3 の訂正へ揃える
status: To Do
assignee: []
created_date: '2026-07-29 00:22'
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
- [ ] #1 作成時に渡す項目の範囲を決め、決めた範囲と理由（製品判断であること）を update.rs の TaskCreate と manage.ts の TaskCreateInput のコメントへ書く
- [ ] #2 「CLI に create の手段が無い」という記述をコード・画面文言から除去する
- [ ] #3 範囲を広げる項目があれば境界の型・引数配列の組み立て・フォームまで通す
- [ ] #4 作成に plan・notes・依存・参照が渡せないことを前提にした既存試験を訂正する
<!-- AC:END -->
