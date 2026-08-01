---
id: doc-5
title: Backlog 更新アダプター 設計
type: specification
created_date: '2026-07-21 10:05'
updated_date: '2026-08-01 09:11'
---
# Backlog 更新アダプター 設計

TASK-9 の設計。用語は [doc-1](doc-1)・[doc-2](doc-2) に従い、本書で導入する語は初出に定義を置く。
前提は decision-1（Tauri/Rust）・decision-2（読み取りは Backlog 管理ファイルの直接解析、更新は Backlog CLI へ委譲）・doc-3（プロジェクト台帳）・doc-4（読み取り層）。

## 1. 用語

- **更新操作** … タスク・文書・マイルストーンの内容を変える Atlas 上の 1 意図（作成・更新・status 変更など）。
- **操作写像** … 更新操作を Backlog CLI のサブコマンドと引数配列へ対応づける定義。
- **CLI 失敗** … Backlog CLI プロセスが非ゼロ終了コードで終わる、または起動に失敗する事象。
- **再読込契機** … CLI 成功による管理ファイル変化を、読み取り層で読み直すべき時点。

## 2. 位置づけと責務

**Backlog 更新アダプター**（doc-2）は、Atlas の更新操作を、対象プロジェクトを作業ディレクトリとする Backlog CLI 呼び出しへ変換する部分である。読み取り層（doc-4）と経路を分け、次を担う。

1. 更新操作を受け取り、対象プロジェクトと引数を確定する。
2. 操作写像により、Backlog CLI のサブコマンドと引数配列を組み立てる。
3. 対象プロジェクトのプロジェクトルート（doc-3 の台帳エントリ）を作業ディレクトリとして CLI を実行する。
4. 終了コードと出力から成否を判定し、成功時は再読込契機を発火する。

アダプターは管理対象 Markdown を直接書き換えない。書き換えるのは Backlog CLI であり、アダプターはその呼び出しに徹する（decision-2・AGENTS）。正本は各プロジェクトの管理ファイルに残る。

## 3. 操作写像

対象操作ごとに、Backlog CLI のサブコマンドと引数配列を定義する。引数はすべて配列要素として渡し、シェル文字列へ連結しない（4 章）。CLI は現行 v1.48.0 を動作確認済み範囲とする（decision-2 のサポート範囲に準ずる）。

