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
  この規則はエージェントとしてのあなたに対しては例外なく効く。製品側の例外は次の項。
- **decision はこの列挙の外である。CLI にそれを書く手段が無いためである。**
  `backlog decision` は `create` のみを持ち、その options は `<title>` と `-s/--status` だけ
  なので、**decision の本文は作成時にも作成後にも CLI から書けない**（v1.49.3 で実測。
  対して `doc` は `update --content` を持つ）。したがって `backlog/decisions/` にある本文は
  すべてファイルを編集して書かれたものであり、それが decision の書き方である。
  列挙されている 3 種 — タスク・文書・マイルストーン — には上の規則が例外なく効く。
  **この読みは 2026-08-13 に所有者が確定した**（TASK-162）。書き残しているのは、列挙の
  沈黙がこれを根拠づけているのではないからである — 沈黙から許可を導き直す回は、
  この節の最後の項が禁じている手を打つことになる。
- **製品側の唯一の例外 — マイルストーンの説明**（decision-21）。v1.49.3 の `milestone` に
  `update`／`edit` が無く、説明は作成時にしか設定できないうえ、作り直すと id が変わる。
  そのため Atlas はこの 1 範囲だけを自分で書く: `## Description` 見出し行の次の行から、
  次の `##` 見出し行の直前まで（無ければファイル末尾まで）で、それ以外は書かない —
  frontmatter とファイル名はそのまま残す。書き込みは一時ファイル置換（decision-17）で
  行い、他の更新と同じく doc-9 §4 の更新前競合の検出を通す。この例外に入るのは次の
  3 条件をすべて満たす操作だけである: CLI がその値を書く経路を現に持っている（＝新しい
  書式を発明しない）、frontmatter とファイル名に触れない、書く範囲が読み取り層の読む
  範囲と同一である。「CLI に手段が無い」ことは、それだけでは管理ファイルを直接書く
  理由にならない。
- Backlog CLI と Git の実行は、固定したサブコマンドと引数配列を使う。ユーザー入力を
  シェル文字列として連結して実行しない。

## 識別子

- 横断画面では `<project-slug>:<TASK-ID>` を使う。各プロジェクト内のコミットと
  Pull Request では `TASK-N` を使う。

## 動作確認済み版の書き方

Atlas が動作確認した Backlog CLI の版を、どこにどう書くか（decision-27）。値そのものは
decision-7 が持ち、次の 5 つは表記についての規則である。

- **値として使う版は `update.rs` の `MIN_VERSION` から取る。** Rust の試験はこの定数から導き、
  フロントエンドの試験と fake は `src/lib/confirmed-version.ts` を読む（同モジュールは記録
  `cli_readiness.json` から取る）。フロントエンドのソースに版を書かない。
- **画面に出る文は版を名乗らない。** 例外は、利用者の CLI の版と動作確認済み版の差そのものを
  述べる 1 文だけ（CLI 縮退帯の unsupported）で、その文は `CliReadiness` の項目を読む。
  「CLI に手段が無い」と書き、どの版で測ったかは doc に委ねる（doc-11 §8）。
- **ある事実をどの版で測ったかを述べる註は、版をリテラルのまま書く。** 定数を参照させない。
  ファイル単位の宣言へ畳まない — 註を 1 つずつ書き換える行為が再実測の強制力であり、定数に
  すると誰も測っていない版で実測したという主張が自動生成される。
- **実測記述を持つ doc は、実測基準版を冒頭の前提の直後に 1 回宣言する。** 本文の個々の記述は
  版を名乗らない。2 つの版の違いを述べる記述は両方の版を残す — 宣言はそれを覆わない。
- **README 和英は版を名乗らない。** 「Backlog CLI が要る」「最新版でよく上限は固定していない」
  「必要な版は Atlas が起動時に検査し、満たないときは画面がその版を告げる」と書く（最後は §2 が
  許している 1 文が担っている）。リテラルを置くと引き上げのたびに書き換えが要るのに、読者には
  何も足さない — 案内している導入コマンドが最新版を取るためである。**この層は decision-27 に
  無い**（あちらはコード・画面文字列・doc・実測註で止まっている）。**TASK-162 がそこへ書き、
  それまではこの項が規則の置き場である。**

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
  pnpm 経由で実行する (`pnpm test`、`pnpm run check`、`pnpm run lint`、`pnpm run build`、
  `pnpm tauri dev`、`pnpm tauri build`)。このリポジトリで npm・yarn を実行しない。
  いずれも `pnpm-lock.yaml` の隣に二つ目の lock ファイルを書いてしまう。
