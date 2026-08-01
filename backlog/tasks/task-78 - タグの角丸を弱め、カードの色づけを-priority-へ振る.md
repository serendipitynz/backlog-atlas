---
id: TASK-78
title: タグの角丸を弱め、カードの色づけを priority へ振る
status: To Do
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-01 01:04'
labels:
  - ui
  - design-system
  - decision
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-77
documentation:
  - backlog/decisions/decision-12 - 表示テーマを設定で選ぶ色値集合として定義する.md
priority: high
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
priority の HIGH / MEDIUM / LOW などのタグ的な表示は、画面設計案 04 の priority チップ（border-radius:3px）に合わせて角丸を弱め、より四角く見せる。現状 TaskCard.svelte の .priority は 999px のピルである。通常ラベル（自由タグ）の 999px は画面設計案 04 が契約 #4「Type とラベルを混ぜない」の一部として維持と明記しているので変えない。

あわせてカンバン上のカードの色づけを、族（不整合）ではなく backlog.md と同じく priority で行う。decision-12 と doc-11 は priority を意図的に無彩 3 段にしており、理由は high=#c0392b が読取不能の族色、medium=#b8860b が縮退の族色と同色で族を汚染することだった。TASK-77 で不整合の族色がカード縁から ⚠️ グリフへ移るため、この衝突は解ける。カード縁を priority に渡し、族色は ⚠️ グリフ自身が持つ配分にすれば、decision-12 のコントラスト規則（文字＝族の色）を保ったまま両立する。

反転する対象は decision-12 と doc-11 だけではない。画面設計案 04 も「現行の high=#c0392b は --mark-unreadable と、medium=#b8860b は --mark-degraded と同色で族の混同を招く」として無彩 3 段への置き換えを推奨し、「priority は族の色を借りない」と述べている。起票する decision の本文で「TASK-77 で族色がカード縁から外れるため 04・05 の前提が変わる」まで書き、後から画面設計案を読んだ人が反対の推奨に突き当たらないようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 priority を無彩 3 段にした decision-12 の判断を上書きする decision がある
- [ ] #2 doc-7 §3 と doc-11 §3 の該当節が改訂されている
- [ ] #3 カードの色づけが priority で決まり、族の色を使っていない
- [ ] #4 priority 未設定のカードの見た目が決まっている
- [ ] #5 priority の色の閾値の決め方が decision に書かれている（カード縁は非文字要素なので印チップの 4.5:1 をそのまま使えない）。決めた比を収録テーマすべてで満たし src/lib/theme.test.ts が判定する
- [ ] #6 priority チップの border-radius が 999px から 3px になっている（画面設計案 04 の priority チップ実測値）
- [ ] #7 通常ラベル（自由タグ）の border-radius 999px が維持されている（画面設計案 04 の契約 #4「Type とラベルを混ぜない」で維持と明記された形。現状 TaskCard.svelte の .label も 999px）
<!-- AC:END -->
