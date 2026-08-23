---
id: TASK-94
title: 規模別の起動時間・再読込時間・thread 数を計測する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-23 08:42'
labels:
  - performance
  - 'kind:research'
milestone: m-3
dependencies: []
priority: low
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
workspace_open は登録順に全プロジェクトを直列で開き、各ルートで config・milestones・documents・decisions・tasks・drafts・completed・archive を読んで参照を解決する。起動時間は全登録ルートの管理ファイル数と filesystem 待ちの合計になる。監視通知は変更ファイル数にかかわらず対象ルート全体を再読込し、ReloadEvent でプロジェクト snapshot 全体をフロントエンドへ送り、フロントエンドは rows・全タスク一覧・facet・件数を再計算して各セルを再ソートする。この方式は一貫性が分かりやすく cache invalidation を避けられるが、1 ルートに数千件、多数ルートの同時監視、外部ツールが短い間隔で書き続ける場合に I/O と再計算が目立つ。監視は 1 ルートごとに debounce thread と watch loop thread が少なくとも 2 本あり、ルート数に比例して増える。現状で遅いという実測は無いので、部分再読込のような設計を複雑にする変更の前に計測を置く。_sandbox/repository-quality-assessment-2026-08-01.md のパフォーマンス節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ルートごとのファイル数・読取時間・snapshot サイズ・フロントエンド再計算時間が測れる
- [x] #2 多数ルート登録時の thread 数と notify watcher 数が測れる
- [x] #3 計測結果から、部分再読込や監視イベント集約が必要かどうかの判断が記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 何を足したか

**規模計測**（`pnpm run scale`、decision-42）を足した。合成した Backlog ルートを規模ごとに読ませ、
読取時間・再読込時間・snapshot の直列化サイズ・フロントエンド再計算時間・監視 1 ルートあたりの
thread 増分を出す 1 本の実行経路である。**合否を持たない** — 何も assert せず、遅い機械で赤くならない。
毎回の検証は `pnpm test`・`pnpm run check`・`pnpm run lint` の 3 本のままで、4 本目にしていない
（decision-40 が GUI E2E について採ったのと同じ形）。

半分が 2 つある。読取側は `src-tauri/src/scale.rs`（`#[cfg(test)]`・`#[ignore]` 付き・**release で
走らせる**。debug は 2〜3 倍遅く、そこで採った数は誰も配らないバイナリを述べる）。再計算側は
`scripts/scale/frontend.mjs`（本物の `buildSwimlane`・`collectFacets` を vite の `ssrLoadModule`
経由で読み込む。この木の TS は拡張子なし import なので素の node の解決器では読めない）。

`ATLAS_SCALE_ROOT` は読取側を実在のルートへ向ける。既定は本リポジトリ自身の `backlog/` で、
**この錨が要点である** — 誰も手で書かない形は、実在のルートが持たない理由で速いことがある。

## 実測（2026-08-23、macOS arm64、release）

**全実測値は decision-42 §実測 が持つ。ここには写さない** — 写しは機械が変わった瞬間に古びる。
判断を決めた 4 つだけを書く。

1. **再読込は読取とほぼ同値である。** どの規模でも差は誤差の中にある。
2. **読取時間を決めるのはファイル数であって本文の大きさではない。** 250 タスクで本文を 64 倍に
   しても 1.8 倍にしかならない。
3. **読取時間の 8 割は生の I/O である。** 部分再読込が削るのはこの 8 割のほうである。
4. **フロントエンドの再計算は律速ではない。** 20 ルート 20,000 タスクで 6.5ms、同じ規模の直列読取の
   2% を下回る。品質評価書が挙げた 4 つの計測対象のうち、これだけ桁が違う。

## 着手時に見つけた食い違い

