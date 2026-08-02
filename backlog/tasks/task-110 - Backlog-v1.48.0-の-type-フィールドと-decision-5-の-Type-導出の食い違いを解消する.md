---
id: TASK-110
title: Backlog v1.48.0 の type フィールドと decision-5 の Type 導出の食い違いを解消する
status: In Review
assignee: []
created_date: '2026-08-01 07:57'
updated_date: '2026-08-02 03:20'
labels:
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-58
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-58 の実測により、Backlog CLI v1.48.0 が `task create --type` / `task edit --type` を受け取り、frontmatter に `type:` フィールドを書くことが分かった（設定既定の値域は bug・feature・enhancement・task・chore・docs・spike。空値を渡すと解除される）。v1.47.1 には無かったオプションである。

一方 Atlas は decision-5 により Type を `kind:` ラベルの接頭辞除去で導出しており、frontmatter の `type:` を読まない。したがって v1.48.0 の CLI で Type を付けたタスクは、Atlas の画面では Type 不在として表示される。利用者から見ると、CLI で設定した値が反映されない機能欠落に見える。

公開阻害の判定: ユーザーが v0.1.0 までと列挙した範囲には入らないが、未対応のまま公開すると利用者の誤解を招くため公開阻害に当たると判断し m-2 に置く。ただし `type:` は `--type` を明示的に渡したときにだけ書かれ、`task create` の既定では付かない。

このタスクで決めること: `type:` フィールドを読むか、読むなら `kind:` ラベル由来の Type とどちらを優先するか、両方ある場合をどう表示するか（decision-5 は複数 kind・未知値・不在を分けて表示する規則を持つので、その枠組みへ載せる）。既存 decision-5 の判断を変えるので決定先行タスクとして扱い、decision を先に確定してから doc-4・doc-8 と実装へ入る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 frontmatter の type: を読むかどうかと、kind: ラベル由来 Type との優先関係を decision として残す
- [x] #2 decision-5 のどの判断を変えるか（または変えないか）を新 decision 本文に書く
- [x] #3 doc-4 の読み取り層と doc-8 の Type 表示を決定に合わせて改訂する
- [x] #4 決定が読み取りを伴う場合、type: を持つタスクの表示を実装しテストで固定する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-02 に実装した。

**先に確定したこと（決定先行）**: 対応順の表に元から決 印があるタスクで、実装より先に
**decision-20** を書いてユーザーの確認を得た。対応表は
`_sandbox/referent-table-task-110-type-field.md` 第 2 版に先行確定した（第 1 版から 1 行を
直した。下の「畳み込みの範囲」を参照）。ユーザーが選んだのは **type フィールドを読んで
kind ラベル由来と合流**・**既知 Type 集合を和集合 10 語へ**・**同値は畳む**・**編集経路は
今回作らない** の 4 点。AGENTS.md / AGENTS.ja.md は改訂していない（Type 導出に触れる記述が
無いため。TASK-60・85・87 と同じ）。

**測り直した**: TASK-58 の記録に依存せず、使い捨ての Backlog ルートへ `backlog init` して
`--type` の挙動を実測した（2026-08-02、backlog 1.48.0）。結果 4 件は decision-20 の Context に
ある。**TASK-110 の Description が書いた「設定既定の値域」は不正確だった** — 7 語は CLI に
固定されていて、`config.yml` へ `task_types:`／`taskTypes:` を手で足しても無視され、
`config set` の受理キー一覧にも Type 語彙は無い。プロジェクトでは増減できない。

**AC #1・#2 decision-20**: Type 導出元を 2 つにし、優先関係を置かず併記する。decision-5 の
中心の判断（0 個以上の並び・丸めない・捨てない・未知も表示）は反転していない。反転しない
根拠は、二重指定が起きるのはプロジェクトが両方を使っているときであり、どちらが正本かを
Atlas は知らないこと。並び順は kind ラベル由来が先で、これにより type フィールドを持たない
既存プロジェクト（このリポジトリ自身を含む）の表示は 1 文字も変わらない。

