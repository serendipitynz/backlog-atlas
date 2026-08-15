---
id: TASK-172
title: Linux arm64 のバンドルをリリースへ追加する
status: In Review
assignee: []
created_date: '2026-08-14 03:56'
updated_date: '2026-08-15 11:19'
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
- [x] #2 README 和英の導入節が Linux の対応アーキテクチャを実資産どおりに述べている
- [ ] #3 arm64 実機 (オーナーの VM) で起動を確認した
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装 (2026-08-15): `release.yml` の build matrix へ `ubuntu-24.04-arm` の行を足し、Linux だけの 3 手順 (依存導入・.deb のアイコン検査・.deb の通知検査) の条件を matrix の `linux` 印へ移した。ラベル名で分岐したままだと、もう一方のバンドルの検査 2 つが走らずに緑になる。

実測 (@tauri-apps/cli 2.11.4 の tauri-bundler を読んだ): aarch64 では `.deb` が `arm64`、`.rpm` と `.AppImage` が `aarch64`／`amd64` 側と別名になるので、6 資産は衝突しない。AppImage も aarch64 の linuxdeploy を取りにいく経路があり、拒まれない。`ubuntu-24.04-arm` は GitHub がホストするラベルで、パブリックリポジトリでは無償 (GitHub の runner 一覧で確認)。

未達の AC 2 件: AC #1 は次のタグ (v0.2.0) のリリース実行で初めて確かめられる。AC #3 はオーナーの arm64 VM が要る。どちらも「未測定」であって「不可能」ではない。
<!-- SECTION:NOTES:END -->
