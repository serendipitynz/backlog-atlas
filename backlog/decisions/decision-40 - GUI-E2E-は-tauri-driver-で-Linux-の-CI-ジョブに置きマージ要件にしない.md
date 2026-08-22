---
id: decision-40
title: GUI E2E は tauri-driver で Linux の CI ジョブに置きマージ要件にしない
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

Backlog CLI v1.50.1、`tauri-driver` 2.0.6、`wry` 0.55.1、`tauri-runtime-wry` 2.11.4、
GitHub Actions の windows-latest (Windows 2025) と ubuntu-24.04 の runner image。
以下の本文は版を名乗らない。

### 実測 (2026-08-22)

**走らせられる場所についての実測が 3 つあり、順に効いている。**

- **`tauri-driver` は macOS 非対応である。** `src/main.rs` は
  `cfg(not(any(target_os = "linux", windows)))` の側に `tauri-driver is not supported on this platform`
  を出して exit 1 する `main` を持つ。macOS 上で 2.0.6 を release ビルドし (17.17 秒、成功)、
  実行してその 1 行と終了状態 1 を確認した。**未測定ではない。そして「不可能」でもない** — 非対応
  なのは `tauri-driver` であって、macOS の WKWebView を自動操作する手段一般ではない (README 自身が
  Appium Mac2 Driver を Todo として挙げている)。
- **`tauri-driver` の Windows 対応は、Tauri アプリには届かない。** README は Linux と Windows を
  対応と挙げ、`webdriver.rs` は Windows で `msedgedriver.exe` を起こす。**しかし WebView2 は
  デバッグポートを開かない。** 経路は 2 つとも塞がっている:
  - Tauri は `TAURI_WEBVIEW_AUTOMATION=true` を読んで `WebContext::set_allows_automation` を呼ぶ
    (`tauri-runtime-wry/src/lib.rs`)。**その実装を持つのは wry の webkitgtk だけで**
    (`webkitgtk/mod.rs` の `is_controlled_by_automation`)、**非 GTK は空の既定実装である**
    (`wry/src/web_context.rs` の `WebContextImpl::set_allows_automation`)。wry の `webview2`
    モジュールには `automation` の語が 1 件も無い。
  - 逃げ道の `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (msedgedriver が `--remote-debugging-port` を
    注入する経路) も効かない。**wry は常に `set_additional_browser_arguments` を自前の既定値で
    呼ぶ**ので (`webview2/mod.rs`)、環境変数は上書きされる。
  - **CI で現に確かめた。** 本リポジトリの `e2e (windows-latest)` の初回実行は、前段をすべて通した
    うえで `POST /session` だけが `500 session not created: DevToolsActivePort file doesn't exist`
    で落ちた。**版の不一致でも設定漏れでもない** — 上の 2 つから、この組合せで開くポートが無い。
- **したがって走らせられるのは Linux (`WebKitWebDriver`) だけである。** wry が自動操作を実装して
  いる唯一の engine であり、`tauri-driver` が本来想定している経路でもある。

**経路そのものについての実測。**

- **登録フォームの 3 欄はすべて `<input type="text">` を持つ。** OS のフォルダ選択ダイアログを
  通さずにパスを打てるので、WebDriver が操作できない部品が経路上に無い。
- **`backlog init --defaults --no-git --agent-instructions none` と `backlog task create` は完全に
  非対話である。** 試験用の Backlog ルートを CLI 呼び出しだけで組める。
- **経路上の選択子を、本物の `App.svelte` を実 WebKit に載せて確かめた** (偽 IPC 境界の上、
  playwright)。初版の 13 本のうち 1 本 (本文の 整形表示 を指すもの) が誤っており、実測で直した。
  **保存 の控えは編集前に `aria-disabled="true"`、1 文字打つと `"false"` になる** ので、待つ対象と
  して意味がある。
- **登録が成功してもモーダルは閉じない。** `ProjectRegister.submit` は 登録しました の notice を
  出して欄を空にするだけで、モーダルの出口は × と Escape の 2 つだけである。**初版はモーダルが
  自分で消えるのを待っており、確実にタイムアウトした** (レビュー 1R の [P1])。
