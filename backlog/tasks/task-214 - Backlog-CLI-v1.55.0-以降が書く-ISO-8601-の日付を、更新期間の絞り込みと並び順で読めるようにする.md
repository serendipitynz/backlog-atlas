---
id: TASK-214
title: Backlog CLI v1.55.0 以降が書く ISO 8601 の日付を、更新期間の絞り込みと並び順で読めるようにする
status: In Review
assignee: []
created_date: '2026-11-11 02:37'
updated_date: '2026-11-11 03:20'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/releases/tag/v1.55.0'
priority: high
ordinal: 205700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.55.0（2026-10-20 公開）から、created_date と updated_date を 'YYYY-MM-DDTHH:MM:SSZ' の形で書くようになった（リリースノートの #1124。2026-11-11 に v1.55.3 で実測。v1.54.0 までは 'YYYY-MM-DD HH:MM'）。CLI は既存の値を書き換えないので、ルートには 2 つの形が混ざる。

period.ts の localDay が受け付けるのは YYYY-MM-DD と YYYY-MM-DD HH:MM[:SS] だけで、period.test.ts は 2026-08-09T22:46:00Z を解析できない値として拒むことを明示的に検査している。filter.ts の matchesUpdatedPeriod は、期間の端が 1 つでも入っていると解析できないタスクを除く。そのため v1.55.0 以降で作成・編集したタスクは、更新期間の絞り込みから黙って消える（今日編集したタスクが「今日」で残らない）。画面には何も出ない。

並び順（swimlane.ts の updated・created）は文字列のまま比べる（doc-7 §5.4）ので、2 つの形が混ざると、同じ日の中で前後が狂いうる。空白（0x20）が T（0x54）より前に来るためである。タスク詳細の見出しは値をそのまま出すので壊れないが、2 つの形が並ぶことになる。

この不具合は最低バージョン要件とは関係が無い。他のツールや手編集で書かれた値にも当てはまるので、読み取り側で受け付ける形を広げる。どの形まで受け付けるか（Z だけか、+09:00 のようなオフセットも受け付けるか）と、並び順を文字列比較のままにするか正規化するかは、doc-7 §5.2・§5.4 の改訂として着手時に決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 localDay が 'YYYY-MM-DDTHH:MM:SSZ' を UTC の時刻として読み、閲覧者の時間帯の暦日を返す
- [x] #2 v1.55.0 以降の形の updated_date を持つタスクが、その暦日を含む更新期間の絞り込みで残る
- [x] #3 2 つの形が混ざったルートで、updated と created の並び順が時刻の順になる（同じ日の中も含む）
- [x] #4 doc-7 §5.2・§5.4 に、受け付ける形と並び順での扱いが書かれている
- [x] #5 上の 3 つを入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
着手時の判断（2026-11-11、オーナー）: 受け付ける形にオフセットも含める。並び順は書式を揃えてから比べる。

1. period.ts の 2 本の正規表現を、1 つの読み取り関数に置き換える。受け付けるのは 4 形である。
   - YYYY-MM-DD（時刻なし。今のまま暦日として扱う）
   - YYYY-MM-DD HH:MM[:SS]（UTC として読む。今のまま）
   - YYYY-MM-DDTHH:MM[:SS]Z（v1.55.0 以降の CLI が書く形。UTC）
   - YYYY-MM-DDTHH:MM[:SS]±HH:MM（書かれたオフセットで UTC に直す）
   T 区切りでゾーンを持たない値、空白区切りでオフセットを持つ値、小数秒、コロンの無いオフセット、範囲外のオフセットは、これまでどおり解析できない値とする。
2. period.ts に並び順の鍵を足す。時刻付きの値は UTC の 'YYYY-MM-DD HH:MM:SS' に直す。時刻なしの値と解析できない値は、文字列のまま返す。swimlane.ts の updated・created と既定の 3 段目は、この鍵を文字列として比べる。
3. 検査を書く。period.test.ts（新しい形とオフセット、拒む形）、filter.test.ts（Z 形の値が期間の絞り込みで残る）、swimlane.test.ts（2 つの形が混ざったときに同じ日の中でも時刻順になる。オフセット付きの値も UTC に直して並ぶ）。修正を外すと落ちることを確かめる。
4. doc-7 §5.2（基準時間帯・受け付ける形）と §5.4（日付の比べ方）を改訂する。§5.4 を引いている doc-4 §7 の 1 文も合わせて直す。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装

- period.ts: 2 本の正規表現を readTimestamp 1 つにまとめた。受け付けるのは 4 形である。YYYY-MM-DD（暦日）、YYYY-MM-DD HH:MM[:SS]（UTC として読む）、YYYY-MM-DDTHH:MM[:SS]Z、YYYY-MM-DDTHH:MM[:SS]±HH:MM（書かれたオフセットで UTC に直す）。localDay はその結果から暦日を出す。
- 並び順の鍵 dateSortKey を period.ts に置いた。時刻付きの値は UTC の 'YYYY-MM-DD HH:MM:SS' に綴り直し、時刻なしの値と解析できない値は書かれたまま返す。swimlane.ts の updated・created と既定の 3 段目は、この鍵を文字列として比べる。日付の読み方を 1 か所に保つために、swimlane.ts ではなく period.ts に置いた。
- 拒む形: T 区切りでゾーンの無い値、空白区切りでオフセットや Z の付いた値、小数秒、コロンの無いオフセット、小文字の t・z、範囲外のオフセット（+24:00・+09:60）。T 区切りでゾーンの無い値を拒むのは、ISO 8601 がそれを書き手のローカル時刻として読むのに、どの時間帯だったかが値から読めないためである。
- doc-7 §5.2: 基準時間帯の項を「時刻を持つ値」に限定した。版差記録の項（v1.50.1 と v1.55.0 の書式）を足し、受け付ける 2 形を 4 形に改めた。§5.4: 「文字列のまま比べる」を「書式を揃えてから文字列として比べる」に改め、改めた理由を書いた。doc-4 §7 の引用 1 文と、period.ts・swimlane.ts の註で旧規則を引いていた 2 か所も直した。対応表は本文より先に、TASK-214 の対応表 初版として確定した。

## 検査（AC #5）

- 修正を外して落ちることを、3 つの変異で確かめた。
  - period.ts と swimlane.ts を HEAD に戻した場合: filter・swimlane の新しい検査 3 件が落ちた。
  - ZONED 形が一致しないようにした場合: 新しい検査 6 件が落ちた。
  - オフセットを無視した場合: 3 件が落ちた。
- filter.test.ts に置いたオフセットの検査は、変異 3 でもこのマシン（NZ）では落ちなかった。filter は実行環境の時間帯を注入できず、NZ ではオフセットを無視しても同じ暦日になるためで、検査として弱いので外した。オフセットの換算は period.test.ts が時間帯を注入して確定的に押さえている。
- pnpm test（54 ファイル・1394 件）、pnpm run check（0 errors。_sandbox/app-check の設定読み込みエラーは以前から出るもの）、pnpm run lint が通った。Rust は変えていない。

## 規模計測（フロントエンド側だけ、Node/V8）

- 並び順で比較のたびに正規表現を通すようになったので、scripts/scale/frontend.mjs の measureFrontend を修正後と HEAD で比べた。再計算時間は 20,000 タスクで 7.63ms 対 6.99ms、4,000 タスクで 1.91ms 対 1.58ms で、差は 1ms 未満だった。
<!-- SECTION:NOTES:END -->
