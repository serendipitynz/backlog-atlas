---
id: TASK-176
title: 固定ヘッダを廃し、総件数をタイトルバーへ・メニューを各画面の最上段の帯へ移す
status: To Do
assignee: []
created_date: '2026-08-14 13:21'
labels:
  - ui
  - 'kind:feature'
  - swimlane
  - project-detail
  - design-system
milestone: m-3
dependencies: []
priority: medium
ordinal: 167700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-31 の実装。固定ヘッダ（doc-7 §2.1）の行を無くし、その 3 つを行き先ごとに分ける — 画面名は廃止、総件数はタイトルバー、メニュー（☰）はその画面の最上段の帯の右端（スイムレーンはフィルタ帯、プロジェクト詳細は doc-10 §3 のヘッダ行）。

タイトルバーへ出す手段は OS で分ける。macOS は重ね型（titleBarStyle: Overlay ＋ hiddenTitle、decorations は true のまま。信号機帯の幅を帯の左に空ける）、Windows・Linux は窓の題そのものを書き替える。分岐は cfg ではなく値で持つ（m-1 TASK-44 の規則）。自前装飾（decorations: false）は 3 OS どこでも採らない — 失う窓操作が出るうえ、固定ヘッダが OS の窓操作を持つ形になって doc-7 §2.1 と衝突する。

あわせてプロジェクト詳細の 戻る を arrow-left のアイコンのみのボタンにする。これは doc-11 §2.4 の 語の中の記号（← スイムレーン。原文は doc-12 §8）からの意図的な逸脱で、逸脱として記録する。

実測済みの値（decision-31 の実測の項）: 取り戻す高さ 32.0 pt、信号機帯の右端 69 pt・窓上端から 9〜23 pt、固定ヘッダ 46.83 px。帯の左を 78 px 空けても 1200 px 幅では溢れない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 固定ヘッダの行が無くなり、画面名がどの画面にも出ていない
- [ ] #2 ☰ がスイムレーンではフィルタ帯の右端、プロジェクト詳細では doc-10 §3 のヘッダ行の右端にあり、モーダルを閉じたときのフォーカスが移設先の ☰ へ戻る
- [ ] #3 macOS で総件数がタイトルバーの帯に出る（titleBarStyle: Overlay ＋ hiddenTitle。装飾は残り、信号機帯の下に文字が潜らない）
- [ ] #4 Windows・Linux で総件数が窓の題に出る。OS の分岐が cfg ではなく値で持たれている
- [ ] #5 プロジェクト詳細ではタイトルバーがアプリ名だけを出す（総件数はスイムレーン限定という doc-7 §2.1 の契約のまま）
- [ ] #6 プロジェクト詳細の 戻る が arrow-left のアイコンのみのボタンになり、行き先の語を aria-label が持つ
- [ ] #7 追加した権限が core:window:allow-start-dragging と core:window:allow-set-title の 2 つだけである
- [ ] #8 doc-7 §2・§2.1・§5.2、doc-10 §3、doc-11 §2.4 が改訂され、doc-12 §8 の原文からの逸脱が記録されている
- [ ] #9 実機で確かめた: Windows と Linux で題に総件数が出ること、macOS の帯をつかんで窓が動きダブルクリックで拡大すること
- [ ] #10 変更前後を借り物 playwright で実測して記録した（固定ヘッダの高さが内容へ返ること、帯が 1200 px 幅で溢れないこと）
<!-- AC:END -->
