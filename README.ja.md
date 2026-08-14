<img src="src-tauri/icons/128x128@2x.png" alt="" width="128">

# Backlog Atlas

複数のプロジェクトのタスク・文書・マイルストーンを、1 つの画面から横断して扱うデスクトップ
アプリです。タスクは [Backlog.md](https://github.com/MrLesk/Backlog.md) が管理する Markdown の
まま各プロジェクトに置いておき、Atlas はそれを読んで並べ、更新は Backlog CLI に委ねます。

**Backlog.md の非公式クライアントです。** Backlog.md の作者・プロジェクトとは関係のない別
プロジェクトで、公式に提供・保証されているものではありません。

Atlas は単体で動く 1 つのアプリです。プロジェクトごとに `backlog browser` を常駐させたり、
Atlas を複数起動したりする必要はありません。

## 動作環境

macOS / Windows / Linux（Linux は webkit2gtk-4.1 と libsoup-3.0 を持つディストリビューション。
Ubuntu なら 24.04 以降）。画面は日本語のみです。

## できること

- 複数のプロジェクトを登録して、まとめて扱う。
- プロジェクトごとの行・ステータスごとの列に並べたスイムレーンで、全プロジェクトのタスクを見渡す。
- タスク詳細を表示・編集する。本文は Markdown として整形表示し、作図フェンスは mermaid で描く。
- References から Pull Request の URL を取り出し、タスク ID から Git コミットと Pull Request を引く。
- Type を `kind:*` ラベルと frontmatter から導き、ラベルとは分けて表示する。
- 文書とマイルストーンを一覧・編集する。
- 決定事項（`backlog/decisions/`）を一覧・閲覧する。
- 表示テーマ、カードの情報量、絞り込み、並び順を設定に持つ。

## Atlas が変えないこと

- **タスクの置き場所は変わりません。** Atlas はタスクの複製を持たず、各プロジェクトの Backlog.md を
  そのまま読み書きします。全プロジェクトのタスクを 1 つの Backlog へ集めることもしません。
- **常駐するプロセスは増えません。** 起動するのは Atlas 1 つだけです。
- **管理ファイルへ書くのは Backlog CLI です。** 例外は 2 つ — CLI に手段が無いマイルストーンの
  説明文と、利用者が開いた外部エディタでの編集です。

複数のプロジェクトが 1 つの画面に並ぶので、Atlas の画面上ではタスクを `<project-slug>:<TASK-ID>`
の形で識別します。プロジェクトの中では従来どおり `TASK-N` です。

## 導入

配布物は [Releases](https://github.com/serendipitynz/backlog-atlas/releases) にあります。

macOS のビルドは署名と notarization を通してあるので、Gatekeeper の警告なしに開けます。
Windows と Linux のビルドは未署名です。Windows では SmartScreen が警告を出すので、
**詳細情報 → 実行** から進めてください。

作成・更新には **Backlog CLI (`backlog.md`)** が要ります。同梱していないので、別に入れてください。
最新版でよく、上限は固定していません。Git 履歴には `git` と `gh` を使います。

```sh
npm install -g backlog.md
```

**Backlog CLI が無くても Atlas は起動します。** 読み取りは CLI を通らないので、CLI が無いときも
必要な版に満たないときも読み取り専用で立ち上がり、書き込む操作だけが理由を添えて止まります。
必要な版は Atlas が起動時に検査し、満たないときは画面がその版を告げます。

**Finder や Dock から起動したアプリは、ターミナルの `PATH` を受け継がないことがあります。**
入れたはずの道具が見つからないときは、**設定 → 外部コマンド**で絶対パスを指定してください。
`backlog` は npm 導入だと `which backlog` が shim を指すので、パッケージ内の実行ファイルを渡します。

```sh
# macOS / Linux
ls "$(npm prefix -g)"/lib/node_modules/backlog.md/node_modules/backlog.md-*/backlog
# Windows (PowerShell)
Get-ChildItem "$(npm prefix -g)\node_modules\backlog.md\node_modules\backlog.md-*\backlog.exe"
```

## 更新

v0.1.0 は自分自身を更新しません。新しい版は
[Releases](https://github.com/serendipitynz/backlog-atlas/releases) で公開するので、取得して
入れ替えてください（watch すると公開時に通知されます）。

## ソースからのビルド

### 必要なもの

- Node v24（`.node-version` で規定。ビルド時のみ必要で、配布物には入りません）
- pnpm 10.30.3
- Rust ツールチェーン（Tauri 2 が要求する版）

Linux では WebView の開発ヘッダも要ります（Ubuntu 24.04 以降）:

```sh
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  pkg-config libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### ビルド

```sh
pnpm install
pnpm test            # Vitest
pnpm run check       # svelte-check
pnpm run build       # Vite。出力は dist/
pnpm tauri dev       # アプリを起動する
pnpm tauri build     # アプリをパッケージする
```

Rust コアは `src-tauri/` で `cargo test`・`cargo fmt`・`cargo clippy` を使います。

設計上の決定は `backlog/decisions/`、仕様は `backlog/docs/` にあります。

## ライセンス

MIT License です（[LICENSE](LICENSE)）。

このリポジトリに取り込んである他の作者の成果物は 2 つ — [Ace](https://github.com/ajaxorg/ace)
エディタ（BSD 3-Clause）と [Lucide](https://lucide.dev/) のアイコン図形（ISC、一部は Feather
由来の MIT）。帰属は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にあります。

ビルドしたアプリが同梱するのはこの 2 つだけではありません — `pnpm` と `cargo` がバイナリへ
解決したパッケージは、それぞれ自身のライセンスを持ちます。その通知は 2 つのロックファイルから
[THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt) へ生成され、上のファイルを全文再掲した
うえで一覧を続けます。このファイルは各リリースへ添付され、アプリ自体にも同梱されます。

## コントリビューション

個人プロジェクトとして開発しています。バグ報告と要望は
[Issues](https://github.com/serendipitynz/backlog-atlas/issues) へどうぞ。Pull Request は先に
Issue でご相談ください。

## Language

For the English version, see [README.md](README.md).
