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

## 導入要件

Atlas は **Backlog CLI (`backlog.md`) の v1.48.0 以上**を `PATH` 上に必要とする。Atlas には
同梱していない (根拠は decision-26) ので、利用者が導入する。

```sh
npm install -g backlog.md
```

版は起動時に `backlog --version` で検査する。上限は固定していないので、新しい版はそのまま使う。

**CLI が無くても Atlas は起動する。**読み取りは CLI を通らず、各プロジェクトの Backlog.md を
直接解析する (decision-2)。したがって `PATH` 上に `backlog` が無い場合も、v1.48.0 未満の場合も、
読み取り専用で立ち上がる — 画面はすべて描かれ、書き込みを伴う操作だけが、理由を控えの所で
述べたうえで保留される。CLI を導入して起動し直せば有効になる。

## 境界

Atlas 自身は管理対象 Markdown へ書き込まない。Atlas が起こす更新は、対象プロジェクトを
作業ディレクトリとする Backlog CLI へ委譲する。Backlog 更新アダプター (Atlas の操作を
Backlog CLI 呼び出しへ変換する部分) は、固定したサブコマンドと引数配列を使い、ユーザー
入力をシェル文字列として連結しない。

管理対象 Markdown に CLI を通さず届く更新経路が一つだけある。利用者の明示操作により、
Atlas はタスクのファイルを利用者自身の外部エディタで開ける。そこで書くのは Atlas では
なく利用者であり、Backlog CLI のスキーマ保護は受けない。Atlas はエディタを起動し、その
保存を外部変更として再読込するだけである。Atlas 自身が管理対象 Markdown を書かない不変
は保たれるが、管理対象 Markdown が変わる経路は CLI 媒介の経路だけではない。

## ソースからのビルド

必要なもの: Node 24、pnpm 10.30.3、および Tauri 2 が要求する Rust ツールチェーン。
Node のメジャーは `.node-version` に固定してあり、内容はメジャーのみの `24` である。
fnm は既定でこのファイルを読み、メジャーのみの指定を自力で解決する (fnm 1.39.0 で実測:
v24.18.1 を選ぶ)。`actions/setup-node` は `node-version-file` を通じて読む。他の
バージョン管理ツールはそれぞれ別の手当てが要る。asdf は `legacy_version_file = yes` の
下でのみ `.node-version` を読み、mise は idiomatic version file を既定で無効にしており、
nodenv は alias plugin なしにメジャーのみの指定を解決しない。これらを使う場合は、その
ツールの流儀で Node 24 を選ぶこと。pnpm は `package.json` の `packageManager` に固定して
あり、Corepack がこれを読む。Node が要るのはビルド時だけである。出荷物は Vite の出力を
内包した Tauri バイナリであり、Node は入らない。

Linux では WebView が cargo の依存ではなくシステムのライブラリなので、ビルドにはその開発
ヘッダも要る。どれが要るかは lock から決まり、`webkit2gtk` クレートが webkit2gtk-4.1 を、
`soup3` が libsoup-3.0 を束ねている。**Ubuntu 24.04 以降**は両方を持つ。この project を
ビルドしているのもその版である。Ubuntu 20.04・22.04 は持たず、ビルドは `pkg-config` の段階で
`glib-2.0` が見つからないと言って止まる。このエラーは WebKit にもディストリの版にも触れないので、
「Ubuntu が違う」ではなく「パッケージが 1 つ足りない」ように読めてしまう。

