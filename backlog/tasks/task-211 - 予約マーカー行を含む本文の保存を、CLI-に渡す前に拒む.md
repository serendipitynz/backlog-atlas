---
id: TASK-211
title: 予約マーカー行を含む本文の保存を、CLI に渡す前に拒む
status: To Do
assignee: []
created_date: '2026-10-11 19:31'
updated_date: '2026-10-11 19:31'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
priority: high
ordinal: 202700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
本文の欄に渡す文字列のうち、行全体が管理ファイルの節境界コメント（SECTION:DESCRIPTION/PLAN/NOTES/FINAL_SUMMARY の BEGIN・END、AC・DOD・COMMENTS の BEGIN・END）と一致する行を、ここでは予約マーカー行と呼ぶ。2026-10-12 に TASK-202 が、description・plan・notes の 3 欄それぞれに 7 種の予約マーカー行を入れて task edit を発行した（21 通り）。v1.50.1 は 21 通りとも書いた。v1.53.0 が拒んだ（終了コード 1）のは、その欄自身の節の境界行を含む 3 通りだけで、残りの 18 通りは書いた。書かれたファイルを Atlas の読み取り層に通すと、どれも想定外スキーマで縮退した。つまり利用者は、どの版の CLI でも、画面から保存するだけで自分のタスクを Atlas が正しく読めない形にできる。Atlas 側に防ぎは無い。予約マーカー行を含む入力を、発行前に拒んで理由を述べる（doc-11 §5 のカンマ関門と同じ形）。CLI の判定は「行全体が一致する」で、先頭に空白を 1 つ入れると通る。CLI の拒否文もそれを勧めている。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 本文の欄（description・plan・notes と作成フォームの description）で、予約マーカー行を含む入力は保存が無効になり、理由が表示される
- [ ] #2 21 通りの組合せ（3 欄 × 7 種）を含む単体試験があり、修正を外すと落ちることが確かめてある
- [ ] #3 doc-5 §3.1 と doc-11 §5 に、この拒否と理由が書かれている
<!-- AC:END -->
