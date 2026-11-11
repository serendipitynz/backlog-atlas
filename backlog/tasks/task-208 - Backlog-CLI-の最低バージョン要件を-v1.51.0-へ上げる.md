---
id: TASK-208
title: Backlog CLI の最低バージョン要件を v1.54.0 へ上げる
status: To Do
assignee: []
created_date: '2026-10-11 19:30'
updated_date: '2026-11-11 02:41'
labels:
  - 'kind:research'
milestone: m-4
dependencies:
  - TASK-213
priority: medium
ordinal: 199700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-48 は、draft の内容編集（draft edit）を提供するために最低バージョン要件を v1.51.0 へ上げると決めていた。その後、v1.54.0 が task complete を削除し、Done のタスクの閉じ方が版で逆転した（v1.53.0 までは task complete だけが通り、v1.54.0 以降は task archive だけが通る。TASK-213 の実測）。decision-51 は上げ先を v1.54.0 に改めた。v1.54.0 は、Done のタスクを task archive で閉じられる最初の版である。draft edit も v1.51.0 から入っているので、TASK-209 の前提も満たす。

作業は decision-27 に従う。MIN_VERSION と decision-7 の正本、7 つの doc の実測基準版、コードと AGENTS の実測註を、確かめたうえで動かす。版差記録と decisions の実測註は動かさない。2026-10-12 に引いた索引では、backlog/tasks を除いて 1.50.1 の文字列が 154 行・40 ファイルにあった（CLAUDE.md は AGENTS.md へのシンボリックリンクなので 1 回だけ数えた）。decision-27 のとおり総数は引き継がず、1 件ずつ読みながら数え直す。src/lib/settings-controller.test.ts の 2 か所（READY の version と launched の report）は、decision-27 §1 がフロントエンドに置かないとした版リテラルである。どちらとして扱うかも本タスクで決める。

本タスクが上げた時点では、画面にはまだ完了整理が出ている。v1.54.0 以上の CLI では必ず失敗する操作である。それを取り除くのは TASK-215 で、本タスクの後に入る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision-27 の種別ごとに、動かした出現と動かさなかった出現が 1 件ずつ読んで数えられ、実施記録に残っている
- [ ] #2 src/lib/settings-controller.test.ts の 2 か所の版リテラルの扱いが決まり、反映されている
- [ ] #3 pnpm test・pnpm run check・pnpm run lint と、src-tauri の cargo test・cargo clippy が通る
- [ ] #4 MIN_VERSION と decision-7 の最低バージョン要件が v1.54.0 になり、wire-fixtures が再記録されている
- [ ] #5 実測註を動かす前に、その註が述べる挙動を v1.54.0 で測り直している。違いが出たものは版差記録になり、偽だった主張は訂正されている
<!-- AC:END -->
