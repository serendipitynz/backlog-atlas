---
id: TASK-63
title: プロジェクト詳細の文書区画を 3 カラムに再構成する
status: In Review
assignee: []
created_date: '2026-07-31 23:29'
updated_date: '2026-08-05 05:52'
labels:
  - ui
  - project-detail
  - 'kind:bug'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-10 - プロジェクト詳細画面-設計.md
priority: high
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
画面設計案 07 の文書区画は、16rem の文書一覧と編集ペインの 2 カラムで、これが画面共通の区画ナビ（12rem・概要／文書／マイルストーン／新規タスクを切り替える。4 区画すべてが共有する）の右に並ぶため、画面全体では 3 カラムに見える。現在の実装は単一スクロールのアコーディオンで、一覧と編集が縦に積まれ、文書を選び直すたびに縦位置を失う。3 カラムへ再構成し、一覧の選択と編集ペインの内容を左右に並べる。

画面設計案 07 は 12rem ナビの外側を単一スクローラにしており、列ごとの overflow を持たない。しかし一覧の縦位置を保つ（ユーザーが求めた gmail 的な操作）には列ごとの独立スクロールが必要なので、そこは意図的に 07 から外れる。doc-10 に理由を記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 未保存入力のある文書に印が付き、別の文書を選ぶ経路で破棄確認を通る（現在の契約を維持する）
- [x] #2 1280x800 で 3 カラムが縦積みにならない
- [x] #3 画面共通の区画ナビ（12rem）・文書一覧（16rem）・編集ペインが 3 カラムで並ぶ
- [x] #4 文書一覧と編集ペインがそれぞれ独立にスクロールし、一覧で文書を選ぶと編集ペインだけが切り替わって一覧の縦位置が保たれる
- [x] #5 独立スクロールが画面設計案 07 からの意図的な逸脱であることが doc-10 に記録されている（07 は 12rem ナビの外側を単一スクローラにしており、列ごとの overflow を持たない）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 構成 (TASK-64 が引く)

- 3 カラム: 区画ナビ 12rem (`--section-nav-width`。旧 9rem を design 07 の値へ。4 区画共通) / 文書一覧 16rem (`--doc-list-width`) / 編集ペイン (残り幅)。幅定数は `lib/project-detail.ts` の `SECTION_NAV_WIDTH_REM`・`DOC_LIST_WIDTH_REM` から custom property で降ろす。**いずれも content box を名指す** (TASK-115。padding・1px 罫は外側)。
- 編集ペインは 更新フォーム → 作成フォーム → 提供しない操作区画 の縦積みで、文書の選択で差し替わるのは更新フォームだけ。`.panel` は文書区画のとき `&.split` でスクロールを止め、左右 padding を各列 (`.doc-list`・`.doc-pane`) へ移す — スクロールポートの端に接したフォーカスリングが切れるため (TASK-74 実測)。
- 破棄前確認は `.columns` の外・上 (doc-10 §5 に理由を記録)。
- ルート読取不能・読み込み中は列を作らず、文と提供しない操作区画だけを出す。

## 実測 (playwright、WebKit・Chromium 一致、1280×800、?docs=30)

- 3 列横並び x = 0 / 205.8 / 484.4、右端 1280 内。content 幅: ナビ 192.2px ≒ 12rem・一覧 256.4px ≒ 16rem・ペイン 774.4px。
- 一覧 scrollTop 400 のまま下方 doc-21 の編集を開いても 400 を維持 (AC #4)。編集ペインの scrollTop 変更は一覧に影響なし。
- 未保存入力を持って別文書の編集を押すと破棄前確認が 2 列の上に出る (AC #1 の経路。実エンジンで確認)。
- ハーネス: `_sandbox/project-detail-check/` に `?docs=<n>` を追加 (fixture の 1 件を複製、title 長は 3 行ごとに長文)。

## 測っていないもの (目視依頼の範囲)

- 実機 Tauri (WKWebView) での描画。スクロールバーが常時表示の設定での列幅の見え方。
- 一覧の縦位置保持の体感 (数値では KEPT)。
- Editor 部品 (本文欄) がダークテーマで白いのは既存のまま (本タスクの対象外)。
<!-- SECTION:NOTES:END -->
