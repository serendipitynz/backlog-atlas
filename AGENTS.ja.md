# AGENTS.ja.md

このリポジトリで作業するエージェント向けの実行規約。英語版 `AGENTS.md` と同じ規約を、
人間が日本語で確認するための対応文書である。二つの内容が矛盾した場合は、実装を始めず
矛盾を解消する。

## プロジェクトモデル

- Atlas は、登録された複数のプロジェクトルートと Backlog ルートを扱う。一つの中央
  Backlog へ全プロジェクトのタスクを集約しない。
- 各プロジェクトのタスク正本は、そのプロジェクトの Backlog ルートに置く。

## 更新

- Backlog のタスク・文書・マイルストーンの更新は、対象プロジェクトを作業ディレクトリと
  する Backlog CLI 呼び出しへ委譲し、管理対象の Markdown ファイルを直接変更しない。
- Backlog CLI と Git の実行は、固定したサブコマンドと引数配列を使う。ユーザー入力を
  シェル文字列として連結して実行しない。

## 識別子

- 横断画面では `<project-slug>:<TASK-ID>` を使う。各プロジェクト内のコミットと
  Pull Request では `TASK-N` を使う。

## Git・Pull Request 参照

- Git 履歴は、タスクを所有するプロジェクトのリポジトリでタスク ID を検索する。
- Pull Request URL はタスクの References から読む。remote が対応する場合は、コミットと
  Pull Request の関連を解決する。

## 依存関係

- Tauri/Wails、UI ライブラリ、Markdown/frontmatter パーサー、Backlog CLI の同梱など、
  新しい本番依存関係を入れる前に、選定理由と導入範囲を確認する。

## タスクの状態

タスクの `status` は作業がどこまで進んだかを表すため、最後に一度で動かすのではなく、
作業の進行に合わせて動かす。このプロジェクトで使う 4 状態は次のとおり。

- **To Do** … 未着手。
- **In Progress** … そのタスクの作業を始めた時点で付ける（着手の指示を受けた時点で足りる）。
  これはコミットしなくてよい。台帳を見れば今どれに取り組んでいるか分かる状態にすることが
  目的である。
- **In Review** … Pull Request を作成した時点で付け、PR 用のコミットに含める。PR がタスクの
  状態を伴って読める状態にする。
- **Done** … PR がマージされた後、既定ブランチで付ける。

状態の変更も、他のタスク更新と同じく Backlog CLI 呼び出しで行う。

## ツールチェーン

- Node 24 と pnpm 10.30.3 を使う。Node のメジャーは `.node-version` で、pnpm は
  `package.json` の `packageManager` で固定する。`.nvmrc` と `engines.node` は意図的に
  置かない。ツールごとに固定箇所を一つに保ち、二箇所がずれる場所を作らないためである。
- パッケージマネージャは pnpm だけを使う。導入は `pnpm install`、スクリプトはすべて
  pnpm 経由で実行する (`pnpm test`、`pnpm run check`、`pnpm run build`、
  `pnpm tauri dev`、`pnpm tauri build`)。このリポジトリで npm・yarn を実行しない。
  いずれも `pnpm-lock.yaml` の隣に二つ目の lock ファイルを書いてしまう。
- Rust 側は従来のコマンドを `src-tauri/` で実行する (`cargo test`、`cargo fmt`、
  `cargo clippy`)。
- `pnpm install` は `@parcel/watcher` と `esbuild` を build script 未承認として報告する。
  承認しないまま残す。`@parcel/watcher` は sass 自身の watch モードにしか要らず、esbuild
  はプラットフォーム別バイナリを optional dependency で解決するため、いずれの script
  なしでもビルド・テスト・`svelte-check` は通る。

## 作業上の規約

- コードコメントは英語、利用者向け説明は日本語を基本にする。
- 実装後は対象のテスト、フォーマッタ、静的解析を実行し、実行できないものは理由を
  報告する。
- 明示的な依頼なしに commit、履歴改変、リモートへの push を行わない。
