---
id: TASK-42
title: 不正な status 別名の未対応化を台帳 load から解釈まで一貫させる
status: In Progress
assignee: []
created_date: '2026-07-24 04:01'
updated_date: '2026-07-28 22:11'
labels:
  - 'kind:bug'
milestone: m-1
dependencies: []
priority: medium
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
status 別名表（doc-3 §3.3）の値が正準4列でないとき（例: 手編集した Done = "Shipped"）、doc-3 §3.3 は「不正として無視し、当該 status を未対応として扱う」と定める。現状はこの規則が台帳層と解釈層で食い違い、実経路（load→sanitize→interpret）では未対応化に到達しない。

TASK-26 実装（ledger.rs validate_and_sanitize）は不正な別名値をキーごと削除する（status_aliases.retain(|_, v| is_canonical_status(v))）。TASK-29 実装（interpret/status.rs map_status）は別名が無ければ名称一致へフォールバックする。したがって Done = "Shipped" のエントリでは、load 時に Done キーが消え、interpret では別名不在として Done が名称一致で Done 列へ配置される。doc-3 §3.3 の「当該 status を未対応にする」が効かない。

TASK-29 の PR #5 で Codex が [P2] として指摘。TASK-29 の AC 範囲外（解釈層のコメントは実態どおり修正済み）のため、doc-3 §3.3 と TASK-26 AC #5（値は正準4列に限る）の突き合わせを含めて本タスクで扱う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 load→interpret の実経路で、正準4列でない別名値を持つ status が未対応（column None）になり、名称一致へフォールバックして正準列へ入らないことを保証する
- [x] #2 台帳層で不正別名をキーごと削除する現行実装（TASK-26）と、doc-3 §3.3「不正として無視し当該 status を未対応にする」の突き合わせを行い、削除する／別名不正として保持する／load を拒否する のいずれを採るか根拠を Implementation Notes に記録する
- [x] #3 実経路（LoadedLedger::load を通す）を検証する統合回帰テストを追加する
- [x] #4 TASK-26 AC #5「status_aliases の値は正準4列のいずれかに限る」の解釈（保持するが無効化する等）と齟齬がないことを確認する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 原因

台帳 load 時の不正別名削除（`Ledger::validate_and_sanitize` の `status_aliases.retain(|_, v| is_canonical_status(v))`）が、doc-3 §3.3 の「不正として無視し、**当該 status を未対応として扱う**」の後半を表現できないことが原因。キーごと消すと「そのプロジェクトが別名を設定していない」状態と区別がつかず、`map_status` は名称一致へフォールバックする。`Done = "Shipped"` のエントリで Done が Done 列へ入っていた。

## 採った選択（AC #2）

**別名不正として保持する**を採った。

- *削除する*（現行）: 不具合そのもの。doc-3 §3.3 の後半を表現できない。
- *load を拒否する*: doc-3 §3.3 は「不正として無視し」と定めており、台帳全体を読めなくする根拠が設計側に無い。手編集 1 行で Atlas が起動不能になる代償も釣り合わない。
- *保持する*: 不正な組を解釈層まで運び、doc-3 §3.3 の唯一の適用点である `interpret/status.rs` の `map_status` に無視させる。副次的に、利用者の手編集を黙って消さず台帳ファイル・台帳画面に残る。

実装は `Ledger::validate_and_sanitize` から `retain` を除いただけ。sanitize する対象が無くなったので名前を `Ledger::validate`（`&self`）へ改めた。`map_status` 側は TASK-29 時点で既に「別名の値が正準4列でなければ未対応、名称一致へは戻さない」を実装済みで、変更していない。

## AC #1 の文言修正

当初の AC #1 は「未対応（column None）**かつ強い縮退印**」としていたが、decision-4 は強い縮退印（doc-4 の想定外スキーマ）を「config.yml にすら無い status」だけに結びつけている。本タスクの例の `Done` は config.yml 宣言済みであり、文字どおり実装すると decision-4 に反する。また不正別名の非は台帳（Atlas 側の設定）にあってタスクの Markdown は壊れていないため、タスクへ想定外スキーマ印を付けるのは誤った指し先を示すことになる。ユーザー確認のうえ AC #1 から「強い縮退印」を外した（decision-4 は改訂しない）。結果、当該 status は `declaration = Declared` のまま `column = None` になる。

## TASK-26 AC #5 との突き合わせ（AC #4）

齟齬なし。AC #5「status_aliases の値は正準4列のいずれかに限る」は Atlas 自身が別名を受理する経路の制約であり、`Ledger::update` が従来どおり `InvalidStatusAlias` で拒否する（変更なし）。手編集で台帳ファイルへ入り込んだ値の扱いを定めるのは doc-3 §3.3 の「不正として無視」の側であって、台帳ファイルを黙って書き換える規定ではない。

## 変更点

- `src-tauri/src/ledger.rs`: `validate_and_sanitize` → `validate`（`&self`）。`retain` を削除し、保持する理由（削除では別名不在と区別できない）を doc コメントに記録。`ProjectEntry::status_aliases` にも手編集値が非正準でありうる旨を追記。
- `src-tauri/src/interpret/status.rs`: 「load が既に除去済みなので他経路向けの防御」というコメントが実態と逆になったため、ここが規則の唯一の適用点である旨へ修正。
- `backlog/docs/doc-3` §3.3: 不正別名を台帳ファイルから取り除かず列対応の時点で無視する旨と、その理由を追記。

## 検証

- 統合回帰テスト（AC #3）: `commands.rs` の `an_invalid_alias_in_the_ledger_file_leaves_that_status_unmapped`。projects.toml を書く → `LoadedLedger::load` → `Workspace::open` → `ProjectSnapshot` という実経路で、`Done = "Shipped"` のもと `column = None` / `raw = "Done"` / `declaration = Declared` を確認する。修正前の挙動（load で retain）を一時的に戻して実行し、`left: Some(Done), right: None` で落ちることを確認済み。
- `ledger.rs` の `load_sanitizes_invalid_status_alias` を `load_keeps_invalid_status_alias_for_the_interpretation_layer` へ反転。
- cargo test 233 passed（0 failed / 3 ignored）、cargo fmt、cargo clippy --all-targets -D warnings いずれも clean。
<!-- SECTION:NOTES:END -->
