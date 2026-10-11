---
id: TASK-210
title: タスクとマイルストーンの due_date を読み、画面に表示する
status: To Do
assignee: []
created_date: '2026-10-11 19:31'
labels:
  - 'kind:feature'
milestone: m-4
dependencies: []
priority: low
ordinal: 201700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.51.0 で、task create・task edit・milestone add・milestone rename に期限の指定（--due-date）が付いた。task edit と milestone rename には解除（--clear-due-date）も付いた。値は YYYY-MM-DD だけを受け付け、タスクとマイルストーンの frontmatter に due_date として書かれる（2026-10-12 に v1.53.0 で実測）。現在の読み取り層はこのキーを読まない。キー単位の抽出なので縮退も起きず、画面には現れない。decision-48 は、読み取りと表示だけを取り込むと決めた。読むだけなら CLI の版に依らない。書き込み（--due-date の発行）は本タスクに含めず、最低バージョン要件が v1.51.0 になった後に別に判断する。表示する場所（カード・タスク詳細・プロジェクト詳細のマイルストーン）と、形式違反の値の扱い（decision-6 の区別）を doc-4・doc-7・doc-8・doc-10 の改訂として決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 読み取り層がタスクとマイルストーンの due_date を読み、snapshot に載せる。形式違反の値は decision-6 の区別に従って扱う
- [ ] #2 決めた画面に due_date が表示される
- [ ] #3 wire.ts と wire-fixtures が更新され、wire-fixture.test.ts が通る
- [ ] #4 doc-4 と、表示した画面の doc が改訂されている
<!-- AC:END -->
