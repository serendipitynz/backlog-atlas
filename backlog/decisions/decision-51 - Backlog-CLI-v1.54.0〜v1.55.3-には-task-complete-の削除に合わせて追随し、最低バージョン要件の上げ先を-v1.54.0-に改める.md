---
id: decision-51
title: >-
  Backlog CLI v1.54.0〜v1.55.3 には task complete の削除に合わせて追随し、最低バージョン要件の上げ先を
  v1.54.0 に改める
date: '2026-11-11 02:42'
status: accepted
---
## Context

Backlog CLI は v1.53.0 のあと、v1.54.0（2026-10-16）・v1.55.0（2026-10-20）・v1.55.1・v1.55.2・v1.55.3（2026-10-21〜23）を公開した。
最低バージョン要件は v1.50.1 で（decision-7）、decision-48 §1 がそれを v1.51.0 へ上げると決めたが、引き上げ（TASK-208）はまだ行われていない。
上限は固定しておらず、README は最新版の CLI でよいと案内している。したがって、いま CLI を入れた利用者は v1.55.3 を使っている。

v1.54.0 は破壊的変更を含む版で、`task complete` を削除した。Atlas の完了整理（doc-5 §3）はこのサブコマンドを発行する。
本決定は、decision-48 と同じく、これらの版が開いた手段と値のうち何を Atlas へ取り込むか（decision-48 の語で **追随** するか）と、
最低バージョン要件をどこへ上げるかを決める（TASK-213）。

### 実測（2026-11-11、macOS）

v1.50.1・v1.51.0・v1.52.0・v1.53.0・v1.54.0・v1.55.3 を使い捨てのディレクトリへ並べて導入し、decision-48 の Consequences が
次の版のために定めた形で測った。全サブコマンドの help のオプション集合の差、Atlas が発行する形の操作列の出力比較、読み取り層での健全性の 3 つである。

- **オプション集合**: 削除は `task complete` の 1 つだけだった。増えたものは次のとおり。
  - v1.54.0: `task restore`・`task delete`、`doc archive`・`doc restore`・`doc delete`、`decision archive`・`decision restore`・
    `decision delete`・`decision edit`（オプションは `--status` と `--plain` だけ）、`task edit` と `draft edit` の `--add-doc`・`--remove-doc`。
  - v1.55.0〜v1.55.3: `draft list --json`。
- **Atlas が発行するもの**: `update.rs` の `allowed_options` が持つ 36 オプションと 13 サブコマンドは、`task complete` を除いて
  v1.53.0・v1.54.0・v1.55.3 のすべてにあった。`milestone` のサブコマンドは今も add・rename・remove・archive・list で、説明を書く手段は無い。
  `decision` に `edit` が入ったが、書けるのは status だけで、本文を書く手段は今も無い。decision-21 の例外と、AGENTS の decision 直接編集の根拠は保たれている。
- **`task complete`**: v1.54.0 と v1.55.3 では、status によらず終了コード 1 で拒まれ、ファイルは動かない。stderr は
  `backlog task complete was removed. Use backlog task archive <id>.` の 1 行である。v1.53.0 以前は、Done のタスクを `completed/` へ移す。
- **Done のタスクへの `task archive`**: v1.50.1・v1.51.0・v1.52.0・v1.53.0 のすべてで終了コード 1 で拒まれる。stderr は
  `Task TASK-N is Done. Done tasks should be completed, not archived. Use: backlog task complete TASK-N` である。v1.54.0 以降は status によらず成功する。
  doc-5 §3 と doc-8 §6.5 は「status を問わず成功」と書いていたが、これは実測基準版の v1.50.1 でも偽だった。decision-48 の操作列は
  非 Done のタスクだけをアーカイブしていたので、この違いを通らなかった。
