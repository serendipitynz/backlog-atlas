---
id: TASK-86
title: モーダルの閉じる要求に未保存確認を通す
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:41'
labels:
  - robustness
  - ui
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-74
  - TASK-76
  - TASK-91
priority: high
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
設定モーダルは dirty を計算しているのに、閉じるボタンがそれを参照せず onclose を直接呼ぶ。ProjectRegister も入力をコンポーネントローカルに持ったまま確認せず閉じる。Modal は Escape を受けると無条件で onclose を呼び、App.svelte の onclose がコンポーネントをアンマウントするため入力が失われる。Modal.svelte のコメントは「モーダルを開いても背後の画面をアンマウントしないので未保存入力を失わない」と説明しているが、問題はモーダルを閉じるときに内部フォームをアンマウントすることであり、コメントが実装より強い保証を述べている。共通 Modal の onclose を「直ちに閉じる」ではなく「閉じる要求」として扱い、子フォームが未保存なら破棄確認を出す。_sandbox/repository-implementation-findings-2026-08-01.md の指摘 3、推奨順 3。TASK-74 と TASK-76 で同じ経路を触るため、その後に着手する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Modal の onclose が閉じる要求として扱われ、子フォームが未保存なら破棄確認を経るまでアンマウントされない
- [ ] #2 設定とプロジェクト登録の両方で、閉じるボタンと Escape の双方が確認を通る
- [ ] #3 保存中・登録中に Escape を押した場合の扱いが決まっている
- [ ] #4 Modal.svelte の実装とずれたコメントが直っている
- [ ] #5 閉じるボタン・Escape・変更なし・未保存あり・処理中の組合せがコンポーネントテストで固定されている
<!-- AC:END -->
