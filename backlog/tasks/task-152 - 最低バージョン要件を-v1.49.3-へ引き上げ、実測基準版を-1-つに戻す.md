---
id: TASK-152
title: 最低バージョン要件を v1.49.3 へ引き上げ、実測基準版を 1 つに戻す
status: In Review
assignee: []
created_date: '2026-08-12 02:47'
updated_date: '2026-08-12 11:11'
labels:
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-154
priority: high
ordinal: 146700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-7 の最低バージョン要件を v1.48.0 から v1.49.3 へ引き上げる。2026-08-12 に TASK-99 のセッションで、ユーザーが 1.50.x を「公開から日が短すぎる」として採らず 1.49.3 まで上げると確定した（~/.npmrc の min-release-age=7 と同じ基準で、1.49.3 は公開 9 日・1.50.0 は 3 日）。decision-7 の「上限は固定しない」は動かさないので、1.50.x 利用者は従来どおり縮退の対象外のまま動く。技術的障害が無いことは TASK-99 のセッションで実測済みで、次の 4 点が根拠である。①Atlas が発行する 13 サブコマンド・34 オプション（update.rs の allowed_options）は v1.49.3 に全部存在し、削除も改名も 0 件。1.48.0 からの増分は task edit の --append-plan と doc create の --plain だけで、Atlas はどちらも発行しない ②管理ファイルの書式（frontmatter の鍵集合・SECTION マーカー・本文の並び）は同一で、読み取り層は影響を受けない ③doc-5 §3.1 が「CLI から行えない」と書いた 3 操作（--ref "" / --depends-on "" / -a "" の沈黙無変更）は v1.49.3 でも同じで、反転は v1.50.0 から。実バイナリで v1.48.0 と v1.49.3 の両方に同じ操作列を流して確認した ④doc-5 §3 と §3.4 が記録する他の実測（--acceptance-criteria の全置換と --check-ac との併用不可、--add-label のフラグ繰り返しが累積、--priority の拒否メッセージの表記、未宣言 status の拒否、task complete が非 Done で失敗、draft promote の採番し直し）も v1.49.3 で成立を確認済み。作業の本体は実測基準版の書き換えである。TASK-99 のセッションでは、その規模を PR #102 の適用前の main で 179 箇所（docs 41・decisions 16・src-tauri/src 62・src 58・AGENTS 2）と数えた。この 179 は着手時に使う値ではない — PR #102 自身が 5 箇所を足しており、同 PR の時点では 184 になっている。**着手前に依存先の TASK-154 が数え直した値を使う**（TASK-154 の AC #5 がそれを求めており、TASK-154 は集約によってこの数そのものを減らすので、引き上げ時に実際に触る箇所は 184 より少ない）。過去の記録である backlog/tasks の 23 箇所は書き換えない。src-tauri/wire-fixtures/ の記録 2 箇所は生成物なので手で編集せず、ATLAS_RECORD_WIRE_FIXTURES=1 cargo test で再記録して commit する。TASK-58 が v1.47.1 から v1.48.0 へ上げたときと同型の作業で、そのとき decision-7 に書いた「doc の実測記述の基準版を 1 つに保つための選択」という理由がそのまま当てはまる。

