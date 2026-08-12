---
id: TASK-96
title: アプリアイコンを設定する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-12 00:44'
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
- [ ] #3 macOS・Windows・Linux の 3 環境でビルドしたバンドルにアイコンが反映されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #101 は 2026-08-12 に 03f7040 でマージ済み。AC #1・#2 は達成。**AC #3 は macOS だけ確認済みで、Windows・Linux は未確認のまま残す** — ユーザーが 2026-08-12 に「TASK-101 の CI に委ねる」と確定したため。したがって本タスクは PR マージ後も Done にしない。閉じるのは TASK-101 の AC #8（3 OS のバンドルにアイコンが入っていることをワークフローが検査する）が満たされたときで、そこで AC #3 をチェックして Done 反映する。

macOS で確認したこと: pnpm tauri build が作る Backlog Atlas.app の Contents/Resources/icon.icns が、リポジトリの src-tauri/icons/icon.icns とバイト同一であり、描画も新しいアートワークである。

採用した元画像は 1200x1200 の不透明 PNG（rev2）で、渡されたファイルとバイト同一でコミットしている。tauri icon はヘルプに 'with transparency' と書くが不透明な元画像を受け付ける（実測）。不透明ゆえにアイコンは角が直角の正方形になり、macOS では周囲の角丸アイコンと形が揃わない。ユーザーは目視のうえマージしたので、この形で確定とする。気が変わった場合の透明版 rev3 は _sandbox/app-icon/ にある（リポジトリ外）。

pnpm tauri dev は Dock アイコンを持たない。dev が作るのは裸の Mach-O 実行ファイルで、Info.plist も Contents/Resources も無く、埋め込み __info_plist セクションが 0 個であるため。bundle.icon を読むのはバンドラで、それが動くのは tauri build のときだけである。アイコンの目視はビルド済みバンドルで行う。
<!-- SECTION:NOTES:END -->
