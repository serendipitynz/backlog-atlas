---
id: TASK-166
title: 決定事項の status の見せ方を決める
status: In Review
assignee: []
created_date: '2026-08-13 08:34'
updated_date: '2026-08-18 11:59'
labels:
  - ui
  - project-detail
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 159700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-118 の実機目視 (2026-08-13) 由来。ユーザーが backlog browser と比較して **「強いて言えば `accepted` が backlog browser の方が目立っている」** と述べた。あちらは緑のチップとして描き、Atlas は閲覧ヘッダの meta 行とカードに素のテキストで出している。

**これは doc-11 §3 の チップの 4 系統 に触れる判断である。** 現在チップを持つのは印の族(decision-6・decision-22) と priority (decision-23) で、**status に色や形を与えるなら 5 系統目を足すか、既存のどれかに帰属させるかを決めることになる。** 加えて決定事項の status は frontmatter の任意項目で、`accepted`/`proposed` 以外の値も来うる (タスクの status とは無関係。`domain.rs` の`Decision::status` の註)。**未知の値をどう描くかが、色を与える場合の争点になる** — decision-5 のType が未知・不在を分けて描いているのと同じ形の判断が要る。

**TASK-118 では素のテキストのままにした** (契約の変更になるため)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 決定事項の status を色・形で述べるかどうかが決まり、その根拠が doc-11 か decision に書かれている
- [x] #2 色を与える場合、未知の値と status 未設定の描き方が決まっている
- [x] #3 表示テーマ 10 組すべてで収録条件を満たすことを実測で確かめた (色を与える場合のみ)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 2026-08-18 — 争点の提示（回答待ち）

**争点は 1 点に絞れた** — 決定事項の status を素のテキスト・中立チップ・色付きチップのどれで描くか。
「5 系統目を足すか既存へ帰属させるか」は独立した争点ではなく、色を与えるかの答えから落ちる。

### 実測した値

- **上流 v1.49.3 の browser が持つ status → 色の対応**（配布バイナリに埋まった JS から読んだ）:
  `proposed` 黄・`accepted` 緑・`rejected` 赤・`superseded` 灰で、**一致しない値はすべて灰**。
  鍵は小文字化して引く。
- **`backlog decision create` は `-s` に渡された文字列を検証せずそのまま書き、`-s` が無いときは
  `proposed` を書く**（同じ読み）。上流の読み取りも `status` 欠落を `proposed` として扱う。
  **したがって 4 語は上流 UI の申し合わせであって、台帳が宣言する集合ではない** — タスクの status が
  `config.yml` に、priority が CLI の 3 段に持つような裏付けが無い。
- **本リポジトリの決定事項 38 件は全部 `accepted`**。色は見分けではなく強調としてしか働かない。
- **status を持つ非タスク管理ファイルは決定事項だけ**（文書は `type`、マイルストーンは件数を
  同じ `.meta` の体裁で出す）。札にすると 3 つの一覧列で card-head の体裁が揃わなくなる。
- **画面文は 3 案とも増えない**（`status 未設定` の文が既にある）ので、二言語で書くものは無い。

### 実エンジンでの描画

本物の `ProjectDetail.svelte` を WebKit（借り物 playwright）に載せ、3 案 × 2 テーマの 6 枚を撮った。
`pageerror` は 6 枚とも 0 件。**案 B・C は `src/` を 1 行も変えず、ハーネス側の注入 CSS で描いた**ので、
この時点で製品側の変更は無い。`_sandbox/project-detail-check/` に `?decisions=<n>` のつまみを足し、
status を 6 通り（上流が色を与える 4 語・与えない値・未設定）で回すようにした。同ハーネスは
TASK-176 以降 `menu` snippet を渡さないと立たなくなっていたので、そのぶんも足した。

案 C の画像は収録済みの優先度色を借りて描いてある（色相の役割が上流と同じで、10 テーマ × 3 面の
収録条件を decision-23 が既に測っているため）。**新しい 3 値を起こす場合は、AC #3 の実測はその時点で要る。**

## 2026-08-18 — B 案（中立チップ）の実装

**ユーザーは B 案を選んだ** — 色を与えず、輪郭のみ・`--muted`・角丸 3px の札にする。**正本は doc-11 §3** で、
**decision は起こしていない**（既存の decision を 1 つも覆さず、doc-11 §3 が既に持っている 中立の情報 の
括りへ 3 つ目として入るだけであるため）。対応表は本文より先に確定した（TASK-166 の対応表 初版。新語は 0 件）。

**姿は `ProjectDetail.svelte` の `.status` 1 か所が持つ。** 一覧のカードと閲覧ヘッダの両方がその class を
取るので、同じ値が同じ画面で 2 通りに描かれることはない。**`.card-head .meta` そのものには付けない** —
同じ体裁を共有する 文書の `type` とマイルストーンの件数は素のテキストのまま残す判断であり、
その線（管理ファイル自身の frontmatter が持つ状態の語か）は doc-11 §3 が持つ。

### 実測（借り物 playwright / WebKit、本物の `ProjectDetail.svelte`）

- **status 6 通り（`accepted`・`proposed`・`rejected`・`superseded`・上流が色を与えない値・未設定）で
  card-head は折り返さない。** 12 枚とも card-head の高さ 19px ＝ `.id` の行箱の高さで、札の高さも 19px。
  **札の幅は 39.73〜83.81px** で、card-head の幅 256.77px に対して余裕がある。閲覧ヘッダの meta-line も 19px の 1 行。
- **英語表示でも折り返さない。** 最も広い値は 日本語 `status 未設定` 83.81px に対し 英語 `status unset` 82.08px。
- **表示テーマ 10 組すべてで枠と字が解決する。** 枠は `--line-strong`（alpha 0.30〜0.32）、字は `--muted`
  （0.62〜0.68）、角丸は 10 組とも 3px。**色値を 1 つも足していないので収録条件は無い**（AC #3 の条件節が
  成立しない。measured のはこの「解決すること」までである）。
- **上限に当たる側**: frontmatter の status は任意の文字列で `decision create -s` は長さを見ないので、
  42 字の 1 語を差し替えて測った。**素のテキストのときは一覧列の右端の 10.28px 内側に収まっていたが、
  札にすると 2.25px 越えて枠が切れた**（差は札の左右余白と枠の 12.53px）。**`overflow-wrap: anywhere` を
  与えて解いた** — `.card-title` が同じ列で同じ理由から取っている手当てと同じもので、解いた後は 20.45px
  内側に収まり、横スクロールは 0 のままである（札は 2 行に割れ、両行とも枠が閉じる）。
- `pageerror` は撮った全てのケースで 0 件。

### 検査について

**この形を保つ自動検査は足していない。** 姿はコンポーネント 1 つのスコープド CSS で、`jsdom` は
レイアウトを持たないので寸法も溢れも判定できず、**色値を足していないので `theme.test.ts` が検算する対象も
増えない。** 契約は doc-11 §3 が持ち、確認は上の実測と目視である。**「検査が保っている」とは書かない。**

### ハーネス

`_sandbox/project-detail-check/` に `?decisions=<n>`（status を 6 通りで回す）と `?lang=ja|en` を足した。
**このハーネスは TASK-176 以降 `menu` snippet を渡さないと `invalid_snippet` で画面が丸ごと立たなくなって
いた**ので、そのぶんも足してある。`?lang` は `setLanguage` ではなく `provideMessages` で入れる。
<!-- SECTION:NOTES:END -->
