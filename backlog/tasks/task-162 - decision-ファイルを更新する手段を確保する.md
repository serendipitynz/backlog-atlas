---
id: TASK-162
title: decision ファイルを更新する手段を確保する
status: To Do
assignee: []
created_date: '2026-08-13 05:18'
updated_date: '2026-08-13 05:20'
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
PR #109 の 4R で見つかった構造的な穴。実測（2026-08-13、backlog 1.49.3）:

- `backlog doc` は `create / update / list / search / view` を持つ（更新は `update`。`edit` は無い）。
- `backlog decision` は `create` **のみ**。更新手段が無い。
- `backlog milestone` は `list / add / rename / remove / archive`。説明文の更新手段が無い（decision-21 が扱った穴と同じ）。

**したがって既存の decision 本文は、AGENTS.md「更新」節を守る限り一切変更できない。** あの節は「管理ファイルを直接編集しない」を「エージェントには例外なく」効かせており、製品側の例外（decision-21 のマイルストーン説明）はエージェントの作業に及ばない。

止まっているものが 2 件ある。

1. **TASK-161** — 既存 backlog 本文の閉じていない太字強調。tasks 23 ファイル・140 箇所と docs 7 ファイル・160 箇所は CLI で直せるが、**decisions 9 ファイル・94 箇所は直せない。**
2. **decision-27 への README 層の追記** — README が版を名乗らない規則（PR #109 でユーザーが指摘した維持コストへの対応）は、decision-27 の §1〜§5 が覆っていない層である。いまは AGENTS.md / AGENTS.ja.md「動作確認済み版の書き方」の 5 つ目として書いてあるが、**設計契約の正本は decision であるべき**（AGENTS.md「decision/doc が契約」）。

取り得る道が 3 つある。着手時に選び、理由を残す。

- **CLI 側に手段が現れるのを待つ**（`decision update` を持つ版を実測して確かめる）。上限を固定していないので、新しい版で解決している可能性がある。まずこれを測る。
- **decision-21 と同じ形の例外を、エージェントの作業についても決める**（範囲を「本文の 1 節」に限り、frontmatter とファイル名を触らず、一時ファイル置換で書く）。decision-21 が製品について立てた 3 条件をそのまま流用できるかを判定する。
- **decision を作り直す**（`create` して旧版を superseded にする）。id が変わるので、その decision を引いている全箇所の参照が切れる。参照数を数えてから判断する。

**「CLI に手段が無い」を理由に管理ファイルを直接編集してはならない**（AGENTS.md が明示的にこれを否定している: 「The CLI has no sub-command for it」は単独では理由にならない）。本タスクはその判断を正面から行うために起票した。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog CLI に decision の更新手段があるかどうかが実測で確かめられ、結果が記録されている（動作確認済み版と、より新しい版の両方）
- [ ] #2 手段が無い場合、3 つの道のどれを採るかが判断され、理由が decision として記録されている
- [ ] #3 decision-27 に README 層が記録されている。または記録できない理由と、AGENTS に置き続ける根拠が記録されている
<!-- AC:END -->