**TASK-154 が数え直した値（2026-08-12。レビュー後に 1 件ずつ読み直した確定値）**: 引き上げで触るのは **95 箇所・30 ファイル**である。内訳は、コードと AGENTS の実測註 82（Rust 48・フロントエンド 32・AGENTS 2）・7 つの doc の実測基準版の宣言 7・update.rs の MIN_VERSION の定義 1・decision-7 の要件本文 1・README 4（2 言語 ×2）。**この 82 はすべて再実測を伴う** — decision-27 §4 が実測註をリテラルのまま残すと決めており、そのリテラルを書き換える行為が再実測の契機だからである。機械的な一括置換で済ませてはいけない。**触らないもの**: 版差記録 13 箇所（doc-5 §3.4 の 4・doc-9 §5 の 1・decision-7 の履歴など 5・update.rs の `-l` フラグ繰り返しの 3。2 つの版を名指すことに意味があるので基準版が上がっても動かない）、decisions の日付つき実測註 9 箇所（過去の判断が立っていた事実。decision-27 §5）、付随的な版表記 11 箇所（decision-27 Context の 7 種類目。update.rs の `Version::parse` の doc comment は parser の入力例、edit.ts の `TRANSITION_CONFIRM_QUESTION` の註は 2026-08-11 に却下された初稿の引用、screen-text.test.ts の見本 5・doc-11 の引用 1・decision-27 の Context 3）、src-tauri/wire-fixtures/ の記録 2 箇所（生成物。ATLAS_RECORD_WIRE_FIXTURES=1 cargo test で再記録してcommit する）、backlog/tasks（過去の記録）。**画面文字列には版表記が無くなった**（decision-27 §2、doc-11 §8）ので、旧 AC #4 が求めていた「利用者が画面で読む 3 つの理由文の版表記」は対象として存在しない。**要件の写しも 0 になった**（decision-27 §6）ので、decision-2・doc-4 §4・doc-5 §3 は触らない。

**本タスクが決める争点が 1 件ある（decision-27 §4 が委譲した）**: 上げても挙動が変わっていなかった実測註を、「v1.48.0 以降」のような範囲表記にするか、動かさずに残すか、それでも新しい版へ動かすか。**現状の decision-27 §3・§4 は 3 つ目（動かす）を前提に書いてある** — decision-7 の「doc の実測記述の基準版を 1 つに保つ」に従っているため。2026-08-12 にユーザーが「上げても挙動が変わっていなければ特に追記も必要ない箇所もありそう」と指摘したので、本タスクで判断して decision-27 へ追記する。**どれを採るにしても、確かめずにリテラルだけ動かすことは decision-27 §4 が禁じている。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-7 の最低バージョン要件が v1.49.3 になり、引き上げの理由と、1.50.x を採らなかった理由が書かれている
- [x] #2 update.rs の MIN_VERSION が v1.49.3 で、probe が v1.49.3 未満を Unsupported に落とすことが試験で固定されている
- [x] #3 7 つの doc（doc-3・4・5・7・8・9・10）の実測基準版の宣言が v1.49.3 になり、その宣言を動かすときに各 doc の実測記述を測り直している（decision-27 §3）
- [x] #4 コードと AGENTS の実測註 82 箇所（Rust 48・フロントエンド 32・AGENTS 2）が v1.49.3 で測り直されている。版差記録 13・decisions の実測註 9・付随的な版表記 11 は書き換えていない（decision-27 §4・§5・Context）
- [x] #5 README の導入要件が v1.49.3 以上になっている（2 言語とも）
- [x] #6 画面に出る文へ版表記を戻していない（decision-27 §2、doc-11 §8）
- [x] #7 挙動が変わっていなかった実測註の書き方（範囲表記か据え置きか新版へ動かすか）を判断し、decision-27 §4 へ追記している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 再実測の方法と結果（2026-08-12）

**両版を並べて測った。** グローバルに v1.49.3 を入れ、v1.48.0 は作業場のローカル導入
(`npm install backlog.md@1.48.0`) で残し、同じ測定スクリプトを両方の `backlog` に対して流して
出力を差分比較した。絶対パスと時刻だけを正規化してある。

- **オプションの棚卸し**: Atlas が発行する 13 サブコマンドの `--help` を両版から取り、
  `update.rs` の `allowed_options` の 34 オプションと突き合わせた。**v1.49.3 に欠落 0 件**。
  13 サブコマンド全体でのオプション集合の差は **`task edit --append-plan` の追加 1 件だけ**で、
  削除も改名も無い。Atlas はこれを発行しない。`--clear-ac`・`--clear-labels`・`--clear-milestone`
  は v1.48.0 にも既にあり、本引き上げで現れたものではない。
