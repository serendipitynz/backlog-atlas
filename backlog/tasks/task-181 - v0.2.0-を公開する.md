---
id: TASK-181
title: v0.2.0 を公開する
status: To Do
assignee: []
created_date: '2026-08-15 12:34'
updated_date: '2026-08-19 00:30'
labels:
  - release
  - 'kind:chore'
milestone: m-3
dependencies:
  - TASK-172
priority: high
ordinal: 172700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
m-3 の最後。m-3 の残りが片付いた時点で v0.2.0 のタグを打ち、リリースを公開する。**手順の正本は doc-13「タグから利用者が受け取る資産までの配布層 設計」である。** 2026-08-19 に TASK-193 が AGENTS 和英の「リリース」節をそこへ移し、AGENTS 側は要約を持たないポインタになった。このタスクはそれを繰り返さず、**この版に固有のもの**だけを持つ。

**TASK-172 の残り 2 件の受入条件は、この回が引き取る。** あちらは PR #125 がマージ済み・AC #3 (arm64 実機での起動) 達成済みで、**AC #1 (リリースワークフローが Linux arm64 の .deb・.rpm・.AppImage をドラフトへ載せる) と AC #2 (README 和英が Linux の対応アーキテクチャを実資産どおり述べている) だけがタグ待ち**として残っている。**この回がドラフトを見て両方をチェックし、TASK-172 を Done にする** — その 2 件は他のどの行にも属していない。

**arm64 は GitHub の `ubuntu-24.04-arm` ランナー上では未測定である。** 手元の arm64 Ubuntu 実機でのビルドと起動は 2026-08-16 に確認済みだが (TASK-172 の Implementation Notes)、**ランナーの apt 一覧とその上でのビルドはこの実行が初めて通る**。落ちるとすれば依存導入の段である。doc-13 §3.5 が同じ未測定を名指ししている。

**doc-13 が持つ実測値には測った日が入っている。** §4.5 の crate 数 (353 / 443) と §4.3 の 25 件は 2026-08-19 の値なので、**依存がその後に動いていればこの回に測り直す。**

**v0.1.0 の回 (TASK-102) との差**: リポジトリのパブリック化・トピック・_sandbox の除外は済んでいるので、この回に含まない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README.md と README.ja.md を出荷するビルドと突き合わせてある (doc-13 §2。読者が行動の根拠にする記述 — 動作環境と Linux の下限・対応アーキテクチャ・Backlog CLI の最低バージョン要件・更新の届き方・できることの一覧)
- [ ] #2 タグと package.json・src-tauri/tauri.conf.json・src-tauri/Cargo.toml・src-tauri/Cargo.lock の 4 ファイルの版が一致している
- [ ] #3 リリースワークフローの 5 ジョブ (macOS・Linux x86_64・Linux arm64・Windows・下書き作成) がすべて success で終わっている
- [ ] #4 ドラフトの資産に Linux arm64 の .deb・.rpm・.AppImage が載っており、x86_64 のものと名前で区別できる
- [ ] #5 TASK-172 の AC #1・#2 をチェックし、TASK-172 を Done にした
- [ ] #6 ドラフトのリリースノートを読んだうえで、手で公開した
<!-- AC:END -->
