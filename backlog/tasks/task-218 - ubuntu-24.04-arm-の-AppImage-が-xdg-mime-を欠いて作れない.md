---
id: TASK-218
title: ubuntu-24.04-arm の AppImage が xdg-mime を欠いて作れない
status: In Review
assignee: []
created_date: '2026-11-12 18:43'
updated_date: '2026-11-12 18:44'
labels:
  - release
  - 'kind:bug'
milestone: m-4
dependencies: []
priority: high
ordinal: 209700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v0.3.0 のリリース workflow (run 43211169435) で `build (ubuntu-24.04-arm, true)` だけが落ち、draft から arm64 の .deb・.rpm・.AppImage が欠けた。**原因は AppImage の段の `xdg-mime binary not found /usr/bin/xdg-mime`** — Tauri の AppImage バンドラ (CLI v2.11.4 の linuxdeploy.rs) は deep-link のスキームが設定されていると `/usr/bin/xdg-mime` を AppImage へ写す。decision-49 の `backlog-atlas` スキームで v0.3.0 から初めてこの経路に入った。x86_64 のランナーは `xdg-utils` を最初から持ち、`ubuntu-24.04-arm` のランナーは持たないので、arm だけが落ちた。

Linux の apt リストに `xdg-utils` を足す。AGENTS の Toolchain が言うとおりリストは 3 か所 (README の Building from source・release.yml・ci.yml の e2e) にあり、3 つを揃えて変える。マージ後に main から `workflow_dispatch` で v0.3.0 を作り直し、TASK-217 の draft に arm64 の資産を揃える。タグは動かさない (workflow 定義は main、ソースはタグから取る)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Linux の apt リスト 3 か所 (README 和英・release.yml・ci.yml の e2e) に xdg-utils が並んで入っている
- [ ] #2 main から workflow_dispatch で v0.3.0 を作り直し、5 ジョブすべてが success
- [ ] #3 draft に arm64 の .deb・.rpm・.AppImage が揃い、資産が v0.2.0 と同じ 10 個 (.app.tar.gz 無し) になる
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 原因の確かめ方

- **失敗したのは AppImage の段だけ。** arm のログでは `Backlog Atlas_0.3.0_arm64.deb` と `…aarch64.rpm` の Bundling が通り、`…aarch64.AppImage` の段で `failed to bundle project: xdg-mime binary not found /usr/bin/xdg-mime` が出て止まった。
- **xdg-mime を要求しているのは Tauri の AppImage バンドラである。** `tauri-cli-v2.11.4` の `crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy.rs:125` が、`deep_link_protocols()` が有るとき (xdg-open を利用者が自分で置いていなければ) `/usr/bin/xdg-mime` を AppImage の `usr/bin` へ写す。tauri.conf.json の `plugins.deep-link.desktop.schemes` が decision-49 で入ったので、v0.3.0 が初めてこの経路を通った。
- **x86_64 の行が通ったのはランナーのイメージが `xdg-utils` を持っているからで、arm のイメージは持たない。** v0.2.0 では両方とも通っていた (スキームが無かった)。

## 変更 (AC #1)

- README 和英・release.yml・ci.yml の e2e の apt リストの末尾 (`librsvg2-dev` の後) に `xdg-utils` を足した。AGENTS の Toolchain が言う「3 か所を揃えて変える」に従い、e2e は `--no-bundle` で AppImage を作らないが、他の 2 か所と行ごとに比べられる形を保つために入れた。
- release.yml の手順の註に、xdg-utils だけが 2 つのランナーイメージで食い違うことと、それが要る理由を足した。x64 のイメージが既に持つ以上、註が無いと「重複だから消せる」と読まれる。
- ci.yml の註の「The first seven are README's list」は、変更の前から 10 個のリストに対して 7 と言っていた。xdg-utils で 11 個になるので、数を書かず「`webkit2gtk-driver` より前の全部」と書き換えた。

## 検証

`pnpm test` (54 files / 1399 tests)・`pnpm run check` (0 errors)・`pnpm run lint` は緑。2 つの workflow は YAML として読めることを確かめた。**arm の AppImage が通ることはマージ後の `workflow_dispatch` でしか確かめられない** — PR の CI は arm のランナーで AppImage を作らない。AC #2・#3 はその実行が答える。
<!-- SECTION:NOTES:END -->
