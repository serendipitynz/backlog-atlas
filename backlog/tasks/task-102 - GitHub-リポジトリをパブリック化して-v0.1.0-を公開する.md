---
id: TASK-102
title: GitHub リポジトリをパブリック化して v0.1.0 を公開する
status: To Do
assignee: []
created_date: '2026-07-31 23:35'
updated_date: '2026-08-01 00:38'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-90
  - TASK-97
  - TASK-98
  - TASK-101
priority: high
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
m-2 の最後。リポジトリをパブリックにし、v0.1.0 タグを打ってリリースを公開する。公開前に、README の実装状況が現状と一致していること（TASK-90）、LICENSE があること（TASK-97）、CSP が有効であること（TASK-98）、リリースワークフローが動くこと（TASK-101）を確認する。あわせて公開リポジトリとして必要な体裁（リポジトリ説明・トピック・_sandbox の除外が効いていること）を整える。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 リポジトリがパブリックになっている
- [ ] #2 v0.1.0 タグからリリースが公開され、各プラットフォームのバンドルが取得できる
- [ ] #3 _sandbox/ の一時成果物がリポジトリに含まれていない
- [ ] #4 リポジトリ説明とトピックが設定されている
<!-- AC:END -->
