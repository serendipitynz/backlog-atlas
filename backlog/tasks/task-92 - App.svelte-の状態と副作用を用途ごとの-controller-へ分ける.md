---
id: TASK-92
title: App.svelte の状態と副作用を用途ごとの controller へ分ける
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:42'
labels:
  - maintainability
  - ui
  - 'kind:refactor'
milestone: m-3
dependencies: []
priority: medium
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
App.svelte は冒頭で「grid が描く data と screen-local row state だけを持つ」と説明するが、実際には起動順序と初期 probe、全プロジェクト snapshot の所有、ファイル監視の開始・停止と再読込イベント反映、台帳の登録・更新・削除・並べ替え、設定の読取・保存・適用、画面遷移と未保存確認、タスク・文書・マイルストーン更新の結果反映、Git 履歴読込の起動、列内タスク作成、固定ヘッダ・メニュー・ショートカット・モーダルまで担っている。機械的に数えると 39 個の $state、33 個の $derived、43 個の関数が同じ script にある。個々の規則は src/lib へ出ているが、いつ呼ぶか・どの snapshot を置換するか・どの画面状態を閉じるかが 1 ファイルに集まり、画面横断機能を足すたびにここを変えることになる。表示コンポーネントを細かく割るだけでは足りず、workspace の open/reload/watch と snapshot 置換、台帳の登録・更新・削除・並べ替え、設定の読取・保存・監視再調整、タスク履歴の選択・読込・取消、オーバーレイと未保存確認を用途ごとの controller へ移す。UI 改修が落ち着いた形に対して分割するのが正しい順序なので v0.1.0 後に行う。_sandbox/repository-quality-assessment-2026-08-01.md の構成節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 上記 5 つの用途が controller または Svelte module へ分かれている
- [ ] #2 App.svelte が保持する state と関数の数が減り、担う責務が冒頭のコメントと一致している
- [ ] #3 分割の前後で既存のテストが通り、画面の挙動が変わっていない
<!-- AC:END -->
