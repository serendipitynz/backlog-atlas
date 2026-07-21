---
id: doc-6
title: タスクID からの Git・Pull Request 履歴参照 設計
type: specification
created_date: '2026-07-21 10:05'
updated_date: '2026-07-22'
---
# タスクID からの Git・Pull Request 履歴参照 設計

TASK-10 の設計。用語は [doc-1](doc-1)・[doc-2](doc-2) に従い、本書で導入する語は初出に定義を置く。
前提は decision-1（Tauri/Rust）・doc-3（プロジェクト台帳・Git remote 有無属性・横断タスクID）・doc-4（読み取り層・References 保持）。

## 1. 用語

- **コミット検索** … 所有プロジェクトのリポジトリで、素の TASK-ID をコミットメッセージに含むコミットを探す検索。
- **PR URL 抽出規則** … タスクの References の URL から、ホスト・パス形が Pull Request のものを選ぶ規則。
- **コミット・PR 関連解決** … remote 対応時に、コミットと Pull Request を remote ホストの参照で結び付ける解決。
- **remote ホスト種別** … Git remote URL から判別する remote のホスト種別（GitHub 等）。

## 2. 位置づけと入力

本設計は、あるタスクについて (a) 対応コミット一覧と (b) Pull Request を求め、remote が対応する場合は両者の関連を解決する参照系である。読み取り専用で、管理ファイルも Git リポジトリも書き換えない。入力は次のとおり。

- **所有プロジェクト**: タスクを読み込んだ Backlog ルートに対応する台帳エントリ（doc-3 の決定規則）。ここから `project_root`（Git 履歴の基点）と `git_remote_present`（Git remote 有無属性）を得る。
- **TASK-ID**: 当該プロジェクト内の ID（横断タスクID の右辺）。コミット検索の鍵。
- **References**: 読み取り層がタスクから保持した URL 群（doc-4）。PR URL 抽出の入力。

## 3. コミット検索（タスクID → コミット一覧）

- **検索鍵**: slug を前置しない素の TASK-ID（例 `TASK-12`）を用いる。各プロジェクト内のコミットメッセージは従来どおり `TASK-N` を使う（doc-2・doc-3 の 5.3）ため、横断タスクID の左辺 slug はコミット側に現れない。検索は所有プロジェクトのリポジトリに閉じるので、slug で絞る必要がない。
- **検索経路**: 所有プロジェクトの `project_root` を作業ディレクトリに Git を実行し、コミットメッセージに TASK-ID を含むコミットを列挙する（`git log` のメッセージ検索に相当）。固定サブコマンドと引数配列で実行し、TASK-ID を引数配列の 1 要素として渡す。シェル文字列へ連結しない（doc-2・AGENTS）。実装手段（`gix`/`git2` crate か Git CLI 呼び出しか）は decision-1 が TASK-10 送りとした点で、本設計は「固定引数・シェル非連結・作業ディレクトリ固定」の制約だけを課し、手段の最終選択は実装時に本制約下で行う。
- **誤検出の抑制**: 単純な部分一致は `TASK-1` が `TASK-12` に一致するなどの取り違えを生む。TASK-ID を語境界で照合し（ID の直後に数字が続く一致を除く）、当該プロジェクトの task_prefix（doc-4 の config 解決）に一致する形だけを拾う。
- **結果**: コミットの識別子・要約・日時・作者を一覧として返す。順序は新しい順を既定とする。該当が無い場合は空一覧を返し、欠如の表示は TASK-13 で扱う。

## 4. PR URL 抽出規則（References → Pull Request URL）

- **入力**: 読み取り層が保持した References の URL 群（frontmatter references と本文 References、doc-4）。
- **抽出**: URL のうち、ホストとパス形が Pull Request のものを選ぶ。判定は remote ホスト種別（5 章）ごとの Pull Request パス形に基づく（例: GitHub は `/<owner>/<repo>/pull/<number>`）。ホスト種別を判別できない URL は、一般の Pull Request パス形（`.../pull/<number>` や `.../pull-requests/<id>` 等）で緩く判定し、判定できないものは通常の参照 URL として残す（PR として扱わない）。
- **扱い**: 抽出した Pull Request URL は、タスク詳細で通常の References と分けて独立表示する（doc-2・具体は TASK-12）。抽出は読み取り層が保持した URL への後処理であり、本層は URL を書き換えない。
- **複数 PR**: 1 タスクに複数の Pull Request URL がありうる。丸めず全て保持し、関連解決（6 章）はそれぞれに対して行う。

## 5. remote ホスト種別の判別

- 所有プロジェクトの `git_remote_present` が真のとき、`project_root` の Git remote URL を取得し、ホスト種別を判別する。判別は remote URL のホスト部で行う（例 `github.com` → GitHub）。SSH 形式（`git@github.com:owner/repo.git`）と HTTPS 形式の双方から owner/repo を取り出せる形に正規化する。
- remote URL の取得も固定サブコマンドと引数配列で実行する（doc-3 の Git remote 有無属性判定と同じ実行方針）。
- ホスト種別を判別できない、または `git_remote_present` が偽のとき（Git remote 不在、decision-6）は、関連解決（6 章）を行わず、コミット一覧と Pull Request URL を各々独立に表示するに留める。Git remote 不在は Git リポジトリ状態とは別軸であり、コミット検索（3 章）とローカルコミット履歴の表示は remote に依存せず成立する。

## 6. コミット・PR 関連解決（remote 対応時）

`git_remote_present` が真で remote ホスト種別を判別できた場合に限り、コミットと Pull Request の関連を解決する。

- **解決の方向**: 抽出した Pull Request URL から owner/repo と PR 番号を得て、その Pull Request に属するコミット集合を remote ホストの参照で求める。得たコミット集合と、コミット検索（3 章）で得た当該プロジェクトのコミット一覧を突き合わせ、同一コミットを関連づける。
- **参照先**: remote ホスト種別ごとの参照手段（ホストの API 等）を用いる。手段の具体（認証の要否・レート・オフライン時の挙動）は remote ホスト種別に依存するため、本設計は「remote ホスト種別を鍵に参照手段を選ぶ」構造だけを固定し、各ホストの実装は種別ごとに追加する。判別できないホストは関連解決の対象外とする。
- **remote 非対応・参照不能時**: 関連解決を行わず、コミット一覧（ローカル Git のみで得られる）と Pull Request URL（References から得られる）を各々独立に表示する。関連が解決できないことと、そもそも対象が存在しないこと（コミット不在・Git 対象不在・Git remote 不在）は区別して表示する（表示の具体は TASK-13）。
- **縮退範囲の分離（remote 依存／非依存）**: 縮退させるのは remote 依存の機能（コミット・PR 関連解決、remote ホスト参照）だけに限る。remote 非依存の機能（コミット検索とローカルコミット履歴の表示）は、Git リポジトリが在れば remote の有無に関係なく常に成立し、縮退させない。したがって Git remote 不在でもローカルコミット履歴は表示する。ローカル履歴が消えるのは Git 対象不在（`project_root` が Git リポジトリでない）のときだけで、これは remote の有無とは別軸である。

## 7. 後続への影響

- 対象 repo・Backlog ルート・コミット不在時の表示（コミット 0 件・remote 不在・関連解決不能の区別）は TASK-13。
- タスク詳細画面での Pull Request・コミット・Git 履歴の表示は TASK-12。本層の出力（コミット一覧・PR URL・関連）を入力とする。
- コミット検索・remote 参照の実装手段（`gix`/`git2` crate か Git CLI か）は本層の制約下で実装時に確定する（decision-1 が TASK-10 送りとした点）。
