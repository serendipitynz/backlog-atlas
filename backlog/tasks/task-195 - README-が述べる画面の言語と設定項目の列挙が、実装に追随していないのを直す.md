---
id: TASK-195
title: README が述べる画面の言語と設定項目の列挙が、実装に追随していないのを直す
status: In Review
assignee: []
created_date: '2026-08-19 20:55'
updated_date: '2026-08-19 20:58'
labels:
  - 'kind:bug'
milestone: m-3
dependencies: []
priority: medium
ordinal: 186700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
両 README の 動作環境 / Platforms が「画面は日本語のみです。」「The interface is in Japanese only.」と述べているが、これは誤りである。TASK-103 で 表示言語 の設定（日本語 / English / システム設定に従う）が入り、TASK-183・184・187 で画面文が src/lib/messages/{ja,en}.ts へ全部抽出され、フロントエンドの源泉に画面文の日本語は 0 行になっている。TASK-103 の受入条件は 2 件とも README に触れておらず、そこで漏れた。リポジトリ全体を探したところ、この主張を持つのは README.ja.md と README.md の 1 行ずつだけである。

対応は列挙し直しではなく削除とする（2026-08-20、オーナーの判断）。英語に対応している以上、対応言語を README に並べる必要も、明示する必要もない。既定はすでに条件を満たしている — resolveLanguage (src/lib/messages.ts) は OS の primary subtag が ja のときだけ日本語を返し、文言表を持たない言語を含めそれ以外は全部英語になる。この規則は src/lib/messages.test.ts が押さえている。

同じ原因で古びている列挙がもう 1 か所ある。「表示テーマ、カードの情報量、絞り込み、並び順を設定に持つ」の行で、いまの設定画面が持つのは 表示言語・表示テーマ・カード情報量・既定の保存区分・既定の詳細配置・既定の並び順・ファイル監視・外部コマンド・外部エディタ指定 である。同じ README の後段が「設定 → 外部コマンド」を案内しているので、自己矛盾でもある。設定項目を足すたびに古びる形なので、列挙をやめる。

README が残す数え上げは現状と一致することを確かめてある。同梱している他の作者の成果物は 2 つ（Ace・Lucide。THIRD-PARTY-NOTICES.md の見出しで数えた）、管理ファイルへ書く例外は 2 つ（マイルストーンの説明文と、利用者が開いた外部エディタでの編集。AGENTS の更新規則と一致）。この 2 つは動かさない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 両 README から、画面の言語が日本語だけだという記述が落ちている
- [x] #2 設定に持つものの列挙が両 README から落ち、設定項目を足しても README が古びない形になっている
- [x] #3 README が残す数え上げが現状と一致することを数え直し、結果がこのタスクに記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 変えたもの

- README.ja.md 動作環境 / README.md Platforms — 画面の言語を述べる 1 文を落とした。リポジトリ全体で `japanese only` / `日本語のみ` / `Japanese-only` を探し、当たったのはこの 2 行だけである（`_sandbox`・`node_modules`・`.git`・`target` を除く）。
- README.ja.md できること / README.md What it does — 設定に持つものの列挙を、列挙しない 1 文へ置き換えた。設定項目を足しても古びない。

## 既定の言語について

削除でよいと決めた根拠は、既定がすでに英語側に倒れていることである。`resolveLanguage`（`src/lib/messages.ts`）は OS の primary subtag が `ja` のときだけ `ja` を返し、文言表を持たない言語（`fr-FR`）も空文字も `en` になる。`src/lib/messages.test.ts` の 5 例がこれを押さえている。したがって README で対応言語を並べなくても、日本語 OS 以外の読み手が日本語の画面に落ちることはない。

## 数え直した結果（受入条件 #3）

README が残す数え上げは 2 つで、どちらも現状と一致していたので動かしていない。

- 同梱している他の作者の成果物は 2 つ — Ace と Lucide。`THIRD-PARTY-NOTICES.md` の `### ` 見出しを数えて確かめた（`Material vendored in this repository` の下に 2 つ）。
- 管理ファイルへ書く例外は 2 つ — マイルストーンの説明文と、利用者が開いた外部エディタでの編集。AGENTS の「更新」節が数える例外と一致する。

古びていた列挙は上の 2 か所だけである。

## 検証

`pnpm test`（43 ファイル・1119 件）・`pnpm run check`（0 errors）・`pnpm run lint`（114 ファイル）がいずれも通った。`emphasis-closing.test.ts` と `sandbox-reference.test.ts` はどちらも両 README を走査対象に含むので、この緑は編集した 2 ファイルを含んでいる。`src-tauri` は実行していない — Rust 側はこのリポジトリの README を読まない（`read.rs`・`sync.rs` に出る `README.md` はどれも試験用の文字列である）。
<!-- SECTION:NOTES:END -->