| 更新操作 | サブコマンド | 主な引数（配列要素） |
|---|---|---|
| タスク作成 | `task create` | `<title>`、`-d <description>`、`-s <status>`、`-l <labels>`、`--priority <p>`、`-m <milestone>`、`--ac <criteria>`（複数可）、`-a <assignee>`、`--plan <text>`、`--notes <text>`、`--ref <reference>`（複数可）、`--depends-on <taskIds>` |
| タスク編集（内容） | `task edit` | `<taskId>`、`-t <title>`、`-d <description>`、`--priority <p>`、`-m <milestone>`、`-a <assignee>` |
| タスク status 変更 | `task edit` | `<taskId>`、`-s <status>` |
| ラベル増減 | `task edit` | `<taskId>`、`--add-label <labels>` / `--remove-label <labels>`（複数のラベルは 1 個のカンマ区切り値で渡す。フラグの繰り返しは版によって意味が違う、3.4） |
| AC 増減・チェック | `task edit` | `<taskId>`、`--ac <text>` / `--remove-ac <index>` / `--check-ac <index>` / `--uncheck-ac <index>` |
| AC 差し替え（全体置換） | `task edit`（1 呼び出し） | `<taskId>`、既存全 index の `--remove-ac <index>` ＋ 新項目ごとの `--ac <text>` ＋ 完了項目の `--check-ac <newIndex>`（複合。`--acceptance-criteria` 単体は `--check-ac` と併用できず完了状態を表せないため使わない、3.1） |
| References 編集（非空全置換） | `task edit` | `<taskId>`、`--ref <reference>`（渡した非空集合で全置換、複数可。空集合へはできない、3.1） |
| 実装計画・ノート | `task edit` | `<taskId>`、`--plan <text>` / `--notes <text>` / `--append-notes <text>` |
| 依存の設定（非空全置換） | `task edit` | `<taskId>`、`--depends-on <taskIds>`（渡した非空集合でカンマ区切り全置換。空集合へはできない、3.1） |
| draft 昇格（tasks へ） | `draft promote` | `<taskId>`（`DRAFT-N`） |
| draft アーカイブ | `draft archive` | `<taskId>`（`DRAFT-N`） |
| タスクの draft 差し戻し | `task demote` | `<taskId>`（`TASK-N`。active → draft） |
| タスクアーカイブ | `task archive` | `<taskId>`（`TASK-N`。active → `archive/tasks`。status を問わず成功） |
| 完了整理 | `task complete` | `<taskId>`（`TASK-N`。**status が `Done` のときのみ**成功。active → `completed`。非 Done では「is not Done」で失敗、5 章） |
| 文書作成 | `doc create` | `<title>`、`-t <type>`（readme/guide/specification/other）、`-p <path>` |
| 文書更新 | `doc update` | `<docId>`、`--title <title>` / `--content <markdown>`（本文全置換） / `-t <type>` / `-p <path>` / `--tags <tags>` |
| マイルストーン作成 | `milestone add` | `<name>`、`-d <description>`（説明は作成時のみ設定可） |
| マイルストーン改称 | `milestone rename` | `<from>`、`<to>`、任意 `--no-update-tasks` |
| マイルストーン削除 | `milestone remove` | `<name>`、`--task-handling <clear\|keep\|reassign>`、reassign 時 `--reassign-to <milestone>` |
| マイルストーンアーカイブ | `milestone archive` | `<name>` |

