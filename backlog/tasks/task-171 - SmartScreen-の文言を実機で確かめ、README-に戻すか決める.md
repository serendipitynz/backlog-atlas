---
id: TASK-171
title: SmartScreen の文言を実機で確かめ、README に戻すか決める
status: To Do
assignee: []
created_date: '2026-08-14 02:22'
labels:
  - docs
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: low
ordinal: 162700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-102 (2026-08-14) 由来。**README 和英の「導入」に足した未署名の説明から、ダイアログのラベルを落としてある。**

初稿は `**More info → Run anyway**` / `**詳細情報 → 実行**` と書いていたが、**PR #116 のレビューが [P3] で指摘した** — 同じ段落が「Windows のダイアログが何と書くかは未測定だから引用しない」と述べておきながら、ラベルはダイアログの文言そのものを引用していた。**いまは操作の形だけを述べている**（「その警告を展開すると実行に進めます」）。

**レビューが示した 2 案のうち、後者 (ラベルを落とす) を採ったのは順序の問題である** — `.msi` はタグがワークフローを走らせるまで存在せず、README はタグ対象のツリーに入っている必要があった。**v0.1.0 の `.msi` は公開済みなので、この制約はもう無い。**

**オーナーは Windows 実機を持っている。** 実物の `.msi` を開いて文言を確かめれば戻せる。**ラベルがあるほうが読者にとって明確なので、確かめられるなら戻すのが望ましい。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 v0.1.0 の .msi を Windows 実機で開き、SmartScreen が出す文言と操作のラベルを記録した
- [ ] #2 記録した文言に基づいて README 和英の導入節を更新した（戻さないと決めた場合はその理由を書いた）
<!-- AC:END -->
