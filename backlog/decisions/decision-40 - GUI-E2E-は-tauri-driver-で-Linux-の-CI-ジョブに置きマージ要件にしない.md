---
id: decision-40
title: GUI E2E は tauri-driver で Windows の CI ジョブに置きマージ要件にしない
date: '2026-08-22 03:33'
status: accepted
---
## Context

実装全体評価書 (2026-08-01) は「配布可能なデスクトップ製品として全操作が成立するとまでは今回の
証拠から判断できない」と結論しており、その根拠は **代表的な利用者操作をアプリ全体で通す経路が
1 本も無いこと**である。この木が持つ検査は 2 層あり、どちらもその主張をしない。`cargo test` は
IPC 境界の下で止まり、component テストは Svelte の `mount` で止まる — 実 WebView も、実 Rust
コマンドも、実 Backlog CLI も、実 アプリ設定ディレクトリ も、どの層にも入っていない。

### 実測基準版

Backlog CLI v1.50.1、`tauri-driver` 2.0.6、GitHub Actions の windows-latest (Windows 2025) と
ubuntu-24.04 の runner image。以下の本文は版を名乗らない。

### 実測 (2026-08-22)

- **`tauri-driver` は macOS 非対応である。** `src/main.rs` は
  `cfg(not(any(target_os = "linux", windows)))` の側に `tauri-driver is not supported on this platform`
  を出して exit 1 する `main` を持つ。macOS 上で 2.0.6 を release ビルドし (17.17 秒、成功)、
  実行してその 1 行と終了状態 1 を確認した。**未測定ではない。そして「不可能」でもない** — 非対応
  なのは `tauri-driver` であって、macOS の WKWebView を自動操作する手段一般ではない (README 自身が
  Appium Mac2 Driver を Todo として挙げている)。
- **走らせられるのは Linux (`WebKitWebDriver`) と Windows (`msedgedriver.exe`) の 2 つだけである。**
  どちらを起こすかは `webdriver.rs` の `DRIVER_BINARY` が `cfg` で決める。
- **windows-latest は WebView も自動操作する手段も image に持っている。** Microsoft Edge Driver が
  同梱され、その置き場を `EDGEWEBDRIVER` が名乗る (image の Readme。PATH には入らない)。
  **追加で `apt-get` に相当するものは 1 つも要らない。**
- **ubuntu-24.04 は xvfb を持つが、それだけでは足りない。** crate をリンクする前に WebView の
  開発パッケージを入れなければならず、その一覧は decision-33 §3 が 3 箇所目を拒んだ当のものである。
- **登録フォームの 3 欄はすべて `<input type="text">` を持つ。** OS のフォルダ選択ダイアログを
  通さずにパスを打てるので、WebDriver が操作できない部品が経路上に無い。
- **`backlog init --defaults --no-git --agent-instructions none` と `backlog task create` は完全に
  非対話である。** 試験用の Backlog ルートを CLI 呼び出しだけで組める。
- **前段と後始末は macOS 上で通しで測った** (2026-08-22)。実行ファイルの解決、CLI 呼び出しだけで
  組む fixture、アプリ設定ディレクトリ の 3 ファイルの退避、`tauri-driver` が非対応で終わることの
  検出、そして `finally` での復元と fixture の削除まで走る。**復元後の 3 ファイルは実行前と
  バイト同一だった** (shasum で照合)。**この木で E2E のうち macOS が実行できるのはここまでで、
  経路そのもの (登録以降) は 1 度も走っていない。**
- **死んだ実行が残した退避を拒む枝も測った。** 拒否は 1 つも動かす前に起きる — 移動の途中で拒むと、
  拒否より前のファイルは動いたまま、それを戻す呼び出しを誰も持っていない状態になる (呼び出し側の
  `finally` はまだ始まっていない)。**初版はその順序で書かれており、この実測が直させた。**
- **経路上の選択子 13 本を、本物の `App.svelte` を実 WebKit に載せて確かめた** (偽 IPC 境界の上、
  playwright)。うち 1 本 (本文の 整形表示 を指すもの) が誤っており、実測で直した。**保存 の控えは
  編集前に `aria-disabled="true"`、1 文字打つと `"false"` になる** ので、待つ対象として意味がある。

