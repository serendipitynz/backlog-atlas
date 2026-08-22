---
id: TASK-197
title: src/ のディレクトリ構成を決め、src/lib の 1 か所集中を解く
status: To Do
assignee: []
created_date: '2026-08-22 10:31'
updated_date: '2026-08-22 10:31'
labels:
  - maintainability
  - 'kind:refactor'
milestone: m-4
dependencies:
  - TASK-106
priority: low
ordinal: 188700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/lib` 直下に 91 ファイルが並んでいる（実装 46・unit 試験 43・component 試験 2。2026-08-22 に実測）。`src/` 全体は 120 ファイルなので、木の 76% が 1 ディレクトリにある。サブディレクトリは `icons/` と `messages/` の 2 つだけで、どちらも「ディレクトリ 1 つ = 主題 1 つ」の形である（置き場を定めたのは doc-11 §2.4 と decision-35）。**残り 46 主題ぶんに同じ方針が当たっていないだけで、配置を定めた規則は AGENTS・decision・doc のどこにも無い。**

TASK-92 が 10 ファイル足した回にオーナーが指摘して起票した。**役割ごとの分割そのものは維持する判断で、これは配置だけの課題である。**

**層でまとめる案（`controller/` を作る）は採らない。** 5 主題を貫く層をディレクトリにすると、頭註で互いを名指ししている `settings-controller.ts` と `settings-write.ts` が分かれ、数は 91 から 81 にしか減らない。`vitest.config.ts` の註が 2 つのテストプロジェクトをディレクトリではなくファイル名で分けた理由として「主題で集める」を書いており、層ディレクトリはそれに逆行する。

**効きそうな軸は主題である** — `settings/` に `settings.ts`・`settings-write.ts`・`settings-controller.ts` と各試験、同じく `ledger/`・`history/`・`swimlane/`・`filter/` など。既存 2 ディレクトリと同じ形なので新方針ではなく、2 例に留まっている方針を全体へ広げることになる。**ただし軸は決まっていない** — 主題の粒度をどこで切るか、試験を実装と同居させるか、`wire.ts`・`render.ts`・`platform.ts` のような主題を持たない基盤ファイルをどこへ置くか。決めたら以後のファイルが従う契約になるので、AGENTS か decision に書く判断であり、決定先行として扱う。

**着手は TASK-106 の後が望ましい。** あのタスクは `src/components` を割るので、終われば向こう側の数も出て、`src/` 全体の配置を 1 度で決められる。TASK-92 の PR #150 へ載せなかったのも同じ理由で、import をほぼ全部書き換えるため承認済みのレビューが無効になる。

**触る先が広いので、数え直す対象を先に挙げておく** — `biome.jsonc` の `files.includes`、`vitest.config.ts` の 2 つの `include`、`AGENTS.md` と `AGENTS.ja.md` が名指しする `src/lib/*.ts` のパス（`update.rs` の版表記・走査・ハーネスの項など）、decision-32・35・36 と doc-11 が名指しするパス。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/ のディレクトリ構成が決まり、決めた軸と、主題を持たない基盤ファイルの置き場が AGENTS か decision に書かれている
- [ ] #2 src/lib 直下のファイル数が減り、同じ主題の実装と試験が同じ場所に並んでいる
- [ ] #3 移動の前後で既存のテストが通り、pnpm run check・pnpm run lint・pnpm run build が通る
<!-- AC:END -->
