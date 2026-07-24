---
id: TASK-28
title: 読み取り層（config 解決・走査・解析・保存区分・縮退）を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-24 00:22'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-27
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4 の設計に従い、台帳エントリが指す各 Backlog ルートを入力に、管理ファイルを解析してドメインモデルを構築する読み取り専用の層を実装する。書き込みは含まない。cross-branch は扱わず現在 checkout のみを対象とする（decision-2）。生成元の版に依存せず、スキーマ能力検査で読む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.yml を先に解決し、status 定義・task_prefix・ディレクトリ構成を得る
- [x] #2 tasks/drafts/completed/archive/tasks/archive/drafts/milestones/docs/decisions を走査する（archive はネスト構造で辿る）
- [x] #3 frontmatter（YAML）と SECTION/AC 区切り本文を解析し、走査元ディレクトリから保存区分を付与する
- [x] #4 必須/任意/存在時構造検査の3分類でスキーマ能力検査を行い、任意項目の不在で正常タスクを縮退させない
- [x] #5 解析不能・想定外スキーマ・参照欠損・ルート読取不能の4事象を区別し、1ファイルの事象を1タスクの縮退に閉じ込める
- [x] #6 走査処理を差し替え可能な走査元境界に閉じ込め、cross-branch を現在 checkout に限定しつつ将来のブランチ切替を再走査契機にできる構造にする（decision-3）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲（AC #1–#6）

doc-4 の設計に従い、Backlog ルートを走査して ProjectModel を構築する読み取り専用層を実装した。書き込みは含まない。cross-branch は扱わず現在 checkout のみ（decision-2・decision-3）。status 正規化と Type 値の導出は TASK-29、PR URL 抽出は TASK-30 の範囲で、本層は分離と保持までを行う。

## 主要ファイル

- `src-tauri/src/read.rs`（新規）: 読み取り層の入口 `read_project(slug, &dyn ScanSource)` と `RootError`、タスク/マイルストーン/文書/決定の組み立て、参照解決。単体テスト 24 件。
- `src-tauri/src/read/scan.rs`（新規）: 走査元境界。`ScanDir`（走査先と保存区分の対応）と `ScanSource` トレイト、現在 checkout 実装 `WorkingTree`。
- `src-tauri/src/read/parse.rs`（新規）: 純粋なテキスト解析。frontmatter 分離、YAML フィールド抽出、SECTION/AC 本文解析。単体テスト 13 件。
- `src-tauri/src/domain.rs`: 読み取り層が必要とする 3 点を追加 —`Decision` 型と `ProjectModel.decisions`（AC #2 が走査を要求する decisions/ の置き場。doc-4 §3.2 の 文書 は docs/doc-N のみなので `Document` へは混ぜない）、`UnknownSection` と `Task.unknown_sections`（§4「未知の NAME は本文断片として保持」）。
- `src-tauri/Cargo.toml`: `serde_yaml_ng`（本番依存、下記ゲート）。

## AC 対応

- #1 config 先行解決: `read_project` は他の走査より先に `config.yml` を解決し、statuses・task_prefix・default_status・date_format を `Config` へ写す。未知 status 判定はこの解決済み statuses を根拠にする（テストで In Review が config 非宣言なら縮退することを確認）。
- #2 走査: `ScanDir::ALL` が tasks / drafts / completed / archive/tasks / archive/drafts / archive / milestones / docs / decisions を列挙。archive は平坦化せず宣言されたネストで辿る。
- #3 解析と保存区分: frontmatter（YAML）と SECTION/AC 区切り本文を解析し、保存区分は走査元 `ScanDir` から付与する。走査を列挙にしてあるため、保存区分はファイル内容から推測されることが構造的に起こらない。
- #4 3分類のスキーマ能力検査: 必須（id/title/status）は欠落で解析不能、任意は不在が正常で縮退契機にしない、存在時構造検査（SECTION 対の開閉・AC の #N 番号列・YAML 妥当性）は存在するときだけ検査する。frontmatter だけの最小タスクが health Ok になることをテストで確認。
- #5 4事象の区別と封じ込め: 解析不能／想定外スキーマ／参照欠損はタスク 1 件の `DegradeEvent` に、ルート読取不能は `RootError` としてモデルを返さない経路に分ける。壊れた 1 ファイルが隣接タスクを縮退させないことをテストで確認。
- #6 走査元境界: `ScanSource` トレイトが config 読取・ディレクトリ列挙・ファイル読取だけを宣言し、読み取り層は filesystem にも Git にも触れない。`WorkingTree` が現在 checkout の唯一の実装で、ブランチ由来の走査元は兄弟実装として差し込める（decision-3）。読み取り層のテストはすべてインメモリ走査元で駆動しており、これが境界が実際に効いている証拠になっている。

