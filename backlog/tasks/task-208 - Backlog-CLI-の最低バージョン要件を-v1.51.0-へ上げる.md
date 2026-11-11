---
id: TASK-208
title: Backlog CLI の最低バージョン要件を v1.54.0 へ上げる
status: Done
assignee: []
created_date: '2026-10-11 19:30'
updated_date: '2026-11-11 07:11'
labels:
  - 'kind:research'
milestone: m-4
dependencies:
  - TASK-213
priority: medium
ordinal: 199700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-48 は、draft の内容編集（draft edit）を提供するために最低バージョン要件を v1.51.0 へ上げると決めていた。その後、v1.54.0 が task complete を削除し、Done のタスクの閉じ方が版で逆転した（v1.53.0 までは task complete だけが通り、v1.54.0 以降は task archive だけが通る。TASK-213 の実測）。decision-51 は上げ先を v1.54.0 に改めた。v1.54.0 は、Done のタスクを task archive で閉じられる最初の版である。draft edit も v1.51.0 から入っているので、TASK-209 の前提も満たす。

作業は decision-27 に従う。MIN_VERSION と decision-7 の正本、7 つの doc の実測基準版、コードと AGENTS の実測註を、確かめたうえで動かす。版差記録と decisions の実測註は動かさない。2026-10-12 に引いた索引では、backlog/tasks を除いて 1.50.1 の文字列が 154 行・40 ファイルにあった（CLAUDE.md は AGENTS.md へのシンボリックリンクなので 1 回だけ数えた）。decision-27 のとおり総数は引き継がず、1 件ずつ読みながら数え直す。src/lib/settings-controller.test.ts の 2 か所（READY の version と launched の report）は、decision-27 §1 がフロントエンドに置かないとした版リテラルである。どちらとして扱うかも本タスクで決める。

本タスクが上げた時点では、画面にはまだ完了整理が出ている。v1.54.0 以上の CLI では必ず失敗する操作である。それを取り除くのは TASK-215 で、本タスクの後に入る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-27 の種別ごとに、動かした出現と動かさなかった出現が 1 件ずつ読んで数えられ、実施記録に残っている
- [x] #2 src/lib/settings-controller.test.ts の 2 か所の版リテラルの扱いが決まり、反映されている
- [x] #3 pnpm test・pnpm run check・pnpm run lint と、src-tauri の cargo test・cargo clippy が通る
- [x] #4 MIN_VERSION と decision-7 の最低バージョン要件が v1.54.0 になり、wire-fixtures が再記録されている
- [x] #5 実測註を動かす前に、その註が述べる挙動を v1.54.0 で測り直している。違いが出たものは版差記録になり、偽だった主張は訂正されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 1.50.1 の全出現（backlog/tasks を除く）を decision-27 の 7 種別へ 1 件ずつ分ける。動かすのは 実測註（コード・AGENTS）・実測基準版 7 doc・MIN_VERSION・decision-7 の正本・生成物の記録。動かさないのは 版差記録・decisions の実測註・付随的な版表記。
2. 実測註と 7 doc の実測記述が述べる挙動を、v1.50.1 と v1.54.0 に同じ探査を流して測り直す（実行ファイルの静的読み・help・操作列・読み戻し）。real CLI を使う #[ignore] 試験も v1.54.0 を PATH に置いて回す。
3. 一致した註はリテラルと測定日を動かす。違いが出た註は版差記録へ書き換え、元から偽だった主張は訂正して偽だったことを残す。
4. MIN_VERSION を 1.54.0 にし、ATLAS_RECORD_WIRE_FIXTURES=1 cargo test で wire-fixtures を再記録する。
5. settings-controller.test.ts の 2 か所は decision-27 §1 の 版値 として CONFIRMED_CLI_VERSION から導く。
6. decision-7 の正本を v1.54.0 にし、引き上げの理由を decision-51 へ向けて足す。AGENTS 和英の decision の註を v1.54.0 の実測に合わせて書き直す。
7. pnpm test・check・lint、cargo test・clippy・fmt を通す。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 着手時の判断（2026-11-11）