- Rust 側は従来のコマンドを `src-tauri/` で実行する (`cargo test`、`cargo fmt`、
  `cargo clippy`)。
- **Linux でビルドするなら Ubuntu 24.04 以降を使う。** Linux では WebView が cargo の依存では
  なくシステムのライブラリであり、どれが要るかは lock から決まる。`webkit2gtk` クレートは
  webkit2gtk-4.1 を、`soup3` は libsoup-3.0 を束ねている。24.04 は両方を持つが、20.04・22.04 は
  持たず、ビルドは `pkg-config` の段階で `glib-2.0` が見つからないと言って止まる。**この
  エラーは WebKit にも Ubuntu の版にも触れない**ので、ディストリを替えるのではなくパッケージを
  1 つずつ入れる方向へ誘導してしまう。導入する開発パッケージの一覧は README の
  「ソースからのビルド」にあり、`.github/workflows/release.yml` がそれを繰り返す。Linux
  ランナーは、どの段が散文を読むより先にこれらを入れておく必要があるためである。**したがって
  一覧の置き場は 1 つではなく 2 つある** (2 つ目は TASK-101 が足した)。両方を一緒に直し、
  読者は README へ送る。ランナーは一覧の汎用な半分を既に持っているが、それも入れ直す —
  そうすれば 2 つの一覧を行ごとに見比べられ、誰も導出し直さない部分集合へずれていかない。
- `pnpm install` は `@parcel/watcher` と `esbuild` を build script 未承認として報告する。
  承認しないまま残す。`@parcel/watcher` は sass 自身の watch モードにしか要らず、esbuild
  はプラットフォーム別バイナリを optional dependency で解決するため、いずれの script
  なしでもビルド・テスト・`svelte-check` は通る。
- **`src-tauri/icons/` のファイルはすべて `src-tauri/app-icon.png` から生成する。**
  個別のファイルを手で編集しない。元画像を変えて
  `pnpm tauri icon src-tauri/app-icon.png` を実行し直し、併せて書き出される
  `src-tauri/icons/android/`・`src-tauri/icons/ios/` を削除する。このアプリはモバイル標的を
  持たず、ビルドのどこもそれらを読まない。入力のパスは必ず書く。このコマンドで
  `tauri.conf.json` ではなく作業ディレクトリからの相対で解決されるのは入力パスだけであり
  （出力はどちらから実行しても config の隣の `icons/` へ行く）、リポジトリ直下での引数なし
  `pnpm tauri icon` は失敗する。17 個の出力の
  うち 16 個はバイト単位で再現するが、`icon.icns` は再現しない。要素の書き出し順が実行ごとに
  変わるためで、要素の集合・各要素の内容・総バイト数は同じである。再実行後に
  `icon.icns` だけが差分に出たときは、変更なしとして扱う。
- **`tauri.conf.json` の窓設定にある `"dragDropEnabled": false` は効いている行であって、消し
  忘れではない**（decision-34）。Tauri の既定は `true` で、そのとき登録される drag-drop handler の
  閉包は `true` を返す — wry のその戻り値の doc いわく OS の既定動作を止める値であり、
  `tauri-utils` は当該設定の doc で「Windows で HTML5 のドラッグ&ドロップを使うには無効化が必須」と
  そのまま述べている。既定へ戻すと、スイムレーンの 列間ドロップ（doc-7 §4.2）が Windows でだけ
  黙って効かなくなり、戻した本人の機械では動いたままになる。**Atlas は OS のドラッグ&ドロップ事象を
  1 か所も消費していない**ので、これを読む側はどこにも無い — 外して失うものが無かった理由がそれで
  あり、消費者が見つからないことをもって不要な行と判断してはいけない理由も同じである。

## コーディング規約

以下は書く・変えるコードに効く。**既存のコメントや、触っていないコードを、この規約に合わせる
ためだけに削除・書き換え・整形し直さない** — 見つけたら報告する。なぜこの規約か、なぜ道具が
ここで止まるかは decision-32 が持つ。

### コメント

- 既定ではコメントを書かない。名前と構造で明確にすることを優先する。
- コメントを書くに値する場合は、**なぜ** そうしたか、必要なら **なぜそうしなかったか**（採った
  手段の理由と、自明な代替を退けた理由）を書くものを優先する。
- コメントは、コード自身では明確に表せない情報にだけ使う — 意図、制約、不変条件、外部要件、
  自明でないトレードオフなど。
