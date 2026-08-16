---
id: TASK-186
title: 管理ファイル本文の画像を描き、doc-8 §9.2 を改訂する
status: To Do
assignee: []
created_date: '2026-08-16 00:28'
labels:
  - 'kind:feature'
  - ui
  - taskdetail
  - designsystem
milestone: m-3
dependencies: []
priority: medium
ordinal: 177700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI のブラウザモードは本文の画像を描くが（https://github.com/MrLesk/Backlog.md/issues/691）、Atlas は描かない。**doc-8 §9.2 が「画像は描かず、alt を文字として出す」と決めているためで、このタスクはその決定を改訂する。**

**§9.2 が挙げる 3 つの理由のうち 1 つ目は崩れた。** 「実測で管理ファイルに画像記法は 0 件」と書いてあるが、本リポジトリの TASK-82 の DESCRIPTION が `![](/assets/TASK-82.png)` を持つ（`1658abb`、2026-08-16）。**残る 2 つ — ローカル画像を描くには専用の読み出し許可を足すことになる・遠隔の画像を描くと台帳の内容がネットワークを叩く — は生きている**ので、改訂で決めるのは「描くか」ではなく「どこまで描くか」である。

**いまの画面には欠落の痕跡が出ない。** §9.2 は alt を文字として出す規則だが、CLI とブラウザモードが書く記法の alt は空なので、出す文字が無い。読み手は画像があること自体を知れない。

**Backlog CLI 側の解決規則は実測した**（v1.49.3 の実行ファイルの `handleAssetRequest`、2026-08-16）: `/assets/<名前>` を Backlog ディレクトリ配下の `assets/<名前>` へ解決し、`..` を含むものと、その配下から出るものを拒む。**Atlas が描くならこの規則を写す** — 別の解き方をすると、同じ台帳が 2 つの道具で違うものを指す。

**費用は CSP と asset protocol にある。** decision-28 の `img-src` は「Atlas にその能力が無い」ことを根拠に置かれた行で（`csp.rs` の `Moves::Absence`）、ローカルの画像を描くと Tauri の asset protocol の許可範囲と併せて動く。**decision-28 の各行は「失われるもの」を持つ形なので、改訂もその形で行う。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc-8 §9.2 が改訂され、描く範囲と描かない範囲が理由付きで書かれている
- [ ] #2 /assets/<名前> を Backlog ディレクトリ配下の assets/<名前> へ解決する規則が doc に書かれ、.. を含むものとその配下から出るものを拒む
- [ ] #3 decision-28 が改訂され、img-src の行が何を許し、失うと何が起きるかを持っている。csp.rs の期待値がそれと一致する
- [ ] #4 描けなかった画像（不在・読取不能・拒んだ経路）が画面から分かる。alt が空でも欠落が分かる
- [ ] #5 遠隔 URL の画像が決めたとおりに扱われる（描かないなら描かず、その理由が画面から分かる）
- [ ] #6 TASK-82 の DESCRIPTION の画像が実際に描かれることを、ユーザーの目視で確かめてある
<!-- AC:END -->
