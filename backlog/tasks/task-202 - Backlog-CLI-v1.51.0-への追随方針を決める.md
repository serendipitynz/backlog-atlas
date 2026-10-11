---
id: TASK-202
title: Backlog CLI v1.51.0 以降への追随方針を決める
status: In Review
assignee: []
created_date: '2026-09-05 23:40'
updated_date: '2026-10-11 19:34'
labels:
  - 'kind:research'
milestone: m-4
dependencies: []
priority: medium
ordinal: 193700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI は v1.50.1 のあと、v1.51.0（2026-09-02）・v1.52.0（2026-09-12）・v1.53.0（2026-09-24）と 3 版が公開された。2026-09-06 に v1.51.0 を、2026-09-26 に v1.52.0 と v1.53.0 を v1.50.1 と並べて調べた結果、現行の Atlas はどの版が書いたルートもそのまま読めるが、3 版が開いた手段のうち Atlas に載っていないものがある。本タスクは追随の方針 — 動作確認済み版を上げるか（上げるならどの版へか）、新しい手段と値をどこまで取り込むか — を決める。

## 実測でわかったこと（2026-09-06、macOS、v1.50.1 と v1.51.0 を並置）

壊れるものは無い。①frontmatter は key ごとの抽出なので未知キーは縮退イベントを出さない。②SECTION マーカーの語彙は DESCRIPTION・PLAN・NOTES・FINAL_SUMMARY と AC・DOD・COMMENTS のままで、read/parse.rs の KNOWN_SECTIONS の主張は v1.51.0 でも成立する。Comments ブロックの形（author 行・created 行と 3 連ハイフンの区切り）も同じ。③update.rs の許可リストが持つ 34 オプション（task create 6・task edit 19・doc create 2・doc update 5・milestone add 1・rename 1・remove 2）は全部 v1.51.0 に存在し、削除も改名も 0 件。④milestone は依然 add・rename・remove・archive・list だけで update も edit も無く（rename は期限の指定を得たが説明は create 時のみ）、decision について本文を書けるオプションも依然として無い。decision-21 の例外と AGENTS の decision 直接編集の根拠は保たれている。

意味が変わったのは 1 件である。予約マーカー行を含む本文を渡すと、v1.50.1 は黙って入れ子にして書いていたが、v1.51.0 は理由を stderr に出して終了コード 1 で拒む。Atlas から見れば doc-5 §5 の CLI 失敗として既存経路に乗るので壊れない — decision-7 が上限を置かず「CLI 自身が拒む」に頼っている、その通りの挙動である。

## v1.52.0 と v1.53.0 で変わったこと（2026-09-26、macOS）

測り方は版で違う。v1.52.0 は v1.50.1・v1.51.0 と並べて導入し、ルートと全サブコマンドの help（50 画面）からオプション名の集合を採って差を取った。v1.53.0 は公開から 7 日に満たず npm の導入制限にかかったため実行できず、上流リポジトリのタグ v1.51.0 と v1.53.0 のソース差分を読んだ。**v1.53.0 の欄は未実行であり、実行による確認は残っている。**

壊れるものは増えていない。v1.51.0 から v1.53.0 までに、テストと web UI を除いて変わったファイルは src/cli.ts・src/commands/watch-json.ts・src/utils/list-window.ts・src/formatters/json-output.ts・src/file-system/operations.ts（doc 一覧で同じ題名の並びを path で決める 1 行）と手引き 2 本だけで、src/markdown と src/core は 1 行も変わっていない。したがって上の①②④と予約マーカーの拒否は v1.53.0 まで持ち越す。③も持ち越す — v1.52.0 のオプション集合は v1.51.0 に task list の --watch を 1 つ足しただけで、v1.53.0 の src/cli.ts で差し引き増えたオプションもそれだけ（残りは下の list-window 経由の 3 つ）、削除・改名は 0 件。v1.53.0 のソースでも milestone のサブコマンドは add・rename・remove・archive・list、decision は create・list である。

