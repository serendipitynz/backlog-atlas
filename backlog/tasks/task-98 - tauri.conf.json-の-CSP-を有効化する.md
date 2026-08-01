---
id: TASK-98
title: tauri.conf.json の CSP を有効化する
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
labels:
  - release
  - security
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
app.security.csp が null である。現在のコードから危険な HTML 挿入や外部 Web コンテンツを読み込む経路は確認されておらず単独の脆弱性とは判定されていないが、そうした機能を足す前に有効化する必要がある。公開前が最後の安価な時点なので今行う。タスク由来 URL を文字列として表示している現在の描き方を壊さない範囲で、必要最小の CSP を定める。_sandbox/repository-implementation-findings-2026-08-01.md のセキュリティ節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app.security.csp に明示的な値が入っている
- [ ] #2 有効化後に全画面が動作し、コンソールに CSP 違反が出ない
- [ ] #3 選んだ CSP の各ディレクティブの理由が記録されている
- [ ] #4 将来 Ace や外部コンテンツを足す場合に何を緩める必要があるかが書かれている
<!-- AC:END -->