- **アーカイブ時の id とリンク**: v1.53.0 以前の `task archive` は id を解放する。後から作ったタスクは同じ id を受け取り、`archive/tasks/` と
  `tasks/` に同じ id のファイルが 1 件ずつ並ぶ。TASK-205 の語で、同じ id の 2 件である。ほかのタスクの References と dependencies からも、その id は消える。
  v1.54.0 以降は id を予約したままにし、References と dependencies も残す。
- **同じ id の 2 件への ID 指定**: v1.54.0 以降の CLI は、同じ id の 2 件があるとき、その id を指定したコマンドだけを
  `Task ID TASK-N is ambiguous; 2 files match:` で始まる stderr と終了コード 1 で拒む。stderr は 2 つのファイルの場所を挙げ、
  `backlog doctor` を勧め、何も書かなかったことを述べる。重複していない id のコマンドは通る。v1.53.0 は両方とも通す。
  `backlog doctor --fix --yes` は、アーカイブ側のファイルに新しい id を振り直して重複を解く。この台帳のコピーに v1.55.3 の `backlog doctor` を掛けたところ、重複は見つからなかった。
- **`completed/` の移行**: v1.54.0 以降では `completed/` は使われない。v1.53.0 で `completed/` に入ったタスクを含むルートに v1.55.3 の
  `doctor --fix --yes` を掛けると、そのタスクは `archive/tasks/` へ移る。ファイル名と id は変わらない。移行後のルートを読み取り層に通すと、
  そのタスクは保存区分 archive・status Done として読まれ、縮退は無かった。
- **文書と decision のアーカイブ**: v1.55.3 の `doc archive` と `decision archive` は、ファイルを `archive/docs/` と `archive/decisions/` へ移す。
  読み取り層はこの 2 つを読まない。アーカイブした文書と decision は、縮退も未対応ファイルの報告も起こさずに、Atlas の表示から消える。
- **書かれるファイル**（日付は値だけ伏せて比べた）: v1.50.1 と v1.53.0 は、操作列の結果がバイト単位まで一致した。v1.53.0 と v1.54.0 の差は、
  上のアーカイブの 2 点（id の解放と、References・dependencies の除去）だけだった。v1.54.0 と v1.55.3 の差は 2 つある。
  1 つは、`created_date`・`updated_date` が `'YYYY-MM-DD HH:MM'` から `'YYYY-MM-DDTHH:MM:SSZ'` に変わったことである。
  もう 1 つは、References の URL に引用符が付かなくなったことで、読み取り層の結果は変わらない。

### 画面に出ていること

Done のタスクには、どの版の CLI でも、押せるのに必ず失敗する操作が 1 つ出ている。`edit.ts` の `transitionOffers` は、アーカイブを
status によらず押せる状態で出し、完了整理を Done のときだけ押せる状態で出している。v1.53.0 以前では Done のタスクのアーカイブが拒まれ、
v1.54.0 以降では完了整理が拒まれる。どちらの失敗も doc-5 §5 の CLI 失敗として、CLI の stderr を添えた 1 行で画面に出る。成功と誤って報告されることは無い。

## Decision

### 1. 最低バージョン要件の上げ先を v1.54.0 に改める

decision-48 §1 は上げ先を v1.51.0 としていた。本決定はそれを v1.54.0 に改める。上げる理由（draft の内容編集、decision-48 §2）は変えない。
上げ先を選ぶ原則も変えない。Atlas が必要とする手段を持つ最初の版を選ぶ、という原則である。必要な手段に、Done のタスクを盤面から外す操作が加わった。
それができる版は v1.53.0 以前では `task complete` だけで、v1.54.0 以降では `task archive` だけである。両方の版域を 1 つの操作写像で正しく扱える
発行は無い。v1.54.0 は draft edit も持つので、TASK-209 の前提も満たす。

v1.55.x へは上げない。v1.55.0〜v1.55.3 が足したのは、`draft list --json`、未知の frontmatter の保持、タイムスタンプの書式、依存と証明書の更新で、
Atlas が書くための手段は v1.54.0 と同じである。v1.55.x へ上げると、何も得ずに v1.54.x の利用者を切ることになる。

