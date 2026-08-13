---
id: TASK-157
title: アプリ内で新しい版の有無を知らせる
status: To Do
assignee: []
created_date: '2026-08-13 02:22'
updated_date: '2026-08-13 02:58'
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

新規依存も自プロセスの外向き通信も増やさずに書ける見込みがある。gh は decision-29 の外部コマンド解決で既に解決済みなので、gh release view を固定サブコマンド・引数配列（AGENTS）で子プロセスとして起動すれば、通信は gh のプロセスが行い、認証も利用者のものが効く。

引く契約は decision-14 だけではない。decision-14 は当初「呼び出しにタイムアウトを設けていない」と書いており、それを改めたのが decision-18・19 である。したがってこの照会も次を通す。① decision-19 の gh 照会期限 30 秒を gh の 1 回の起動ごとに掛ける（decision-19 §65）② その待機は decision-19 §96 が共有モジュールへ移した期限付き待機を使い、独自に書かない ③ decision-14 の起動条件（GH_PROMPT_DISABLED と GH_NO_UPDATE_NOTIFIER）を立てる。gh 不在・未認証・照会失敗・照会期限到達はいずれも縮退であって失敗ではない — 版の告知が出ないだけで、他の画面は変わらない。

いつ照会するか（起動時か利用者の操作時か）、結果をどこに出すか、照会の頻度と失敗の見せ方は、doc-11 の縮退の書き方に沿ってこのタスクで決める。決めた結果が doc の改訂を要するかどうかも着手時に判定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新しい版が出ていることを、利用者がアプリの中で知れる
- [ ] #2 版の告知は取得も入れ替えも行わず、Releases を既定ブラウザで開くところまでに留まる
- [ ] #3 新規の本番依存が 0 件で、Atlas のプロセス自身が開く外向き接続も 0 本のまま（decision-30 の自プロセスの外向き通信）
- [ ] #4 照会が decision-19 の gh 照会期限つきの共有の期限付き待機を通り、decision-14 の起動条件を立てて実行される
- [ ] #5 gh が不在・未認証・照会失敗・照会期限到達のとき、版の告知が出ないだけで他の画面が変わらない
- [ ] #6 照会の時点と頻度、失敗の見せ方が決まっており、doc の改訂が要るかどうかの判定が済んでいる
<!-- AC:END -->
