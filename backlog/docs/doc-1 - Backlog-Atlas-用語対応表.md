---
id: doc-1
title: Backlog Atlas 用語対応表
type: specification
created_date: '2026-07-20 23:22'
updated_date: '2026-07-22'
tags:
  - planning
  - backlog-atlas
  - terminology
---
# Backlog Atlas 用語対応表

この表は `Backlog Atlas` の開始指示書より先に、指示書で使う対象と名称の対応を確定する。

| 出典 | 具体対象 | 対象種別 | 工程での機能 | 前後関係 | 候補語 | 初出定義 |
|---|---|---|---|---|---|---|
| ユーザーの目的「backlog.md のアプリ化」 | Backlog.md が保持するタスク・文書・メタデータ。アプリはこれを直接書き換えず、Backlog CLI を通じて更新する。 | 記録 | 正本 | Backlog.md → Backlog CLI → 更新済みの Backlog.md | Backlog.md |  |
| ユーザーの目的「スイムレーン拡張」 | 読み込んだ Backlog ルートから所属プロジェクトを決めたタスクを、プロジェクトごとの行とステータスごとの列で同時に表示する画面。所属は `project:<slug>` ラベルではなく Backlog ルートから決定する（doc-2・doc-3）。 | デスクトップアプリの画面 | 日常の閲覧・優先順位判断 | Backlog.md のタスク → 走査元 Backlog ルートで所属決定 → プロジェクト別の行とステータス別の列 | プロジェクト別スイムレーン |  |
| ユーザーの目的「git ログ拡張」 | タスク ID を含むコミットメッセージを、プロジェクト対応表に記録された対象リポジトリで検索して表示する操作。 | 記録 | 実装履歴の参照 | タスク ID → 対象リポジトリの Git log → コミット一覧 | タスクに対応する Git 履歴 |  |
| ユーザーが決定した名称「backlog-atlas」 | 複数プロジェクトの Backlog.md タスク、プロジェクト別スイムレーン、タスクに対応する Git 履歴を扱うローカルデスクトップアプリ全体。 | デスクトップアプリ | Backlog.md を日常的に操作する入口 | Backlog.md を読む → 画面で閲覧・入力する → Backlog CLI で更新する | Backlog Atlas | Backlog Atlas とは、複数プロジェクトの Backlog.md タスクとタスクに対応する Git 履歴を、プロジェクト別に見渡し操作するローカルデスクトップアプリを指す。 |
| ユーザーの検討「backlog.md をサイドカーで同梱」 | アプリ配布物に Backlog CLI 実行ファイルを含め、利用者の PATH にある CLI ではなく、その同梱版をアプリが呼び出す配布方法。これは最初の初期化で確定しない。 | 配布方法 | 将来の導入容易性の判断対象 | 開発時は利用者の PATH 上の CLI を使う → 配布時に同梱の必要性を判断する | sidecar 同梱 | sidecar 同梱とは、アプリ配布物に含めた Backlog CLI 実行ファイルをアプリから呼び出す配布方法を指す。 |
