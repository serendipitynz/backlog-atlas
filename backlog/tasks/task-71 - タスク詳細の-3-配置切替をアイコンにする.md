---
id: TASK-71
title: タスク詳細の 3 配置切替をアイコンにする
status: To Do
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-01 01:14'
labels:
  - ui
  - task-detail
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-67
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: high
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の表示形式をその場で切り替えられる現在の仕組みは保ち、切替ボタンをアイコン表示にする。画面設計案 02 は 3 配置を ◧（併置サイドバー）・▣（中央モーダル）・⛶（全面シングル）の記号で示しており、lucide を参照していない（設計案全体で lucide の語は 0 件）。lucide の採用は TASK-67 の方針であり、記号から lucide 名への対応はこのタスクで確定する。

アイコンの割当はユーザー指示で確定: サイドバー = panel-right / モーダル = panel-top-dashed / シングル = maximize。panel-top-dashed は「上端に破線の仕切りを持つ矩形」で、中央に浮くモーダルを表す ▣ とは意図が合わないという指摘（square-square・app-window が近い）があったが、ユーザーは 2026-08-01 にそれを認識したうえで指示を優先すると確定した。代替案の再提示はしない。

既定の配置を示す下線印と、閉じる操作と同じ操作群に置く配置は維持する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3 つの切替ボタンが panel-right / panel-top-dashed / maximize のアイコンのみになっている
- [ ] #2 各ボタンの aria-label と title で配置名が読める
- [ ] #3 既定の配置を示す印が残り、選択がアプリ設定に永続する挙動が変わっていない
- [ ] #4 アイコンは src/lib/icons/ のインライン SVG で、production dependency が増えていない
<!-- AC:END -->