予約マーカーの拒否は v1.52.0 で実行して確かめた。task edit の --notes に NOTES の END マーカー行を含めると、終了コード 1 で stderr に次の 1 行が出る（引用符の中には渡したマーカー行がそのまま入る。ここではマーカーを書くと本文が壊れるので M と置く）: `Implementation Notes content cannot contain the reserved marker line "M". Indent it with a space to include it as literal text.`

## 追随候補と、その出どころの版

CLI の手段のうち Atlas が使っていないものは多いが、**v1.51.0 以降の 3 版が新しく開いたのは次の 6 件である。** 残りは v1.50.1 以前からあり、追随していないのは版差ではなく積み残しなので、取捨の理由も別になる。

v1.51.0 で開いたもの（オプション名の集合を両版の help から採って差を取った。削除・改名は 0 件）:

- **複数タスクの一括編集** — task edit の引数が taskId 1 個から taskIds の並びになり、同一の共有フィールド変更を複数タスクへ一度に適用できるようになった。Atlas の 列間ドロップ はカード 1 枚を動かす操作で、更新層の task edit も位置引数を 1 個しか組み立てない。追随するなら、複数選択の操作・位置引数の複数化・decision-18 のプロジェクト単位排他・doc-9 の競合検出をまとめて扱うことになる。
- **draft の内容編集（draft edit）** — draft を対象にした edit サブコマンドが新設された。オプション名の集合は task edit と同じ 48 個で、位置引数は taskId 1 個である。doc-5 §3.3 は draft の内容編集を GUI に出さない理由を「CLI には draft を対象にした task edit 相当が無い」としており、その前提が v1.51.0 で成り立たなくなった。2026-09-06 の比較はこれを数えておらず、2026-09-26 に全サブコマンドの help で取り直して見つかった。
- **期限（due_date）** — task create と task edit に指定と解除が、milestone add と milestone rename にも同じものが付いた。frontmatter にも載るが読み取り層が読まないので、画面には現れない。
- **project 属性** — task create・task edit・task list と search に付いた。Backlog 側のモノレポ用で、Atlas 自身のプロジェクトと語がぶつかる。

v1.52.0 で開いたもの:

- **一覧の継続出力（task list --json --watch）** — 起動時に条件に合う一覧を JSON で出し、以後は結果が変わるたびに一覧全体を出し直す。--json と組でしか使えない。Atlas はルートのファイルを自分で読み（decision-2）、変更の監視も自前で持つ（decision-11）ので、これは Atlas の読み取り経路とは別の手段である。

v1.53.0 で開いたもの（ソース読みのみ）:

- **一覧の頁送り（--max-count・--skip・--count）** — search・task list・draft list・milestone list・doc list・doc search・decision list に付いた。--json では total と nextSkip が加わる。Atlas の更新層は list も search も呼ばない。

読み取り側で v1.51.0 が増やしたものも 2 件ある。依存の逆参照と循環・欠損・曖昧の判定（doctor も自己参照と循環を報告するようになった）、および Acceptance Criteria の進捗表示。Atlas は dependencies を読むだけである。

v1.50.1 以前からあり、Atlas が使っていないもの（v1.51.0 以降の新機能ではない）:

- タスクの型指定（--type）と並び順（--ordinal）
- 参照の増減（--add-ref・--remove-ref）と、ラベル・AC・マイルストーン・Final Summary・documentation の一括消去（task edit の --clear- で始まる 7 つのうち、Atlas が既に使う --clear-deps と --clear-refs を除いた 5 つ）
- Definition of Done、Comments、Acceptance Criteria の一括置換（--acceptance-criteria）
- modified_files と documentation の書き込み（--modified-file・--doc）
- task list の JSON 出力（--json）

このうち Definition of Done と Comments と Final Summary は TASK-189 が、Acceptance Criteria の鍵は TASK-190 が、ラベルの増減差分は TASK-196 が既に持っている。本タスクはそれらと重ならない範囲で取捨を決める。