**畳み込みの範囲を対応表 第 2 版で広げた**: 第 1 版は畳む対象を「同値の二重指定」（2 つの
導出元にまたがる場合）に限っていた。それだと `kind:bug` + `type: Bug` は 1 つになり
`kind:bug` + `kind:Bug` は 2 つ並ぶ。doc-8 §4 は Type 値の由来を画面に出さないので、読み手には
この 2 つを区別する手掛かりが無く、規則を 2 通り説明できない。指示対象を導出元によらない
**同値の重複** へ広げ、decision-20 の本文を書き直した。**これが decision-5 の挙動を変えた
唯一の箇所**で、`kind:bug` と `kind:Bug` を持つタスクの表示が 2 値から 1 値になる。

**AC #3 doc 改訂**: doc-4 は用語に type フィールド・Type 導出元を足し、3.1 の `type` 行と
3.3（表題を「Type 候補を集め、通常ラベルと分離する境界」へ）と §4 の任意フィールド列挙を
直した。doc-8 は §3 の表の Type 行の由来と、§4 に「由来は画面に出さない」「Atlas は
type フィールドを編集できない」の 2 項を足した。doc-5 §3.4 の `--type` が
「この食い違いは TASK-110 で扱う」と予約していた箇所を decision-20 の参照へ置き換え、
操作写像に足さない理由が製品判断であることを doc-10 §1 の規則に沿って書いた。
decision-5 には注記を 2 箇所（Decision 節と既知 Type 集合の定義）入れた。

**AC #4 実装**: 読み取り層（`read.rs`）が frontmatter `type` を読み、kind ラベル由来の
後ろへ足す。空文字列・空白だけは候補を生まない（CLI の解除はキーごと消すので、空値は
手編集の残骸）。解釈側（`interpret/type_value.rs`）が既知判定と畳み込みを行う。
**`Task::type_labels` を `type_candidates` へ改名した** — 中身が kind ラベルだけではなく
なったので、名前が偽になるため。ワイヤ名は `type` のままで（`#[serde(rename = "type")]`）、
境界の契約は変えていない。既知 Type 集合は 5 → 10 語。

**ドメインモデルは畳まない**: `Task::type_candidates` はファイルが実際に書いていた候補を
すべて持ち、畳んだ並びを見るのは `TaskInterpretation::types` 側だけ。両者の個数は一致しない
ことがある（`a_repeated_value_is_still_two_candidates_in_the_model` がこれを固定）。

**主張を壊して確かめた 5 件**: (1) `type` の読み取りを外すと read 層の 3 件が落ちる。
(2) 畳み込みを外すと interpret 側の 3 件が落ちる。(3) type フィールドを kind ラベルより前へ
入れると `both_type_origins_are_kept_with_kind_labels_first` が落ちる。(4) 既知 Type 集合から
`chore` を落とすと `the_cli_type_vocabulary_is_known` が落ちる（語を 1 つずつ名指しして
いるので、件数合わせでは通らない）。(5) 空値の判定を外すと
`a_blank_type_field_yields_no_candidate` が落ちる。

**検証**: `cargo test` 343 件（ignored 4）、`cargo test -- --include-ignored` 347 件、
`cargo fmt --check`・`cargo clippy --all-targets` 無指摘。`pnpm test` 513 件、
`pnpm run check` 282 ファイル・0 errors、`pnpm run build` 成功。
**wire fixture の再記録は不要だった** — ワイヤの型も union のトークン集合も増減しておらず、
`Task.type` は `string[]` のままである（`wire.ts` の説明文だけを直した）。

**自動検査で届いていない範囲**: 画面に実際に Type チップが 2 つ並ぶところは見ていない。
Svelte 側は 1 行も触っておらず、`TaskCard`／`TaskDetail` は以前から
`interpretation.types` を並びとして描いているので経路は変わっていないが、この環境は
`screencapture` が使えないので目視の確認はユーザーへ依頼する。
<!-- SECTION:NOTES:END -->
