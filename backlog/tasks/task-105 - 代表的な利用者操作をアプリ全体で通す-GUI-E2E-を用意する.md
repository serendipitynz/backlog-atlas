---
id: TASK-105
title: 代表的な利用者操作をアプリ全体で通す GUI E2E を用意する
status: Done
assignee: []
created_date: '2026-08-01 00:44'
updated_date: '2026-08-22 06:05'
labels:
  - test
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: medium
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
実装全体評価書は「配布可能なデスクトップ製品として全操作が成立するとまでは今回の証拠から判断できない」と結論しており、その根拠が「代表的な利用者操作をアプリ全体で通す GUI E2E」の不在である。TASK-91 が入れるコンポーネントテストは画面横断契約を非マウントの純粋関数より上で固定するもので、Tauri アプリを起動して Rust コアまで通す経路は別物である。tauri-driver と WebDriver で、プロジェクト登録 → スイムレーン表示 → タスク詳細 → 編集保存 → 再読込 までの 1 本を通す。

m-3 に置く理由: m-2 の期間は指示書の手順 3 が画面の目視確認をユーザーへ依頼する形で代替しており、公開阻害には当たらない。ただしこの代替は UI 改修 20 件ぶんの確認負担をユーザーへ載せるので、m-2 の消化中に負担が問題になった時点で m-2 へ繰り上げる判断はあり得る。

_sandbox/repository-quality-assessment-2026-08-01.md の機能性節・今回実行していない検証。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tauri-driver または同等の手段で Tauri アプリを起動し操作できる
- [x] #2 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 の 1 本が自動で通る
- [x] #3 CI で動かすか手元だけで動かすかの判断と理由が記録されている
- [x] #4 production dependency が増えていない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 何を作ったか

`scripts/e2e/` に GUI E2E を 1 本置き、`pnpm run e2e` で走る。`tauri-driver` を通して出荷形の
実行ファイルを 登録 → スイムレーン表示 → タスク詳細 → 編集保存 → アプリの再起動 の順に操作する。
判断は decision-40 が正本で、AGENTS 和英の テスト 節と 継続的インテグレーション 節が写しを持つ。

- `webdriver.mjs` — W3C WebDriver を `fetch` で叩く最小のクライアント。読み取りは `executeScript`、
  押下と入力だけが要素ハンドルを取る。
- `environment.mjs` — fixture の Backlog ルートを CLI 呼び出しだけで組み、アプリ設定ディレクトリ の
  3 ファイルを退避して戻し、`tauri-driver` を起こす。
- `run.mjs` — 経路そのもの。選択子は先頭に定数で並べてある。失敗時は画面の文言・帯・骨組みを添える。
- `.github/workflows/ci.yml` — job `e2e (ubuntu-24.04)`（`xvfb-run` 越し）。**マージ要件にはしていない。**

## 結果

