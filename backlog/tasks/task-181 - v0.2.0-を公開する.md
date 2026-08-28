---
id: TASK-181
title: v0.2.0 を公開する
status: Done
assignee: []
created_date: '2026-08-15 12:34'
updated_date: '2026-08-28 09:16'
labels:
  - release
  - 'kind:chore'
milestone: m-3
dependencies:
  - TASK-172
priority: high
ordinal: 172700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
m-3 の最後。m-3 の残りが片付いた時点で v0.2.0 のタグを打ち、リリースを公開する。**手順の正本は doc-13「タグから利用者が受け取る資産までの配布層 設計」である。** 2026-08-19 に TASK-193 が AGENTS 和英の「リリース」節をそこへ移し、AGENTS 側は要約を持たないポインタになった。このタスクはそれを繰り返さず、**この版に固有のもの**だけを持つ。

**TASK-172 の残り 2 件の受入条件は、この回が引き取る。** あちらは PR #125 がマージ済み・AC #3 (arm64 実機での起動) 達成済みで、**AC #1 (リリースワークフローが Linux arm64 の .deb・.rpm・.AppImage をドラフトへ載せる) と AC #2 (README 和英が Linux の対応アーキテクチャを実資産どおり述べている) だけがタグ待ち**として残っている。**この回がドラフトを見て両方をチェックし、TASK-172 を Done にする** — その 2 件は他のどの行にも属していない。

**arm64 は GitHub の `ubuntu-24.04-arm` ランナー上では未測定である。** 手元の arm64 Ubuntu 実機でのビルドと起動は 2026-08-16 に確認済みだが (TASK-172 の Implementation Notes)、**ランナーの apt 一覧とその上でのビルドはこの実行が初めて通る**。落ちるとすれば依存導入の段である。doc-13 §3.5 が同じ未測定を名指ししている。

**doc-13 が持つ実測値には測った日が入っている。** §4.5 の crate 数 (353 / 443) と §4.3 の 25 件は 2026-08-19 の値なので、**依存がその後に動いていればこの回に測り直す。**

**v0.1.0 の回 (TASK-102) との差**: リポジトリのパブリック化・トピック・_sandbox の除外は済んでいるので、この回に含まない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README.md と README.ja.md を出荷するビルドと突き合わせてある (doc-13 §2。読者が行動の根拠にする記述 — 動作環境と Linux の下限・対応アーキテクチャ・Backlog CLI の最低バージョン要件・更新の届き方・できることの一覧)
- [x] #2 タグと package.json・src-tauri/tauri.conf.json・src-tauri/Cargo.toml・src-tauri/Cargo.lock の 4 ファイルの版が一致している
- [x] #3 リリースワークフローの 5 ジョブ (macOS・Linux x86_64・Linux arm64・Windows・下書き作成) がすべて success で終わっている
- [x] #4 ドラフトの資産に Linux arm64 の .deb・.rpm・.AppImage が載っており、x86_64 のものと名前で区別できる
- [x] #5 TASK-172 の AC #1・#2 をチェックし、TASK-172 を Done にした
- [x] #6 ドラフトのリリースノートを読んだうえで、手で公開した
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## README の突き合わせ (AC #1)

**doc-13 §2 の対象 6 項目のうち、古びていたのは 更新の届き方 と できることの一覧 の 2 つである。**
README 和英に最後に手が入ったのは 2026-08-20 (TASK-195) で、**TASK-157 (2026-08-24) と TASK-83
(2026-08-28) はどちらもこのファイルを触っていない。**

- **更新の届き方**: 「自分自身を更新しない」「Releases を watch する」の 2 文だけだった。decision-44 が
  入って以降これは全部ではない — 起動ごとに 1 回照会し、☰ の印とメニュー 1 行で述べる。**照会の縮退が
  黙って何も出さない設計なので、`gh` に何が要るかを README が述べる必要がある** (`gh api` は
  パブリックリポジトリでも token を求める。decision-44 §実測)。述べないと、未認証の読者は印が無いことを
  「新しい版が無い」と読む。
- **できることの一覧**: 列間ドラッグ (TASK-81)・外部エディタで開く (TASK-83)・再起動をまたぐ引き継ぎの
  3 項目 (TASK-148・149・decision-38) が載っていなかった。**外部エディタは「Atlas が変えないこと」に
  CLI 書き込みの例外としてだけ出ていた** — 読者が「できること」を探す場所ではない。
- **古びていなかった 4 項目**: 動作環境・Linux の下限 (Ubuntu 24.04 以降。release.yml の runner と一致)・
  対応アーキテクチャ (macOS universal / Windows x64 / Linux x86_64・arm64 は matrix の 4 行と一致)・
  Backlog CLI の最低バージョン要件 (版を名乗らず、Atlas が起動時に告げると書いてある。decision-27 §7 のとおり)。

