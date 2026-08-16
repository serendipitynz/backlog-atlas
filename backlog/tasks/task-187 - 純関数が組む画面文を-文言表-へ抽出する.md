---
id: TASK-187
title: 純関数が組む画面文を 文言表 へ抽出する
status: In Review
assignee: []
created_date: '2026-08-16 01:08'
updated_date: '2026-08-16 04:03'
labels:
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-183
ordinal: 178700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-183 が 取得子側の画面文 を移した後で、残る **`msg()` 側の画面文** を 文言表 へ移す。**`msg()` 側の画面文 とは、`messages.ts` の `msg()` で 文言表 を読む位置にある画面文、すなわち `src/lib/` の `.ts` が組み立てて返す日本語を指す。**

**この行は 2026-08-16 に TASK-183 から分けて起票された。** TASK-183 の着手回が 883 行を数え直し、ユーザーの判断で 2 つに割った結果である。**範囲は 22 ファイル・402 行**（最大は `edit.ts` 89・`project-detail.ts` 46・`settings.ts` 36・`external-editor.ts` 33・`ledger.ts` 27・`detail.ts` 26・`manage.ts` 26）。**数え方は `screen-text.test.ts` の剥がし手順で、402 は TASK-183 のマージ後の値である** — 起票時に書いた 403 との差 1 行は、TASK-183 が `mark.ts` の `ManagedFileNoun` を種別の union へ変えたぶんである。**着手回はこの数を鵜呑みにせず数え直す** — 402 は測った時点の値であって、受入条件が求めているのは残りが 0 行になることである。

**境界は機構の帰結であって、線を引く判断ではない。** 取得子は Svelte の context を要るので `.ts` からは読めず、`.svelte` が自ら綴る文はその画面のものである。したがって拡張子で割った集合と読み方で割った集合は同じものになる。

**この行だけでは描き直りを観測できない。** 純関数を呼ぶ側の画面はその戻り値を文字列として受け取るだけで、表示言語 の変化で描き直るのは取得子を読む位置である。**描き直りの実測は TASK-183 が持つ。** ただし `messages-context.ts` の註が述べるとおり、**文が純関数からしか来ない画面は取得子を 1 度読んで依存を作る**必要があり、その手当てはこの行に入る。

**書く先は `src/lib/messages/{ja,en}.ts` で、`Catalog` は `typeof ja`** — 日本語の側が鍵の集合そのものなので、鍵を足すときは日本語の文を足すことでしか足せない。**群は文が属する画面またはモジュールで切る**（`ja.ts` の頭註）。**TASK-183 が置いた群を先に読む** — 同じ文を 2 つの群へ写さない。

**訳さない範囲は decision-35 §5 が持つ** — 読み取り対象の管理ファイルの中身、日付、識別子。