- **作成時に渡せる引数（2026-07-29 訂正）**: 本書の初版はタスク作成を title・description・status・labels・priority・milestone・AC に限ると記述していたが、v1.48.0 の `task create` は `-a`・`--plan`・`--notes`・`--ref`・`--depends-on` も受け取り、作成された管理ファイルへ保存する（一時プロジェクトで作成し `task view` で全項目の保持を確認）。上表の作成行はこの実測に合わせている。**GUI が作成フォームで受け取る範囲は、CLI が受け取れる範囲より狭くてよい**が、その場合に書く理由は「CLI に手段が無い」ではなく製品判断である（doc-10 §7）。**作成時に渡す範囲**（Atlas が `task create` の 1 回の呼び出しへ載せる項目集合。CLI が受け取れる範囲とは別）は、TASK-57 で title・description・status・labels・priority・milestone・AC に確定した。実装計画・ノート・参照・依存を作成時に出さないのは、作成時点で要るのは識別と分類であり、これらは作業の進行に伴って増える項目で編集経路（doc-8 §6）を持つためである。境界の型（`update.rs` の `TaskCreate`・`manage.ts` の `TaskCreateInput`）もこの範囲に合わせる。
- **assignee の写像（2026-07-29 訂正）**: `task create` と `task edit` はいずれも `-a <assignee>` を受け取る（実測）。本書の初版は作成行・編集行のどちらにも書いていなかったため、現行の `TaskEdit` 型にも assignee のフィールドが無く、GUI から assignee を設定・変更する経路が存在しなかった。上表に加えたのはこの穴を閉じるためで、**TASK-57 は編集側で閉じると決めた**: assignee を設定・変更できる GUI 上の場所はタスク詳細の編集セッション 1 箇所とし（doc-8 §6）、`TaskEdit` に assignee を持たせて `--assignee` へ通す。作成フォームには出さない（作成時にだけ設定できて後から変えられない経路を作らないため。doc-10 §7）。値は 1 件で、集合ではない: `-a` を複数回渡しても最後の 1 値だけが残り、カンマ区切りの値は分割されず 1 件の文字列として保存され、書き込みは frontmatter の assignee 一覧を渡した 1 件だけの一覧へ置き換える（**assignee の 1 件化**。実測）。複数 assignee のタスクを編集側で保存すると 1 件になるため、GUI は保存前にその旨を示す。
- **`-s <status>` の検査**: `-s` は対象プロジェクトの `config.yml` の `statuses` に宣言済みの値だけを受け取る。未宣言の値は `Invalid status: <値>. Valid statuses are: …` を出して終了コード 1 で失敗する（実測）。省略時は `default_status` が入る。正準ステータス列名（decision-4）と宣言済み status は一致するとは限らない点に注意する。`backlog init --defaults` が宣言するのは `To Do` / `In Progress` / `Done` の 3 つで、`In Review` は宣言されない（実測）。列から作成時の status を決める規則は doc-7 §4.1。
- 操作写像は「1 更新操作 → 1 サブコマンド呼び出し」を基本とする。1 画面操作が複数フィールドを同時に変える場合は、`task edit`・`doc update` の複数オプションを 1 呼び出しにまとめられる範囲でまとめ、まとめられない操作（別サブコマンドが要る）だけ複数回に分ける。
- **参照の全置換（`--ref`）**: v1.48.0 の `task edit --ref` は、渡した**非空**の参照集合で**全置換**する（既存へ追加ではない）。アダプターは、読み取り層（doc-4）が持つ現在の参照を基に、追加・削除後の**全集合**を組み立てて渡す。1 件だけ加える PR URL 登録（doc-8）でも、既存参照を含めた全集合を `--ref` へ渡す。ただし空集合へはできず（`--ref ""` で消えない、3.1）、最後の 1 件を消す操作は CLI から提供しない。`--content`（`doc update`、本文全置換）も単一オプションで全置換する。
- **依存の全置換（`--depends-on`）**: v1.48.0 の `task edit --depends-on` は、渡した非空集合でカンマ区切り全置換する（既存へ追加ではない）。`--ref` と同様に空集合へはできず、`--depends-on ""` は終了コード 0 を返すだけで既存依存を消さない（実測）。加えて各値に `task_prefix` を前置して実在検証するため、`none` 等のセンチネルは不在エラーになる。最後の 1 件を消して依存を空にする操作は CLI から提供しない（3.1）。
- **AC の差し替え（複合）**: 完了状態を伴う AC 全体の差し替えは単一オプションでは行えない（`--acceptance-criteria` は全置換するが `--check-ac` と併用できない、3.1）。AC 全体を置き換えるときは、1 回の `task edit` に既存全 index の `--remove-ac`・新項目の `--ac`・完了の `--check-ac`（差し替え後の新 index を指す）を併せて渡す。AC の 1 項目単位の増減・チェックだけを行う場合は、`--ac`／`--remove-ac`／`--check-ac` を単独で使い、差し替えとは使い分ける。

### 3.1 v1.48.0 に存在しない更新操作

動作確認版 v1.48.0 の CLI を実地確認した（`doc --help`・`milestone --help` と各サブコマンドの `--help`）。次の操作は CLI に対応サブコマンドが無い。

