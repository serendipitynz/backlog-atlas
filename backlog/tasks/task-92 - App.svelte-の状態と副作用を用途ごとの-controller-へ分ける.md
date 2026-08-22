---
id: TASK-92
title: App.svelte の状態と副作用を用途ごとの controller へ分ける
status: Done
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-22 10:30'
labels:
  - maintainability
  - ui
  - 'kind:refactor'
milestone: m-3
dependencies: []
priority: medium
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
App.svelte は冒頭で「grid が描く data と screen-local row state だけを持つ」と説明するが、実際には起動順序と初期 probe、全プロジェクト snapshot の所有、ファイル監視の開始・停止と再読込イベント反映、台帳の登録・更新・削除・並べ替え、設定の読取・保存・適用、画面遷移と未保存確認、タスク・文書・マイルストーン更新の結果反映、Git 履歴読込の起動、列内タスク作成、固定ヘッダ・メニュー・ショートカット・モーダルまで担っている。機械的に数えると 39 個の $state、33 個の $derived、43 個の関数が同じ script にある。個々の規則は src/lib へ出ているが、いつ呼ぶか・どの snapshot を置換するか・どの画面状態を閉じるかが 1 ファイルに集まり、画面横断機能を足すたびにここを変えることになる。表示コンポーネントを細かく割るだけでは足りず、workspace の open/reload/watch と snapshot 置換、台帳の登録・更新・削除・並べ替え、設定の読取・保存・監視再調整、タスク履歴の選択・読込・取消、オーバーレイと未保存確認を用途ごとの controller へ移す。UI 改修が落ち着いた形に対して分割するのが正しい順序なので v0.1.0 後に行う。_sandbox/repository-quality-assessment-2026-08-01.md の構成節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 上記 5 つの用途が controller または Svelte module へ分かれている
- [x] #2 App.svelte が保持する state と関数の数が減り、担う責務が冒頭のコメントと一致している
- [x] #3 分割の前後で既存のテストが通り、画面の挙動が変わっていない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 分けた 5 つ

`src/lib/` に 5 モジュール。どれも `create*(state, ports)` の工場で、第 1 引数が **その controller が
所有する状態**、ports が所有しない値への穴である。この 2 形の使い分けは `settings-write.ts` /
`history-read.ts` が ports だけを取るのと同じ軸で、頭註に書いた。

- `workspace-controller.ts` — 全ルートの読取・1 ルートの再読込・継続検出・再読取イベントの購読
- `ledger-controller.ts` — 登録・登録解除・更新・並べ替え と、4 つが共有する「同時に 1 件だけ」
- `settings-controller.ts` — アプリ設定の読取・保存・監視再調整と、保存が答えを変える probe 群
- `history-controller.ts` — 選択 → 読込 → 取消（順序そのものは既存の `history-read.ts` のまま）
- `overlay-controller.ts` — 被せ層 と 未保存確認

## App.svelte に残したもの

冒頭註を書き換え、残す範囲を「グリッドが描くデータ・画面局所の行状態・2 画面の遷移」と述べ直した。
**起動順序と終了処理は残した** — 各段の理由が「次の段が何を要るか」で、どの controller からも見えず、
`App.component.test.ts` がその列を読んでいる。

機械的な数（実測）:

| | 変更前 | 変更後 |
|---|---|---|
| 行数 | 3,389 | 2,340 |
| `$state` | 57 | 26 |
| `$derived` | 45 | 44 |
| `function` | 70 | 33 |

`$derived` がほぼ動かないのは、残った 44 のほとんどがグリッドの描画データそのもので、冒頭註が残すと
述べている範囲だからである。

## 検証

- `pnpm test` 1,238 件（変更前 1,134 件 + 新規 100 件 + 走査が新ファイルを数えた 4 件）・`pnpm run check`
  0 件・`pnpm run lint` 無指摘・`pnpm run build` 通過。
- **新しい 5 本の試験は、対応する挙動を外して落ちることを確かめてから出した。** 変異は 24 通りで、
  うち 23 は即座に赤になった。残る 1 つ「保存後 probe の呼び出し番号」は最初の試験が判別できておらず、
  **古い答えを後から着ける形へ書き直して落ちることを確かめた。**
- **実エンジン（WebKit）で変更前後を同じ経路で測り、値が一致した** — `_sandbox/app-check/` の
  通常・空台帳・CLI 縮退 の 3 状態と、カードを開く → メニューを開く → Escape の経路。
  レーン 3・カード 39・帯の並び・空台帳の入口文・詳細パネルの題・メニュー 7 行・Escape で 0、
  `pageerror` は前後とも 0 件。
- **GUI E2E はこの作業機では走らない** — macOS だからで、判断は decision-40 が持つ。選択子は
  `scripts/e2e/run.mjs` 先頭の定数のままである。**要素・クラス・`data-band` の値はどれも動かしていない**
  ので、緩めた箇所は無い。

## 併せて直した 1 件

`App.component.test.ts` の `settled()` の回数を 20 → 28 にした。controller 経由の起動段は
controller の内側と呼び出し側で 1 回ずつ待つので、5 分割で 3 回増えた — **床は分割前 17（16 で 1 件落ちる）、
分割後 20（19 で 1 件落ちる）で、20 のままだと余裕が 0 になる**。次に `onMount` へ 1 段足した回が、その段の
欠陥ではない理由で赤くなる。余裕は「回数」なので遅い機械が食い潰すことはない。
<!-- SECTION:NOTES:END -->
