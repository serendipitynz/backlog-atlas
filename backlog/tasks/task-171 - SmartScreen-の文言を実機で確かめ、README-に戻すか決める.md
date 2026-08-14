---
id: TASK-171
title: SmartScreen の文言を実機で確かめ、README に戻すか決める
status: Done
assignee: []
created_date: '2026-08-14 02:22'
updated_date: '2026-08-14 04:40'
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
- [x] #1 v0.1.0 の .msi を Windows 実機で開き、SmartScreen が出す文言と操作のラベルを記録した
- [x] #2 記録した文言に基づいて README 和英の導入節を更新した（戻さないと決めた場合はその理由を書いた）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実機測定 (AC #1。2026-08-14、オーナーの Windows 実機・英語 UI・Edge、v0.1.0 の .msi)

- **SmartScreen の青い画面「Windows protected your PC」(More info → Run anyway) は出なかった。** README 初稿が引用しかけ、PR #116 の [P3] で落としたラベルは、この実機では現れないダイアログのものだった — 戻さないのは「確かめられなかった」ではなく「確かめたら出なかった」による。
- 実際に出た警告は 2 つ:
  1. **ダウンロード時にブラウザが警告** — Edge は「isn't commonly downloaded. Make sure you trust ... before you open it.」と告げ、**Keep**、続けて **Keep anyway** の選択を複数回要した。
  2. **msi 起動後の管理者権限 (UAC) ダイアログが発行元を Publisher Unknown と表示** (secure desktop 上のためスクリーンショットは無し。オーナーの読み上げによる記録)。

README 和英の導入節は AC #2 として、この実測の形 (ダウンロード警告 + 発行元不明) に書き直した。SmartScreen 画面を一般論として書いていた旧文は、この実機で偽だったので落とした。測定は 1 台・英語 UI・Edge に限る — 他の環境でダイアログが出ないことまでは主張しない (README も「この実測ではこうだった」の形で書いてある)。
<!-- SECTION:NOTES:END -->