- **マイルストーン説明の更新**: `milestone` には `update`/`edit` サブコマンドが無い。説明（description）は `milestone add -d` で作成時にのみ設定でき、作成後に説明だけを更新する経路は無い。`rename` は title（名称）の変更に限られ、説明は変えない。
- **マイルストーン任意フィールドの編集**: 上記のとおり、作成後に変更できるのは名称（`rename`）・存在（`remove`/`archive`）・紐づくタスクの扱い（`remove --task-handling`）に限られる。
- 文書側は `doc update` が title・本文（`--content` は全置換）・type・path・tags を更新でき、部分更新（本文の一部差し替え・追記）や frontmatter の任意フィールド更新には対応しない。
- **完了状態を伴う AC 全体差し替えを単一オプションで行うこと**: v1.48.0 の `--acceptance-criteria` は既存 AC を全置換する（実測。v1.47.1 では名称に反して追加動作だった。TASK-58 で測り直した版差）。ただしこのオプションは `--ac`・`--remove-ac`・`--check-ac`・`--uncheck-ac` と併用できず、併用すると `Cannot combine --acceptance-criteria with …` を出して終了コード 1 で失敗する（実測）。差し替え後の項目のどれが完了かは `--check-ac` でしか表せないため、**完了状態を伴う差し替えは単一オプションでは行えない**。AC 全体の置き換えは引き続き、1 回の `task edit` に既存全 index の `--remove-ac`・新項目の `--ac`・完了の `--check-ac` を併せて渡す複合操作で行う（3 章の表）。複合は 1 呼び出しなので差し替えが分割されない利点も併せ持つ。
- **参照を空集合にする操作**: `--ref` は非空集合を渡せば全置換するが、空文字 `--ref ""` を渡しても既存参照は消えない（実測）。最後の 1 件を消して参照を空にする操作は v1.48.0 の CLI から行えない。GUI では最後の参照削除を無効化し、必要なら外部エディタ経路（doc-8）へ案内する。
- **assignee を解除する操作**: `-a` は非空の値を渡せば設定・付け替えできるが、`-a ""` は終了コード 0 を返すだけで既存の assignee を消さない（実測。`--ref ""`・`--depends-on ""` と同型の沈黙無変更）。assignee を空にする操作は v1.48.0 の CLI から行えない。GUI では空欄を「変更しない」として扱い、解除が要る場合は外部エディタ経路（doc-8）へ案内する。
- **依存を空集合にする操作**: `--depends-on` も非空集合を渡せば全置換するが、`--depends-on ""` は終了コード 0 でも既存依存を消さない（実測。`--ref ""` と同型の沈黙無変更）。さらに `--depends-on` は各値に `task_prefix` を前置して実在検証するため、空を意味するセンチネル値も渡せない。最後の 1 件を消して依存を空にする操作は v1.48.0 の CLI から行えない。GUI では最後の依存削除を無効化し、必要なら外部エディタ経路（doc-8）へ案内する。

これらは decision-2 の「更新は Backlog CLI へ委譲」を保つ限り、CLI が提供するまで Atlas も提供しない。CLI 版が上がって対応サブコマンドが増えた場合に操作写像へ追加する（3 章末の版検査に従う）。

### 3.2 GUI が提供する更新操作の範囲

上記制約から、タスク詳細（doc-8）・マイルストーン操作の GUI が提供する更新操作を次に限る。

