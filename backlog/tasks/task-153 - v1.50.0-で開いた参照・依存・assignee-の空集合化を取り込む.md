---
id: TASK-153
title: v1.50.0 で開いた参照・依存・assignee の空集合化を取り込む
status: Done
assignee: []
created_date: '2026-08-12 02:47'
updated_date: '2026-08-22 02:59'
labels:
  - 'kind:research'
milestone: m-3
dependencies:
  - TASK-152
priority: medium
ordinal: 147700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.50.0 が、それまで沈黙無変更だった 3 つの空値に意味を与えた。task edit --ref "" ・--depends-on "" ・-a "" は、v1.48.0 と v1.49.3 では終了コード 0 を返して既存値を変えなかったが、v1.50.0 以降はその一覧を空にする（実装は task-builders.ts の parseClearableStringList が空値を空配列へ変換する経路で、v1.49.3 にこの関数は無い）。加えて --clear-refs・--clear-deps・--clear-docs と、増分指定の --add-ref・--remove-ref が新設された。現在 Atlas はこの 3 操作を CLI 起動前に拒否しており（update.rs の RejectReason::EmptyReferences・EmptyDependencies・EmptyAssignee）、doc-5 §3.1 と doc-8 §6 が「CLI に手段が無いので提供しない」と書き、画面は外部エディタ経路へ案内している。拒否は安全側なので上位版でも壊れないが、利用者の CLI が現に行える操作を Atlas が断っている状態になる。取り込むなら最低バージョン要件を v1.50.x へ上げることが前提で、TASK-152 が v1.49.3 まで上げた後の判断になる。ユーザーは 2026-08-12 に 1.50.x を「公開から日が短すぎる」として m-2 では採らないと確定しており、本タスクはその先の判断を持つ。作業は版要件の引き上げだけでは終わらない。GUI 側に、無効化していた最後の 1 件の削除と assignee の解除を開く実装が要る（doc-8 §6 が案内する外部エディタ経路の扱いも併せて決める）。取り込むかどうかそのものが製品判断なので、着手セッションは決定先行になる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 v1.50.x を最低バージョン要件にするかどうかの判断と理由が記録されている
- [x] #2 取り込む場合、参照・依存の最後の 1 件の削除と assignee の解除が画面から行える
- [x] #3 取り込む場合、doc-5 §3.1 と doc-8 §6 の非提供の記述と、外部エディタ経路への案内が現状に合っている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 判断（2026-08-22、ユーザー）

**取り込む。最低バージョン要件を v1.50.1 へ上げた**（decision-7 の改訂）。ユーザーは着手前に
「v1.50.1 導入も検討」と述べ、3 案（v1.50.1 へ上げる／下限は据え置き能力段差で開く／取り込まない）
から 1 案目を選んだ。

**上げた先は v1.50.0 ではない。** v1.50.0 は性能退行を持ち込んでおり、上流のリリースノートが
「ブランチの多いリポジトリで `task view`・`task edit`・`task list` が数分掛かる／リモート fetch で
ハングしうる」「no-op の `task edit` が 12.2 秒」と述べている。Atlas は CLI 呼び出しに終了期限を
持つ（decision-18）ので、要件にした版が自分の期限に触れることになる。v1.50.1 はその修正版で、
候補は初めから 1 つだった。

**「公開から日が短すぎる」（2026-08-12 の判断）は当たらなくなっていた。** decision-7 が基準に
挙げた `~/.npmrc` の `min-release-age=7` を 2026-08-22 に当て直すと、v1.50.1 は公開 11 日、
v1.50.0 は 12 日（npm の公開時刻から UTC で数えた）。v1.50.1 が latest のまま追加のパッチは無い。
**2026-08-12 の判断が誤りだったのではない** — v1.50.0 の退行は翌日の v1.50.1 で直っており、
公開直後に採らなかったことは実際に当たっていた。

## 両版を並べて測った（2026-08-22、macOS arm64）

グローバルの v1.49.3 は消さず、使い捨てディレクトリへ v1.49.3・v1.50.0・v1.50.1 をローカル導入し、
同じ操作列を両版へ流して出力と管理ファイルを差分比較した。走らせたのは v1.49.3 と v1.50.1 の
2 版で、間の版は測っていない。

**Atlas が発行する範囲に欠落は無い。** 13 サブコマンド・36 オプション（`allowed_options` の全集合）を
両版の `--help` と突き合わせ、**v1.50.1 に欠落 0 件・改名 0 件。** 増えたのは
`--clear-refs`・`--clear-deps`・`--clear-docs`・`--add-ref`・`--remove-ref`・`task list --ready`・
`decision list`・`decision create --plain`・`doc create --plain`・`--append-final-summary`。

**出力の差分は 5 点で、doc-5 §3.5 に版差記録として書いた。** ①3 つの空値の沈黙無変更が反転
②`task create -a` がカンマで分けるようになった（TASK-151 が測った作成／編集の非対称が消えた）
③`config.yml` の `default_assignee` が `task create` に効くようになった ④id が解決しない
`draft promote`・`task demote`・`draft archive` が終了コード 1 になった（v1.49.3 は 0 を返していた
ので、**Atlas が「成功」と報告していた失敗が失敗として報告されるようになった**）⑤壊れた
`config.yml` が既定値の黙った適用ではなく終了コード 1 で止まる。**起動時の版検査は影響を受けない** —
`backlog --version` はプロジェクトを作業ディレクトリにしないので、壊れた設定のルートでも 0 を返す。

