---
id: TASK-185
title: Backlog CLI が書く FINAL_SUMMARY・DOD・COMMENTS を読めるようにする
status: To Do
assignee: []
created_date: '2026-08-16 00:28'
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
- [ ] #1 Backlog CLI v1.49.3 が管理ファイルへ書く本文の区切りを実測で数え直し、FINAL_SUMMARY・DOD・COMMENTS の 3 つで全部であることを確かめてある（見えている分の列挙で終わらせない）
- [ ] #2 SECTION:FINAL_SUMMARY を持つタスクが 想定外スキーマ を立てず、そのタスクから 不整合 の印が消えている
- [ ] #3 DOD と COMMENTS の区切りが読み取り層で捕捉され、黙って捨てられない
- [ ] #4 3 つそれぞれを画面のどこにどう出すかが doc-8 に書かれており、実装がそれに従っている
- [ ] #5 DOD の #N 番号列と check 状態、COMMENTS の author・created・本文の区切りをどこまで読むかが、doc-4 §4 の 3 分類のどれとして書かれている
- [ ] #6 画面からの書き戻しを持つかどうかが決まっており、持たないならその理由が doc-5 に書かれている
- [ ] #7 読み取り結果に型を足した場合、wire.ts・wire_fixtures.rs・wire_tokens.json と各試験が揃っている
<!-- AC:END -->