- **タスク**: 3 章の `task create`/`task edit` 写像に載る操作（title・description・status・ラベル増減・AC 増減/チェック・AC 差し替え・References 非空全置換・priority・milestone・assignee・dependencies・実装計画/ノート等）。assignee は編集側だけが扱い、設定・付け替えのみを提供する（解除は不可、3.1）。References・dependencies の非空全置換は既存値を含めた非空全集合を渡す（3 章。いずれも空集合化は不可）。AC 差し替えは複合操作（`--remove-ac`＋`--ac`＋`--check-ac` を 1 呼び出し、3 章）。
- **draft**: 状態遷移（`draft promote`／`draft archive`／`task demote`）のみを提供し、draft の内容編集は GUI に出さない（3.3）。
- **active の状態遷移**: active タスクには内容編集に加え、`task demote`（→ draft）・`task archive`（→ `archive/tasks`、status を問わず可）・`task complete`（→ `completed`、status が `Done` のときのみ可）を提供する。`task complete` は非 Done では失敗するため（5 章）、Done のタスクに限って能動化する。
- **保存区分別の可否**: 上記タスク操作は保存区分（doc-4 の 3.4）が active のタスクに適用する。completed・archive のタスクは `task edit` が `not found`（終了コード 1）になるため、CLI による内容編集を提供しない（詳細画面での可否は doc-8 の 6.5）。
- **文書**: 作成（title・type・path）と更新（title・本文全置換・type・path・tags）。本文は全置換のみで、部分編集は「編集後の全文を `--content` で渡す」に帰着させる。
- **マイルストーン**: 作成（名称・作成時の説明）・改称（名称）・削除・アーカイブ。**作成後の説明編集は GUI に出さない**（CLI 経路が無いため）。GUI は「作成時に説明を入れる」入口だけを設け、既存マイルストーンの説明編集欄は設けない。制約由来であることが分かる表示にする。
- 管理対象 Markdown を GUI から直接書き換えない境界（doc-2）は保つ。CLI に無い操作を GUI 側の直接書き込みで代替しない。
- 各サブコマンドの正確なオプション名は、動作確認した CLI 版の `--help` を基準に固定する。版が上がってオプションが変わる場合は、操作写像を版ごとに検査し、未知オプションは実行前に検知して当該操作を拒否する（縮退。5 章）。
- taskId は当該プロジェクト内の TASK-ID（横断タスクID の右辺）を用いる。アダプターは対象プロジェクトを作業ディレクトリに固定するため、slug 前置は不要（doc-3 の 5.3）。

### 3.3 draft の更新操作範囲

draft（doc-4 の保存区分 draft。frontmatter の id は `DRAFT-N`）に対して GUI が提供する更新操作は、**保存区分を変える状態遷移だけ**に限り、draft の内容編集は提供しない。各遷移は保存先だけでなく id を変え、promote は status を変えることがある（v1.48.0 実測）。「保管状態のみを変える」ではない。

| 操作 | サブコマンド | 遷移前 → 遷移後（保存区分／id／status） |
|---|---|---|
| draft 昇格 | `draft promote <DRAFT-N>` | draft ／ `DRAFT-N` ／ status `Draft` → active ／ 新規 `TASK-M`（採番し直し） ／ 既定 status（`default_status`、例 `To Do`） |
| draft 昇格（demote 由来） | `draft promote <DRAFT-N>` | draft ／ `DRAFT-N` ／ 通常 status（例 `In Progress`） → active ／ 新規 `TASK-M`（採番し直し） ／ **遷移前の status を保持** |
| タスクの draft 差し戻し | `task demote <TASK-N>` | active ／ `TASK-N` ／ 任意 status → draft ／ 新規 `DRAFT-M`（採番し直し） ／ **遷移前の status を保持** |
| draft アーカイブ | `draft archive <DRAFT-N>` | draft ／ `DRAFT-N` ／ 任意 status → archive ／ `DRAFT-N`（保持） ／ status 保持 |

- promote・demote は保存先だけでなく id を付け替える（`DRAFT-N` ↔ `TASK-M`、番号も採番し直す）。promote の status 変化は**条件付き**で、status が `Draft` の draft のみ `default_status` へ変わり、通常 status を持つ draft（`task demote` 由来）は status を保持する（実測）。archive は id・status を保持して `archive/drafts` へ移す。したがって draft の status は一律 `Draft` ではない（`draft create` 直後だけが `Draft`。doc-4 の 3.4）。
- **内容編集は提供しない**: draft の title・description・AC・References 等の編集は GUI から提供しない。v1.48.0 の CLI には draft を対象にした `task edit` 相当が無いためで、decision-2 の CLI 委譲を保つ限り Atlas も提供できない。内容を編集したい場合は、`draft promote` で通常タスクにしてから `task edit` 系で編集するか、外部エディタ経路（doc-8）で直接編集する。
- **id と横断タスクID**: draft の横断タスクID 右辺は `DRAFT-N`（doc-3 の 5.1）。対象 ID は `draft promote`／`draft archive` が `DRAFT-N`、`task demote` が `TASK-N`。アダプターは対象プロジェクトを作業ディレクトリに固定するため slug 前置は不要（doc-3 の 5.3）。
- draft をスイムレーン／詳細に表示するか、既定でフィルタするかは doc-7（TASK-11）で扱う。本アダプターは表示可否に依らず、上記状態遷移だけを操作写像に載せる。