## 設計判断

- **YAML フィールド抽出を derive ではなく Value 走査で行う**: `#[derive(Deserialize)]` の frontmatter 構造体だと、任意フィールド 1 個の型不一致でデシリアライズ全体が失敗し、読めるはずのタスクが解析不能に落ちる。doc-4 §4 の 3 分類はこれでは表現できない。Value を歩けば、壊れた labels は labels だけを縮退させ、id/title/status は写せる（§5「判別できたフィールドは活かし」）。
- **未知 frontmatter キーは縮退契機にしない**: doc-4 §4 は未知フィールドを「保持または無視」とし、未知 SECTION（縮退契機）と扱いを分けている。
- **`labels: ui` のような形違いを 1 要素配列と推測しない**: 想定外スキーマとして報告し値は落とす。ファイルに無い構造を黙って作るのは、この事象区分を置いた目的に反する。
- **statuses が空なら未知 status 検査を無効化する**: 宣言された集合が無ければ矛盾のしようがなく、全タスクを縮退させると config の 1 項目の欠落でルート全体が縮退する（AC #4 の趣旨に反する）。
- **archive/ 直下の .md も走査する**: v1.47.1 は archive/ 直下にタスクを置かないが、読み取りは生成元の版に依存できない（§4）。見つけた場合は保存区分を未確定（`None`）にしたうえで想定外スキーマとして残し、active と誤認させない（§3.4 末尾）。
- **マイルストーン・文書・決定は id/title を欠くとスキップする**: これらにはタスクのような per-file health が無い（§5 の縮退はタスク単位）。スキップすると、参照していたタスク側に 参照欠損 として現れるため、欠落は見える場所に出る。
- **`references` は解決対象にしない**: 値が URL・リポジトリ相対パス・ID の混在で、「ルート内に見つからない」が判定できない。PR URL の抽出は TASK-30。
- **`documentation` の値はパス形式も ID へ正規化する**: 実ルートには `doc-3` と `backlog/docs/doc-2 - Title.md` の両形式が在り、正規化しないとパス形式が一律 参照欠損 になる。

## 新規本番依存の導入ゲート（AGENTS.md）

`serde_yaml_ng = "0.10"`（MIT）を追加。アーカイブ済み serde_yaml の保守フォークで API は同一。選定理由: doc-4 §5 が「frontmatter が YAML として読めない」を独立した解析不能事象としており、YAML 妥当性そのものが必要な信号になる。自前のサブセットパーサは手編集ファイルを黙って誤読しうるため、この用途では依存より悪い。導入範囲は読み取り層の frontmatter・config.yml 解析に限定。ユーザー承認済み。

## 検証

- `cargo fmt --check`: clean
- `cargo clippy --all-targets -- -D warnings`: 0 警告
- `cargo test`: 77 passed（うち本タスク 37 件: read 24 / read::parse 13）
- 実ルートでのスモーク確認（一時テストで実行後に削除）: 本リポジトリの backlog（tasks 40・milestones 2・docs 9・decisions 7）と、v1.47.1 CLI で全保存区分を作った probe ルート（tasks/drafts/completed/archive/tasks/archive/drafts）を読み、縮退 0 件。probe 側は config.yml に Draft を含まないが DRAFT-1 が縮退しないことも実データで確認した。
<!-- SECTION:NOTES:END -->
