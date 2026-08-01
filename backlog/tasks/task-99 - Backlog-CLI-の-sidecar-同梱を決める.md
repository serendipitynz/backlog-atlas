---
id: TASK-99
title: Backlog CLI の sidecar 同梱を決める
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
labels:
  - release
  - decision
  - 'kind:research'
milestone: m-2
dependencies: []
documentation:
  - >-
    backlog/decisions/decision-7 -
    開発は-PATH-上-backlog-を前提とし-sidecar-同梱は配布判断まで先送りする.md
priority: high
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-7 は sidecar 同梱の検討を配布判断まで先送りし、同梱検討契機の第 1 を「第三者配布に踏み出すとき」と定めた。v0.1.0 の公開と GitHub リポジトリのパブリック化はまさにその契機である。同梱するかしないかを決め、決定を decision として残す。同梱する場合は Tauri の externalBin と sidecar Command API で実装し、doc-5 の実行ファイル解決だけを PATH 解決から同梱バイナリ解決へ差し替える（操作写像・作業ディレクトリ・引数配列渡しは変えない）。同梱しない場合は、利用者に Backlog CLI v1.47.1 以上の導入を求めることを README で明示し、CLI 不在時の読み取り専用起動が導入の入口として成立していることを確認する。バンドル構成に影響するため TASK-101 より先に決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 同梱する／しないの判断と理由が decision として記録されている
- [ ] #2 decision-7 の同梱検討契機が到来した事実と、それに対する判断が紐づいている
- [ ] #3 同梱しない場合、README に導入要件と CLI 不在時の挙動が書かれている
- [ ] #4 同梱する場合、3 プラットフォームぶんのバイナリ管理と更新追随の方法が決まっている
<!-- AC:END -->
