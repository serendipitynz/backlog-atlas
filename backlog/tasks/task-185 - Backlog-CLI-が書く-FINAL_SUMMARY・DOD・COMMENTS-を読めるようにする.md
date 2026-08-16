---
id: TASK-185
title: Backlog CLI が書く FINAL_SUMMARY・DOD・COMMENTS を読めるようにする
status: In Review
assignee: []
created_date: '2026-08-16 00:28'
updated_date: '2026-08-16 21:43'
labels:
  - 'kind:bug'
  - rust
  - taskdetail
  - robustness
milestone: m-3
dependencies: []
priority: high
ordinal: 176700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.49.3 が管理ファイルへ書く本文の区切りのうち、Atlas の読み取り層が知っているのは DESCRIPTION・PLAN・NOTES の 3 つだけで（`src-tauri/src/read/parse.rs` の `KNOWN_SECTIONS`）、CLI が書く残り 3 つを読めていない。**使い捨てのプロジェクトを作り、2026-08-16 に v1.49.3 で実測した。**

- **`SECTION:FINAL_SUMMARY`** — `task create/edit --final-summary`・`--append-final-summary` が書く。doc-4 §4 の「未知の NAME」に落ちるので、**正常な CLI 出力に対して Atlas が 想定外スキーマ を立て、画面に 不整合 が出る。** 本文そのものは未知セクションとして保持され、画面にも「保持のみ」として出る。
- **`DOD:BEGIN`/`END`** — `--dod`・`--check-dod`・`--remove-dod` が書く Definition of Done。`SECTION:` 接頭辞を持たないので `parse_marker` が `None` を返し、続く行はどの捕捉にも入らないまま落ちる。**縮退事象も立たないので、画面には欠落の痕跡が何も残らない。**
- **`COMMENTS:BEGIN`/`END`** — `task edit --comment`・`--comment-author` が書く。author・created・`---` 区切りの本文という内部構造を持つ。DOD と同じく黙って落ちる。

**FINAL_SUMMARY は「うるさく間違える」、あとの 2 つは「静かに欠ける」** で、症状は違うが直す場所は `parse_marker` と `KNOWN_SECTIONS` の 1 か所である。片方だけ直すと、同じ 1 か所を開ける回をもう一度持つことになる。

**このタスクは決定先行である。** 3 つとも「画面のどこに何を出すか」を doc-8 が持っておらず、DOD の `#N` 番号列と check 状態・COMMENTS の内部構造をどこまで解くかは、doc-4 §4 の存在時構造検査の範囲を決める話になる。**画面からの書き戻しを持つかどうかも別の判断で、持たないならその理由が doc-5 に要る。**

**読み取り層の型を足すと wire も動く** — いま 3 つは `unknown_sections` に入っているので、ドメイン項目を足せば `wire.ts`・`wire_fixtures.rs`・`wire_tokens.json` とその試験が揃って動く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backlog CLI v1.49.3 が管理ファイルへ書く本文の区切りを実測で数え直し、FINAL_SUMMARY・DOD・COMMENTS の 3 つで全部であることを確かめてある（見えている分の列挙で終わらせない）
- [x] #2 SECTION:FINAL_SUMMARY を持つタスクが 想定外スキーマ を立てず、そのタスクから 不整合 の印が消えている
- [x] #3 DOD と COMMENTS の区切りが読み取り層で捕捉され、黙って捨てられない
- [x] #4 3 つそれぞれを画面のどこにどう出すかが doc-8 に書かれており、実装がそれに従っている
- [x] #5 DOD の #N 番号列と check 状態、COMMENTS の author・created・本文の区切りをどこまで読むかが、doc-4 §4 の 3 分類のどれとして書かれている
- [x] #6 画面からの書き戻しを持つかどうかが決まっており、持たないならその理由が doc-5 に書かれている
- [x] #7 読み取り結果に型を足した場合、wire.ts・wire_fixtures.rs・wire_tokens.json と各試験が揃っている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測（v1.49.3、2026-08-17。使い捨てプロジェクトと実行ファイルの静的読み）

**本文の区切りは 8 族で全部である。** CLI は SECTION の名前を 4 項目の markerId 表
（`DESCRIPTION`・`PLAN`・`NOTES`・`FINAL_SUMMARY`）から組み立て、本文の区切りを
`<!-- (SECTION:[A-Z][A-Z0-9_]*|COMMENTS|COMMENT|AC|DOD):(BEGIN|END) -->` の 1 本で走査する。
**数えたのは CLI が書いた出力ではなくこの走査の定義である** — 出力に現れるのは、そのとき値を
持っていた族だけなので、出力の列挙では網羅にならない。

**起票が挙げていない 5 つ目の族があった。** **`COMMENT`（単数）** で、COMMENTS ブロックの内側に
1 件ずつ入る。**v1.49.3 は読むが書かない** — 書くのは `---` 区切りの形で、読むほうは
「ブロック内に `COMMENT:BEGIN` が 1 つでもあればそちらで解く」である。手で書いた `COMMENT` 対を
CLI が読むところまで実測した。ディスク上に存在しうるので読み取り層は両形を解く。

**マイルストーン・文書・意思決定の本文に区切りは 1 つも無く、`##` 見出しだけである**（実測）。
`<!-- BOARD_START -->` と `<!-- BACKLOG.MD GUIDELINES START -->` は README とエージェント指示
ファイル側で、管理ファイルには現れない。

## 決めたこと

**書き戻しは持つと決まっており、対応は TASK-189 が引き取る**（2026-08-17、オーナーの判断）。
CLI には 3 つとも手段があるので「CLI に手段が無い」は理由にならず、この回で出さない理由は
製品判断として doc-5 §3.2 に書いた。**Comments は 1 件ずつ解いて一覧にする**（オーナーの判断）。

