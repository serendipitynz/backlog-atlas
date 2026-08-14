---
id: TASK-172
title: Linux arm64 のバンドルをリリースへ追加する
status: To Do
assignee: []
created_date: '2026-08-14 03:56'
labels:
  - release
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 163700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-170 の回 (2026-08-14) にオーナーが報告した欠落。**v0.1.0 の Linux 資産は x86_64 の 3 形式だけで、arm64 が 1 つも無い。** オーナーの Linux 検証環境は macOS (Apple Silicon) 上の VM なので arm64 であり、v0.1.0 を実機確認できない。

**候補は GitHub Actions の ubuntu-24.04-arm ランナーを release ワークフローの matrix へ足すこと** (公開リポジトリで利用できると GitHub が文書化している。実際にビルドが通るかは未測定)。AGENTS「ツールチェーン」の Ubuntu 24.04 要件 (webkit2gtk-4.1 / libsoup-3.0) は arm64 の 24.04 にも同じ形で載っている。**効くのは次のリリースからで、v0.1.0 の資産は増えない。**

README 和英の導入節は TASK-170 で「Windows と Linux は x64/x86_64 のみ」と実資産どおりに書くので、**このタスクが資産を足したらその文も同じ PR で動かす。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 リリースワークフローが Linux arm64 の .deb・.rpm・.AppImage をドラフトへ載せる
- [ ] #2 README 和英の導入節が Linux の対応アーキテクチャを実資産どおりに述べている
- [ ] #3 arm64 実機 (オーナーの VM) で起動を確認した
<!-- AC:END -->
