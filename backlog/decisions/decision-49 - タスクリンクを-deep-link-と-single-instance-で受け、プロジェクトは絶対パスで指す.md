---
id: decision-49
title: タスクリンクを deep-link と single-instance で受け、プロジェクトは絶対パスで指す
date: '2026-10-19 09:29'
status: accepted
---
## Context

TASK-206（2026-09-19 起票）の要求である。work-report のダッシュボード（`tools/dashboard/build.py` が
生成する 1 枚の HTML）は、朝の一枚の候補行として Atlas に登録したプロジェクトのタスクを並べるが、その行から
Atlas を開く手段が無い。利用者はタスク ID を見て Atlas を起動し、プロジェクトとタスクを自分で探して
いた。**外部が生成した URL 1 つで、そのタスクの詳細を Atlas の前面に出す。**

本 ADR は 4 語を導入する（定義の正本は doc-3 §8 で、ここには写すだけである）。

- **Atlas の URL スキーム** … 外部から Atlas の 1 タスクを開くために OS へ登録する `backlog-atlas` という
  URL スキームを指す。
- **タスクリンク** … Atlas の URL スキームを持ち、1 つのプロジェクトと、その中の 1 つのタスクを指す URL を
  指す。
- **スキームの関連付け** … Atlas の URL スキームの URL を Atlas の実行ファイルへ渡すよう OS に記録された
  設定を指す。doc-3 §4.1 の「登録」（台帳への登録）とは別物なので「登録」と呼ばない。
- **起動の引継ぎ** … 2 つ目に起動した Atlas のプロセスが、引数を既に動いている Atlas へ渡して自らは終了
  することを指す。

### 争点は 2 つあり、どちらもユーザーが選んだ

**1 つ目は依存ゲートである**（AGENTS の Dependencies 節）。macOS は起動中のアプリへ URL を配るが、
Windows と Linux の関連付けは 2 つ目のプロセスを立てる。Atlas は 1 プロセス前提で書かれているので、
**AC #2（2 つ目のプロセスを立てずに既存の窓が移る）は起動の引継ぎ無しには満たせない。**
Tauri 公式の `tauri-plugin-deep-link` と `tauri-plugin-single-instance` を組み合わせるのが定石で、
**ユーザーが 2026-10-19 に両方の導入を選んだ。**

**2 つ目は URL がプロジェクトをどう指すかである**（タスク本文が「このタスクで決める」と置いた）。候補は
台帳エントリの project_root か backlog_root の絶対パスで指す形と、slug で指す形（doc-3 §5 の横断タスクID
を右に載せる形）の 2 つで、**ユーザーが同日、パスで指す形を選んだ**（§2）。

### 追加前に測ったこと

crate 2 つの実物と、この tree の依存解決を測った（2026-10-19、`tauri-plugin-deep-link` 2.4.10・
`tauri-plugin-single-instance` 2.4.5）。

- **増える crate はプラットフォームで大きく違う。** `cargo metadata --filter-platform` で数えると、
  aarch64-apple-darwin が 262 → 266、x86_64-pc-windows-msvc が 268 → 272、
  x86_64-unknown-linux-gnu が 301 → 351 で、リリースの 5 トリプルの和集合は 354 → 403 である。
  **Linux の 50 の大半は `zbus`（D-Bus）とその非同期基盤**で、起動の引継ぎが Linux では D-Bus の
  セッションバスを経るためである。macOS と Windows で増えるのは 2 つのプラグイン自身と `tracing` 系、
  Windows はさらに `windows-registry` である（macOS は §3 により single-instance を持たない）。
- **新しいベンダーではない。** どちらも `tauri-apps/plugins-workspace` の公式プラグインで、
  既に在る `tauri-plugin-dialog`・`tauri-plugin-window-state` と同じ出どころである。
- **新しいライセンス識別子は `CC0-1.0`（`tiny-keccak`）の 1 つだけで、`scripts/spdx/` は増えない。**
  `tiny-keccak` は自身の LICENSE を同梱しているので、生成器が標準文へ落ちる経路を通らない。
  残りは `MIT`・`Apache-2.0 OR MIT`・`MIT OR Apache-2.0`・`Apache-2.0 WITH LLVM-exception OR Apache-2.0`
  で、いずれも既に tree に在った。
