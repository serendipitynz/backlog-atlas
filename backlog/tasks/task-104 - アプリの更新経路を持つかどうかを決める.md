---
id: TASK-104
title: アプリの更新経路を持つかどうかを決める
status: To Do
assignee: []
created_date: '2026-07-31 23:35'
updated_date: '2026-08-01 00:44'
labels:
  - release
  - decision
  - 'kind:research'
milestone: m-3
dependencies: []
priority: low
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v0.1.0 は GitHub Release からの手動ダウンロードで成立するが、その後の版を利用者へ届ける経路を決める。Tauri updater を使うなら更新署名鍵の管理と更新エンドポイントが必要で、公開リポジトリでの鍵の扱いを決めることになる。使わないなら、新しい版が出たことを利用者が知る手段（README・リリース通知）で足りるかを判断する。決定を decision として残す。

順序の注意: updater は署名鍵とバンドル設定がビルド時に必要なので、判断を v0.1.0 公開より後に置くと、公開済みの v0.1.0 の利用者は自動更新の対象外に固定される。実装を m-3 へ回すとしても、判断だけを TASK-101 の前に済ませて v0.1.0 のバンドルに updater の器を入れておく選択肢がある。どちらを採るかもこのタスクで決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 更新経路を持つ／持たないの判断と理由が decision として記録されている
- [ ] #2 持つ場合、更新署名鍵の管理方法とエンドポイントが決まっている
- [ ] #3 持たない場合、新しい版を利用者が知る手段が決まっている
<!-- AC:END -->
