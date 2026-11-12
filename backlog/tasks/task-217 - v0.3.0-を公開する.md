---
id: TASK-217
title: v0.3.0 を公開する
status: In Review
assignee: []
created_date: '2026-11-11 09:31'
updated_date: '2026-11-11 09:36'
labels:
  - release
  - 'kind:chore'
milestone: m-4
dependencies: []
priority: high
ordinal: 208700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
m-4 の途中で v0.3.0 のタグを打ち、リリースを公開する。**手順の正本は doc-13「タグから利用者が受け取る資産までの配布層 設計」である。** このタスクはそれを繰り返さず、**この版に固有のもの**だけを持つ。

**m-4 を終えずに出すのはオーナーの判断である (2026-11-11)。** m-4 の説明は「一旦 v0.3.0 として出す」と述べていたが、その時点で m-4 には To Do が 13 件残っていた (HIGH の TASK-211 を含む)。オーナーはいまの main で出すことを選んだ。**残りの 13 件は v0.3.0 公開後のマイルストーンへ移し、m-4 の説明もそれに合わせて直す。** TASK-205・TASK-206 が既に指していた m-5 は台帳にファイルの無い名前だけのマイルストーンだったので、この回で実体を作る。

**依存が v0.2.0 から動いている。** `src-tauri/Cargo.lock` と `Cargo.toml` に差分があるので (TASK-206 の deep-link・single-instance などの plugin)、**doc-13 §4.5 の crate 数 (353 / 443) と §4.3 の 25 件 (どちらも 2026-08-19 の値) をこの回に測り直し、動いていれば doc-13 を改訂する。**

**`tauri.conf.json` にも差分がある。** バンドルが運ぶもの (URL スキームの登録など) が変わっていれば、README の突き合わせ (doc-13 §2) でそれを読者が行動の根拠にする記述と照らす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README.md と README.ja.md を出荷するビルドと突き合わせてある (doc-13 §2。動作環境と Linux の下限・対応アーキテクチャ・Backlog CLI の最低バージョン要件・更新の届き方・できることの一覧)
- [x] #2 m-4 の To Do を v0.3.0 公開後のマイルストーンへ移し、m-4 の説明を実際に出した範囲に合わせてある
- [x] #3 doc-13 §4.3・§4.5 の実測値を測り直し、動いていれば doc-13 を改訂してある
- [ ] #4 タグと package.json・src-tauri/tauri.conf.json・src-tauri/Cargo.toml・src-tauri/Cargo.lock の 4 ファイルの版が一致している
- [ ] #5 リリースワークフローの 5 ジョブ (macOS・Linux x86_64・Linux arm64・Windows・下書き作成) がすべて success で終わっている
- [ ] #6 ドラフトの資産が 3 プラットフォームぶん揃い、.app.tar.gz が載っていない
- [ ] #7 ドラフトのリリースノートを読んだうえで、手で公開した
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 範囲の判断 (2026-11-11)

**オーナーが m-4 の途中で出すことを選んだ。** 着手時点で m-4 は 26 件中 13 件が Done、13 件が To Do (HIGH の TASK-211 を含む) で、m-4 の説明は TASK-203・TASK-204 を v0.3.0 に入れると述べていた。その食い違いをオーナーに示し、「いまの main で出す」の回答を得た。v0.2.0 以降のマージ済み PR は 13 件。

## マイルストーン (AC #2)

- **m-5 の実体を `backlog milestone add` で作った。** TASK-205・TASK-206 が指していた m-5 はファイルの無い名前だけのもので、新しいファイルは同じ m-5 の id を得た。
- **m-4 の To Do 13 件 (TASK-173・179・180・189・197・198・199・200・203・204・209・210・211) を `-m m-5` で移した。**
- **TASK-206 は m-5 から m-4 へ戻した。** あれは m-5 の時点では「v0.3.0 に要らない」という判断だったが、実装は v0.3.0 の前に Done になって v0.3.0 に入る。m-5 を「v0.3.0 公開後」と名付けた以上、出荷済みのタスクをそこに置くと名前と中身が食い違う。
- **m-4 と m-5 の説明は Description の範囲だけを直接書いた** (AGENTS の milestone description の例外)。m-4 は実際に出した範囲と途中で出した経緯に、m-5 は引き継いだもの (13 件と TASK-205) に合わせた。

## README の突き合わせ (AC #1)

**README 和英は v0.2.0 以降どのコミットも触っていない。** 古びていたのは 更新の届き方 の版リテラルと できることの一覧 の 2 つで、どちらも和英を並べて直した。

- **できることの一覧**: TASK-215・216 のアーカイブと active へ戻す操作、TASK-206 のタスクリンク (`backlog-atlas://task?root=…&id=…`) の 2 行を足した。タスクリンクは形を doc-3 §8 へ案内し、関連付けはインストーラが書くこと・AppImage は起動のたびに自分で書くこと (commands.rs の `register_all`) を述べた。語は画面の文言 (「アーカイブ」「active へ戻す」/ "Archive" "Move back to active") に揃えた。
- **更新 節**: v0.2.0 → v0.3.0。Atlas のリリースの版なので decision-27 §7 は掛からない。
- **古びていなかったもの**: 動作環境と Linux の下限 (Ubuntu 24.04 以降。release.yml は v0.2.0 から動いていない)・対応アーキテクチャ (matrix 4 行)・Backlog CLI の最低バージョン要件 (README は版を名乗らない。TASK-208 で v1.54.0 に上がったが、起動時に Atlas が告げる文で足りる)。

## doc-13 の実測値 (AC #3)

**依存が動いていたので測り直し、doc-13 §4.3・§4.5 を `backlog doc update --content` で改訂した。**

- **5 トリプルの和集合は 402 crate** (生成器の出力 `402 cargo crates`)。前回 353。
- **`--filter-platform` を外したグラフは 491 crate** (`cargo metadata` の packages 492 からルートを引いた値)。前回 443。
- **本文を持たない crate は 25 件のままで、族の内訳も同じ。** 増えた crate はどれも本文を publish している。
- 通知の再生成で動いたのは Cargo.lock の digest 1 行だけ (crate の一覧は TASK-206 の 9c63386 が既に再生成していた)。

## 検証

`pnpm test` (54 files / 1399 tests)・`pnpm run check` (0 errors)・`pnpm run lint` は緑。`src-tauri/` で `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test` (486 passed / 8 ignored) も緑。**手元の rustc は 1.99.1 で、main の直近の CI run が使ったものと同じである。** main の 3f0d4cc の CI は e2e・os-notify を含む 6 ジョブすべて success。

## タグ以降に残るもの

AC #4〜#7 はタグを打ってからである。AC #4 はリリースワークフローの create-release ジョブが 4 マニフェストとタグを突き合わせる段で答える。
<!-- SECTION:NOTES:END -->
