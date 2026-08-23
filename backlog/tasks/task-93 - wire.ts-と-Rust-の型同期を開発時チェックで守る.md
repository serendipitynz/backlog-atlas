---
id: TASK-93
title: wire.ts と Rust の型同期を開発時チェックで守る
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-23 04:40'
labels:
  - maintainability
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: low
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
wire.ts は Rust の serde 出力を手書きで写している。Rust 側に主要な wire shape の serialization/deserialization テストがあるため無防備ではないが、TypeScript compiler は実行時 payload を検査せず、Rust テストも TypeScript 宣言を読まない。型を変えると Rust struct/enum と serde 属性、Rust の JSON shape テスト、wire.ts の interface/union、commands.ts の invoke signature、payload を使う純粋関数と Svelte component の 5 箇所を人手で揃える必要がある。wire.ts は 619 行あり、command 数と payload variant が増えるほど見落としやすい。production dependency を増やさず、Rust が出力する schema または fixture をフロントエンドのテストで検証する開発時チェックを入れる。_sandbox/repository-quality-assessment-2026-08-01.md の保守性節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rust の出力と wire.ts の型のずれが npm test / cargo test のどちらかで検出される
- [x] #2 production dependency が増えていない
- [x] #3 意図的に型を変えたときの更新手順が書かれている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 着手時の実測 — AC #1 がどこまで満たされていたか

Description が挙げる「人手で揃える 5 箇所」のうち **4 つは TASK-91 の機構が既に結んでおり、
結ばれていなかったのは 4 つ目の `commands.ts` の invoke signature だけだった**（2026-08-23 実測）。

| Description の箇所 | 結んでいたもの |
|---|---|
| Rust struct/enum と serde 属性 ↔ Rust の JSON 形テスト | `wire_fixtures.rs`（記録 + 網羅 `match`） |
| ↔ `wire.ts` の interface/union | `wire-fixture.test.ts`（項目名・値型・token の 3 方向） |
| ↔ payload を使う純粋関数・component | 同ファイル最終 describe |
| **↔ `commands.ts` の invoke signature** | **無し（照合 0 件）** |

未結合部分の実測値: 登録コマンド 28 件（`generate_handler!` 28 = `#[tauri::command]` 28）、
`commands.ts` の invoke 25 件。コマンド名は 3 か所に手書き、引数キー・引数の型・戻り型・
イベント名 `"project-reloaded"` はどれも両側に書かれて照合されていなかった。

## 足したもの

`src/lib/invoke-signature.test.ts`（`unit` プロジェクト、11 テスト）。記録は取らない —
4 つとも両側で源泉のリテラルなので、fixture はずれる先を 3 つ目にするだけである。

1. **登録と属性が同じ集合を指す。** `generate_handler!` の登録（`::` の最終セグメントで取るので
   別モジュール経由の登録も入る）と、crate 全体の `#[tauri::command]` 付き関数を突き合わせる。
2. **invoke するコマンド名がすべて登録されている。**
3. **JS が渡すキーが Rust の引数名の camelCase と一致する。** JS が渡す引数かどうかは**型**で分ける
   （`AppHandle`・`State<'_, T>` は Tauri が注入）。未知の型は「JS が渡す」側に落とすので、
   注入型が増えたら落ちて読み直しを強いる。
4. **引数の型と `invoke<T>` の T が両側で同じものを指す。** 原始型（`String`・`PathBuf`・`bool`・
   `()`・`tauri::ipc::Response`）と `Result`・`Option`・`Vec` だけを表に持ち、それ以外は**同名照合**
   なので表に `wire.ts` の型名は入らない。**写せない型は素通りではなく失敗。**
5. **イベント名。** crate の `emit` の第 1 引数から集合を作り、定数を解決して `commands.ts` の
   同名定数と文字列を比べる。2 つ目のイベントが生まれたら TS 側を要求する。

**走査の下限。** 3 つの抽出（`lib.rs` の登録・crate の属性・`commands.ts` の invoke）が集合比較に
入るので、空集合同士が一致する形を 2 つで塞いだ: 属性の抽出数を**属性の素の出現数**と突き合わせ、
3 つの抽出すべてに非空を課す。**どちらも数を書いていない** — リテラルの件数を書くと、
次にコマンドを足した回、つまり下限が口を開くべき回に、その数が直されることになる。

## 変異検査 — 13 件すべて落ちることを確かめた

修正を外して落ちるかではなく、**押さえた対象を 1 つずつ壊して、対応する assertion だけが落ちるか**
を測った。Rust の関数名+登録名の同時改名 / 登録名だけの改名 / 引数名の改名 / 引数の型の変更 /
戻り型の変更 / イベント文字列の変更 / 属性と `pub fn` の間への別属性の挿入 / `commands.ts` の
キーの改名 / `invoke<T>` の変更 / 写せない Rust 型（`&str`）の投入 / 呼ばれない新コマンドの登録 —
の 11 件と、走査自身のパターンを痩せさせた 2 件（属性の抽出が 0 件、invoke の抽出が 0 件）。
最後の 2 件で落ちたのは下限の 2 本（`抽出した属性の数が…` と `抽出が空でない`）である。

## フロントが到達しないコマンド 3 件

`cross_task_id_generate`・`cross_task_id_parse`（doc-3 §5.1 の 横断タスクID。それを出す画面がまだ無い）・
`project_close`（起動経路が `workspace_open` で全ルートを開き、閉じる操作を持たない）。
**理由付きの除外一覧にせず、集合そのものを固定した** — 上の理由は本セッションの読みであって
decision・doc が述べたものではない。4 件目が生まれた回に落ちて、判断が要求される形にしてある。

## 押さえていないもの

引数の値が Rust の型で受かるか（`PathBuf` と `String` はどちらも `string` に写るので入れ替えは通る）、
コマンドが名前どおりのことをするか、`fake-boundary.ts` の `commandFakes` 一覧
（あれのラベルは `commands.ts` の関数名で、うち 3 つ `pick_directory`・`ledger_reorder`・
`on_project_reloaded` には対応する Rust コマンドが無い — dialog プラグイン・`ledger_update` の
包み・イベントなので、これは欠陥ではない）。

## AC #3 の書き先

AGENTS.md / AGENTS.ja.md の テスト 節、wire payload の段落の直後。**decision は起こしていない** —
この層の契約はあの節が持っており、TASK-91 の機構も decision を持たない。**「録り直す」とは書いていない**
（この検査は何も記録しないので、fixture の手順を写すと嘘になる）。

## 検証

`pnpm test` 51 ファイル 1,318 件 passed、`pnpm run check` 0 errors 0 warnings、`pnpm run lint` clean。
**Rust は 1 行も変えていない**（変異はすべて `git checkout --` で戻した）ので `cargo` 系は流していない。
本番依存は増えていない（`package.json`・`pnpm-lock.yaml`・`Cargo.toml`・`Cargo.lock` に差分なし）。
対応表は `referent-table-task-93.md` 初版、本文より先に確定した。
<!-- SECTION:NOTES:END -->
