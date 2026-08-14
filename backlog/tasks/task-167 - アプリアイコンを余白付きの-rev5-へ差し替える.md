---
id: TASK-167
title: アプリアイコンを余白付きの rev5 へ差し替える
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
ordinal: 156800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-14 のユーザー指示。Dock で他のアプリアイコンより大きく見える — 余白が無いため。https://github.com/serendipitynz/mallow を参考に、余白を付けた `_sandbox/assets/atlas-icon-rev5.png` を用意した。

TASK-160 が採用した rev4 は 1200x1200 の全面が不透明で、角丸マスクは焼き込まれているが余白を持たない。**実測（アルファの外接矩形）**: rev4 は (0,0)-(1199,1199) で内容が 1200x1200、rev5 は (125,125)-(1074,1074) で内容が 950x950 — 各辺 125px（10.42%）が透明で、内容は一辺の 79.2% を占める。macOS の Dock は与えられた画像を割り当て枠いっぱいに描くので、余白を持たない画像は、Apple の標準グリッド（1024 に対し角丸正方形 824 ≒ 80.5%）で描かれた周囲のアイコンより大きく出る。rev5 の 79.2% はその標準比率に合わせた値である。

差し替えの手順は TASK-160 と同じで、AGENTS.md Toolchain 節が持つ — `pnpm tauri icon src-tauri/app-icon.png` を走らせたあと、モバイル標的が無いので `icons/android` と `icons/ios` を消す。`icon.icns` だけは要素の並び順が毎回変わってバイト再現しないので、差分が `icon.icns` 単独なら変更なしとして扱う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src-tauri/app-icon.png が _sandbox/assets/atlas-icon-rev5.png と同一で、src-tauri/icons/ の 17 件がそこから生成されている
- [x] #2 生成物が透明な余白を持ち、内容が画像の一辺の約 79% に収まっている
- [x] #3 icons/android と icons/ios がコミットされていない
- [x] #4 macOS の Dock で周囲のアイコンと大きさが揃っていることを実機で確認した
<!-- AC:END -->