- **挙動の実測**: 使い捨ての Backlog ルートへ同じ操作列を流した。確かめたのは、`--ref ""` /
  `--depends-on ""` / `-a ""` の沈黙無変更（終了コード 0 で消えない）、`task edit -a` のカンマ分割と
  `task create -a` の非分割、`--acceptance-criteria` の全置換と `--check-ac` との併用拒否、1 回の
  `task edit` での `--remove-ac`（読んだままの番号）と `--check-ac`（削除後の番号）、`--labels` の
  コンマ 1 値、`--add-label` のコンマ形式が全ラベルに効くこと、`doc update --tags ""` がタグを消し
  `--type ""` は拒否されること、`--content` の本文全置換、`milestone add -d` が `## Description`
  見出しを書くこと（SECTION 対ではない）、マイルストーンの id・title 両方での参照と前後空白・
  大文字小文字の無視、rename が id を保つこと、rename の書き換えがアクティブなタスクに限られること
  （draft・completed・archive はハッシュ不変）、`milestone remove` がファイルを消さず
  `archive/milestones/` へ移すこと、`milestone` に `update`/`edit` が無いこと、`decision` が
  `create` だけを持つこと、archive が `tasks`/`drafts`/`milestones` へネストすること、
  `task_prefix` が小文字でも生成 ID が `TASK-N` であること、`config.yml` と `backlog config list` に
  版欄が無いこと、日時が UTC で秒を持たないこと、`--priority` と未宣言 status の拒否文面、
  `task complete` が非 Done で失敗し Done で `completed/` へ移すこと、`task edit` に
  expected-version 系のオプションが無いこと、`init --defaults` が `In Review` を宣言しないこと。
- **違いが出たのは 1 点だけだった**: completed タスクへの `task edit` の失敗文面が、v1.48.0 の
  `Task 4 not found.` から v1.49.3 の `Task not found: TASK-4` へ変わっている。**終了コードは
  両版 1** で、更新アダプターは成否を終了コードで判定し stderr は理由としてそのまま渡すので
  （`update.rs` の非ゼロ終了の分岐）、依存箇所は無い。doc-8 §6.5 へ版差記録として書き、文面を
  1 つのリテラルへ固定しないことを明記した。

## AC #7 の判断（decision-27 §4 へ追記）

**確かめたうえでリテラルを新しい版へ動かす**を採った。却下した 2 案の理由は次のとおりで、
本文は decision-27 §4 にある。

- **範囲表記は採れない。理由は 2 段あり、1 段目だけで足りる。** ①**範囲は測っていない版に
  ついての主張を含む。** 走らせたのは v1.48.0 と v1.49.3 の 2 版だけなので、間の v1.49.0・
  v1.49.1・v1.49.2 は測定の形として未実測である。上限を閉じても同じ穴が残り、「不可能」と
  「未測定」の区別が壊れる。②**上限の開いた範囲は偽である疑いも濃い** — TASK-153 が v1.50.0 が
  `--ref ""` 等の沈黙無変更を反転させたと記録している（`task-builders.ts` の
  `parseClearableStringList`）。**ただし本タスクは v1.50.x を実測していない** —
  `~/.npmrc` の `min-release-age=7` が取得自体を弾くためで、それは採らない理由と同じものである。
  測ってある側は整合している（`--clear-refs`／`--clear-deps`／`--clear-docs` は両版に無い）。
- **据え置きは decision-27 §5 の線を消す。** decisions の実測註を動かさない根拠は日付つきの
  歴史だからで、コードの実測註はいまのコードが拒否を行う根拠である。据え置くと両者が同じ
  振る舞いになり、「確かめて無変更」と「確かめ忘れ」も読み分けられない。
- **節約が見込まれた費用はリテラル側に無い。** 据え置きでも「変わっていない」と言うには測る
  必要があるので、再実測の量は 3 案で同じ。動かす案が余分に払うのは打ち直しだけで、それが
  §4 が求める確認の契機そのものである。

## 触った範囲

