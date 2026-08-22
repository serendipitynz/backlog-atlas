---
id: doc-13
title: タグから利用者が受け取る資産までの配布層 設計
type: specification
created_date: '2026-08-18 23:59'
updated_date: '2026-08-22 04:08'
---
# タグから利用者が受け取る資産までの配布層 設計

本書は **配布層** の正本である。**配布層** とは、版のタグを付けてから利用者が資産を受け取るまでの
範囲にある決まりごとの集合を指す。前提は decision-7・decision-26（Backlog CLI の sidecar を同梱しない）・
decision-30（自己更新を持たず、版の告知を README と GitHub Releases に置く）・decision-39（第三者依存の
ライセンス通知の作り方）。用語は [doc-1](doc-1) に従う。

**doc-1〜12 は画面と読み書き層の設計で、この層を扱っていない。** 本書が新設されるまで正本は
`AGENTS.md` の Release 節が兼ねており、リリースの回にしか使わない知識が毎セッション読まれていた
（TASK-193）。

**AGENTS 和英が Release 節に残しているのは本書への案内と、本書の規則のうち 4 つだけである。** 残す条件は
1 つで、**リリース以外を契機に破られ、かつ破られる場所にその旨を書けない規則であることだ。** JSON の
設定にコメントは書けず、README に無い節は何も述べない。**4 つは §2 の実装状況節の禁止・§5 の
`copyright` と LICENSE の対・§5 の About パネルのアイコン・§6 の署名名義である。** どれも本書の中身を
述べておらず、**5 つ目を足すときはこの条件で判定する。** 契機がリリースの側にある規則は本書にだけ置く —
ASCII 制約が AGENTS に無いのは、`src-tauri/Cargo.toml` がそれを縛る行の直上で述べているからである。

## 1. 範囲

配布層に属するのは次のものが定めている決まりごとである。

- `.github/workflows/release.yml` と `.github/release.yml`
- `scripts/generate-third-party-licenses.mjs` と `scripts/spdx/`
- `scripts/macos-sign-build.sh`・`scripts/macos-verify-gatekeeper.sh`・`scripts/setup-ci-signing-secrets.sh`
- `src-tauri/tauri.conf.json` の `bundle`、および `src-tauri/Cargo.toml` の `description`
- `.gitattributes` と `THIRD-PARTY-LICENSES.txt`
- `README.md`・`README.ja.md` のうち、読者が行動に移す主張（何を入れるか・何が動かすか・新しい版がどう届くか）

**`.github/workflows/ci.yml` は配布層ではない。** あれは Pull Request を検査するもので資産を作らない
（decision-33）。**両者は別物であり、`release.yml` はコードを 1 行も検査しない。**

## 2. リリースの前に読み直すもの

**タグを付ける前に `README.md` と `README.ja.md` を、出そうとしているビルドと突き合わせて読む。
そして 2 つを並べて読む。** 片方の言語にだけ当てた修正を捕まえるのがこの手順の目的である。

古びるのは、実測値か、後から見直しうる判断に紐づいた主張である — 対応プラットフォームと Linux の下限、
Backlog CLI の最低版、アプリが自分で更新するかどうか、機能一覧がアプリにできると述べていること。

**README は実装状況の節を持たず、書き戻さない（TASK-90）。** 作業がどこまで進んだかは `backlog/tasks/`
にあり、設計がなぜそうなっているかは `backlog/decisions/` にある。README の状況一覧はその両方の 2 つ目の
写しになり、何も失敗しないままリリースの間に古びる。**上の突き合わせが見るのは読者が行動に移す主張であって、
進捗報告ではない。**

## 3. リリースの作り方

`.github/workflows/release.yml` が `v*` のタグ（push されたもの、または Actions タブから渡したもの）に
対して 3 プラットフォームのバンドルを組み、**draft** の release へ添付する。release の説明文は
マージ済みの Pull Request から GitHub が生成し、`.github/release.yml` がそれを分類する。

### 3.1 タグと 4 つの版

