---
id: TASK-124
title: Git remote を現在値の表示と再判定ボタンに分ける
status: To Do
assignee: []
created_date: '2026-08-07 22:25'
updated_date: '2026-08-07 23:32'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
priority: high
ordinal: 121500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-79 の目視で起票。概要区画は「Git remote を再判定する（現在: あり）」というチェックボックス 1 つで、いま何が判定されているかを述べていない。ユーザーの求めは、判定済みの remote の値（例 git@github.com:serendipitynz/backlog-atlas.git）を表示し、再判定は独立したボタンにすること。台帳エントリの更新経路（doc-10 §4.1）と読み取り層が返す remote 情報に触れるので、表示できる値が何かを先に確かめる。文言ではなく操作と表示の構成の変更なので TASK-79 から分けた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 現在判定されている Git remote の値が概要区画で読める
- [ ] #2 再判定が独立した操作になっている
- [ ] #3 doc-10 の該当節が改訂されている
<!-- AC:END -->