- コードが何をしているかを言い換えるだけのコメントは決して書かない。
- API ドキュメントコメントも同じ原則に従う。名前・型・署名から既に明らかなことは書かない。
  呼び出し側に関わる契約のうち、コードで明確に表せないものだけを書く — 振る舞いの保証、
  事前条件、副作用、エラーの意味、互換性の制約など。

### 制御フロー

- 言語が省略を許す場所でも、制御フローの本体には常に明示的なブロック構文を使う。
- **形は 3 行である** — 開き波括弧は条件の行の末尾に置き、本体は次の行に 1 段下げ、閉じ波括弧は
  条件と同じ桁に戻す。`else` は `} else {` と繋げる。ファイルごとに決め直す好みではない。
  既存の 384 個のブロックがすべてこの形であり、残っていた 371 箇所を TASK-177 がこの形に揃えた。

### 関数

- ひとまとまりの、名前を付けられる責務を表すブロックは関数に切り出す。
- 切り出しは抽象・可読性・テスト容易性を良くするために行う。行数を減らすためではない。
- 呼び出し箇所の数はどちらの向きにも基準にしない。2 箇所から呼ばれることはそれだけでは切り出しを
  正当化せず、1 箇所からしか呼ばれないことはそれだけでは切り出しを退けない。
- 密に結合した些細な処理は、切り出すと局所性が下がる・不要な間接が入る場合、その場に置く。

### リンタが持つ範囲と、持たない範囲

`pnpm run lint` は Biome を `src/`・`scripts/`・および 3 つのルート設定
（`vite.config.ts`・`vitest.config.ts`・`svelte.config.js`）に対して走らせる。有効なルールは
ちょうど 1 つ、`style/useBlockStatements` — 上の 制御フロー の規則である。**この集合が、この木の
手書きソースのすべてである。** 集合は `biome.jsonc` の `files.includes` が名指ししており、
ルート設定を 1 つずつ列挙してあるのは、将来別のツールが置く設定を読まないまま取り込まないため
である。両者は一緒に変える。**コメント・関数・API ドキュメント
コメントには機械の検査が無く、レビューが持つ。** この節が設定ファイルとは別に要るのは、この
3 群のためである。

覚えておく穴が 2 つある。

- **Biome は Svelte のマークアップを読まない。** `.svelte` のテンプレート内のインラインハンドラに
  書いた制御フローは見えない — TASK-177 は lint が取りこぼしたその 1 件を見つけている。
  **`pnpm run lint` が通ることは、規約に合っていることの証明にならない。**
- **`biome lint --write --unsafe` が書くのは 1 行の `if (c) { 本体 }` で**、上の形ではない。
  修正用スクリプトは意図的に置いていない。3 行の形は手で書く。

Biome のフォーマッタを有効にしない。ルールのプリセットも足さない。`biome.jsonc` はそれぞれの
すぐ隣に、退ける根拠となった実測を書いてある — フォーマッタは `.svelte` の `<script>` ブロックを
桁 0 まで潰し、`recommended` プリセットはマークアップでだけ使う束縛を未使用と報告して削除を
提案する。

## テスト

`pnpm test` は Vitest の 2 プロジェクトを実行する。

- **`unit`** — `src/**/*.test.ts` を `node` 環境で。純粋関数として持つ規則と、記録した
  wire payload。DOM は使わない。
- **`component`** — `src/**/*.component.test.ts` を `jsdom` で、Svelte 自身の `mount` を
  通してコンポーネントをマウントする。ハーネスは `src/lib/render.ts` だけで、テスト
  ライブラリは入れていない。ここで必要なクエリはコンポーネント自身のセレクタであり、
  イベントには IME の変換中 (`isComposing`、`keyCode === 229`) が含まれる — 合成された
  `type()` では作れないものである。

この分割は維持する。`unit` に DOM を与えると既存テストが通ってきた実行環境が変わり、
Svelte コンパイラを要するのは 2 つ目のプロジェクトだけである。

**コンポーネントテストは画面横断契約だけを固定する** — 純粋関数では持てず、どの単一
画面のものでもない契約である。モーダルの出口、詳細パネル離脱時の破棄前確認、再読込が
破棄してはならないもの、起動時の呼出し順序。画面ごとの網羅は目的ではなく、アプリ全体を
通す GUI E2E は別物 (TASK-105)。画面ごとにテストを置くと UI 変更のたびにテスト変更が
生じ、契約は何も増えない。

