---
id: TASK-35
title: タスク詳細画面の表示系（Type/References/PR/Git 履歴/縮退）を実装する
status: In Progress
assignee: []
created_date: '2026-07-22 12:07'
updated_date: '2026-07-25 10:27'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-30
  - TASK-33
  - TASK-34
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-8 §3-5 の設計に従い、1タスクの全項目を1画面で見せる詳細画面の表示系を実装する。読み取りはドメインモデルから写し、Git・PR 参照は doc-6 の出力を用いる。単一プロジェクト文脈だが見出しには横断タスクID を併記する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 見出しに横断タスクID+title・status（正準対応併記）・priority・assignee・milestone を出す
- [x] #2 Type と通常ラベルを別区画に分離し、Pull Request URL を References と分離して独立表示する
- [x] #3 Description・AC（checked 可視化）・実装計画/ノート・dependencies（未解決印）を表示する
- [ ] #4 Git 履歴欄にコミット一覧（新しい順）と関連 PR を出し、0件時は対応コミット無しを示す
- [x] #5 縮退時は判別できた項目のみ出して不足を明示し、参照系はどの保存区分でも読み取り表示する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装範囲

doc-8 §3–§5 の表示系（見出し・Type/通常ラベル分離・Description・AC・実装計画/ノート・dependencies・References/Pull Request 分離・Git 履歴欄・日付・縮退表示）を Svelte 5 で実装した。編集操作（doc-8 §6）は TASK-36、外部エディタ経路（§7）は TASK-37 のため、本タスクでは読み取り専用の面のみを出す。

## 構成

- `src/lib/detail.ts` … 詳細画面の純ロジック。冒頭に doc-8 語彙の対応表（referent table）を置き、参照分離・依存解決・コミット一覧の状態・関連解決可否・縮退の不足内容を pure function として持つ。
- `src/components/TaskDetail.svelte` … 詳細パネル本体（区画のマークアップと scoped SCSS）。
- `src/components/GitHistory.svelte` … Git 履歴欄（コミット一覧＋関連解決の状態＋再取得）。
- `src/App.svelte` … カード選択で詳細を開く配線。選択は `TaskView` ではなく (slug, sourcePath) で保持し、再読込後の最新スナップショットから解決し直す（doc-9 §3 の継続検出で表示が古い版に固定されないため）。
- `src/lib/wire.ts` / `commands.ts` … doc-6 の payload 型（`Commit`・`PullRequestRef`・`RemoteHost`・`CommitSearch`・`TaskHistory`）と `task_history_read` ラッパを追加。

## 境界（Rust）の変更: コミット検索結果を値にした

`task_history_read` は Git 対象不在で `CommandError::NotAGitRepo` を返して読み取り全体を失敗させていた。この形では decision-6 の「Git 対象不在は Git 履歴欄だけを対象不在として示す」と doc-8 §5 の「コミット一覧と Pull Request 区画を各々独立に出す」を満たせない（References 由来の PR 区画まで一緒に落ちるため、Git 管理外のプロジェクトで PR/References 分離が消える）。そこで `TaskHistory.commits` を `CommitSearch`（`searched`（0 件＝該当なし）/ `noRepository`（対象不在、project_root を添える）/ `unreadable`（Git 読み取り失敗））に変え、Git 起因の失敗をコマンドの失敗ではなく値にした。構成できなくなった `CommandError::NotAGitRepo` / `GitFailed` は削除した（decision-6 の 3 区別は `CommitSearch` 側で保つ）。

## AC ごとの実装

- #1 … 見出しに横断タスクID（`<slug>:<TASK-ID>`、doc-3 §5.3）＋title・status を出し、status は生値と正準列（decision-4）を併記する。未対応 status は「正準列 未対応」、config.yml 未宣言・宣言集合なし・draft の既知値をそれぞれ別の印にする。priority・assignee・milestone（id → title 解決、未解決は印）・保存区分・日付・ファイルパスも同じ見出し区画に置く。id を読めない解析不能タスクはファイル名で名指す（doc-4 §5）。
- #2 … Type 区画と通常ラベル区画を別セクションにし、チップ形状もカード（doc-7 §3）と同じく塗り／輪郭で分ける。Pull Request 区画は References 区画と独立させ、分離は doc-6 §4 の抽出結果（`history.pullRequests`）を URL 完全一致で差し引く後処理として行う（doc-8 §4「正本の references を書き換えない」）。抽出規則自体は Rust の `history.rs` に 1 か所だけ在り、TS 側に写していない。
- #3 … Description・AC（`#N` と ☑/☐ の checked 可視化、checked 数/総数）・実装計画・実装ノート・dependencies を表示する。dependencies は同スナップショット内のタスクへ解決し、解決先はボタンで辿れる（doc-8 §3）。読み取り層は dependencies の参照欠損を立てないため、未解決印は画面側の解決結果で付ける。
- #4 … Git 履歴欄にコミット一覧（識別子・要約・日時・作者）を doc-6 §3 の順序（新しい順）そのままで出す。0 件は「対応コミット無し」を中立表示（decision-6 のエラー提示方針）にし、Git 対象不在・Git 読み取り失敗・TASK-ID 不在とは別の文言にする。関連 PR は解決状態だけを示す：remote ホスト判別済み（参照手段が未実装のため関連解決は行わない、doc-6 §6）／Git remote 不在（台帳属性が偽、設定で解消できる）／ホスト種別判別不能（対象外）／未照会。PR URL 自体は Pull Request 区画に独立表示するので Git 履歴欄では重複させない。
- #5 … 縮退タスクは判別できた項目をそのまま出し、不足を専用区画で明示する（解析不能の不足必須フィールド・想定外スキーマ・参照欠損・保持された未知セクション）。参照系（Type・References・Pull Request・Git 履歴）は保存区分に依らず読み取り表示する（doc-8 §6.5）。TASK-ID を読めないタスクでは PR 抽出を実行できないため、References を分離せず全件表示していることと理由を明示する（黙って未分離のまま出さない）。

