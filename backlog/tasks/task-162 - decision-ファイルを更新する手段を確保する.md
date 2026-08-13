---
id: TASK-162
title: AGENTS の更新規則が decisions を覆っているかを確定する
status: To Do
assignee: []
created_date: '2026-08-13 05:18'
updated_date: '2026-08-13 05:28'
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
- [ ] #1 AGENTS.md「更新」節が decisions を覆っているかどうかが、ユーザーの判断として確定している
- [ ] #2 AGENTS.md と AGENTS.ja.md の「更新」節に decisions の扱いが明記されている（覆うなら例外の条件、覆わないなら列挙の外である旨と理由）
- [ ] #3 decision-27 に README が版を名乗らない規則が記録されている。または記録できない理由と、AGENTS に置き続ける根拠が記録されている
- [ ] #4 backlog decision create が本文を受け取れないこと（1.49.3 実測）が、新しい decision を書く手順としてどこかに記録されている
<!-- AC:END -->
