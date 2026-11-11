---
id: TASK-214
title: Backlog CLI v1.55.0 以降が書く ISO 8601 の日付を、更新期間の絞り込みと並び順で読めるようにする
status: To Do
assignee: []
created_date: '2026-11-11 02:37'
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
- [ ] #1 localDay が 'YYYY-MM-DDTHH:MM:SSZ' を UTC の時刻として読み、閲覧者の時間帯の暦日を返す
- [ ] #2 v1.55.0 以降の形の updated_date を持つタスクが、その暦日を含む更新期間の絞り込みで残る
- [ ] #3 2 つの形が混ざったルートで、updated と created の並び順が時刻の順になる（同じ日の中も含む）
- [ ] #4 doc-7 §5.2・§5.4 に、受け付ける形と並び順での扱いが書かれている
- [ ] #5 上の 3 つを入力にした検査があり、修正を外すと落ちることが確かめてある
<!-- AC:END -->
