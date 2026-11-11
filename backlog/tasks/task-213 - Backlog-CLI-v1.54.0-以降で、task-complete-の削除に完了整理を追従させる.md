---
id: TASK-213
title: Backlog CLI v1.54.0〜v1.55.3 への追随方針を決め、doc-5 の誤った実測記述を正す
status: In Review
assignee: []
created_date: '2026-11-11 02:17'
updated_date: '2026-11-11 02:47'
labels:
  - 'kind:bug'
milestone: m-4
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/releases/tag/v1.54.0'
  - 'https://github.com/MrLesk/Backlog.md/releases/tag/v1.55.0'
priority: high
ordinal: 204700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI は v1.53.0 のあと、v1.54.0（2026-10-16）・v1.55.0（2026-10-20）・v1.55.1〜v1.55.3（2026-10-21〜23）を公開した。v1.54.0 は破壊的変更を含み、task complete を削除した。Atlas の完了整理（doc-5 §3 の表、update.rs の TaskComplete）はこの task complete を発行している。README は最新版の CLI でよく、上限は決めていないと案内しているので、いま CLI を入れた利用者の完了整理は必ず失敗する。

2026-11-11 に、decision-48 と同じ形（全サブコマンドの help のオプション集合の差、Atlas が発行する形の操作列の出力比較、読み取り層での健全性）で 6 版を測った。結果は実装ノートにある。その中で、doc-5 §3 の「task archive は status を問わず成功」が実測基準版の v1.50.1 でも偽だったことも分かった。Done のタスクのアーカイブは v1.53.0 まで拒まれる。

本タスクは、v1.54.0〜v1.55.3 が開いた手段と値のうち何を Atlas へ取り込むかを、decision-48 の後継の decision として決める。あわせて doc-5 の誤った記述を正し、版差記録を足す。コードは変えない。

着手時（2026-11-11）にオーナーが決めたこと: 最低バージョン要件を v1.54.0 へ上げ、完了整理を画面から下ろし、アーカイブを status によらず提供する。作業は 3 つの PR に分ける。本タスクが decision と doc を書く。TASK-208 が上げ先を v1.54.0 に替えて最低バージョン要件を上げる。TASK-215 が画面を変える。v1.55.0 から日付の書式が変わったことで更新期間の絞り込みが壊れている件は、TASK-214 として別に起票した。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 v1.54.0 と v1.55.3 で task complete の挙動（終了コード・出力・ファイルが動くか）を実測し、記録してある
- [x] #2 doc-5 §3 の操作写像の各行を v1.55.3 で発行し、v1.53.0 と結果が違う行が版差記録になっている
- [x] #3 完了整理の扱いの決定が decision（新規、または decision-7・decision-48 の改訂）と doc-5 に書かれている
- [x] #4 completed/ を backlog doctor --fix で archive/tasks へ移したルートを、Atlas が縮退なしに読めることを確かめてある
- [x] #5 TASK-208 の上げ先が v1.54.0 に改められ、TASK-215 が TASK-208 に依存している
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測（2026-11-11、macOS）

v1.50.1・v1.51.0・v1.52.0・v1.53.0・v1.54.0・v1.55.3 を使い捨てのディレクトリへ並べて導入し、decision-48 と同じ形で測った（全サブコマンドの help のオプション集合の差、Atlas が発行する形の操作列の出力比較、読み取り層での健全性）。

### オプション集合
- help の画面数は v1.53.0 の 50 から v1.54.0 で 58 になった（数え方は help を除いたもの）。削除は task complete の 1 画面だけである。
- v1.54.0 で増えたもの: task restore・task delete、doc archive・doc restore・doc delete、decision archive・decision restore・decision delete・decision edit（--status と --plain だけ）、task edit と draft edit の --add-doc・--remove-doc。
- v1.55.0 から v1.55.3 で増えたもの: draft list --json。
- Atlas が発行する 13 サブコマンド・36 オプションは、task complete を除いて 3 版（v1.53.0・v1.54.0・v1.55.3）すべてにあった。decision create のオプションは今も --status と --plain だけで、decision の本文を書く手段は無い。

### task complete
- v1.54.0・v1.55.3 では status を問わず終了コード 1 になり、ファイルは動かない。stderr は `backlog task complete was removed. Use backlog task archive <id>.` である。Atlas の画面では commandFailed の 1 行として出る。成功と誤って報告されることは無い。
- v1.53.0 以前では、Done のタスクは終了コード 0 で completed/ へ移る。非 Done のタスクは `is not Done` で終了コード 1 になる。

### task archive（doc-5 §3 の記述が偽だった）
- Done のタスクに対する task archive は、v1.50.1・v1.51.0・v1.52.0・v1.53.0 のすべてで終了コード 1 になる。stderr は `Task TASK-N is Done. Done tasks should be completed, not archived. Use: backlog task complete TASK-N` である。v1.54.0 以降は終了コード 0 になる。
- doc-5 §3 の表と §3.2 の「status を問わず成功」は、実測基準版の v1.50.1 でも偽だった。decision-48 の操作列は非 Done のタスクだけをアーカイブしていたので、この差を通らなかった。
- その結果、Done のタスクには、どの版でも必ず失敗する終わらせ方が画面に 1 つ出ている。v1.53.0 以前ではアーカイブがそれにあたり、v1.54.0 以降では完了整理がそれにあたる。edit.ts の transitionOffers は、アーカイブを status によらず押せる状態で出し、完了整理を Done のときだけ押せる状態で出している。

