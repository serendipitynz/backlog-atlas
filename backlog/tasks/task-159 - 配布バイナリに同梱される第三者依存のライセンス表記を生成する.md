---
id: TASK-159
title: 配布バイナリに同梱される第三者依存のライセンス表記を生成する
status: To Do
assignee: []
created_date: '2026-08-13 03:48'
updated_date: '2026-08-13 03:49'
labels:
  - release
  - legal
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-101
priority: high
ordinal: 152700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-97 で LICENSE と THIRD-PARTY-NOTICES.md を置いたが、後者が原文を再掲しているのはリポジトリへ取り込んである素材（lucide の図形）だけである。配布するバイナリには pnpm と cargo が解決した依存が入っており、MIT・ISC・Apache-2.0・BSD はいずれも配布物に告知の同梱を求める。その一覧はまだ生成していない。

生成の対象は 2 系統。npm 側は pnpm-lock.yaml が解決した集合、Rust 側は src-tauri/Cargo.lock が解決した集合。どちらもツールで機械生成し、リリース成果物に含める（生成物を手で書かない — 依存が動くたびに古びるため）。TASK-101 のリリースワークフローが成果物を組む場所なので、そこに寄せるのが自然である。

AGENTS.md Dependencies 節により、生成ツールを入れる場合も選定理由と導入範囲を先に確認する（開発時のみの依存であっても）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm 側と cargo 側の依存ライセンス一覧が、ロックファイルからツールで機械生成される（手書きの一覧を置かない）
- [ ] #2 生成した一覧がリリース成果物に含まれる
- [ ] #3 生成ツールの選定理由と導入範囲が AGENTS.md Dependencies 節に従って確認されている
<!-- AC:END -->
