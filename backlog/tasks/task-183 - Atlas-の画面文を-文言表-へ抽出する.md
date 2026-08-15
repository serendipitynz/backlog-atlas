---
id: TASK-183
title: Atlas の画面文を 文言表 へ抽出する
status: To Do
assignee: []
created_date: '2026-08-15 22:19'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-182
ordinal: 174700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 が定めた機構（decision-35 の 文言表・表示言語）の上で、Atlas 自身が描く画面文を 文言表 へ移す。

**この行は 2026-08-16 に TASK-182 から分けて起票された。** 起票時の TASK-182 は AC 4 件で画面文と wire の変更を同時に持っていたが、着手セッションが数え直したところ **39 ファイル・883 行**（コメントを剥がした後。数え方は `screen-text.test.ts` の剥がし手順）で、1 セッションに収まらない。最大は `ProjectDetail.svelte` 185・`TaskDetail.svelte` 105・`edit.ts` 88 である。**起票時の 46 ファイル・941 行は TASK-103 が入る前の値であって、減ったのではなく測り直した値である。**

**書く先は `src/lib/messages/{ja,en}.ts` で、`Catalog` は `typeof ja`** — 日本語の側が鍵の集合そのものなので、鍵を足すときは日本語の文を足すことでしか足せない。画面は `messages-context.ts` の取得子越しに読み（言語変更で描き直るのはこれのため）、文をつづる純関数は `messages.ts` の `msg()` を読む。**この 2 つは同じ `CATALOGS` を引いており、源泉が 2 つあるのではない。**

**最初の実測は「開いたままの画面がその場で描き直るか」である。** TASK-103 の回はここを未測定で終えた — 不可能なのではなく、あの時点で 文言表 を読む画面が設定画面 1 つだけで、それが保存で閉じるため観測できる場所が無かった。**抽出が 1 画面でも進めば観測できる。**

**訳さない範囲は decision-35 §5 が持つ** — 読み取り対象の管理ファイルの中身、日付、識別子。**doc が引用する文は日本語の 文言表 の側を指す**ものとし、英語の綴りを doc へ二重に書かない（decision-35 の後続への影響）。

**crate が組み立てる失敗の理由はこの行の範囲外である**（TASK-182）。**抽出漏れの走査もこの行では入れない**（TASK-184）— 源泉に残った日本語で落ちるのが走査の役目なので、抽出が終わるまで通らない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 全画面の文言が 文言表 へ外部化され、表示言語 の切替で英語と日本語が入れ替わる
<!-- AC:END -->
