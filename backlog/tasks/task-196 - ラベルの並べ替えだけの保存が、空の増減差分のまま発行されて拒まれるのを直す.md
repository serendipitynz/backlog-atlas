---
id: TASK-196
title: ラベルの並べ替えだけの保存が、空の増減差分のまま発行されて拒まれるのを直す
status: Done
assignee: []
created_date: '2026-08-20 00:07'
updated_date: '2026-09-17 08:20'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
ordinal: 187700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の編集セッションでラベルを並べ替えただけの保存が、addLabels・removeLabels のどちらも空の task edit として発行され、アダプターに NothingToEdit で拒まれる。実測 2026-08-20（buildSave の返り値で確認。labels が ['a','b'] のタスクで a を消して打ち直すと、集合は元へ戻るが並びが変わるため触れた項目のままになり、plan は state: ready・edit: { addLabels: [], removeLabels: [] } を返す）。拒むのは src-tauri/src/update.rs の plan_task_edit で、空の増減にはオプションを出さないため !inv.has_options() に落ちる（an_empty_task_edit_is_refused が同じ経路を押さえている）。CLI を起動しないのでデータは失われず、誤った書き込みも起きないが、利用者から見ると保存が失敗として提示される。原因は 2 つのどちらかで、どちらを採るかがこのタスクの判断である: (i) 発行する facet が 1 つも無い保存を nothingToSave として扱う、(ii) ラベルの並びは CLI が表せない値なので、並べ替えだけの変更を触れた項目に数えない。CLI にラベルの全置換は無く、増減しか無いので、並びそのものを Atlas から変える手段は無い（doc-5 §3）。TASK-155 のセッションで、カンマを含むラベルの保存を拒む関門を入れているときに見つけた。そのタスクの拒否から戻る道がここを通る — カンマを含むラベルを消した後に同じ値を打ち直すと、この状態になる。次リリース基準では m-4 と判定した（v0.2.0 に載っても、失われるものは無く、誤った書き込みも起きない）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 並べ替えだけの保存で、利用者に失敗が提示されない
- [x] #2 CLI がラベルの並びを表せないことが、画面と doc のどちらで述べられるかが決まっている
- [x] #3 空の増減差分が発行されないことが試験で固定されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
案 (ii) を採った。ラベルについてだけ、`changed()` が列の同一性ではなく「その保存が送る増減」で判定する。
`labelDelta()` を置き、`changed()` と `buildSave()` の両方がそれを読む — 「送るものがあるか」と
「送るもの」が別々の式だと、片方を直したときにもう片方が黙って残るためである。

**案 (i)（発行する facet が無い保存を nothingToSave にする）を採らなかった理由**: 触れた項目 を読むのは
保存だけではない。保存が「変更はまだありません」と述べる一方で `isDirty` を真のまま残すと、破棄前確認
（doc-8 §6.3）と状態遷移の無効化（`transitionOffers` の `hasUnsavedInput`。画面には
「未保存の入力があります。保存またはキャンセルしてから実行します」と出る）が未保存入力を主張し続け、
利用者には保存も遷移もできず破棄だけが残る。案 (ii) は 3 か所を 1 つの答えに揃える。

**Description の前提 1 件が実測で偽だった。** 「CLI にラベルの全置換は無く、増減しか無いので、並びそのものを
Atlas から変える手段は無い」と書かれていたが、v1.50.1 を使い捨てのルートで測ると次の 3 つに分かれる
（2026-09-17 実測）:

1. `--add-label` は渡された順に末尾へ継ぐ。`--add-label "c,b,a"` は `c`・`b`・`a` の順で書く。
   **全消し → 望む順で追加 の 2 呼び出しなら、CLI で任意の並びが書ける。**
2. **1 回の `task edit` が同じ名前を `--add-label` と `--remove-label` の両方に持つと、削除が後に
   解決されて結末は削除である。** `labels: [x]` へ `--remove-label x --add-label "x,y"` を 1 回で渡すと
   `[y]` が残る。したがって `--remove-label "c,b,a" --add-label "a,b,c"` は終了コード 0 と `Updated` を
   出しながら `labels: []` を残す — doc-5 §3.1 の 沈黙無変更 とは別物で、あちらは何も変わらず
   こちらは消える。
3. Atlas の明示保存が 1 タスクにつき `task edit` を 1 回であること（doc-5 §3、同 §5 の部分適用）は
   Atlas 側の設計であって CLI の制約ではない。**並びを発行できない真の根拠はこれである。**

**受入条件 #2 の判断は doc 側である。** doc-5 §3.1 へ「1 回の `task edit` でラベルを並べ替える操作」を
足し（上の 3 点）、doc-8 §6 へ帰結（並べ替えだけの未保存入力は触れた項目に数えない）を足した。
どちらも `backlog doc update --content` 経由。**画面には書かない** — この画面に並べ替えの控えが無いので
理由を掛ける先が無く、doc-11 §5 の理由提示は控えを持つ操作に掛かる規則である。案 (ii) の下で画面が
述べるのは「変更はまだありません」で、それは真である。

**同型の数え上げ。** `buildSave` が置く facet は 14 か所 12 欄で、うち下書きの値をそのまま置かないのは
ラベルの増減（集合差）と AC の delta（`acDeltaForCli` の振り直し）の 2 つだけである。残りは
「変わった ⇒ 送るものがある」が構成上成り立つ。AC の delta はこの形にならない — `acChanged` が
4 つの合計 0 を退け、`acDeltaForCli` が落とすのは削除される項目への check/uncheck だけなので、
落ちるときは必ず `remove` が空でなく `--remove-ac` が出る。**ラベルが唯一だった。**

**Rust 側は変えていない。** `plan_task_edit` の `!inv.has_options()`（`RejectReason::NothingToEdit`）は
最後の関門として残す。空リストは `--add-label`/`--remove-label` を出さない形が既にある。

**検証**: `pnpm test` 1360 passed / `pnpm run check` 0 errors / `pnpm run lint` clean。新しい 3 件は
`changed()` のラベル枝を旧実装へ戻すと 3 件とも落ちることを先に確かめた。Rust を触っていないので
cargo は流していない。
<!-- SECTION:NOTES:END -->
