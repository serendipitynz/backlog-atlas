# Backlog Atlas

## これは何か

Backlog Atlas とは、複数の Backlog ルートと各リポジトリの Git・Pull Request 履歴を、
一つの画面で見渡し操作する Backlog.md 互換クライアントである。Backlog ルートとは、
対象プロジェクトの Backlog.md 管理ファイルを保持するディレクトリと、その設定を解決
できるプロジェクトルートを指す。Atlas は登録された複数のプロジェクトルートを読み、
一つの画面へ集約する。一方、各タスクの正本は各プロジェクトの Backlog.md ファイルに
残す。

## 対象範囲

- 複数プロジェクトをプロジェクト台帳に登録・管理する。
- プロジェクト別スイムレーン (プロジェクトごとの行、ステータスごとの列) を表示する。
- Type を `kind:*` ラベルから導き、通常のラベルとは分離して表示する。
- タスク詳細 (References、抽出した Pull Request URL を含む) を表示する。
- タスク・文書・マイルストーンの更新を Backlog CLI を通じて行う。
- タスク ID からその Git・Pull Request 履歴を参照する。

## 正本の配置

各タスクの正本は、そのプロジェクトの Backlog ルートに置く。既存の設計・仕様・プロット
文書も各プロジェクトに残す。Atlas 自身に別のタスク正本を作らず、全プロジェクトのタスク
を一つの中央 Backlog へ集約もしない。

集約画面では、Atlas はタスクを横断タスク ID `<project-slug>:<TASK-ID>` で識別する。
各プロジェクト内では従来どおり `TASK-N` を使う。タスクの所属プロジェクトは、そのタスク
を読み込んだ Backlog ルートから決定し、タスクに付いた `project:<slug>` ラベルからは
決定しない。

## 起動単位

Atlas プロセスは一つだけ起動し、登録された全 Backlog ルートを読む。Atlas は
プロジェクトごとに `backlog browser`、MCP サーバー、または別の Atlas プロセスを
常駐起動しない。

## 境界

Atlas は管理対象 Markdown を直接編集しない。更新は、対象プロジェクトを作業ディレクトリ
とする Backlog CLI へ委譲する。Backlog 更新アダプター (Atlas の操作を Backlog CLI
呼び出しへ変換する部分) は、固定したサブコマンドと引数配列を使い、ユーザー入力を
シェル文字列として連結しない。

## 状態

設計フェーズは完了している。decision-1〜7 を `backlog/decisions/` に、上記対象範囲を
網羅する仕様 (`backlog/docs/doc-1`〜`doc-9`) を記録済みである。実装は未着手である。

主要な決定:

- デスクトップ実装方式: Tauri (コアは Rust) を採用 (decision-1)。
- 読み取り／更新の分離: 読み取りは Backlog 管理ファイルの直接解析、更新は Backlog CLI
  へ委譲 (decision-2)。MCP サーバー経由は採らない。
- cross-branch: 初期版は現在の checkout に限定 (decision-3)。
- status: プロジェクト個別の status を許し、正準ステータス列 (To Do / In Progress /
  In Review / Done) へ対応づける (decision-4)。
- Type: `kind:` 接頭辞の除去で導出し、複数・不在・未知を分けて表示 (decision-5)。
- 不在・欠損: 対象不在・読取不能・該当なしを一つの空表示に丸めず区別して表示
  (decision-6)。
- Backlog CLI: 開発は利用者の PATH 上の `backlog` を前提とし、sidecar 同梱は後続の
  配布判断まで先送りする (decision-7)。

sidecar 同梱は配布方法の選択であり、Backlog Atlas がタスク正本を所有することを
意味しない。

## 関連する計画

- 本プロジェクト自身の計画は、このリポジトリの Backlog ルート (`backlog/`) に置く。
  用語対応表 (`backlog/docs/doc-1`)、開始指示書 (`backlog/docs/doc-2`)、および
  `backlog/tasks/` 以下のタスク。
- 複数プロジェクトを横断するポートフォリオ規約は `personal-planning` リポジトリの
  `backlog/docs/portfolio/` に残す。プロジェクト対応表、運用規約、Git 連携規約。

## Language

For the English version, see [README.md](README.md).
