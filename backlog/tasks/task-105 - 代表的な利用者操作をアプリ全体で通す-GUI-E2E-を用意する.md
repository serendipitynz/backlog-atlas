---
id: TASK-105
title: 代表的な利用者操作をアプリ全体で通す GUI E2E を用意する
status: In Review
assignee: []
created_date: '2026-08-01 00:44'
updated_date: '2026-08-22 03:40'
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
- [ ] #1 tauri-driver または同等の手段で Tauri アプリを起動し操作できる
- [ ] #2 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 の 1 本が自動で通る
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
  押下と入力だけが要素ハンドルを取る (Svelte 5 はノードを差し替えるので、読むために取ったハンドルは
  stale になる)。
- `environment.mjs` — fixture の Backlog ルートを CLI 呼び出しだけで組み、アプリ設定ディレクトリ の
  3 ファイルを退避して戻し、`tauri-driver` を起こす。
- `run.mjs` — 経路そのもの。選択子は先頭に定数で並べてある。
- `.github/workflows/ci.yml` — job `e2e (windows-latest)` を追加。**マージ要件にはしていない。**

## 実測 (2026-08-22、この macOS 機)

- **`tauri-driver` 2.0.6 は macOS 非対応。** `src/main.rs` の
  `cfg(not(any(target_os = "linux", windows)))` 側の `main` が
  `tauri-driver is not supported on this platform` を出して exit 1 する。release ビルドは 17.17 秒で
  成功し、実行してその 1 行と終了状態 1 を確認した。**未測定ではなく非対応であり、「不可能」でもない**
  (README 自身が macOS を Appium Mac2 Driver の Todo として挙げている)。**対応順の 実? 印は 実 に確定。**
- **windows-latest (Windows 2025) の image は Microsoft Edge Driver を同梱**し、置き場を
  `EDGEWEBDRIVER` が名乗る (PATH には入らないのでワークフローが明示で渡す)。**WebView のために
  入れるものが 1 つも無い**ので、decision-33 §3 が拒んだ apt 一覧の 3 箇所目が要らない。
- **ubuntu-24.04 は xvfb を持つが、crate をリンクする前に WebView 開発パッケージが要る** —
  Linux ジョブを採らなかった理由。
- **経路上の選択子 13 本を、本物の `App.svelte` を実 WebKit に載せて確かめた** (偽 IPC 境界の上、
  借り物 playwright)。**1 本が誤っており実測が直した** — 本文の 整形表示 を指す選択子は
  `.body` ではなく `.body-block` の下にある。**保存 の控えは編集前 `aria-disabled="true"`、
  1 文字打つと `"false"`** なので、待つ対象として意味がある。
- **前段と後始末を macOS 上で通しで測った。** 実行ファイルの解決 → fixture 生成 → 3 ファイルの退避
  → `tauri-driver` の非対応検出 → `finally` での復元と fixture 削除まで走り、**復元後の 3 ファイルは
  実行前とバイト同一だった** (shasum で照合)。
- **その通しが欠陥を 1 件出した。** 退避は移動の途中で拒んでおり、2 つ目のファイルに古い退避が
  あると 1 つ目は動いたまま、戻す呼び出しを誰も持っていない状態になっていた (呼び出し側の `finally`
  はまだ始まっていない)。**全部を先に検査してから動かす形に直し、その枝を実際に踏んで
  「1 つも動いていない」ことを確かめた。**

## 通していないもの

- **既定ブラウザ起動 は経路に入れていない。** decision-25 の 後続への影響 が `Launcher` の差し替えを
  示していたが、差し替えは出荷するバイナリに試験専用の分岐を足すことになる。**同 decision の当該項は
  本 PR で事実へ書き換えた** (整形表示 は通し、既定ブラウザ起動 は通していない)。
- **添付画像 の 1 枚 (decision-28 が「入れられる」と書いた形) は初版に入れていない。** 後から足せる。
- **在アプリの 再読み込み (doc-9) は通していない。** 最後の段はアプリの再起動である。

## AC の状態

- **#3・#4 は満たしている。** #3 は decision-40。#4 は `package.json` の `dependencies` と
  `Cargo.toml` の `[dependencies]` がどちらも無変更 (`tauri-driver` は `cargo install`、WebDriver
  クライアントは自前で `fetch` のみ)。
- **#1・#2 は CI の初回実行が決める。** この作業機は macOS なので、経路そのもの (登録以降) は
  1 度も走っていない。**緑を見てからチェックする。**
<!-- SECTION:NOTES:END -->
