---
id: decision-48
title: >-
  Backlog CLI v1.51.0〜v1.53.0 には draft の内容編集と due_date の表示だけを追随し、最低バージョン要件は
  draft の内容編集とともに v1.51.0 へ上げる
date: '2026-10-11 19:30'
status: accepted
---
## Context

Backlog CLI は v1.50.1 のあと、v1.51.0（2026-09-02）・v1.52.0（2026-09-12）・v1.53.0（2026-09-24）の 3 版を公開した。
最低バージョン要件は v1.50.1 で（decision-7）、上限は固定していないので、3 版の利用者は現状でも動作保証の範囲にいる。
本決定は、3 版が開いた手段と値のうち何を Atlas へ取り込むか、最低バージョン要件を上げるかを決める（TASK-202）。

語を 2 つ定める。**追随** とは、CLI の版が開いた手段または値を、Atlas の操作写像・読み取り層・画面へ取り込むことを指す。
最低バージョン要件を動かすこととは別の対象で、本決定は両方を決める。**予約マーカー行** とは、本文の欄に渡す文字列のうち、行全体が
管理ファイルの節境界コメント（`SECTION:DESCRIPTION`・`PLAN`・`NOTES`・`FINAL_SUMMARY` の BEGIN・END と、`AC`・`DOD`・`COMMENTS`
の BEGIN・END）と一致する行を指す。

### 実測（2026-10-12、macOS）

4 版（v1.50.1・v1.51.0・v1.52.0・v1.53.0）を使い捨てのディレクトリへ並べて導入した。v1.53.0 は 2026-09-26 の時点では
npm の公開経過日数の制限にかかって導入できず、ソース差分しか読めていなかった。その欄を、ここで実行による確認に置き換える。

- **オプション集合**: ルートから全サブコマンドの help を辿り（v1.50.1 は 50 画面、v1.51.0 以降は 51 画面）、オプション名の集合の差を
  取った。削除と改名は、どの版の組でも 0 件だった。増えたものは次のとおり。
  - v1.51.0: `draft edit` の新設（オプション名の集合は `task edit` と同じ 48 個）。`task edit` の位置引数が `[taskId]` から
    `[taskIds...]` になった。`--due-date` が `task create`・`task edit`・`milestone add`・`milestone rename` に、
    `--clear-due-date` が `task edit`・`milestone rename` に付いた。`--project` が `task create`・`task edit`・`task list`・`search`
    に付いた。
  - v1.52.0: `task list --watch`。
  - v1.53.0: `--max-count`・`--skip`・`--count` が `search`・`task list`・`draft list`・`milestone list`・`doc list`・`doc search`・
    `decision list` に付いた。
- **Atlas が発行するもの**: `update.rs` の `allowed_options` が持つ 36 オプションと 13 サブコマンドは 4 版すべてにあった。
  `milestone` のサブコマンドは 4 版とも add・rename・remove・archive・list で、`decision` は create・list、`decision create` の
  オプションは `--status` と `--plain` だけである。decision-21 の例外と、AGENTS の decision 直接編集の根拠は保たれている。
- **書かれるファイル**: Atlas が発行する形の操作列（作成・内容編集・空集合化・完了整理・アーカイブ・draft の昇格と差し戻し・
  文書の作成と更新・マイルストーンの作成・改称・削除・アーカイブ）を 4 版へ流し、管理ファイルを日付だけ伏せて比べた。予約マーカー行を
  渡した 2 手を除き、`config.yml` も含めて 4 版でバイト単位まで一致した。書かれたルートを Atlas の読み取り層に通すと、v1.50.1 と
  v1.53.0 で、読み取り結果の差は予約マーカー行の 2 手だけだった。
