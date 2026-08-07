---
id: TASK-126
title: 表示テーマの明暗の語を利用者向けの語へ改める
status: To Do
assignee: []
created_date: '2026-08-07 22:25'
labels:
  - ui
  - design-system
  - 'kind:refactor'
milestone: m-2
dependencies: []
priority: medium
ordinal: 123500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-79 の目視で起票。設定画面のテーマ一覧が「Atlas Light（明・既定）」のように 明／暗 を使っており、ユーザーは「ライト」「ダーク」を求めている。あわせて「OS の明暗に従う（既定: Atlas Light / Atlas Dark）」は「システム設定に従う」とする。decision-12 が定めるのは色値集合と収録条件で、画面に出すラベルの語は定めていないことを先に確かめる（定めていれば decision の側も改訂対象）。公開語彙の改称なので TASK-79 から分けた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 テーマ一覧の明暗が利用者向けの語になっている
- [ ] #2 未選択の選択肢がシステム設定に従う旨の語になっている
- [ ] #3 decision-12 と doc-11 の記述が改称後の語と矛盾していない
<!-- AC:END -->
