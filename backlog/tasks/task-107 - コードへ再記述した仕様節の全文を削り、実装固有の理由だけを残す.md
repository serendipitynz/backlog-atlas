---
id: TASK-107
title: コードへ再記述した仕様節の全文を削り、実装固有の理由だけを残す
status: To Do
assignee: []
created_date: '2026-08-01 00:44'
updated_date: '2026-08-01 00:45'
labels:
  - maintainability
  - 'kind:refactor'
milestone: m-3
dependencies:
  - TASK-79
priority: low
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
同じ契約が設計文書・Rust・TypeScript・Svelte の複数箇所へ複製されている。コメントが正しければ意図の復元に有効だが、変更時に同時更新されないと実装より強く誤った前提を伝える。実際に Modal.svelte:6-21 は「モーダル経路で未保存入力を失わない」と説明していたが、設定と登録のモーダルを閉じると子フォームがアンマウントされていた（TASK-86 で直す）。

方針はコメントを減らすこと自体ではなく、仕様節の全文をコードへ再記述せず実装固有の理由だけを残すこと。TASK-79 が画面から設計文書参照を落とすのと同じ問題のコード側であり、TASK-79 の後に着手する。

_sandbox/repository-quality-assessment-2026-08-01.md の可読性節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc の節の全文をそのまま写したコメントが無くなっている
- [ ] #2 残したコメントが「なぜこの境界・順序・縮退を選ぶか」を述べており、実装が読めば分かることを繰り返していない
- [ ] #3 コメントと実装が食い違っている箇所が他に無いことを確認した記録がある
<!-- AC:END -->