**それ以外は全部一致した。** SECTION マーカーの走査正規表現（バイト一致）・4 つの SECTION 名・
AC と DOD の同形・COMMENTS の 2 書式と見出し鍵の大小無視・本文が他の族の終了マーカーそのものである
コメントの受理・
マイルストーンの frontmatter が id と title だけ・`## Description` 見出し・`rename` が id を保つ・
id または title での解決・`archive/` のネスト・`task_prefix: "task"` と `TASK-N`・config に版欄が
無いこと・カンマ表の 7 分割と 13 非分割・AC index の 2 つの枠・`--acceptance-criteria` の併用不可・
`--type` の 7 語・`--priority` の値域・`--tags ""` の全消し・`--remove-label "x,y"` の沈黙無変更・
completed への `task edit` の文面と終了コード・`handleAssetRequest`（実行ファイルの静的読みで一致）・
日時が UTC。

## 実装

**空集合化の書き方を 3 件で揃えなかった。** 参照と依存は `--clear-refs`／`--clear-deps` を出し、
assignee だけが `-a ""` を出す。**判断軸は「上位版で壊れたときの壊れ方」である** — decision-7 は
上限を固定しないので、フラグが消えれば CLI が終了コード 1 で拒み（画面に CLI 失敗として出る）、
空値が沈黙無変更へ戻れば成功として報告される。assignee に `--clear-assignee` 相当は無いので、
この 1 件だけ後者を負う。**その 1 通りの壊れ方は 事後通知（`divergence`）が拾う** — 送った空集合と
再読込結果を比べるので、消えなかったことが画面に出る。この経路を守るテストを足した
（`edit.test.ts` の「解除したのに残っていれば事後通知に載る」。空集合を undefined と同じに扱う
変異で落ちることを確認済み）。

**落としたもの**: `RejectReason::EmptyReferences`・`EmptyDependencies`・`EmptyAssignee`、
`edit.ts` の `emptyReferencesReason`／`emptyAssigneeReason`／`emptyDependenciesReason`・
`canRemoveLast`・`lastRemovalAvailability`、文言表の `lastElementHeld`（和英）、
`TaskDetail.svelte` の `listEditor` の `lastRemoval` 引数と無効化・理由文。

**`comma.test.ts` の走査が新オプション 2 つを要求した**（`allowed_options` を源泉にしているため）。
値を持たないフラグなので 構成による分類 に入れ、doc-5 §3.1 の数え上げも 25→27・5→7 へ直した。

## 版リテラルの掃き替え（decision-27）

**実測註 104 箇所を測り直して動かした**（Rust 60・フロントエンド 44）。実測基準版 7 doc・
`MIN_VERSION` 1・decision-7 の正本 1・AGENTS 和英 4（各 2）・生成物の記録 2 の再記録。
**測定日も併せて動かした** — TASK-152 のレビューが「版だけ動かして日付を残すと、その版が存在しない
日付になる」を見つけているため。**実測註 11 箇所は注が付いていたコードごと消えた**ので移動に数えていない。

**触らなかったもの**: 版差記録（doc-5 §3.4・doc-8 §6.5）・decision-29 の実測註 1（ある日ある機械に
入っていた版の記録なので、動かすと記録が偽になる）・付随的な版表記。

## 測り直して偽だった記述を 2 つ直した

- **doc-5 §3.4 の `--priority`**: 「frontmatter へは渡した表記のまま書かれる（実測）」は
  **両版で偽だった** — `HIGH`・`High`・`high` はどれも `priority: high` になる。Atlas が送る値は
  小文字なので実害は無く、同項の結論（値域は変わらないので GUI の選択肢は変えない）も動かない。
  版差ではないので、版差記録としての主題は動かしていない。
- **doc-8 §9.2 の `handleAssetRequest`**: 本文の実測記述が版をリテラルに持っており、
  decision-27 §3（doc の本文は版を名乗らない）に反していた。TASK-186 が宣言の後に書いたためで、
  版を落として宣言に委ねた。

## AC #4 を外した（2026-08-22、オーナーの判断）

起票時の #4「取り込まない場合、上位版で行えるのに Atlas が断る状態を残す理由が記録されている」は
#2・#3 と if / else の対で、**取り込む側を採ったので条件が成立しなかった。** チェックを付けると
「断る状態を残す理由」を書いたことになるので付けず、オーナーが AC 一覧から外すことを選んだ
（`--remove-ac 4`。末尾なので他の `#N` は動いていない）。**外した記録をここに残すのは、
起票時に 4 件あったことが AC 一覧からは読めなくなるためである。**

## 検証

`pnpm test`（1134 件）・`pnpm run check`・`pnpm run lint`・`pnpm run build`、`src-tauri/` で
`cargo test`（455 件）・`cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`。すべて pass。
wire fixture は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で録り直して commit 対象に入れた。
**新しいテストは 4 本とも、実装を変異させて落ちることを先に確認した。**

**画面目視は 2026-08-22 にオーナーが実施し、OK だった**（AC #2）。タスク詳細の References・
dependencies・assignee で最後の 1 件を削除して保存できることを確認してもらった。目視の前に
作業機の `backlog` を 1.50.1 以上へ上げている — 上げないと画面が「CLI 縮退」になり、削除の控えが
そもそも出ない。
<!-- SECTION:NOTES:END -->
