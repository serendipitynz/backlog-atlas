---
id: TASK-88
title: 非タスク管理ファイルの読取・解析失敗を表示モデルへ残す
status: In Review
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-06 21:09'
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
- [x] #1 非タスク管理ファイルにも source path・種類・読取／解析失敗理由を持つ結果がある
- [x] #2 正常な一覧と、一覧へ写せなかったファイルが画面で区別して出る
- [x] #3 任意フィールドだけが不正な場合、判別できた id/title/body が残り、不正フィールドだけが未確定として扱われる
- [x] #4 文書・マイルストーン・意思決定について 読取失敗・YAML 破損・必須項目欠損・任意項目の型不正・未参照ファイル の各試験がある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決定先行の判定

decision-22 が「対象がタスク 1 件でないものを不整合と呼べるかはそのタスクで判断する」と
明示的に開けていた争点なので、実装より先に決定先行の手順を通した。争点 3 件はユーザーが
2026-08-07 に一度に確定 — 不整合の対象を管理ファイル 1 件へ広げる／写せなかったファイルは
一覧列の末尾／意思決定は読み取り層まで（画面は TASK-118）。**decision-24 として記録**し、
decision-22・doc-4・doc-10・doc-11 を改訂した。対応表は
`_sandbox/handoff/referent-table-task-88.md` 第 1 版に先行確定した。

## 実装

- **doc-4 §5 の 4 事象に新しい事象を足していない。** 解析不能・想定外スキーマの対象を
  タスク 1 件から管理ファイル 1 件へ広げ、記録の置き場を 2 つ足した。
- `TaskHealth` → **`FileHealth`** に改名し、Task・Milestone・Document・Decision の 4 型が
  共有する。`Degraded`・`DegradeEvent`・wire トークンは decision-22 の据え置きどおり不動。
- **`UnmappedFile`**（写せなかったファイル）を新設。`source_path`・`kind`・
  `missing_required`・`detail` を持ち、`ProjectModel.unmapped_files` が種別を跨いで 1 本で持つ。
  値は `DegradeEvent::Unparseable` の payload そのもので、事象タグを運ばない — 解析不能だけが
  この記録を生むためである（想定外スキーマまで届いた 1 件は id を持ち、一覧に並ぶ側にいる）。
- `read.rs` の 4 つの黙った `continue` を 1 つの `identity()` に集約した。読取失敗・fence 未閉鎖・
  YAML 破損・必須項目欠損の 4 分岐がそれぞれ理由を残す。必須項目が「在るが使えない形」のときは
  欠損の名指しと `detail` の両方を残す（`id は非スカラー` と `id キーが無い` が別物になる）。
- `Decision` に `source_path` を足した（他 3 種は既に持っていた）。
- 文書・意思決定の任意項目は `ignored` へ捨てるのをやめ、`health` へ記録する。
- **マイルストーンには任意 frontmatter 項目が無い**（v1.48.0 の `milestone add` は id・title だけを
  書く、実測）。その存在時構造検査は本文側だけなので `parse::parse_body` の events を取る。
  閉じない `SECTION:DESCRIPTION` 対がその実例で、放置すると decision-21 の直接書き込みが拒む形の
  説明が理由なしで画面に出る。**説明の本文範囲は decision-21 の共有関数から取り続ける。**
- 画面（`ProjectDetail.svelte`）: 文書カード・マイルストーンカードに不整合印 ⚠️、
  編集ペイン／操作ペインに理由行、一覧列の末尾に写せなかったファイルの一覧。
  理由の導出は `mark.ts` の 1 か所（`fileInconsistencyReasons` / `unmappedFileReason` は
  タスクと同じ内部関数を通る）。
- **doc-11 §2.4 の既存要求に従った**: 印グリフは「理由を読むための場所が別にある」ことが条件
  なので、理由行の置き場を先に決めてから ⚠️ を置いた。
- TASK-77 の改称の取りこぼしを 2 か所直した（`mark.ts` の「旧称 バージョン不整合」→「旧称 版ずれ」）。

## 検証

`cargo test` 377 / `cargo fmt` / `cargo clippy --all-targets` 無警告、
`pnpm test` 671（+7）/ `pnpm run check` 0 errors / `pnpm run build` 成功。
wire フィクスチャは `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で再収録しコミットした
（`FileHealth`・`ManagedFileKind` がトークン表に入り、`TaskHealth` が消えた）。

**実エンジン実測**（借り物 playwright、`_sandbox/project-detail-check/` に `?unmapped=<n>` を追加。
1280×800、WebKit と Chromium で一致）:

- 不整合印は 12.80×12.80px（`TaskCard.svelte` の .8rem と同値）。アクセシブル名は
  「不整合: 想定外スキーマ: frontmatter \`tags\` is not a list」。
- 一覧列の幅は写せなかったファイルの有無で変わらない（274.59px、16rem content box ＋ padding）。
  長い理由行（全角込み 60 字超）を 3 件並べても列は広がらず、横スクロールも出ない。
- 写せなかったファイルの一覧はカードのスクローラの外（cards の下端 594.6px に対して y=600.2px）。
  0 件のときは要素ごと出ない。
- 理由行は編集ペインの表示パスの直下 1 行で、ホバー無しで読める。

**未実施（目視依頼の範囲）**: 実アプリでの見え方、10 テーマそれぞれでの `--mark-inconsistent` の
読みやすさ、実際に壊した管理ファイルを置いたときの挙動。
<!-- SECTION:NOTES:END -->
