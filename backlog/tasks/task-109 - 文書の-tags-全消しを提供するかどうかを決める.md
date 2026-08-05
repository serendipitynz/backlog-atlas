---
id: TASK-109
title: 文書の tags 全消しを提供するかどうかを決める
status: In Review
assignee: []
created_date: '2026-08-01 07:56'
updated_date: '2026-08-05 20:48'
labels:
  - 'kind:chore'
milestone: m-2
dependencies: []
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-58 の実測により、doc-10 §5（文書区画）が「tags を空にする操作は提供しない」根拠にしていた前提が崩れた。初版の根拠は「v1.47.1 で `--tags ""` の効果が確認されておらず、同型の `--ref ""`・`--depends-on ""` は終了コード 0 のまま何も消さない」だったが、`doc update --tags ""` は v1.47.1・v1.48.0 のいずれでもタグを実際に消す（終了コード 0、frontmatter から tags が消える）。沈黙無変更ではない。

したがって現在の非提供は CLI の制約ではなく、Atlas が判断していないだけの状態である。TASK-58 は doc-10 §5 の理由を「未決」へ訂正し、§1 に「提供しない操作区画の理由は真であるものを書く」を足し、`manage.ts` の DOC_EMPTY_TAGS_REASON も同じ趣旨へ直したが、提供するかどうかは決めていない。

このタスクで決めること: 文書更新で tags を空にする操作を GUI へ出すか。出すなら doc-10 の提供しない操作区画から外し、`DocUpdate` の tags が空集合を表せるようにして（現在は空を拒否する）、`update.rs` の `doc update` 側も空文字を通す。出さないなら、CLI にできる操作を出さない理由を doc-10 へ書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tags 全消しを提供するかどうかを決め、根拠を doc-10 §5 へ書く
- [x] #2 提供する場合、GUI・manage.ts・update.rs の空集合の扱いを揃え、doc-10 §5 の提供しない操作区画から外す
- [ ] #3 提供しない場合、doc-10 §5 と DOC_EMPTY_TAGS_REASON の理由を決定内容へ差し替える（§1 の「理由は真であるものを書く」に従う）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決定

**タグ全消しを提供する**（2026-08-06、ユーザーが 2 択から選択）。doc-10 §5 の tags の項を、未決の記録から
決定の記録へ差し替えた。

## 決定の根拠（doc-10 §5 に書いたもの）

1. `--tags ""` はタグを実際に消す。**このセッションで v1.48.0 を再実測した**（使い捨てルートに doc を
   1 件作り、`--tags "alpha,beta"` の後 `--tags ""`）: 終了コード 0、frontmatter から `tags:` キーごと
   消える（`tags: []` が残るのではない）。TASK-58 の実測と一致する。したがって提供しない理由に
   CLI の制約を挙げられない。
2. 2 件目までは外せて最後の 1 件だけを拒む形は規則ではなく段差で、利用者に述べられる理由を持たない。
   加えて**文書には外部エディタ経路が無い**（doc-8 §7 が定めるのはタスク詳細のもの。
   `ProjectDetail.svelte` に導線は無い）ので、提供しなければタグ全消しは Atlas の中に経路を持たず、
   管理ファイルを直接編集させることになる。タスクの参照・依存の全消しを外部エディタ経路へ送れるのとは
   事情が違う。

## 着手時に分かった、Description との差分

- **`update.rs` は既に空文字を通せた。** `plan_doc_update` は `tags: Some(vec![])` を `--tags ""` として
  そのまま渡し、`RejectReason` に EmptyTags は無い（`--ref ""`・`--depends-on ""`・`-a ""` の 3 つだけが
  拒否される）。Description の「`update.rs` の `doc update` 側も空文字を通す」は不要だった。加えた
  のは意図を固定する試験（`empty_doc_tags_are_emitted_as_the_clear_request`）とコメント 2 か所。
- **`DocUpdate` は既に空集合を表せた。** wire の `tags?: string[]` / Rust の `Option<Vec<String>>` は
  `undefined`（未タッチ＝送らない）と `[]`（空集合＝全消し要求）を区別できる。空を拒んでいたのは
  `manage.ts` の 1 行だけ。
- **タグ全消しは「提供しない操作区画」に無かった。** 実装の `WITHHELD_DOCUMENT_OPERATIONS` は文書の削除
  1 件だけを持ち、拒否は保存操作の隣の理由（`DOC_EMPTY_TAGS_REASON`）として出ていた。AC #2 の「区画から
  外す」に当たる行は存在しないので、代わりに doc-10 §5 の「提供しない操作区画へは理由を未決として書く」
  という指示のほうを消した。

## 実装

- `manage.ts`: `DOC_EMPTY_TAGS_REASON` と `buildDocUpdate` の空集合拒否を撤去。代わりに
  `DOC_TAGS_CLEARED_NOTICE` と `clearsAllTags()` を足した（doc-10 §5 の「タグ全消しになるときは
  その旨を tags 欄の隣に出す」）。空の tags 欄は同じフォームの path 欄（空欄＝移動しない）と
  見分けが付かないため。
- `ProjectDetail.svelte`: tags 欄の直下に条件付きで告知を出す。
- `update.rs`: `DocUpdate.tags` と `plan_doc_update` に、`None`＝未タッチ / `Some(empty)`＝全消し要求の
  別を書いた。`--ref ""` 系との対比も同じ場所に置いた（同型に見えて、片方は消し、片方は消さない）。

## 検証

- `pnpm test` **593 件**（TASK-64 時点の 588 件 + 5 件: 空集合を送る・未タッチは送らない・告知の 4 条件）。
- `cargo test` **348 件**（+1 件）、`cargo fmt`・`cargo clippy --all-targets` 無指摘、
  `pnpm run check` 0 errors / 0 warnings。フロントには prettier / eslint は入っていない
  （`package.json` の scripts は dev・build・preview・check・test・tauri のみ）。
- **実エンジン実測（WebKit、`_sandbox/project-detail-check/`、1280×900）**。fixture の doc-7 は
  tags が `["ui"]` の 1 件なので、最後の 1 件を外す境界がそのまま出る。3 状態を確認した:
  ①選択直後（未タッチ）— 告知なし・保存 disabled、②最後の 1 件を外した後 — 告知が出て保存が有効
  （告知は 760.03 × 16px の 1 行で折り返さない）、③タグを足し直した後 — 告知が消え保存は再び disabled。
- **測っていないもの**（目視へ回す）: 告知が `.hint` の見え方でよいか（無効化でも問題でもないので
  doc-11 §2.3・§5 のどの族にも属さない）、`atlas-dark` での見え方、実機 webview での折返し。

## AC

- #1・#2 は達成。#3 は「提供しない場合」の条件節で、提供する決定をしたので該当しない（未チェックのまま）。
<!-- SECTION:NOTES:END -->
