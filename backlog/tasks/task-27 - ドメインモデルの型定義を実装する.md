---
id: TASK-27
title: ドメインモデルの型定義を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-23 12:19'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-25
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4 §3 の設計に従い、Backlog 管理ファイルの内容を写す Atlas 内部のメモリ上データ構造（タスク・設定・マイルストーン・文書）を型として定義する。判別できた事実と、未確定・不足の明示を同居させ、縮退表示へ回せるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タスク・設定・マイルストーン・文書の型を定義し、1プロジェクト内で id により相互参照できる
- [x] #2 タスクに project（走査元ルート由来）と storageState（active/draft/completed/archive）を frontmatter とは独立の軸で保持する
- [x] #3 type（kind 由来）と通常ラベルを分離して保持し、生の labels を混在させない
- [x] #4 AC を #N・本文・checked 状態の並びで保持し、health（正常/縮退）と不足フィールドを保持する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲（AC #1–#4）

doc-4 §3 に従い、Backlog ルートの内容を写す Atlas 内部ドメインモデルの型を定義した。本タスクは型定義のみで、ファイル解析（config 解決・走査・SECTION/AC 解析）は TASK-28、status 正規化・Type 導出は TASK-29 の範囲。

## 主要ファイル

- `src-tauri/src/domain.rs`（新規）: Tauri 非依存の型定義。単体テスト 10 件。
  - `StorageState`（active/draft/completed/archive）, `Config`, `Milestone`, `Document`, `AcceptanceCriterion`, `RequiredField`, `ReferenceKind`, `DegradeEvent`, `TaskHealth`, `Task`, `ProjectModel`。
  - `ProjectModel` は config + tasks/milestones/documents を持ち、`task`/`milestone`/`document` で id により相互参照解決（AC #1）。
- `src-tauri/src/lib.rs`: `pub mod domain;` を追加（読み取り層・コマンド層が共有する公開ドメイン語彙として公開）。
- `src-tauri/Cargo.toml`: `[dev-dependencies] serde_json`（テストの JSON ワイヤ契約検証のみ。tauri 経由で既にツリーに在り追加ビルドなし。本番依存ではない）。

## AC 対応

- #1 相互参照: `ProjectModel` が 1 プロジェクト内の tasks/config/milestones/documents を保持し、id で相互参照（`task`/`milestone`/`document` ルックアップ）。タスクは `documentation`（doc ID 列）と `milestone` で文書・マイルストーンを参照。id は解析可能タスクのみ `Some` を持ち、id 欠落の解析不能タスクは id 参照に載らない。
- #2 独立軸: `Task.project`（走査元ルート由来の台帳 slug）と `Task.storage_state`（走査元ディレクトリ由来）を frontmatter とは独立に保持。status が Done でも tasks/ なら active（テストで検証）。保存区分は `Option<StorageState>` とし、5 走査元以外のタスク様ファイルは `None`（未確定、想定外スキーマ）で表現し active と誤認させない（doc-4 §3.4）。
- #3 ラベル分離: `type_labels`（kind 由来。TASK-8 確定まで生の kind 値を Type 候補として保持。ワイヤ名は `type`）と `labels`（通常ラベル）を別フィールドで保持し、生 labels を混在させない。
- #4 AC 保持と health: `acceptance_criteria` は `AcceptanceCriterion { number, text, checked }` の並びで保持。`TaskHealth`（Ok/Degraded）と `DegradeEvent`（解析不能=不足必須フィールド列 / 想定外スキーマ / 参照欠損）で health と不足内容を保持。ルート読取不能はルート単位のため本型には含めない（doc-4 §5）。

## 設計判断

- 「判別できた事実」と「未確定・不足の明示」の同居（doc-4 §3・§5）のため、必須フィールド id/title/status を `Option` とし、解析不能ファイルも捨てず縮退タスクとして表現。`Task.source_path` は id 欠落時でも縮退表示で対象ファイルを特定するために保持。
- ワイヤ契約は doc-4 §3.1 の camelCase 名（storageState 等）に serde rename で一致させ、対応表を IPC の契約とする。kind 由来 Type スロットは §3.1/§3.3 の名に合わせ `type` で直列化。`DegradeEvent` の内部タグは `kind` フィールドと衝突するため `event` に。

## 検証

- `cargo fmt --check`: clean
- `cargo clippy --all-targets -- -D warnings`: 0 警告
- `cargo test`: 36 passed（うち domain 10 件: id 相互参照、documentation 参照の解決/欠損、storage_state と status の独立、project/storage_state 保持、保存区分未確定が active でない、Type と通常ラベルの分離、AC の number/text/checked、解析不能タスクの保持と不足フィールド、`type`/camelCase ワイヤ名、Degraded タグ付き直列化）

## レビュー対応（PR #3, [P2]×3）

- documentation 参照を `Task.documentation` として保持（doc-4 §3.2・§5 の文書相互参照・参照欠損の入力）。
- kind 由来 Type スロットを `type` で直列化（§3.1/§3.3。`typeLabels` への逸脱を修正）。
- `storage_state` を `Option<StorageState>` にし未確定を表現可能に（§3.4）。
<!-- SECTION:NOTES:END -->
