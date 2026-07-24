---
id: TASK-31
title: Backlog 更新アダプター（操作写像・引数配列・CLI 失敗処理）を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-24 10:31'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-26
  - TASK-28
priority: high
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5 の設計に従い、Atlas の更新操作を対象プロジェクトを作業ディレクトリとする Backlog CLI 呼び出しへ変換するアダプターを実装する。管理対象 Markdown を直接書き換えず、書き換えるのは Backlog CLI である（decision-2・AGENTS）。CLI は v1.47.1 を動作確認済み範囲とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 task create/edit（title/description/status/label/AC 増減・チェック/AC 差し替え複合/ref 非空全置換/plan/notes/depends）と draft promote/archive・task demote/archive/complete・doc/milestone の操作写像を実装する
- [x] #2 current_dir に project_root を固定し、各引数を配列要素として渡す（シェル非連結）
- [x] #3 終了コードで成否判定し、CLI 失敗時はドメインモデルを変えず stderr を失敗理由として保持する
- [x] #4 複数サブコマンドに分ける操作は途中失敗で以降を中止し、再読込で観測できる状態にする
- [x] #5 v1.47.1 に無い操作（マイルストーン説明更新・AC単一差し替え・ref 空集合化）を提供せず、未知オプションは起動前に拒否する
- [x] #6 起動時に backlog --version で書き込み CLI の版を取得し、動作確認範囲（v1.47.1）の能力・オプションを検査する。CLI 不在・非対応版では更新操作を提供せず読み取り専用に縮退する（decision-7・doc-4 §4）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backlog 更新アダプターを書き込み側モジュール src-tauri/src/update.rs に実装した（read/interpret/history/ledger と並ぶ層）。crate API として公開し Tauri コマンド配線は TASK-33 に委ねる（history と同方針）。操作写像は UpdateOperation → plan_operation で写し、task edit・doc update は複数フィールドを 1 呼び出しにまとめる。作業ディレクトリを project_root に固定し各引数を配列要素として渡す（シェル非連結）。実行ファイル解決だけを差し替え可能にするため BacklogCli trait を境界にし SystemBacklog を PATH 解決の実装とした（sidecar 化は TASK-15）。CLI 失敗は終了コードで判定し stderr を理由として保持しドメインモデルは不変、複数呼び出しは最初の失敗で中止し completed_before/partial を報告（doc-5 §5/§6）。起動時 probe が backlog --version を取得し MIN_VERSION(v1.47.1) 以上のときだけ CliCapability を発行、run はそれを要求するため CLI 不在・非対応版では更新が型として到達不能＝読取専用へ縮退（decision-7）。v1.47.1 に無い操作（マイルストーン説明更新・AC 単一差し替え・参照/依存の空集合化）は型で表現不能または起動前拒否。オプション名は実機 v1.47.1 の --help と照合。PR #7 でレビュー2ラウンド: [P1] 複数ラベル last-only（--add-label はカンマ結合で全件）と空依存の沈黙 no-op（EmptyDependencies で拒否）を修正、[P2] 依存クリア不可の制約を doc-5 §3/§3.1/§3.2・doc-8 §6 へ References と並列で記載（backlog doc update 経由）。approved・merged。
<!-- SECTION:NOTES:END -->
