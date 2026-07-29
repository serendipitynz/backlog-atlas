---
id: TASK-43
title: コミット・PR 関連解決の参照手段を実装し Git 履歴欄に関連 PR を出す
status: To Do
assignee: []
created_date: '2026-07-25 10:26'
updated_date: '2026-07-28 23:17'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-30
  - TASK-35
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-6 §6 は remote ホスト種別ごとの参照手段（ホストの API 等）を「種別ごとの後追加（別途依存判断）」としており、TASK-30 は PrCommitSource trait の構造だけを固定して実装を送りにした。そのため TASK-35 の Git 履歴欄は関連解決の状態（remote ホスト判別済み／remote 不在／種別判別不能）しか出せず、doc-8 §5 の「各コミットに関連 Pull Request を紐づけて示す」解決済み経路が未達である。GitHub の参照手段を実装し、関連解決結果を Tauri コマンド境界へ通して Git 履歴欄に表示する。新規依存（HTTP クライアント等）の採否は decision として記録する。

doc-8 の改訂（画面設計案の反映）で、Git 履歴欄の粒度が詳細配置ごとに分かれた（doc-8 §3 の割当表・§5）。併置サイドバーは件数だけ、中央モーダルは直近 2 件、全面シングルビューは全件と関連解決の状態を出す。関連解決の状態は「関連が無い」ではなく「今は確かめられない」を意味し、1 行で誤解なく書けないため、狭い配置では省いて全面への導線を添える。本タスクの表示はこの割当に従う。詳細配置そのものの実装は TASK-54 で、本タスクは配置が 1 つ（現行の併置サイドバー）の段階でも成立するよう、粒度の切り替えを表示側の分岐として持つ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GitHub の PR コミット集合取得を実装し remote ホスト種別ごとの参照手段として注入する
- [ ] #2 関連解決結果を Tauri コマンド境界の payload へ通す
- [ ] #3 Git 履歴欄で各コミットに関連 Pull Request を紐づけて表示し、関連なし・参照不能・対象外を区別する
- [ ] #4 新規依存の採否と範囲を decision として記録する
- [ ] #5 関連 PR の表示粒度を doc-8 §3 の割当表に従わせ、粒度を落とした配置には全面表示への導線を添える
<!-- AC:END -->