**doc-4 §4 の 3 分類**: 本文 3 つは任意フィールド（空の COMMENTS ブロックも正常）。8 族の対の開閉・
DOD の `#N` 番号列・COMMENTS 項目の区切りの対応・COMMENTS に属さない `COMMENT` 対は存在時構造検査項目。
**author と created は検査の対象にしない** — CLI が値を持つときだけ書く行なので、不在は正常である。

**区画名は日英とも管理ファイル自身の節見出しに従う。** 日本語の画面語を持つのは 実装計画・実装ノート の
2 つだけで、そちらが例外の側である（doc-8 §3 の割当表が `Description`・`Acceptance Criteria` を
日本語の文中でもそのまま綴っている）。新しい画面語を作っていない。

**3 区画の位置は管理ファイル自身の節の並びから採った。** 原文（画面設計案 02）はこの 3 つを描いて
おらず、原文が描く 4 つの並びは既に管理ファイルの節順と一致しているので、新しい根拠を立てていない。
**折畳みなので 3 区画とも区画境界を持たず、Definition of Done に達成割合のバーは出ない**（達成数は出る）。

## 実測した画面（借り物 playwright、WebKit、2026-08-17）

日英 × 3 配置の 6 通りで、並び・折畳み・既定開閉が doc-8 のとおりであること、`pageerror` 0 件、
横スクロール無しを確認した。**Comments 見出しの控えの内側は併置サイドバーで 252px** で、
最長の組（英語の `No author recorded` ＋ `2026-08-16 20:34`）が `measureText` で 224.28px。

**寸法の走査では出ない切れを 1 件見つけて直した。** author の長さに上限は無く、切れずに続く 60 字を
渡すと `.comment-head` が 252px の区画の外へ出ていた（`scrollWidth > clientWidth`）。
`flex-wrap: wrap` と `overflow-wrap: anywhere` で受けるようにし、20 字・60 字・200 字の 3 点で
はみ出し 0 件に戻したうえで、通常の 2 件が 17px の 1 行のままであることも確かめた。

## 試験

**新しい試験は修正を外して落ちることを確かめてある** — 変異 10 本（`KNOWN_SECTIONS` から
`FINAL_SUMMARY` を抜く／`DOD`・`COMMENTS` の marker を外す／`COMMENT` 形を無視する／
区切りの片方の早期 return を握り潰す／ヘッダ行を読まない／`read.rs` の 3 つの代入を落とす／
`placement.ts` の既定開閉・並び・行長上限）。**1 本が最初は生き残った** — 区切りが 1 つも無い
残り行の枝で、そこだけ試験が無かったので足した。

**`wire_tokens.json` は動いていない。** 足したのは構造体 1 つと 3 項目で、union が増えていないため。
`wire-fixtures/*.json` は 3 つ録り直してコミットしてある。

## レビュー 1R で直したもの（Claude Code CLI、2026-08-17）

**[P2] `COMMENT` 形が黙って落としていた 3 経路を塞いだ。** `parse_marked_comments` が
`Vec<Comment>` を返し、`parse_comments` が 縮退事象 を `false` 固定で返していたので、
①閉じない `COMMENT:BEGIN` が残る、②どの対にも属さない行が残る、③`COMMENT:END` の前に 2 つ目の
`COMMENT:BEGIN` が来る、の 3 つで内容が消え `events` が空のままだった。**このタスクが消しに来た
「静かに欠ける」そのもの**である。3 つとも 想定外スキーマ を立て、読めた分は残すようにした。

**[P3] `END` の食い違いが開いている捕捉を道連れにしていた。** `finish_*` が変種を見る前に
`std::mem::replace` していたためで、`take_capture` を挟んだ。**実測でこれは CLI 到達可能だと分かった** —
`task edit --comment '<!-- DOD:END -->'` は成功する（拒否は `<!-- COMMENTS?:` と行そのものが `---` の
行だけ）。**そのため既存の `finish_section`・`finish_ac` も併せて直した** — 4 か所が同じ形で、
片方だけ直すと読み手が 2 通りの形を見ることになる。
**その行を本文としては読めないままである** — CLI は本文全体の区切りを先に集めてから族ごとに対にし、
他の族の範囲の内側にある区切りを区切りと見なさないが、本層は 1 度の走査で読む。**doc-4 §4 に書いた。**

**[P3] `DetailSection` の `progress` の註が偽になっていた**（自分の変更が偽にしたので直す側である）。
**[P3] ヘッダ鍵の大文字小文字は実測して註へ入れた** — CLI は畳む（`Author:`・`CREATED:` が読まれる）。
**[P3] Definition of Done 一覧の鍵を位置へ変えた。** **実測でパネルごと落ちることを確かめた** —
`#N` を鍵にして同じ番号を 2 行渡すと `Svelte error: each_key_duplicate` が立ち、`.detail` が DOM から
消えた（`?dod=dup` のつまみ）。**同じ形の既存の AC 側は TASK-190 として起票した**（触っていないコードを
直さず起票する）。

**自分で見つけたものが 2 件ある。** ①`COMMENT` ブロックが空行で始まると header を本文へ入れていた
（CLI は entry 全体を trim してから分けるので `author:` を読む。実測）、②`created` を `author` と同じく
畳んでいたが、CLI が畳むのは `author` だけで `created` は trim するだけである。

**変異は 2R ぶんで 17 本流した**（1R の 10 本 ＋ この回の 7 本）。**この回も 1 本が最初は生き残り**
（`created` の畳み込み）、試験を足した。
<!-- SECTION:NOTES:END -->