## Decision

1. **`tauri-driver` を採る。** WebDriver 中間ノードとして native driver を起こし、`tauri:options`
   の `application` に渡された実行ファイルを WebView ごと立ち上げる。**Cargo.toml には入れない** —
   Rust の API を持たない単体のバイナリなので、依存として書けるものが何も無い。`cargo install` する。
2. **通す 1 本は 登録 → スイムレーン表示 → タスク詳細 → 編集保存 → アプリの再起動 とする。**
   `scripts/e2e/run.mjs` がこの順に押す。
3. **最後の段はアプリの再起動であって、doc-9 の 再読み込み ではない。** AC #2 の「再読込」を
   doc-9 の語の略記として読まない。**主張したいのは「台帳の項と編集の結果がプロセスを跨いで残る」
   ことで、起動したままの読み直しはそれを一度も述べない。** 在アプリの 再読み込み は本経路に
   入れていない。
4. **出荷形で走らせる。** `pnpm run build` と `cargo build --release` が作る実行ファイルを渡す —
   バンドルは作らない。フロントエンドの資産は実行ファイルに埋め込まれ、`tauri.conf.json` の CSP が
   現に効く。**decision-28 が「CSP が効くのは出荷形だけである」と書いた条件を、この経路は満たす。**
5. **置き場は `.github/workflows/ci.yml` の job `e2e (windows-latest)` とし、マージ要件の検査には
   しない。** ruleset `main` が名指しする 3 つは `frontend`・`rust (macos-latest)`・
   `rust (windows-latest)` のままで、ruleset には触らない。**decision-33 の Consequences が
   「job の `name` と ruleset の文字列が結びついている」と書いているので、結びついていないことを
   ここに書く。**
6. **WebDriver クライアントを依存で持たない。** `scripts/e2e/webdriver.mjs` が `fetch` で W3C の
   エンドポイントを直接叩く。**読み取りは `executeScript`、押下と入力だけが要素ハンドルを取る** —
   Svelte 5 は状態が動くとノードを差し替えるので、読むために取ったハンドルは stale になるのを待って
   いるようなものである。押下と入力には代わりが無い (実イベントが要る)。
7. **アプリ設定ディレクトリ の 3 ファイルは退避して戻す** (`projects.toml`・`settings.toml`・
   `.window-state.json`)。**Windows では設定ディレクトリを差し替えられない** — `dirs::config_dir()` は
   `SHGetKnownFolderPath` を呼び、`APPDATA` を読まない。**死んだ実行が残した退避は上書きせず拒む** —
   2 回目の空の台帳が退避になり、本物が消えるため。
8. **Backlog CLI は `npm install -g backlog.md` で入れ、版を書かない。** README が読者に渡す行が
   これで、decision-27 §7 が版リテラルを置かない理由もこれである。

### 採らなかったもの

- **Linux の CI ジョブを採らない。** WebKitGTK は macOS の WKWebView と同系なので実機への近さでは
  一番だが、**WebView の開発パッケージの apt 一覧が README・`release.yml` に続く 3 箇所目になる。**
  decision-33 §3 がその 3 つ目を「誰も数え直さない写し」として拒んでおり、**その判断を覆すだけの
  ものを本タスクは持っていない** — Windows で通せば同じ経路が同じだけ通る。
- **手元だけで走らせる案を採らない。** CI の時間を 1 秒も足さない代わりに、安全網が動くのは誰かが
  思い出したときだけになる。**そして決定的なのは、この作業機が macOS だということである** — 手元
  実行に寄せると、一度も実行されていない試験を提出することになり、「新しいテストは修正を外して
  落ちることを確かめてから出す」を満たせない。**CI がこの E2E を実行できる唯一の場所である。**
- **`editor.rs` の `Launcher` を差し替えて 既定ブラウザ起動 を経路に入れる案を採らない**
  (decision-25 の 後続への影響 が示していた形)。差し替えるには出荷するバイナリに試験専用の分岐が
  要る。**外部プロセスを起こさないための分岐を製品側へ入れる取引は、通る経路 1 つに見合わない。**
  同 decision の当該項は本 PR で事実へ書き換えた。
