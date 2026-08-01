---
id: TASK-77
title: 不整合の表示を ⚠️ に一元化し、族名の表示をやめる
status: To Do
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-01 00:43'
labels:
  - ui
  - design-system
  - decision
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-67
documentation:
  - backlog/docs/doc-11 - 画面共通のデザインシステム-設計.md
  - backlog/decisions/decision-6 - 不在・欠損は対象不在・読取不能・該当なしを区別して表示する.md
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在はカード左 3px の色で「縮退」「版ずれ」を表し、チップにその語を出している。しかしこれは backlog.md の GUI と互換が無く、backlog.md の browser モードでは問題として現れない事象なので混乱する。タスク 1 件について、判別できなかった項目・参照欠損・読み取り時版と現在ファイルの相違のいずれかがあることを「不整合」と呼び、表示を次へ揃える。カードには ⚠️ の印だけを出し、族名も「縮退」「版ずれ」の語も出さない。タスク詳細には ⚠️ セクションを置き、理由文だけを行として並べる（例: 参照欠損: documentation docs/design/07-milestones.md#M7）。「版ずれ」は「バージョン不整合」へ改称し、専用チップを廃して不整合の理由行の 1 種にする。⚠️ は絵文字ではなく lucide triangle-alert のインライン SVG にする（絵文字はプラットフォームで字形が変わりテーマ色に追従しない）。印の族色は ⚠️ グリフ自身が持ち、カードの縁からは外す（縁は priority へ渡す。TASK-78 の priority 彩色と対になる）。上部帯の「CLI 縮退」は別の指示対象なので今回は改称しない。この変更は doc-11 と decision-6 の族表示の規則に触れるので decision を起票する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 不整合・バージョン不整合の定義と、族名を表示しない理由を書いた decision がある
- [ ] #2 doc-4・doc-9・doc-7・doc-11 の該当節が改訂されている
- [ ] #3 カードに出るのは ⚠️ の印だけで、「縮退」「版ずれ」の語が出ていない
- [ ] #4 タスク詳細に ⚠️ セクションがあり、理由文が 1 件 1 行で並ぶ
- [ ] #5 バージョン不整合が専用チップではなく理由行の 1 種として出る
- [ ] #6 カード左 3px から族色が消えている
- [ ] #7 ⚠️ の色と閾値の決め方が decision に書かれている（印チップ配色規則の 12% 混色背景は ⚠️ グリフに適用できないため、何の上の何との比を何:1 で測るかを決める）。決めた比を収録テーマすべてで満たし src/lib/theme.test.ts が判定する
<!-- AC:END -->
