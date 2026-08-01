---
id: TASK-90
title: README の実装状況を現状へ更新する
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 01:51'
labels:
  - docs
  - 'kind:writing'
milestone: m-2
dependencies:
  - TASK-99
priority: high
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
README.ja.md と README.md が TASK-43〜57 を未着手と書いているが、TASK-43・TASK-45〜57 は Done、TASK-44 も Done である。公開リポジトリの README が実装状況について誤った説明を載せている状態で公開できない。あわせて配布（パッケージングと Backlog CLI の sidecar 同梱）の記述を TASK-99 の判断結果に合わせ、最低バージョン要件（Backlog CLI v1.47.1）と読み取り専用起動の条件を利用者向けに書く。リリース時に README の実装状況を確認する手順を残し、同じずれを再発させない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README.ja.md と README.md の実装状況が現在の Backlog の値と一致している
- [ ] #2 両言語版が同じ内容で、片方だけ古い箇所が無い
- [ ] #3 リリース時に README の実装状況を確認する手順がどこかに書かれている
- [ ] #4 Backlog CLI の導入要件が TASK-99 の判断結果に沿って書かれている。非同梱なら外部 CLI の最低バージョン要件と CLI 不在時の読み取り専用起動を利用者向けに書き、同梱なら同梱版とその更新方針を書く（両方を無条件に書かない）
<!-- AC:END -->
