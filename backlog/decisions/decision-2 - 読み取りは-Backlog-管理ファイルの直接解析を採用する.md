---
id: decision-2
title: 読み取りは Backlog 管理ファイルの直接解析を採用する
date: '2026-07-21 09:20'
status: accepted
---
## Context

各 Backlog ルートのタスク・設定・マイルストーン・文書をどう読むかを決める
（TASK-3）。候補は (a) Backlog.md 管理ファイルの直接解析、(b) Backlog CLI 経由、
(c) MCP 経由。更新のうち Atlas が起こすものは、方式に関わらず対象プロジェクトでの
Backlog CLI 呼び出しへ委譲する前提は不変（doc-2、AGENTS）。利用者が明示的に選ぶ
外部エディタ経路（doc-8）はこの例外で、そこでは利用者が管理ファイルを直接編集する
（Atlas 自身は書かず、Decision 節で後述）。

判断の決め手として、導入済みの Backlog CLI（v1.47.1）の出力を実測した。CLI には
JSON など機械可読な出力が無く、`--plain`（人間向け整形テキスト）のみである。一方、
タスクは `task-N - title.md` に YAML frontmatter（id・status・labels・dependencies・
references・milestone など）＋ `<!-- SECTION:DESCRIPTION -->` や `<!-- AC:BEGIN -->`
で区切った本文として保存され、CLI の整形出力より構造的で安定している。

- (b) は「CLI がパースを所有する」利点を機械可読出力の不在で失う。`--plain` 解析は
  版差で壊れやすく、AC が問う「バージョン差耐性」でむしろ不利。ルート×更新ごとの
  サブプロセス起動でスイムレーンの反応性も落ちる。
- (c) は doc-2 の起動モデル（プロジェクトごとに MCP サーバーを常駐しない）と衝突し、
  都度起動も重い。
- 更新は既に CLI へ委譲するため、読み取りを CLI へ合わせる整合性の動機は弱い。正本は
  ファイル自身で、CLI はそのファイルを書き換えるだけである。

## Decision

読み取りは Backlog 管理ファイルの直接解析（案 a）を採用する。frontmatter と
`<!-- SECTION:… -->` 区切りの本文を Atlas が直接読み、config.yml で status や
task_prefix を解決する。更新のうち Atlas が起こすものは従来どおり Backlog CLI へ
委譲する（読み書きで経路を分ける）。利用者が明示的に選ぶ外部エディタ経路（doc-8）は
本決定の対象外であり、そこでは利用者の外部エディタが管理対象 Markdown を直接編集する
（Atlas 自身は書かず、CLI のスキーマ保護も受けない）。この例外は、読み取りを直接解析と
する本決定を左右しない。

doc-2 の要請に従い、直接解析採用に伴う次の扱いを明示する。

- バージョン差：動作確認した Backlog のバージョン範囲を固定し、想定する
  frontmatter/SECTION スキーマを明記する。想定外スキーマは検知して縮退表示する。
- cross-branch 状態：初期版は現在の checkout のみに限定する（範囲確定は TASK-6）。

## Consequences

- 望ましい帰結
  - 構造化された frontmatter を読むため、CLI の整形出力解析より版差に強い。
  - 複数 Backlog ルートを購読読みでき、スイムレーンの反応的表示に向く。
  - ファイル監視による外部変更検知（TASK-14）と自然に統合できる。
- 費用・制約
  - Backlog のディレクトリ構成（tasks / archive / completed / drafts / milestones /
    docs / decisions）と config.yml 解決、frontmatter・SECTION スキーマを自前で
    吸収する。
  - Backlog.md のファイル形式の版差を Atlas 側で追随・検知する責任を負う。
- 後続への影響
  - ドメインモデルと読み取り層の具体設計は TASK-5 で行う。
  - cross-branch を現在 checkout に限定するかの確定は TASK-6 で行う。
  - status 正規化（共通 / 個別）は TASK-7、kind:* からの Type 導出は TASK-8 で決める。
