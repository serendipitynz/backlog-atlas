---
id: TASK-89
title: slug 導出プレビューを最新呼出しの応答だけで更新する
status: To Do
assignee: []
created_date: '2026-07-31 23:33'
updated_date: '2026-08-01 00:44'
labels:
  - robustness
  - ui
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: low
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ProjectRegister の readDefaultSlug は呼出し開始時の projectRoot をローカル変数へ保持するが、await 完了後に現在の input.projectRoot や呼出し番号を確認せず defaultSlug と defaultSlugKnown を更新する。ルート A の照会後、完了前に B へ変更し、B の応答後に A の応答が届くと、B の入力欄の下へ A 由来の slug 候補が出る。実際の登録時はバックエンドが検証・導出するので誤った台帳書込みが確定するわけではない。

m-2 に置く理由: 利用者は画面に出た slug で登録されると判断するため、表示と登録結果の食い違いは公開阻害の定義（利用者の誤解）に当たる。当初は発生窓が短いことを根拠に m-3 へ置いたが、発生確率は定義に入っておらず、修正も ProjectRegister.svelte 1 ファイルに収まるため m-2 へ改めた（2026-08-01 のレビュー指摘）。

_sandbox/repository-implementation-findings-2026-08-01.md の指摘 6。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 呼出しトークンまたは応答時の入力値照合により、最新呼出しの応答だけが表示へ入る
- [ ] #2 A と B の Promise を任意順で解決できる試験があり、古い応答が現在の表示を変えないことを確認している
<!-- AC:END -->