- **添付画像 を 1 枚通す案を、初版では採らない** (decision-28 が「入れられる」と書いた形)。
  `img-src blob:` が出荷形でしか効かないのは本経路と同じ条件なので、後から足せる。**初版が通す
  ものを AC #2 の 1 本に留める** — 一度も走らせていない経路を長くすると、最初の失敗が何のもので
  あるかを読み分けられない。
- **`webdriverio` を devDependency として入れる案を採らない。** AC #4 は本番依存だけを禁じるので
  形式上は通るが、この suite が呼ぶのは 9 つのエンドポイントである。**`src/lib/render.ts` が
  testing library を入れずに component テストの全ハーネスになっているのと同じ判断。**
- **`pnpm test` に足さない。** Vitest を通らないうえ、macOS では走らない。**毎セッションの検証は
  `pnpm test`・`pnpm run check`・`pnpm run lint` の 3 本のままである** — ここへ足すと、この作業機で
  守れない規則になる。

## Consequences

- **macOS の実機に一番近い engine は、この経路では一度も動かない。** Windows が使うのは WebView2
  (Chromium) で、macOS の WKWebView とは別系統である。**WebKit 側で起きる不具合はこの job では
  捕まらない**。捕まえているのは借り物 playwright の WebKit ハーネスと、オーナーの目視である。
- **この job が赤でも PR はマージできる。** 意図である。WebView2 や Edge Driver は image ごと
  更新され、その日の更新で赤くなったものが、それを起こしていない PR を止めることは無い。
  **代わりに、赤を読む人が要る** — マージ要件でない検査は、誰も見なければ何も述べていないのと同じ
  である。
- **`e2e (windows-latest)` という job 名は、いまはどの ruleset にも縛られていない。** 将来
  マージ要件にするなら ruleset 側にこの文字列を足す (decision-33 の Consequences と同じ結びつき)。
- **1 度の PR につき release ビルドが 1 回増える。** `Swatinem/rust-cache` が効くので依存の
  再コンパイルは初回だけだが、crate 自身のビルドと `cargo install tauri-driver` は毎回走る。
- **`npm install -g backlog.md` が版を固定しないので、CLI の非互換な変更はこの job が最初に赤で
  述べる。** 固定より情報が多い側を採った。**AGENTS.md Toolchain の npm 禁止はこの木の lockfile
  についての規則で、グローバル導入はこの木に何も書かない。**
- **未測定のものが 2 つある。** **この job は GitHub の runner 上でまだ 1 度も走っていない** —
  選択子 13 本・fixture 生成・退避と復元・`tauri-driver` の macOS 非対応は測ったが、**`tauri-driver`
  が windows-latest の Edge Driver で Atlas の窓を開き、経路が最後まで通るところは測っていない。**
  最初の PR がそれを確かめる場である (decision-33 の初回と同じ形)。そして **Linux
  (`WebKitWebDriver`) でこの suite が通るかも測っていない** — `environment.mjs` は Linux の設定
  ディレクトリを解決するが、走らせてはいない。

## 後続への影響

- **TASK-92 (App.svelte の controller 分割)・TASK-106 (TaskDetail・ProjectDetail の分割)・TASK-107**
  は、この経路を安全網として持つ。**分割で選択子が動いたらこの job が赤になる** —
  `scripts/e2e/run.mjs` の先頭に選択子が定数で並んでいるので、直す場所は 1 か所である。
  **選択子を「壊れたから緩める」方向へ直さない** — `aside.detail` を `*` にすれば緑になるが、
  そのとき経路は何も述べていない。
- **TASK-108 (ファイル監視の実 OS 通知)** は「どの環境で通したか」を成果とするタスクで、本決定と
  同じ問いを持つ。**本決定は監視を経路に入れていない**ので、あちらの判断をここへ預けていない。
- **添付画像 と 既定ブラウザ起動 を経路へ足すのは、別タスクとして起票する。** どちらも
  「採らなかったもの」に理由が書いてあり、**理由は「不要」ではなく「初版の長さ」と「製品側の
  分岐」である** — 覆すなら、そこを覆す。