- **予約マーカー行**: description・plan・notes の 3 欄それぞれに 7 種の境界行を入れて `task edit` を発行した（21 通り）。
  v1.50.1 は 21 通りとも書いた。v1.53.0 が終了コード 1 で拒んだのは、その欄自身の節の境界行を含む 3 通りだけだった。拒否は呼び出し
  全体に掛かり、同じ呼び出しで渡した `--title` も書かれない。残りの 18 通りは v1.53.0 でも書かれ、Atlas の読み取り層はそのどれも
  想定外スキーマとして縮退させた。拒否の stderr は 1 行で、
  `Implementation Notes content cannot contain the reserved marker line "…". Indent it with a space to include it as literal text.` である。
- **複数タスクの一括編集**: 共有できる欄（status・ラベルなど）だけを受け付ける。`--title`・`--description`・`--notes` を付けると
  `Cannot use --title with more than one task ID.` で拒む。途中の ID が見つからなくても残りの ID へは適用し、最後に終了コード 1 を返す
  （`1 99` でも `99 2` でも、見つかった方は書かれた）。v1.50.1 は 2 個目の位置引数を `too many arguments` で拒む。
- **draft edit**: draft の title・description・AC・plan・notes・References・ラベル・priority・assignee を書けた。status は `Draft`
  しか受け付けず、`In Progress` を渡すと `Invalid status` で終了コード 1 になる。
- **due_date**: `YYYY-MM-DD` だけを受け付け（`31/12/2026` は終了コード 1）、タスクには `due_date: '2026-12-31'`、マイルストーンには
  `due_date: "2026-12-01"` を書く。読み取り層はこのキーを読まず、縮退も起きない。
- **project**: `config.yml` に `projects:` の一覧が無ければ `No projects are configured.` で拒む。一覧があっても、外の値は
  `Invalid project` で拒む。書かれるのは frontmatter の `project: web` で、空の値を渡すとキーが消える。読み取り層はこのキーも読まない。
- **失敗文面の追加**: id が見つからない `task edit`・`task demote` の stderr に、v1.51.0 から
  `Task lookups read only the local working copy; …` の 1 文が足された。終了コードは 4 版とも 1 で、Atlas は終了コードで判定する
  （doc-5 §5）ので影響しない。

### 画面に出る文言（AC #5）

予約マーカー行を拒まれた保存は doc-5 §5 の CLI 失敗として扱われ、`edit.ts` の `failureDetail` が文言表の `commandFailed` で組み立てる。
日本語の画面では次の 1 行になる。

`task edit が失敗しました（終了コード 1）: Implementation Notes content cannot contain the reserved marker line "…". Indent it with a space to include it as literal text.`

CLI の英文をそのまま出すので、利用者はどの欄のどの行が拒まれたかと、行頭に空白を 1 つ入れれば通ることを読める。**ただし、その勧めに従って行頭に空白を入れた行は、Atlas では安全ではない。** v1.53.0 はその行を通して書き、自分の `task view` でも本文の文字として読む。一方、Atlas の読み取り層は前後の空白を落としてから境界コメントを認識するので（`read/parse.rs` の `marker`）、同じファイルを想定外スキーマとして縮退させる（2026-10-12 に実測）。一方、上の 18 通りには
画面に何も出ない。保存は成功と報告され、次の読み込みでそのタスクに ⚠️ が付く。

## Decision

### 1. 最低バージョン要件は、draft の内容編集を提供するときに v1.51.0 へ上げる

上げる理由は draft の内容編集（§2）であり、TASK-153 と同じく能力上の要求である。上げる先は v1.51.0 とする。
draft edit が入った最初の版で、v1.52.0 と v1.53.0 は読み取りと出力の手段を足しただけで、Atlas が書くための手段は v1.51.0 と同じである。
v1.53.0 へ上げると、何も得ずに v1.51.x と v1.52.x の利用者を切ることになる。

引き上げは本決定の作業ではなく、TASK-208 が decision-27 の手順で行う。予約マーカー行の拒否は上げる理由に数えない。v1.51.0 が防ぐのは
21 通りのうち 3 通りで、残りは Atlas 側で防ぐ必要がある（§6）。その防ぎを入れれば、3 通りも版によらず防げる。

