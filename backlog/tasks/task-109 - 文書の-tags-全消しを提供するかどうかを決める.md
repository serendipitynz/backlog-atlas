---
id: TASK-109
title: 文書の tags 全消しを提供するかどうかを決める
status: In Review
assignee: []
created_date: '2026-08-01 07:56'
updated_date: '2026-08-05 21:16'
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

- `manage.ts`: `DOC_EMPTY_TAGS_REASON` と `buildDocUpdate` の空集合拒否を撤去。最後の 1 件を外す操作が、
  他のタグを外すのと同じように保存できる。
- `update.rs`: `DocUpdate.tags` と `plan_doc_update` に、`None`＝未タッチ / `Some(empty)`＝全消し要求の
  別を書いた。`--ref ""` 系との対比も同じ場所に置いた（同型に見えて、片方は消し、片方は消さない）。
- `ProjectDetail.svelte`: 変更なし。**告知を足したが、同じ PR の中で撤去した**（次項）。

## 撤去した案 — タグ全消しの告知

一度は tags 欄の下に「保存すると、この文書のタグをすべて外します（`doc update --tags ""`）。」を出し、
`DOC_TAGS_CLEARED_NOTICE` と `clearsAllTags()` を置いた。根拠は「空の tags 欄は 1 段上の path 欄
（空欄＝変更しない）と見分けが付かない」だったが、**この対比が成り立っていない**（2026-08-06 の
ユーザー指摘）。path 欄は常に空で現在値を持たないのに対し、tags 欄はその文書の現在のタグを並べており、
空になっているのは利用者が 1 件ずつ外した結果そのものである。告知は読めば分かる状態の言い換えにしか
ならず、**TASK-79 が落とすと定める型**に当たる。フラグ名を書いたのはさらに不適切で、利用者が確かめる
のはタグが消えたことであって `--tags ""` が走ったことではない。

定数・helper・その試験・告知を要求していた doc-10 §5 の一文を撤去した（`fd5bfee`）。**§5 は黙って
消さず、退けた案とその理由を残してある** — 次の編集者が同じ path 欄との対比を導いて足し直さないため。

## 検証

- `pnpm test` **592 件**（TASK-64 時点の 588 件 + 4 件: 空集合を送る・未タッチは送らない）。
- `cargo test` **348 件**（+1 件）、`cargo fmt`・`cargo clippy --all-targets` 無指摘、
  `pnpm run check` 0 errors / 0 warnings。フロントには prettier / eslint は入っていない
  （`package.json` の scripts は dev・build・preview・check・test・tauri のみ）。
- **実エンジン実測（WebKit、`_sandbox/project-detail-check/`、1280×900）**。告知がまだあった時点で
  実施した。fixture の doc-7 は tags が `["ui"]` の 1 件なので、最後の 1 件を外す境界がそのまま出る。
  ①選択直後（未タッチ）— 保存 disabled、②最後の 1 件を外した後 — 保存が有効、③タグを足し直した後 —
  再び disabled。**本変更が切り替えるのはこの保存の有効・無効**であり、告知の撤去はこれに影響しない。
- **測っていないもの**（マージ前の目視へ）: 告知が無い状態でタグを全部外して保存し、一覧のカードから
  タグが消えることを実機で確かめること。

## AC

- #1・#2 は達成。#3 は「提供しない場合」の条件節で、提供する決定をしたので該当しない（未チェックのまま）。
<!-- SECTION:NOTES:END -->
