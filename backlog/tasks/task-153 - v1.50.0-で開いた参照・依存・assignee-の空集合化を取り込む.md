---
id: TASK-153
title: v1.50.0 で開いた参照・依存・assignee の空集合化を取り込む
status: To Do
assignee: []
created_date: '2026-08-12 02:47'
labels:
  - 'kind:research'
milestone: m-3
dependencies: []
priority: medium
ordinal: 147700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.50.0 が、それまで沈黙無変更だった 3 つの空値に意味を与えた。task edit --ref "" ・--depends-on "" ・-a "" は、v1.48.0 と v1.49.3 では終了コード 0 を返して既存値を変えなかったが、v1.50.0 以降はその一覧を空にする（実装は task-builders.ts の parseClearableStringList が空値を空配列へ変換する経路で、v1.49.3 にこの関数は無い）。加えて --clear-refs・--clear-deps・--clear-docs と、増分指定の --add-ref・--remove-ref が新設された。現在 Atlas はこの 3 操作を CLI 起動前に拒否しており（update.rs の RejectReason::EmptyReferences・EmptyDependencies・EmptyAssignee）、doc-5 §3.1 と doc-8 §6 が「CLI に手段が無いので提供しない」と書き、画面は外部エディタ経路へ案内している。拒否は安全側なので上位版でも壊れないが、利用者の CLI が現に行える操作を Atlas が断っている状態になる。取り込むなら最低バージョン要件を v1.50.x へ上げることが前提で、TASK-152 が v1.49.3 まで上げた後の判断になる。ユーザーは 2026-08-12 に 1.50.x を「公開から日が短すぎる」として m-2 では採らないと確定しており、本タスクはその先の判断を持つ。作業は版要件の引き上げだけでは終わらない。GUI 側に、無効化していた最後の 1 件の削除と assignee の解除を開く実装が要る（doc-8 §6 が案内する外部エディタ経路の扱いも併せて決める）。取り込むかどうかそのものが製品判断なので、着手セッションは決定先行になる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 v1.50.x を最低バージョン要件にするかどうかの判断と理由が記録されている
- [ ] #2 取り込む場合、参照・依存の最後の 1 件の削除と assignee の解除が画面から行える
- [ ] #3 取り込む場合、doc-5 §3.1 と doc-8 §6 の非提供の記述と、外部エディタ経路への案内が現状に合っている
- [ ] #4 取り込まない場合、上位版で行えるのに Atlas が断る状態を残す理由が記録されている
<!-- AC:END -->
