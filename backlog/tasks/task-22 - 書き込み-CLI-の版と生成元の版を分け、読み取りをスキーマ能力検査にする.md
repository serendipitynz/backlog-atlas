---
id: TASK-22
title: 書き込み CLI の版と生成元の版を分け、読み取りをスキーマ能力検査にする
status: Done
assignee: []
created_date: '2026-07-21 20:41'
updated_date: '2026-07-22'
labels:
  - 'kind:bug'
milestone: m-0
dependencies:
  - TASK-5
documentation:
  - doc-4
priority: medium
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4:59 は config.yml から Backlog バージョンを得る前提だが、v1.47.1 の config.yml と backlog config list にはバージョン情報が無い。「書き込みに使う CLI の版」と「既存ファイルを生成した版」を分け、読み取り側はバージョン値ではなくスキーマ能力検査（フィールド有無など）で扱う。（設計レビュー P2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.yml にバージョン情報が無い前提へ doc-4 を修正している
- [x] #2 書き込み CLI の版と生成元の版を区別して定義している
- [x] #3 読み取り側をスキーマ能力検査で行う方針を定義している
<!-- AC:END -->
