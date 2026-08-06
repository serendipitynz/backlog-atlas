---
id: TASK-119
title: 絞り込みの値を選ぶとアプリがフリーズするのを直す
status: In Review
assignee: []
created_date: '2026-08-06 07:56'
updated_date: '2026-08-06 09:45'
labels:
  - ui
  - decision
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 116500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**症状（ユーザー報告、2026-08-06 の TASK-77 目視。`pnpm tauri dev` で起動した実アプリ）**:

- 絞り込みポップオーバーで **Type・ラベル・priority・assignee・不整合のいずれかの値を選んだ瞬間**、アプリが実質フリーズする。ポップオーバーを閉じられない（「閉じる」ボタンも Escape も「＋ 絞り込み」ボタン自身も効かない）だけでなく、**他のどんな操作も受け付けない**。終了するしかない。
- **保存区分の選択だけは問題ない。**
- **選択そのものは効いている** — 「不整合のみ」を押した瞬間、不整合のタスクだけが表示される状態にはなった。つまり 1 回目の更新は通り、その後が止まる。
- **⌘Q は効く。フィルタのテキスト欄はフォーカスでき、文字も入る。マウスホバーのスタイル変更も効く。ただし何を入力してもフィルタはそれ以上反応しない。**
- タスク詳細は開いていない。不整合のタスクは実在する。

**症状の読み**: 入力とホバーが生きていて画面の更新だけが止まるのは、**JS のメインスレッドが詰まっている**（その場合は文字入力も止まる）よりも、**Svelte の更新が例外で死んでいる**ことの徴候に近い。着手時はまず webview の devtools でコンソールの例外を確認する（`pnpm tauri dev` の画面で右クリック → 要素の検証、または ⌘⌥I）。

**再現できていない（2026-08-06、4 通り）**:

1. `_sandbox/filter-check/`（本物の `FilterBar` ＋ `FilterPopover`、ダミー facets、WebKit）
2. 本物の `App.svelte`（`pnpm vite` ＋ WebKit、Tauri IPC 無しでプロジェクト 0 件）
3. 本物の `App.svelte`（jsdom ＋ `fake-boundary`、不整合タスクを含む fixture 2 件）
4. **`_sandbox/app-check/`（本タスクで新設）** — 本物の `App.svelte` ＋ 本物の `commands.ts` を、`@tauri-apps/api/core` の `invoke` を差し替えた偽 IPC の上に立て、3 プロジェクト × 12 タスク（ラベル・priority・assignee・Type・不整合を含む）を WebKit で描いたもの。priority を選んでもフリーズせず、カードは 36 → 12 に絞られ、例外も出ない。起動は `pnpm vite --config _sandbox/app-check/vite.config.ts`。

したがって、上の 4 つに無い条件（実データの量・実際の Backlog ルート・ファイル監視の実イベント・WKWebView 固有の挙動のいずれか）が要る。

**未確定で、着手時に最初に確かめること**:
- **main でも起きるか。** TASK-77 が触ったのは `matchesFilter`・`collectFacets`・`buildSwimlane` の引数（`InconsistentLookup`）で、これは全ファセット共通の経路である。一方フリーズするのは TASK-77 が触っていないファセットも含む。**この 2 つは両立するので、main での確認が切り分けの起点になる。**
- devtools のコンソールに出る例外（あれば、それが原因そのもの）。
- 保存区分だけ無事な理由。保存区分は既定でトークンが 1 つ立っており、他のファセットは**選ぶとトークンが 1 つ増える**（帯の高さが変わりうる）。`Swimlane.svelte` の `ResizeObserver` が `headHeight` を書き戻す経路（2 層スティッキー、TASK-61）は、帯の高さが変わると走る。

**副次的に判明した doc の欠落**: doc-7 §5.2 はポップオーバーの中身（検索・スクロール・値ごとの件数・選択数）を定めているが、**いつ閉じるかを書いていない**。現在の規則（値を選んでも閉じない）は `FilterPopover.svelte` 冒頭のコード註にしかなく、AGENTS の「decision/doc が契約」を満たしていない。フリーズを直したうえで、閉じる契機を §5.2 へ書く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Type・ラベル・priority・assignee・不整合のいずれの値を選んでも、アプリが操作を受け付け続ける
- [x] #2 「不整合のみ」を選択した後も、「閉じる」ボタンと Escape の両方でポップオーバーが閉じる
- [x] #3 再現条件と原因が Implementation Notes に書かれている（main でも起きるかを含む）
- [x] #4 回帰を止める試験がある。実エンジンでしか出ない現象なら、それを記録した理由と代わりに何で押さえたかを書く
- [x] #5 ポップオーバーの閉じる契機が doc-7 §5.2 に書かれている（値の選択で閉じるかどうかを含む）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
<!-- SECTION:NOTES:BEGIN -->
## 切り分けの経過（2026-08-06、TASK-77 のセッション）

