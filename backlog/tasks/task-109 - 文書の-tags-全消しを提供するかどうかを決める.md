---
id: TASK-109
title: 文書の tags 全消しを提供するかどうかを決める
status: To Do
assignee: []
created_date: '2026-08-01 07:56'
updated_date: '2026-08-01 08:21'
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
- [ ] #1 tags 全消しを提供するかどうかを決め、根拠を doc-10 §5 へ書く
- [ ] #2 提供する場合、GUI・manage.ts・update.rs の空集合の扱いを揃え、doc-10 §5 の提供しない操作区画から外す
- [ ] #3 提供しない場合、doc-10 §5 と DOC_EMPTY_TAGS_REASON の理由を決定内容へ差し替える（§1 の「理由は真であるものを書く」に従う）
<!-- AC:END -->
