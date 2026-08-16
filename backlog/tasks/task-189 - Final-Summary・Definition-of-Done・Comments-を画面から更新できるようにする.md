---
id: TASK-189
title: Final Summary・Definition of Done・Comments を画面から更新できるようにする
status: To Do
assignee: []
created_date: '2026-08-16 21:06'
updated_date: '2026-08-16 21:18'
labels:
  - rust
milestone: m-4
dependencies: []
ordinal: 180700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-185 が読み取りと表示を入れ、**更新はこのタスクが引き取ると 2026-08-17 にオーナーが決めた**（doc-5 §3.2 にその決定が書いてある）。

**CLI には 3 つとも手段がある**（v1.49.3 で実測）。したがって doc-5 §3.1 の「CLI に手段が無い」はこのタスクに当たらず、doc-5 §3 の操作写像へ行を足す作業になる。

- **Final Summary** — `task edit --final-summary <text>`（置換）・`--append-final-summary <text>`（追記）・`--clear-final-summary`（削除）。**3 つ揃っているので、実装ノートと違い空にもできる。**
- **Definition of Done** — `--dod <item>`（追加、複数可）・`--remove-dod <index>`・`--check-dod <index>`・`--uncheck-dod <index>`。**AC と同じ形なので、完了状態を伴う全体差し替えは同じ複合操作になる**（doc-5 §3 の AC 差し替えの行）。**AC と違い `--acceptance-criteria` に当たる単体の全置換オプションは無い**ので、着手時に `task edit --help` で数え直す。
- **Comments** — `--comment <text>`・`--comment-author <author>`。**追記しか無い。** 1 件を消す経路も、既存 1 件の本文を変える経路も CLI に無いので、doc-5 §3.1 の「CLI に存在しない更新操作」へ行が増える。**GUI は削除を出さず、外部エディタ経路（doc-8 §7）へ案内する**（References・依存・assignee の最後の 1 件と同じ形）。
- **CLI が本文を拒む条件が 2 つある**（実測）。コメント本文にも author にも、`<!-- COMMENTS?:` に当たる文字列と、行そのものが `---` の行を入れられない（`Comment body cannot contain standalone '---' delimiter lines.` で終了コード 1）。**doc-11 §5 の保存無効化と理由表示に当たる**ので、入力検査を GUI 側に置く。

**画面の置き場は doc-8 §3 が既に持っている** — 3 区画とも割当表と §3.1 の並びに行があり、TASK-185 が読み取り専用で描いてある。編集セッション（doc-8 §6）の中でそれぞれをどう出すかがこのタスクの範囲になる。

**m-4 に置いた理由**（次リリース基準）: 3 つとも値は画面に出ており、読み手が受け取るものは欠けていない。編集経路が無いことは外部エディタ経路が既に埋めているので、v0.2.0 に未対応で載っても利用者の行動を誤らせない。**m-3 へ動かすのはオーナーの判断でよい。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc-5 §3 の操作写像に Final Summary・Definition of Done・Comments の行があり、引数配列が着手時の CLI の --help と一致している
- [ ] #2 Comments に削除・本文編集の経路が無いことが doc-5 §3.1 に書かれており、GUI がそれをどう見せるかも決まっている
- [ ] #3 コメント本文と author の 2 つの拒否条件が保存前に検査され、doc-11 §5 の形で理由が出る
- [ ] #4 Definition of Done の完了状態を伴う全体差し替えが 1 回の task edit で送られる（AC 差し替えと同じ複合操作）
- [ ] #5 3 つとも doc-9 §4 の更新前競合検出を通る
- [ ] #6 doc-5 §3.2 の「更新は後続タスクが引き取る」の段落が、引き取り済みとして書き換わっている
<!-- AC:END -->
