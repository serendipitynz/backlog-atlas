---
id: TASK-157
title: アプリ内で新しい版の有無を知らせる
status: To Do
assignee: []
created_date: '2026-08-13 02:22'
labels:
  - release
  - 'kind:feature'
milestone: m-3
dependencies: []
priority: medium
ordinal: 150700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-30 は v0.1.0 で自己更新を持たないと決め、版の告知は README と GitHub Releases の watch に置いた。watch していない利用者には新しい版が出たことが何も届かないので、その穴をアプリ側から塞ぐ。

行うのは版の告知だけである（decision-30 の語）。新しい版の取得も入れ替えも行わない — それは手動入れ替えのままで、アプリは Releases のページを既定ブラウザで開くところまでを担う。

新規依存も自プロセスの外向き通信も増やさずに書ける見込みがある。gh は decision-29 の外部コマンド解決で既に解決済みなので、gh release view を固定サブコマンド・引数配列（AGENTS）で子プロセスとして起動すれば、通信は gh のプロセスが行い、認証も利用者のものが効く（decision-14 と同じ形）。gh 不在・未認証は縮退であって失敗ではない — 版の告知が出ないだけで、他の画面は変わらない。

いつ照会するか（起動時か利用者の操作時か）、結果をどこに出すか、照会の頻度と失敗の見せ方は、doc-11 の縮退の書き方に沿ってこのタスクで決める。決めた結果が doc の改訂を要するかどうかも着手時に判定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新しい版が出ていることを、利用者がアプリの中で知れる
- [ ] #2 版の告知は取得も入れ替えも行わず、Releases を既定ブラウザで開くところまでに留まる
- [ ] #3 新規の本番依存が 0 件で、Atlas のプロセス自身が開く外向き接続も 0 本のまま（decision-30 の自プロセスの外向き通信）
- [ ] #4 gh が不在・未認証・照会失敗のとき、版の告知が出ないだけで他の画面が変わらない
- [ ] #5 照会の時点と頻度、失敗の見せ方が決まっており、doc の改訂が要るかどうかの判定が済んでいる
<!-- AC:END -->
