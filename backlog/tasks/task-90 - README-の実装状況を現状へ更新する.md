---
id: TASK-90
title: README の実装状況を現状へ更新する
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 02:15'
labels:
  - docs
  - 'kind:writing'
milestone: m-2
dependencies:
  - TASK-99
  - TASK-104
priority: high
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
README.ja.md と README.md が TASK-43〜57 を未着手と書いているが、TASK-43・TASK-45〜57 は Done、TASK-44 も Done である。公開リポジトリの README が実装状況について誤った説明を載せている状態で公開できない。リリース時に README の実装状況を確認する手順を残し、同じずれを再発させない。

Backlog CLI の導入要件は TASK-99 の判断結果で 2 分岐する。非同梱を選んだ場合は、最低バージョン要件と CLI 不在時に読み取り専用で起動することを利用者向けに書く。同梱を選んだ場合はそれが利用者の導入契約ではなくなるので、同梱した版とその更新方針を書く。どちらか一方だけを書き、両方を無条件に書かない。

更新経路の記述も TASK-104 の判断結果で 2 分岐する。updater を持たない判断なら、v0.1.0 が意図的に手動更新のみであることと、新しい版を利用者が知る手段を README に書く。持つ判断なら、更新の受け皿は TASK-101 がバンドルへ入れるので、README には更新の仕組みと利用者側の操作を書く。

したがってこのタスクは TASK-99 と TASK-104 の両方の後に着手する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README.ja.md と README.md の実装状況が現在の Backlog の値と一致している
- [ ] #2 両言語版が同じ内容で、片方だけ古い箇所が無い
- [ ] #3 リリース時に README の実装状況を確認する手順がどこかに書かれている
- [ ] #4 Backlog CLI の導入要件が TASK-99 の判断結果に沿って書かれている。非同梱なら外部 CLI の最低バージョン要件と CLI 不在時の読み取り専用起動を利用者向けに書き、同梱なら同梱版とその更新方針を書く（両方を無条件に書かない）
- [ ] #5 更新経路の記述が TASK-104 の判断結果に沿って書かれている。updater を持たないなら v0.1.0 が意図的に手動更新のみであることと新しい版を知る手段を書き、持つなら更新の仕組みと利用者側の操作を書く
<!-- AC:END -->
