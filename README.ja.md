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

現在は初期化段階である。デスクトップ実装方式 (Tauri か Wails か)、読み取り方式
(Backlog 管理ファイルの解析か、Backlog CLI・MCP 経由か)、Backlog CLI を sidecar として
同梱するか、配布方法は、いずれも未決定である。

sidecar 同梱は配布方法の選択であり、Backlog Atlas がタスク正本を所有することを
意味しない。

## 関連する計画

- 計画文書: `personal-planning` リポジトリの
  `backlog/docs/projects/backlog-atlas/`。
- 用語対応: 同ディレクトリの Backlog Atlas 用語対応表 (doc-5)。
- 開始指示: 同ディレクトリの Backlog Atlas 開始指示書 (doc-6)。

## Language

For the English version, see [README.md](README.md).
