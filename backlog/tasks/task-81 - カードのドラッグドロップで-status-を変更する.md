---
id: TASK-81
title: カードのドラッグ&ドロップで status を変更する
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-01 00:38'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-3
dependencies: []
documentation:
  - backlog/docs/doc-5 - Backlog-更新アダプター-設計.md
priority: medium
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
backlog.md のようにカンバン上のカードを列間でドラッグ&ドロップして status を変えられるようにする。発行は task edit <id> -s <status> の 1 回で、doc-5 の操作写像に既にある。決めるべき点が 4 つある。(1) 未分類列は候補値を定義できないためドロップ先にできない（doc-7 が未分類列に作成入口を置かない理由と同じ）。(2) CLI 縮退中は発行できないのでドラッグ自体を受けないか、受けて理由付きで拒否するか。(3) 発行成功までカードを動かさないか、楽観的に動かして失敗時に戻すか。(4) ドラッグ中に外部変更が入るとバージョン不整合で発行が止まるので、その表示。公開阻害ではなく、列内の既存操作で代替できるため v0.1.0 後に回す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 同じ行の正準ステータス列の間でカードをドラッグ&ドロップすると status が変わる
- [ ] #2 未分類列がドロップ先にならず、その理由が読める
- [ ] #3 CLI 縮退中の扱いが決まっており、理由が読める
- [ ] #4 発行失敗・バージョン不整合のときカードの位置とディスクの内容が食い違わない
- [ ] #5 行をまたぐドロップ（別プロジェクトへの移動）が成立しないことが明示されている
<!-- AC:END -->