**`jsdom` はレイアウトを行わない。** `getClientRects` は何に対しても空を返し、
`Modal.svelte` のフォーカス巡回を黙って空にしてしまうので、`render.ts` は描画されて
いる要素に箱を報告する — 実装の呼出しが依存する規則 (`hidden`、インライン
`display: none`、閉じた `details`) によってであり、計測によってではない。返る数値を
テストで検査してはならない。

**wire payload は Rust 側を正本として記録する。** `src/lib/wire.ts` はこの crate の
serde 出力を手書きで写しており、どちらのコンパイラも他方を検査しない。
`src-tauri/src/wire_fixtures.rs` が payload ごとに 1 件を直列化して
`src-tauri/wire-fixtures/*.json` と照合し、`src/lib/wire-fixture.test.ts` が各記録を `wire.ts`
に対して 3 通りに検査する — キーを `keyof`、**値の型**を同じ型を注釈した見本値、**serde の
enum トークンと variant tag** を `unionValues` で固定したメンバー一覧と — うえで payload に
フロントエンドの関数を通す。3 つすべてが必要である: `keyof` が固定するのは項目名であり、
number から string へ変わった項目は名前を保ち、改名された variant トークンは名前も型も保つ。

payload の標本が通すのはそれが実際に持つ variant だけなので、`wire_tokens.json` に各 union の
**全**トークン集合を記録する。さもないと、どの標本も使わないメンバーは `wire.ts` だけに固定され、
Rust 側でそれを改名しても全検査を通過する。`wire_fixtures.rs` の各一覧は、隣に置いた網羅的な
`match` が完全性を保つ: variant を足すとその match がコンパイル不能になり、それが標本追加の
合図になる。トークンを書き下している箇所は無い — すべて serde が生成する。どちらも cast ではなく (cast は任意の JSON を
受け入れる)、テスト内に書いた仕様でもない (どちらも tsc が `wire.ts` から決める) ので、Rust の
出力・`wire.ts`・テストを 2 つずつ一致させることはできない。見本値は `null` を残さず全項目を
埋める。`null` は何とでも一致するためである。記録の更新は
`ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で行い、**結果をコミットする** — フロント側の
テストはコミットされたファイルを読む。標本は一時ディレクトリの読取ではなく、絶対パスを
作り置いた struct リテラルで組む。リテラルなら新しい項目をコンパイラが名指しし、記録した
fixture はどの機械でもバイト単位で同一でなければならない。

## 継続的インテグレーション

`.github/workflows/ci.yml` は Pull Request ごとと、それが main に入った後の push で走る
（decision-33）。`v*` タグでバンドルを作りコードを一切見ない `release.yml` とは別物である。

- **`frontend`**（ubuntu）— `pnpm run lint`・`pnpm run check`・`pnpm test`・`pnpm run build` を、
  どれが落ちたかがそれ自身で分かるよう段を分けて実行する。
- **`rust`**（macOS と Windows）— `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・
  `cargo test`。**Linux は意図して外してある** — この 2 つのランナーは `src-tauri/src` の OS 条件付き
  コンパイル述語を 1 つを除いてすべてコンパイルし、Linux のランナーは WebView の `apt-get` 一覧を
  3 箇所目に書くことを要求する。根拠の全文はワークフロー末尾のコメントが持つ。**読まずに Linux の
  ジョブを足さない。**

**Pull Request がマージできるようになるには 3 つの検査が要る** — `frontend`・
`rust (macos-latest)`・`rust (windows-latest)` — リポジトリの ruleset `main` がそれを課している。
**job の `name` がその文字列そのものである。** job を改名すると ruleset は古い名前を待ち続け、
Pull Request は永久に緑にならない。改名するなら ruleset も一緒に変える。

**repository admin はその検査を迂回できる。これは意図である。** タスクの状態 が述べる `Done` の
commit のために main を書ける状態を保つのがひとつ、壊れたワークフローを直せる状態を保つのが
もうひとつ — 迂回が無いと、検査を直す変更をその検査が阻む。**Pull Request を作ること自体は
要求していない。** 要求しているのは、Pull Request があるときにその検査が通ることである。

