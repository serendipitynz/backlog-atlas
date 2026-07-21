---
id: doc-2
title: Backlog Atlas 開始指示書
type: guide
created_date: '2026-07-20 23:22'
updated_date: '2026-07-21 12:15'
tags:
  - planning
  - backlog-atlas
  - bootstrap
---
# Backlog Atlas 開始指示書

## この指示書が対象にするリポジトリ

- リポジトリ名: `backlog-atlas`
- 配置先: `/Users/ootani/Projects/_snz/backlog-atlas`
- 初期ブランチ: `main`
- 現在の状態: 配置先ディレクトリは作成済み。Git リポジトリ、README、エージェント規約、アプリ本体は未作成。
- 初期用途: 個人利用のローカルデスクトップアプリ。公開リポジトリ、配布、リモート接続は、この初期化には含めない。
- 既存用語の対応は [Backlog Atlas 用語対応表](doc-1) を参照する。本書では、複数の保存場所を区別するため `Backlogルート`、`Atlasプロセス`、`Backlog更新アダプター`、`横断タスクID` を追加で定義する。

Backlog Atlas は、複数の Backlog.md プロジェクトを扱う **Backlog.md 互換クライアント**である。独自の複数プロジェクトモデル、プロジェクト別スイムレーン、Type 表示、Git・Pull Request 連携を利用者へ提供する。一方、タスクの正本は各プロジェクトの Backlog.md 管理ファイルに残し、Atlas 自身に別のタスク正本を作らない。

## 確定した構成

### 一つの Atlas プロセスと複数の Backlog ルート

- **Atlasプロセス**とは、複数の Backlog ルートを扱うため一度だけ起動する Backlog Atlas 本体を指す。
- **Backlogルート**とは、対象プロジェクトの Backlog.md 管理ファイルを保持するディレクトリと、その設定を解決できるプロジェクトルートを指す。
- 各プロジェクトには Backlog ルートを一つ置く。ただし、プロジェクトごとに `backlog browser`、MCP サーバー、または別の Atlas プロセスを常駐起動しない。
- Atlas は登録された複数のプロジェクトルートを読み、一つの画面へ集約する。
- Atlas 上では、プロジェクト識別子とプロジェクト内のタスク ID を組み合わせた `<project-slug>:<TASK-ID>` を **横断タスクID**として扱う。各プロジェクト内では従来どおり `TASK-N` を使う。

初期対象は、少なくとも次の二つとする。

| project slug | project root | Backlog root |
|---|---|---|
| `geomyth` | `/Users/ootani/Projects/_snz/geomyth` | `/Users/ootani/Projects/_snz/geomyth/backlog` |
| `backlog-atlas` | `/Users/ootani/Projects/_snz/backlog-atlas` | `/Users/ootani/Projects/_snz/backlog-atlas/backlog` |

対象の追加・削除は Atlas のプロジェクト台帳で行う。タスクへ `project:<slug>` を付けて所属を表す方式は採用しない。プロジェクトは、そのタスクを読み込んだ Backlog ルートから決定する。

### 読み取りと更新の境界

- Atlas は各 Backlog ルートのタスク、設定、マイルストーン、文書を読み取る。
- タスク、文書、マイルストーンの更新は Backlog CLI に委譲し、管理対象の Markdown を Atlas から直接書き換えない。
- **Backlog更新アダプター**とは、Atlas の操作を対象プロジェクトでの Backlog CLI 呼び出しへ変換する部分を指す。
- Backlog CLI は、対象プロジェクトを作業ディレクトリとして、固定したサブコマンドと引数配列で実行する。ユーザー入力をシェル文字列として連結しない。
- 読み取りをファイル解析で行うか Backlog CLI 経由で行うかは、最初の設計タスクで決定する。ファイル解析を採用する場合は、Backlog.md のバージョン差と cross-branch 状態の扱いを明示する。

### Atlas が独立して提供する表示

