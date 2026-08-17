---
id: TASK-150
title: 作図結果 の失敗経路のテストが、まれに落ちるのを直す
status: In Review
assignee: []
created_date: '2026-08-12 00:00'
updated_date: '2026-08-17 23:00'
labels:
  - 'kind:bug'
  - test
milestone: m-3
dependencies: []
priority: medium
ordinal: 144700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/lib/markdown-figure.component.test.ts の 1 件『keeps the fence inside the 本文 and adds nothing outside it』が、フルスイートの実行でまれに落ちる。TASK-96 のセッション (2026-08-12) の実測は、フルスイート 11 回中 1 回の失敗で、落ちたのはそのセッションの最初の 1 回だけだった。その回だけ environment 29.32s・import 11.93s と他の回の 5〜8 倍かかっており、時間に依存した失敗と見える。単独実行では 10 回中 0 回、node_modules/.vite と .vite を消したうえでのフルスイートでも 3 回中 0 回で、要求して再現させることはできていない。

このテストが押さえている契約は doc-11 §14.5 の『描けなかった作図結果 は本文の外に何も残さない』で、mermaid の suppressErrorRendering が document.body へ自分の入れ物を挿さないことを検査している。まれに落ちるままだと、TASK-101 が作るリリースワークフローが CI で pnpm test を実行したときに、変更と無関係にタグの発行が止まりうる。

公開阻害には当たらないと判断した (利用者の誤解・データ損失・操作不能を招かず、公開の差し戻しにもならない。CI が止まっても再実行で通る) ため m-3 に置く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 落ちる条件が実測で特定されている (何が時間に依存しているのか、mermaid の初期化・vitest の待ち・jsdom のいずれか)
- [x] #2 同じ契約を、時間に依存しない形で押さえ直すか、待ちを明示して安定させるかのどちらかになっている
- [x] #3 AC #1 が特定した条件そのものを再現させたうえで、その条件での実行を 20 回繰り返して 0 回落ちることを実測している（暖まったスイートの連続実行は根拠にしない — 記録した 11 回中 1 回の頻度なら 20 回連続成功が偶然でも約 15% 起き、しかも連続実行に冷えた開始は 1 回しか含まれない）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測 (2026-08-18)

**時間に依存していたのは `drawFigures` の動的 `import("mermaid")` で、それがテスト本体の
所要時間のほぼ全部だった。** `drawFigures` の前後を `performance.now()` で挟み、直後に
もう一度 `import("mermaid")` を測る計装で切り分けた。

| 条件 | `drawFigures` | 直後の再 import |
|---|---|---|
| 無負荷・フルスイート 3 回 | 519 / 648 / 632 ms | 0.0 ms |
| 8 コアに 12 本の空回しを載せたフルスイート | 14,228 ms | 0.0 ms |

再 import が 0.0ms なので、**その時間は読み込みであって初期化でも描画でもない。**
jsdom でもない — 読み込みを import 段へ移した後、同じテストは無負荷で 104ms（下の変異検査の値）。

**キャッシュは変数ではなかった。** `node_modules/.vite/deps`（23MB。mermaid の事前バンドルを
含む）を退避してフルスイートを流しても `drawFigures` は 569ms で動かず、再生成されるのは
`node_modules/.vite/vitest/` の 8K だけだった — **vitest はあの deps を読んでいない。**
m-2 が「キャッシュを消しても再現しない」と記録したのは、当該テストが読まないキャッシュを
消していたためである。**記録された 9 例中 8 例が「セッションの 1 回目」に偏っていたのは、
機械が最も混んでいる時刻だからであって、冷えたキャッシュがあったからではない。**

**失敗そのものの再現**: 同じ負荷のまま `pnpm test --testTimeout=5000`（起票時の予算）を流すと、
997 件のうち落ちたのは記録どおりその 1 件だけで、19,946ms だった。

## 対処

- **`src/lib/markdown-figure.component.test.ts` に `import "mermaid";` を足した。**
  ファイルの import に制限時間は掛からないので、読み込みはテストが計られる対象から外れ、
  `drawFigures` の動的 import はモジュールキャッシュから解決される。`beforeAll` で待つ案は
  採らなかった — `hookTimeout` という別の予算へ移すだけで、機械に合わせた数を選ぶ必要が残る。
- **`vitest.config.ts` の `component` プロジェクトから `testTimeout: 30_000` を外した。**
  それは今回の読み込みのためだけに置かれていた予算であり、外した後の最も遅いテストは
  両プロジェクト通じて 411ms（上と同じ負荷下）なので、既定の 5s はハングの番人として足りる。
- **恒久的な置き場は AGENTS 和英「テスト」節。**

## 検証

- **変異検査**: `suppressErrorRendering` を外すと落ちる（104ms、`document.body` に 2 要素）。
  契約は保たれている。
- **AC #3**: 特定した条件（8 コアに 12 本の空回しを載せたままのフルスイート）を確定版ツリーに
  対して 20 回連続で流し、0 回失敗。
- `pnpm test` 997 passed / `pnpm run check` 0 errors・0 warnings / `pnpm run lint` clean。
  **Rust 側は触っていないので `cargo` の 3 つは流していない。**
<!-- SECTION:NOTES:END -->