- **main でも再現する**（ユーザー確認）。**TASK-77（PR #68）は原因ではない**。既存の不具合であり、PR #68 のマージを妨げない。
- **データ量は原因ではない**。`_sandbox/app-check/` を `?n=120`（3 プロジェクト × 120 タスク＝カード 360 枚）で WebKit に描き、priority を選択 → 120 枚へ絞られ、Escape でポップオーバーも閉じた。例外なし。`?n=12`（36 枚）でも同じ。
- **未取得**: 実アプリの devtools のコンソールに出ている例外。これが原因そのものである可能性が高い（症状の読みは Description 参照）。

**私の 4 環境と実アプリの残る差**: 実際の Backlog ルート（`config.yml` の status 定義・未分類区画・保存区分の分布）、**ファイル監視の実イベント**（`_sandbox/app-check/` の `listen` は何も送らない）、実 `ProjectSnapshot`（マイルストーン・文書を持つ）、WKWebView そのもの。次に疑う順序もこの順。

## 原因（2026-08-06 に確定。再現済み）

ユーザーが devtools から出した例外と同一のものを `_sandbox/app-check/` で再現した:

```
TypeError: null is not an object (evaluating 'element.getBoundingClientRect')
  in $effect in Swimlane.svelte in App.svelte
```

**`Swimlane.svelte` の `measureHead()` が `null` を弾いていない。**

1. `columnHeads` は `$state<Record<string, HTMLElement>>({})` で、列ヘッダの `bind:this={columnHeads[column]}` が埋める。
2. **未分類列は常設ではない**（doc-7 §2.2、`hasUnmapped`）。絞り込みで未分類 status のカードが全行から消えると、その列ヘッダが unmount される。
3. **Svelte の `bind:this` は unmount 時にそのキーへ `null` を書く**（キーは残る。`undefined` にはならない）。
4. `measureHead()` は `Object.values(columnHeads).filter((element) => element !== undefined)` で選別しており、**`null` はこの条件を通る**。直後の `element.getBoundingClientRect()` が投げる。
5. `columnHeads` は `$state` なので、書き換わった時点で `ResizeObserver` を張っている `$effect` が再実行され、そこで投げる。**例外が effect の外へ出るので Svelte の flush が中断し、以降の更新が一切流れなくなる。** 画面は最後に描かれた状態のまま、テキスト入力とホバーだけがブラウザ側の機能として生き続ける — 報告の症状そのもの。

**保存区分だけ無事な理由**: 保存区分の選択は draft / completed / archive を**足す**操作なので、未分類列が消えない。Type・ラベル・priority・assignee・不整合は**カードを減らす**ので、未分類のカードが全部落ちた瞬間に列が消える。

**私が 4 環境で再現できなかった理由**: どの fixture も全タスクが正準ステータス列へ対応づいており、**消える未分類列が存在しなかった**。`_sandbox/app-check/` に未分類 status のタスクを 1 件混ぜた（`?unmapped=0` で外せる）ところ、priority を選んだ瞬間に上の例外が出て、その後 Escape でポップオーバーが閉じなくなることまで再現した。

**同じ穴がもう 1 か所ある**: 同ファイルの 着地 の `$effect` は `laneMarks[slug]`・`laneHeads[slug]` を `=== undefined` で見ており、行が消えた直後は同じく `null` を掴みうる。型 `Record<string, HTMLElement>` が 3 つとも嘘をついている（`null` を持つ）ので、直すのは判定だけでなく型も。

**TASK-77 とは無関係**（main で再現。`measureHead` は TASK-61 の実装）。

## 再現条件（2026-08-06 に確定）

**未分類 status のタスクが 1 件以上あり、選んだ値がその 1 件を落とすこと。** これだけである。
データ量・実際の Backlog ルート・ファイル監視の実イベント・WKWebView 固有の挙動はいずれも無関係だった
（前 4 環境が外していたのは「未分類区画のカードが全行から消える」条件そのもの）。

- `_sandbox/app-check/` に未分類 status のタスクを 1 件混ぜ（`?unmapped=0` で外せる）、WebKit で
  priority の値を選んだところ、ユーザーが devtools から出した例外と同一の
  `TypeError: null is not an object (evaluating 'element.getBoundingClientRect')` が出て、
  以降 Escape も「閉じる」も効かなくなった。**報告どおりの症状を手元で再現できた。**
- **保存区分だけ無事だった理由もこれで説明が付く。** 保存区分の選択は未分類区画のカードを落とさない
  （draft を足しても未分類列は残る）ので、列ヘッダが unmount されない。帯の高さの変化は関係なかった。
- **main でも再現する**ので TASK-77（PR #68）は原因ではない。既存の不具合である。

## 原因（既述の確定内容の補足）

