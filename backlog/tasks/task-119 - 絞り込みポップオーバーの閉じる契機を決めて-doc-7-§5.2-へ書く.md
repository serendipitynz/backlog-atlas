---
id: TASK-119
title: 絞り込みの値を選ぶとアプリがフリーズするのを直す
status: To Do
assignee: []
created_date: '2026-08-06 07:56'
updated_date: '2026-08-06 08:43'
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
- [ ] #1 Type・ラベル・priority・assignee・不整合のいずれの値を選んでも、アプリが操作を受け付け続ける
- [ ] #2 「不整合のみ」を選択した後も、「閉じる」ボタンと Escape の両方でポップオーバーが閉じる
- [ ] #3 再現条件と原因が Implementation Notes に書かれている（main でも起きるかを含む）
- [ ] #4 回帰を止める試験がある。実エンジンでしか出ない現象なら、それを記録した理由と代わりに何で押さえたかを書く
- [ ] #5 ポップオーバーの閉じる契機が doc-7 §5.2 に書かれている（値の選択で閉じるかどうかを含む）
<!-- AC:END -->

## Implementation Notes

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
<!-- SECTION:NOTES:END -->
