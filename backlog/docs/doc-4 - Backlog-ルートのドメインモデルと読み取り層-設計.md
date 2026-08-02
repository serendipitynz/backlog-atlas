---
id: doc-4
title: Backlog ルートのドメインモデルと読み取り層 設計
type: specification
created_date: '2026-07-21 09:36'
updated_date: '2026-07-22'
---
# Backlog ルートのドメインモデルと読み取り層 設計

TASK-5 の設計。用語は [doc-1](doc-1)・[doc-2](doc-2) に従い、本書で導入する語は初出に定義を置く。
前提は decision-1（Tauri/Rust）・decision-2（読み取りは Backlog 管理ファイルの直接解析、更新は Backlog CLI へ委譲、cross-branch は現在 checkout 限定）。

## 1. 用語

- **ドメインモデル** … Backlog 管理ファイルの内容を写した、Atlas 内部のメモリ上データ構造の型定義（タスク・設定・マイルストーン・文書）。
- **読み取り層** … Backlog 管理ファイルを解析してドメインモデルを構築する読み取り専用の処理層。書き込みは含まない。
- **kind ラベル** … frontmatter の labels のうち `kind:` 接頭辞を持つ要素（TASK-8）。
- **通常ラベル** … labels のうち kind ラベル以外の要素。
- **type フィールド** … Backlog CLI v1.48.0 の `--type` が frontmatter へ書く単一のスカラー値 `type:`（decision-20、TASK-110）。labels と並ぶ位置に書かれ、並びではなく 1 値しか持てない。
- **Type 導出元** … Atlas が Type 値を取り出す元になる frontmatter 上の場所（decision-20）。kind ラベルと type フィールドの 2 つ。
- **Type** … Type 導出元から導出し、通常ラベルと分離して表示する分類値（doc-2、導出規則は decision-5 と decision-20）。
- **タスク保存区分** … タスクファイルの走査元ディレクトリ（tasks / drafts / completed / archive）から決まる保管状態の分類（active / draft / completed / archive）。frontmatter の status（作業状態）とは独立の軸で、ファイルの置き場所だけで決まる（3.4）。

## 2. 読み取り層の位置づけと責務

読み取り層は、台帳エントリ（TASK-4）が指す各 Backlog ルートを入力に、次の順で処理する。

1. `config.yml` を解決し、status 定義・task_prefix・ディレクトリ構成を得る。
2. ディレクトリ（tasks / archive / completed / drafts / milestones / docs / decisions）を走査する。cross-branch は扱わず、現在 checkout のファイルのみを対象とする（decision-2）。
3. 各ファイルの frontmatter（YAML）と `<!-- SECTION:… -->` 区切り本文を解析する。
4. ドメインモデルの値を構築し、各タスクに走査元ルート由来のプロジェクト（TASK-4 の決定規則）と、走査元ディレクトリ由来のタスク保存区分（3.4）を付与する。

読み取り層は読み取り専用である。タスク・文書・マイルストーンの更新は Backlog 更新アダプター（Backlog CLI 委譲）が担い、本層とは経路を分ける（decision-2）。読み取り層は Type の**分離**まで行い、Type の**値の導出規則**は TASK-8 の確定を用いる（3.3）。

## 3. ドメインモデル

内部表現は「解析済みで、判別できた事実」と「未確定・不足の明示」を同居させる。破棄せず縮退表示（5 章）へ回すためである。

### 3.1 タスク

`config.yml` と frontmatter・SECTION から次を写す。

