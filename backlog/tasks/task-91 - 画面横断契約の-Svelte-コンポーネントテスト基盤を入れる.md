---
id: TASK-91
title: 画面横断契約の Svelte コンポーネントテスト基盤を入れる
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:38'
labels:
  - test
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在の 418 テストはすべてコンポーネントを非マウントで、純粋関数の規則だけを固定している。未保存入力の無確認破棄がその 418 テストを通り抜けたのはこの境界が理由である。UI を多数のタスクで書き換えるのに、この環境では画面確認を依頼する以外の検証手段が無い。コンポーネントテスト基盤を devDependency として入れ、全面導入ではなく少数の画面横断契約だけを固定する。対象はモーダルの閉じると未保存確認、タスク詳細・プロジェクト詳細の離脱と保存中状態、再読込イベント後の選択・未保存・履歴の整合、Rust wire fixture と TypeScript 型利用の往復、起動時の設定・workspace・監視の順序。UI 改修の各タスクより先に着手する。_sandbox/repository-quality-assessment-2026-08-01.md の保守性節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 コンポーネントをマウントして操作できるテスト基盤が devDependency として入り、npm test（または移行後の pnpm test）から動く
- [ ] #2 選定した基盤と、全面導入せず画面横断契約に絞る理由が記録されている
- [ ] #3 モーダルの閉じると未保存確認の契約がテストで固定されている
- [ ] #4 production dependency が増えていない
<!-- AC:END -->
