---
id: TASK-37
title: 外部エディタ経路を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-32
  - TASK-35
  - TASK-36
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §7 の設計に従い、タスクの管理ファイルを利用者の外部エディタで開く経路を実装する。書くのは外部エディタ（利用者）であり Atlas は書かない不変を保つ。ただし CLI のスキーマ保護を受けない例外経路である点を扱う。長文編集を使い慣れた道具へ逃がす用途。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象タスクの管理ファイルそのものを $EDITOR / OS 関連付けで開き、Atlas 自身は書き込まない
- [ ] #2 外部エディタの保存を doc-9 のファイル監視が拾い、再読込でドメインモデルへ反映する（終了検知に依存しない）
- [ ] #3 開く前に frontmatter を壊すと縮退表示になる旨を示し、壊れた場合は doc-4 の縮退表示で受ける
- [ ] #4 GUI 内編集セッションと外部エディタ編集の二重取り込みを 6.4 の扱いで避ける
- [ ] #5 最後の参照削除など CLI で不能な操作の案内先として機能する
<!-- AC:END -->