- **settings-controller.test.ts の 2 か所（AC #2）は 版値 として扱い、`CONFIRMED_CLI_VERSION` から導いた。** READY は床ちょうどの CLI を演じる ready 応答で、launched の report も同じ CLI の `backlog --version` である。どちらも decision-27 §1 の「試験の入力値は `MIN_VERSION` から導く」に当たり、付随的な版表記（測定でも要件の値でもないもの）には当たらない。値を読む試験は無いので、挙動は変わらない。
- **v1.54.0 で偽になった註は、リテラルを動かさずに版差記録へ書き換えた**（decision-27 §4）。**v1.50.1 の時点で既に偽だった註は訂正し、偽だったことを註に残した。**
- **画面文 2 つが v1.54.0 で偽になるが、本タスクでは直さない。** `draftReadOnly`（「CLI に draft の内容を編集する手段がない」）は TASK-209 の AC #2 が直す。`noWayBackFromClosed`（「completed・archive から戻す操作は CLI にない」）は、v1.54.0 の `task restore` で偽になった。オーナーの判断で、restore を Atlas が出すかを先に決める TASK-216 を起票した。

## 測り直し（2026-11-11、macOS arm64）

TASK-213 が使い捨てのディレクトリへ導入した v1.50.1・v1.51.0・v1.53.0・v1.54.0 を使い、註と 7 doc の実測記述が述べる挙動を同じ探査で両版へ流して比べた。

- **操作の探査（89 手）**: init・milestone add・全節を持つタスク・コメントの拒否・手書き COMMENT 書式の読み戻し・assignee・References・dependencies・ラベル（順序、カンマを含む既存ラベルの削除）・AC の番号の 2 つの枠・`--acceptance-criteria` の併用拒否・`--type` の語彙と `types:` による拡張・`--priority` の大小文字・`-s` の拒否・カンマを含む title・milestone・path・doc の tags 全消しと type の解除不能・archive と completed への `task edit`・状態遷移と `task restore`・draft promote の status・日時が UTC。
- **終了コードは 89 手のうち 4 手を除いて一致した**。違ったのは `task restore`（v1.54.0 で新設）とそれに続く 1 手、`task complete` と Done のタスクの `task archive`（TASK-213 の実測どおり）である。
- **マイルストーンの書き換え（doc-9 §4.2.1 の表の 6 操作）**: id・title・前後空白と大文字小文字を違えた id と title・内側の空白を違えた title で参照するアクティブ 5 件と、draft・completed・archive の 3 件を持つルートで、書き換わったファイルは 6 操作とも両版で同じだった。
- **実行ファイルの静的読み**: `handleAssetRequest` は識別子名を除いて同一（5 段階と拡張子表）。`--type` の既定語彙・SECTION 名の 4 項目の表・web UI の `Documents (N)`／`Documents unavailable`／`Documentation` の役割も同じ。
- **実 CLI を使う `#[ignore]` 試験 2 本**（`the_frontend_edit_reaches_the_real_cli`・`the_renumbered_ac_delta_hits_the_intended_criterion`）は、v1.50.1 と v1.54.0 を PATH に置いてどちらも通った。

### v1.54.0 で変わっていたもの（版差記録にした）

- **SECTION の区切りの走査正規表現が行に固定された**（`^…$`、行末の空白を許す）。v1.50.1 は行の途中でも区切りとして拾っていた。固定は v1.51.0 からである。名前の集合は変わらない。parse.rs と doc-4 §4。
- **コメント欄の `---` の前後に空行が入るようになった**（v1.54.0。v1.53.0 までは無い）。読み取り層は両方を同じに読む。parse.rs の `EVERY_SECTION` を v1.54.0 の形にし、旧来の形を読む試験を足した。
- **archive・completed のタスクへの `task edit` の文面**が「not found」から「is archived … Restore it to the board first」に変わった（終了コードは 1 のまま）。doc-8 §6.5 の版差記録に足した。
- **`task restore` が入り、archive と completed のタスクを盤面へ戻せる。** edit.ts・TaskDetail.svelte・doc-8 §6.5 の「戻す操作が無い」を、Atlas の画面についての文へ改めた（decision-51 §6）。
- **`archive/docs`・`archive/decisions` が加わった。** scan.rs・doc-4 §3.4。
- **`decision edit`・`archive`・`restore`・`delete` が加わった。** AGENTS 和英の decision の項を書き直した。`edit` が受け取るのは `--status` と `--plain` だけで、本文を書く手段は今も無い。
- **CLI のエラー文の末尾に `No changes were applied.` が足された。** 註と doc が引くのは文の書き出しだけなので、動かすものは無かった。

### 元から偽だった主張（訂正した）