### 3.4 v1.47.1 から v1.48.0 で変わった挙動（TASK-58 実測）

最低バージョン要件を v1.48.0 へ上げた（decision-7）ので、本書の記述はすべて v1.48.0 の実測に基づく。それでも次の 3 点は、旧版で書かれた実装・doc を読み直すときに意味が反転するので記録に残す。2026-08-01 に使い捨ての Backlog ルートへ同じ操作列を流し、両版の出力と管理ファイルを差分比較して確認した。

- **`--acceptance-criteria` は追加動作から全置換へ変わった**（3.1）。旧版の「単体オプションでの AC 全体差し替えは無い」は v1.48.0 では成り立たない。それでも複合操作を使い続ける理由は完了状態を同じ呼び出しで表せないことであって、置換できないことではない。
- **`-l`／`--add-label`／`--remove-label` のフラグ繰り返しは、v1.47.1 が最後の 1 個だけを採り、v1.48.0 は全部を累積する。** 両版で同じ意味になる渡し方は 1 個のカンマ区切り値だけなので、アダプターは複数ラベルを必ずカンマ連結して 1 回で渡す。フラグを繰り返さない理由はこれであり、`--ac`・`--ref` が繰り返し可であることと非対称に見えるのはそのためである。
- **`--priority` の拒否メッセージが `high, medium, low` から `High, Medium, Low` へ変わった。** 受理される値は両版とも大小文字を区別せず、frontmatter へは渡した表記のまま書かれる（実測）。値域そのものは変わっていないので、GUI の選択肢（doc-8）は変えない。

v1.48.0 が新たに受け取るオプションのうち、Atlas が使わないものと理由:

- **`--clear-ac`／`--clear-labels`**: どちらも既存の手段（全 index の `--remove-ac`、全ラベルの `--remove-label`）で同じ結果になることを実測で確認した。操作写像を増やす利得が無い。
- **`--type`**（`task create`／`task edit`）: frontmatter に `type:` フィールドを書く。Atlas は Type を `kind:` ラベルから導出する（decision-5）ので、このフィールドを読まない。**この食い違いは TASK-110 で扱う。**

コマンド構成では `sequence` が削除され `doctor` が加わったが、どちらも本書の操作写像に現れないので影響しない。

## 4. 作業ディレクトリと引数配列渡し

- **作業ディレクトリ**: 対象プロジェクトのプロジェクトルート（doc-3 の台帳エントリ `project_root`）を作業ディレクトリに指定して CLI を起動する。Rust の `std::process::Command` の `current_dir` で与える（decision-1）。プロジェクトごとに CLI を常駐させず、更新操作ごとに固定サブコマンドで起動する。
- **引数配列渡し**: サブコマンドと各引数を `Command::arg`／`args` の配列要素として個別に渡す。利用者入力（タイトル・説明・ラベル値など）はシェルへ渡さず、配列の 1 要素として素通しする。シェル（`sh -c` 等）を介さないため、空白・記号・改行・シェルメタ文字を含む入力でも語分割・展開・注入が起きない（doc-2・AGENTS の「シェル文字列へ連結しない」の実装）。
- **実行ファイル解決の順序**（decision-16）: **実行ファイル解決の順序**とは、CLI のプロセスを起動する前に、どの絶対パスまたはプログラム名を `Command::new` へ渡すかを決める、上から順に試す規則の列を指す。順序は 3 段である。①アプリ設定 `backlog_cli`（実行ファイルの絶対パス。値があれば存在検査をせずそのまま使い、自動解決へ落とさない）②Windows で PATH 上に直接起動できる `backlog.exe` が無く、npm が置いた shim の所在からプラットフォーム別実行ファイル（`backlog.md-<platform>-<arch>` サブパッケージが持つ、インタプリタを介さず起動できる単一の実行ファイル）へ到達できる場合、その絶対パス ③プログラム名 `backlog`。macOS・Linux は ③ に到達し、利用者の PATH 上の `backlog` を呼ぶという従来の挙動になる。②は `.cmd`／`.ps1` を起動せず本物の実行ファイルを直接起動するので、インタプリタがチェーンへ戻らず、上の引数配列渡しの前提を崩さない。解決はこのアダプターの継ぎ目（`BacklogCli` の実装）の内側に閉じ、操作写像・作業ディレクトリ・引数配列渡しは呼び出し先の実体に依存しない。sidecar 同梱への切替時点は TASK-99（decision-7 の同梱検討契機）で決め、採る場合もこの順序の差し替えだけで済む。

