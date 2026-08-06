---
id: TASK-78
title: タグの角丸を弱め、カードの色づけを priority へ振る
status: In Review
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-06 11:46'
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
- [x] #1 priority を無彩 3 段にした decision-12 の判断を上書きする decision がある
- [x] #2 doc-7 §3 と doc-11 §3 の該当節が改訂されている
- [x] #3 カードの色づけが priority で決まり、族の色を使っていない
- [x] #4 priority 未設定のカードの見た目が決まっている
- [x] #5 priority の色の閾値の決め方が decision に書かれている（カード縁は非文字要素なので印チップの 4.5:1 をそのまま使えない）。決めた比を収録テーマすべてで満たし src/lib/theme.test.ts が判定する
- [x] #6 priority チップの border-radius が 999px から 3px になっている（画面設計案 04 の priority チップ実測値）
- [x] #7 通常ラベル（自由タグ）の border-radius 999px が維持されている（画面設計案 04 の契約 #4「Type とラベルを混ぜない」で維持と明記された形。現状 TaskCard.svelte の .label も 999px）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**decision-23 を新設した**（争点 4 件はユーザーが 2026-08-06 に確定）。対応表は
`_sandbox/handoff/referent-table-task-78.md` 第 2 版に先行確定した。

**確定した 4 点** — ①優先度の縁が取る色＝ backlog.md 準拠の 3 色相（表示テーマへ `--priority-high`・
`--priority-medium`・`--priority-low` を追加）②priority チップは無彩 3 段のまま（反転は縁に限る）
③priority 未設定・priority 未知には縁を出さない ④優先度の縁の収録条件＝ 3:1。

**Description の前提が一部成り立っていなかった。** 「TASK-77 で族色がカード縁から外れるので衝突は
解ける」は半分だけ正しい。解けたのは「同じカードの縁が族と priority の両方を述べる」ことで、
`Swimlane.svelte` は読取不能のレーンヘッダ行に `border-left: 3px solid var(--mark-unreadable)` を
描いており、**カードの外にある問題の縁との衝突は残る**。decision-23 はこれを承知で採り、
区別を色相ではなく「その縁を何が持っているか」で行うと定めた。doc-11 §2.3 の問題の縁の列挙に
レーンヘッダ行が落ちていたので、そこも足した。

**AC #6・#7 は決定を要さなかった。** doc-11 §2.2 の角丸表がすでに「チップ 3px / ラベルピル 999px」で、
priority チップの 999px はその表からの逸脱だった。契約は変えず、実装を表へ合わせた。

**実測（着手時）** — backlog.md v1.48.0 の web UI をバイナリから抽出: high→`border-l-4 border-l-red-500`、
medium→`yellow-500`、low→`green-500`、値なし→`gray-300`（dark は 400 番台）。上流の色値は
Atlas の収録条件を満たさない（白地に対して `yellow-500` 1.91:1・`green-500` 2.22:1・`red-500` 3.82:1）
ので、色相の役割だけを取り明度を動かした（decision-12 が借用パレット 8 組へ採ったのと同じ調整）。
無彩トークンで縁を作る案は、3:1 を満たすのが `--fg` だけ（`--muted` は最小 2.53:1、`--line-strong` は
1.49:1）なので、3 段のうち 1 段しか色を持てず退けた。medium の色相は 61〜62°（アンバー）とし、
`--mark-inconsistent` の 75〜90° から離した。high の 25° は `--mark-unreadable` の 3〜31° と重なるが、
動かすと「赤＝高」が失われるので動かしていない。

**収録条件の実測** — 10 テーマ × 3 段 × 3 面の全 90 セルで最小 4.60:1（atlas-dark の
`--priority-medium` 対 `--panel`）。`src/lib/theme.test.ts` が `app.scss` から再計算し、
**優先度色が族の色そのものでないこと**も同じ試験が押さえる。

**実エンジンでの実測**（`_sandbox/app-check/` に `?pri=mixed`・`?density=l` のつまみを追加。
WebKit・Chromium × atlas-light・atlas-dark の 4 条件、カード 33 枚）—
縁は 3 段とも `3px` でテーマの色値どおり（例: atlas-light high = `rgb(187,63,61)`）、
priority 未設定・priority 未知（`urgent`）はどちらも `1px` の `--line` のままで色が付かない。
**縁の有無にかかわらずカード内の文字の左端は +9px で一致**（縁 3px のぶん `padding-left` を
8px→6px にした結果）。priority チップの角丸は 3px、通常ラベルは 999px、`urgent` のチップは
原文のまま出ている。4 条件・2 エンジンで数値は同一。

**測っていないので目視で確かめてほしいこと** — 実機 WKWebView での色の見え方（とくに
medium のアンバーと不整合印 ⚠️ の黄土が同じカードに並んだときの区別）、10 テーマすべての印象、
レーンヘッダ行が読取不能のときに赤の縁が 2 種類（カードの high と行の読取不能）並ぶ見え方。

**据え置いたもの** — `normalizePriority` は `src/lib/filter.ts` から `src/lib/card.ts` へ移した
（絞り込みと優先度の縁が同じ 1 つの正規化で `high` を判定するため）。関数の中身は変えていない。
<!-- SECTION:NOTES:END -->
