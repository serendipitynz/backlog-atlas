---
id: TASK-77
title: 不整合の表示を ⚠️ に一元化し、族名の表示をやめる
status: Done
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-06 08:44'
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
- [x] #1 不整合・バージョン不整合の定義と、族名を表示しない理由を書いた decision がある
- [x] #2 doc-4・doc-9・doc-7・doc-11 の該当節が改訂されている
- [x] #3 カードに出るのは ⚠️ の印だけで、「縮退」「版ずれ」の語が出ていない
- [x] #4 タスク詳細に ⚠️ セクションがあり、理由文が 1 件 1 行で並ぶ
- [x] #5 バージョン不整合が専用チップではなく理由行の 1 種として出る
- [x] #6 カード左 3px から族色が消えている
- [x] #7 ⚠️ の色と閾値の決め方が decision に書かれている（印チップ配色規則の 12% 混色背景は ⚠️ グリフに適用できないため、何の上の何との比を何:1 で測るかを決める）。決めた比を収録テーマすべてで満たし src/lib/theme.test.ts が判定する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
決定先行として decision-22（タスク1件の不整合をカードでは⚠️の印1つに束ね族名を表示しない）を新設し、
decision-6・decision-12 を原地改訂、doc-4 §5・doc-7 §3/§5.2/§6・doc-8 §3/§3.1/§7・doc-9 §1/§5/§7・
doc-10 §4.2・doc-11 §1/§2.1/§2.3/§2.4/§3/§4/§9・doc-12 §1/§3 と、doc-4 §5 を引く
decision-2・4・5・20・21 を改訂した。対応表は `_sandbox/handoff/referent-table-task-77.md` 第 2 版に先行確定。

ユーザーが確定した争点 3 件（2026-08-06）:
- 族は 3 つへ（不整合＝黄土・照合不能／継続検出停止＝灰青・読取不能＝赤）。`--mark-degraded` →
  `--mark-inconsistent`、`--mark-version-conflict`（紫）は廃止。上部帯② CLI 縮退 は不整合の色を借りる。
- 「縮退」の置き換えは表示語＋表示側の doc と識別子まで。`src-tauri` の `DegradeEvent`・`TaskHealth` と
  wire のトークンは「記録」の語として据え置き（wire fixture の再収録は不要）。
- 印グリフの収録条件は 3:1（WCAG 1.4.11 の非文字要素の下限）。

実装:
- `src/lib/mark.ts` を書き換え。`MarkKind` は `inconsistent` へ集約し、`taskMarks`/`degradeMark`/
  `versionConflictMark` を `inconsistencyReasons`/`isInconsistent`/`inconsistencyLabel`/
  `versionConflictReason` へ置換。理由行はカードの `aria-label`・`title` と不整合区画が同じ 1 つの
  derivation から読む。`detail.ts` の `degradeSummary`（この区画専用だった）は削除。
- `TaskCard.svelte`: チップ 2 種 → ⚠️ 1 つ（`role="img"` の包み ＋ `aria-hidden` の Icon）。
  カード左 3px の族色を削除。`TaskDetail.svelte`: 見出しも ⚠️、縮退区画 → 不整合区画（理由行を 1 件 1 行）、
  更新前競合の告知は不整合の色へ。
- 絞り込みの facet `degraded`（「縮退のみ」）→ `inconsistent`（「不整合のみ」）。**判定はカードの ⚠️ と同じ**に
  したので、`matchesFilter`・`collectFacets`・`buildSwimlane` は `InconsistentLookup` を受け取る
  （バージョン不整合はシェルの記録にあり、read には無いため）。widen しないと ⚠️ の出ているカードを
  不整合の絞り込みが隠す。
- `lucide.ts` に `triangle-alert`（lucide-react v1.17.0、path 3 本。要素種別の列挙は増えていない）。
- `theme.test.ts` に印グリフの収録条件（族の色 対 面が 3:1 以上）を 10 テーマ × 4 値 × 3 面で追加。

実測（借り物 playwright、1280×800、atlas-light、WebKit と Chromium）:
- カードの ⚠️ は **12.8 × 12.8px**（.8rem の 1em）、`path` 3 本、色は `--mark-inconsistent`
  （`rgb(123,90,0)`）、`role="img"`、`aria-label` は「不整合: 参照欠損: documentation …」、
  可視テキストは空、両エンジンで同値。カードの `border-left` は **1px の `--line`**（族色は消えた）。
- タスク詳細の見出しの ⚠️ も 12.8px・同色。不整合区画の見出しは「⚠️ 不整合」、理由行は 1 件 1 行、
  区画左 3px は `--mark-inconsistent`。
- 印グリフの比は 10 テーマ × 4 値 × 3 面の全 120 セルで最小 **5.39:1**（黄土だけなら 5.53:1）。閾値 3:1。
- ハーネスは `_sandbox/sticky-check/` に `?broken=1` を追加（先頭カードを不整合にする）。

測っていないもの: 実機 WKWebView、⚠️ が 2 件以上の理由を持つときのツールチップの折り返し、
ダークテーマでの見え方（色値は同じ規則で検算済み）、絞り込み「不整合のみ」を掛けた状態の一覧。

検証: `pnpm test` 607 件・`pnpm run check` エラー 0 警告 0・`pnpm run build` 成功。
`src-tauri` は変更していないので `cargo` は実行していない。
<!-- SECTION:NOTES:END -->