## 設計上の判断

- **Markdown を描画しない**: Markdown レンダラは新規本番依存になり AGENTS が事前確認を要求するため、本文・実装計画・ノートは改行を保った素のテキストとして出す。
- **URL をリンクにしない**: Tauri の WebView 内で `<a href>` を踏むとアプリ画面自体が遷移してしまい、外部ブラウザで開く手段は本ビルドに無い。URL は選択可能なテキストとして出す。
- **正準列ラベルの共有**: 詳細画面も同じ 4 ラベルを使うため `CANONICAL_COLUMN_LABEL` を `swimlane.ts` の `CANONICAL_COLUMNS` の隣に置き、`Swimlane.svelte` の重複定義を解消した。
- **履歴の再取得契機**: 選択タスクと References の変化でのみ再取得する（PR 分離は References 由来）。コミットはファイル状態ではなく監視で拾えないため、更新は Git 履歴欄の「再取得」ボタンに置いた。
- **選択タスクが読み取り結果から消えた場合**: 空パネルにせず「削除・移動、またはルート読取不能の可能性」と名指す。

## 検証

- `npm run test`（vitest）: 47 passed（detail.test.ts 13 件を追加。AC ごとに参照分離・依存解決・AC 進捗・コミット一覧の 4 区別・関連解決可否・縮退の不足内容・保存区分別の参照系表示を対象にした）。
- `npm run check`（svelte-check）: 0 errors / 0 warnings。`npm run build`: ok。
- `cargo fmt --check` / `cargo clippy --all-targets -D warnings` / `cargo test`: clean（207 passed, 1 ignored。`CommitSearch` の wire 形と 該当なし／対象不在／読取不能 の区別のテストを追加）。
- 目視確認: fixture データの一時ページを vite dev 上で headless Chrome にレンダリングし、(a) 正常タスク（PR/References 分離・AC 2/3・未解決 dependency・コミット 2 件＋関連解決の状態）、(b) 解析不能タスク（TASK-ID 不明・status を読めません・PR 抽出不可の明示・縮退区画と保持された未知セクション）、(c) 未対応 status ＋ completed ＋ コミット該当なし ＋ remote 不在、(d) Git 対象不在、(e) スイムレーンと詳細パネルの二枚組（グリッドが幅を譲って横スクロールし、パネルが独立スクロールする）を確認した。一時ページは確認後に削除済み。

## レビュー第1ラウンド対応（PR #11）

### AC #4 の再スコープ（[P1]）

AC #4 の「関連 PR を出し」は**未完了に戻した**。関連解決には remote ホスト種別ごとの参照手段（ホストの API 等）が必要で、doc-6 §6 はそれを「種別ごとの後追加・別途依存判断」としており、TASK-30 は `PrCommitSource` trait の構造だけを固定して実装を送りにしている。したがって本タスクの Git 履歴欄は、コミット一覧と関連解決の**状態**（remote ホスト判別済み／Git remote 不在／ホスト種別判別不能／未照会）までしか出せない。これは doc-8 §5 の縮退経路（「コミット一覧と Pull Request 区画を各々独立に出し、関連が解決できないことを対象不在と区別して示す」）としては満たしているが、解決済み経路である「各コミットに関連 Pull Request を紐づけて示す」は未達である。実装を TASK-43 に切り出し、AC #4 は未チェックのまま残す。

### PR URL 抽出を interpretation 層へ移した（[P2]）

doc-6 §4 の PR 抽出の入力は References だけで、コミット検索（doc-6 §3）だけが TASK-ID を鍵に取る。当初は両方を `task_history_read`（TASK-ID 鍵）に載せていたため、TASK-ID を読めない解析不能タスクでは PR 抽出まで止まり、References を未分離で出すことになっていた。これは doc-4 §5 の「判別できたフィールドは活かす」に反する。抽出を `TaskInterpretation.pull_requests`（doc-6 §4 の規則自体は `history.rs` に 1 か所のまま）へ移し、スナップショットと一緒に届くようにした。結果として:

- 解析不能タスクでも PR 区画と References 区画が分離される（doc-8 §4 がどのタスクでも成立）。
- `TaskHistory` は Git を要する部分（`commits`・`remote`）だけになり、境界上の PR 一覧の二重化も消えた。
- 詳細画面の参照分離は同期関数になり、履歴読み取りの状態に依存しなくなった。

### 履歴 state を選択タスクに結び付けた（[P2]）

`historyRead` に `historyKey`（slug と TASK-ID の JSON 直列化）を持たせ、パネルは現在の選択と一致する読み取りだけを表示する。選択を変えた瞬間に key が変わるので前タスクのコミットが残らず、選択が動いた後に届いた応答は破棄する。

### App.svelte の NUL バイトを除去（[P2]）

`historyKey` の区切りに実 NUL バイトを使っていたため Git が Svelte ソース全体を binary と判定し、行差分が出なくなっていた。`JSON.stringify` による直列化に置き換えた（衝突しない・ASCII のみ）。`git diff main -- src/App.svelte` は行差分に戻っている。
<!-- SECTION:NOTES:END -->