## 5. CLI 失敗時の扱い

CLI 失敗（非ゼロ終了または起動失敗）を、更新の不成立として扱う。

- **成否判定**: プロセスの終了コードで判定する。0 を成功、非ゼロを失敗とする。起動自体の失敗（実行ファイル不在・権限不足など）も失敗に含める。
- **失敗時の状態**: 失敗した更新操作は、Atlas 側のドメインモデルを変更しない。CLI が管理ファイルを変えていない前提を、成否判定の後の再読込（次章）で裏取りする。標準エラー出力を失敗理由として保持し、利用者へ提示する（どのサブコマンド・どの対象が失敗したか）。
- **部分適用の回避**: 1 画面操作を複数サブコマンド呼び出しへ分ける場合、途中の呼び出しが失敗したら以降の呼び出しを行わず、そこまでの結果を再読込で観測できる状態にして失敗を報告する。アダプターは CLI をまたいだロールバックを持たない（CLI が正本を所有するため）。代わりに、失敗後は再読込で現状を正しく写し、利用者が続行/再試行を判断できるようにする。
- **未知オプション・未知サブコマンド**: 操作写像がサポート範囲外（版差でオプションが消えた等）と判定したら、CLI を起動せず操作を拒否する（縮退）。

## 6. 再読込契機

読み取りはファイル解析（decision-2）であり、更新は CLI 経由であるため、更新の結果はファイルを読み直して初めてドメインモデルへ入る。この読み直しの時点を再読込契機として定義する。

- **成功時の発火**: CLI 成功後、当該更新操作が触れた対象（タスク・文書・マイルストーンの属するルート、可能なら変更ファイル単位）について読み取り層の再読込を発火する。再読込の単位は doc-4 のドメインモデル再構築単位（ルート／ファイル）に合わせる。
- **失敗時**: CLI 失敗時は更新が成立していないため、原則として再読込を発火しない。ただし部分適用の疑いがある場合（複数呼び出しの途中失敗）は、現状を正しく写すため対象ルートの再読込を行い、実ファイルの状態をドメインモデルへ反映する。
- **外部変更との統合**: 同一 Backlog ルートを別ウィンドウ・別プロセスやファイル監視が更新する場合の競合検出・再読込は TASK-14 で設計する。本アダプターの成功後再読込は、その再読込機構と同じ経路に載せ、CLI 由来の変化も外部由来の変化も同一の読み直しとして扱えるようにする。

## 7. 後続への影響

- 競合検出とファイル監視による再読込の具体は TASK-14。本章の再読込契機はその機構へ載せる。
- 実行ファイル解決の順序は decision-16 が定める（TASK-60。Windows では npm が `backlog.exe` を置かないため、PATH 解決だけでは更新経路が全面発行不能になる）。sidecar 同梱の判断は TASK-99（decision-7 の同梱検討契機）で、採る場合も順序の差し替えだけで済む。
- タスク詳細画面（TASK-12）からの更新操作は本アダプターの操作写像を入口とする。
