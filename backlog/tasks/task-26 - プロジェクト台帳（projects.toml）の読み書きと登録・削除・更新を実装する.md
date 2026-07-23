---
id: TASK-26
title: プロジェクト台帳（projects.toml）の読み書きと登録・削除・更新を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-23 10:48'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-25
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 の設計に従い、Atlas が読み込む対象プロジェクトの台帳を実装する。台帳ファイルは Tauri の app_config_dir 直下に単一 projects.toml として置き、いずれの Backlog ルートにも書き込まない。台帳は Backlog CLI の管理対象外であり、Atlas 自身が読み書きする（decision-2 の境界の外側）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 schema_version を検査し、未知の上位版は上書き破壊しないよう読み取り専用で縮退する
- [x] #2 登録: プロジェクトルート指定から backlog_root を解決し config.yml と tasks/ の存在を確認、slug 導出・一意性検査、git_remote_present 判定を行いエントリを追記する
- [x] #3 削除: slug 指定でエントリを外し、対象プロジェクトの管理ファイル・Git には触れない
- [x] #4 更新: slug は不変、backlog_root・git_remote_present（再判定）・status_aliases・表示並び順を変更できる
- [x] #5 status_aliases は任意（省略時は空）で、値は正準4列のいずれかに限る
- [x] #6 同一プロジェクトの移動では slug を保ったまま project_root と backlog_root の両方を更新する（doc-3 §4.3）
- [x] #7 横断タスクID の生成・解析を実装する: 最初の : で分割、左辺 slug を台帳で検査、右辺を task_prefix の通常 ID または DRAFT-N で検査、単一プロジェクト文脈でのみ無修飾 ID を許可（doc-3 §5）
- [x] #8 slug 契約を実装する: 既定は project_root 由来で導出、利用者指定の別 slug を許可、[a-z0-9][a-z0-9-]*（コロン・空白禁止）と台帳内一意性を検査する（doc-3 §3.1）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲（AC #1–#8）

doc-3 の設計に沿って、プロジェクト台帳（projects.toml）のコアロジックと Tauri コマンド層を実装した。UI（登録・管理画面）は TASK-39 の範囲で、本タスクはバックエンドまで。

## 主要ファイル

- `src-tauri/src/ledger.rs`（新規）: Tauri 非依存のコアロジック。単体テスト 20 件。
  - 型: `Ledger`（`schema_version` + `[[project]]` 配列）, `ProjectEntry`（slug/project_root/backlog_root/git_remote_present/status_aliases）, `LoadedLedger`（read_only フラグ付き）, `RegisterRequest`/`UpdateRequest`, `ParsedTaskRef`, `LedgerError`。
  - `LoadedLedger::load`/`save`: TOML 読み書き。ファイル不在は空の書込可能台帳（初回起動）。
  - `register`/`remove`/`update`: doc-3 §4。
  - slug 契約（`is_valid_slug`/`derive_slug`/`normalize_slug`）, 横断タスクID（`generate_cross_task_id`/`parse_cross_task_id`）, `detect_git_remote`, `verify_backlog_root`。
- `src-tauri/src/lib.rs`: Tauri コマンド配線。`ledger_list`/`ledger_register`/`ledger_remove`/`ledger_update`/`cross_task_id_generate`/`cross_task_id_parse`。台帳パスは `app_config_dir()/projects.toml`（doc-3 §2.1）で解決。

## AC 対応

- #1 schema_version 検査: 既知版(1)=読み書き可 / 未知の上位版=read_only 縮退で `save` は `ReadOnly` エラー拒否 / それ以外=`UnsupportedSchemaVersion`。ファイル不在は空台帳。
- #2 登録: backlog_root 解決（既定 project_root/backlog）→ config.yml と tasks/ の存在確認 → slug 導出/検査・一意性 → git_remote_present 判定 → 追記。対象プロジェクトには一切書き込まない。
- #3 削除: slug 指定でエントリ除去のみ。対象の管理ファイル・Git には触れない（FS/Git 操作を一切行わない実装で保証）。
- #4 更新: slug は UpdateRequest の選択キーで変更手段を持たない（構造的に不変）。backlog_root・git_remote_present（再判定）・status_aliases・表示並び順（new_index）を変更可。
- #5 status_aliases は任意（skip_serializing_if=empty、既定空）。設定時に値が正準4列（To Do/In Progress/In Review/Done）のいずれかであることを検査し、外れる値は `InvalidStatusAlias` で拒否。
- #6 移動: project_root 指定を移動として扱い、slug を保ったまま project_root と backlog_root の両方を更新（backlog_root 明示なしは新 root 直下を既定）。
- #7 横断タスクID: 最初の `:` で 2 分割し左辺 slug を台帳で検査、右辺を `<task_prefix>-N`/`DRAFT-N` で検査。`:` を含まない入力は context_slug がある単一プロジェクト文脈でのみ無修飾 ID として許可。生成は `<slug>:<TASK-ID>`（前後空白除去）。
- #8 slug 契約: 既定は project_root ディレクトリ名を小文字化・正規化して導出、利用者指定の別 slug を許可、`[a-z0-9][a-z0-9-]*`（コロン・空白禁止）と台帳内一意性を検査。

## 依存の追加（TASK-25 AC #6 ゲート）

- `toml = "0.8"` を新規本番依存として追加。projects.toml を serde と組み合わせて型安全に読み書きするため。導入範囲は台帳ファイルの (de)serialize に限定。導入前にユーザー承認を得た（ゲート遵守）。
- git_remote_present 判定は doc-3 §3.2 に従い `std::process::Command` で `git -C <root> remote` を固定引数配列実行（新規 crate なし、シェル文字列連結なし）。コミット・PR 関連解決の手段設計は TASK-10 の範囲。
- 台帳パス解決は Tauri コア（app_config_dir）で、新規プラグイン導入なし。

## 検証

- `cargo fmt --check`: clean
- `cargo clippy --all-targets -- -D warnings`: 0 警告
- `cargo build`: ok
- `cargo test`: 20 passed（slug 文法/導出、register 成功・重複/不正 slug・不正 backlog_root 拒否、remove、update の backlog_root/status_aliases/移動/並び替え・非正準 alias 拒否、横断タスクID の生成/解析/DRAFT/無修飾コンテキスト/未知プロジェクト・不正 ID・カスタム prefix、save/load 往復、未知上位版 read_only、git remote 検出）
<!-- SECTION:NOTES:END -->
