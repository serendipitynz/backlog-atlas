---
id: TASK-71
title: タスク詳細の 3 配置切替をアイコンにする
status: In Review
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-03 22:48'
labels:
  - ui
  - task-detail
  - 'kind:bug'
milestone: m-2
dependencies:
  - TASK-67
documentation:
  - backlog/docs/doc-8 - タスク詳細画面-設計（References・PR・Type・Git-履歴）.md
priority: high
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の表示形式をその場で切り替えられる現在の仕組みは保ち、切替ボタンをアイコン表示にする。画面設計案 02 は 3 配置を ◧（併置サイドバー）・▣（中央モーダル）・⛶（全面シングル）の記号で示しており、lucide を参照していない（設計案全体で lucide の語は 0 件）。lucide の採用は TASK-67 の方針であり、記号から lucide 名への対応はこのタスクで確定する。

アイコンの割当はユーザー指示で確定: サイドバー = panel-right / モーダル = panel-top-dashed / シングル = maximize。panel-top-dashed は「上端に破線の仕切りを持つ矩形」で、中央に浮くモーダルを表す ▣ とは意図が合わないという指摘（square-square・app-window が近い）があったが、ユーザーは 2026-08-01 にそれを認識したうえで指示を優先すると確定した。代替案の再提示はしない。

既定の配置を示す下線印と、閉じる操作と同じ操作群に置く配置は維持する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 3 つの切替ボタンが panel-right / panel-top-dashed / maximize のアイコンのみになっている
- [x] #2 各ボタンの aria-label と title で配置名が読める
- [x] #3 既定の配置を示す印が残り、選択がアプリ設定に永続する挙動が変わっていない
- [x] #4 アイコンは src/lib/icons/ のインライン SVG で、production dependency が増えていない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
3 配置切替をアイコンのみのボタンにし、既定印を可視の文言から下線へ替えた。

## 決定先行判定

決 印は無かったが着手時に判定し、**契約の変更が要ると分かった**（決 印の後付けは 9 例目、doc 改訂だけで足りるのは 6 例目）。争点は AC #1「アイコンのみ」と AC #3「既定を示す印が残る」が、doc-11 §2.4 の「アイコンのみのボタン＝可視の文言を持たない」の下で同時に成り立たないこと。既定印は `<span class="default-mark">既定</span>` という**可視の文言**だった。

解消の形はユーザーが既に決めていた — doc-12 §3 が画面設計案 02 を「既定の配置ボタンに下線印を付け」と転記しており、本タスクの Description も「下線印…は維持する」と書いている。実装だけが文言札で外れていた。よって下線化そのものはユーザーへ確認せず、**下線が読み上げへ何も残さない 1 点だけ**を提示し、`aria-label` への「（既定）」併記をユーザーが選択した（2026-08-04、3 択）。decision は書いていない — decision-13 の永続も decision-12 の色値一式も変わらないため。

対応表は `_sandbox/handoff/referent-table-task-71.md` 初版に先行確定した。

## doc 改訂

- **doc-11 §2.4**: 「アイコンのみのボタンが状態の印を持つとき」の規則を新設。印を可視の文言にせず、線・塗りで示し、同じことを `aria-label` にも語で足す。`aria-pressed` が担う「押されているか」はここで言う状態に含めない。TASK-72・77 が同型に当たる。
- **doc-11 §8**: 要素種別の列挙が初めて増えたのが本タスクであることを記録。TASK-69 の「図形が 1 種類のままなので列挙は変わっていない」が現行の姿と読めなくなるため書き換えた。
- **doc-8 §2.2**: 切替がアイコンのみのボタンであること、3 配置への図形の割当、**既定印**の定義（本書で導入）、下線であること、`aria-label`・`title` への併記、既定と現在が一致するとき補助文が沈黙するので併記だけが既定を述べる唯一の場所になること。

## 実装

- `src/lib/icons/lucide.ts`: `IconShape` に `rect` を足した（**要素種別の列挙が増えた初めての例**。`panel-right`・`panel-top-dashed` が rect で始まる）。doc-11 §2.4 が定めた仕掛けどおり、`drawnShape` の網羅 `switch` がビルドを止めることを**実際に壊して確かめた** — rect の腕を落とすと `pnpm run check` が `src/lib/icons/lucide.ts 104:47 "Function lacks ending return statement"` を出した。3 図形は lucide-react v1.17.0 の `__iconNode` から写し、属性値の綴りも lucide の文字列のまま置いた。
- `src/lib/placement.ts`: `PLACEMENT_ICON`（配置 → 図形。割当は doc-8 のものなので図形側ではなくここ）と `placementSwitchName`（`aria-label` と `title` が同じ 1 か所から出る）。`DEFAULT_PLACEMENT_MARK` は残したが、**画面に刷る文言ではなくアクセシブル名が運ぶ語**になった。
- `src/components/TaskDetail.svelte`: ボタンの中身は `<Icon>` だけ。既定印は `::after` の絶対配置の線 — `border-bottom` と `inset` の影はどちらも角丸に沿って**枠そのものに見える**ことを実測で確認したので、要素にした。色は `--fg`（枠の `--line-strong` と同色の印は太い枠にしかならない）。中立（decision-6）は保っている。操作群は高さと文字寸法を `--frame-control`・`--frame-text` の 2 値で持ち、3 つの切替と「閉じる」がそれを取る（図形を持つ控えと文字の控えが混じるので、自動では揃わない）。

## 実測（WebKit・Chromium、1280×800、`_sandbox/detail-check/`）

ハーネスは**本物の `TaskDetail.svelte`** を記録済み wire fixture (`project_load_loaded.json`) の実データで立てる。つまみは `?placement=` と `?default=`。

- 切替ボタン **22.39 × 22.39px**、図形 **11.19px**（= 1em × font-size 11.2px。TASK-69・112 が目視で確定した 11〜12px の帯に入る）、「閉じる」も **22.39px** 高で、**4 つの控えの上端が一致**。両テーマ・両エンジン・4 条件すべてで同値。
- ボタンの `textContent` は 3 つとも**空**（AC #1）。`aria-label`・`title` は「併置サイドバー（既定）」「中央モーダル」「全面シングルビュー」。
- `<svg rect>` が **2 個**描かれている（`rect` が要素まで届いている）。
- 見出し 1 行目は **22.39px（Chromium 22.63px）で 1 行**、操作群は識別子と同じ視覚行に留まる（折返し無し）。
- **4 倍解像度の画像**で `atlas-light`・`atlas-dark` の両方を確認。3 図形とも潰れず、下線は枠と見分けられる。既定と現在が違うとき、下線（既定）と `--info` の枠（現在）が別のボタンに同時に立つのが読める。

**測っていないもの**（目視依頼の範囲）— (1) 実機 Tauri の WKWebView での実描画。(2) 中央モーダル・全面シングルビューを**その配置の実幅で**開いたときの見出し行（ハーネスは 3 配置とも併置サイドバー幅 30rem の箱で測った。最狭で折り返さないので広い方も折り返さない、は推論であって実測ではない）。(3) 破棄前確認を通る配置切替の実挙動（ハーネスは確認をその場で通している）。

## 検証

`pnpm test` 538 件、`pnpm run check` 287 ファイル 0 エラー、`pnpm run build` 成功、`cargo test` 345 passed / 4 ignored（Rust には触っていない）。フロントエンドに設定されたフォーマッタは無い（prettier は依存にも設定にも無い）。
<!-- SECTION:NOTES:END -->
