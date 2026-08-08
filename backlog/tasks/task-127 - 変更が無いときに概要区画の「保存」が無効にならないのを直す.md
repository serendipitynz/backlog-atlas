---
id: TASK-127
title: 変更が無いときに概要区画の「保存」が無効にならないのを直す
status: In Review
assignee: []
created_date: '2026-08-08 07:11'
updated_date: '2026-08-08 09:41'
labels:
  - ui
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 124500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-08 の TASK-124 の目視で判明。概要区画の「保存」が、送る属性が 1 つも無い状態でも押せる。押しても save() が request === null で即 return するため誤った書き込みは起きないが、doc-10 §4.1 の「変更が無いときは『変更なし』として保存を無効化する」に反しており、押せるのに何も起きない控えになっている。同じ式が入力不備 (editIssues) の門も兼ねているので、そちらも無効化されていない。

入った時点は 8aa4be9 (TASK-79 の目視反映)。ProjectDetail.svelte の saveBlocked は無効化の理由文そのものを値として持ち、null でないことが門になっていたため、理由文 2 件を「状態の言い換え」として落としたときに門ごと落ちた。同じコミットで「保存で送る属性」区画の『変更なし（送る属性はありません）。』も落ちており、見出しだけで中身が空になるのもこれが原因。

TASK-79 の判定自体が誤りだったと見る: doc-11 §8 は状態文 (その場所に何が出ているか・何が無いか) を本節の対象外と明記しており、「変更がありません」はその状態文であり、かつ §5 が要求する不可の理由でもある。落とす 4 種のどれでもない。

同型が他の画面にも無いかを併せて見る — 理由文と門を同じ値に持たせている箇所は、文言の一掃で門が消えうる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 変更が無いとき概要区画の「保存」が無効になり、無効の理由が画面で読める
- [x] #2 入力に問題があるとき概要区画の「保存」が無効になり、無効の理由が画面で読める
- [x] #3 理由文の削除で門が消える同型が他に無いか確かめ、結果が記録されている
- [x] #4 同じ経路の再発が試験で検出される
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 直したこと

`ProjectDetail.svelte` の `saveBlocked` は「保留理由が非 null であること」を無効化の条件そのものに
していた。`8aa4be9`（TASK-79 の目視反映）が理由文 2 件を「状態の言い換え」として `null` へ置き換え
たとき、門も一緒に落ちて、変更が無いときも入力に問題があるときも「保存」が押せる状態になっていた
（doc-10 §4.1 に反する）。同じコミットが「保存で送る属性」の『変更なし（送る属性はありません）。』も
落としており、見出しだけで中身が空になっていた。

- `project-detail.ts` に `OverviewSave`（`ready` / `withheld` ＋ `reason`）と `overviewSave` を新設し、
  保留判定を判別子、保留理由をその隣の欄に分けた。`RedetectControl`（TASK-124）と `IssuePlan` が
  先に取っている形をそのまま引いた。
- 「変更なし（送る属性はありません）。」を復元した。doc-11 §8 は状態文を本節の対象外と明記して
  いるので、これを落とした判定が誤りだった。doc-10 §4.1 が「変更なし」という語まで定めている。
- 保存の保留理由 2 件（入力に問題があるとき・変更が無いとき）を `omitsSentence` の列挙へ入れた
  （doc-11 §8 の licence ①：区画がその理由を可視で述べている）。控えは §5 の 2 つ目の形のままで、
  隠したのは文だけである。

## 契約の改訂（決 印は後付け・決定先行 21 例目、doc 改訂だけで足りる 16 例目）

2026-08-08 にユーザーが 2 件とも確定した。decision は書いていない。

- **doc-11 §5 に「保留判定と保留理由を別の欄に持つ」を新設**。同節の「理由の無い無効化を置かない」
  だけでは片方向しか守れない。判定と理由を兼ねさせると、理由文を落とした時点で無効化も落ちる。
  「画面に出る文を落とす作業は、その文が保留判定を兼ねていないかを先に見る」も同項に書いた。