### 2. draft の内容編集を提供する

doc-5 §3.3 は、draft の内容編集を出さない理由を「CLI に draft を対象にした `task edit` 相当が無い」としていた。v1.51.0 の `draft edit` で
この前提が崩れたので、理由文を書き換えて非提供を続けるのではなく、手段を提供する。TASK-209 が、最低バージョン要件の引き上げ（TASK-208）の
後に行う。status は CLI が `Draft` しか受け付けないので、編集欄に出さない。

**TASK-209 が入るまで、画面の draft の理由文は v1.51.0 以降の利用者にとって偽である。** 文言表の `draftReadOnly` は「CLI に draft の内容を
編集する手段がないため」と述べ、その利用者の CLI には手段がある。これは承知のうえで残す。最低バージョン要件の v1.50.1 については真であり、
TASK-209 がその文ごと置き換える。

### 3. due_date は読み取りと表示だけを取り込む

タスクとマイルストーンの `due_date` を読み取り層で読み、画面に出す（TASK-210）。読むだけなら CLI の版に依らない。v1.50.1 の利用者のルートにも、
他のツールや手編集でこのキーが書かれ得る。書き込み（`--due-date` の発行）は今回は取り込まない。最低バージョン要件が v1.51.0 になった後に、
編集欄を足すかどうかを別に判断する。

### 4. Backlog の project 属性は取り込まない

**Backlog の project 属性** とは、Backlog CLI がタスクの frontmatter `project:` に書く、`config.yml` の `projects:` 一覧から選ぶ値を指す。
Backlog 側がモノレポ用に持つもので、Atlas の「プロジェクト」（台帳に登録した Backlog ルート、doc-3）とも、読み取り層の `Task::project`
（台帳の slug）とも別の対象である。読まず、書かず、表示しない。

語の衝突は doc-1 の追補に行を足して固定する。この値を将来画面に出すことになっても、画面では「プロジェクト」と呼ばない。

### 5. 複数タスクの一括編集は取り込まない

Atlas には複数のタスクを選んで 1 つの操作を掛ける画面が無く、列間ドロップ（doc-7 §4.2）はカード 1 枚を動かす。加えて、CLI の一括編集は
途中の ID が失敗しても残りへ適用して終了コード 1 を返す。doc-5 §5 の部分適用は「複数の呼び出しの途中で失敗した」状態を扱っており、
1 回の呼び出しの中で一部の ID だけが書かれる状態を写す型を Atlas は持たない。doc-9 §4 の更新前競合の検出も、1 回の発行で 1 つの管理ファイルを
照合する形である。複数タスクへの同じ操作が必要になれば、1 タスクにつき 1 回の `task edit` を並べれば、既存の部分適用の扱いに乗る。
CLI の一括編集を使う理由にはならない。

### 6. 予約マーカー行は Atlas 側で発行前に拒む

v1.51.0 以降の CLI は 21 通りのうち 3 通りしか拒まず、残りの 18 通りは、どの版でも Atlas が自分で読めないファイルを書かせる。
これは版差ではなく、Atlas の入力検査の欠落である。予約マーカー行を含む入力は発行前に拒んで理由を述べる（doc-11 §5 のカンマ関門と同じ形）。
TASK-211 が行う。

**拒む範囲は、CLI の拒否規則ではなく Atlas の読み取り層が境界と認識する形で決める。** 前後に空白を足した境界行は、CLI が本文の文字として扱う（v1.53.0）のに、Atlas の読み取り層は境界として読む。CLI の拒否文が勧める回避（行頭に空白を 1 つ入れる）に従った保存でも、Atlas はそのタスクを読み損ねる。関門をその形まで広げるか、読み取り層の認識を CLI に揃えるかは、TASK-211 が CLI の各版の認識規則を測ったうえで決める。

### 7. 残りの手段の取捨

