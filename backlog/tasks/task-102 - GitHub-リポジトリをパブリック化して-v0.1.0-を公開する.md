---
id: TASK-102
title: GitHub リポジトリをパブリック化して v0.1.0 を公開する
status: To Do
assignee: []
created_date: '2026-07-31 23:35'
updated_date: '2026-08-13 07:07'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-90
  - TASK-97
  - TASK-98
  - TASK-101
  - TASK-118
  - TASK-158
  - TASK-159
  - TASK-163
priority: high
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
m-2 の最後。リポジトリをパブリックにし、v0.1.0 タグを打ってリリースを公開する。

公開前に確認するもの: README 和英が出荷するビルドと一致していること（TASK-90。AGENTS.md「リリース」節の手順に従う。**README は実装状況の節を持たないので、突き合わせる対象は読者が行動の根拠にする記述 — 動作環境と Linux の下限・Backlog CLI の最低バージョン要件・更新の届き方・できることの一覧 — であり、進捗ではない**）、LICENSE と第三者素材の帰属があること（TASK-97、および配布バイナリぶんの TASK-159）、CSP が有効であること（TASK-98）、リリースワークフローが動くこと（TASK-101）、画面文言の語が利用者に通じること（TASK-158）。

あわせて公開リポジトリとして必要な体裁（リポジトリ説明・トピック・_sandbox の除外が効いていること）を整える。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 リポジトリがパブリックになっている
- [ ] #2 v0.1.0 タグからリリースが公開され、各プラットフォームのバンドルが取得できる
- [ ] #3 _sandbox/ の一時成果物がリポジトリに含まれていない
- [ ] #4 リポジトリ説明とトピックが設定されている
<!-- AC:END -->
