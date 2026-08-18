---
id: TASK-161
title: 既存の backlog 本文で閉じていない太字強調を直す
status: In Review
assignee: []
created_date: '2026-08-13 05:03'
updated_date: '2026-08-18 21:41'
labels:
  - docs
  - 'kind:chore'
milestone: m-3
dependencies:
  - TASK-162
priority: medium
ordinal: 154700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 のユーザー指摘由来（README.ja.md について「強調表現の前後には半角スペースを入れないと強調として認識されないことがあります」）。TASK-90 の回に README 和英・AGENTS 和英・同セッションで書いたタスク本文は直し、規約を AGENTS.md / AGENTS.ja.md の「作業上の規約」へ入れた。本タスクは既存分である。

**原因は CommonMark の閉じ側の判定である。** 閉じる `**` は right-flanking でなければならず、直前が Unicode 句読点の場合は直後が空白か句読点でなければそれを満たさない。日本語では強調の中で文が終わる書き方が大半なので、`**〜である。**次の文` が軒並みこれに当たる。`**Ubuntu なら 24.04 以降**で`（直前が句読点でない）は問題なく描画される。

**Atlas 自身が描画対象である。** タスク・文書の本文は markdown-it で描く（decision-25）ので、崩れは GitHub だけでなくアプリの画面に出る。

**実測（2026-08-13、markdown-it で全文描画し code span を除いて数えた）。CLI が本文を書けるかどうかで 2 つに分かれる。**

- **書ける**: tasks 23 ファイル・140 箇所（`backlog task edit` の `-d` / `--notes` / `--plan` / `--acceptance-criteria`）、docs 7 ファイル・160 箇所（`backlog doc update --content`）。多い順に doc-11（76）・doc-10（34）・TASK-145（28）・doc-8（24）・TASK-129（16）・TASK-156（16）・doc-7（16）・TASK-125（14）・TASK-130（8）。
- **書けない**: decisions 9 ファイル・94 箇所。多い順に decision-30（36）・decision-28（26）・decision-29（18）。**`backlog decision` は `create` のみで、その options は `<title>` と `-s` だけ**（1.49.3 で実測）。つまり decision の本文は create でも update でも CLI から書けない。**直接編集が許されるかどうかは AGENTS.md「更新」節の読みが割れており、TASK-162 がそれを確定する。**
- milestones は該当 0 件。

**目視で数えない。** 行単位の走査は 2 種類の誤検出を出す — code span 内の `**`（`src/**/*.test.ts`）と、行をまたぐ強調（どちらも正しく描画される）。全文を描画し、code span を除いてから数える。

**サブコマンド名を実測で確かめる。** 起票時の初稿は `backlog doc edit` と書いており、PR #109 の 4R で [P2] になった。正しくは `backlog doc update` である。

公開阻害には当たらない（アプリは動作し、崩れるのは本文の見え方だけ）ので、指示書の規則どおり m-3 に置いた。ユーザーが m-2 へ繰り上げてよい。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog/tasks と backlog/docs の本文に、閉じていない太字強調が残っていない（markdown-it で全文描画し、code span を除いて 0 件）
- [x] #2 tasks と docs の修正が Backlog CLI 経由で行われている（task edit の -d / --notes / --plan / --acceptance-criteria、doc update --content）
- [x] #3 backlog/decisions の 9 ファイルも 0 件になっている。CLI に本文を書く手段が無いので直接編集で行う（AGENTS.md「更新」節が decision を列挙の外と定めている。2026-08-13 確定）
- [x] #4 その検査が再現できる形で残っている（行単位の走査ではなく全文描画で数える）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**直した数は 426 個の区切り・44 ファイル、入れた半角スペースは 246 個である** — 2026-08-19 の実測値である。内訳は tasks 28 ファイル 158 個・docs 7 ファイル 158 個・decisions 10 ファイル 110 個。**起票時の 394（tasks 23/140・docs 7/160・decisions 9/94）から動いた** のは、その後のタスク本文と doc 改訂で増えたためである。走査後の残数は 246 ファイルすべてで 0 個。

**2026-08-18 に「doc-11 だけで 44 件」と記録した値は、こちらと別の指標だった。** あれは `**` を含む text トークンの数で、本タスクが数えるのは `**` の出現数である。doc-11 は両日とも 76 個・44 トークンで、**1 つも動いていない。** 引き継ぎ指示書の「grep で数えるときは行数と出現数を混ぜない」（TASK-154）の、トークン数と出現数についての版である。**数を書くときは何を数えた数かを添える。**

**壊れ方は 3 つではなく 4 つあった。**

