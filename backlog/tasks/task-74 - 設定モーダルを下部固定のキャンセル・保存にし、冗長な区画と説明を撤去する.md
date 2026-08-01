---
id: TASK-74
title: 設定モーダルを下部固定のキャンセル・保存にし、冗長な区画と説明を撤去する
status: To Do
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-01 00:43'
labels:
  - ui
  - settings
  - 'kind:bug'
milestone: m-2
dependencies: []
documentation:
  - backlog/decisions/decision-13 - アプリ設定を台帳ファイルと別の単一ファイルへ持つ.md
priority: high
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
設定を変えて閉じても何も起きないのが分からない。「閉じる」をなくし、モーダル下部に固定で「変更せずに閉じる」と「保存する」を置いて常に見えるようにする。「保存する」は変更があるときだけ活性化し、押下で保存して閉じる。結果として「変更を取り消す」ボタンと「保存できません：変更ありません」的な説明は不要になるので落とす。「ここに無い項目」の見出しと中身は完全に冗長なので削除する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 モーダル下部に「変更せずに閉じる」と「保存する」が固定で置かれ、スクロールしても見える
- [ ] #2 「保存する」は変更があるときだけ活性化し、押下で保存してモーダルが閉じる
- [ ] #3 「ここに無い項目」区画・「変更を取り消す」ボタン・変更なしの説明文が消えている
- [ ] #4 保存後、設定が効いた結果（テーマ・カード情報量など）が画面に現れるか、保存した旨の通知が出る
<!-- AC:END -->
