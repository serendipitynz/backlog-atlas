---
id: TASK-172
title: Linux arm64 のバンドルをリリースへ追加する
status: In Review
assignee: []
created_date: '2026-08-14 03:56'
updated_date: '2026-08-15 11:29'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装 (2026-08-15): `release.yml` の build matrix へ `ubuntu-24.04-arm` の行を足し、Linux だけの 3 手順 (依存導入・.deb のアイコン検査・.deb の通知検査) の条件を matrix の `linux` 印へ移した。ラベル名で分岐したままだと、もう一方のバンドルの検査 2 つが走らずに緑になる。

**第三者通知の対象トリプルにも arm64 の Linux を足した。** `scripts/generate-third-party-licenses.mjs` の `TARGETS` は「リリースが組むトリプルの和集合」を作る一覧で、arm64 のバンドルもこの通知を同梱する。Linux の 2 トリプルは現時点で同じ crate 集合を解決する (2026-08-15 実測。和集合は 352 件のまま) ので出力の中身は変わらないが、後から `cfg(target_arch)` で入る依存が arm64 のバンドルで未掲載になるのを防ぐ。

実測 (@tauri-apps/cli 2.11.4 の tauri-bundler を読んだ): aarch64 では `.deb` が `arm64`、`.rpm` と `.AppImage` が `aarch64` で、`amd64`／`x86_64`／`amd64` 側と別名になるので 6 資産は衝突しない。AppImage も aarch64 の linuxdeploy を取りにいく経路があり、拒まれない。`pnpm-lock.yaml` は `@tauri-apps/cli-linux-arm64-gnu` を含むので `--frozen-lockfile` は arm64 でも通る。`ubuntu-24.04-arm` は GitHub がホストするラベルで、パブリックリポジトリでは無償。

**AC 3 件はいずれも「arm64 の資産を初めて載せるタグ」で揃って満たされる。** AC #1 はそのリリース実行、AC #3 はオーナーの arm64 VM、AC #2 も同じ時点まで「実資産どおり」にならない (README は次のリリースを述べる形で先に書いてある。タスクの Description がこの PR で動かすと定めている)。どれも「未測定」であって「不可能」ではない。
<!-- SECTION:NOTES:END -->
