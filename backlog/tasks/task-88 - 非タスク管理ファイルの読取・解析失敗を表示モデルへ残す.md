---
id: TASK-88
title: 非タスク管理ファイルの読取・解析失敗を表示モデルへ残す
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:44'
labels:
  - robustness
  - rust
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-77
documentation:
  - backlog/docs/doc-4 - Backlog-ルートのドメインモデルと読み取り層-設計.md
priority: medium
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
read_milestones はファイル読取または id/title 解析に失敗すると continue し、read_documents は読取・frontmatter 分割・YAML 解析・id/title 取得の失敗で continue する。任意フィールドの型不正は ignored へ記録するがその内容を返さない。read_decisions も同じ。非タスクファイルにファイル単位の health が無いため除外している。そのため外部エディタの部分保存・権限変更・手編集による frontmatter 破損が起きると、対象ファイルは件数と一覧から消え、参照するタスクが無ければ画面上に手掛かりが一切残らない。参照欠損が出た場合も、ファイルが存在しないのか解析できないのか、どのパスで何に失敗したのかを判断できない。

m-2 に置く理由: Atlas 自身が外部エディタ経路（TASK-37）を機能として出荷するので、利用者は出荷済みの機能を使ってこの状態を作れる。管理対象の文書が理由も残さず一覧から消えるのは、利用者が「その文書は無い」と誤って判断する状態であり、公開阻害の定義（利用者の誤解）に当たる。当初は発生条件が限定的であることを根拠に m-3 へ置いたが、発生確率は公開阻害の定義に入っていないため m-2 へ改めた（2026-08-01 のレビュー指摘）。表示は TASK-77 の不整合の枠組みへ載せる。

_sandbox/repository-implementation-findings-2026-08-01.md の指摘 5。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 非タスク管理ファイルにも source path・種類・読取／解析失敗理由を持つ結果がある
- [ ] #2 正常な一覧と、一覧へ写せなかったファイルが画面で区別して出る
- [ ] #3 任意フィールドだけが不正な場合、判別できた id/title/body が残り、不正フィールドだけが未確定として扱われる
- [ ] #4 文書・マイルストーン・意思決定について 読取失敗・YAML 破損・必須項目欠損・任意項目の型不正・未参照ファイル の各試験がある
<!-- AC:END -->
