---
id: TASK-149
title: 窓の大きさをアプリの再起動後も引き継ぐ
status: To Do
assignee: []
created_date: '2026-08-11 11:20'
labels:
  - ui
  - 'kind:feature'
milestone: m-3
dependencies: []
priority: high
ordinal: 143700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-11 のユーザーの要求である。**窓の大きさ を、アプリを終了して起動し直した後も引き継ぐ。窓の大きさ とは、アプリ窓の幅と高さの 2 値を指す。**

**契約の欠落である。** 窓の大きさを保持の対象として扱った doc・decision は無い — 「窓幅」は doc-7 §2.1 のメニュー幅上限と doc-8 §2.2 の主列幅が計算に使う入力値としてだけ現れる。`src-tauri/tauri.conf.json` は `width: 1200`・`height: 800`・`minWidth: 640`・`minHeight: 480` を持ち、**毎回 1200×800 で開く**。最小寸法は TASK-145 が doc-11 §13 の規則を成り立たせるために入れた値である。

**依存ゲートを持つ（AGENTS Dependencies）。** 手段が 2 つあり、どちらも新規本番依存の判断に触れる — Tauri 公式の `tauri-plugin-window-state` を入れるか、窓の大きさをアプリ設定ファイル（decision-13）の項目として Atlas 自身が読み書きするか。**着手セッションはユーザーの回答を待つところから始まる。**

**窓の位置は本タスクの範囲に入れない** — ユーザーが述べたのは大きさである。着手時に併せるかどうかを訊いてよい。

**着手時に確かめること**: 復元した大きさが `minWidth`/`minHeight` を下回らないこと、前回より小さい画面で起動して窓が画面外に出る場合の扱い、後者の手段を採る場合は `KNOWN_SCHEMA_VERSION` の引き上げ（decision-13 の Consequences）と `mergeDraft`・`normalize` の両方を通すこと。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 手段の選定理由と導入範囲がユーザーに確認され、その決定が記録されている
- [ ] #2 窓の大きさが、アプリを終了して起動し直した後も終了前の値で開く
- [ ] #3 復元した値が最小寸法（640×480）を下回らず、doc-11 §13 の規則が成り立ったままである
- [ ] #4 窓の大きさを保持することと、その置き場が doc または decision に書かれている
<!-- AC:END -->
