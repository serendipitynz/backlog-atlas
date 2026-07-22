---
id: TASK-32
title: ファイル監視・読取版指標・更新前競合検出・再読込契機を実装する
status: To Do
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-22 12:25'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-28
  - TASK-31
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-9 の設計に従い、同一 Backlog ルートを別ウィンドウ・別プロセス・素の backlog が更新する場合の外部変更検出と再読み込みを実装する。Atlas は CLI をまたぐロックを持たず、読んだ版と実ファイルの一致を更新直前に確かめる楽観的検出に徹する（best-effort）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ルートの管理ファイル群をファイル監視で購読し、通知を短い時間窓で束ねて再構築単位で読み直す
- [ ] #2 読取版指標（mtime・サイズ一次、必要時ハッシュ）を読むたびに記録する
- [ ] #3 更新前競合検出で読取版指標と現ファイルが不一致なら CLI を起動せず競合を提示する
- [ ] #4 CLI 成功後は再読込契機で対象を読み直し、ドメインモデルと読取版指標を更新する
- [ ] #5 best-effort の限界（照合後競合窓での上書き喪失）を防げる競合と区別して扱う。監視は読み取り専用とする
- [ ] #6 再読込契機は将来のブランチ切替など追加の再走査契機も同一経路で扱える構造にする（decision-3・TASK-28 の走査元境界と整合）
<!-- AC:END -->
