---
id: TASK-142
title: 文書・マイルストーン・タスクの本文を Markdown として描く
status: To Do
assignee: []
created_date: '2026-08-09 05:02'
labels:
  - ui
  - 'kind:feature'
milestone: m-2
dependencies: []
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
  - backlog/docs/doc-10 - プロジェクト詳細画面-設計.md
priority: high
ordinal: 139500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-09 のユーザーフィードバック。現在は本文をファイルが書いたままの文字列として出しており (`TaskDetail.svelte` の註が理由を「Markdown レンダラは新規本番依存で AGENTS が導入前の確認を求めるため」と書いている)、見出しも強調も表も生の記法のまま読ませている。

ユーザーの求め (原文):
- マークダウンをそのまま表示するのではなく、レンダリングしてほしい。`~/Projects/_snz/mallow` 的
- frontmatter も mallow 的にパース
- コードのシンタックスハイライトは不要
- mermaid は対応できたら嬉しい
- backlog.md でのブラウザ表示は対応済みなので、それに準拠する形

**依存ゲート (AGENTS Dependencies)**: 新規本番依存の追加前に選定理由と導入範囲をユーザーへ確認する。mallow が使っているのは `markdown-it` + プラグイン数点 + `mermaid` + `yaml` で、シンタックスハイライトの `shiki` は本件では要らない。**着手時に、入れる依存とその範囲を確定してからでないと実装へ入らない。**

**決定先行**: 描く先が 3 画面ある (タスク詳細の Description・実装計画・実装ノート、プロジェクト詳細の文書本文、マイルストーンの説明)。決めることは、①どの本文を描き、どれを生のまま残すか (編集フォームの入力欄は生のままである必要がある)、②`<a href>` をどう扱うか — 現在の註は「Tauri の WebView 内の `<a href>` はアプリ窓を Atlas から離れさせる」ためリンクにしていないと書いており、Markdown を描くとリンクが本文の中に現れる、③mermaid を入れるかどうか (入れると依存が大きく増える)、④backlog.md のブラウザ表示に準拠する範囲。

決めた結果は doc-8 (タスク詳細) と doc-10 (文書・マイルストーン) の両方へ書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 導入する本番依存とその範囲がユーザーの確認を経て決まり、decision または doc に記録されている
- [ ] #2 タスク・文書・マイルストーンの本文が Markdown として描かれる
- [ ] #3 frontmatter が本文と分けて扱われる
- [ ] #4 本文中のリンクを押したときの挙動が決まっており、アプリ窓が Atlas から離れない
- [ ] #5 mermaid を入れるかどうかが決まり、理由が記録されている
- [ ] #6 編集フォームの入力欄が生の Markdown のままである
<!-- AC:END -->