### アーカイブ時の id とリンク
- v1.53.0 以前は、アーカイブすると id が解放され、次に作るタスクが同じ id を受け取る（操作列では archive/tasks/task-4 と tasks/task-4 が並んだ）。ほかのタスクの References と dependencies からも、その id が消える。
- v1.54.0 以降は id を予約したままにし、References と dependencies も残す。
- v1.54.0 以降の CLI は重複した id を検出し、その id を指定したコマンドだけを `Task ID TASK-N is ambiguous` で拒む（終了コード 1）。重複していない id のコマンドは通る。v1.53.0 は両方とも通す。
- `backlog doctor --fix --yes` は、アーカイブ側のファイルに新しい id を振り直して重複を解く。この台帳のコピーに v1.55.3 の doctor を掛けたところ、重複は見つからなかった。

### completed/ の移行（AC #5）
- v1.53.0 で completed/ に入ったタスクを含むルートに v1.55.3 の `doctor --fix --yes` を掛けると、そのタスクは archive/tasks へ移る。ファイル名と id は変わらない。対話端末が無いと `--yes` を求められる。
- 移行後のルートを読み取り層（ProjectState::open）に通すと、そのタスクは保存区分 archive・status Done として読まれ、縮退は無かった。

### 書かれるファイル（日付は値だけ伏せて比べた）
- v1.50.1 と v1.53.0 は、操作列の結果がバイト単位まで一致した。
- v1.53.0 と v1.54.0 の差は、上のアーカイブの 2 点（id の解放、References と dependencies の除去）だけだった。
- v1.54.0 と v1.55.3 の差は 2 つある。1 つは、created_date と updated_date が `'YYYY-MM-DD HH:MM'` から `'YYYY-MM-DDTHH:MM:SSZ'` に変わったこと。もう 1 つは、References の URL に引用符が付かなくなったことである。

### 日付の書式変更の影響（本タスクの範囲外の不具合）
- period.ts の localDay が受け付けるのは `YYYY-MM-DD` と `YYYY-MM-DD HH:MM[:SS]` だけである。period.test.ts は `2026-08-09T22:46:00Z` を解析できない値として拒むことを明示的に検査している。
- filter.ts の matchesUpdatedPeriod は、期間の端が 1 つでも入っていると、解析できないタスクを除く。そのため v1.55.0 以降で作成・編集したタスクは、更新期間の絞り込みから黙って消える。
- 並び順（swimlane.ts）は文字列のまま比べるので、2 つの書式が混ざると同じ日の中で前後が狂いうる。タスク詳細の見出しは値をそのまま出すので壊れない。

## 着手時の判断（2026-11-11、オーナー）

- 最低バージョン要件の上げ先を v1.54.0 にする。版で操作写像を分ける案と、必ず失敗する側を押せなくするだけの案は採らなかった。理由は decision-51 §1 に書いた。
- 作業を 3 つの PR に分ける。本タスクは decision と doc だけを書き、コードは変えない。TASK-208 は上げ先を v1.54.0 に改めて TASK-213 に依存させた。画面の変更は TASK-215 として起票し、TASK-208 に依存させた。TASK-209 の本文にあった「v1.51.0 になってから」も直した。
- 日付の書式の不具合は TASK-214 として別に起票した。最低バージョン要件と関係なく、先に直せる。

## 書いたもの

- decision-51 を新しく書いた。decision-48 には「上げ先の改訂」節を足した。対応表は本文より先に、TASK-213 の対応表 初版として確定した。
- doc-5: §3 の表のタスクアーカイブ行と §3.2 の active の状態遷移を訂正した。§3.6 の draft edit 行の上げ先を decision-51 に向けた。§3.7 に v1.53.0 から v1.55.3 までの版差記録を足した。
- doc-8 §6.5: active の項の「status を問わず実行できる」を訂正した。
- update.rs の TaskArchive の註（succeeds regardless of status）も v1.53.0 以前では偽だが、本タスクはコードを変えないので、TASK-215 の本文に直すよう書き足した。
- AGENTS の「backlog decision has no update/edit」は、最低バージョン要件が v1.54.0 になると偽になる。decision-51 §6 で、TASK-208 が書き直すと定めた。

## 検査

- pnpm test（54 ファイル・1386 件）、pnpm run check（0 errors）、pnpm run lint がすべて通った。pnpm run check が出す `_sandbox/app-check/vite.config.ts` の読み込みエラーは、変更を外した木でも出るもので、本タスクとは関係が無い。
- Rust のコードは変えていないので、cargo test と cargo clippy は回していない。読み取り層の確認には、scale.rs に一時的なテストを足して ProjectState::open のスナップショットを書き出し、確認後に元へ戻した（差分なし）。
<!-- SECTION:NOTES:END -->