| ドメイン項目 | 由来 | 備考 |
|---|---|---|
| project | 走査元 Backlog ルート ↔ 台帳エントリ | TASK-4 の決定規則。frontmatter には持たない。 |
| storageState（タスク保存区分） | 走査元ディレクトリ（tasks / drafts / completed / archive/tasks / archive/drafts） | active / draft / completed / archive。frontmatter には持たず、ファイルの置き場所だけで決まる。status とは別軸（3.4）。 |
| id（プロジェクト内 TASK-ID） | frontmatter `id` | 横断タスクID の右辺。draft は接頭辞 `DRAFT`（`DRAFT-N`）で、通常タスクの `TASK-N` とは別接頭辞（3.4）。 |
| title | frontmatter `title` | |
| status | frontmatter `status` | `config.yml` の status 定義で正規化（正規化規則は TASK-7）。draft の `Draft` は CLI 既知の status だが `config.yml` の `statuses` に含まれないことがあり、未知 status として縮退させず既知値として扱う（3.4・5 章）。 |
| type（Type 候補の並び） | labels の kind ラベル、および frontmatter `type` | 収集は本層、既知判定と同値の畳み込みは decision-5・decision-20 の解釈側。並び順は kind ラベル由来（labels の出現順）が先、type フィールド由来が後（3.3）。 |
| labels（通常ラベル） | labels の非 kind 要素 | 表示用ラベル一覧。 |
| assignee / priority / ordinal / milestone | 同名 frontmatter | milestone は ID 参照。 |
| created_date / updated_date | 同名 frontmatter | |
| dependencies | frontmatter `dependencies` | プロジェクト内 TASK-ID の配列。 |
| references | frontmatter `references` ＋ 本文 References | Pull Request URL 抽出（TASK-12）の入力。 |
| description | `SECTION:DESCRIPTION` 本文 | |
| acceptanceCriteria | `AC:BEGIN`〜`AC:END` の `#N` 項目 | 各項目に checked 状態（`[x]`/`[ ]`）を持つ。 |
| implementationPlan / implementationNotes | `SECTION:PLAN` / `SECTION:NOTES` 本文 | 任意。 |
| health | 解析結果の健全性（正常 / 縮退） | 5 章。縮退時は不足フィールドを保持。 |

### 3.2 設定・マイルストーン・文書

- **設定（config）**: `config.yml` から status 定義・task_prefix・ディレクトリ構成等を写す。読み取り層全体の解決基点であり、タスク解析より先に構築する。config.yml に Backlog の版情報は無い（v1.48.0 の `config.yml`・`backlog config list` に版欄は無く、status 定義・task_prefix・date_format 等のみ、実測）。版に依存しない読み取りは 4 章による。
- **マイルストーン**: `milestones/m-N` の frontmatter（id・title）と本文（Description）を写す。タスクの milestone 参照の解決先。
- **文書**: `docs/doc-N` の frontmatter（id・title・type・tags・日付）と本文を写す。タスクの documentation 参照の解決先。

いずれも「1 プロジェクト（Backlog ルート）内で id により相互参照される」構造を保つ。

### 3.3 Type 候補を集め、通常ラベルと分離する境界

- 分離は**読み取り層で行う**。frontmatter の `labels` 配列を、`kind:` 接頭辞の有無で kind ラベルと通常ラベルへ分ける。
- ドメインモデルのタスクは、生の `labels` ではなく分離済みの `type`（Type 候補の並び）と `labels`（通常ラベル）を保持する。画面は通常ラベル一覧に kind ラベルを混ぜない（doc-2）。
- **Type 候補は 2 つの Type 導出元から集める**（decision-20）。kind ラベルの接頭辞除去後の値を labels の出現順に並べ、その後ろに frontmatter `type` の値を置く。空文字列または空白だけの `type` は候補を生まない。type フィールドを持たないタスクでは、この並びは decision-20 以前と同じである。
- Type の値そのものの解釈（既知 Type 集合との照合、複数値の表示、同値の二重指定の畳み込み）は decision-5 と decision-20 に従い、**本層では行わない**。本層が保持するのはファイルが実際に書いていた候補であり、同値が 2 つあればそのまま 2 つ持つ。境界の外が見る Type 値は畳んだあとの並びなので、両者の個数は一致しないことがある。

### 3.4 タスク保存区分（走査元ディレクトリ由来）

保存区分は frontmatter に無く、そのタスクファイルがどの走査元ディレクトリに在ったかだけで決まる。読み取り層は §2 の走査時に、ファイルの所在ディレクトリを次の規則で保存区分値へ写す。

| 走査元ディレクトリ | 保存区分値 | 意味 |
|---|---|---|
| tasks/ | active | 日常の進捗対象。 |
| drafts/ | draft | 下書き。id は `DRAFT-N`。status は `draft create` 直後は `Draft`、`task demote` 由来は元タスクの status を保持（一律ではない）。 |
| completed/ | completed | 完了整理済み。 |
| archive/tasks/ | archive | アーカイブ済みタスク。id・status は保持。 |
| archive/drafts/ | archive | アーカイブ済み下書き。id は `DRAFT-N`、status はアーカイブ前を保持。 |

