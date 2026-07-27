---
id: TASK-39
title: 台帳・プロジェクト登録・管理画面を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:29'
updated_date: '2026-07-27 06:45'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-33
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 §4 の台帳操作（登録・削除・更新）に対応する利用者向け GUI 面を実装する。README scope の「複数プロジェクトの登録・管理」の入口。台帳ファイルは Atlas が読み書きし、いずれの Backlog ルートにも書き込まない（doc-3 §2.1、decision-2 の境界の外側）。バックエンドは TASK-26、公開は TASK-33 のコマンド境界を用いる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 台帳エントリ一覧を表示し、登録（プロジェクトルート/Backlog ルート指定→backlog_root 解決・config.yml/tasks 確認・slug 導出/一意性検査・git_remote_present 判定）を GUI から行う（doc-3 §4.1）
- [x] #2 削除（slug 指定でエントリ除去、対象プロジェクトの管理ファイル・Git に触れない）を GUI から行う（doc-3 §4.2）
- [x] #3 更新（backlog_root・git_remote_present 再判定・status_aliases・表示並び順、slug 不変、同一プロジェクト移動は project_root と backlog_root の両方更新）を GUI から行う（doc-3 §4.3）
- [x] #4 台帳ファイルの読み書きは Atlas が行い、いずれの Backlog ルートにも Atlas の登録情報を書き込まない（doc-3 §2.1）
- [x] #5 登録失敗（ルート読取不能・slug 衝突）を理由付きで提示する（doc-3 §4.1）
- [x] #6 slug は project_root 由来の既定を導出しつつ利用者が別 slug を指定でき、[a-z0-9][a-z0-9-]*（コロン・空白禁止）を検査する。衝突・不正時は別 slug 指定で回復させる（doc-3 §3.1）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. doc-3 §2〜§4・decision-4・TASK-26 の ledger.rs・TASK-33 の境界を読み、GUI が扱う語（登録入力・更新可能属性・別名表の編集行・拒否理由・回復先の欄）の対応表を命名より先に確定する。
2. 既存境界の棚卸し: 登録・削除・更新のコマンドは揃っているが、失敗が CommandError::Ledger { detail } の英語一文に潰れており、AC #5/#6 の「ルート読取不能／slug 衝突を区別して回復させる」を英文パースなしに実装できないことを確認する。
3. Rust: 拒否理由を型付き（LedgerRefusal）にし、slug 既定値の導出（doc-3 §3.1）と台帳ファイルの場所（§2.1）を読み取り専用コマンドとして公開する。分類と既定 slug の試験を足す。
4. フォルダ選択ダイアログの依存追加を利用者に確認のうえ導入し、capability は dialog:allow-open のみに限定する。
5. src/lib/ledger.ts に純ロジック（入力→要求の写像・slug/絶対パス検査・別名表の行編集・拒否理由→回復先欄）を置き、vitest を付ける。
6. ProjectLedger.svelte に一覧・登録・削除確認・更新フォーム・表示並び順を実装し、読み取り専用の台帳では編集を withhold する。
7. App.svelte に画面切替（未保存入力の破棄前確認を含む）と台帳変更後の再同期を組み込み、cargo fmt/clippy/test・vitest・svelte-check・vite build を通す。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲

doc-3 §4 の台帳操作（登録・削除・更新）に対応する利用者向け GUI 面を新設した。台帳の読み書きは TASK-26 の `ledger.rs`、公開は TASK-33 のコマンド境界を用い、この画面から書くのは台帳ファイルだけである（対象プロジェクトの管理ファイル・Git・backlog CLI には一切触れない。AC #4）。

## 画面（src/components/ProjectLedger.svelte・src/App.svelte）

- App.svelte にスイムレーンと台帳の 2 画面切替を置いた。行順・フィルタ・選択は shell が持つため往復しても保たれるが、詳細パネルは unmount される。未保存入力があるときは破棄前確認を出す（doc-8 §6.3）。既存の「別のタスクを開く」確認と同じ仕組みへ統合し、`pendingSelection` を `pendingLeave`（行き先が task か ledger か）へ一般化した。
- 一覧は slug・両ルート・git_remote_present・別名表・読み取り状態を出し、↑↓ で表示並び順（doc-3 §4.3）を台帳へ書き戻す（AC #1）。
- 削除は確認を挟み、「Atlas が読む対象から外れるだけで、対象プロジェクトの Backlog ルート・管理ファイル・Git には触れない」ことを本文で明示した（AC #2）。「削除」という語から「プロジェクトを消す」と誤読されやすいため、注記ではなく確認文そのものに置いた。
- 更新は backlog_root・移動（project_root と backlog_root の両方）・git_remote 再判定・status 別名表を 1 フォームで扱う（AC #3）。slug は `EntryEdit` に持たせていないため、構造として不変。
- 一覧が空である理由を 3 通に分けた（読み込み中／台帳を読めていない／登録が無い）。台帳ファイルが読めないときに「まだ登録がありません」と出すと、拒否されるだけの登録へ誘導してしまう。

## 純ロジック（src/lib/ledger.ts・33 件の試験）

対応表を命名より先に確定してから書いた（モジュール冒頭の referent table）。判断の要点:

- **未指定は送らない**: Backlog ルートと slug は空欄なら要求から省く。`""` を送ると Rust 側の既定（`<project_root>/backlog`・ディレクトリ名からの slug 導出）が画面側の値に置き換わる。
- **移動は両ルートを明示送信**する。Rust 側の移動時既定は `<新 project_root>/backlog` で、画面が見せている Backlog ルートと食い違いうるため、見えている値をそのまま保存する（doc-3 §4.3 の「両方更新」）。既定へ合わせるのは利用者が押すボタンにした。入力中に欄を書き換える実装は IME 入力を壊す（FilterBar と同じ規則）。
- **変更が無ければ `null`** を返して要求を送らない。無変更の保存は台帳ファイルを書き直すうえ、ルートを送れば「移動」と見なされて開いているセッションが閉じる。
- **先行検査は入力中の助言であって判定ではない**。slug 文字種（§3.1）・絶対パス（§3）・別名の対応先（§3.3）は文書に綴られているため画面でも検査するが、可否は常に `Ledger::register` / `Ledger::update` が決める。一意性のように別ウィンドウの書き込みで変わるものは、画面が見えている範囲での助言に留めた。

## 境界の拡張（src-tauri/src/commands.rs）

AC #5/#6 のために 3 点足した。いずれも TASK-33 自身の契約（失敗も型付きで、文字列に潰さない）の側にある。

1. **`LedgerRefusal`**: `CommandError::Ledger { detail }` は台帳失敗を英語一文へ潰しており、「ルート読取不能」と「slug 衝突」を画面が区別できなかった。拒否ごとに変種を持つ `CommandError::LedgerRefused { reason, detail }` を追加し、`From<LedgerError>` の網羅 match で分類する（新しい `LedgerError` 変種が無分類で frontend へ抜けると compiler が名指しする）。台帳ファイルの入出力・解析と横断タスクID の失敗は「直せる欄が無い」ため従来の `Ledger` 変種に残した。
2. **`ledger_default_slug`**: slug 既定値の導出規則（doc-3 §3.1）を TS へ二重実装しないため、`derive_slug` を読み取り専用コマンドとして公開した。一意性は含めない（登録時の台帳が権威で、preview は別ウィンドウの登録で陳腐化する）。
3. **`ledger_location`**: 台帳ファイルの場所を画面に出すため。AC #4 の「いずれの Backlog ルートにも書かない」は、パスを見せない限り利用者から確かめられない。手編集（doc-3 §2.2 が支持する経路）の入口にもなる。

`ledger_register` の戻り値も `RegisterResponse { entry, ledger }` へ変えた。slug は導出されうるため、登録したものの名前を画面が知る手段が他に無い（登録直後にそのプロジェクトを開く必要がある）。

## 依存追加（tauri-plugin-dialog、利用者承認済み）

プロジェクトルート／Backlog ルートの指定に OS のフォルダ選択ダイアログを使う（doc-3 §4.1 step 1）。値は「存在する絶対ディレクトリ」でなければならず（§3）、手打ちは外れる方が多い一方でフィードバックは登録拒否しか無い。Tauri 公式プラグインのため新しいベンダーは増えず、capability は `dialog:allow-open` のみ許可した（ask/confirm/message/save は使わない）。ダイアログが返すのは文字列で、読み書きはしない——台帳ファイル以外は Atlas が書かないという §2.1 の性質は保たれる。

## 別名表の助言（decision-4）

別名の主体は「プロジェクトが config.yml で宣言する status」であり、宣言の無い値への別名は効かない（`interpret/status.rs`）。画面では宣言済み status を datalist の候補に出し、宣言の無いキーには「この別名は効きません」と添える。判定の権威は `interpret::status` 側にあり、ここは表示上の助言に留めた。

## 台帳変更後の再同期（App.svelte）

- 登録は `retry`（そのルートだけ開いて監視を張る既存経路）で行を作る。新規登録は「まだ何も読んでいないルート」であり、読取不能行の再試行と同じ位置にある。
- 更新は並べ替え以外で必ず再読込する。移動はモデルが旧ファイルのものになり（境界がセッションを閉じる）、別名表の変更は snapshot の解釈——カードが入る列——を変える（doc-7 §4）。
- 削除は行・非表示・監視なし・版ずれ記録・選択のうち当該 slug のものを落とす。境界側はセッションと監視を既に閉じているため、残るのは slug で引く画面状態だけである。

## 検証

- `cargo fmt --check`・`cargo clippy --all-targets`: 指摘なし。`cargo test` 231 件通過（台帳拒否の分類・既定 slug の試験を追加）。
- `vitest` 173 件通過（`ledger.ts` の 33 件を追加）。`svelte-check` 0 errors / 0 warnings。`vite build` 通過。
- `npm run tauri dev` でアプリが起動し（`dialog:allow-open` を含む capability の検証と ACL 生成も通る）、HMR が新コンポーネントを取り込むところまで確認した。
- **GUI 操作そのもの（登録ボタンを押す・フォルダ選択ダイアログを開く・別名表を編集する）は実行できていない。** この環境から画面をクリックする手段が無く、コンポーネント描画を自動で確かめるには DOM 試験環境（jsdom・testing-library）の新規追加が必要になる。vitest は現状 `environment: "node"` で純ロジック専用と決めてあるため、その追加は別判断として残した。
<!-- SECTION:NOTES:END -->
