---
id: TASK-93
title: wire.ts と Rust の型同期を開発時チェックで守る
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
labels:
  - maintainability
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: low
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
wire.ts は Rust の serde 出力を手書きで写している。Rust 側に主要な wire shape の serialization/deserialization テストがあるため無防備ではないが、TypeScript compiler は実行時 payload を検査せず、Rust テストも TypeScript 宣言を読まない。型を変えると Rust struct/enum と serde 属性、Rust の JSON shape テスト、wire.ts の interface/union、commands.ts の invoke signature、payload を使う純粋関数と Svelte component の 5 箇所を人手で揃える必要がある。wire.ts は 619 行あり、command 数と payload variant が増えるほど見落としやすい。production dependency を増やさず、Rust が出力する schema または fixture をフロントエンドのテストで検証する開発時チェックを入れる。_sandbox/repository-quality-assessment-2026-08-01.md の保守性節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rust の出力と wire.ts の型のずれが npm test / cargo test のどちらかで検出される
- [ ] #2 production dependency が増えていない
- [ ] #3 意図的に型を変えたときの更新手順が書かれている
<!-- AC:END -->
