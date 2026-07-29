---
id: TASK-53
title: 列内新規タスク入力を実装する
status: To Do
assignee: []
created_date: '2026-07-28 23:16'
updated_date: '2026-07-29 00:22'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-50
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-7 §4.1 は、レーンセルの末尾から title だけで新規タスクを作れる入口を定めた。渡す status は「列の作成時 status 候補」（その列へ列対応規則で対応づく、config.yml が宣言する原文 status の集合）から決める。

正準列名をそのまま --status へ渡すことはできない。-s は config.yml に宣言済みの値だけを受け取り、未宣言の値は `Invalid status: <値>. Valid statuses are: …` を出して終了コード 1 で失敗する（v1.47.1 実測）。`backlog init --defaults` が宣言するのは To Do / In Progress / Done の 3 つで、In Review は宣言されない（実測）。列対応規則は「原文 status → 列」の向きにしか定められておらず、逆向きは 0 件・1 件・複数件のいずれにもなる。候補の数ごとに、渡す値の決め方と入口を置くか否かを分ける。

未対応列は正準ステータス列に対応しない status の集まりで、候補集合をそもそも定義できないため入口を置かない。無効化して置くのではなく置かない（doc-11 §5 の「無効化」と「提供しない」の区別）。priority・milestone・ラベル・受入条件を伴う作成はプロジェクト詳細画面（doc-10 §7）が担い、発行するのは同じ task create である。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 レーンセル末尾の入口から title だけを受け取り、task create を 1 回発行する
- [ ] #2 未対応列には入口を置かず、置かない理由を短く示す（無効化したボタンを置かない）
- [ ] #3 title が空のままでは発行できず、必須である理由を示す
- [ ] #4 CLI 縮退時は理由付きで無効化し、読み取りは続く
- [ ] #5 作成後に当該ルートを読み直し、新しいカードがその列に現れる
- [ ] #6 列の作成時 status 候補が 1 件の列では、その原文 status を渡し、渡す値を入力欄に表示する（正準列名をそのまま渡さない）
- [ ] #7 列の作成時 status 候補が 0 件の列には入口を置かず、作成時の初期値を決められない理由を示す
- [ ] #8 列の作成時 status 候補が 2 件以上の列では status を候補からの選択にし、既定を config.yml の宣言順で先頭にする
- [ ] #9 backlog init --defaults の 3 status 構成（In Review が未宣言）で、In Review 列に入口が出ないことを回帰試験で確かめる
<!-- AC:END -->