## 決めること

decision-7 は上限を置かないので、v1.51.0・v1.52.0・v1.53.0 の利用者は現状のまま Supported である。MIN_VERSION を上げる必要は無く、上げると v1.50.x を切ることになるのでそれ自体が決定であり、さらに decision-27 §3 により「v1.50.1 で実測」と書かれた註記を測り直す作業が付いてくる。上げるなら v1.51.0・v1.52.0・v1.53.0 のどれにするかも決める — v1.52.0 と v1.53.0 が足したのは読み取りと出力の手段だけで、Atlas が書くときに使う手段は v1.51.0 と同じである。上げる／上げないの判断と、上の追随候補の取捨を、この 1 件で決める。追随すると決めたものは後続タスクとして起票し、本タスクでは実装しない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 v1.50.1 と v1.53.0 の差分のうち Atlas に効くものが、開いた版（v1.51.0・v1.52.0・v1.53.0）ごとに、何を測ったか・値・測定日つきで記録されている。v1.53.0 はソースを読んだだけなので、実行して確かめた結果も記録されている
- [x] #2 MIN_VERSION を上げる／上げないの判断と理由が記録されている。上げる場合はどの版へ上げるかと、decision-27 §3 が測り直しを要求する註記の範囲が数えられている
- [x] #3 due_date（タスク・マイルストーンの両方）の扱いが決まっている。読取・表示へ載せるなら後続タスクが起票され、載せないなら理由が書かれている
- [x] #4 project 属性の扱いが決まっている。Atlas 自身のプロジェクトとの語の衝突を doc-1 の対応表でどう扱うかを含む
- [x] #5 予約マーカー行を含む本文を利用者が保存したときに画面へ出る文言が確認されている
- [x] #6 CLI が持つ手段のうち Atlas が使っていないものが、開いた版（v1.51.0・v1.52.0・v1.53.0・v1.50.1 以前）に分けて列挙され、追随する／しないの取捨が理由つきで記録されている
- [x] #7 複数タスクの一括編集を追随するかが決まっている。追随するなら decision-18 のプロジェクト単位排他と doc-9 の競合検出への影響が書かれている
- [x] #8 draft edit の扱いが決まっている。doc-5 §3.3 が draft の内容編集を出さない理由に挙げた「CLI に手段が無い」が v1.51.0 で成り立たなくなったことへの対応を含む
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. v1.50.1・v1.51.0・v1.52.0・v1.53.0 を使い捨てのディレクトリへ並べて導入し、全サブコマンドの help からオプション集合を採って差を取る。Atlas が発行する 13 サブコマンド・36 オプションの存否を版ごとに確かめる。
2. Atlas が発行する形の操作列を 4 版へ流し、管理ファイルを日付を除いて比べる。v1.53.0 で新しい手段（複数 ID 編集・draft edit・due_date・project・頁送り）を実行し、出力と書かれる frontmatter を記録する。
3. 予約マーカー行の拒否を、欄（description・plan・notes）とマーカー（7 種）の組で測り、書かれたファイルを Atlas の読み取り層に通して健全性を見る。AC #5 の画面文言は文言表（failureDetail）から組み立てて確認する。
4. 方針（床・draft edit・due_date・project・一括編集・残りの取捨）をオーナーに諮り、新しい decision に記録する。doc-5 に v1.50.1→v1.53.0 の版差記録を足し、§3.3 に draft edit の扱いを書く。doc-1 に Backlog の project 属性の行を足す。
5. 後続タスクを起票する: 床を v1.51.0 へ上げる、draft の内容編集を提供する、due_date を読んで表示する、予約マーカー行を保存前に拒む。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
判断は decision-48 に、版差記録は doc-5 §3.6 に、Backlog の project 属性の行は doc-1 の新しい追補に置いた。§3.3 には、理由が上位版で成り立たなくなったことと decision-48 への参照を足した。後続は TASK-208（最低バージョン要件を v1.51.0 へ）・TASK-209（draft の内容編集。TASK-208 に依存）・TASK-210（due_date の読み取りと表示）・TASK-211（予約マーカー行を発行前に拒む）として起票した。

