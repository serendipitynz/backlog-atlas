---
id: TASK-151
title: assignee 欄のカンマ入力で、保存前に述べた「1 件になる」が成り立たないのを直す
status: In Review
assignee: []
created_date: '2026-08-12 02:45'
updated_date: '2026-08-12 04:47'
labels:
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 145700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
タスク詳細の編集セッションが assignee を保存する前に出す控え（src/lib/edit.ts の assigneeCollapseWarning）は「assignee は 1 件しか保てないため、保存すると入力した 1 件だけになります」と述べるが、入力にカンマが含まれると成り立たない。Backlog CLI の task edit は -a の値を parseDelimitedStringList でカンマ分割するため（cli.ts:2959）、-a "dave,erin" は assignee を 2 件書く。v1.48.0 と v1.49.3 の実バイナリで測って同じ結果で、版差ではない。task create 側は分割しない（cli.ts:1803）ので create と edit が非対称であり、doc-5 §3 の assignee 写像が「カンマ区切りの値は分割されず 1 件の文字列として保存され（実測）」と書いているのは create 側の挙動で、Atlas が assignee に使う edit 側（TASK-57 の決定。doc-5 §3・doc-8 §6）には当たらない。したがって直す対象は 2 つある。①doc-5 §3 と doc-8 §6 の実測記述（1 件化がカンマ入力では起きないこと）②画面が保存前に述べる保証。保存後は divergence（edit.ts:878）が集合比較で食い違いを拾い事後通知に載せるので、黙って食い違うわけではなく、偽なのは保存前の断言だけである。TASK-99 のセッションで最低バージョン要件の引き上げ可否を実測している最中に見つけた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-5 §3 の assignee 写像が、create と edit でカンマの扱いが違う事実を実測として持っている
- [x] #2 doc-8 §6 の 1 件化の記述が、カンマ入力では 1 件化しないことを含んでいる
- [x] #3 画面が保存前に述べる内容が、カンマを含む入力でも成り立つ
- [x] #4 カンマを含む assignee 入力に対する挙動が試験で固定されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測 (v1.48.0、一時プロジェクトで実行。2026-08-12)

| 呼び出し | frontmatter の assignee |
|---|---|
| `task create -a "dave,erin"` | `- 'dave,erin'`（分割しない。1 件） |
| `task edit -a "dave,erin"` | `- dave` / `- erin`（分割する。2 件） |
| `task edit -a "dave, erin"` | `dave`・`erin`（各要素の前後空白を落とす） |
| `task edit -a "a,,b"` / `"dave,"` | `a`・`b` / `dave`（空要素を捨てる） |
| `task edit -a ","` / `" "` | 変化なし・終了コード 0（沈黙無変更。`-a ""` と同型） |
| `task edit -a "bob,alice,bob"` | `bob`・`alice`（順序保存・重複除去） |
| `-a` を 2 回（create・edit とも） | 最後の 1 値だけ |

起票の記述どおりで、**編集側の `-a` は `-l`・`--depends-on` と同じカンマ区切りの全置換集合オプション**だった。doc-5 §3 が「値は 1 件で、集合ではない」と書いた根拠のうち、カンマの節が作成側の挙動である。

## 方針（2026-08-12 にユーザーが確定）

争点は「1 欄 1 値のままカンマ入力を拒む」か「集合へ改める」かの 2 択で、**集合へ改める**を選んだ。1 値と決めた理由（カンマは分割されない）が実測で偽になったこと、台帳・読み取り層・閲覧表示はいずれも一覧で 1 値なのは編集経路だけだったこと、dependencies が同じ形（カンマ区切り・非空全置換・空集合化不可）を既に持っていて `listEditor` ごと再利用できることによる。

## 変更

- doc-5 §3: assignee の写像を再訂正（作成側と編集側の読み方の違いを実測として持つ）。操作写像表に `assignee の設定（非空全置換）` の行を足し、編集（内容）行から `-a` を外した。§3.1 は「解除する操作」を「空集合にする操作」へ改め、解析結果が空になる値も沈黙無変更であることを足した。§3.2 の assignee の記述を非空全置換へ。
- doc-8 §3 割当表と §6: `1 欄 1 値` と 1 件化の予告を撤回し、非空全置換・最後の 1 件の削除の無効化・カンマを含む値の拒否へ差し替えた。
- `src/lib/comma.ts` を新設し、`commaReason`・`firstWithComma` を `manage.ts` から移した（ラベル・タグと assignee の 2 画面が同じ規則を述べるため。`manage.ts` は `edit.ts` を引いているので、逆向きの import は循環になる）。
- `edit.ts`: `EditDraft.assignee` を `string[]` へ。`isDirty` は集合比較、`buildSave` は空集合とカンマを含む要素を拒否、`Submitted.assignee` も集合、`rebaseOnto` の複製対象に加えた。`assigneeCollapseWarning` と `ASSIGNEE_NOT_CLEARABLE` を廃し、`EMPTY_ASSIGNEE_REASON` を置いた。
- `TaskDetail.svelte`: 1 本のテキスト欄を `listEditor`（labels・dependencies と同じ）へ差し替え、件数と「保存時は既存を含む全集合で置き換えます。」を足した（実測の画像で、同型の 2 区画にあって assignee だけに無いことが見えたため）。
- `wire.ts`・`update.rs`: `TaskEdit.assignee` を集合へ。`-a` へはカンマ結合の 1 値で渡し、全要素が空白の集合は `RejectReason::EmptyAssignee` で拒む。`TaskEdit` は入力専用（Deserialize のみ）なので記録の録り直しは要らない。

## 実エンジンでの実測（借り物 playwright。`_sandbox/_done/detail-check` を `_sandbox/` へ戻して使用）

併置サイドバー 1280×800・幅 480px、記録済み fixture のタスク（assignee 1 件）で編集セッションを開いた状態:

| 区画 | WebKit | Chromium |
|---|---|---|
| assignee | 127.58px | 129.63px |
| dependencies（対照・同じ形） | 127.58px | 129.63px |
| 通常ラベル（対照・注記なし） | 71.58px | 72.69px |

**同じ形の dependencies と 1px も違わない**（件数と全置換の注記を足した後の値。足す前は assignee だけ 107.58px で、差は注記 1 行だった）。3 区画の `追加` は WebKit・Chromium とも `elementFromPoint` が控え自身を返す。最後の 1 件の `削除` は無効で、`title` に `EMPTY_ASSIGNEE_REASON` が入る（実測）。

**測っていないもの**: 560×420 での固定見出しとの重なり（doc-11 §13。この部品ハーネスは面がスクロールしないので、送っても何も確かめられない — `scrollable: false`）。本区画は内容が 1 行伸びるだけで固定行の高さは動かさないため、doc-11 §13 の対象は変わらない。

## 廃した語

`assignee の 1 件化`（doc-5 §3・doc-8 §6）と `1 欄 1 値`（doc-8 §3 割当表）。対応表は `_sandbox/handoff/referent-table/referent-table-task-151.md`。**完了タスク TASK-57・TASK-58 の記録に残る `1 件化` は直していない** — あれはその回に測って書いた記録であり、契約の正本は doc の側にある。

## 派生

編集セッションのラベル追加に同じ穴があることを実測で確かめ、**TASK-155** として起票した（`task edit --add-label "a,b"` は 2 件に分かれるが、Atlas は作成モーダルでだけ拒んでいる）。公開阻害には当たらないと判断して m-3 に置いた。
<!-- SECTION:NOTES:END -->
