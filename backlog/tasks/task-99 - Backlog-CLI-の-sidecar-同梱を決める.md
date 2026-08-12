---
id: TASK-99
title: Backlog CLI の sidecar 同梱を決める
status: Done
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-12 03:47'
labels:
  - release
  - decision
  - 'kind:research'
milestone: m-2
dependencies: []
documentation:
  - >-
    backlog/decisions/decision-7 -
    開発は-PATH-上-backlog-を前提とし-sidecar-同梱は配布判断まで先送りする.md
  - >-
    backlog/decisions/decision-26 -
    第三者配布でも-sidecar-同梱を採らず-PATH-上-backlog-の前提を保つ.md
priority: high
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-7 は sidecar 同梱の検討を配布判断まで先送りし、同梱検討契機の第 1 を「第三者配布に踏み出すとき」と定めた。v0.1.0 の公開と GitHub リポジトリのパブリック化はまさにその契機である。同梱するかしないかを決め、決定を decision として残す。同梱する場合は Tauri の externalBin と sidecar Command API で実装し、doc-5 の実行ファイル解決だけを PATH 解決から同梱バイナリ解決へ差し替える（操作写像・作業ディレクトリ・引数配列渡しは変えない）。同梱しない場合は、利用者に Backlog CLI v1.48.0 以上（decision-7 の最低バージョン要件。TASK-58 が 2026-08-01 に v1.47.1 から引き上げた）の導入を求めることを README で明示し、CLI 不在時の読み取り専用起動が導入の入口として成立していることを確認する。バンドル構成に影響するため TASK-101 より先に決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 同梱する／しないの判断と理由が decision として記録されている
- [x] #2 decision-7 の同梱検討契機が到来した事実と、それに対する判断が紐づいている
- [x] #3 同梱しない場合、README に導入要件と CLI 不在時の挙動が書かれている
- [x] #4 同梱する場合、3 プラットフォームぶんのバイナリ管理と更新追随の方法が決まっている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
同梱しないと判断し、decision-26 として記録した。判断の根拠は 2026-08-12 の実測 3 点である。①同梱するなら配布物へ入る単一実行ファイルは macOS arm64 67.4 MB・macOS x64 72.8 MB・Linux x64 96.2 MB・Linux arm64 96.2 MB・Windows x64 100.1 MB・Windows arm64 97.1 MB で、Atlas 本体は .app 14 MB・aarch64 dmg 9.7 MB なので macOS で約 5.8 倍になる ②同梱が取り除こうとした導入摩擦のうち実際に起きたもの（Windows で npm が backlog.exe を PATH へ置かない）は decision-16 の実行ファイル解決の順序が既に解いており、残る摩擦は読み取り専用起動が入口として受けている ③同梱すると Atlas が呼ぶ CLI と利用者自身が打つ CLI が別の版になり得るので、書式の一致を配布のたびに確かめる義務が新しく生まれる。着手して分かったのは、decision-7 の同梱検討契機 第 1 が 2 条件の連言だったことである。前半（開発者＝利用者以外へ配布する）は TASK-102 で到来するが、後半（利用者に個別導入を求めない体験が要る）は到来する事実ではなく選ぶかどうかが本タスクの判断そのもので、契機の到来は同梱せよではなく判断せよを意味していた。AC #4 は条件節（同梱する場合）が発火しないため、3 プラットフォームぶんのバイナリ管理と更新追随は決めていない。ユーザーの指示で backlog.md 1.50.1 との版差も検証し、Atlas が発行する 13 サブコマンド・34 オプションは v1.50.1 に全部存在して削除も改名も 0 件、管理ファイルの書式も同一、milestone に update/edit が無いこと（decision-21 の根拠）も保たれていることを確認した。意味が変わったのは v1.50.0 の 2 件だけで、空値の意味の反転（--ref "" ・--depends-on "" ・-a "" が沈黙無変更から一覧の空化へ）と競合失敗（同一タスクの同時編集で 2 番目の書き手が backlog/.locks/ のタスクロックを取れず非ゼロ終了）である。どちらも Atlas を壊さない — 前者は起動前に拒む側なので発行されず、後者は非ゼロ終了なので doc-5 §5 の CLI 失敗として既存の経路に乗る。この検証から 4 件を起票した。TASK-151（assignee 欄のカンマ入力で保存前の断言が偽になる。m-2）・TASK-152（最低バージョン要件を v1.49.3 へ引き上げる。m-2）・TASK-153（v1.50.0 で開いた 3 操作の取り込み。m-3）・TASK-154（版表記の単一出所化。m-2、TASK-152 の前）。
<!-- SECTION:NOTES:END -->