- Project は読み込んだ Backlog ルートから決定する。
- Type は `kind:feature`、`kind:bug`、`kind:research`、`kind:writing`、`kind:maintenance` などのラベルを、通常のラベル一覧から分離して表示する。
- Git remote の有無はタスクラベルではなく、プロジェクト台帳の属性として扱う。
- Pull Request URL はタスクの References から抽出し、タスク詳細で独立して表示する。
- タスク ID を対象プロジェクトの Git 履歴で検索し、対応するコミットを表示する。
- remote が対応する場合は、コミットと Pull Request の関連も解決できるようにする。

## 初期化の完了条件

この開始作業では、次を完了条件とする。

1. 作成済みの `/Users/ootani/Projects/_snz/backlog-atlas` が Git リポジトリとして初期化され、現在のブランチが `main` である。
2. `README.md`、`README.ja.md`、`AGENTS.md`、`AGENTS.ja.md`、`.gitignore` が存在する。
3. 英語版と日本語版の README が、一つの Atlas プロセス、複数の Backlog ルート、各プロジェクトに残るタスク正本を同じ意味で説明している。
4. `AGENTS.md` と `AGENTS.ja.md` が、管理対象 Markdown の直接編集禁止、対象プロジェクトでの Backlog CLI 実行、横断タスク ID、Git・Pull Request 参照を同じ意味で指示している。
5. この段階で Tauri/Wails の依存関係、アプリ本体、Backlog CLI の sidecar 同梱、リモートリポジトリ、Git commit を作成していない。

## Git リポジトリを初期化する手順

配置先ディレクトリは既に存在する。最初に、別の Git 履歴や既存ファイルがないことを確認する。

```sh
git -C /Users/ootani/Projects/_snz/backlog-atlas rev-parse --is-inside-work-tree
find /Users/ootani/Projects/_snz/backlog-atlas -maxdepth 2 -mindepth 1 -print
```

Git リポジトリでなく、既存内容との衝突もない場合だけ、次を実行する。

```sh
git -C /Users/ootani/Projects/_snz/backlog-atlas init -b main
```

別の Git 履歴または意図不明の既存ファイルがある場合は初期化を続けない。初期化直後は commit を作らない。README と AGENTS を確認した後に、作成者が明示的に commit を求めた場合だけ最初の commit を作る。

`.gitignore` には少なくとも `.DS_Store`、`node_modules/`、`dist/`、`target/`、`*.log` を含める。エディタ固有の設定は、共有が必要と決めたもの以外を追跡しない。

## README.md と README.ja.md に書くこと

`README.md` は英語、`README.ja.md` は日本語にする。どちらにも次の見出しと内容を持たせる。

1. **What it is / これは何か**
   - Backlog Atlas とは、複数の Backlog ルートと各リポジトリの Git・Pull Request 履歴を、一つの画面で見渡し操作する Backlog.md 互換クライアントである、と定義する。
2. **Scope / 対象範囲**
   - 複数プロジェクトの登録、プロジェクト別スイムレーン、Type 表示、タスク詳細、Backlog CLI を通じた更新、タスク ID からの Git・Pull Request 履歴参照を対象にする。
3. **Data ownership / 正本の配置**
   - タスクの正本は各プロジェクトの Backlog ルートに置く。既存の設計・仕様・プロット文書も各プロジェクトに残す。Atlas 自身に別のタスク正本を作らない。
4. **Runtime model / 起動単位**
   - Atlas プロセスは一つだけ起動する。プロジェクトごとに Backlog.md のブラウザやサーバーを常駐起動しない。
5. **Boundaries / 境界**
   - Atlas は管理対象 Markdown を直接変更せず、更新を対象プロジェクトでの Backlog CLI 実行へ委譲する。
6. **Status / 状態**
   - 初期化段階であり、デスクトップ実装方式、読み取り方式、Backlog CLI の sidecar 同梱、配布方法は未決定であると明記する。
7. **Related planning / 関連する計画**
   - `personal-planning` の `backlog/docs/projects/backlog-atlas/` とプロジェクト対応表への参照を置く。

