---
id: TASK-95
title: パッケージマネージャを pnpm へ移し Node と pnpm の版を固定する
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
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
- [ ] #1 pnpm-lock.yaml があり package-lock.json が消えている
- [ ] #2 tauri.conf.json の beforeDevCommand と beforeBuildCommand が pnpm を呼ぶ
- [ ] #3 pnpm のバージョンが packageManager フィールドで固定されている
- [ ] #4 .node-version に 24 が入っており、.nvmrc と engines.node を併置していない
- [ ] #5 Node 24 で pnpm install / pnpm test / pnpm run check / pnpm run build / pnpm tauri build がすべて成功する
- [ ] #6 AGENTS.md・AGENTS.ja.md・README.md・README.ja.md の手順が pnpm になっており Node と pnpm の要求版が書かれている
<!-- AC:END -->
