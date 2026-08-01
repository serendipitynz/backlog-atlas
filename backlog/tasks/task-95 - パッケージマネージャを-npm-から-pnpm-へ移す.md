---
id: TASK-95
title: パッケージマネージャを pnpm へ移し Node と pnpm の版を固定する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 03:06'
labels:
  - build
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
リリースワークフローを書く前が最も安価な移行時点なので、TASK-101 より先に移す。package-lock.json を pnpm-lock.yaml へ置き換え、tauri.conf.json の beforeDevCommand / beforeBuildCommand と AGENTS.md・README の手順を揃える。Tauri の CLI 呼び出し（npm run tauri）も pnpm 経由へ変える。

あわせて Node の版を固定する。理由は 3 つ。(1) TASK-101 のリリースワークフローが 3 プラットフォームの matrix ビルドをするので、ピンファイルが無いと actions/setup-node にバージョンを直書きしてローカルとずれる（~/Projects/_snz/mallow が実際にその状態で、CI は node-version: 22 の直書き、ローカルはピンなし。範にするときこの点は踏襲しない）。(2) TASK-102 で公開するので、どの Node でビルドを検証したかがリポジトリを読む側に分かる必要がある。(3) 開発環境は fnm なので、ピンファイルを置くだけで自動切替が効く。

固定する版は 24（Krypton）。2026-08-01 時点の実データで v24 が Active LTS（LTS 開始 2025-10-28、maintenance 入り 2026-10-20、EOL 2028-04-30）であり、現在使っている v22（Jod）は 2025-10-21 に maintenance へ入っている。v26 は 2026-10-28 に LTS になる予定で今は Current なので、公開直前に基準へ据える利得がない（10 月に LTS 化した時点で上げる運用にする）。ツールチェーンの下限は実測で sass >=20.19.0・vitest 4 が ^20 || ^22 || >=24・vite 6 が ^18 || ^20 || >=22 なので 24 はすべて満たす。

ファイルは .node-version 1 つだけを置く。.nvmrc は nvm 固有の名前で、実際に使っている fnm・nodenv・asdf・mise が読む広いほうの慣習が .node-version である。actions/setup-node の node-version-file はどちらも読む。2 つ置くとずれる場所が 2 つになるので併置しない。中身はメジャーのみ（24）とする — このプロジェクトで Node はビルド時だけの依存で、出荷物は Vite の出力を内包した Tauri バイナリであり Node は製品に入らないため、パッチまで固定する再現性の利得が小さい。将来 Node のパッチ差でビルドが壊れたら、その時点で厳密指定へ落とす。

engines.node は入れない。真実の出所を 2 つにしないためで、pnpm は engine-strict=true を書かないと強制しないので .npmrc もセットで必要になる。

固定より先に v24 で実際に通すこと。検証していない版を固定するのは固定しないより悪い。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm-lock.yaml があり package-lock.json が消えている
- [x] #2 tauri.conf.json の beforeDevCommand と beforeBuildCommand が pnpm を呼ぶ
- [x] #3 pnpm のバージョンが packageManager フィールドで固定されている
- [x] #4 .node-version に 24 が入っており、.nvmrc と engines.node を併置していない
- [x] #5 Node 24 で pnpm install / pnpm test / pnpm run check / pnpm run build / pnpm tauri build がすべて成功する
- [x] #6 AGENTS.md・AGENTS.ja.md・README.md・README.ja.md の手順が pnpm になっており Node と pnpm の要求版が書かれている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-01 に実施。

- `pnpm import` で package-lock.json から pnpm-lock.yaml を起こし、解決済みの版をそのまま引き継いだ。package-lock.json は削除。導入後の版は npm 時代と同一（@tauri-apps/api 2.11.1、vite 6.4.3、svelte 5.56.7、vitest 4.1.10 ほか）。
- `packageManager: "pnpm@10.30.3"` を package.json へ。`.node-version` は `24` の 1 行のみで、.nvmrc と engines.node は置いていない。
- tauri.conf.json の beforeDevCommand / beforeBuildCommand を `pnpm run dev` / `pnpm run build` へ。`pnpm dev` ではなく `pnpm run <script>` にしたのは、pnpm 組み込みサブコマンドとスクリプト名が将来衝突しても意味が変わらないため。
- AGENTS.md・AGENTS.ja.md に「ツールチェーン」節、README.md・README.ja.md に「ソースからのビルド」節を新設した。移行前はどの文書にも npm 手順の記述自体が無く、AC #6 は書き換えではなく新設になった。

検証（macOS 15 / Apple Silicon / Node v24.18.1 / pnpm 10.30.3）:

- `pnpm install` 成功、`pnpm test` 418 passed（20 files）、`pnpm run check` 269 files / 0 errors / 0 warnings、`pnpm run build` 成功、`pnpm tauri build` 成功（.app と aarch64 dmg を生成）。
- Rust 側も併せて確認: `cargo test` 273 passed / 4 ignored、`cargo fmt --check` clean、`cargo clippy --all-targets` 警告なし。
- Windows / Linux 実機での確認は未実施。AC #5 の文言に OS の限定は無く macOS で全 5 コマンドが通ったのでチェック済みにしたが、対応順の表が本タスクへ付けた「実」印の趣旨に沿って、実機での確認はユーザーへ依頼する。

pnpm 10.30.3 の既知の挙動: `pnpm install` が `@parcel/watcher` と `esbuild` を "Ignored build scripts" として毎回警告する。package.json の `pnpm.ignoredBuiltDependencies` と `pnpm.onlyBuiltDependencies: []`、および pnpm-workspace.yaml のいずれでも抑止できないことを実測したので、効かない設定は残さず、承認しない理由（sass の watch モード専用 / esbuild は optional dependency でプラットフォーム別バイナリを解決）を AGENTS の規約として書いた。

### PR #37 レビュー [P2] への対応（2026-08-01）

Description が `.node-version` の選定根拠として書いた「実際に使っている fnm・nodenv・asdf・mise が読む広いほうの慣習」は、読める慣習としては正しいが、**既定構成で読むかどうかは揃っていない**。レビューの指摘どおり、asdf は `legacy_version_file = yes` の下でのみ読み、mise は idiomatic version file を既定で無効にしており、nodenv は alias plugin なしにメジャーのみの `24` を解決しない。

実測して確かめたのは fnm 1.39.0 だけで、`.node-version` の `24` から v24.18.1 を選ぶ (`fnm exec -- node --version`)。`actions/setup-node` は `node-version-file` を通じて `.node-version` を読む。

`.node-version` を 1 ファイルだけ置く判断そのものは変えない。ずれる場所を 1 つに保つという根拠は、どのツールが既定で読むかとは独立だからである。README.md・README.ja.md の記述を、fnm と `actions/setup-node` に限って「読む」と述べ、asdf・mise・nodenv には各ツールの手当てが要ると書く形へ直した。
<!-- SECTION:NOTES:END -->
