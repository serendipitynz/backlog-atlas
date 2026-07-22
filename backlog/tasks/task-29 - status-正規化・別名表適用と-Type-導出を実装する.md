---
id: TASK-29
title: status 正規化・別名表適用と Type 導出を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:07'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-28
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4・doc-3 §3.3・decision-4・decision-5 に従い、読み取り層で得た status を正準ステータス列（To Do/In Progress/In Review/Done）へ対応づけ、kind ラベルから Type を導出する。対象 Markdown を書き換えず Atlas 側の解釈として行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 名称一致（大文字小文字・前後空白を無視）で正準列へ対応づけ、別名表があれば適用する
- [ ] #2 draft の Draft を既知 status として扱い、未知 status として縮退させない
- [ ] #3 別名表にも名称一致にも該当しない status を未対応 status として区別する
- [ ] #4 kind 接頭辞除去で Type を導出し、複数併記・未設定・未知を区別する
- [ ] #5 Type を通常ラベルと分離し、通常ラベル一覧に kind ラベルを混ぜない
<!-- AC:END -->