- **成功の印に「問題文が無いこと」は使えない。** 欄が空に戻ると プロジェクトルートを入力してください が
  同じ `p.problem` に出る (実測: 成功直後に notice 1 件と problem 1 件が同時に立つ)。**成功は
  notice の出現だけが述べる。**

**出荷形の作り方についての実測。**

- **素の `cargo build --release` は dev バイナリを作る。** `tauri` の `build.rs` は
  `dev = !has_feature("custom-protocol")` と決めており、**その feature を渡すのは Tauri CLI だけ**
  である (実測: `pnpm tauri build --no-bundle -v` は
  `cargo build --bins --features tauri/custom-protocol --release` を実行する)。
- **その差は画面に出る。** Linux ジョブの 2 回目は、窓は開いたのに
  `Could not connect to localhost: Connection refused` を表示していた — `devUrl`
  (`http://localhost:1420`) を読みに行き、そこには何も立っていない。**捕まえたのは
  `run.mjs` の 画面を述べる診断で、それが無ければ「空台帳の入口が出ない」としか分からなかった。**
- **ファイルを見てもどちらなのかは分からない。** `strings` に `localhost:1420` は両方に出る
  (設定は常に埋め込まれる)。**だから「試して確かめる」が要り、註がコマンドを名指しする。**

**前段と後始末の実測。**

- **前段と後始末は macOS 上で通しで測った。** 実行ファイルの解決、CLI 呼び出しだけで組む fixture、
  アプリ設定ディレクトリ の 3 ファイルの退避、`tauri-driver` が非対応で終わることの検出、そして
  `finally` での復元と fixture の削除まで走る。**復元後の 3 ファイルは実行前とバイト同一だった**
  (shasum で照合)。
- **死んだ実行が残した退避を拒む枝も測った。** 拒否は 1 つも動かす前に起きる — 移動の途中で拒むと、
  拒否より前のファイルは動いたまま、それを戻す呼び出しを誰も持っていない状態になる (呼び出し側の
  `finally` はまだ始まっていない)。**初版はその順序で書かれており、この実測が直させた。**

## Decision

1. **`tauri-driver` を採る。** WebDriver 中間ノードとして `WebKitWebDriver` を起こし、
   `tauri:options` の `application` に渡された実行ファイルを WebView ごと立ち上げる。
   **Cargo.toml には入れない** — Rust の API を持たない単体のバイナリなので、依存として書けるものが
   何も無い。`cargo install` する。
2. **通す 1 本は 登録 → スイムレーン表示 → タスク詳細 → 編集保存 → アプリの再起動 とする。**
   `scripts/e2e/run.mjs` がこの順に押す。**登録の後はモーダルの × を押す** — 登録は画面を閉じない。
3. **最後の段はアプリの再起動であって、doc-9 の 再読み込み ではない。** AC #2 の「再読込」を
   doc-9 の語の略記として読まない。**主張したいのは「台帳の項と編集の結果がプロセスを跨いで残る」
   ことで、起動したままの読み直しはそれを一度も述べない。** 在アプリの 再読み込み は本経路に
   入れていない。
4. **出荷形で走らせ、その実行ファイルは `pnpm tauri build --no-bundle` が作る。**
   **`cargo build --release` では作れない** — 素の cargo release ビルドは dev バイナリになる
   (下の実測)。`--no-bundle` は実行ファイルで止まり、`beforeBuildCommand` がフロントエンドを作るので
   1 段で足りる。フロントエンドの資産は実行ファイルに埋め込まれ、`tauri.conf.json` の CSP が現に効く。
   **decision-28 が「CSP が効くのは出荷形だけである」と書いた条件を、この経路は満たす。**
   **製品が通る経路そのものを使う**のが要点である — 同じことを cargo の引数で書き直そうとしたのが、
   下の実測が捕まえた失敗そのものだった。