**ビルドの前に、タグを `package.json`・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml`・
`src-tauri/Cargo.lock` の 4 つと突き合わせる。** Tauri はバンドルの名前を `tauri.conf.json` の版から作り、
ビルドは `--locked` を渡さない。**タグだけを動かすと、前の版の名前を持った資産が、ビルドが黙って書き換えた
lockfile の上に載る。**

### 3.2 draft のまま作り、公開は手作業のままにする

**draft を publish するのは手作業であり、手作業のままにする。** 説明文は先に読まれるためのもので、
ジョブが失敗したプラットフォームがあれば draft は資産を 1 つ欠いたまま残る。

**既に publish 済みのタグに対しては、ワークフローは作り直しを拒む。** draft だけを再利用する —
そうしないと、再実行が公開済みの release の資産を上書きし、手作業の公開が防いでいたことをそのまま起こす。

### 3.3 「なぜそうしてあるか」の正本は workflow 自身の註である

**`release.yml` の各手順がなぜそこにあるかは、その手順の直上の註が持つ。** 本書はそれを写さない。
理由は 2 つある。

- **写しは黙って古びる。** 規則を書く場所は 1 か所にする。
- **数えられない。** `AGENTS.md` は「この workflow について 6 つは詳細ではなく決定である」と述べて 6 つを
  数え上げていたが、**2026-08-19 に数え直したところ理由を述べた註は 20 を超えており、6 つは網羅ではなかった** —
  macOS を `universal-apple-darwin` で 1 つの `.dmg` に収めること、`ubuntu-24.04` を `ubuntu-latest` に
  しないこと（バンドルは runner の glibc より古い環境で動かないので、README が述べる下限を黙って上げてしまう）、
  非 macOS の runner では `APPLE_*` を空に潰すこと（素の `${{ secrets.X }}` はすべての matrix ジョブで
  展開され、証明書とその password をビルドスクリプト全部に渡すことになる）などが漏れていた。
  **註を移さない限り、この数え上げは足すたびに偽になる。**

**註を消したり、註が述べている形を元へ戻したりする編集は、その理由を述べる。**

### 3.4 複数箇所に書いてある一覧

**同じ一覧が複数の場所にあり、1 つだけ動かすと壊れるものが 2 つある。** どちらも「1 か所にする」が
採れない理由を持っているので、動かすときは全部を対にして動かす。**置き場の数は一覧ごとに違うので、
数はここで数える。**

| 一覧 | 置き場 | 1 か所にできない理由 |
|---|---|---|
| Linux の apt パッケージ（**3 か所**） | README の「ソースからのビルド」・`release.yml` の Linux 手順・`ci.yml` の `e2e` ジョブ | runner は散文を読める段階より前にパッケージを必要とする（AGENTS のツールチェーン節が持つ）。**3 か所目は TASK-105 が足した** — GUI E2E は Linux でしか走れず（decision-40）、その runner も crate をリンクする前に同じ一覧を要る。**`e2e` だけが `webkit2gtk-driver` と `xvfb` を余分に入れる**ので、行ごとの比較はそこで終わる |
| リリースが組むトリプル | `release.yml` の matrix と `scripts/generate-third-party-licenses.mjs` の `TARGETS` | 通知はどのバンドルにも同梱されるので、バンドルを 1 つ足しても `TARGETS` を足さないまま何も落ちない（decision-39 §3） |

**Linux だけの手順は matrix の `linux` 印で条件を書き、runner のラベルで書かない。** Linux の行が 2 つ
あるので、片方のラベルを名指しした条件はもう一方のバンドルの検査を素通りさせる。**素通りした検査は、
何も読まないまま緑になった実行である。**

### 3.5 workflow の外まで届く 3 つの帰結

§3.3 が写さないと述べたのは「その手順がなぜそこにあるか」である。**次の 3 つは workflow の外に帰結を
持つので本書が持つ** — 1 つ目はリリースページを見る人が、2 つ目は次のタグを付ける回が、3 つ目は
Pull Request を出す回が読むものである。

- **リリースページに `.app.tar.gz` が無いのは欠陥ではない。** tauri-action は見つけた `.app` を
  updater の有無にかかわらず必ず archive して上げ、1 つの資産だけを外す入力を持たない
  （`bundle.targets` でも防げない — `.dmg` を組むと `.app` ができる）。自己更新が無い以上
  （decision-30）この archive を消費するものは無く、`.dmg` が同じ `.app` を運ぶので、出せば README が
  全読者に「読み飛ばせ」と言う資産をリリースページに残すことになる。**ワークフローは macOS のビルドの後に
  この資産を draft から削除する（TASK-170）。** v0.1.0 は 1 度だけ出してしまい、オーナーが 2026-08-14 に
  削除した。
- **Linux は `ubuntu-24.04` と `ubuntu-24.04-arm` の 2 行で組む（TASK-172）。** v0.1.0 は x86_64 だけを
  出し、オーナーの Linux 環境は Apple silicon 上の VM なので、あのリリースには動かせるものが 1 つも
  無かった。各 runner が自分のアーキテクチャ向けに組むので何もクロスコンパイルせず、どちらの行も
  `--target` を渡さない。**2 行の 6 資産は名前が衝突しえない** — tauri-bundler がアーキテクチャを
  すべての名前に書き込む（`.deb` は `amd64`/`arm64`、`.rpm` は `x86_64`/`aarch64`、`.AppImage` は
  `amd64`/`aarch64`。@tauri-apps/cli 2.11.4 の bundler から読み、**arm64 の Ubuntu 実機で 2026-08-16 に
  確認した** — 手元の `pnpm tauri build` がその 3 つの名前を出し、組み上がったアプリが動いた）。
  **まだ測っていないのは `ubuntu-24.04-arm` の runner そのもの、つまり apt の一覧とその上でのビルドである。**
  arm64 の資産を持つ最初のタグがこれを決める。
- **ワークフローは `pnpm test` を走らせない。** m-3 TASK-150 の断続的なコンポーネントテストのタイムアウトが、
  ビルドにない不具合でリリースをランダムに落とすからである。**テストはタグを作った Pull Request の前に
  走る** — この分担が崩れると、検査されていないタグが通る。

## 4. 第三者依存のライセンス通知

**採否は decision-39 が持つ。** `cargo-about` を採らない・生成物をコミットする・5 トリプルの和集合を
採る・`.crate` tarball から読む・本文の無い識別子で止まる、の 5 つである。本節はその手順と実測値を持つ。

**`THIRD-PARTY-LICENSES.txt` は生成物である。手で編集しない。**

### 4.1 再生成

lockfile のどちらか、`THIRD-PARTY-NOTICES.md`、`scripts/spdx/` のテキストのいずれかが動いたら、
再生成してコミットする。

```
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-darwin --target x86_64-apple-darwin \
  --target x86_64-pc-windows-msvc --target x86_64-unknown-linux-gnu \
  --target aarch64-unknown-linux-gnu