**更新 節の版リテラルは Atlas のリリースなので decision-27 §7 は掛からない** (AGENTS 動作確認済み版 節の
最終項が明示している)。v0.1.0 → v0.2.0 へ書き替えた。

## doc-13 の実測値の再測 (Description の指示)

**依存は動いていないので、doc-13 §4.5 と §4.3 の値はどちらもそのままである。** Cargo.lock に入った差分は
`backlog-atlas` 自身の版 1 行だけで、`pnpm-lock.yaml` は 2026-08-15 から動いていない。

- **5 トリプルの和集合は 353 crate** — 生成器自身の出力 (`353 cargo crates`)。
- **`--filter-platform` を外したグラフは 443 crate** — `cargo metadata` の packages 444 からルートを引いた値。
- **本文を持たない crate は 25 件** — 生成物の「standard text; this package publishes none」から crate 名を
  一意化して数えた。**族の内訳も doc-13 §4.3 のとおりである** (objc2 族 9・unic 族 5・webview2-com 族 3・
  dlopen2 族 2・alloc-stdlib・block2・dispatch2・libappindicator-sys・selectors・tauri-plugin が各 1)。

**したがって doc-13 の改訂は行っていない。**

## 検証

`pnpm test` (51 files / 1344 tests)・`pnpm run check` (0 errors)・`pnpm run lint` はすべて緑。
`src-tauri/` で `cargo fmt --check`・`cargo test` (476 passed / 8 ignored)・
`cargo clippy --all-targets -- -D warnings` も緑。

**clippy は CI の toolchain でも流した。** 作業機の既定は 1.96.0 で、`dtolnay/rust-toolchain@stable` が
いま解決するのは 1.98.0 (2026-08-18) なので、`cargo +1.98.0 clippy --all-targets -- -D warnings` と
`cargo +1.98.0 fmt --check` を別に走らせた — どちらも緑である。**TASK-178 がこの非対称で赤になった実績が
あるため。**

## タグからの後半 (2026-08-28)

**タグは `v0.2.0`、指す先は PR #158 のマージコミット `da7d212`。** オーナーが push した。

**AC #2** はリリースワークフローの `create-release` が答えた — あのジョブが 4 マニフェストとタグを
突き合わせる段と、第三者通知の古さ検査を持つ。

**AC #3: 5 ジョブすべて success** (run 33145763773)。**`ubuntu-24.04-arm` はこれが初通しで、通った** —
doc-13 §3.5 が名指ししていたこの層の唯一の未実測がこれで閉じた。**apt の依存導入も落ちなかった。**

**AC #4: 資産は 10 件で、arm64 の 3 形式は x86_64 と名前で区別できる。** 出た綴りは doc-13 §3.5 が
bundler のソースから導いた予想とそのまま一致した。

| 形式 | x86_64 | arm64 |
|---|---|---|
| `.deb` | `Backlog.Atlas_0.2.0_amd64.deb` | `Backlog.Atlas_0.2.0_arm64.deb` |
| `.rpm` | `Backlog.Atlas-0.2.0-1.x86_64.rpm` | `Backlog.Atlas-0.2.0-1.aarch64.rpm` |
| `.AppImage` | `Backlog.Atlas_0.2.0_amd64.AppImage` | `Backlog.Atlas_0.2.0_aarch64.AppImage` |

**`.app.tar.gz` は載っていない** — doc-13 §3.5 の削除段が効いている。macOS は
`Backlog.Atlas_0.2.0_universal.dmg` 1 つ、Windows は `_x64_en-US.msi` と `_x64-setup.exe`、
`THIRD-PARTY-LICENSES.txt` が単独の資産としても添付されている。

**AC #5: TASK-172 を Done にした。** AC #1 は上の 3 資産が、AC #2 は README 和英が既に
「`amd64` か `x86_64` / `arm64` か `aarch64`」と述べていたことが満たす。

**AC #6: オーナーが手で公開した** (2026-08-28 09:15 UTC)。`draft=false`・`prerelease=false` で、
`releases/latest` は `v0.2.0` を答える。

**リリースノートは PR #117〜#158 の 42 件で、全件が `Other Changes` に入った。** これは想定どおりで、
`.github/release.yml` の註自身が「この repo の PR はラベルを 1 つも持たないので catch-all は飾りではない」と
記録している。**欠陥として起票しない。**

**版の告知 が本物のデータで出るのはここからである** — decision-44 の 公開されている版 は
`releases/latest` の tag なので、走っている v0.1.0 のビルドが初めて印を出す状態になった。
<!-- SECTION:NOTES:END -->
