---
id: TASK-182
title: Atlas の画面文を文言表へ抽出し、英語表示を通す
status: To Do
assignee: []
created_date: '2026-08-15 20:58'
updated_date: '2026-08-15 21:43'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-103
priority: medium
ordinal: 173700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 が定めた機構（decision-35 の 文言表・表示言語・失敗理由符号）の上で、Atlas 自身が描く画面文をすべて 文言表 へ移し、英語表示を成立させる。

**この行が TASK-103 と別に在るのは、2026-08-16 に規模を実測してユーザーが分割を選んだためである。** 着手セッションが数えた画面文は、コメントを剥がした後で 46 ファイル・941 行だった（数え方は screen-text.test.ts の剥がし手順）。最大は ProjectDetail.svelte 185・TaskDetail.svelte 105・edit.ts 88。1 セッションに収まらないので、機構と 表示言語 の永続を TASK-103 が持ち、抽出そのものをこの行が持つ。

**crate の側が別の受入条件になっているのは、そこが wire を動かす作業だからである。** 失敗の理由は 4 ファイル・約 28 本（editor.rs 17・history.rs 7・external.rs 3・update.rs 1）あり、CommandError などの detail に載って画面がそのまま描いている。decision-35 はこれを 失敗理由符号 へ移すと定めており、その形は ledgerRefused（reason と detail を分けて持つ）が既に持っている。動く先は wire.ts・wire_fixtures.rs・wire-fixtures/*.json・wire_tokens.json である。

**抽出漏れの走査は、抽出が終わるまで通らない** — 源泉に残った日本語で落ちるのが走査の役目なので、除外表を持たない限り最後に入る。源泉は screen-text.test.ts が既に数えている 4 つ（フロントエンドの .ts と .svelte、crate の .rs、index.html の title、tauri.conf.json の窓 title）。

**訳さない範囲は decision-35 の「訳さないもの」が持つ** — 読み取り対象の管理ファイルの中身、日付、識別子。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 全画面の文言が 文言表 へ外部化され、表示言語 の切替で英語と日本語が入れ替わる
- [ ] #2 crate が組み立てていた失敗の理由が 失敗理由符号 になり、画面へ出る文はフロントエンドが 文言表 から組む
- [ ] #3 抽出漏れを検出する走査が screen-text.test.ts に在り、源泉に日本語を残すと落ちることを確かめてある。除外は decision-35 §4 が挙げる 文言表 の 2 ファイルだけで、走査自身がその 2 つを除いていることを検査が示す
- [ ] #4 英語表示で 1280x800 のレイアウトが崩れない
<!-- AC:END -->