- v1.48.0 実測では、`archive/` は `tasks` / `drafts` / `milestones` へネストし、タスクは `archive/tasks` と `archive/drafts` に置かれる（`archive/` 直下にタスクファイルは無い）。`archive/milestones` はアーカイブ済みマイルストーンであり、タスクとして扱わない（§3.2）。走査は `archive/` を平坦にではなく、この実構造で辿る。
- draft は `drafts/`（保存区分 draft）と `archive/drafts/`（保存区分 archive）の両方に在りうる。id はいずれも `DRAFT-N`。status は一律 `Draft` ではなく、`draft create` 直後は `Draft`、`task demote` 由来や archive 済みは遷移前の status（例 `To Do`）を保持する（遷移の詳細は doc-5 の 3.3）。保存区分（ファイルの置き場所）と status（作業状態）は別軸である。
- `Draft` は `config.yml` の `statuses` に含まれないことがあるが、draft が正規に取りうる既知の status であり、未知 status として縮退（5 章の想定外スキーマ）させない。status 正規化（TASK-7）は `Draft` を既知値として扱う。
- 保存区分は status（作業状態）とは独立の軸である。status が Done のタスクでも、tasks/ に在れば active、completed/ に在れば completed になる。両者を混同しないことがこの区分を持たせる目的で、混同すると完了整理済み・アーカイブ・draft のタスクが通常の進捗表示へ混入する（doc-7）。
- 保存区分値はこの 4 種に閉じる。タスクを読むのは上記の走査元ディレクトリだけで、milestones / docs / decisions はタスクとして扱わない（§2）。上記いずれにも属さない場所でタスク様のファイルを見つけた場合は想定外スキーマ（5 章）として縮退させ、保存区分を未確定にする。
- スイムレーンが既定で active のみを表示し、他区分をどう扱うかは doc-7（TASK-11）で定義する。本層は各タスクへ保存区分を付与するにとどめる。

## 4. 管理ファイルからの写像

- **frontmatter**: ファイル先頭 `---` … `---` を YAML として解析する。既知フィールドをドメイン項目へ写し、未知フィールドは保持または無視する（破棄しないが表示もしない）。
- **SECTION 区切り**: `<!-- SECTION:NAME:BEGIN -->` … `<!-- SECTION:NAME:END -->` と `<!-- AC:BEGIN -->` … `<!-- AC:END -->` を対で切り出す。既知の NAME（DESCRIPTION・NOTES・PLAN 等）と AC を写し、未知の NAME は本文断片として保持し縮退契機とする（5 章、想定外スキーマ）。
- **AC 項目**: AC ブロック内の `- [ ] #N …` / `- [x] #N …` を、番号・本文・checked 状態の並びへ写す。
- **References / Pull Request URL**: references と本文 References から URL を集める。Pull Request URL の抽出・表示は TASK-12、Git 履歴照合は TASK-10 の入力とし、本層は URL を保持するにとどめる。
- **版の扱い（書き込み CLI の版と生成元の版の分離）**: 「版」は 2 つを区別する。**書き込み CLI の版**は Atlas が更新で呼ぶ backlog CLI 実行ファイルの版で、実行時に `backlog --version` で取得できる（doc-5 の呼び出し先）。**生成元の版**はいま読んでいる管理ファイルを書いた backlog の版で、frontmatter にも config.yml にも記録が無く、ファイルからは不明である。読み取りは生成元の版に依存できないため、版番号での分岐をしない。
- **読み取りはスキーマ能力検査で行う**: 版番号ではなく、frontmatter フィールド・SECTION・AC ブロック等の有無と構造から当該ファイルのスキーマ能力を判定して読み取る（**スキーマ能力検査**）。想定するフィールド/SECTION の集合を本層のスキーマ定義として明記し、その有無を検査対象にする。ただし「無ければ縮退」を全既知項目へ一律に適用しない。項目を次の 3 分類に分け、不在の意味を区別する（5 章）。
  - **必須フィールド**（id・title・status）: 欠くと当該タスクをドメインモデルへ写せず、解析不能として縮退させる。
  - **任意フィールド**（implementationPlan／implementationNotes・milestone・priority・assignee・dependencies・references・acceptanceCriteria・type など、3.1 で任意・0 個以上とした項目）: 不在は正常であり、縮退契機にしない。存在すれば写す。frontmatter `type` は decision-20 で既知フィールドになった項目で、それ以前は上の「未知フィールドは保持または無視」に落ちていた。
  - **存在時構造検査項目**（SECTION 対（`BEGIN`／`END`）の開閉、AC ブロック内の `#N` 番号列、frontmatter の YAML 妥当性など）: 存在する場合にのみ構造の妥当性を検査し、不在は正常として扱う。構造が壊れているとき（対が閉じない・番号列が読めない・YAML が読めない等）だけ縮退させる。
  この分類により、生成元の版が不明・混在でも判別できた範囲で読め、任意項目の不在で正常なタスク（例: PLAN／NOTES を持たないタスク）を縮退させない。想定するフィールド/SECTION 集合は、各項目がこの 3 分類のどれかを併せて明記する。
