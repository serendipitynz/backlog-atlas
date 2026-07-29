---
id: TASK-48
title: 印・Type・通常ラベル・priority・無効化の描き方を doc-11 へ揃える
status: To Do
assignee: []
created_date: '2026-07-28 23:15'
updated_date: '2026-07-29 00:22'
labels:
  - 'kind:refactor'
milestone: m-1
dependencies:
  - TASK-47
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-11（画面共通のデザインシステム）が、複数画面で共有する描き方を定めた。現行の描き方はこれと 4 点で食い違う。(1) 印は族の色でベタ塗り＋白文字で、#b8860b 上の白文字は約 2.8:1 しかない（decision-12 の印チップ配色規則へ移す）。(2) priority の high=#c0392b・medium=#b8860b が読取不能・縮退の族の色と同色で、族を汚染している。(3) Type チップと通常ラベルチップの差が角丸半径だけで弱い。(4) 無効化の見た目が箇所ごとに揃っておらず、理由への到達手段も一定でない。カード（doc-7 §3）と詳細（doc-8 §3・§4）の両方を同じ規則へ揃える。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 印を印チップ配色規則（文字＝族の色／背景 12%／枠 45%）で描き、族の色でのベタ塗り＋白文字を廃する
- [ ] #2 priority を --fg/--bg の無彩 3 段にし、族の色を借りない
- [ ] #3 Type チップ（塗り＋太字＋角丸 3px）と通常ラベルチップ（輪郭ピル＋細字＋muted）を分け、同一の一覧に混ぜない
- [ ] #4 無効化を「破線枠＋opacity .45＋cursor:help＋理由」の 4 点で統一し、理由の無い無効化を残さない
- [ ] #5 保存区分印と未対応列の原文 status に族の色を与えず、輪郭のみの中立表示にする
- [ ] #6 正常な不在（空セル・コミット該当なし）と Type 未設定に色を与えない（decision-6 の中立表示を維持する）
- [ ] #7 無効化の理由を、常時表示の補助文または aria-describedby で参照できる説明として置き、title を唯一の格納先にしない（doc-11 §5）
- [ ] #8 キーボードのみとスクリーンリーダーで、無効化された操作の理由へ到達できることを確かめる
<!-- AC:END -->
