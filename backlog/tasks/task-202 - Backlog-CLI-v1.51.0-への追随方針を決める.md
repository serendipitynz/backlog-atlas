---
id: TASK-202
title: Backlog CLI v1.51.0 への追随方針を決める
status: To Do
assignee: []
created_date: '2026-09-05 23:40'
updated_date: '2026-09-05 23:45'
labels:
  - 'kind:research'
milestone: m-4
dependencies: []
priority: medium
ordinal: 193700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-09-02 に Backlog CLI v1.51.0 が公開された。2026-09-06 に v1.50.1 と並べて実測した結果、現行の Atlas は v1.51.0 が書いたルートをそのまま読めるが、v1.51.0 が開いた手段のうち 3 件は Atlas に載っていない。本タスクは追随の方針 — 動作確認済み版を上げるか、新しい手段と値をどこまで取り込むか — を決める。

## 実測でわかったこと（2026-09-06、macOS、v1.50.1 と v1.51.0 を並置）

壊れるものは無い。①frontmatter は key ごとの抽出なので未知キーは縮退イベントを出さない。②SECTION マーカーの語彙は DESCRIPTION・PLAN・NOTES・FINAL_SUMMARY と AC・DOD・COMMENTS のままで、read/parse.rs の KNOWN_SECTIONS の主張は v1.51.0 でも成立する。Comments ブロックの形（author 行・created 行と 3 連ハイフンの区切り）も同じ。③update.rs の許可リストが持つ 34 オプション（task create 6・task edit 19・doc create 2・doc update 5・milestone add 1・rename 1・remove 2）は全部 v1.51.0 に存在し、削除も改名も 0 件。④milestone は依然 add・rename・remove・archive・list だけで update も edit も無く（rename は期限の指定を得たが説明は create 時のみ）、decision について本文を書けるオプションも依然として無い。decision-21 の例外と AGENTS の decision 直接編集の根拠は保たれている。

意味が変わったのは 1 件である。予約マーカー行を含む本文を渡すと、v1.50.1 は黙って入れ子にして書いていたが、v1.51.0 は理由を stderr に出して終了コード 1 で拒む。Atlas から見れば doc-5 §5 の CLI 失敗として既存経路に乗るので壊れない — decision-7 が上限を置かず「CLI 自身が拒む」に頼っている、その通りの挙動である。

## 追随候補と、その出どころの版

CLI の手段のうち Atlas が使っていないものは多いが、**v1.51.0 が新しく開いたのは次の 3 件だけである。** 残りは v1.50.1 以前からあり、追随していないのは版差ではなく積み残しなので、取捨の理由も別になる。

v1.51.0 で開いたもの（オプション名の集合を両版の help から採って差を取った。削除・改名は 0 件）:

- **複数タスクの一括編集** — task edit の引数が taskId 1 個から taskIds の並びになり、同一の共有フィールド変更を複数タスクへ一度に適用できるようになった。Atlas の 列間ドロップ はカード 1 枚を動かす操作で、更新層の task edit も位置引数を 1 個しか組み立てない。追随するなら、複数選択の操作・位置引数の複数化・decision-18 のプロジェクト単位排他・doc-9 の競合検出をまとめて扱うことになる。
- **期限（due_date）** — task create と task edit に指定と解除が、milestone add と milestone rename にも同じものが付いた。frontmatter にも載るが読み取り層が読まないので、画面には現れない。
- **project 属性** — task create・task edit・task list に付いた。Backlog 側のモノレポ用で、Atlas 自身のプロジェクトと語がぶつかる。

読み取り側で v1.51.0 が増やしたものも 2 件ある。依存の逆参照と循環・欠損・曖昧の判定（doctor も自己参照と循環を報告するようになった）、および Acceptance Criteria の進捗表示。Atlas は dependencies を読むだけである。

v1.50.1 以前からあり、Atlas が使っていないもの（v1.51.0 の新機能ではない）:

- タスクの型指定（--type）と並び順（--ordinal）
- 参照の増減（--add-ref・--remove-ref）と、ラベル・AC・マイルストーン・Final Summary・documentation の一括消去（task edit の --clear- で始まる 7 つのうち、Atlas が既に使う --clear-deps と --clear-refs を除いた 5 つ）
- Definition of Done、Comments、Acceptance Criteria の一括置換（--acceptance-criteria）
- modified_files と documentation の書き込み（--modified-file・--doc）

このうち Definition of Done と Comments と Final Summary は TASK-189 が、Acceptance Criteria の鍵は TASK-190 が、ラベルの増減差分は TASK-196 が既に持っている。本タスクはそれらと重ならない範囲で取捨を決める。

## 決めること

decision-7 は上限を置かないので、v1.51.0 の利用者は現状のまま Supported である。MIN_VERSION を上げる必要は無く、上げると v1.50.x を切ることになるのでそれ自体が決定であり、さらに decision-27 §3 により「v1.50.1 で実測」と書かれた註記を測り直す作業が付いてくる。上げる／上げないの判断と、上の追随候補の取捨を、この 1 件で決める。追随すると決めたものは後続タスクとして起票し、本タスクでは実装しない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 v1.51.0 と v1.50.1 の差分のうち Atlas に効くものが、何を測ったか・値・測定日つきで記録されている
- [ ] #2 MIN_VERSION を上げる／上げないの判断と理由が記録されている。上げる場合は decision-27 §3 が測り直しを要求する註記の範囲が数えられている
- [ ] #3 due_date（タスク・マイルストーンの両方）の扱いが決まっている。読取・表示へ載せるなら後続タスクが起票され、載せないなら理由が書かれている
- [ ] #4 project 属性の扱いが決まっている。Atlas 自身のプロジェクトとの語の衝突を doc-1 の対応表でどう扱うかを含む
- [ ] #5 予約マーカー行を含む本文を利用者が保存したときに画面へ出る文言が確認されている
- [ ] #6 CLI が持つ手段のうち Atlas が使っていないものが、v1.51.0 で開いたものと v1.50.1 以前からあるものに分けて列挙され、追随する／しないの取捨が理由つきで記録されている
- [ ] #7 複数タスクの一括編集を追随するかが決まっている。追随するなら decision-18 のプロジェクト単位排他と doc-9 の競合検出への影響が書かれている
<!-- AC:END -->