- **`serde_json` が開発依存から本番依存へ移った。** `tauri.conf.json` に `plugins` が入ると
  `generate_context!` の展開が crate 直下の `serde_json` を名指す（追加した直後のビルドが E0433 で止まった）。
  tree には tauri 経由で既に在るので、build が得る crate は無い。

## Decision

### 1. 2 つのプラグインを本番依存として導入する

`tauri-plugin-deep-link` は 3 OS すべてで、`tauri-plugin-single-instance`（`deep-link` feature 付き）は
Windows と Linux でだけ導入する（`Cargo.toml` の target 依存）。導入範囲は**受け取りだけ**である。

- deep-link プラグインの JS コマンド 4 つ（`get_current`・`register`・`unregister`・`is_registered`）は使わず、
  どの capability も許可しない。画面が呼ぶのは Atlas 自身の `task_link_take` 1 つである。
- 実行時のスキームの関連付け（`register_all`）は **AppImage で起動したときだけ**呼ぶ（§4）。
- スキームは `tauri.conf.json` の `plugins.deep-link.desktop.schemes` に `backlog-atlas` 1 つだけを書く。
  `src-tauri/src/task_link.rs` の `SCHEME` と同じ値であることをテストが押さえる。

### 2. タスクリンクはプロジェクトを絶対パスで、タスクを ID で指す

形は `backlog-atlas://task?root=<指すルート>&id=<タスク ID>` で、詳細（符号化・照合・拒否）は doc-3 §8 が
持つ。**指すルート は台帳エントリの project_root と backlog_root のどちらと一致してもよい**（一致の判定は、
登録時に同じルートの二重登録を拒む比較と同じ — 実体パスどうしで比べる）。

**slug で指す形を採らないのは、生成側が Atlas の slug を知る手段を持たないからである。** slug は
利用者が登録時に決める値で（doc-3 §3.1）、既定はディレクトリ名から導くが、変えられる。ダッシュボードの
`brief.json` が持っているのはプロジェクトルートの絶対パスであり、slug で指す形にすると、生成側は
ディレクトリ名から推すか、Atlas の台帳ファイル（`projects.toml`）を読むかになる。前者は既定から外れた
登録で黙って外れ、後者は Atlas の内部形式を外部との契約に昇格させる。**絶対パスは生成側が既に持つ値で、
Atlas の側でもそれ自体が台帳エントリの属性である** — どちらの側にも新しい値を作らない。

**費用は URL が機械に依存することである。** パスはその機械でしか意味を持たないので、タスクリンクを
別の機械へ持ち出しても開けない（未登録として理由が出る — §5）。生成側も受け側も同じ機械で動く
ダッシュボードの用途では費用にならない。**持ち出せる形が要る用途が出たら、slug で指す形を足す**
（置き換えではなく）— それは本節の改訂である。

### 3. 起動の引継ぎは Windows と Linux に限る

**macOS では LaunchServices が、起動中のアプリへ URL を Apple Event として渡す**（deep-link
プラグインはそれを `RunEvent::Opened` で受ける — crate 2.4.10 を読んで確かめた）。したがって macOS では
single-instance が無くても AC #2 が成り立つ。

**macOS で single-instance を入れない理由は、開発ビルドを止めるからである。** macOS の実装は
`/tmp/<identifier>_si.sock` の Unix ソケットで 1 プロセスを判定するので（crate 2.4.5）、配布版の Atlas を
動かしたまま `pnpm tauri dev` を起動すると、開発ビルドは引数を配布版へ渡して即座に終了する。
得るものが無い場所でこの費用を払わない。

**Windows と Linux では同じ費用を払う。** 判定の鍵が identifier から作られるので（Windows は名前付き
mutex、Linux は D-Bus のバス名 `<identifier>.SingleInstance`）、配布版を動かしたまま開発ビルドを起動すると、
開発ビルドは終了する。**これは欠陥ではなく、本節が受け入れた費用である** — 開発するときは配布版を
終了させておく。

