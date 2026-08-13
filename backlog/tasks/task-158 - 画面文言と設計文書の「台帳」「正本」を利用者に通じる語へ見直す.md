---
id: TASK-158
title: 画面文言と設計文書の「台帳」「正本」を利用者に通じる語へ見直す
status: To Do
assignee: []
created_date: '2026-08-13 03:48'
updated_date: '2026-08-13 05:01'
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

**対象は列挙ではなく網羅である。** 起票時に数えた範囲は 8 箇所前後だったが、PR #109 の 2R でその列挙が実際の約 1/3 だと分かった。コメントを除いた画面文だけで App.svelte・ProjectDetail.svelte・ProjectRegister.svelte・GitHistory.svelte・Settings.svelte・Swimlane.svelte・project-detail.ts・ledger.ts・band.ts・edit.ts・header.ts・settings.ts に散っている。**着手時に自分で数え直すこと。** 列挙を AC に書くと、その列挙を満たしたまま同じ問題が別の場所に残る。

「プロジェクト設定ファイル」を素朴に当てられない理由が 2 つあるので、着手時に対応表で対象を先に固定する。(1) projects.toml は全プロジェクトの登録一覧であって、プロジェクトごとの設定ではない（それは各プロジェクトの backlog/config.yml が持つ）。(2) decision-13 のアプリ設定ファイルが別にあるので、「設定ファイル」を当てると 2 つのファイルが同じ語で呼ばれる。PR #109 の対応表（_sandbox/handoff/referent-table/referent-table-task-97-90.md 第 1 版）が README 側の結論を持っている。

doc-3（プロジェクト台帳と横断タスクID 設計）が語の正本なので、画面文言だけ替えると doc と画面がずれる。**ただし「doc も替える」と「画面だけ替えて doc-1 に対応を書く」はどちらも選べる**（AGENTS.md「decision/doc が契約」）。選ばなかったほうを選ばない理由を記録する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 利用者が読む文に「台帳」「正本」が残っていない。残す箇所がある場合は、その理由が記録されている（コードコメントは対象外）
- [ ] #2 その網羅性が源泉に対する検査で保たれている。src/lib/screen-text.test.ts が doc-11 §8 に対して行っているのと同じ形で、画面文から語を探して落ちる検査を置く（列挙を人手で維持しない — 次に文を足す回が同じ語を持ち込む）
- [ ] #3 置き換え後の語が対応表で先に確定されている。projects.toml が全プロジェクトの登録一覧であってプロジェクト個別の設定ではないこと、および decision-13 のアプリ設定ファイルと語が衝突しないことが、その表で扱われている
- [ ] #4 doc-3 の設計語を替えるか、画面文言だけ言い換えて doc の設計語は残すかが判断され、その理由が記録されている
- [ ] #5 画面の語と doc の語の関係が 1 つに定まっている。両方替えたなら doc-3 と、doc-3 の語を引く doc・decision も揃っている。画面だけ替えたなら doc-1（用語対応表）がその対応を持っている。どちらでもない状態（片方だけ替わり、対応も書かれていない）が無い
<!-- AC:END -->
