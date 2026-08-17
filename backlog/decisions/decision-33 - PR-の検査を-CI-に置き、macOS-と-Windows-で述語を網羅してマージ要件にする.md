---
id: decision-33
title: PR の検査を CI に置き、macOS と Windows で述語を網羅してマージ要件にする
date: '2026-08-14 22:19'
status: accepted
---
## Context

**このリポジトリには CI が無かった。** `.github/workflows/` にあるのは `release.yml` だけで、それは
`v*` タグに対して 3 プラットフォームのバンドルを作り、署名シークレット・タグとマニフェストの一致・
第三者通知の同梱を検査する。**コードそのものを見る段は 1 つも無い** — `pnpm test`・
`pnpm run check`・`pnpm run lint`・`cargo test`・`cargo fmt`・`cargo clippy` はいずれも手で
走らせるしかなかった。decision-32 が Biome を入れたときも、その最後の項がこの穴を名指ししたまま
「別に判断する」で終わっている。**この decision がその判断である。**

語と指示対象は本決定の対応表で本文より先に固定した。
以下で使う **CI ワークフロー**・**マージ要件の検査**・**admin の迂回**・**述語の網羅** はその表の語である。

### 実測基準版

実測は 2026-08-15 に macOS 上で行った。GitHub 側の設定は同日に API から読み書きした値である。
**GitHub のランナー上では何も測っていない** — 下の 未測定 がその別を名乗る。

### 実測 (2026-08-15)

- **リポジトリは public で、Organization 所有である。** したがって macOS・Windows のランナーも
  課金されない。ランナーの選択を費用が縛らない。
- **`cargo test` は `dist/` を必要としない。** `tauri.conf.json` の `frontendDist` は `../dist` を
  指し、それは git 管理外なので新しい checkout には無い。その状態で `cargo check` も `cargo test` も
  通った（**412 passed / 4 ignored**）。`tauri-build` がその存在を要求するのはバンドルを作る
  ビルドだけである。
- **`cargo fmt --check` と `cargo clippy --all-targets -- -D warnings` は現状のまま通る。**
  つまりこの 2 つを要件にするために直すコードが無い。
- **OS 条件付きコンパイル述語は 7 種類ある。** `unix` が 12、`target_os = "windows"` が 9、
  `windows` が 8、`any(target_os = "windows", test)` が 3、`not(target_os = "windows")` が 2、
  `target_os = "macos"` が 1、`not(any(target_os = "macos", target_os = "windows"))` が 1。
  **`target_os = "linux"` は 1 つも無い。**
- **Linux 専用にコンパイルされる行は 1 行である。** `editor.rs` の `Platform::current` の
  `not(any(...))` の腕、`return Platform::Freedesktop;` がそれで、**その腕が選ぶ値の挙動は
  `Platform::ALL` が全プラットフォームのテストに載せている。**
- **既存の ruleset は 1 つあり、無効だった。** default branch を対象に `deletion` と
  `non_fast_forward` を持ち、`enforcement` は `disabled` である。
- **`markdown-figure.component.test.ts` の断続的失敗は遅さではない。** decision-25 が mermaid を
  `drawFigures` の中の**動的** import にしているため、mermaid を読み込む費用がまるごとテスト自身の
  予算に乗る。単独で走らせると 5 回とも 1 秒前後で、全体実行 6 回でも落ちなかったが、機械が他の
  仕事をしている間の全体実行では Vitest 既定の 5000ms を超えた。

## Decision

1. **`.github/workflows/ci.yml` を新設する。** `pull_request` と `main` への `push` で走る。
   後者は前者の重複ではない — **admin の迂回を残す以上、検査を通っていない `main` があり得る**ので、
   それを `main` の上で述べる段が要る。
2. **ジョブは 2 つとする。** `frontend` は ubuntu で `pnpm run lint`・`pnpm run check`・`pnpm test`・
   `pnpm run build` を、**段を分けて**（どれが落ちたかをログを開かずに読めるように）実行する。
   `rust` は `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test` を実行する。
3. **`rust` は macOS と Windows で走らせ、Linux では走らせない。** 理由は 2 つあり、2 つ目が
   効いている。**述語の網羅** — 上の 7 種類のうち 6 種類はこの 2 つのどちらかがコンパイルし、
   Linux が足すのは 1 つの `return` である。**そして Linux のランナーは、crate をリンクする前に
   WebView の開発パッケージを `apt-get install` しなければならず、その一覧は既に
   README の "Building from source" と `release.yml` の 2 箇所に在る**（AGENTS.md Toolchain が
   両方を一緒に変えろと定めている）。**ここに書けば 3 箇所目になり、その 3 つ目が誰も数え直さない
   写しになる。** Linux のバンドルは従来どおり `v*` タグで作られる。
4. **`rust` に Node を入れない。** `cargo test` が `dist/` を要らないことを測ったので、
   何も読まないディレクトリを作るためにフロントエンドのツールチェーンを積むと、このジョブは
   おおむね倍になる。
5. **ruleset `main` を有効にし、3 つの status check をマージ要件の検査とする。**
   `frontend`・`rust (macos-latest)`・`rust (windows-latest)` である。**既存の `deletion` と
   `non_fast_forward` はそのまま残す。**
