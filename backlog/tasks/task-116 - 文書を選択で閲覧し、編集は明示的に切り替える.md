---
id: TASK-116
title: 文書を選択で閲覧し、編集は明示的に切り替える
status: To Do
assignee: []
created_date: '2026-08-05 08:18'
labels:
  - project-detail
milestone: m-2
dependencies: []
ordinal: 113500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #64 の目視フィードバック (2026-08-05) 由来。現在はカード選択が即編集セッションを開くが、選択はまず閲覧表示にし、編集は閲覧ヘッダの「編集」で切り替える (原設計のモック: 右列見出しに title と [編集]、その下に type・tags、本文)。閲覧は編集セッションを開かないので、閲覧だけなら破棄前確認も未保存状態も生じない。type・tags・表示パスは閲覧ヘッダ側に出す。doc-10 §5 の「カードを押すことが選択で、選択が更新フォームを開く」という契約の改訂を伴う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 カードの選択は閲覧表示を開き、編集セッションを開かない
- [ ] #2 閲覧ヘッダの「編集」で現行の編集セッション (doc-8 §6.3 準拠の未保存管理) に切り替わる
- [ ] #3 閲覧ヘッダに title・type・tags・表示パスが出る
- [ ] #4 編集中に別カードを選ぶ経路の破棄前確認は現在の契約を維持する
- [ ] #5 選択=閲覧への変更が doc-10 §5 に記録されている
<!-- AC:END -->