**2026-08-22、`e2e (ubuntu-24.04)` で経路が最後まで通った。** 5 段すべてが印字され、
`✓ 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 passed` で終わっている
([run](https://github.com/serendipitynz/backlog-atlas/actions/runs/32553033509))。**AC #1・#2 はこれで満たした。**

**修正を外して落ちることも確かめた。** 保存の押下だけを外した版を CI に 1 回流し、
`timed out after 20000ms waiting for the 編集セッション to end with the new title` で落ちること、
そのとき画面が編集セッションのまま（Cancel・Save が立ち「There is unsaved input」が出ている）ことを
確認した。**押下を戻した木は変異前とバイト同一である**（`git diff` が空）。

## 実測 (2026-08-22)

### 走らせられる場所 — 2 段階で確定した

- **`tauri-driver` 2.0.6 は macOS 非対応。** `main.rs` の
  `cfg(not(any(target_os = "linux", windows)))` 側の `main` が
  `tauri-driver is not supported on this platform` を出して exit 1 する。ビルドして実行し確認。
- **初版は Windows の CI ジョブを置き、CI がそれを否定した。** 前段はすべて通り、`POST /session` だけが
  `500 session not created: DevToolsActivePort file doesn't exist` で落ちた。
- **原因は版でも設定でもなく上流の構造。** Tauri は `TAURI_WEBVIEW_AUTOMATION` を読んで
  `WebContext::set_allows_automation` を呼ぶが、**wry 0.55.1 でその実装を持つのは webkitgtk だけで、
  非 GTK は空の既定実装である。** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` も、wry が常に
  `set_additional_browser_arguments` を自前の既定値で呼ぶため上書きされる。
- **オーナーの判断で Linux の CI ジョブへ移した。**「不可能」とは書いていない —
  `additionalBrowserArgs` にポートを書けば通せるが、出荷する製品の設定に全利用者ぶんのデバッグ
  ポートを書くことになるので採らない。

### 出荷形の作り方

- **素の `cargo build --release` は dev バイナリを作る。** `tauri` の `build.rs` が
  `dev = !has_feature("custom-protocol")` と決めており、**その feature を渡すのは Tauri CLI だけ**
  （実測: `pnpm tauri build --no-bundle -v` が `cargo build --bins --features tauri/custom-protocol --release`
  を実行する）。**Linux ジョブの 2 回目は、窓が `Could not connect to localhost` を表示して落ちた。**
- **ファイルを見ても区別できない** — `strings` の `localhost:1420` は両方に出る（設定は常に埋め込まれる）。
  **捕まえたのは画面を述べる診断である。**

### 経路

- **選択子を本物の `App.svelte` を実 WebKit に載せて確かめた**（偽 IPC 境界の上、借り物 playwright）。
  **1 本が誤っており実測が直した** — 本文の 整形表示 は `.body` でなく `.body-block` の下。
- **登録が成功してもモーダルは閉じない**（レビュー 1R [P1]）。実測: 送信後に dialog 1・notice 1・
  **problem 1**・close 1。× を押すと dialog 0・lane-head 1。
- **成功の印に「問題文が無いこと」は使えない** — 欄が空に戻ると必須欄の問題文が同じクラスに出る。
- **要素ハンドルは W3C キーで取れないことがある。** `WebKitWebDriver` の応答で
  `element/undefined/click` になり、404 が「要素が無い」に見えていた。キー優先・単一値を次点にした。

### 前段と後始末

- **macOS 上で通しで測った**（Linux 移行後の書き直しでも再確認）。**復元後の 3 ファイルは実行前と
  バイト同一**（shasum）。
- **その通しが欠陥を 1 件出した。** 退避が移動の途中で拒んでおり、拒否より前のファイルが取り残されていた。
  全部を先に検査してから動かす形に直し、その枝を踏んで確認した。
- **rename 自体が失敗する経路も塞いだ**（レビュー 1R [P2]）。それまでの移動を戻してから投げ直す。

## 契約の変更

- **WebView の apt 一覧の置き場が 3 つになった**（README・`release.yml`・`ci.yml` の `e2e`）。
  decision-33 §3 が拒んだ「3 か所目」である。**拒んだ理由は取り下げていない** — 変わったのは天秤の
  反対側で、§3 が買うと言っていたのは Linux 固有の `return` 1 行、こちらが買うのは E2E が自動で走ること
  そのものである。**decision-33 に「Linux を外す判断の改訂」を足し、doc-13 §3.4 と AGENTS 和英を
  数え直した。`rust` は Linux で走らせないままで、その Linux 化は 4 か所目を要求する。**
- **decision-25 の 後続への影響 の当該項を事実へ書き換えた** — 整形表示 は通し、既定ブラウザ起動 は
  通していない。

## 通していないもの

- **既定ブラウザ起動**（`Launcher` の差し替えは出荷バイナリに試験専用の分岐を足すことになる）。
- **添付画像 の 1 枚**（decision-28 が「入れられる」と書いた形。後から足せる）。
- **在アプリの 再読み込み**（doc-9）。最後の段はアプリの再起動である。
- **Windows の WebView2 で起きる不具合。** engine が別系統なので、この経路では捕まらない。
<!-- SECTION:NOTES:END -->