- **サポート範囲**: 動作確認した版は書き込み CLI の版に対して固定する（現行 v1.48.0 を含む、decision-2）。これは更新（doc-5 の操作写像・オプション名の検査）の基準であり、生成元の版を縛るものではない。読み取り側のサポート範囲は、上記スキーマ能力検査が扱えるフィールド/SECTION 集合として定める。

## 5. 解析エラー・欠損時の扱い

破棄せず、可能な限りタスク単位で縮退させる。事象を次の 4 つに分けて扱う。

- **解析不能** … frontmatter が YAML として読めない、または必須フィールド（id・title・status、4 章の分類）を欠くために当該ファイルをドメインモデルへ写せない事象。当該タスク 1 件を縮退表示にし、他タスクの読み取りは続行する。任意フィールドの不在はこれに当たらない（4 章）。
- **想定外スキーマ** … frontmatter は読めるが、値や構造がサポート範囲外（未知の status 値、未知の SECTION、存在時構造検査項目の構造破損など）である事象。判別できたフィールドは活かし、範囲外フィールドのみ縮退させる（decision-2）。ただし draft の `Draft` は既知の status 値であり、未知 status として扱わない（3.4）。
- **参照欠損** … タスクが参照する milestone・documentation・references の対象がルート内に見つからない事象。タスク本体は正常に写し、当該参照だけを未解決として印を付ける。
- **ルート読取不能** … tasks ディレクトリや `config.yml` など読み取りに必須の要素がルートに無く、当該 Backlog ルート全体を読めない事象。台帳エントリ単位で読取不能を報告し、他プロジェクトの読み取りには影響させない（表示は TASK-13）。

**縮退表示** … 解析不能・想定外スキーマ・参照欠損を検知したとき、当該タスクを捨てず、判別できたフィールドと不足の明示に切り替えて画面へ出す表示状態（decision-2）。ドメインモデルのタスクは health（正常／縮退）と不足内容を保持し、画面はそれを根拠に縮退表示へ切り替える。

読み取り層は例外でルート全体の読み取りを止めない。1 ファイルの事象は 1 タスクの縮退に閉じ込め、ルート単位の致命はルート読取不能として分離する。

## 6. 後続への影響

- status 正規化（プロジェクト共通／個別）の確定は TASK-7。
- kind ラベルからの Type 導出規則と不明値の表示は TASK-8（decision-5）。frontmatter `type` を 2 つ目の Type 導出元として足したのは TASK-110（decision-20）。
- 同一 Backlog ルート更新時の競合検出・再読み込み（ファイル監視）は TASK-14。本層のドメインモデルはその再構築単位（ルート／ファイル）と整合させる。
- References からの Pull Request 抽出・表示は TASK-12、タスク ID からの Git 履歴照合は TASK-10。
- cross-branch を現在 checkout に限定する範囲確定は TASK-6。
- タスク保存区分（3.4）を用いてスイムレーン既定表示を active に限定する扱いは doc-7（TASK-11、TASK-16）。