**95 箇所・30 ファイル**（TASK-154 の確定値どおり）。内訳は実測註 82（Rust 48・フロントエンド 32・
AGENTS 2）・doc の実測基準版の宣言 7・`MIN_VERSION` の定義 1・decision-7 の要件本文 1・README 4。
**触っていない**のは版差記録 13・decisions の実測註 9・付随的な版表記 11 で、書き換え漏れ・
書き換え過ぎの両方を、除外行を明示した検査つきスクリプトで確認した（82 件ちょうど）。
`src-tauri/wire-fixtures/` の 2 箇所は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で再記録した。

AC #2 には `the_boundary_sits_exactly_at_the_confirmed_floor` を足した。**床の直下と床そのものを
`MIN_VERSION` から導いて**両側を固定するので、床を上げると境界も動く。既存の
`a_too_old_version_is_unsupported` は無関係な 1.46.0 を使っており、v1.48.0 のように**以前は
supported だった版**が Unsupported へ落ちることは固定していなかった。

## 検証

`cargo test` 395 passed / 0 failed / 4 ignored、`cargo fmt --check` clean、`cargo clippy
--all-targets` 警告なし、`pnpm test` 847 passed（32 ファイル）、`pnpm run check` 497 ファイル
0 エラー 0 警告。画面文字列に版が戻っていないことは `screen-text.test.ts` が版非依存の正規表現で
見ており、そこは通っている。

**`pnpm test` の内訳（TASK-150 の記録として残す）**: 本セッションでフルスイートを 6 回流し、
**3 回目に 1 件落ちて他 5 回は 847/847 だった**。1・2 回目は通っているので、**既存 4 例の
「1 回目だけ」という形には当てはまらない** — この形は兆候の定義に使えない。**落ちた 1 件の名前は
取り逃した**（出力を `grep` で絞ったため）ので、既存 4 例と同じ `markdown-figure.component.test.ts`
だったとは言えない。その後 3 回流しても再現しなかった。**次にこれを見た回は、絞る前に全出力を
ファイルへ落とす**（`pnpm test > log 2>&1`）。TASK-150 自身の記録を広げるのはそのタスクの仕事である。

## レビュー（Claude Code CLI、bot 名義。2 ラウンド）

**ラウンド 1: [P2]2・[P3]3、押し返し 0 件。**最も効いたのは**実測日付**の指摘だった — 版リテラルを
v1.49.3 へ動かしたのに実測日付を元の測定日のまま残した註が 11 箇所あり、npm の公開時刻
（1.49.3 は 2026-08-03、1.49.0 は 2026-08-02）と突き合わせると **4 箇所は v1.49.3 が存在しない日付**
だった。**リテラルの書き換えが再実測の証明だという decision-27 §4 の仕掛けを、日付が逆向きに壊す。**
版と日付は同じ括弧に入れる（`update.rs:301` の形）。

この指摘を追う過程で、**測り直したら主張そのものが偽だった箇所**が 1 件出た
（`interpret/type_value.rs` の「`config.yml` は `--type` の語彙を広げられない」。`types:` を足すと
受け付ける。**v1.48.0 でも偽**なので版差ではなく誤り）。**註を 1 件ずつ読み直したら、初回の測定が
動かしていなかった主張も 5 件出た**（挙動グループでまとめて測ったため漏れた）。**次の引き上げは
グループではなく註の単位で測る。**

**ラウンド 2: [P2]1・[P3]3。**[P2] は版差記録の総数で、**同じ数を 4 者が 4 回とも外していた** —
TASK-154 の初版（122→100）、本タスクの初稿（17）、レビュワー（19）、そして数え直した実数は 21。
**総数の手書きをやめ、①種別の規則・②機械的に再導出するコマンド・③実害のある membership の列挙に
置き換えた**（decision-27 Consequences）。総数は引き継がず導出する。**membership は実害が違う** —
`period.ts` と `edit.ts` が版差記録の一覧から落ちていると、次の担当がそれを「移し漏れた実測註」と
読んで動かし、旧床で取られた観測が新しい床の実測に化ける。これはラウンド 1 で消した偽そのものである。
<!-- SECTION:NOTES:END -->
