---
id: TASK-44
title: Windows の OS 関連付け起動をシェル非経由で実装する
status: Done
assignee: []
created_date: '2026-07-26 08:36'
updated_date: '2026-07-31 21:28'
labels:
  - 'kind:feature'
milestone: m-1
dependencies: []
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-37 で外部エディタ経路（doc-8 §7）を実装した際、Windows の関連付け起動は cmd /c start しか手段が無く、cmd.exe がコマンド行を再解釈するため管理ファイル名に含まれる & ^ %…% が別コマンドとして実行され得る（Command::args の argv 境界は子がインタプリタになった時点で保たれない）。シェル経由で出荷せず、Windows では association を None として理由付きで無効化した（$VISUAL/$EDITOR は使える）。doc-8 §7 が挙げる OS 関連付け起動を Windows で満たすには ShellExecuteW 相当（Win32 バインディングまたは Tauri の opener プラグイン）が必要で、いずれも新規本番依存の確認ゲート対象。

なお doc-8 §7 は画面設計案の反映で、起動指定の解決順を「アプリ設定 → $VISUAL → $EDITOR」に改めた（実装は TASK-46）。これは $EDITOR 起動側の解決順の話で、関連付け起動が cmd.exe を経由せざるを得ないという本タスクの問題は変わらない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Windows で OS 関連付け起動をシェルを介さず実装する（ShellExecuteW 相当）
- [x] #2 依存追加はその選定理由と導入範囲を確認してから行う（AGENTS の依存ゲート）
- [x] #3 & ^ %…% と空白を含むパスで、パスがそのまま単一の引数として渡ることを Windows 上で確認する
- [x] #4 editor::association_launcher の Windows 分岐と NO_ASSOCIATION_LAUNCHER の無効化理由を除去する
<!-- AC:END -->
