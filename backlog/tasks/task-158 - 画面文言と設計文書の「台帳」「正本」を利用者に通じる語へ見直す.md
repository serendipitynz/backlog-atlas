---
id: TASK-158
title: 画面文言と設計文書の「台帳」「正本」を利用者に通じる語へ見直す
status: To Do
assignee: []
created_date: '2026-08-13 03:48'
labels:
  - ui
  - docs
  - 'kind:writing'
milestone: m-2
dependencies: []
priority: medium
ordinal: 151700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 のユーザーフィードバック由来。「耳慣れない文言（日本語）の利用が目につきます（README だけじゃなく）」「プロジェクト台帳、という言い方も個人的には違和を持っています」。TASK-90 で README からは 3 語（正本・集約画面・プロジェクト台帳）を外したが、ユーザーの判断で画面文言と設計文書は本タスクへ回した。

対象は 2 つ。画面文言の `台帳` が約 10 箇所（Settings.svelte「台帳ファイル」、ProjectDetail.svelte「概要（台帳エントリ）」「台帳から外す」、App.svelte「ほかの台帳操作が完了するまで待ってください。」、Swimlane.svelte「台帳が読み取り専用のため…」、GitHistory.svelte「台帳の設定で解消できます。」など）と、画面文言の `正本` が 1 箇所（project-detail.ts の「タスクの正本はそのまま残ります。」）。

「プロジェクト設定ファイル」を素朴に当てられない理由が 2 つあるので、着手時に対応表で対象を先に固定する。(1) projects.toml は全プロジェクトの登録一覧であって、プロジェクトごとの設定ではない（それは各プロジェクトの backlog/config.yml が持つ）。(2) decision-13 のアプリ設定ファイルが別にあるので、「設定ファイル」を当てると 2 つのファイルが同じ語で呼ばれる。

doc-3（プロジェクト台帳と横断タスクID 設計）が語の正本なので、画面文言だけ替えると doc と画面がずれる。doc の改訂を伴うか、画面文言だけを利用者向けに言い換えて doc の設計語は残すかは、着手時の判定に入る（AGENTS.md「decision/doc が契約」）。
<!-- SECTION:DESCRIPTION:END -->