引き上げは本決定の作業ではなく、TASK-208 が decision-27 の手順で行う。v1.50.x〜v1.53.x の利用者は、最低バージョン要件に届かない CLI として
縮退の対象になる。

採らなかった案は 2 つある。

- **版で操作写像を分ける**（v1.53.x 以下では完了整理を出し、v1.54.0 以上ではアーカイブを出す）: Atlas の操作写像は `MIN_VERSION` に対して
  1 つだけ固定されている（doc-5 §3、`update.rs`）。版ごとに写像を持つと、許可オプション・記録済みの wire payload・検査が版の数だけ要る。
  v1.53.x の利用者は、README が示す導入コマンドを再び実行すれば v1.54.0 以降へ移れる。
- **必ず失敗する側を押せなくするだけにする**: 最低バージョン要件は変わらず、利用者が入れる最新版では完了整理が常に押せない控えとして残る。
  doc-11 §5 は押せない控えを画面に置くことを禁じている（TASK-123）。

### 2. 完了整理を画面と操作写像から取り除く

最低バージョン要件が v1.54.0 になった後には、完了整理は動作保証の範囲のどの版でも失敗する。`update.rs` の `TaskComplete`、`wire.ts`、
`edit.ts` の `transitionOffers`、文言表の両言語から取り除き、doc-5 §3 の表と doc-8 §6.5 から行を落とす。TASK-215 が、TASK-208 の後に行う。

TASK-208 と TASK-215 は同じリリースに入れる。片方だけを含むタグは打たない。TASK-208 だけが入った状態では完了整理が動作保証のどの版でも失敗し、
TASK-215 だけが入った状態では v1.53.x 以下で Done のタスクを閉じる手段が無くなる。

### 3. アーカイブを status によらず提供する

v1.54.0 以降の `task archive` は status によらず成功し、id と References・dependencies を保つ。アーカイブは今の形のまま、status によらず
押せる状態で出す。確認文と効果の説明を v1.54.0 以降の挙動に合わせるのは TASK-215 が行う。

### 4. 読み取り層は `completed/` を読み続ける

v1.54.0 以降の CLI は `completed/` を作らないが、`backlog doctor --fix` を掛けていない既存のルートには残っている。読み取り層は今のまま
`completed/` を保存区分 completed として読む。doc-4 は変えない。

Atlas は `backlog doctor --fix` を発行しない。ルート全体のファイルを移し、id を振り直すことがある修復であり、1 つの管理ファイルを照合して
1 つの操作を発行する doc-5 §3 の写像にも、doc-9 §4 の更新前競合の検出にも乗らない。

### 5. 同じ id の 2 件は、CLI の拒否をそのまま画面に出す

v1.54.0 以降の CLI は、同じ id の 2 件の id を指定したコマンドを終了コード 1 で拒み、stderr で `backlog doctor` を勧める。
Atlas はこれを doc-5 §5 の CLI 失敗として扱い、stderr を添えた 1 行で画面に出す。それ以上の扱いは足さない。
同じ id の 2 件に対する Atlas 自身の選択と項目単位操作の扱いは TASK-205 が持つ。

### 6. 取り込まないもの

v1.54.0〜v1.55.3 が開いたもののうち、上の 5 項で扱わなかったものは取り込まない。

- **`task restore`・`task delete`（v1.54.0）**: Atlas はアーカイブを戻す操作も、タスクを消す操作も持たない。doc-8 §6.5 は、
  5 件の状態遷移に押す前の状態へ戻せるものが無いことを 2026-08-11 の help で確かめているが、`task restore` が入った版では CLI については偽になる。Atlas が戻す操作を持つかは
  CLI の版とは別の製品判断なので、ここでは決めない。その判断までは、doc-8 §6.5 の記述は Atlas の画面についての記述として読む。
