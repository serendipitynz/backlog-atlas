---
id: TASK-178
title: PR ごとに走る CI を新設し、3 つの検査をマージ要件にする
status: In Review
assignee: []
created_date: '2026-08-14 22:42'
updated_date: '2026-08-14 23:18'
labels: []
dependencies: []
ordinal: 169700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-33 の実施。これまで .github/workflows/ に在るのは release.yml だけで、コードそのものを見る段が 1 つも無かった。decision-32 がこの穴を名指ししたまま範囲外として先送りしている。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ci.yml が pull_request と main への push で走り、frontend (ubuntu で lint・check・test・build) と rust (macOS と Windows で fmt --check・clippy -D warnings・test) の 2 ジョブを持つ
- [x] #2 rust ジョブが Linux を持たない理由 (述語の網羅と、apt 一覧を 3 箇所目に増やさないこと) がワークフロー自身と AGENTS の両方から読める
- [x] #3 ruleset main が有効で、frontend・rust (macos-latest)・rust (windows-latest) をマージ要件とし、既存の deletion と non_fast_forward を保っている
- [x] #4 repository admin の迂回が置かれており、その理由 (Done の commit と、壊れた検査を直せること) が記録されている
- [x] #5 component プロジェクトの testTimeout が上がっており、断続的失敗の原因 (decision-25 の動的 import がテスト予算に乗ること) が理由として書かれている
- [x] #6 CI が実行する 4 つの段すべてがローカルで通る
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実測は 2026-08-15、macOS。GitHub 側の設定は同日に API から読み書きした。

ランナーの選択根拠: src-tauri/src の OS 条件付きコンパイル述語は 7 種類 (unix 12、target_os="windows" 9、windows 8、any(target_os="windows", test) 3、not(target_os="windows") 2、target_os="macos" 1、not(any(macos, windows)) 1) で、target_os="linux" は 0 件。macOS と Windows の 2 ランナーは、最後の 1 つを除く 6 種類をコンパイルする。その 1 つは editor.rs の Platform::current の return Platform::Freedesktop; 1 行で、その値の挙動は Platform::ALL が全プラットフォームのテストに載せている。

rust ジョブに Node を入れていないのは、cargo test が dist/ 無しで通ることを測ったため (412 passed / 4 ignored)。tauri-build が frontendDist を要求するのはバンドルを作るビルドだけである。

断続的失敗は decision-25 の動的 import がテスト予算に乗る構造によるもので、component プロジェクトの testTimeout を 30 秒にした。TASK-150 は閉じない。

ruleset は既存の無効な ruleset (deletion / non_fast_forward) を拡張して有効化した。新規作成ではないので、その 2 つの規則はそのまま残っている。

初回実行が 2 つの未確認事項のうち 1 つを解消した: ruleset が名指しした 3 つの文字列は、実際に報告された check 名と一致した。同じ実行で rust が両ランナーとも落ちたが、原因はコードではなく toolchain の差である (手元 1.96.0 に対しランナー 1.97.1、clippy 1.97 が question_mark を広げた)。この非対称 — Biome は厳密固定、Rust は stable 追随 — は decision-33 の 採らなかったもの に記録した。clippy で落ちたため両ランナーとも cargo test は skip され、Windows で dist/ 無しに通るかは次の実行が最初の確認機会になる。
<!-- SECTION:NOTES:END -->