6. **`pull_request` ルールは足さない。** 要件にするのは検査であって、PR を作ること自体ではない。
   **AGENTS.md Task state は「Done は PR マージ後、default branch で」と定めており、
   `chore(backlog): mark TASK-N done` のような commit は main へ直接入る。**
7. **admin の迂回を置く。** repository admin（`RepositoryRole` 5）が `always` で迂回できる。
   6 と同じ理由に加え、**ワークフロー自身が壊れて検査が報告されなくなったとき、それを直す PR を
   マージする手段が要る** — 迂回が無いと、検査を直す変更を検査が阻む状態になる。
8. **`markdown-figure.component.test.ts` のために component プロジェクトの `testTimeout` を
   30 秒に上げる。** マージ要件にする以上、2 コアのランナーで無関係に止まるものを残せない。
   **この木のどのテストも経過時間を assert しない**ので、タイムアウトはハングに対する番人でしか
   なく、上げても失われる主張が無い。**これは m-3 TASK-150 を閉じない** — 動的 import の費用が
   テストの予算に乗るという構造はそのままである。

### 採らなかったもの

- **`release.yml` に検査を足さない。** AGENTS.md が「It does not run `pnpm test`」を理由つきで
  記録しており、そこは変えない。**検査は PR で走り、タグはその後に来る。**
- **Linux の依存一覧を composite action に切り出して 3 つの workflow で共有する案を採らない。**
  一覧の置き場を 2 箇所に保てる唯一の道ではあるが、**`release.yml` を書き換えることになり、
  その正しさはタグを打つまで確かめられない。** 1 行の `return` のために、確かめられない変更を
  リリース経路へ入れる取引は割に合わない。
- **Rust の toolchain を固定しない。decision-32 §4 が Biome を厳密固定したのと逆であり、
  その非対称は承知のうえである。** `dtolnay/rust-toolchain@stable` はジョブが走る日の stable に
  解決されるので、clippy か rustfmt のリリース 1 つで、誰も触っていないコードに対して
  マージ要件が 2 つとも赤になり得る — **この decision の PR 自身がそれを踏んだ**（手元 1.96.0 に
  対しランナー 1.97.1、`question_mark` が両ランナーで 1 件）。それでも固定しないのは、
  **固定する範囲がここだけでは済まないから**である。`release.yml` も `@stable` を使い、
  リポジトリに `rust-toolchain.toml` は無い。CI だけを固定すると、**マージ要件が通す版と
  リリースが実際にビルドする版が別物になる** — 出荷するバンドルを検査していない状態であり、
  ずれた lint より悪い。Biome にこの問題が無いのは、それが `package.json` の 1 行で、
  リリース経路がそれを読まないためである。**代わりに 2 つ置いた**: admin の迂回（版が上がった
  直後の PR を止め続けない）と、AGENTS の 継続的インテグレーション 節の註（手元の版をランナーに
  合わせる手順）。**固定するとしたら `release.yml` と一緒であり、それはこの decision の範囲外である。**
- **`strict_required_status_checks_policy` を有効にしない。** 有効にすると main が動くたびに
  PR の再 rebase を求める。**1 人で回すリポジトリでは、防いでいるものより摩擦のほうが大きい。**
- **必須レビューを足さない。** 所有者は自分の PR をマージする。ユーザー設定の Pull requests &
  reviews が、承認は bot 名義か所有者の判断であり、マージは所有者のものだと定めている。

## Consequences

- **検査を通っていない `main` があり得る。** admin の迂回は、忘れられる迂回ではなく**意図した
  逃げ道**である。それがあるので `push: [main]` の実行が要り、迂回した結果は `main` の上に
  赤として残る。
- **Linux 固有のコンパイルエラーは PR では捕まらない。** 捕まるのはタグを打ったときで、
  `release.yml` の Linux ジョブがそれを行う。**現状の Linux 専用の行は 1 行なので、この穴の
  大きさはそれと等しい** — `src-tauri/src` に `target_os = "linux"` の分岐が増えたら、この
  判断は測り直す対象になる。
- **`pnpm install --frozen-lockfile` により、package.json だけを編集した PR は落ちる。**
  lockfile を再生成せずに依存を触れないということであり、これは意図である。
- **ワークフローのファイル名と job の `name` が、ruleset が名指しした文字列と結びついている。**
  `rust` の job 名は `rust (${{ matrix.platform }})` で、matrix から `rust (macos-latest)` と
  `rust (windows-latest)` に展開される。**job の名前を変えると、ruleset の側は古い名前を待ち
  続け、PR は永久に緑にならない**（迂回で開けはする）。名前を変えるなら ruleset も一緒に変える。
- **`component` プロジェクトのタイムアウトが 30 秒になったので、本当にハングしたテストは
  30 秒かけて落ちる。** 6 ファイルしかない側なので全体の待ち時間には効かない。
- **未測定のものが 3 つある。** **ワークフローは GitHub のランナー上でまだ 1 度も走っていない** —
  ローカルでは 4 つの段すべてが通るが、それは同じことではない。**`cargo test` が Windows でも
  `dist/` 無しで通るかを測っていない**（macOS でのみ測った。同じ Rust のコードが決めるので通る
  はずだが、測ってはいない）。**ruleset が名指しした 3 つの文字列が、実際に報告される check の
  名前と一致するかを測っていない** — 最初の PR がそれを確かめる場であり、ずれていれば ruleset の
  側を直す。
