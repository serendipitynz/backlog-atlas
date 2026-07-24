---
id: TASK-29
title: status 正規化・別名表適用と Type 導出を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-24 00:33'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-28
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-4・doc-3 §3.3・decision-4・decision-5 に従い、読み取り層で得た status を正準ステータス列（To Do/In Progress/In Review/Done）へ対応づけ、kind ラベルから Type を導出する。対象 Markdown を書き換えず Atlas 側の解釈として行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 名称一致（大文字小文字・前後空白を無視）で正準列へ対応づけ、別名表があれば適用する
- [x] #2 draft の Draft を既知 status として扱い、未知 status として縮退させない
- [x] #3 別名表にも名称一致にも該当しない status を未対応 status として区別する
- [x] #4 kind 接頭辞除去で Type を導出し、複数併記・未設定・未知を区別する
- [x] #5 Type を通常ラベルと分離し、通常ラベル一覧に kind ラベルを混ぜない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
解釈層を read 層とは別の src-tauri/src/interpret（status.rs / type_value.rs）に置いた。理由は、列対応規則が台帳エントリの status 別名表を必要とする一方、read 層は台帳非依存に保つべきであり（対象 Markdown を書き換えず Atlas 側の解釈として持つ、doc-2 の境界）、解釈を (task, config, aliases) の純関数にすれば別名表の変更で再読み込みが要らないため。

status（decision-4・doc-3 §3.3）。1 つの status 値について「どの列か」と「値として既知か」を別の軸として返す（StatusMapping.column / .declaration）。両者は含意関係になく、doc-7 §5 が両方を必要とする。
- 列対応: 別名表を先に引き、無ければ名称一致（前後空白・大小文字を無視）。どちらにも該当しなければ column=None（未対応 status）。
- 別名の値が正準 4 列でない場合は不正として無視し、名称一致へフォールバックせず未対応にする（doc-3 §3.3 の明文）。台帳 load 時に既に除去されるため、これは他経路で表を組む呼び出し側への防御。
- 別名表のキー照合も名称一致にした。既定規則が大小文字非依存である以上、キーだけ厳密一致だと `doing` と書いた別名が黙って効かない。
- declaration は Declared / Draft / Undeclared / NoDeclaredSet の 4 値。Draft は config.yml に無くても既知（doc-4 §3.4）。statuses 未定義のルート（decision-4 実測の geomyth）を Declared と同一視せず NoDeclaredSet として分けたのは、「縮退しない」を「プロジェクトが保証した status」と読ませないため。強い縮退印（想定外スキーマ）は Undeclared のみ。

Type（decision-5）。既知 Type 集合の照合は大小文字非依存にし、表示値は原文の大小文字を保持する。複数 kind は labels 出現順で全件保持、kind 無しは空配列（TypeValues::is_unset）、未知 Type は値を保持して known=false を立てる。`kind:` のみの空ラベルは空文字の未知 Type 値として残す（通常ラベルにも Type にも無い状態にして消さない）。

既存コードへの波及。
- read.rs の is_known_status を StatusDeclaration::of へ、split_labels を interpret::type_value::split_labels へ委譲した。規則の定義を 1 か所にするため。doc-4 §3.3 が固定するのは「分離を行う場が読み取り層である」ことなので、適用箇所は read 層のまま。
- 副作用として、config.yml 宣言済み status の照合が大小文字・前後空白非依存になった（従来は完全一致）。decision-4 の名称一致と同じ規則に揃えたもので、`to do` と `To Do` を別値として縮退させない。
- ledger.rs の CANONICAL_STATUSES を StatusColumn::as_str() から組み立て、正準 4 列の文字列リテラル二重定義を解消した。

検証: cargo test 114 passed（うち interpret 25 件が新規）、cargo fmt --check clean、cargo clippy --all-targets -D warnings clean。
<!-- SECTION:NOTES:END -->