node scripts/generate-third-party-licenses.mjs
```

**生成器は冒頭で `THIRD-PARTY-NOTICES.md` を全文再現する。** Ace と Lucide はこのツリーに取り込まれていて
どちらの lockfile にも現れないので、lockfile から組んだ目録はどちらも挙げない。**1 ファイルにまとまって
いることが、その 2 つを欠いた一覧を同梱できなくしている** — 誰かが同梱時に思い出す規則ではない。

### 4.2 頭が記録する digest と `.gitattributes`

通知ファイルは、読んだ入力ひとつひとつの digest を自分の頭に記録する
（現在 9 件 — 生成器・両 lockfile・`THIRD-PARTY-NOTICES.md`・`scripts/spdx/` の 5 つのテキスト）。
`src/lib/third-party-licenses.test.ts` がそれをツリーと突き合わせ、動いたものがあれば落ちる。
**リリースワークフローも draft を作る前に同じ突き合わせをする** — バンドルはどれもこの通知を運ぶので、
古い通知は「気づいたプラットフォームの欠陥」ではなく「全資産の欠陥」だからである。

**`.gitattributes` はこの仕組みの一部であって、片付けではない。** digest はディスク上のバイトに対して
取るので、この仕組みはどの checkout も同じバイトを作ることに掛かっている。`* text=auto eol=lf` が、
Windows の既定 `core.autocrlf=true` に対してそれを与える。**これが無いと Windows の checkout は 9 つの
digest を一度に変え、しかも通知の頭を解析不能にする** — 見た目より悪く、そうなると古さの検査は空の一覧と
空の一覧を比べて通り、**全入力を読む唯一の検査が、1 つも読まないまま「何も古びていない」と答える。**
`third-party-licenses.test.ts` はいま、変換された checkout でも、解析できない頭でも落ちる。

### 4.3 本文を持たない crate

**自前の licence 本文を publish していない crate があり、`Cargo.toml` に SPDX の式だけを宣言している。**
その識別子の標準本文が `scripts/spdx/` から立て替わり、出所はそのディレクトリの README が持つ。

**2026-08-19 に数え直して 25 件で、通知の初版（2026-08-14）から 25 件だった** — `objc2` 族 9 件、
`unic` 族 5 件、`webview2-com` 族 3 件、`dlopen2` 族 2 件、`alloc-stdlib`・`block2`・`dispatch2`・
`libappindicator-sys`・`selectors`・`tauri-plugin` が各 1 件。**`AGENTS.md` はここを 19 件と書き、
族の一覧から `block2` と `dispatch2` を落としていた。書かれた時点から偽だったので、古びたのではない**
（TASK-193 が数え直した）。

### 4.4 バンドルが通知を運ぶ経路

**3 形式とも実機で運んでいることを確かめてある（TASK-159、2026-08-14）。** リリースワークフローが毎回
同じ確認をする。**経路は測る価値があった** — `tauri.conf.json` はこの 2 ファイルを `../LICENSE`・
`../THIRD-PARTY-LICENSES.txt` と、`src-tauri/` より上を指して名指ししており、どの bundler も自分で
解決しなければならず、どれかが失敗しえたからである。

| バンドル | 写しが落ちる場所 | ワークフローの読み方 |
|---|---|---|
| macOS `.app` | `Contents/Resources/` | パスを直接 |
| Linux `.deb` | `usr/lib/<productName>/` | `dpkg-deb -x` してから名前で探す |
| Windows `.msi` | `Program Files\<productName>\` | `msiexec /a` で展開してから名前で探す |

**3 つのうち 2 つはディレクトリを名指しせずファイルを探す。** そのディレクトリは製品名であり、
ワークフローに綴ると、改名が見落とす 2 つ目の置き場ができるからである。**通知はリリースに単独の資産としても
添付される。** 通知が存在すること自体はどの bundler にも依存していない。

### 4.5 数え直した値

**2026-08-19 の実測。** 5 トリプルの和集合は **353 crate** で、`--filter-platform` を外したグラフは
**443 crate** である（どちらもルートを除く）。**`AGENTS.md` は 352 と 442 を書いていた** — decision-38 が
`tauri-plugin-window-state` を足したぶんが両方に 1 ずつ乗っている。**数を書き直す回は、両方を同じ日に測る** —
片方だけ動かすと、差が縮んだのか片方が古いのかを後から区別できない。

## 5. バンドルの metadata

画面やパッケージマネージャが見せる `bundle` の 3 つの値と、それぞれを読むもの。

- **`copyright` は macOS の About パネルが印字する値である。** 同時に `.app` の
  `NSHumanReadableCopyright` と `.deb`・`.msi` の metadata へも届く。コードは関わらない —
  Tauri の既定メニューが `AboutMetadata` を config から組むので、About パネルを変える回は
  `tauri.conf.json` だけを編集する。**文言は LICENSE の 2 つ目の写しである** — 2 つのファイルは互いに
  無関係なので、対にして変える。
- **About パネルのアイコンはどこにも設定しておらず、AppKit の既定である。** Tauri の既定メニューは
  `icon: None` を渡すので、muda は `NSAboutPanelOptionApplicationIcon` を options に入れず、パネルは
  `NSApp.applicationIconImage` へ落ちる — バンドルの中ではこれが `CFBundleIconFile` を解決する。
  **バンドルされていない `pnpm tauri dev` の実行にはその落とし先になるバンドルが無いので汎用アイコンが出る。
  ビルドした `.app` は正しい（起動のしかたをオーナーが 2026-08-14 に確認、TASK-168）。**
  **dev 実行のアイコンを欠陥として挙げない。** **設定するために自前メニューを組まない** — 利用者に見えない
  差のために、Tauri 既定の Edit/View/Window/Help の構造の写しを Rust で保守することになる。
- **`category` は 1 つの値から両プラットフォームの分類を埋める。** `DeveloperTool` が macOS では
  `public.app-category.developer-tools`、Linux では `Categories=Development` になり、ランチャーが
  「その他」に入れるのをやめる。**両方ともビルド済みバンドルから読み出した（2026-08-14、TASK-163）。**
  読んだのは `.app` の `Info.plist` と、`.deb` を `dpkg-deb -x` で展開した中の `.desktop` エントリである。
  **Linux 側を測り直すには Linux の機械が要る** — macOS のビルドは `.deb` を作らないので、macOS だけで
  作業するセッションは片方しか確認できない。
- **Linux のパッケージへ届く文字は ASCII のままにする。** crate の `description` が `.deb` の control の
  `Description` と `.desktop` の `Comment` になり、そこでの escape は Desktop Entry の仕様が定める
  `\s \n \t \r \\` だけである — TASK-163 の em dash は `\u2014` という 6 文字そのままで届いた
  （バックスラッシュ・`u`・`2`・`0`・`1`・`4` の 6 文字であって、em dash その文字ではない）。
  **制約はそれが縛る行の直上、`src-tauri/Cargo.toml` に書いてある。** 同じ制約が
  `bundle.shortDescription` と `bundle.longDescription` にも掛かり、どちらも設定していない。

## 6. macOS の署名と notarization

Gatekeeper の警告なしに開く macOS のビルドは、**Developer ID Application** の証明書で署名し、Apple の
notarization を通さなければならない。**Tauri は資格情報が環境にあれば両方を行い、無ければ署名なしの
バンドルを作る。** そのため `pnpm tauri build` と README の「ソースからのビルド」はどれも必要としない。

- **署名して組む** — `.env.signing`（git 管理外。`.env.signing.example` を写して埋める）を用意して
  `./scripts/macos-sign-build.sh` を走らせる。引数は `pnpm tauri build` へ渡る。
- **結果を確かめる** — `./scripts/macos-verify-gatekeeper.sh`。組み上がったバンドルに対しても、
  渡したパス（GitHub から落としたリリース資産を含む）に対しても走る。
- **CI** — `./scripts/setup-ci-signing-secrets.sh path/to/DeveloperID.p12` が macOS の runner に要る
  6 つのリポジトリシークレットを、値を 1 つも印字せずに登録する。`APPLE_CERTIFICATE`（.p12 の base64）・
  `APPLE_CERTIFICATE_PASSWORD`・`APPLE_SIGNING_IDENTITY`・`APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`。

**6 つが未登録のときワークフローはビルドを拒む。** 拒むのは draft を作るジョブの中なので、資産が 1 つも
できないうちに実行が止まる。**署名なしの macOS バンドルは、無いよりも悪い** — Gatekeeper が撥ねるのに、
利用者はその時点で既にダウンロードを終えている。

**証明書と Apple ID はオーナーの資産である。** リポジトリは資格情報を 1 つも持たず、エージェントは
生成も登録もしない。

**署名の名義は著作権者を名乗っておらず、それは意図されたものである。** 証明書は
`Developer ID Application: Yoko Otani (9EYB4D9GGQ)` なので Gatekeeper と `codesign` は "Yoko Otani" を
見せるが、LICENSE は "Takuya Otani / SerendipityNZ Ltd." と述べ、識別子は
`com.serendipitynz.backlog-atlas` である。**経緯によるもので、変える作業に見合わないとオーナーが
2026-08-14 に確認した。欠陥として挙げない。**

**Tauri は `.app` を notarize するが、それを包む `.dmg` はしない。** そのため利用者がダウンロードする
ディスクイメージは撥ねられる。`macos-sign-build.sh` が、組み上がった `.dmg` を後から notarize して
staple する。**リリースワークフローも同じことを自分で行い、tauri-action が上げた資産を置き換える。**
（@tauri-apps/cli 2.11.4 で実測: CLI は `bundle_dmg.sh` を駆動し、あのスクリプトは `--notarize` を
受け付けるが、CLI が渡す引数の並びにそれが無い。）

**`APPLE_SIGNING_IDENTITY` は手元と CI で同じ値ではない。** 手元の署名は証明書の SHA-1 ハッシュを
受け付けるが、runner は証明書を import して common name を文字列一致させるので、CI にはその名前が要る。
`setup-ci-signing-secrets.sh` は `.env.signing` を写さず .p12 から導く。