1. `**〜である。**次の文` — 閉じ側の直前が `。` なので right-flanking でなく、閉じられない。大半がこれである。
2. `〜取る。****控えの群**` — 閉じ側と次の開き側が 4 個 1 続きの run へ潰れ、markdown-it は 1 つの区切りとして読んで開くことしかできない。
3. `には**「〜」**と書いた` — 逆向き。開き側の直後が `「` なので left-flanking でない。
4. **閉じ側が失敗したとき、次の開き側がそれを吸って強調が黙って入れ子になる形。** `。**最も効いたのは**実測日付**の指摘` は太字の中に太字を作り、**`**` を 1 つも残さない。** つまり AC #1 の数え上げには映らない。**台帳に 1 件あった** — TASK-152 の Implementation Notes である。**恒久検査が主張を 2 つ持つのはこのためである。**

**直し方は、位置で対にする決定的な変換である。** code span と fence を同じ長さの placeholder で覆ってから本文の `**` を出現順に取り、偶数番を開き・奇数番を閉じと割り当てる（**著者が書いた対はこれである。どの run がどれと対になるかを markdown-it に訊くのは、壊れた結果を読むことにしかならない** — これが対の出どころである）。そのうえで、開き側が left-flanking でない位置の前と、閉じ側が right-flanking でない位置の後へ半角スペースを 1 つ入れる。4 個続きの run は中央で割る。

**検証は「太字になった範囲が著者が区切った範囲であること」で行った。** 変換前に位置対から導いた範囲と、変換後に markdown-it が出した `<strong>` の中身を 246 ファイルすべてで突き合わせ、全一致した。**最初に書いた貪欲版はこの検査で落ちた** — 「1 個入れて残数が減れば採用」で回すと 0 個には到達するが、task-78 で太字の境界を動かしていた（閉じ側の内側に空白が入り、隣の強調と対の組み替えが起きる形）。**残数が 0 になったことは、太字が正しくなったことを意味しない。**

**tasks は DESCRIPTION と NOTES だけが動いた** ので `task edit` の `-d` と `--notes` で送った。**Acceptance Criteria と Implementation Plan には 1 件も無かった** ので、AC 全体差し替えで済印が落ちる問題は起きていない。**往復がバイト同一であることを先に確かめてある** — doc-1 に `doc update --content` で現状の本文を、TASK-113 に `-d`・`--notes` で現状の 2 節を送り返し、`updated_date` 以外の差が無いことを見た（どちらも確認後に戻した）。**task-76 だけ末尾の空行 1 つが CLI の正規化で落ちた** — Atlas の編集ではなく CLI 自身の書き出しである。

**decisions は 10 ファイルで、AC #3 の「9 ファイル」は起票時の値だった。** 増えた 1 つは decision-34 で、起票後に書かれている。**直接編集で行った** — AGENTS 更新節が decision を列挙の外と定めており、2026-08-13 に確定済みである。

**検査の置き場は `src/lib/emphasis-closing.test.ts` である。** 形は `sandbox-reference.test.ts` に倣った — `import.meta.glob` の `?raw` で読み（`node:fs` は `@types/node` を引く）、**自分が読む集合を押さえる主張を 1 本持つ。** 対象は `backlog/` 配下（tasks・docs・decisions・milestones と、CLI がタスクを移す drafts・completed・archive）と散文 4 ファイル。**散文 4 ファイルは今日すでに 0 個なので、入れても本文は 1 文字も変わらない** — 同じ失敗がそこへ来たときに止まるだけである。**変異で落ちることを確かめた** — TASK-152 の分を戻すと 3 主張のうち 2 つが落ち（残数の主張は通る。4 つ目の壊れ方だからである）、decision-16 の分を戻すと 3 つとも落ち、glob を空にすると集合の主張が落ちる。

**AGENTS 和英に 1 項足した** — 検査がどこにあり、何を押さえ、**何を押さえないか。** 規約の字義は描画条件より広く、**正しく描画されるのに字義違反の箇所が 3,454 ある** — 2026-08-19 の実測で、tasks 1,574・docs 1,325・decisions 555・散文 4 ファイル 64 である。**それを押さえるものは無いので、通った検査を字義充足と読んではいけない。** 扱いは TASK-194 が決める（ユーザーが 2026-08-19 に別タスクとして指定）。**AGENTS への追記が字義違反を増やしていないことも、改訂前後の差集合で確かめた** — 和英とも 29・32 のままである。

**検査は次のとおり。** `pnpm test` 1022 passed / 42 files、`pnpm run check` 0 errors、`pnpm run lint` clean、`pnpm run build` 成功。`cargo fmt --check`・`cargo test` も通した（Rust は触っていない）。
<!-- SECTION:NOTES:END -->
