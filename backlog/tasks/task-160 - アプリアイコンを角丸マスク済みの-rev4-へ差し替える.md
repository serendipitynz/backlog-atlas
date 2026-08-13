---
id: TASK-160
title: アプリアイコンを角丸マスク済みの rev4 へ差し替える
status: In Review
assignee: []
created_date: '2026-08-13 03:48'
updated_date: '2026-08-13 03:53'
labels:
  - ui
  - release
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: medium
ordinal: 153700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 のユーザー指示。「システム的にマスクされるところとされるところがあり、されないところが不自然になるので、一律マスクつけた状態をアイコンとして生成しておく」。

TASK-96 が採用した atlas-icon-rev2.png は角が直角の正方形・不透明で、macOS のように OS が角丸マスクを掛ける環境では周囲と揃うが、掛けない環境（Windows のタスクバー・Linux のランチャー）では直角のまま出る。TASK-96 の記録は「気に入らなければ rev3 に角丸背景を付ける案がユーザーから既に出ている」と残していた。その follow-through である。

_sandbox/app-icon/atlas-icon-rev4.png（1200x1200・アルファ有り・角丸マスク済み）を src-tauri/app-icon.png とし、AGENTS.md Toolchain 節の手順で再生成する（pnpm tauri icon src-tauri/app-icon.png のあと、モバイル標的が無いので icons/android と icons/ios を消す）。icon.icns だけはバイト再現しないので、差分が icon.icns 単独なら変更なしとして扱う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src-tauri/app-icon.png が _sandbox/app-icon/atlas-icon-rev4.png と同一で、src-tauri/icons/ の 17 件がそこから生成されている
- [x] #2 生成物がすべてアルファを持ち、角丸マスクが焼き込まれている（OS がマスクを掛けない環境でも角丸で出る）
- [x] #3 icons/android と icons/ios がコミットされていない
<!-- AC:END -->
