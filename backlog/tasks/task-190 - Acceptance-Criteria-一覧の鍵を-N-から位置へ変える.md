---
id: TASK-190
title: 'Acceptance Criteria 一覧の鍵を #N から位置へ変える'
status: Done
assignee: []
created_date: '2026-08-16 21:41'
updated_date: '2026-09-17 03:51'
labels:
  - robustness
milestone: m-4
dependencies: []
ordinal: 181700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の Acceptance Criteria 一覧は `{#each task.acceptanceCriteria as item (item.number)}` と書かれており、**`#N` の一意性を読み取り層が保証していない。**

`parse_ac_item` は行に書かれた番号をそのまま持つので、**手で書いた `- [ ] #1` が 2 行あるとタスク詳細パネルごと落ちる。** Svelte の `each_key_duplicate` は本番ビルドでも throw する。

**2026-08-17 に実測した**（TASK-185 の回。同型だった Definition of Done 側を `?dod=dup` のつまみで測ったもの）。WebKit・全面配置で `pageerror` が 1 件 (`Svelte error: each_key_duplicate`) 立ち、`.detail` そのものが DOM から消えた。位置を鍵にすると 0 件になり、2 行とも描かれる。

**CLI はこの状態を作らない**（`--ac` は max+1 を振る）ので、入口は手編集と外部エディタ経路（doc-8 §7）である。**TASK-185 は自分が足した Definition of Done 側だけを位置鍵にし、こちらは AGENTS の「触っていないコードを直さず起票する」に従って残した。**

**同じ形が他にもあるかを着手時に数え直す** — 一覧を `(item.number)` や `(item.id)` のように内容由来の鍵で回している `{#each}` は、その値の一意性を読み取り層が保証しているかを見る。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Acceptance Criteria 一覧が同じ #N を 2 行持っても、タスク詳細パネルが落ちずに両方描かれる
- [x] #2 内容由来の鍵で回している {#each} を数え直し、一意性を読み取り層が保証していないものが他に無いことを確かめてある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-17。TASK-174 と合併して 1 セッションで実施した（m-4 対応順 #2）。

## 数え直した結果

`src/` の `{#each}` は 84 件。うち鍵を持つのが 81 件で、**一意性を読み取り層が保証していない鍵は
12 か所**あった。2 タスクが名指ししていたのは 4 か所（AC 一覧・文書/マイルストーン/決定事項の 3 区画）で、
**残る 8 か所は同型として本セッションで見つけたものである。**

入口は 4 つで、区画の数ではなくこの数で構成されている。

1. **同じ id の管理ファイル 2 件** — 3 区画の一覧列、マイルストーンの付け替え先の選択、新規タスク区画の
   マイルストーン選択、タスク詳細のマイルストーン選択の 6 か所。
2. **同じ `#N` の受入条件 2 行** — 受入条件の閲覧と、編集セッションの 項目単位操作 の 2 か所。
   **TASK-185 が直した Definition of Done 側と違い、編集側にも同じ鍵があった。**
3. **`config.yml` の `statuses` の重複** — タスク詳細の status 選択、新規タスク区画の status 選択、
   概要区画の別名キーの候補一覧の 3 か所。`string_list_field` は並びをそのまま返し重複を落とさない。
4. **画面が組み立てた問題文の重複** — 概要区画の別名表の問題文 1 か所。**ここだけ手編集を要さない** —
   `addAliasRow` が `{ key: "", value: 正準列の先頭 }` を積むので、別名を追加 を 2 度押すと
   `aliasProblems` が同じ 1 文を 2 度返し、その 2 度目で 概要区画 が消えていた。

**一意性が保証されていると確かめたもの**（直していない）: `filterTokens` は鍵で畳んでから返し、
`header.ts` は鍵をデータ側で持って一意性を自分のテストで押さえ、`resolve_relations` は照会前に
`relation_key` で畳み、ledger は slug の重複を読み込み時の硬いエラーにし、facet は `Map` から出る。
定数配列の要素をそのまま鍵にしているもの（`DOC_TYPES`・`PRIORITIES`・`CANONICAL_COLUMNS`・
`PLACEMENTS` など）と、位置を鍵にしているものも同じ理由で対象外。

## 直した形

**鍵に据える一意な値は 2 種類あり、列が並べ替わるかで決まる。**
列の要素が入れ替わりうるなら**所在パス**（1 ファイルを一意に指し、読み取り層が同じパスを 2 回返さない。
`LaneCell` のカードと 写せなかったファイル が既に採っている形）、列の並びが入力の並びそのもので
要素の出入りが末尾か全取替えしか起きないなら**位置**（`DodSection` が TASK-185 で採った形）。

12 か所に加えて、**同じ族の 6 か所も位置鍵へ揃えた** — `problemsFor` の残り 5 か所（概要区画の
2 つ、登録フォームの 3 つ）と、`optionsFor(task.priority, PRIORITIES)` である。前者は今日の分岐構造では
1 文しか積まないが、それは `editProblems` の枝の形が与えているだけで、重複を拒む層は無い（現に別名の
1 つが重複した）。後者は同じ `optionsFor` の結果を 2 通りの鍵で回すのを避けるため。
**この 6 か所は今日は重複しないので、赤くなる検査を持たない。**

## 検査

`src/duplicate-key.component.test.ts`（画面横断契約、12 case）。**規則の正本は decision-47 で、検査の頭註はそれを引く** — PR #160 の 2 巡目までレビューが規則の再記述を指摘し続けたのは、正本がどこにも無かったからである。入口 4 つで `describe` を分けてある。
**12 か所を 1 か所ずつ壊して、どれも対応する case が赤くなることを確かめた**（修正前は 12 case 全部が
`each_key_duplicate` で赤）。`src/lib/fixtures.ts` に `decisionView` を足した — 決定事項の払い出しが
無く、`snapshot()` が `decisions: []` を直書きしていたため。

検査は `pnpm test`・`pnpm run check`・`pnpm run lint` の 3 本とも緑。Rust は触っていない。
**画面目視は要らない** — 重複していない入力に対する DOM 出力は前と同一で、対象の `{#each}` は
transition も animate も持たないので、鍵が変わったことの見え方が無い。

## 残したもの

**鍵を直して 2 件が描けるようになって初めて見える不具合**を TASK-205 として起票した（先頭一致）。
選択も受入条件の項目単位操作も対象を識別子で解決しており、同じ識別子の 2 件では先に読まれたほうに
当たる。所在パス鍵へ寄せるだけでは済まない（`milestone rename` がファイル名も書き換えるので選択が
改称のたびに落ちる）ので、形を決める回が要る。
<!-- SECTION:NOTES:END -->