**手元の `cargo clippy` が通っても CI のそれが落ちることがあり、違いは toolchain である。**
`dtolnay/rust-toolchain@stable` はジョブが走る日の stable に解決され、clippy はリリースごとに
lint を広げる — 数版遅れている機械は、その分だけ見えていない。TASK-178 がまさにこれを踏んだ:
手元 1.96.0 に対しランナー 1.97.1 で、誰も触っていないコードに `question_mark` が 1 件、
両ランナーで出た。このリポジトリは Rust を意図的に固定していない（release ワークフローも
stable を追い、`rust-toolchain.toml` も無い）ので、対処は固定ではなくランナーに合わせることで
ある: `rustc --version` をジョブが表示する版と突き合わせ、違えば
`rustup toolchain install <その版>` して `cargo +<その版> clippy` を走らせる。既定を更新しても
よいが、`+` の形は既定を動かさずに CI の答えを確かめられる。

## リリース

**リリースのタグを打つ前に、`README.md` と `README.ja.md` を出荷するビルドと突き合わせ、
2 つを併せて読む。** 片方だけ直した状態を捕まえるための手順である。古びるのは、実測値か
覆せる判断に紐付いた記述である — 動作環境と Linux の下限、Backlog CLI の最低バージョン
要件、アプリが自分を更新するかどうか、そして「できること」が挙げている機能。

**README は実装状況の節を持たない。書き戻さない**（TASK-90）。作業がどこまで進んでいるかは
`backlog/tasks/` に、設計がなぜそうなっているかは `backlog/decisions/` にあり、README の
実装状況一覧はその写しでしかないうえ、リリースの合間に何も壊さないまま古びる。上の確認が
対象にするのは読者が行動の根拠にする記述（何を入れるか・何で動くか・新しい版がどう届くか）
であって、進捗報告ではない。

### リリースの作り方

`.github/workflows/release.yml` が `v*` タグに対して 3 プラットフォームのバンドルを組み、
**下書き (draft)** のリリースへ添付する。タグは push でも、Actions タブから手で渡してもよい。
リリースノートは、マージ済みの Pull Request から GitHub が生成する (分類は
`.github/release.yml`)。**下書きの公開は手作業であり、今後もそのままにする。** ノートは
公開前に読むためのものであり、ジョブが落ちたプラットフォームがあれば下書きは成果物を
1 つ欠いた状態になるからである。

このワークフローには、細部ではなく判断である点が 6 つある。取り消す変更を加えるなら、
その理由を書く。

- **macOS 署名の 6 シークレットが未登録なら、ビルドを拒む。** 判定は下書きを作るジョブに
  あるので、実行は成果物が 1 つも生まれる前に止まる。**未署名の macOS バンドルは、無いよりも
  悪い** — Gatekeeper に拒否される時点で、利用者は既にそれを取得している。
- **`THIRD-PARTY-LICENSES.txt` がタグの木を述べているかを、ビルド前に確かめる。** 判定は
  上と同じジョブにあり、理由も同じである。この通知はどのバンドルにも入るので、古びていれば
  成果物すべての欠陥であって、気づいたプラットフォームの欠陥ではない。
- **`pnpm test` は実行しない。** m-3 TASK-150 の断続的なコンポーネントテスト timeout が、
  ビルドに無い欠陥でリリースをランダムに落としてしまう。テストは、そのタグを生んだ
  Pull Request の側で走っている。