5. **置き場は `.github/workflows/ci.yml` の job `e2e (ubuntu-24.04)` とし、マージ要件の検査には
   しない。** `xvfb-run` で包む — `tauri-driver`・`WebKitWebDriver`・窓 はすべてその下で起き、
   同じ `DISPLAY` を要る。ruleset `main` が名指しする 3 つは `frontend`・`rust (macos-latest)`・
   `rust (windows-latest)` のままで、ruleset には触らない。**decision-33 の Consequences が
   「job の `name` と ruleset の文字列が結びついている」と書いているので、結びついていないことを
   ここに書く。**
6. **WebView の apt 一覧を 3 か所目として書くことを受け入れる。** decision-33 §3 がそれを拒んだ
   理由は取り下げない — 写しは依然として誰も数え直さない。**変わったのは天秤の反対側である。**
   §3 が 3 か所目と引き換えに買うと言っていたのは Linux 固有の `return` 1 行のコンパイルであり、
   ここで買うのは **GUI E2E が自動で走ること そのもの**である。**改訂は decision-33 の
   「Linux を外す判断の改訂」が持ち、数え直す先は doc-13 §3.4 と AGENTS 和英の ツールチェーン 節
   である。**
7. **WebDriver クライアントを依存で持たない。** `scripts/e2e/webdriver.mjs` が `fetch` で W3C の
   エンドポイントを直接叩く。**読み取りは `executeScript`、押下と入力だけが要素ハンドルを取る** —
   Svelte 5 は状態が動くとノードを差し替えるので、読むために取ったハンドルは stale になるのを待って
   いるようなものである。押下と入力には代わりが無い (実イベントが要る)。
   **準備完了の判定は `/status` の `value.ready` を読む** — `fetch` は 4xx・5xx でも解決するので、
   応答したことを準備完了と読むと、失敗は後の「セッションを作れない」として現れる。
8. **アプリ設定ディレクトリ の 3 ファイルは退避して戻す** (`projects.toml`・`settings.toml`・
   `.window-state.json`)。**死んだ実行が残した退避は上書きせず拒み、拒否は 1 つも動かす前に行う。**
   **途中の rename が失敗したら、それまでの移動を戻してから投げ直す** — どちらも、呼び出し側の
   `finally` がまだ無い時点で本物の設定が退避先に取り残されるのを防ぐためである。
9. **Backlog CLI は `npm install -g backlog.md` で入れ、版を書かない。** README が読者に渡す行が
   これで、decision-27 §7 が版リテラルを置かない理由もこれである。

### 採らなかったもの

- **Windows の CI ジョブを採らない。採れない。** 上の実測のとおり、`tauri-driver` の Windows 対応は
  Tauri アプリに届かない。**これは選択ではなく、測って消えた選択肢である。**
  **`tauri.conf.json` の `additionalBrowserArgs` に `--remote-debugging-port` を書けば通せる**
  (wry は与えられた引数を既定値の代わりに使う) が、**採らない** — 出荷する製品の設定に、
  全利用者ぶんのデバッグポートを書き込むことになる。
- **手元だけで走らせる案を採らない。** CI の時間を 1 秒も足さない代わりに、安全網が動くのは誰かが
  思い出したときだけになる。**そして決定的なのは、この作業機が macOS だということである** — 手元
  実行に寄せると、一度も実行されていない試験を提出することになり、「新しいテストは修正を外して
  落ちることを確かめてから出す」を満たせない。**CI がこの E2E を実行できる唯一の場所である。**
  オーナーの WSL Ubuntu 24 で同じコマンドが走ることは、それと両立する (AGENTS が手順を持つ)。
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

- **WebView の apt 一覧の置き場が 3 つになった。** README の「ソースからのビルド」・`release.yml` の
  Linux 手順・`ci.yml` の `e2e` ジョブ。**3 つを一緒に直す。** 数の正本は doc-13 §3.4 で、
  AGENTS 和英の ツールチェーン 節が同じ数を持つ。**`e2e` だけが `webkit2gtk-driver` と `xvfb` を
  余分に入れる**ので、行ごとの比較はそこで終わる。