**抽出漏れの走査はこの行では入れない**（TASK-184）。ただし**この行が済んだ時点でフロントエンドの源泉に画面文の日本語は残らない**ので、走査が通る条件はここで揃う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `msg()` 側の画面文（`src/lib/**/*.ts` の純関数が組み立てて返す日本語）が 文言表 へ外部化され、表示言語 の切替で英語と日本語が入れ替わる
- [x] #2 文が純関数からしか来ない画面が、表示言語 の変化で描き直ることを実測する
- [x] #3 `screen-text.test.ts` の剥がし手順で数え直し、フロントエンドの源泉（`src/**/*.{ts,svelte}`。文言表 の 2 ファイルを除く）に残る画面文の日本語が 0 行であることを示す
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 数え直しの結果 (AC #3)

`screen-text.test.ts` の剥がし手順（`https?://` を潰す → ブロックコメント → 文字列の外の `//`）を
`src/**/*.{ts,svelte}` へ当て、`SKIPPED`（試験・`fixtures.ts`・`fake-boundary.ts`）と 文言表 2 ファイルを
除いて日本語を含む行を数えた。**着手時 402 行・22 ファイルで、起票時の値と一致した**（`edit.ts` 89・
`project-detail.ts` 46・`settings.ts` 36・`external-editor.ts` 33・`ledger.ts` 27・`detail.ts` 26・
`manage.ts` 26・`mark.ts` 22・`shortcuts.ts` 21・`swimlane.ts` 21・ほか 12 件）。**完了時は 0 行・0 ファイル。**
`.svelte` は TASK-183 の時点で既に 0 行なので、**フロントエンドの源泉に画面文の日本語は残っていない。**
恒久的な走査は TASK-184 が入れる。

## 描き直りの実測 (AC #2) と、そのために変えた機構

**着手回の最初の作業として「取得子を 1 度読む手当てが要る画面」を数えたところ、数えるべきものが
画面ではなかった。** 取得子を 1 つも読まないコンポーネントは 3 件（`Body`・`DetailSection`・`TitleBar`）
だが、いずれも自分では文を持たず親から文字列を受け取るだけである。実際に取り残されるのは**画面ではなく
`$derived` と描画式**で、純関数を呼びながら取得子に触れていないものが該当する。

**これは推論ではなく実測で出た。** 抽出を進めた時点で `App.component.test.ts` の並び順の検査が落ち、
`<option>` が日本語のセッションで英語を刷っていた — シェルの 表示言語 は設定読取が返るまで OS の答え
（jsdom では英語）で、`msg()` は非反応値なのでその後の変更で組み直されないためである。同じ形の場所は
`topBands`・`headerMenu`・`transitionOffers` など多数あり、**どれが漏れているかを検査できる手段は無い。**

そこで**シェルが自分の 表示言語 の取得子を `messages.ts` へ渡す**ことにした（`provideLanguageSource`）。
`msg()` がその取得子を読むので、**純関数へ届く呼び出しはそれ自体が言語の読み取りになり**、呼び出し側の
`$derived` が言語に依存する。コンポーネント側に足すものは無く、次の回が覚えておくものも無い。
シェルが無いとき（`node` プロジェクト、単体でマウントしたコンポーネント）は取得子が無く、
`setLanguage` の平の値がこれまでどおり答える。理由は `messages.ts` の頭註が正本。

**実測は `App.component.test.ts` の `純関数だけが文を組む区画も、同じ描き直しで英語になる`** で、
`external-editor.ts`・`edit.ts`・`swimlane.ts` の 3 つが組む文を 表示言語 の切替の前後で見る。
**`provideLanguageSource` の呼びを外すとこの検査は落ちる**ことを確認してから提出した。

## 押下より長く残る文をサンク化した (5 か所)

`notice` が TASK-183 でサンクになったのと同じ理由が、**この回で新たに 5 か所に当たるようになった** —
抽出前は日本語しか無かったので言語は関係なかったが、いまは「失敗した時点の 表示言語」を抱え込む。
`fatal`・`placementFailure`・`cardOrderFailure`（`App.svelte`）、`failure`・`locationFailure`
（`Settings.svelte`）を `(() => string) | null` にし、`SettingsWriterPorts.describeError` の戻り値も
サンクにした。**型がサンクなので、文字列を掴んだままにする書き方はここでは書けない。**

## 決めた 2 件（起票時に「この回で決める」とされていたもの）

- **保存区分の値は両言語とも素の `active`/`draft`/`completed`/`archive` のまま**とした。3 つは CLI が
  タスクを置くディレクトリ名そのもの（`drafts/`・`completed/`・`archive/`）で、画面の語は利用者が
  自分の Backlog ツリーで見る語と一致しているべきである。訳すとその対応が切れるうえ、**上流の UI は
  4 つ目に当たる語を持たない**（あちらのディレクトリは `tasks/`）ので、集合として訳す先が無い。
  **保存区分不明 は 4 つのうちの 1 つではなく「どれでもない」ことの陳述**なので、そちらは訳す。
  理由の正本は `token.ts` の `storageLabel` の註。
- **状態遷移の英語は上流の CLI help の語彙に合わせた** — `taskDemote` は `Move back to drafts`、
  `taskArchive`/`draftArchive` は `Archive`、`taskComplete` は `Clean up into completed`
  （**完了整理 は `cleanup` 系**）、`draftPromote` は `Promote to task`。

## 群の置き方

TASK-183 が置いた `shell`・`action`・`field`・`state` の 4 群を先に読み、2 画面以上が使う文はそこへ入れた
（`state.nothingToSaveYet` は タスク詳細 と 文書更新 の両方、`action.savingNow` は タスク詳細 と 設定画面、
`field.titleRequiredReason` は 新規タスク と 文書作成）。**新しい群は 1 つだけ足した** — `mark`（印と理由行）。
カード・詳細見出し・行の印チップが同じ行を読むので、どれか 1 画面の群には入らない。
`taskDetail.editor`・`taskDetail.transition`・`projectRegister.problem`・`projectRegister.refusal`・
`shortcutHelp.assignment` は群ではなく、**鍵の集合が型で閉じている表**である（`TransitionKind`・
`LedgerRefusal`・`ShortcutAction` で引くので、variant を足すとコンパイラが文を要求する）。

## 訳さないと決めたもの

decision-35 §5 の 3 つ（管理ファイルの中身・日付・識別子）に当たるものは移していない。この回で
1 件ずつ分けた結果、次は**語であって文でない**ものとして両言語に同じ値を置いた:
`CANONICAL_COLUMN_LABEL`（To Do ほか）、priority の 3 段、テーマの固有名（`theme.ts` の `name`）、
外部コマンドの製品名（Backlog CLI・Git・GitHub CLI）、`$VISUAL`/`$EDITOR`。
**`mark.ts` の `MANAGED_FILE_NOUN` は逆で、Atlas が書いた語なので移した** — 4 つとも 文言表 にある。

## 検証

`pnpm test`（952 件・全通過）・`pnpm run check`（0 errors）・`pnpm run lint`（clean）・`pnpm run build`。
**crate は 1 行も触っていない**ので Rust 側の検査は走らせていない。
<!-- SECTION:NOTES:END -->
