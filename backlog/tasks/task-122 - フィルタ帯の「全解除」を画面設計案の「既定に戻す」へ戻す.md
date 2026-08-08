---
id: TASK-122
title: フィルタ帯の「全解除」を画面設計案の「既定に戻す」へ戻す
status: In Review
assignee: []
created_date: '2026-08-07 22:25'
updated_date: '2026-08-08 00:18'
labels:
  - ui
  - design-system
  - 'kind:refactor'
milestone: m-2
dependencies: []
priority: high
ordinal: 119500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-79 の目視で起票。画面では 全解除 と呼んでいるが、doc-12 §3 の転記によれば画面設計案 03 の原文は「既定に戻す」で、Atlas が意図的に別名を採っていた（doc-7 §5.2 と token.ts の対応表が 全解除 を使う）。ユーザーは原文の語へ戻すことを求めている。TASK-70（未対応→未分類）と同型の公開語彙の改称であり、doc-7 §5.2・token.ts・doc-12 §3 の注記を揃えて改訂する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 画面の文言が「既定に戻す」になっている
- [x] #2 doc-7 §5.2 と token.ts の語が改称後の語で揃っている
- [x] #3 doc-12 §3 の「画面では 全解除 と呼ぶ」注記が現状に合わせて改訂されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**画面設計案 03 の原文は、同じ操作に 2 語を持っていた。** §4.3 の寸法表は控えを 既定に戻す と呼び、§4.1 のキー割り当ては同じ操作を 全解除 と呼ぶ。Description の「Atlas が意図的に別名を採っていた」は半分しか成り立たない — 全解除 は Atlas の造語ではなく原文の語でもある。画面と doc-7 §5.2 は控えの語である 既定に戻す を採り、doc-12 §4.1 は転記なので原文の 全解除 をそのまま残した。

**doc-7 §5.2 はこの操作を持っていなかった。** 「全解除」も「既定に戻す」も doc-7 に 1 度も現れず、`git log -S` でも一度も現れたことがない。§5.2 が名前で挙げていたのは 直前の 1 つを戻す だけで、AC #2 は語の置換では満たせなかった。TASK-70 と同じ「doc が覆っていない」型で、着手時の決定先行判定で出た。ユーザーの選択は 3 択から「名前＋動作＋無効条件を §5.2 に新設する」。無効条件（絞り込みが既定のまま **かつ** 追加順が空）はそれまで `token.ts` の註にしか無く、`decision/doc が契約` に照らして置き場が無い状態だった。

**出典表示が 2 か所とも事実として誤っていた。** `token.ts` の対応表の `| §5.2 全解除 |` と doc-12 §4.3 の注記「doc-7 §5.2 と `token.ts` の対応表が 全解除 を使う」は、どちらも doc-7 §5.2 が持たない語を doc-7 由来と述べていた。改称の帰結ではなく独立した誤りとして直した。

**AC が名指しした場所は 2 点ずれていた。** ①AC #3 の「doc-12 §3」は誤りで、注記があるのは §4.3（§3 は 02 タスク詳細）。②AC が挙げていない改訂先が 2 か所あり、doc-11 §2.4 と §8 がどちらも画面の文言として 全解除 を引いていた。

**改訂した範囲**: doc-7 §5.2（2 項新設）、doc-11 §2.4・§8、doc-12 §4.3・§9、`FilterBar.svelte`（可視文言と註 4 か所）、`token.ts`（対応表と `nothingToClear` の註）、`filter.ts`（`defaultFilter` の註）、`App.svelte`（`defaultStorage` の註）、`token.test.ts`（describe・it・註）。decision は書いていない（doc 改訂だけで足りる型）。

**実測（WebKit / `_sandbox/filter-check/` / 1280×800）**: 既定に戻す は 高さ 22.39px・中心 15.99px で、テキスト欄・＋ 絞り込み・トークン・直前の 1 つを戻す と同値（TASK-68 AC #3 の契約が保たれている）。幅は 45.64px → **65.14px**（+19.5px）。帯が 1 行を保つ最小ビューポート幅は 490px → **510px** で、既定のウィンドウ幅 1200px から遠い。`?view=default`・`?view=blocked` とも帯の高さは 32.98px の 1 行のままだった。無効時は `aria-disabled="true"` ＋ `aria-describedby="filter-clear-blocked"` で、理由文「絞り込みは既定のままです。」は `.unseen` として a11y ツリーに残る（doc-11 §5 の 2 つ目の形。TASK-79 4R [P1] が確定させた契約）。

**測っていないもの**: 実アプリ（Tauri / WKWebView）での見え方、`atlas-light` 以外のテーマ、キーボード操作。目視で確かめてほしいのは、フィルタ帯の右端の控えが「既定に戻す」になっていることと、帯が 1 行のままであることの 2 点。

**検証**: `pnpm test` 27 ファイル 679 件 パス。`pnpm run check` 290 ファイル 0 errors / 0 warnings（`_sandbox/app-check/vite.config.ts` の 1 行は既知で、エラー数に入らない）。Rust 側は触っていないので `cargo` は回していない。
<!-- SECTION:NOTES:END -->
