---
id: TASK-81
title: カードのドラッグ&ドロップで status を変更する
status: In Review
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-15 02:08'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-3
dependencies: []
documentation:
  - backlog/docs/doc-5 - Backlog-更新アダプター-設計.md
priority: medium
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
backlog.md のようにカンバン上のカードを列間でドラッグ&ドロップして status を変えられるようにする。発行は task edit <id> -s <status> の 1 回で、doc-5 の操作写像に既にある。決めるべき点が 4 つある。(1) 未分類列は候補値を定義できないためドロップ先にできない（doc-7 が未分類列に作成入口を置かない理由と同じ）。(2) CLI 縮退中は発行できないのでドラッグ自体を受けないか、受けて理由付きで拒否するか。(3) 発行成功までカードを動かさないか、楽観的に動かして失敗時に戻すか。(4) ドラッグ中に外部変更が入るとバージョン不整合で発行が止まるので、その表示。公開阻害ではなく、列内の既存操作で代替できるため v0.1.0 後に回す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 同じ行の正準ステータス列の間でカードをドラッグ&ドロップすると status が変わる
- [x] #2 候補が 2 件以上の受け先へ落としたとき、渡る status を候補から選べる（候補 1 件の受け先では問わない）
- [x] #3 未分類列と候補 0 件の正準列がドロップ先にならず、候補 0 件の列だけがその理由を出す（doc-7 §4.2）
- [x] #4 CLI 縮退中はカードをつまめず、その理由が上部帯から読める
- [x] #5 発行失敗・バージョン不整合のときカードの位置とディスクの内容が食い違わない
- [x] #6 行をまたぐドロップ（別プロジェクトへの移動）が成立しないことが明示されている
- [ ] #7 dragDropEnabled を外した状態で、macOS・Windows・Linux の実機それぞれで列間ドロップが成立する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## この回で決めたこと

**起票の「決めるべき点 4 つ」のうち、判断が要ったのは 1 つだけだった。**残り 3 つ（楽観更新の可否・バージョン不整合の表示・未分類列）は既存の規則から落ちる。代わりに起票が挙げていない争点が 3 つ立ち、ユーザーが 2026-08-15 に 4 件へ回答した。切り分けと回答は decision-34、契約は doc-7 §4.2 が持つ。**AC #2 はこの回に書き改めた** — 元の「未分類列がドロップ先にならず、その理由が読める」が doc-7 §4.1 の確定（未分類列の理由は出さない、2026-08-03 にユーザーが選択）と正面から食い違っていたため。

## 実装の形

**列間ドロップは doc-7 §4.1 の 列の作成時 status 候補 に載る。**候補集合を引く `columnCandidates` を `lane-create.ts` の 1 か所に置き、入口と列間ドロップの両方がそれを読む — 列対応規則をフロントエンドで逆向きに解き直すと、カードが置かれる列と落とせる列が食い違いうる。判定は `src/lib/lane-drop.ts` の純関数（`laneDropTarget`・`laneDrop`・`laneDropStatus`・`buildLaneStatusEdit`・`laneDragHold`）にあり、コンポーネントはその上のマークアップである。**これは TASK-92 の分割前に載せるための形でもある**（引き継ぎ指示書のタスク別の注意）。

**発行は既存の `issue` を通す。**カードの位置は読み取り結果の status の関数なので、更新前競合も発行失敗も追加の機構を要さない。

## 実測（2026-08-15、WebKit ＋ `_sandbox/app-check/`）

WebKit は WKWebView と同系なので実機 Tauri に一番近い。数はすべて `atlas:TASK-1` を To Do からつまんだときのものである。

- **受け先の印は 3 セル**（同じ行の In Progress・In Review・Done）。**自分の列・未分類列・他の 2 行はどれも印が付かない** — AC #1・#3・#6 が 1 枚の画面で見える。
- **候補 0 件**（`?candidates=none` で In Review を 0 件に）: 印は **2 セル**に減り、`In Review 未設定` が画面に出る。**この文は 入口 のもので、列間ドロップ用の 2 本目ではない。**
- **候補 2 件**（`?candidates=two` で Done を `Done`・`Closed` に）: 候補選択の問いが立ち、選択肢は宣言順の 2 件。既定は先頭の `Done`。
- **成功**: カードが To Do のセルから In Progress のセルへ移る（再読込の結果であって、画面が動かしたのではない）。
- **CLI 失敗・更新前競合**（`?update=fail` / `?update=conflict`）: **カードはどちらも元のセルに留まり**、理由が帯に出る。AC #5。
- **CLI 縮退**（`?cli=down`）: カードは **39 枚のまま 0 枚が `draggable`** で、理由は上部帯が出す（`backlog CLI の実行ファイルを解決できません。作成・更新は発行できません`）。カードを押せば詳細は開くままである。AC #4。

**測っていないのは実機 3 環境である（AC #7）。**`dragDropEnabled` を外したので Windows でも成立するはずだが、**これは tauri-utils の doc の記述であって、こちらの実測ではない。** macOS・Linux で横取りが HTML5 のドラッグ&ドロップを壊すかは、そもそもどの doc も述べていない。

## ハーネスに足したもの

**`_sandbox/app-check/` は `update_apply` を持っていなかった。**`default` が `{kind:"unsupported", message}` で reject しており、`CommandError` に `unsupported` の枝は無く、どの枝も持つのは `message` ではなく `detail` なので、画面に `undefined` が出た。**ハーネスの嘘が製品の不具合に見える 4 度目である**（前の 3 度はあのファイルの註が記録している）。切り分けは走っているアプリ自身に `asCommandError` と `commandErrorDetail` を通させて行った。併せて `?candidates=` `?update=` `?cli=` のつまみを足した。

## レビュー用の確認事項

**新しく書いた 16 件の検査は、押さえている規則を 6 通りに壊して全部落ちることを確かめてある**（同じ列への拒否・行またぎの拒否・候補 0 件の拒否・問いの閾値・古い候補の差し戻し・つまめないカード）。
<!-- SECTION:NOTES:END -->
