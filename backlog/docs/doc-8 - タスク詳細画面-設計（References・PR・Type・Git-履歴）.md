---
id: doc-8
title: タスク詳細画面 設計（References・PR・Type・Git 履歴）
type: specification
created_date: '2026-07-21 10:17'
---
# タスク詳細画面 設計（References・PR・Type・Git 履歴）

TASK-12 の設計。用語は [doc-1](doc-1)・[doc-2](doc-2) に従い、本書で導入する語は初出に定義を置く。
前提は doc-4（読み取り層・ドメインモデル・References 保持）・doc-5（Backlog 更新アダプター）・doc-6（Git・PR 履歴参照）・decision-5（Type 導出）。

## 1. 用語

- **タスク詳細画面** … 1 タスクの全項目（Description・AC・Type・通常ラベル・References・Pull Request URL・Git 履歴）を 1 画面で見せ、編集操作の起点とする面。
- **Git 履歴欄** … doc-6 のコミット一覧・Pull Request URL・コミット・PR 関連解決結果を、タスク詳細でまとめて見せる欄。

## 2. 位置づけ

タスク詳細画面は、スイムレーン（doc-7）のタスクカードから開く単一タスクの面である。読み取りはドメインモデル（doc-4）から写し、Git・PR 参照は doc-6 の出力を用いる。編集は Backlog 更新アダプター（doc-5）経由で行い、管理ファイルを直接書き換えない。横断画面ではない（単一プロジェクト文脈）ため、タスク ID は `TASK-ID` のみ表示してよいが、見出しには横断タスクID を併記し、どのプロジェクトのタスクかを明示する（doc-3 の 5.3）。

## 3. 表示項目

ドメインモデル（doc-4）と doc-6 の出力から、次を表示する。

| 区画 | 内容 | 由来 |
|---|---|---|
| 見出し | 横断タスクID＋title、status、priority、assignee、milestone | frontmatter（doc-4）。status は正準ステータス列への対応（decision-4）も併記。 |
| Type | 0 個以上の Type 値。未設定は「Type 未設定」、未知 Type は中立表示に印 | kind ラベル由来（decision-5）。通常ラベルと分離（4 章）。 |
| 通常ラベル | labels の非 kind 要素 | doc-4。Type と混ぜない。 |
| Description | 本文 | `SECTION:DESCRIPTION`（doc-4）。 |
| Acceptance Criteria | `#N` 項目と checked 状態 | `AC:BEGIN`〜`AC:END`（doc-4）。チェック状態を可視化。 |
| 実装計画・ノート | 任意本文 | `SECTION:PLAN` / `SECTION:NOTES`（doc-4）。 |
| dependencies | プロジェクト内 TASK-ID の配列 | frontmatter。解決先タスクへ辿れる。未解決参照は印（doc-4 の参照欠損）。 |
| References | 参照 URL 群（PR URL を除いた通常の参照） | frontmatter references ＋本文 References（doc-4）。 |
| Pull Request | 抽出した Pull Request URL | doc-6 の PR URL 抽出規則。References から分離（4 章）。 |
| Git 履歴欄 | コミット一覧＋関連 PR | doc-6 の出力（5 章）。 |
| 日付 | created_date / updated_date | frontmatter。 |
| 縮退表示 | health と不足内容 | doc-4。縮退時は判別できた項目のみ出し、不足を明示。 |

## 4. Type・PR URL の分離表示

AC の要請（Type と Pull Request URL を通常ラベル・References から分離）を、次の 3 区画の分離で満たす。

- **Type ↔ 通常ラベル**: labels は読み取り層で kind ラベルと通常ラベルへ分離済み（doc-4・decision-5）。詳細画面は Type 区画に Type 値（複数併記・未設定・未知）を、通常ラベル区画に非 kind ラベルを、別区画として出す。同一の labels 一覧へ混在させない。
- **Pull Request URL ↔ References**: References の URL のうち PR URL 抽出規則（doc-6）で Pull Request と判定した URL を Pull Request 区画へ、残りを References 区画へ分ける。1 タスクに複数 PR があれば全て並べる（doc-6）。
- 分離は表示上の区画分けであり、正本の labels・references を書き換えない。抽出・分離は読み取り済みデータへの後処理である。

## 5. Git 履歴欄

Git 履歴欄は doc-6 の出力をまとめて見せる。

- **コミット一覧**: doc-6 のコミット検索結果（識別子・要約・日時・作者、新しい順）。0 件のときは「対応コミット無し」を示す（remote 不在・ルート不在との区別は TASK-13）。
- **Pull Request との関連**: `git_remote_present` が真かつ remote ホスト種別を判別できた場合、doc-6 のコミット・PR 関連解決結果を用い、各コミットに関連 Pull Request を紐づけて示す。remote 非対応・参照不能時は、コミット一覧と Pull Request 区画（4 章）を各々独立に出し、関連が解決できないことを「対象不在」と区別して示す（doc-6・具体は TASK-13）。
- Git 履歴欄は読み取り専用であり、Git リポジトリを書き換えない。

## 6. 詳細からの編集操作

- 詳細画面からの編集（title・description・status 変更、ラベル/AC 増減、AC チェック、priority・milestone・dependencies 変更、実装計画・ノート編集など）は、すべて Backlog 更新アダプター（doc-5）の更新操作として発行する。詳細画面は操作の入口であり、管理ファイルを直接書き換えない。
- 各編集は doc-5 の操作写像に対応づく。利用者入力は引数配列要素として渡す（シェル非連結、doc-5）。
- 編集の成否・失敗表示・成功後の再読込は doc-5 に従う。CLI 失敗時は詳細画面の表示を変えず失敗理由を示し、成功時は再読込契機で当該タスクを読み直して詳細を更新する。
- References・Pull Request・Git 履歴は参照系であり、詳細画面からの編集対象にしない（PR URL の登録が要る場合は、References を編集して URL を加える更新操作に帰着させる）。

## 7. 後続への影響

- コミット不在・remote 不在・ルート読取不能の具体な見せ方（区別の表現）は TASK-13。本章はどの区画に何を出すかを与える。
- 詳細からの編集は doc-5 の操作写像・再読込契機に載る。競合検出・再読込の機構は TASK-14。