- update.rs の 2 か所が「`--ref ""`／`--depends-on ""` は何も消さずに終了コード 0 を返すので拒む」と書いていた。v1.49.3 までの挙動で、v1.50.1 からは偽だった（TASK-153 の掃き替えで版だけ動いていた）。
- domain.rs と doc-10 が「`backlog decision` は `create` だけを持つ」と書いていた。v1.50.1 にも `list` があった。
- edit.test.ts が「作成側の `-a` は分割しない」と添えていた。v1.50.1 から作成側も分割する。
- edit.ts の `--priority` の値域の出典が「`task edit --help`」だったが、help は「configured priorities」としか書かない。値は拒否文から読んだ。
- read.rs の試験用タスクファイルは「v1.50.1 が書くもの」と名乗っていたが、`updated_date` を欠いていた。そう書き添えた。
- doc-5 §3 の表と §3.2、doc-8 §6.5 の `task archive`・`task complete` の行は、実測基準版を v1.54.0 にすると偽になる。v1.54.0 の挙動へ改め、v1.53.0 までの挙動を版差記録として残した。完了整理の行は TASK-215 が落とす。

## decision-27 の種別ごとの数（AC #1）

索引は decision-27 の手順で引いた（`backlog/tasks` を除く。CLAUDE.md は AGENTS.md へのシンボリックリンクなので 1 回だけ数えた）。**着手時は 176 行・180 出現・40 ファイル**で、1 件ずつ読んで分けた。数は出現単位である。

**動かしたもの（123）**
- 実測註 111（Rust 64・フロントエンド 43・AGENTS 和英 4（各 2））。内訳は次の 3 つである。
  - 挙動が一致したので版と測定日を動かしたもの 97（Rust 57・フロントエンド 38・AGENTS 2）。
  - v1.54.0 で変わっていたので版差記録へ書き換えたもの 9（parse.rs 3・scan.rs 1・edit.ts 2・TaskDetail.svelte 1・AGENTS 和英の decision の項 2）。
  - 元から偽だった主張を訂正したもの 5（domain.rs 1・update.rs 2・edit.test.ts 1・edit.ts 1）。
- 版値 2（settings-controller.test.ts。`CONFIRMED_CLI_VERSION` から導く形へ）。
- 実測基準版 7（doc-3・4・5・7・8・9・10）。
- decision-7 の正本 1。`MIN_VERSION` の定義は数値で書かれているので索引には出ないが、併せて動かした。
- 生成物の記録 2（wire-fixtures。再記録した）。

**動かさなかったもの（57）**
- decisions 29（decision-7 の Context と履歴 9・decision-48 11・decision-51 5・decision-26 2・decision-27 1・decision-40 1）。
- doc の版差記録 23（doc-5 18・doc-9 2・doc-7 1・doc-8 1・doc-10 1）。
- コードの版差記録 5（update.rs 2・edit.ts 1・external-editor.test.ts 1・period.ts 1）。external-editor.test.ts は「does not exist on v1.50.1」を「has not existed since v1.50.1」へ言い直した。名指す版は変えていない。
- 付随的な版表記 0。

**作業の後に残る 1.50.1 は 78 出現**である。上の動かさなかった 57 に、版差記録・訂正記録として新しく書いた分が足されている。

## 検査

- `pnpm test`（54 ファイル・1396 件）、`pnpm run check`（0 errors）、`pnpm run lint` が通った。`pnpm run check` が出す `_sandbox/app-check/vite.config.ts` の読み込みエラーは、以前から出ているもので本タスクとは関係が無い。
- `src-tauri/` で `cargo fmt --check`・`cargo clippy --all-targets -- -D warnings`・`cargo test`（485 件）が通った。**`MIN_VERSION` を 1.54.0 にすると、境界試験の `MIN_VERSION.patch > 0` を clippy（1.99.1）が常に偽の比較として拒んだ**ので、`checked_sub` の形へ書き換えた。wire-fixtures は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で再記録した（`cli_readiness.json` の `version` と `command_errors.json` の `minimum`）。
- 新しく足した試験は、v1.53.0 までのコメント欄の形を読むもの 1 本である。`EVERY_SECTION` の形を v1.54.0 のものに替えても、全節試験が通ることを確かめた。

## レビュー 1 回目（PR #169、Codex）

[P3] 1 件。doc-5 §3.2 の「保存区分別の可否」が、completed・archive への `task edit` を `not found` と書いていた。v1.54.0 の文面は「is archived … read-only」なので、終了コード 1 で述べる形へ直し、文面は doc-8 §6.5 の版差記録へ送った。同じ主張が commands.rs の試験の註にも残っていたので、併せて終了コードで述べる形にした（ほかに同じ主張が無いことは grep で確かめた）。
<!-- SECTION:NOTES:END -->
