---
id: TASK-162
title: AGENTS の更新規則が decisions を覆っているかを確定する
status: Done
assignee: []
created_date: '2026-08-13 05:18'
updated_date: '2026-08-18 20:38'
labels:
  - docs
  - release
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: medium
ordinal: 155700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #109 の 4R・5R で見つかった、AGENTS.md「更新」節の解釈が割れる点。**実測が矛盾を作っている**ので、実装より先にユーザーの判断が要る。

**実測（2026-08-13、backlog 1.49.3）:**

- `backlog doc` は `create / update / list / search / view`。本文は `doc update --content` で書ける。
- `backlog decision` は `create` のみ。**`create` の options は `<title>` と `-s, --status` だけで、本文を渡す手段が無い。** つまり decision の本文は、create でも update でも CLI からは一切書けない。
- `backlog milestone` は `list / add / rename / remove / archive`。説明文の更新手段が無い（decision-21 が扱った穴）。

**矛盾はここである。** このリポジトリには本文を持つ decision が 30 件ある。CLI にその手段が無いのだから、**それらの本文はすべて直接編集で書かれたことになる。** 一方 AGENTS.md「更新」節は「tasks, documents, and milestones の更新は Backlog CLI に委ねる」「managed Markdown を直接編集しない」「この規則はエージェントに例外なく効く」と書いている。

読みは 2 つある。**どちらかをユーザーが確定する。**

1. **decisions は列挙の外**（規則が挙げているのは tasks・documents・milestones の 3 つ）。したがって decision の本文を直接書くことは規則違反ではなく、既存 30 件の作られ方がそのまま正しい。この場合 AGENTS.md にその旨を明記する — 列挙に無いことを「許されている」と読ませるのは、次の回に同じ判定をやり直させる。
2. **decisions も「managed Markdown」に含まれる**。この場合、規則はこのリポジトリで一度も満たされたことがなく、decision を書くたびに破られてきたことになる。decision-21 と同じ形の例外（範囲を本文の 1 節に限り、frontmatter とファイル名を触らず、一時ファイル置換で書く）をエージェントの作業についても決める必要がある。

**「列挙に無い」を根拠に 1 を自分で選ばない。** AGENTS.md は「CLI に手段が無いこと」を単独の理由として明示的に否定しており、沈黙を許可と読むのは同じ型の誤りである。判断材料として確かなのは「CLI に手段が無い」という実測と「本文を持つ decision が 30 件ある」という事実の 2 つだけで、そこから規則の意図は決まらない。

**確定したあとに書くものが 2 件ある。**

1. AGENTS.md / AGENTS.ja.md「更新」節に、decisions の扱いを明記する。
2. **decision-27 への README 層の追記。** README が版を名乗らない規則（PR #109 でユーザーが指摘した維持コストへの対応）は decision-27 の §1〜§5 が覆っていない層である。いまは AGENTS 和英「動作確認済み版の書き方」の 5 つ目に書いてあるが、設計契約の正本は decision であるべき。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md「更新」節が decisions を覆っているかどうかが、ユーザーの判断として確定している
- [x] #2 AGENTS.md と AGENTS.ja.md の「更新」節に decisions の扱いが明記されている（覆うなら例外の条件、覆わないなら列挙の外である旨と理由）
- [x] #3 decision-27 に README が版を名乗らない規則が記録されている。または記録できない理由と、AGENTS に置き続ける根拠が記録されている
- [x] #4 backlog decision create が本文を受け取れないこと（1.49.3 実測）が、新しい decision を書く手順としてどこかに記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #1 は 2026-08-13 に確定した。**ユーザーの判断は「decisions は列挙の外。直接編集でよい」である。**

したがって残る作業は 3 つで、争点は無い。

1. AC #2 は PR #109 で済ませた。AGENTS.md / AGENTS.ja.md「更新」節に、decision が列挙の外である旨と、その根拠（`backlog decision` は `create` のみ・options は `<title>` と `-s` だけ・したがって本文は作成時にも作成後にも CLI から書けない。v1.49.3 実測）を書いた。**沈黙から許可を導き直させないため、確定した旨と日付も書いた。**
2. AC #3 — decision-27 への README 層の追記。直接編集が是と確定したので**書ける**。§1〜§5 の後に置く。いまの置き場は AGENTS 和英「動作確認済み版の書き方」の 5 つ目で、そこには「TASK-162 がそこへ書く」と書いてある。
3. AC #4 — `backlog decision create` が本文を取らないことを、新しい decision を書く手順として記録する。1 と同じ文が兼ねているか、別に要るかを着手時に判断する。

