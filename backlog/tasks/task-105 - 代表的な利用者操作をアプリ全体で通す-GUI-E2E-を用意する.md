---
id: TASK-105
title: 代表的な利用者操作をアプリ全体で通す GUI E2E を用意する
status: To Do
assignee: []
created_date: '2026-08-01 00:44'
labels:
  - test
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: medium
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
実装全体評価書は「配布可能なデスクトップ製品として全操作が成立するとまでは今回の証拠から判断できない」と結論しており、その根拠が「代表的な利用者操作をアプリ全体で通す GUI E2E」の不在である。TASK-91 が入れるコンポーネントテストは画面横断契約を非マウントの純粋関数より上で固定するもので、Tauri アプリを起動して Rust コアまで通す経路は別物である。tauri-driver と WebDriver で、プロジェクト登録 → スイムレーン表示 → タスク詳細 → 編集保存 → 再読込 までの 1 本を通す。

m-3 に置く理由: m-2 の期間は指示書の手順 3 が画面の目視確認をユーザーへ依頼する形で代替しており、公開阻害には当たらない。ただしこの代替は UI 改修 20 件ぶんの確認負担をユーザーへ載せるので、m-2 の消化中に負担が問題になった時点で m-2 へ繰り上げる判断はあり得る。

_sandbox/repository-quality-assessment-2026-08-01.md の機能性節・今回実行していない検証。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tauri-driver または同等の手段で Tauri アプリを起動し操作できる
- [ ] #2 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 の 1 本が自動で通る
- [ ] #3 CI で動かすか手元だけで動かすかの判断と理由が記録されている
- [ ] #4 production dependency が増えていない
<!-- AC:END -->