**Linux でセッションバスに繋がらないとき、起動の引継ぎは無いまま Atlas は起動する。** crate 2.4.5 は
接続の失敗を握りつぶして通常起動へ進む（zbus 5.19.0 はアドレスの組立てでは失敗せず、接続で失敗する）。
そのとき 2 つ目のプロセスはそのまま 2 つ目の Atlas になる — 起動の引継ぎが入る前と同じ振る舞いへの
縮退で、新しく壊れるものは無い。

### 4. スキームの関連付けはインストーラが書き、開発ビルドは手で書く

- **macOS** … バンドラが `Info.plist` に `CFBundleURLTypes` を書き、`.app` が置かれて LaunchServices に
  知られた時点で関連付けが成り立つ。
- **Windows** … NSIS と MSI のインストーラが `Software\Classes\backlog-atlas` を書く。
- **Linux** … `.deb` と `.rpm` は `.desktop` ファイルの `MimeType` に `x-scheme-handler/backlog-atlas` を
  持つ。**AppImage にはインストーラが無いので、Atlas が起動のたびに自分で関連付けを書く**
  （`register_all`。`~/.local/share/applications/` の `.desktop` と `xdg-mime default`）。
  `.deb`・`.rpm` から入れた Atlas がこれを呼ばないのは、パッケージが書いた関連付けを、最後に走った
  バイナリへ向け直さないためである。

**開発ビルドは関連付けを自動では書かない。** deep-link プラグインの定石は開発ビルドで毎回
`register_all` を呼ぶ形だが、Windows ではそれが HKCU の `Software\Classes\backlog-atlas` を開発ビルドの
実行ファイルへ書き換え、配布版のインストーラが書いた値を上書きする — 開発機と常用機が同じなので、
開発ビルドを 1 度起動しただけで配布版のリンクが開かなくなる。**OS の状態を変える操作は、それと分かる
手作業に置く。** 手順は doc-3 §8 にある。

### 5. 開けないときは理由を通知帯に出し、開けるときはカードを押したのと同じ道を通る

**リンクを開けない理由は 4 つ**で、doc-3 §8 が文と照合の順を持つ: URL が形に合わない、指すルートが
登録されていない、プロジェクトを読み込めていない、そのプロジェクトにその ID のタスクが無い。どれも
通知帯（doc-11 §4 の ⑤）に出し、画面は動かさない。

開けるときは、カードを押したときと同じ処理でそのタスクを開く。**破棄前確認（doc-8 §6.3）も同じに
掛かる** — 編集中の別タスクから移るなら問いが立つ。**モーダルが出ている間は開かずに待ち、閉じてから
開く。** カードはモーダルの裏では押せないので、リンクもモーダルの裏では効かせない。待たせるのは
最新の 1 本だけである。

## Consequences

- 望ましい帰結
  - 生成側は自分が既に持つ値だけでタスクリンクを組める。Atlas の内部形式は契約にならない。
  - 開けないリンクが黙って何も起こさないことが無い。理由は利用者がリンクと照らせる値を名指す。
  - macOS の開発ビルドは配布版と並んで動き続ける。
- 費用・制約
  - **Linux のビルドに約 50 crate が増える。** 依存ゲートが量った最大の費用である。
  - **Windows と Linux では、配布版を動かしたまま開発ビルドを起動できない**（§3）。
  - タスクリンクは機械に依存し、持ち出せない（§2）。
  - **開発ビルドでのスキームの関連付けは手作業である**（§4）。
  - プラグインの版が上がると受け取りの経路が変わりうる。上の「追加前に測ったこと」と §3 の挙動は
    crate 2.4.10・2.4.5 を読んで確かめたものであり、**版を上げる回は次の 4 点を確かめ直す** —
    macOS の URL が `RunEvent::Opened` で届くこと、Windows・Linux の冷えた起動の URL がプラグインの初期化中に
    引数から読まれること（だから `get_current` を読む）、single-instance の `deep-link` feature が
    2 つ目のプロセスの引数を deep-link の経路へ流すこと、Windows の引継ぎが引数を `|` で連結して運ぶこと
    （だから doc-3 §8 は `|` の符号化を求める）。
- 後続への影響
  - work-report のダッシュボードが候補行を `<a href>` にできる。生成側は doc-3 §8 を契約として読む。
  - **単一プロセスの前提はこれまでどおり保たれる。** 起動の引継ぎは前提を変えるのではなく、Windows・
    Linux で破られかけた前提を守るために入った。
