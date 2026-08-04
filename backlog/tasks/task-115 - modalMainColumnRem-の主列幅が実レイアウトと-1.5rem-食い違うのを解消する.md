---
id: TASK-115
title: modalMainColumnRem の主列幅が実レイアウトと 1.5rem 食い違うのを解消する
status: To Do
assignee: []
created_date: '2026-08-04 10:39'
labels:
  - task-detail
  - ui
milestone: m-2 v0 公開フェーズ
dependencies: []
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: medium
ordinal: 112500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/lib/placement.ts` の `modalMainColumnRem()` は「脇列・列間・モーダルの左右パディングを引いた残り」として主列幅を返し、1280×800 で 47.75rem を出す。しかし実レイアウトの主列は 49.25rem（788px）で、差はちょうど `MODAL_PADDING_REM`（1.5rem）である。

原因は box-sizing。このリポジトリには box-sizing の全体リセットが無く（各コンポーネントが必要な箇所で個別に `border-box` を指定している）、`.detail[data-placement="modal"]` の `width: min(var(--modal-max-width), ...)` は content box の幅になる。つまりパディングは幅から引かれるのではなく外側へ足される。関数はそれを引いているので、主列を 1.5rem 過小に見積もっている。

いまのところ契約は破れていない。この関数が支えている主張は doc-8 §2.1 の「1280×800 でも 2 列を保つ（脇列 18rem は確保できる）」で、過小評価は安全側に外れるからである。ただし関数の doc コメントは「パディングを引いた残り」と事実でないことを述べており、TASK-113 が行長上限 48rem をこの関数から導いたことで、導出の根拠が 2 つの数字にまたがるようになった（doc-8 §2.1 にその旨を明記してある）。

直し方は 2 通りある。(1) 関数からパディングの減算を外して実レイアウトに合わせる。(2) `.detail` に `box-sizing: border-box` を与えて実レイアウトを関数に合わせる。(2) はモーダルの見た目を 24px 狭めるので、どちらを取るかは判断が要る。2026-08-04 に TASK-113 の実測で判明した。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `modalMainColumnRem()` の返す主列幅と、1280×800 での実レイアウトの主列幅が一致している
- [ ] #2 どちらへ寄せたか（関数を直すか box-sizing を変えるか）とその理由が記録されている
- [ ] #3 doc-8 §2.1 の行長上限の節にある「47.75rem と 49.25rem の食い違い」の記述が、解消後の 1 つの数字へ書き換えられている
- [ ] #4 3 配置とも 1280×800 で実測され、2 列が保たれていることが確かめられている
<!-- AC:END -->
