---
id: TASK-184
title: 抽出漏れの走査を足し、英語表示のレイアウトを確かめる
status: To Do
assignee: []
created_date: '2026-08-15 22:19'
updated_date: '2026-08-16 02:12'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-187
ordinal: 175700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-35 §4 の 2 段目 — 源泉に残った日本語を落とす走査 — を `screen-text.test.ts` の 4 本目として足し、英語表示のレイアウトを確かめる。

**この行は 2026-08-16 に TASK-182 から分けて起票され、同じ日に依存を付け替えた。** 走査は抽出が終わるまで通らない — 源泉に残った日本語で落ちるのが走査の役目なので、除外表を持たない限り最後に入る。**抽出は同日 2 つに割れた**（TASK-183 が 取得子側の画面文、TASK-187 が `msg()` 側の画面文）ので、**依存は TASK-187 である** — TASK-183 だけが済んだ時点では `src/lib/**/*.ts` に画面文の日本語が残っており、そこで走らせれば必ず落ちる。

**源泉は `screen-text.test.ts` が既に数えている 4 つである** — フロントエンドの `.ts` と `.svelte`、crate の `.rs`、`index.html` の `<title>`、`tauri.conf.json` の窓 `title`。**源泉を数え落とさないための検査も既に在る**（`scans the crate and both titles too`）。**語の一覧より先に源泉の一覧を数える** — フロントエンドだけ見ると crate の失敗理由を落とす。

**crate の走査には決めることが 1 つ残っている。** Rust は試験を同じファイルの `#[cfg(test)] mod` に置くので、素の走査は試験の assert 文言と日本語を含む試験関数名（`an_unset_指定_leaves_the_bare_name_for_the_os` など）に当たる。フロントエンドの走査はこれを `SKIPPED`（`\.test\.` ほか）で外しており、その註は「利用者が読むものではない」と述べている。**同じ規則を Rust が試験を置く場所へ当てるだけなので新しい例外ではないが、decision-35 §4 は「例外は 文言表 2 ファイルだけ」と書いている** — 着手セッションは §4 にその一文を足すところから始める。**AGENTS の「コードコメントは英語散文＋日本語領域語」が試験名の日本語を認めているので、試験の側を英語へ書き換える案は採らない。**

**英語レイアウトの実測は借り物 playwright で行う**（引き継ぎ指示書の「実エンジンでの実測」。`_sandbox/app-check/` は本物の `App.svelte` を本物の `commands.ts` の上に立てる型 3）。**数と画像は別のものを見ているので、測れるところを目視へ丸投げしない。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 抽出漏れを検出する走査が screen-text.test.ts に在り、源泉に日本語を残すと落ちることを確かめてある。除外は decision-35 §4 が挙げる 文言表 の 2 ファイルだけで、走査自身がその 2 つを除いていることを検査が示す
- [ ] #2 英語表示で 1280x800 のレイアウトが崩れない
<!-- AC:END -->