- **`rust` は Linux で走らせないままである。** `e2e` が 3 か所目を作ったことで、`rust` の Linux 化は
  **4 か所目**を要求するようになった。**「`e2e` が払ったのだから `rust` も払える」と読まない。**
- **実機に一番近い engine で走ることになった。** WebKitGTK は macOS の WKWebView と同系である。
  **Windows の WebView2 (Chromium) 側で起きる不具合はこのジョブでは捕まらない** — 捕まえているのは
  借り物 playwright の Windows UA ハーネスと、オーナーの実機である。
- **この job が赤でも PR はマージできる。** 意図である。WebKitGTK やドライバは image ごと更新され、
  その日の更新で赤くなったものが、それを起こしていない PR を止めることは無い。**代わりに、赤を読む
  人が要る** — マージ要件でない検査は、誰も見なければ何も述べていないのと同じである。
- **`e2e (ubuntu-24.04)` という job 名は、いまはどの ruleset にも縛られていない。** 将来
  マージ要件にするなら ruleset 側にこの文字列を足す (decision-33 の Consequences と同じ結びつき)。
- **1 度の PR につき apt の導入と release ビルドが 1 回ずつ増える。** `Swatinem/rust-cache` が効くので
  依存の再コンパイルは初回だけだが、crate 自身のビルドと `cargo install tauri-driver` は毎回走る。
- **`npm install -g backlog.md` が版を固定しないので、CLI の非互換な変更はこの job が最初に赤で
  述べる。** 固定より情報が多い側を採った。**AGENTS.md Toolchain の npm 禁止はこの木の lockfile
  についての規則で、グローバル導入はこの木に何も書かない。**
- **経路は Linux で最後まで通った** (2026-08-22、本決定を載せた PR の `e2e (ubuntu-24.04)`)。5 段
  すべてが印字され、`✓ 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 passed` で終わっている。
  **したがってこの節にもう未測定は無い** — Windows で落ちた地点 (`POST /session`) より先も含めて全部
  踏んである。
- **保存を外すと落ちることも確かめた。** 保存の押下だけを取り除いた版を 1 回流し、
  `編集セッション to end with the new title` の待ちで落ちること、そのとき画面が編集セッションのままで
  あることを見た。**押下を戻した木は変異前とバイト同一である。** これが無ければ、この経路が緑である
  ことは「何も保っていなくても緑」と区別できない。

## 後続への影響

- **TASK-92 (App.svelte の controller 分割)・TASK-106 (TaskDetail・ProjectDetail の分割)・TASK-107**
  は、この経路を安全網として持つ。**分割で選択子が動いたらこの job が赤になる** —
  `scripts/e2e/run.mjs` の先頭に選択子が定数で並んでいるので、直す場所は 1 か所である。
  **選択子を「壊れたから緩める」方向へ直さない** — `aside.detail` を `*` にすれば緑になるが、
  そのとき経路は何も述べていない。
- **TASK-108 (ファイル監視の実 OS 通知)** は「どの環境で通したか」を成果とするタスクで、本決定と
  同じ問いを持つ。**本決定は監視を経路に入れていない**ので、あちらの判断をここへ預けていない。
  **ただし Linux のジョブが 1 つできたことは、あちらの選択肢を 1 つ増やしている。**
- **添付画像 と 既定ブラウザ起動 を経路へ足すのは、別タスクとして起票する。** どちらも
  「採らなかったもの」に理由が書いてあり、**理由は「不要」ではなく「初版の長さ」と「製品側の
  分岐」である** — 覆すなら、そこを覆す。
- **`tauri-driver` の版を上げる回は、Windows 対応が届くようになっていないかを見る。** 届くのは
  wry が非 GTK にも `set_allows_automation` を実装したときで、**上流が変わらない限りこの決定は
  変わらない。** `tauri-driver` の README だけを読んで「Windows でも走る」と書き直さない。