オーナーの判断（2026-10-12）: 最低バージョン要件は draft の内容編集とともに v1.51.0 へ上げる（v1.53.0 にしないのは、v1.52.0・v1.53.0 が書く手段を足していないため）。due_date は読み取りと表示だけを取り込む。project 属性は取り込まず doc-1 に行を足す。複数タスクの一括編集は取り込まない。

実測（2026-10-12、macOS、4 版を使い捨てのディレクトリへ並べて導入）:
- AC #1: 全サブコマンドの help を辿ってオプション集合の差を取った（v1.50.1 は 50 画面、v1.51.0 以降は 51 画面）。削除・改名は 0 件。Atlas が発行する 13 サブコマンド・36 オプションは 4 版すべてにある。本タスクの Description にある「34 オプション」は内訳を足すと 36 で、数え違いである。Atlas が発行する形の操作列を 4 版へ流し、管理ファイルを日付を伏せて比べた。予約マーカー行の 2 手を除いて、config.yml も含めバイト単位で一致した。書かれたルートを読み取り層に一時テストで通しても、v1.50.1 と v1.53.0 で差はその 2 手だけだった。一時テストは外してある。
- v1.53.0 は 2026-09-26 時点で npm の導入制限にかかっていた。今回は公開から 18 日経っており、実行で確かめた。ソース差分の読みと食い違う点は無かった。
- 予約マーカー行: description・plan・notes の 3 欄 × 7 種の境界行 = 21 通り。v1.50.1 は全部書き、v1.53.0 が拒んだのは自欄の境界行の 3 通りだけだった。残る 18 通りは、どの版でも読み取り層が想定外スキーマで縮退させる。これは追随とは別の欠陥なので TASK-211 に切り出した。拒否は呼び出し全体に掛かる（同じ呼び出しの --title も書かれない）。
- AC #5: edit.ts の failureDetail に v1.53.0 の stderr を渡す一時テストを動かし、日英の出力を得た。日本語は「task edit が失敗しました（終了コード 1）: Implementation Notes content cannot contain the reserved marker line "…". Indent it with a space to include it as literal text.」。一時テストは消してある。Tauri 窓の上での目視はしていない（画面がこの文字列をそのまま出すことは failureDetail の呼び出し元による）。
- 一括編集: 共有欄だけを受け付け、--title・--description・--notes は拒む。途中の ID が見つからなくても残りへ適用して終了コード 1（1 99 でも 99 2 でも）。
- draft edit: 内容は書ける。status は Draft のみ。due_date: YYYY-MM-DD のみ。project: config.yml の projects: が無ければ拒む。

AC #2 の数え方: backlog/tasks を除いた 1.50.1 の文字列は 154 行・40 ファイル（CLAUDE.md は AGENTS.md へのシンボリックリンクなので 1 回だけ数えた）。層ごとには decisions 13・docs 22・AGENTS 和英 4・Rust 65・フロントエンド 48・wire-fixtures 2。decision-27 に従い、種別ごとの確定値は TASK-208 が 1 件ずつ読んで数え直す。decision-48 にもそう書いた。数えている途中で、src/lib/settings-controller.test.ts の 2 か所の版リテラルが decision-27 §1 に反していることを見つけ、TASK-208 の範囲に入れた。

台帳の運用: 新しいタスク ID が trial/snz-design-tokens 上の未 push の TASK-207 とぶつかるため、起票の間だけそのファイルを作業ツリーへ置き、CLI に 208 から採番させた。置いたファイルは消してある。本タスクを広げたオーナーのコミット 3784081 は、同じブランチから cherry-pick した。
<!-- SECTION:NOTES:END -->
