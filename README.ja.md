<img src="src-tauri/icons/128x128@2x.png" alt="" width="128">

# Backlog Atlas

複数のプロジェクトのタスク・文書・マイルストーンを、1 つの画面から横断して扱うデスクトップ
アプリです。タスクは [Backlog.md](https://github.com/MrLesk/Backlog.md) が管理する Markdown の
まま各プロジェクトに置いておき、Atlas はそれを読んで並べ、更新は Backlog CLI に委ねます。

**Backlog.md の非公式クライアントです。**Backlog.md の作者・プロジェクトとは関係のない別
プロジェクトで、公式に提供・保証されているものではありません。Backlog.md が定めた管理ファイルの
形式と Backlog CLI を利用しています。

Atlas は単体で動く 1 つのアプリです。プロジェクトごとに `backlog browser` を常駐させたり、
Atlas を複数起動したりする必要はありません。

## 動作環境

macOS / Windows / Linux。Linux は WebView にシステムのライブラリ（webkit2gtk-4.1 と
libsoup-3.0）を使うため、それらを持つディストリビューションが要ります。**Ubuntu なら 24.04 以降**で、
20.04 と 22.04 は標準では揃いません。

画面は日本語のみです。

## できること

- 複数のプロジェクトを登録して、まとめて扱う。
- プロジェクトごとの行・ステータスごとの列に並べたスイムレーンで、全プロジェクトのタスクを見渡す。
- タスク詳細を表示・編集する。本文は Markdown として整形表示し、作図フェンスは mermaid で描く。
- References から Pull Request の URL を取り出し、タスク ID から Git コミットと Pull Request を引く。
- Type を `kind:*` ラベルと frontmatter の `type` から導き、ふつうのラベルとは分けて表示する。
- 文書とマイルストーンを一覧・編集する。
- 表示テーマ、カードの情報量、絞り込み、並び順を設定に持つ。

## Atlas が変えないこと

- **タスクの置き場所は変わりません。**Atlas はタスクの複製を持たず、各プロジェクトの Backlog.md を
  そのまま読み書きします。全プロジェクトのタスクを 1 つの Backlog へ集めることもしません。
- **常駐するプロセスは増えません。**起動するのは Atlas 1 つだけです。
- **管理ファイルへ書くのは Backlog CLI です。**Atlas が起こす更新は、対象プロジェクトを作業
  ディレクトリとした Backlog CLI の呼び出しに委ねます。例外は 2 つ — Backlog CLI に手段が無い
  マイルストーンの説明文と、利用者が明示的に開く外部エディタでの編集です。

複数のプロジェクトが 1 つの画面に並ぶので、Atlas の画面上ではタスクを `<project-slug>:<TASK-ID>`
の形で識別します。プロジェクトの中では従来どおり `TASK-N` です。

## 導入

配布物は [Releases](https://github.com/serendipitynz/backlog-atlas/releases) にあります。

作成・更新には **Backlog CLI (`backlog.md`) の v1.49.3 以上**が要ります。Atlas には同梱していない
ので、別に入れてください。

```sh
npm install -g backlog.md
```

**Backlog CLI が無くても Atlas は起動します。**読み取りは CLI を通さず Backlog.md を直接読むので、
CLI が無いときも v1.49.3 未満のときも読み取り専用で立ち上がります。画面はすべて描かれ、書き込みを
伴う操作だけが理由を添えて止まります。CLI を入れて起動し直せば有効になります。

Git コミットと Pull Request の履歴には `git` と `gh` を使います。無ければその表示が出ないだけです。

**Finder や Dock から起動したアプリは、ターミナルの `PATH` を受け継がないことがあります。**
入れたはずの道具が見つからないときは、**設定 → 外部コマンド**で実行ファイルの絶対パスを指定して
ください。同じ画面が、いま何が解決できているかも示します。`backlog` については `which backlog` が
出す shim ではなく、パッケージの中の実行ファイルを指します。

```sh
# macOS / Linux
ls "$(npm prefix -g)"/lib/node_modules/backlog.md/node_modules/backlog.md-*/backlog
```

```powershell
# Windows
Get-ChildItem "$(npm prefix -g)\node_modules\backlog.md\node_modules\backlog.md-*\backlog.exe"
```

## 更新

v0.1.0 は自分自身を更新する仕組みを持ちません。新しい版は
[Releases](https://github.com/serendipitynz/backlog-atlas/releases) で公開するので、配布物を取得して
入れ替えてください。Releases を watch すると、公開されたときに通知を受け取れます。

## ソースからのビルド

必要なもの: Node 24（`.node-version` で利用する Node のメジャーバージョンを規定しています）、
pnpm 10.30.3（`package.json` の `packageManager`）、Tauri 2 が要求する Rust ツールチェーン。
Node が要るのはビルド時だけで、出荷物には入りません。

Linux では WebView がシステムのライブラリなので、その開発ヘッダも要ります（Ubuntu 24.04 以降）:

```sh
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  pkg-config libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

ビルドはどの OS でも同じです:

```sh
pnpm install
pnpm test            # Vitest
pnpm run check       # svelte-check
pnpm run build       # Vite。出力は dist/
pnpm tauri dev       # アプリを起動する
pnpm tauri build     # アプリをパッケージする
```

Rust コアは `src-tauri/` で `cargo test`・`cargo fmt`・`cargo clippy` を使います。

設計上の決定は `backlog/decisions/`、画面と読み取り層の仕様は `backlog/docs/` にあります。

## ライセンス

MIT License です。[LICENSE](LICENSE) を参照してください。

他の作者による成果物が 2 つ同梱されています。[Ace](https://github.com/ajaxorg/ace) エディタ
（BSD 3-Clause License）と、[Lucide](https://lucide.dev/) のアイコン図形（ISC License、一部は
Feather 由来の MIT License）です。帰属は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) に
記載しています。

## コントリビューション

個人プロジェクトとして開発しています。バグ報告と要望は
[Issues](https://github.com/serendipitynz/backlog-atlas/issues) へどうぞ。Pull Request をいただける
場合は、先に Issue で相談してもらえると助かります。

## Language

For the English version, see [README.md](README.md).