- **ビルド前に、タグと `package.json`・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml`・
  `src-tauri/Cargo.lock` を突き合わせる。** Tauri はバンドルを `tauri.conf.json` の版で
  命名し、ビルドは `--locked` を渡さない。突き合わせが無ければ、タグは前の版の名前を持つ
  成果物を、ビルドが黙って書き換えた lock の上に作ってしまう。
- **tauri-action が `.dmg` の横へ上げる `.app.tar.gz` を、ワークフローが削除する**
  (TASK-170)。tauri-action は見つけた `.app` を updater の有無によらず tar.gz に固めて
  上げ、1 つの成果物だけ除外する入力を持たない — `bundle.targets` でも防げない。`.dmg` を
  作れば `.app` は必ず生まれるからである。updater を持たない以上 (decision-30) これを取る
  利用者はおらず、同じ `.app` は `.dmg` に入っているので、出し続けると README が全読者に
  「取らなくてよい」と断る資産がリリースページに残り続ける。v0.1.0 は一度これを載せ、
  2026-08-14 にオーナーが削除した。
- **Linux を `ubuntu-24.04` と `ubuntu-24.04-arm` の 2 回組む** (TASK-172)。v0.1.0 は
  x86_64 だけを出しており、オーナーの Linux 環境は Apple silicon 上の VM なので、あの
  リリースには動かせるものが 1 つも無かった。**各ランナーは自分のアーキテクチャ向けに組む**
  ので、クロスコンパイルは無く、どちらの行も `--target` を渡さない。`ubuntu-24.04-arm` は
  GitHub がホストするラベルで、パブリックリポジトリでは無償であり、「ツールチェーン」節の
  WebView 要件が指すのと同じ Ubuntu を載せている。**2 行が出す 6 つの資産は衝突しない** —
  tauri-bundler がアーキテクチャを名前へ書くからで、`.deb` は `amd64`/`arm64`、`.rpm` は
  `x86_64`/`aarch64`、`.AppImage` は `amd64`/`aarch64` である (@tauri-apps/cli 2.11.4 の
  bundler を読んで確かめた。AppImage も拒まれず、aarch64 の linuxdeploy を取りにいく)。
  **Linux だけの手順の条件は、ランナーのラベルではなく matrix の `linux` 印で書く** —
  Linux の行が 2 つある以上、片方のラベルを名指しする条件はもう一方のバンドルの検査 2 つを
  走らせずに終わり、走らなかった検査は「何も読まずに緑になった実行」だからである。

### 第三者依存のライセンス通知

**生成器は新規依存を 1 つも足していない。これは偶然ではなく依存ゲートの結論である**
（TASK-159。2026-08-14 にユーザーが確定した）。npm 側は pnpm 自身のサブコマンド
`pnpm licenses list --prod --json` なので `packageManager` の固定で足り、cargo 側は
`cargo metadata` とスクリプト内の tar リーダーである。並べて検討したのは `cargo-about` で、
このリポジトリが `scripts/spdx/` に置いている SPDX 本文コーパスを内蔵している。**採らなかった
理由は 3 つ** — 覆うのは cargo 側だけで npm 側は結局ここに書くことになる、リリースのたびに
コンパイルが要る、そして `accepted` 許可リストが、通知なら記録するだけで済むライセンスの変化で
リリースを止める。

**`THIRD-PARTY-LICENSES.txt` は生成物であり、コミットしてある。手で編集しない。**
`scripts/generate-third-party-licenses.mjs` が 2 つのロックファイルと、それが解決した
パッケージから書き出すので、手で入れた編集は次に依存が動いた時点で消える。入力が動いたら
（どちらかのロックファイル・`THIRD-PARTY-NOTICES.md`・`scripts/spdx/` の本文）生成し直して
コミットする:

```
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-darwin --target x86_64-apple-darwin \
  --target x86_64-pc-windows-msvc --target x86_64-unknown-linux-gnu
