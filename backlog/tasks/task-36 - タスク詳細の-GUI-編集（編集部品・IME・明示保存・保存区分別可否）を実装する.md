---
id: TASK-36
title: タスク詳細の GUI 編集（編集部品・IME・明示保存・保存区分別可否）を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-26 06:08'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-31
  - TASK-32
  - TASK-35
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §6 の設計に従い、タスク詳細からの編集操作を実装する。すべて Backlog 更新アダプター（doc-5）経由で発行し、管理ファイルを直接書き換えない。元要望中核である GUI 編集操作（複数行・選択・置換・全選択・IME 安全性・明示保存）を満たす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 編集部品は textarea を基本形とし Ace へ昇格する（Ace 読込失敗時も textarea で編集継続でき、操作は変わらない）
- [x] #2 IME の composition 中の Enter を確定に消費し、Enter を保存に割り当てない（改行と保存を分ける）
- [x] #3 保存は doc-5 の操作写像へ発行し、CLI 失敗時は表示を変えず理由を示し未保存入力を保持して再試行できる
- [x] #4 保存時に更新前競合検出を通し、保存区分別（active/draft/completed・archive）に提供操作を能動化・無効化する
- [x] #5 明示保存（ボタン/Cmd/Ctrl+Enter）とキャンセル（破棄前確認）で編集セッションの未保存入力を扱う
- [x] #6 GUI は doc-5 の制約を先取りする: References は既存を含む非空全集合で置換し最後の1件削除を無効化、AC 全体差し替え（複合）と項目単位操作を区別、マイルストーン説明更新など非対応操作は最初から提示しない（アダプタで後追い拒否にしない）
- [x] #7 競合時は未保存入力を保持し、(i)最新を再読込してやり直す (ii)入力を保持して最新版へ再適用する の2経路を提示し、防げる競合と照合後競合窓の事後通知を区別する（doc-9 §5・doc-8 §6.4）
- [x] #8 active には状態遷移の入口 task demote/task archive/task complete を提供し（task complete は status が Done のときのみ能動化、非 Done は理由付き無効化）、draft には draft promote/draft archive を提供、completed・archive は内容編集を出さず読み取り専用にする（doc-8 §6.5・doc-5 §3.2/§3.3）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. doc-8 §6・doc-5 §3/§3.1/§3.2/§3.3・doc-9 §4/§5 を読み、対応表を先に確定する。
2. 編集規則を純粋関数（`src/lib/edit.ts`）へ置き、テストで固定する。
3. 編集部品（textarea 基本形 + Ace 昇格）を作る。Ace は vendored。
4. タスク詳細を編集の入口にし、シェル（App）へ更新操作の発行と再読込を持たせる。
5. フロントの手書き wire 型を Rust 側の serde 実形と突き合わせ、実 CLI で端から端まで通す。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 構成

- `src/lib/edit.ts`（新規・純粋関数）: 編集セッション（未保存入力・触れた項目・baseline）、保存操作の組み立て、保存区分別の可否、状態遷移の提示、競合後の 2 経路、事後通知の検出。冒頭に対応表を置く（`detail.ts` と同じ規約）。
- `src/lib/edit.test.ts`（新規）: 上記の規則を 39 件で固定。
- `src/components/Editor.svelte`（新規）: 編集部品。textarea を基本形とし、`src/lib/ace.ts` 経由で Ace へ昇格。読込失敗時は textarea のまま継続し、理由を表示。
- `src/lib/ace.ts`（新規）: vendored Ace の遅延読込。失敗は「昇格しない」であって異常ではない。
- `public/vendor/ace/`（新規）: Ace 1.32.9（`ace.js` + BSD 3-Clause `LICENSE`）を serenebach の実績あるコピーから vendored。decision-8・TASK-25 の「npm 依存にしない」に従う。`ace/mode/text` と `ace/theme/textmate` を内包するため追加ファイルは不要。バンドルには入らず `public/` から素で配信する。
- `src/lib/wire.ts` / `src/lib/commands.ts`: 更新操作（`UpdateOperation` 一式）・`UpdateResult`・`UpdateOutcome` の型と、`update_apply` / `cli_probe` の呼び出しを追加。
- `src/components/TaskDetail.svelte`: 表示専用から編集の入口へ。参照系（Type・PR・References・Git 履歴）はどの保存区分でも表示のまま。
- `src/App.svelte`: `cli_probe` を起動時 1 回、`update_apply` の発行と再読込の反映、未保存入力があるときの選択変更確認、状態遷移成功時の選択解除。

