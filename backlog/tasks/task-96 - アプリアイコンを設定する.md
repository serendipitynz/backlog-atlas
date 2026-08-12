---
id: TASK-96
title: アプリアイコンを設定する
status: Done
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-12 01:13'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-95
priority: high
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src-tauri/icons が Tauri の既定素材のままである。Backlog Atlas のアイコンを用意し、tauri build が macOS の .icns、Windows の .ico、Linux の png、および Windows Store 用の Square*.png をすべて生成できる元画像から作る。tauri icon コマンドで派生させる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 元画像（1024x1024 以上）がリポジトリにある
- [x] #2 src-tauri/icons の全ファイルが元画像から生成されており、既定素材が残っていない
- [x] #3 macOS・Windows・Linux の 3 環境でビルドしたバンドルにアイコンが反映されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #101 は 2026-08-12 に 03f7040 でマージ済み。AC #1・#2・#3 とも達成。

AC #3 は 3 OS とも実機で確認した。いずれも「アイコンらしきものが入っている」ではなく「入っているのはこの PR が生成したファイルそのもの」まで確かめてある。

- macOS: pnpm tauri build が作る Backlog Atlas.app の Contents/Resources/icon.icns が、リポジトリの src-tauri/icons/icon.icns とバイト同一。描画も新しいアートワーク。
- Windows: release の backlog-atlas.exe に icon.ico の最大エントリ（256x256 の PNG、128892 バイト、ico 内オフセット 24334）のバイト列がそのまま存在する。ユーザーが PowerShell で確認（byte 12832472 で一致）。
- Linux: Ubuntu 24 の WSL で pnpm tauri build を実行し、deb の usr/share/icons/hicolor/<size>/apps/backlog-atlas.png 4 件が、リポジトリの 128x128@2x.png・128x128.png・64x64.png・32x32.png とバイト数まで一致（128892・38497・10876・2996）。bundle.icon へ足した 64x64.png が実際に配置されることもここで確認できた。

一度「Windows・Linux は TASK-101 の CI に委ねる」と決めたが、ユーザーが両方を実機で確認したので本タスク内で閉じた。TASK-101 の AC #8（CI でのアイコン検査）は回帰防止として残す。

アイコンの確認方法は OS で違う。Windows のアイコンは build.rs の tauri_build::build() が embed-resource 経由で exe へ埋め込む Win32 リソースなので、コンパイル時に入る。したがって tauri dev でも表示される。macOS のアイコンはバンドラが .app へ入れるので tauri build でしか出ず、tauri dev は裸の Mach-O 実行ファイルを作るだけで Info.plist も Contents も持たない。Linux も同じくバンドラが deb/AppImage へ入れる。

採用した元画像は 1200x1200 の不透明 PNG（rev2）で、渡されたファイルとバイト同一でコミットしている。tauri icon はヘルプに 'with transparency' と書くが不透明な元画像を受け付ける（実測）。不透明ゆえにアイコンは角が直角の正方形になり、macOS では周囲の角丸アイコンと形が揃わない。ユーザーは目視のうえマージしたので、この形で確定。透明版 rev3 は _sandbox/app-icon/ にある（リポジトリ外）。

Linux でのビルドには Ubuntu 24 が要る。この版の webkit2gtk クレート 2.0.2 は webkit2gtk-4.1 を、soup3 0.5.0 は libsoup-3.0 を要求し、20 や 22 では揃わない。必要な apt パッケージは libwebkit2gtk-4.1-dev, build-essential, curl, wget, file, pkg-config, libxdo-dev, libssl-dev, libayatana-appindicator3-dev, librsvg2-dev。
<!-- SECTION:NOTES:END -->
