---
id: TASK-168
title: About パネルに copyright を出す
status: Done
assignee: []
created_date: '2026-08-13 23:04'
updated_date: '2026-08-14 00:12'
labels:
  - ui
  - release
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: medium
ordinal: 156900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-14 のユーザー指示。"About Backlog Atlas" に copyright が出ていない。

Tauri の既定メニュー（`Menu::default`）は `AboutMetadata.copyright` を `tauri.conf.json` の `bundle.copyright` から取るが、この設定が無い。**すると muda は `NSAboutPanelOptionCopyright` を辞書に入れないので、行そのものが出ない。** `bundle.copyright` を LICENSE と同じ `Copyright (c) 2026 Takuya Otani / SerendipityNZ Ltd.` にすれば、About パネルに加えて .app の Info.plist `NSHumanReadableCopyright`・.deb・.msi の metadata も同時に埋まる。コードは足さない。

**同じ指示で挙がったアイコンは、出荷する .app 側には欠陥が無い。** 既定メニューは `AboutMetadata.icon` に `None` を渡すので、パネルのアイコンは AppKit の既定 — `NSApp.applicationIconImage` — になり、バンドルではそれが `CFBundleIconFile` = `icon.icns` を解決する。添付の画面が青いフォルダだったのは `pnpm tauri dev` で未バンドルのバイナリを起動していたためで、その場合 `Bundle.main.bundlePath` は実行ファイルの親ディレクトリ（フォルダ）を指す。**2026-08-14 にユーザーが起動形態を dev と確認し、コードでの明示指定は採らないと判断した** — 既定メニュー（Edit・View・Window・Help）の構成を Rust 側へ複製して保守する代償と、256x256 の生 RGBA 約 256KB をバイナリへ埋める代償が、dev 起動でしか出ない見た目に見合わないため。**これは済んだ記録ではなく、後続が同じ画面を見て再提起しないための判断の記録である。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tauri.conf.json の bundle.copyright が LICENSE と同じ文言である
- [x] #2 ビルドした .app の Info.plist に NSHumanReadableCopyright がその文言で入っている
- [x] #3 macOS の About パネルに copyright 行が出ることを実機で確認した
<!-- AC:END -->