- **doc-11 §8 の置き方に 1 文**。1 つの控えが licence に当たる理由と当たらない理由を併せ持つときは
  §5 の 2 つ目の形へ揃え、licence は文を可視にするかどうかだけを決める。概要区画の保存は 4 つの
  保留理由を持ち、理由ごとに `disabled` と `aria-disabled` を切り替えると、同じボタンがなぜ押せない
  かによってフォーカスを受けたり受けなかったりする。

## AC #3 の数え上げ（2026-08-08）

「保留理由が非 null であること」を無効化の条件にしている箇所は 9 件。**現時点で門が落ちているのは
概要区画の保存だけ**で、残り 8 件は生きている。

- 試験が保留判定を押さえている 5 件 — `project-detail.ts` の `overviewBlocked`・`unregisterBlocked`、
  `header.ts` の `showAllRowsHeld`、`lane-create.ts` の `laneCreateHold`、`settings.ts` の
  `openLocationBlocked`。理由文を落とすと試験が落ちる。
- 押さえていない 3 件 — `Settings.svelte` の `saveBlocked`・`closeBlocked`（理由は名前付き定数を
  参照しているので、落とすには export を消すことになる）、`GitHistory.svelte` の `reloadBlocked`
  （理由がインラインの文字列リテラルで、本タスクが踏んだ形と同一。最も近い同型）。
- `Modal.svelte` の `closeBlocked` は prop で、上流は tagged な `IssuePlan` 由来。

判定と理由が別の欄になっているのは 4 件 — `IssuePlan`・`RedetectControl`・`saveAvailability`
（`{enabled, reason}`）・`FilterBar.svelte`（`undoBlocked`/`clearBlocked` の真偽と `blockedReason`）。

**残り 8 件を揃えるのは TASK-128** として起票した（2026-08-08 にユーザーが「既存は別タスク」と確定）。

## 実測（借り物 playwright / WebKit / `_sandbox/app-check/`、1280x900）

`概要区画` の「保存」を 5 状態で測った。

| 状態 | aria-disabled | describedby | 保存で送る属性 | 理由の要素 |
|---|---|---|---|---|
| 開いた直後（変更なし） | true | overview-save-blocked | 変更なし（送る属性はありません）。 | 1x1px（読み上げのみ） |
| project_root を空にした | true | overview-save-blocked | — | 1x1px。欄の下に「プロジェクトルートは空にできません。」 |
| project_root を相対パスに | true | overview-save-blocked | — | 1x1px。欄の下に「プロジェクトルートは絶対パスで指定してください。」 |
| 正しい絶対パスへ変えた | false | なし | project_root / backlog_root の 2 行 | 空 |
| 元の値へ戻した | true | overview-save-blocked | 変更なし（送る属性はありません）。 | 1x1px |

無効時の見た目は `app.scss` の `button[aria-disabled="true"]`（doc-11 §5 の破線枠 ＋ opacity .45）で、
実エンジンでもそう描かれていることを画像で確認した。

**測っていないので目視で見てほしいこと**: 台帳読取専用のときと台帳への書き込み実行中のときの
「保存」（ハーネスがその状態を作れない）。

## 実測中に見つけた 2 件（本タスクの範囲外）

- **ハーネスの嘘 3 度目**。`_sandbox/app-check/` に `git_remote_read` が無く、`default` が
  `{kind: "unsupported"}` で reject していた。`unsupported` は `CliReadiness` の状態であって
  `CommandError` の kind ではないので、`commandErrorDetail` の switch がどの枝にも当たらず
  「remote を読めません: undefined」になっていた。ハーネス側を直した（`_sandbox/` は非コミット）。
- **入力に問題があるときも「保存で送る属性」が一覧を出す**。`submittedAttributes` は
  `toUpdateRequest` の結果だけを見ており、`editProblems` を見ていない。project_root を空にすると
  `project_root /repos/atlas → （空）` が並ぶ。本タスクより前からの挙動で、保存は無効なので誤った
  書き込みは起きない。AC のどれにも当たらないため触っていない。
<!-- SECTION:NOTES:END -->
