---
id: TASK-34
title: プロジェクト別スイムレーン画面を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-25 04:24'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-29
  - TASK-33
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-7 の設計に従い、project を行・status を列に複数プロジェクトのタスクを同時表示するスイムレーン画面を実装する。列は正準4列で固定し、プロジェクト横断の縦読みを成立させる。既定表示は active タスクに限定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 行=プロジェクト・列=正準4列固定・セル=タスクカードで構成し、既定は active タスクのみ表示する
- [x] #2 どの正準列にも対応づかない未対応 status を未対応区画へ集め、元の status 文字列を示す
- [x] #3 カードに横断タスクID・title・Type・通常ラベル・priority・assignee・health 印・保存区分印を載せる
- [x] #4 セル内は priority 降順→ordinal 昇順→updated_date 新しい順の安定並びにする
- [x] #5 Type/通常ラベル/priority/assignee/テキスト/縮退/保存区分でフィルタでき、ルート読取不能行と空セルを区別する
- [x] #6 プロジェクト行は台帳順を既定とし、行の並べ替えと一時的な表示・非表示ができる（doc-7 §5）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲

doc-7 の骨格（行=プロジェクト・列=正準4列・セル=タスクカード・未対応区画）を Svelte 5 で実装した。Rust 側は変更なし。TASK-33 のコマンド境界（`workspace_open` / `project_open` / `project_watch_start` / `project-reloaded` / `ledger_list` / `ledger_update`）だけを使う。

## 構成（純ロジックと表示の分離）

- `src/lib/wire.ts` … 境界の payload の TS 型。serde の出力をそのまま写す（後述の snake_case を含む）。
- `src/lib/commands.ts` … invoke ラッパ。失敗は `CommandError` 値のまま扱う。
- `src/lib/card.ts` … 横断タスクID（`<slug>:<TASK-ID>`）。id を持たない解析不能タスクはファイル名で名指す（doc-4 §5）。
- `src/lib/swimlane.ts` … 列振り分け・セル内並び・行状態（loaded / unreadable / pending）。冒頭に doc-7 語彙の対応表を置く。
- `src/lib/filter.ts` … フィルタ（Type・通常ラベル・priority・assignee・テキスト・縮退・保存区分）と facet 収集。
- `src/components/` … `Swimlane` / `LaneCell` / `TaskCard` / `FilterBar`。スタイルは scoped SCSS のみ（Tailwind 不使用）。
- `src/App.svelte` … 台帳読み込み・workspace_open・監視購読・行の並べ替え/表示切替・選択状態。

## AC ごとの実装

- #1 … 正準4列はグリッド全体で1回だけ定義し、行が変わっても列位置が動かない（縦読みの成立条件）。既定フィルタは `storage: ["active"]`。
- #2 … `interpretation.status.column` が `null`（未対応 status、または status を持たない解析不能）のタスクを行内の未対応区画へ集め、カードに元の status 文字列を出す。未対応区画は該当タスクがある間だけ列として現れる。
- #3 … カードに横断タスクID・title・Type（未設定/未知を明示）・通常ラベル・priority・assignee・縮退印・保存区分印。Type と通常ラベルはチップ形状を変えて混ぜない。
- #4 … priority 降順 → ordinal 昇順 → updated_date 新しい順。欠損キーはその段で末尾（未設定の ordinal を 0 扱いすると配置済みタスクを飛び越すため）。同値は入力順＝読み取り層のパス整列順（`read::scan` が sort 済み）を保つので、再読込でカード位置が飛ばない。
- #5 … 全 facet を AND、facet 内は OR。フィルタはカードの取捨だけで、行・列の骨格は保つ（フィルタ結果が空でも行と4列は残る）。ルート読取不能は行単位のメッセージ、該当なしはセルの空表示で区別する。
- #6 … 行順は台帳順が既定。並べ替えは `ledger_update` の `new_index` で台帳へ反映（doc-3 §4.3、doc-7 §5 が許す）。表示/非表示は doc-7 §5 が「一時的」と規定しているため画面内状態に留め、台帳へは書かない。台帳が read-only のときは並べ替えボタンを無効化する。

## 設計上の判断（doc から導いた点）

- **保存区分不明（`storageState: null`）の扱い**: doc-4 §3.4 は「既定のスイムレーンで active として扱ってはならない」、doc-4 §5 は「破棄せず保持する」と定める。保存区分フィルタの選択肢を doc-7 §5 の4区分だけにすると `null` はどの選択にも一致せず恒久的に不可視になり、後者に反する。よって「保存区分不明」を独立した選択肢として持ち、該当タスクが1件でもあるときだけ提示する。active へ畳み込むことはしない。
- **保存区分フィルタだけは「選択したものを出す」**: doc-7 §5 で唯一「既定は active のみ」と既定値が与えられている facet のため、空選択は無制限ではなく「何も出さない」とした。他の facet は空＝無制限。
- **想定外 status の強い縮退印**: 読み取り層が未宣言 status に `UnexpectedSchema` を立てる（`read.rs`）ため、カードの縮退印がそのまま decision-4 の強い印になる。宣言済みだが列に対応しない status には印を付けない（正当に独自 status を運用するプロジェクトを不良扱いしないため）。
- **カード選択**: doc-7 §3 の「カードを選ぶとタスク詳細画面を開く」の入口だけを配線し、選択中タスクをフッタに出す。詳細画面本体は TASK-35。
- **継続検出**: doc-7 §7 の「再読込でも並びを安定に保つ」を実際に確かめられるよう、開いたルートに `project_watch_start` を張り `project-reloaded` を購読して行を差し替える。監視の失敗は行の読取失敗ではないので通知に留める。

## 境界の型で気づいた点（Rust 側は未変更）

`CommandError` の variant フィールドと台帳関連型（`Ledger` / `ProjectEntry` / `UpdateRequest`）は snake_case で載る。前者は serde のコンテナ `rename_all` が variant 名しか改名しないため、後者は `projects.toml` と同じ Deserialize 定義を共有するため。`Ledger.projects` は TOML の `[[project]]` に合わせて `project` というキーになる。いずれも実際の serde 出力を確認したうえで `wire.ts` にそのまま写した（camelCase に「直す」と実行時に静かに壊れる）。

## 検証

- `npm run test`（vitest、新規 dev 依存）: 34 passed。列振り分け・未対応区画・並び順の安定性・フィルタ・行の順序と非表示を対象にした純ロジックのテスト。
- `npm run check`（svelte-check）: 0 errors / 0 warnings。`npm run build`: ok。
- `cargo fmt --check` / `cargo clippy --all-targets -D warnings` / `cargo test`（206 passed, 1 ignored）: いずれも変更前と同じく clean。
- 画面の目視確認: fixture データを使った一時ページを vite dev 上で描画し、(a) 4列固定と縦読み、(b) 未対応区画（`Blocked` と status 不明）と縮退印、(c) 空セルの `—` とルート読取不能行の区別、(d) 縮退のみ／Type フィルタで行・列が保たれること、(e) 未対応区画に該当が無くなると列が消えることを確認した。一時ページは確認後に削除済み。
- IME: テキストフィルタは `bind:value` + `isComposing` ガードで、変換中に値を書き戻さない。
<!-- SECTION:NOTES:END -->