`bind:this` は要素の unmount 時に束縛先へ **`null`** を書き、キー付きレコードではキーを残す
（`svelte/src/internal/client/dom/elements/bindings/this.js` の `update(null, ...parts)`。
`{#each}` の項が動いたときも旧キーへ同じことをする）。`Swimlane.svelte` の
`columnHeads`・`laneHeads`・`laneMarks` はこれを `Record<string, HTMLElement>` と宣言しており、
**型が嘘をついていた**。`measureHead()` の選別が `!== undefined` だったので `null` が素通りし、
`getBoundingClientRect()` が投げた。レコードは `$state` なので、書き換わった時点で観測の `$effect` が
再実行され、例外が `$effect` の外へ出て Svelte の flush が中断する（本タスクではこの状態を **更新停止**
と呼ぶ）。メインスレッドは動いたままなので、ブラウザだけで完結する文字入力・ホバー・⌘Q は効き続け、
画面の更新だけが止まる — 報告の症状そのもの。

## 直したもの

- 3 つのレコードの型を `Record<string, HTMLElement | null | undefined>`（`BoundElements`）に改め、
  読み出しを `boundElements()` / `boundElement()` の 2 つに集約した。判定だけでなく型を直したのは、
  `!== undefined` が通ってしまったのは型が `null` を許していなかったからで、同じ間違いが次に書く人にも
  できる状態が残るためである。
- 着地の `$effect` も同型だった（`laneMarks`/`laneHeads` を `=== undefined` で見ていた）ので同時に直した。
  こちらは行が並べ替わった瞬間にしか起きないので報告には出ていないが、原因は同じ 1 つである。
- `FilterPopover.svelte`・`FilterBar.svelte` のコード註を doc-7 §5.2 を引く形に改めた。

## 回帰試験の置き場（AC #4）

**`src/App.component.test.ts` に画面横断契約 1 件として置いた**（3 件 → 4 件）。3 例あり、
どれも修正を外すと `Cannot read properties of null (reading 'getBoundingClientRect')` で落ちることを
確かめてある。

**「実エンジンでしか出ない現象」ではなかった。** 引き継ぎ指示書は「jsdom は `getBoundingClientRect` が
必ず値を返すのでコンポーネントテストでは捕まえられない」と見ていたが、**これは誤り**である。投げていたのは
`null` に対するプロパティ参照であって測定ではないので、レイアウトを持たない jsdom でも同じ TypeError に
なる（`render.ts` の箱の規則は無関係で、`ResizeObserver` のスタブが発火しなくても、観測の `$effect` は
本体で 1 度測るので通る）。数値には一切触れていないので `render.ts` の「返す数を assert しない」規則も
守れている。

`Swimlane.svelte` 側ではなく `App.svelte` 側に置いたのは、壊れていたものの形がそうだからである —
絞り込みはシェルのもの、列はグリッドのもので、壊れるのはそのどちらでもなく**その後のすべての更新**である。
assert しているのも幾何ではなく「その後の操作が届くか」である。

## 実エンジンでの確認（AC #1・#2）

`_sandbox/app-check/`（3 プロジェクト × 12 タスク＋未分類 1 件、WebKit）で
**Type・ラベル・priority・assignee・不整合・保存区分の 6 ファセット × Escape・「閉じる」ボタンの
12 通りすべて**を通した。例外ゼロ、12 通りともポップオーバーが閉じた。修正前は同じ手順で
priority を選んだ時点で例外が出て Escape が効かなかった。

## doc-7 §5.2 へ書いたこと（AC #5）

閉じる契機を **5 つ**として書いた（「閉じる」ボタン・Escape・ポップオーバーの外側の押下・
「＋ 絞り込み」の再押下・別の被せ層を上げる操作）。併せて、閉じる契機に含まれないもの
（値の選択・`addFilter` の押鍵）と、閉じ方が条件の適用に影響しないことも書いた。
対応表は `_sandbox/handoff/referent-table-task-119.md`。

**数は 3 → 4 → 5 と 2 度動いた。動いた理由がそれぞれ違うので、両方を記録する。**

- **3 → 4**（着手時、実装を数え直して）: 外側の押下の判定範囲が anchor 全体（控えを含む）なので、
  「＋ 絞り込み」自身での開閉は外側の押下では拾われず、控え自身の click が別経路として存在する。
- **4 → 5**（PR #69 のレビュー [P2]）: `App.svelte` の `raiseModal()`・`openMenu()` が被せ層を
  上げる前にポップオーバーを降ろしており、これも利用者の押下（⌘N・⌘,・メニュー項目・☰・⌘M）が
  契機である。**「限る」と書いた列挙が網羅でなかった。** 対応表を先に確定していても、表に載せる行を
  実装から拾い切れていなければ同じ穴が開く — 数え方は「その状態を変える代入をコード全体で探す」で、
  画面の部品だけを見ているとシェルが持つ状態を落とす経路が見えない。

**この 5 つ目が立脚している「被せ層は同時に 1 枚だけ」という規則は、`backlog/` のどこにも
書かれていない**（実装では `raiseModal` のコード註にしかない）。被せ層の列挙は doc-7 §2.1 が
持つので規則もそこへ書くべきだが、**同じ節を触る TASK-117（m-2・決定先行）が控えている**ので
先回りせず、**TASK-120 として起票**し §5.2 の当該箇所から名指しした。黙って前提にはしていない。
<!-- SECTION:NOTES:END -->