```sh
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  pkg-config libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

ビルド自体はどの OS でも同じである:

```sh
pnpm install
pnpm test            # Vitest
pnpm run check       # svelte-check
pnpm run build       # Vite。出力は dist/
pnpm tauri dev       # アプリを起動する
pnpm tauri build     # アプリをパッケージする
```

Rust コアは `src-tauri/` で従来のコマンドを使う (`cargo test`、`cargo fmt`、
`cargo clippy`)。

## 状態

設計フェーズ (m-0) は完了し、実装フェーズ (m-1) が進行中である。decision-1〜13 を
`backlog/decisions/` に、上記対象範囲を網羅する仕様 (`backlog/docs/doc-1`〜`doc-11`)
を記録済みである。

実装済み (TASK-25〜42):

- Rust コア: プロジェクト台帳 (`projects.toml`) の読み書きと登録・削除・更新、
  ドメインモデル、読み取り層 (config 解決・走査・解析・保存区分・縮退)、status
  正規化と Type 導出、コミット検索と Pull Request URL 抽出、Backlog 更新アダプター、
  ファイル監視・読取版指標・更新前競合検出。
- Rust コアとフロントエンドをつなぐ Tauri コマンド境界。
- 画面: プロジェクト別スイムレーン、タスク詳細 (Type・References・Pull Request・
  Git 履歴)、タスク詳細の GUI 編集、外部エディタ経路、台帳・プロジェクト登録・管理、
  文書・マイルストーンの管理 GUI と新規タスク作成の入口、および不在・読取不能・
  該当なしの表示区別。

未着手 (TASK-43〜45): コミットと Pull Request の関連解決の参照手段 (doc-6 §6 は構造
だけを定め、ホスト毎の参照手段を後続へ委ねている)、Windows の OS 関連付け起動、
および参照追随書き換えの照合規則 (マイルストーンの改称・削除・アーカイブの前提)。

未着手 (TASK-46〜57、画面設計案の反映と、その過程で判明した訂正): アプリ設定ファイルと
設定画面 (decision-13)、表示テーマ機構 (decision-12)、doc-11 のデザインシステムへの
描き方の統一、カード情報量 S/M/L、スイムレーンのレーンヘッダ行方式と列折畳み・行折畳み、
絞り込みトークン型のフィルタ帯、上部帯の重要度固定順、列内新規タスク入力、タスク詳細の
3 配置と既定の永続、プロジェクト詳細画面 (doc-10)、固定ヘッダとメニュー、および
`task create` の引数範囲の訂正 (TASK-57)。

配布のうちパッケージングは未着手である。Backlog CLI を sidecar 同梱するかどうかは決着して
おり、同梱しない (decision-26)。

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
- Backlog CLI: 開発時も配布後も、利用者の PATH 上の `backlog` を前提とする (decision-7)。
  sidecar 同梱は採らない — 同梱すると macOS の配布物が 14 MB から 81 MB になる一方、
  それが取り除く摩擦は既に手当てが済んでいる (Windows での解決は decision-16、導入前の
  利用は読み取り専用起動)。(decision-26)
- フロントエンド: Svelte 5 を素で使い (SvelteKit は使わない)、ビルドは Vite +
  TypeScript、スタイルはコンポーネントスコープドとする (decision-8)。
- 依存の選定: 台帳の読み書きに `toml`、frontmatter 解析に `serde_yaml_ng`、ファイル
  監視に `notify` を採用 (decision-9〜11)。
- 配色: 色値一式を表示テーマとしてまとめ、設定で選ぶ。印の族の色は表示テーマごとに
  一箇所で定義する (decision-12)。
- アプリ設定: 台帳ファイルとは別の単一ファイルへ持ち、台帳の読み取り専用縮退が表示の
  既定値の保存を巻き込まないようにする (decision-13)。

sidecar 同梱は配布方法の選択であって所有の問題ではなく、どちらであってもタスクの正本は
各プロジェクトの Backlog ルートに残る。同梱は採らない (decision-26)。decision-7 の残る
2 契機 — 配布側で版を固定したくなること、CLI 導入の摩擦が実利用を妨げること — が生じた
場合に再検討する。

## 関連する計画

- 本プロジェクト自身の計画は、このリポジトリの Backlog ルート (`backlog/`) に置く。
  用語対応表 (`backlog/docs/doc-1`)、開始指示書 (`backlog/docs/doc-2`)、および
  `backlog/tasks/` 以下のタスク。
- 複数プロジェクトを横断するポートフォリオ規約は `personal-planning` リポジトリの
  `backlog/docs/portfolio/` に残す。プロジェクト対応表、運用規約、Git 連携規約。

## Language

For the English version, see [README.md](README.md).