## 設計上の判断

- **触れた項目だけを送る**: 値の差分ではなく「利用者が触れた項目」を保持する。これがないと doc-9 §5 (ii) の再適用で、触っていない項目の外部変更を自分の古い値で巻き戻してしまう。
- **1 操作 = 1 呼び出し**: 全項目を 1 回の `task edit` にまとめる（doc-5 §3）。結果として部分適用が構造的に起こらず、失敗時は「表示を変えず再試行」が成立する（AC #3）。
- **Type は編集対象にしない**: Type の増減は `kind:` ラベルの増減だが、読み取り層が保持するのは接頭辞を外した値であり、元のラベル文字列（`kind: feature` のような空白差）と一致する保証がない。`--remove-label` が黙って空振りしうるため提供せず、理由を画面に出す。通常ラベルは verbatim なので編集できる。
- **title を空にする保存は拒む**: doc-4 §3.1 の必須項目で、空にすると解析不能として縮退表示になるため。
- **事後通知の検出範囲**: 保存成功後、送信値と再読込結果を比較する。検出できるのは「CLI の書き込み後に入った外部更新」だけで、CLI の read-modify-write が上書きした側は既にファイルから消えており検出も復元もできない。文字列は trim 比較、配列は集合比較にして、CLI 自身の整形を競合と誤報しないようにした。
- **状態遷移は 2 度押し確認**: v1.47.1 に戻す操作が無い（doc-5 §3.1）ため、取り消せない操作として確認を挟む。成功時は id と保存先が変わるので詳細を閉じる。

## 検証

- `npm run test`: 92 件 pass（うち TASK-36 分 39 件）。
- `npm run check`（svelte-check）: 0 errors / 0 warnings。`npm run build`: 成功。Ace はバンドルされず `dist/vendor/ace/` へ素通し。
- `cargo test`: 210 件 pass。フロントの手書き wire 型と serde の実形を突き合わせる検査を 2 件追加（AC 全体差し替え・References・dependencies・notes の各形と、5 つの状態遷移の id 名）。
- 実 CLI との突き合わせ: `the_frontend_edit_reaches_the_real_cli`（`#[ignore]`、`cargo test --lib -- --ignored` で実行）を追加し、backlog v1.47.1 に対して実行して pass。複数行 description・References 非空全置換・AC 全体差し替え（複合）が設計どおり効き、再読込結果が送信値と一致することを確認した。
- 編集部品はブラウザで実機確認した。Ace 昇格（行番号つきで表示・textarea は hidden）、`ace.js` を退避した状態でのフォールバック（textarea が編集可能・理由表示）、および keydown の振り分け（Enter 単体・Shift+Enter・composition 中の Cmd+Enter・keyCode 229 の Cmd+Enter はいずれも保存しない／Cmd+Enter・Ctrl+Enter は保存する）。
- 未検証: Ace 側の Cmd/Ctrl+Enter は、キーバインドが `cmd-return` として登録されていることまで確認したが、実キー入力での発火は未確認（自動操作が modifier と keyCode を載せた KeyboardEvent を作れないため）。実 IME での変換確定操作も同じ理由で未確認。`tauri dev` の実機で 1 度触って確かめてほしい。
<!-- SECTION:NOTES:END -->