- **`doc archive`・`decision archive` とその restore・delete（v1.54.0）**: Atlas は文書と decision をアーカイブしない。読み取り層は
  `archive/docs/`・`archive/decisions/` を読まないので、CLI でアーカイブしたものは Atlas の表示から消える。それを読むかどうかも別の判断とする。
- **`decision edit`（v1.54.0）**: Atlas の画面に decision の status を編集する操作は無い。本文を書く手段は今も無いので、AGENTS の decision 直接編集の規則は変わらない。
  ただし AGENTS の「`backlog decision` has no `update`/`edit`」は、最低バージョン要件が v1.54.0 になった時点で偽になる。TASK-208 が、
  decision-27 の実測註の測り直しとして書き直す。
- **`--add-doc`・`--remove-doc`（v1.54.0）**: Atlas は documentation の欄を書く更新操作を持たない（decision-48 §7 の `--doc` と同じ扱い）。
- **`draft list --json`（v1.55.0）と、一覧の並び順・ページの変更（v1.54.0）**: Atlas の更新層は list も search も呼ばない（decision-48 §7）。
- **あいまいな節境界を持つ置換の拒否（v1.54.0）**: Atlas が拒否を引き起こす入力は、予約マーカー行を含む本文である。TASK-211 が CLI の各版の
  認識規則を測るときに、v1.54.0 以降も測る。
- **未知の frontmatter の保持（v1.55.0）**: Atlas は CLI が知らない frontmatter を書かない。
- **タイムスタンプの書式（v1.55.0）**: 本決定の範囲外とする。v1.55.0 以降が書く `'YYYY-MM-DDTHH:MM:SSZ'` を Atlas の更新期間の絞り込みが
  解析できず、該当タスクが黙って除かれる。これは最低バージョン要件と関係なく、どの書き手の値にも当てはまる読み取り側の不具合なので、TASK-214 が直す。

## Consequences

- 望ましい帰結
  - Done のタスクに、押せるのに必ず失敗する操作が出なくなる（TASK-208 と TASK-215 が入った後）。
  - 最低バージョン要件の引き上げと decision-27 の測り直しが 1 回で済む。v1.51.0 へ上げた後に v1.54.0 へもう一度上げることにならない。
  - v1.54.0 以降のアーカイブは id とリンクを保つので、Atlas の操作によって新しく同じ id の 2 件が生まれることは無くなる。
- 費用・制約
  - v1.50.x〜v1.53.x の利用者は、最低バージョン要件に届かない CLI として縮退の対象になる。decision-48 が見込んだ v1.50.x だけでなく、
    v1.51.x〜v1.53.x の利用者も含む。
  - TASK-208 と TASK-215 の間は、main の上で完了整理が動作保証のどの版でも失敗する。リリースでは §2 の規則がこれを閉じる。
  - 完了整理で `completed/` へ移す経路は無くなる。v1.54.0 以降の CLI が、完了した作業は Done にしてからアーカイブすることを求めているので、
    Atlas もそれに合わせる。
- 後続への影響
  - decision-48 §1 は、上げ先について本決定に置き換えられた。decision-48 にその旨の改訂節を足した。
  - doc-5 §3 の表と §3.2、doc-8 §6.5 の「status を問わず成功」を訂正した。doc-5 §3.7 が v1.53.0 から v1.55.3 までの版差記録を持つ。
  - TASK-208（上げ先を v1.54.0 に改めた）→ TASK-215（完了整理を取り除く）の順に依存する。TASK-209 は引き続き TASK-208 に依存する。
    TASK-214（日付の書式）は版に依らず、いつでも着手できる。
  - 次の版が出たときは、decision-48 と本決定の実測と同じ形で測る。操作列には、Done のタスクのアーカイブを含める。
    本決定の実測が示したとおり、非 Done のタスクだけを流すと、status によって結果が変わる操作の違いを通らない。