**TASK-161 の decisions 分（9 ファイル・94 箇所）は、この確定によって直せるようになった。**

**2026-08-19 に AC #2〜#4 を閉じた。**

- **AC #2 は PR #109 の記述が現に立っていることを確かめて check した。** AGENTS.md「Updates」節と
  AGENTS.ja.md「更新」節の 2 つ目の項が、decision が列挙の外である旨・その根拠・確定日を現に持っている。
  今回この項には書き足していない。
- **AC #3 は decision-27 に §7「README 和英は版を名乗らない」を足して閉じた。** 本文は直接編集で書いた
  （AC #1 の確定どおり）。書いたのは 3 つで、①§1・§2 を 1 層ぶん延ばしたものであって新しい例外ではない
  こと、②掛かるのは Backlog CLI の版だけで、README の更新の節が名乗る Atlas 自身の版は対象外であること、
  ③初版で README が規則の無い層だった証拠 — **Context の 7 種類は README を 1 度も名指しておらず、
  本決定が README を数えているのは Consequences の TASK-152 内訳の「README 4」1 箇所だけである。**
  Consequences には費用 1 件（README の読者は入れる前に必要な版を確かめられない）と後続への影響 1 件
  （AGENTS 和英の 5 つ目は以後 §7 の写し）を足した。AGENTS 和英の当該項からは「decision-27 に無い／
  TASK-162 がそこへ書く」を落とし、§7 を指すよう改めた。
- **AC #4 は AC #2 と同じ文が兼ねていると判定した**（着手時に判断すると Notes が書いていた点）。
  AGENTS 和英「更新」節の 2 つ目の項が、options が `<title>` と `-s/--status` だけであること・本文は
  作成時にも作成後にも CLI から書けないこと（v1.49.3 実測）・したがってファイルを編集して書くのが
  decision の書き方であること、の 3 つを既に持つ。**2026-08-19 に 1.49.3 で測り直して同じであることを
  確かめた** — `backlog decision` の Commands は `create` のみ、`decision create` の Options は
  `-s, --status` と `-h` のみ、対して `doc update` は `--content` を持つ。別の置き場を作ると同じ事実の
  写しが 2 つになるので作らない。

**触っていないものを 1 件挙げる。** decision-27 の 費用・制約 第 1 項に、閉じる `**` の直後に文が続く
箇所が **1 つ**ある — 「ユーザーの当初の問い」で開く 1 対で、**閉じ手が閉じ括弧の直後に来て仮名が続く**
ため右フランキングにならない。**parse に残る記号は 2 つだが、それは 1 対の開き手と閉じ手である**
（同項の 1 文目「触るファイルは 4 分の 1 しか減らない」の対は閉じ手が仮名の後なので描画される）。
**壊れた形をそのまま綴らない** — 綴ると本 Notes 自身が同じ走査に掛かる。
**今回書き足した本文には 0 件である。** これは TASK-161 の対象なので直していない。

**PR #141 の 1R は [P1]/[P2] 0 件・[P3] 3 件で、3 件とも直した。**

1. **§7 が挙げた「README が他の層と違う点」が、doc 層を分けていなかった** — 「Markdown に補間が無い」は
   doc にも decision にも当たるのに、§3 と §6 はそちらへ別の答えを与えている。**落ちた 4 箇所が
   いずれも 要件の写し だった**ことを述べ、§6（decision-7 を参照する）を採らない理由を読者の違いで、
   §3（実測基準版の宣言）を当たらない理由を「README は実測記述を持たない」で書き直した。
2. **「更新の節」が無限定だった** — AGENTS.ja.md 自身にも「更新」節があり、そちらは Backlog CLI の版を
   名乗る。英語 README の当該節は `Updating` なので、AGENTS.md の文が名指す「更新」節はそのファイルに無い。
   decision-27 §7 と AGENTS 和英の 3 か所を「README 自身の 更新／Updating の節」に改めた。
3. **本 Notes の「2 つ」が箇所ではなく残存マーカーを数えていた** — 上のとおり 1 箇所・2 マーカーに直した。
   **TASK-161 の回が 2 件目を探して見つからない、という失い方を塞ぐのが直す理由である。**
<!-- SECTION:NOTES:END -->
