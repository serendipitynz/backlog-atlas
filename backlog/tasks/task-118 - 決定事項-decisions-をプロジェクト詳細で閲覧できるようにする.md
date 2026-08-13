---
id: TASK-118
title: 決定事項 (decisions) をプロジェクト詳細で閲覧できるようにする
status: To Do
assignee: []
created_date: '2026-08-05 08:18'
updated_date: '2026-08-13 05:43'
labels:
  - ui
  - project-detail
  - 'kind:feature'
milestone: m-2
dependencies: []
priority: high
ordinal: 115500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #64 の目視フィードバック (2026-08-05) 由来。区画ナビに「決定事項」を足し、対象プロジェクトの backlog/decisions を一覧・閲覧できるようにする (閲覧のみ)。読み取り層は decisions を走査しているが (decision-24 で不整合の対象が管理ファイル 1 件へ広がったため)、**画面に出す区画が無い** (`ProjectDetail.svelte:884` の註)。

**2026-08-13 に m-3 から m-2 へ繰り上げた（ユーザー判断）。** PR #109 で README を公開向けに書き直したとき、ユーザーがこのアプリの位置づけを「複数のプロジェクトのタスク・文書・**決定事項**を横断的に管理するためのツール」と述べた。閲覧手段が無いまま公開すると README がその位置づけを書けないので、v0.1.0 に入れる。

**README への追記もこのタスクの範囲である。** PR #109 の README は「できること」に決定事項を挙げていない（無い機能を書けないため）。実装したら和英の「できること」へ 1 行足す。**AGENTS.md / AGENTS.ja.md「リリース」節がタグ前に README と出荷ビルドを突き合わせることを求めているので、落としても TASK-102 の直前で捕まる。** それでもここで足すのが正しい — あの検査は最後の網であって、書き足す担当ではない。

**更新手段の有無は着手時に実測する。** `backlog decision` は 1.49.3 で `create` のみを持ち、その options は `<title>` と `-s` だけである（PR #109 で実測）。したがって**閲覧のみに留めるのは CLI 側の制約に沿っている** — 更新 GUI を作っても発行手段が無い。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 区画ナビに決定事項があり、一覧と本文の閲覧ができる
- [ ] #2 読み取り層の decisions 走査が wire 契約と fixture に載っている
- [ ] #3 提供しない操作 (編集など) は理由つきで区画に載る
- [ ] #4 README.ja.md と README.md の「できること」に決定事項の閲覧が挙がっている
<!-- AC:END -->