**doc-9 §3 は「変化したファイル（不能ならルート）を…読み直す」と書いており、実装は変更ファイル数に
かかわらず常にルート全体を読み直す。** doc-4 §6・doc-5 §6 も再構築単位を「ルート／ファイル」と両論の
まま置いていた。**これは余地ではなく食い違いで、字句どおり読めば実装が要求を満たしていない。**
2026-08-23 にオーナーが「ルートに閉じ、再開条件を数値で書く」を選び、decision-42 と 3 doc の改訂に
なった。**この 3 doc は本タスクの Description も AC も名指ししていない** — 着手時に再構築単位を
grep して出た。

## 判断できなかったものと、しなかったこと

- **監視 1 ルートあたり 3 本は実測ではない。** 実測は `WatchSession` の 2 本（notify 自身の watcher
  thread と debounce thread）で、`project_watch_start` が `watch_loop` へ spawn する 1 本は
  `AppHandle` が要るので規模計測では起こせない。**合計は実測 2 本と構成 1 本の和である。**
  notify watcher の数も同じで、`WatchSession::start` が 1 セッション 1 つ作るという構成から出る。
  出力はそれを `watchers=` として書くが、測っているのは thread のほうだと註が言う。
- **1 ディレクトリの `.md` が約 350 件と約 400 件の間で、1 ファイルあたりの読取時間が 16.5µs から
  86µs へ跳ぶ。** 素の node の read ループでも同じ位置で再現するので Atlas のコードではない。
  **原因は特定していない** — `APFS` の閾値・ファイル走査 hook などの名前は 1 つも測っていないので
  書いていない。効くのは「小さいルートで測った 1 ファイルあたりの値を大きいルートへ外挿できない」
  という限定だけで、それは decision-42 §実測の限界 が持つ。
- **測っていないもの**: 窓の生成、IPC 転送、最初の描画、WebView 上の再計算、Windows の thread 数。
  **「無視できる」ではなく 未測定 である。** `JSON.parse` は Node/V8 で測ってあるが、それは境界の
  費用の下限であって境界の計測ではない。

## 実測が改善順を入れ替えた

**最も大きい項は 全ルート直列読取時間 で、部分再読込はここに一切効かない** — 初回読取は定義上
すべてのファイルを読む。品質評価書が並べた改善順（部分再読込 → 監視集約）にこの項は無い。
**TASK-199（m-4）として起票した。** 2026-08-23 にオーナーが m-4 と判定した。

## 走らせた検査と、確かめた変異

`pnpm test`（51 files・1,318 tests）・`pnpm run check`（0 errors・0 warnings）・`pnpm run lint`・
`cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test`（455 passed・
8 ignored）。すべて緑。

**この機構は何も assert しないので、変異で確かめたのは「腐らないように保っているもの」のほうである。**
`scan.rs` の `ScanDir::rel_path` を改名すると `src/scale.rs:114` がコンパイルエラーになり、
戻すと 455 passed に戻ることを実際に見た。**AGENTS と `scale.rs` の頭註が主張している唯一の門が
これで、主張して確かめないまま出していない。**

**フロントエンド側にはその門が無い。** `tsconfig.json` は `scripts/` を含まないので
`pnpm run check` も読まず、`pnpm test` も走らせない。**AGENTS はそう書いてあり、「触った回に
走らせる」を対にしてある。**

## 途中で 1 度直したこと

`scale.rs` の初版は `println!` と合成ファイルの本文に日本語を持っており、`screen-text.test.ts` が
19 行を報告した。あの走査は crate の**インラインの** `#[cfg(test)] mod` 塊を剥がすが、
**モジュールがファイルそのものである本ファイルには剥がす塊が無い。** 兄弟の 2 つ
（`csp.rs`・`wire_fixtures.rs`）は日本語をコメントだけに置いてこれを避けており、**走査を広げるのでは
なくその慣習に従った。** 代償は合成ルートが ASCII 本文しか持たないことで、多バイト本文の費用を
負っているのは実在ルートの 1 行だけである — `scale.rs` の頭註がそう書いている。
**この書き換えで数が動いたので、decision-42 の表は書き換え後に測り直した値である。**
<!-- SECTION:NOTES:END -->