翻訳は見出し・対象・制約を一対一で保つ。英語版だけに実装判断を置かず、日本語版だけに運用上の制約を置かない。

## AGENTS.md と AGENTS.ja.md に書くこと

`AGENTS.md` は Codex などが読む英語の実行規約、`AGENTS.ja.md` は同じ規約を人間が日本語で確認するための対応文書とする。二つの内容が矛盾した場合は、実装を始めず矛盾を解消する。両方に次を含める。

- Atlas は、登録された複数のプロジェクトルートと Backlog ルートを扱う。一つの中央 Backlog へ全プロジェクトのタスクを集約しない。
- 各プロジェクトのタスク正本は、そのプロジェクトの Backlog ルートに置く。
- Backlog のタスク・文書・マイルストーンの更新は、対象プロジェクトを作業ディレクトリとする Backlog CLI 呼び出しへ委譲し、Markdown ファイルを直接変更しない。
- 横断画面では `<project-slug>:<TASK-ID>` を使い、各プロジェクト内のコミットと Pull Request では `TASK-N` を使う。
- Git 履歴は、タスクを所有するプロジェクトのリポジトリでタスク ID を検索する。Pull Request URL は References から読み、remote が対応する場合はコミットとの関連を解決する。
- Backlog CLI と Git の実行は、固定したサブコマンドと引数配列を使う。ユーザー入力をシェル文字列として連結して実行しない。
- Tauri/Wails、UI ライブラリ、Markdown/frontmatter パーサー、Backlog CLI の同梱など、新しい本番依存関係を入れる前に選定理由と導入範囲を確認する。
- コードコメントは英語、利用者向け説明は日本語を基本にする。
- 実装後は対象のテスト、フォーマッタ、静的解析を実行し、実行できないものは理由を報告する。
- 明示的な依頼なしに commit、履歴改変、リモートへの push を行わない。

## 実装へ進む前に決めること

次の判断は、初期化後の最初の設計タスクで行う。

- Tauri と Wails のどちらを採用するか。
- プロジェクト台帳の保存場所と形式、および Backlog ルートの登録・削除方法。
- 読み取りを Backlog 管理ファイルの解析で行うか、Backlog CLI または MCP 経由で行うか。
- Backlog.md の cross-branch 状態を Atlas がどこまで再現するか。初期版を現在の checkout のみに限定するか。
- プロジェクトごとに異なる status を許可するか。初期版で共通の `To Do`、`In Progress`、`In Review`、`Done` を要求するか。
- `kind:*` ラベルを Type として扱う規則と、不明な値の表示方法。
- Pull Request URL の入力・表示・自動検出範囲。
- 対象 Git リポジトリ、Backlog ルート、またはタスク ID に対応するコミットが存在しない場合の表示。
- 同じ Backlog ルートを複数ウィンドウまたは複数プロセスが更新する場合の競合検出と再読み込み方法。
- 開発時に利用者の PATH 上の `backlog` を呼ぶか、どの時点で sidecar 同梱を検討するか。

sidecar 同梱は配布方法の選択であり、Backlog Atlas がタスク正本を所有することを意味しない。

## 初期化の確認

初期化後、少なくとも次を確認する。

```sh
git -C /Users/ootani/Projects/_snz/backlog-atlas rev-parse --is-inside-work-tree
git -C /Users/ootani/Projects/_snz/backlog-atlas branch --show-current
git -C /Users/ootani/Projects/_snz/backlog-atlas status --short
test -f /Users/ootani/Projects/_snz/backlog-atlas/README.md
test -f /Users/ootani/Projects/_snz/backlog-atlas/README.ja.md
test -f /Users/ootani/Projects/_snz/backlog-atlas/AGENTS.md
test -f /Users/ootani/Projects/_snz/backlog-atlas/AGENTS.ja.md
```

期待結果は、Git ワークツリーであること、ブランチが `main` であること、四つの文書が存在すること、未確認の変更以外の出力がないことである。