v1.51.0 以降が開いたもののうち、上の 6 項で扱わなかったものは取り込まない。

- **`task list --watch`（v1.52.0）**: 読み取りは管理ファイルの直接解析であり（decision-2）、変更の監視は Atlas 自身が持つ（decision-11）。
  CLI の出力を監視の経路にする理由が無い。
- **`--max-count`・`--skip`・`--count`（v1.53.0）**: Atlas の更新層は list も search も呼ばない。
- **依存の逆参照・循環・欠損・曖昧の判定、AC の進捗表示（v1.51.0 の読み取り側の追加）**: CLI の表示機能であり、Atlas は dependencies
  を読むだけである。Atlas の画面で循環を示すかどうかは CLI の版と関係の無い製品判断なので、ここでは決めない。

v1.50.1 以前からあり、Atlas が使っていない手段の扱いは、既存の判断のとおりである。版差ではなく積み残しなので、本決定は判断を動かさない。

- `--type`・`--clear-ac`・`--clear-labels`: doc-5 §3.4。`--clear-docs`・`--add-ref`・`--remove-ref`・`task list --json`（読み取り
  サブコマンドとして）: doc-5 §3.5。`--acceptance-criteria`: doc-5 §3.1。
- Definition of Done（`--dod` 系）・Comments（`--comment`）・Final Summary（`--final-summary` 系）: 提供すると決まっており、TASK-189 が持つ（doc-5 §3.2）。
- `--ordinal`・`--clear-milestone`・`--append-plan`・`--modified-file`・`--doc`・`task create` の `--parent`・`--draft`・
  `--no-dod-defaults`: 対応する更新操作を Atlas は持たない。持つと決めたときに、操作写像へ足すかを個別に判断する。

## Consequences

- 望ましい帰結
  - 壊れるものは無い。v1.51.0〜v1.53.0 の利用者は現状のまま動作保証の範囲にいて、Atlas が書くファイルは 4 版で同一である。
  - draft の内容編集が提供でき、画面の理由文の偽が解消する（TASK-209）。
  - 予約マーカー行で利用者が自分のタスクを読めない形にする経路が、CLI の版によらず閉じる（TASK-211）。
- 費用・制約
  - 最低バージョン要件を上げると、v1.50.x の利用者は縮退の対象になる。
  - 引き上げは decision-27 の再実測を伴う。2026-10-12 の索引では、`backlog/tasks` を除いて `1.50.1` の文字列が 154 行・40 ファイルにあった
    （`CLAUDE.md` は `AGENTS.md` へのシンボリックリンクなので 1 回だけ数えた）。層ごとには、decisions が 13 行、docs が 22 行、AGENTS 和英が
    4 行、Rust が 65 行、フロントエンドが 48 行、wire-fixtures の記録が 2 行である。
    このうち decisions の 13 行は §5 によって動かさない（decision-7 の正本 1 行を除く）。docs の 22 行のうち 7 行は実測基準版の宣言である。
    種別ごとの数は、decision-27 の「総数は導出するもので、引き継ぐものではない」に従い、TASK-208 が 1 件ずつ読んで数え直す。
    ここに置くのは作業の大きさの見積りであって、引き継ぐ数ではない。
  - TASK-209 が入るまで、v1.51.0 以降の利用者には偽の理由文が出る（§2）。
- 後続への影響
  - TASK-208（最低バージョン要件を v1.51.0 へ）→ TASK-209（draft の内容編集）の順に依存する。TASK-210（due_date の表示）と
    TASK-211（予約マーカー行の拒否）は版に依らず、いつでも着手できる。
  - doc-5 §3.6 が 3 版の版差記録を持ち、§3.3 は本決定を指す。doc-1 に Backlog の project 属性の行を足した。
  - 次の版が出たときは、本決定の実測と同じ形（全サブコマンドの help の差、Atlas が発行する操作列の出力比較、読み取り層での健全性）で測る。