node scripts/generate-third-party-licenses.mjs
```

ファイルは自分のヘッダに、入力それぞれのダイジェストを記録している。
`src/lib/third-party-licenses.test.ts` がそれを木と突き合わせ、動いていれば落ちる。
リリースワークフローも下書きを作る前に同じ突き合わせをする — **「誰かが再実行を覚えている」
に依っていない。**

生成器には、細部ではなく判断である点が 4 つある。

- **出力を CI で作らずコミットしてある。** `tauri.conf.json` がこのファイルを
  `bundle.resources` に挙げているためで、ランナー上にしか存在しないリソースは README の
  「Building from source」に従う全員の `pnpm tauri build` を壊す。コミットが安全なのは
  **出力がバイト単位で再現するから**である — 生成器は時刻もパスも機械固有の値も読まず、
  並びはすべて整列済みである。
- **冒頭で `THIRD-PARTY-NOTICES.md` を全文再掲する。** Ace と Lucide はこの木に取り込んで
  あり、どちらのロックファイルにも現れないので、ロックファイルから作った一覧には載らない。
  2 ファイルではなく 1 ファイルにしてあるのは、**生成した一覧だけを出荷することを不可能に
  するため**であって、同梱時に誰かが覚えている規則にしないためである。
- **crate の集合は、リリースの 4 つのターゲットトリプルの和集合である。**
  `cargo metadata --filter-platform` を 1 回ずつ、計 4 回通す。絞らない依存グラフは 442 件で、
  和集合の 352 件と食い違う — cargo はロックファイルが記述しうる全プラットフォームを解決
  するので、そのままだと Android・wasm・Redox・iOS・GNU ABI の Windows 用 crate が
  このバンドルに入っていると通知が主張してしまう。
- **crate の本文は、cargo registry cache の `.crate` tarball から読む。** 隣にある展開済み
  ソースからではない。`cargo fetch --target` はビルドしないプラットフォームのぶんも cache を
  埋めるが、**展開はビルド時に起きる** — つまり 1 台の機械で展開済みなのはホストのぶんだけで、
  この通知は 4 トリプルを一度に覆う必要がある（2026-08-14 実測: この木の 58 crate が
  取得済みかつ未展開だった）。

**`.gitattributes` はここでは飾りではなく、仕組みを支えている。** ダイジェストはディスク上の
バイト列に対して取るので、**どの checkout でも同じバイト列になること**に全体が乗っている。
`* text=auto eol=lf` がそれを保証する — git の既定は Windows で `core.autocrlf=true` だからである。
無ければ Windows の checkout は 9 つのダイジェストを一度に変え、**そのうえ通知のヘッダを
解析不能にする。** これは字面より悪い: 古び検査が空リスト同士を比べて通ってしまい、
**全入力を読むはずの検査が、1 つも読まないまま「古びていない」と答える。**
`third-party-licenses.test.ts` は、変換された checkout でも解析できないヘッダでも落ちるようにした。
黙らない。

**19 の crate はライセンス本文を一切公開せず**、`Cargo.toml` に SPDX 式だけを宣言している —
`objc2` 族と `unic` 族、`selectors`、`tauri-plugin`、`alloc-stdlib`、`webview2-com`、
`dlopen2`、`libappindicator-sys`。その代わりに各識別子の標準本文を当て、`scripts/spdx/` に
置いてある（出典はそのディレクトリの README）。**本文の無い識別子は、生成器が止まる。
でっち上げない** — 止まること自体が目的で、**誰も見ていないライセンスを木が引き受けた**という
意味だからである。

**3 つのバンドルとも、複製を持つことを実機で確認してある**（TASK-159、2026-08-14）。
ワークフローがそれぞれを再確認する。**置き場を仮定せず実測したのは、`tauri.conf.json` が
この 2 ファイルを `../LICENSE`・`../THIRD-PARTY-LICENSES.txt` と、`src-tauri/` より上を指す
相対パスで名指ししているからである** — 解決は各バンドラの仕事で、どれが落ちてもおかしくなかった。

| バンドル | 複製の置き場 | ワークフローの読み方 |
|---|---|---|
| macOS `.app` | `Contents/Resources/` | パスを直接 |
| Linux `.deb` | `usr/lib/<productName>/` | `dpkg-deb -x` して名前で探す |
| Windows `.msi` | `Program Files\<productName>\` | `msiexec /a` で展開して名前で探す |

3 つのうち 2 つが**ディレクトリを名指しせず探している**のは、そこが productName だからである。
ワークフローに綴ると、改名が見落とす 2 つ目の置き場ができる。**通知はリリースへ独立した
成果物としても添付される。** 通知が存在すること自体をバンドラに依存しているプラット
フォームは無い。

### バンドルの metadata

画面やパッケージマネージャに出る `bundle` の値 3 つと、それを読むもの。

- **`copyright` が macOS の About パネルに出る文字列であり**、同時に `.app` の
  `NSHumanReadableCopyright`・`.deb`・`.msi` の metadata にも入る。コードは関与しない —
  Tauri の既定メニューが設定から `AboutMetadata` を組むので、About パネルを変える回は
  `tauri.conf.json` だけを編集する。**文言は LICENSE の写しである** — 2 つのファイルは互いを
  参照しないので、変えるときは両方変える。
- **About パネルのアイコンは AppKit の既定で、どこにも設定していない。** 既定メニューは
  `icon: None` を渡すため、muda は `NSAboutPanelOptionApplicationIcon` を options 辞書に
  入れず、パネルは `NSApp.applicationIconImage` に落ちる — バンドルではそれが
  `CFBundleIconFile` を解決する。**未バンドルの `pnpm tauri dev` にはその解決先となる
  バンドルが無いので汎用アイコンが出る。ビルドした `.app` は正しい**（起動形態は
  2026-08-14 にオーナーが確認済み。TASK-168）。**dev 起動のアイコンを欠陥として起票しない。**
  設定するためにメニューを自作もしない — 利用者に見えない差のために、Tauri 既定の
  Edit・View・Window・Help の構成を Rust 側へ複製して保守することになる。
- **`category` は 1 つの値で両プラットフォームの分類を埋める。** `DeveloperTool` が macOS では
  `public.app-category.developer-tools`、Linux では `Categories=Development` になり、ランチャーが
  アプリを「その他」へ落とさなくなる。**両方とも 2026-08-14 にビルドしたバンドルから実測した**
  （TASK-163）— `.app` の `Info.plist` と、`.deb` を `dpkg-deb -x` で展開した `.desktop` エントリ。
  **Linux 側を測り直すには Linux の実機が要る** — macOS のビルドでは `.deb` が作れないので、
  macOS だけで作業する回が確かめられるのは片側までである。
- **Linux のパッケージへ届く文字列は ASCII に保つ。** crate の `description` が `.deb` control の
  `Description` と `.desktop` の `Comment` になるが、Desktop Entry のエスケープは
  `\s \n \t \r \\` だけを定義しており、それ以外を持たない — TASK-163 の em dash は
  `\u2014` という 6 文字のリテラルとして届いた。制約は `src-tauri/Cargo.toml` の、それが縛る
  行の直上に書いてある。`bundle.shortDescription` と `bundle.longDescription` も同じ制約を
  受ける（どちらも未設定）。

### macOS の署名と notarization

Gatekeeper の警告なしに開く macOS ビルドは、**Developer ID Application** 証明書で署名し、
Apple の notarization を通す必要がある。資格情報が環境にあれば Tauri が両方を行い、無ければ
未署名のバンドルを作るので、`pnpm tauri build` も README の「ソースからのビルド」に挙げた
残りも、資格情報を 1 つも要求しない。

- **署名してビルドする** — `.env.signing.example` を写した `.env.signing`（git 管理外）を
  埋め、`./scripts/macos-sign-build.sh` を実行する。引数はそのまま `pnpm tauri build` へ渡る。
- **結果を確かめる** — `./scripts/macos-verify-gatekeeper.sh`。ビルド済みのバンドル、または
  渡したパスを対象に走る。GitHub から取得したリリース成果物でもよい。
- **CI** — `./scripts/setup-ci-signing-secrets.sh path/to/DeveloperID.p12` が、macOS ランナーに
  要る 6 つのリポジトリシークレットを、値を 1 つも表示せずに登録する: `APPLE_CERTIFICATE`
  （.p12 を base64 にしたもの）・`APPLE_CERTIFICATE_PASSWORD`・`APPLE_SIGNING_IDENTITY`・
  `APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`。

**証明書と Apple ID は所有者の資産である。** リポジトリは資格情報を 1 つも持たず、
エージェントはそれを生成も登録もしない。

**署名の名義が copyright と揃わないのは意図的である。** 証明書は
`Developer ID Application: Yoko Otani (9EYB4D9GGQ)` なので、Gatekeeper と `codesign` が示す
名前は "Yoko Otani" になる。LICENSE の "Takuya Otani / SerendipityNZ Ltd." とも identifier の
`com.serendipitynz.backlog-atlas` とも揃わないが、**歴史的経緯によるもので、直す手間に
見合わないという判断である** (所有者が 2026-08-14 に確定)。欠陥として起票しない。

**Tauri が notarize するのは .app であって、それを包む .dmg ではない。** 利用者が取得する
ディスクイメージはそのままでは拒否されるので、`macos-sign-build.sh` が生成された .dmg を
後から notarize して staple する。@tauri-apps/cli 2.11.4 で実測: CLI は `bundle_dmg.sh` を
起動し、そのスクリプトは `--notarize` を受け取るが、CLI が渡す引数列にそれは無い。

**`APPLE_SIGNING_IDENTITY` は手元と CI で同じ値ではない。** 手元の署名は証明書の SHA-1
ハッシュを受け付けるが、ランナーは証明書を import してその common name と文字列一致を取るので、
CI にはその名前が要る。`setup-ci-signing-secrets.sh` は `.env.signing` から写さず .p12 から
導出する。

## 作業上の規約

- コードコメントは英語、利用者向け説明は日本語を基本にする。
- **日本語の Markdown では、閉じる `**` の後に文が続くなら半角スペースを 1 つ置く。**
  閉じ側の区切りは right-flanking でなければならず、直前が `。` で直後が非空白の場合は
  それを満たさない — つまり `**〜です。**Atlas` は太字にならず、`**` がそのまま出る。
  強調の中で日本語の文が終わる書き方はすべてこれに当たる（そしてそれが大半である）。
  描画される場所すべてに効く: README 和英と、Atlas が `markdown-it` で描くタスク・文書の
  本文（decision-25）。
- 実装後は対象の検査を実行し、実行できないものは理由を報告する。**フロントエンドにフォーマッタは
  無い** — 検査は `pnpm test`・`pnpm run check`・`pnpm run lint` である。Rust 側は持っている:
  `src-tauri/` での `cargo fmt` と、`cargo test`・`cargo clippy`。フロントエンドに置かない理由は
  decision-32。
- 明示的な依頼なしに commit、履歴改変、リモートへの push を行わない。
