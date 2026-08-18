---
id: TASK-169
title: 公開文書が参照する _sandbox/ のパスの扱いを決める
status: Done
assignee: []
created_date: '2026-08-14 00:34'
updated_date: '2026-08-18 21:10'
labels:
  - docs
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 160700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-102 (2026-08-14 のパブリック化) 由来。**`backlog/decisions/` と `backlog/docs/` の committed 文書が `_sandbox/` 配下を約 140 箇所参照している** (`git grep -oh "_sandbox/[A-Za-z0-9_./-]*" -- backlog/` で数えた。distinct なパスは 58)。`_sandbox/` はリポジトリに入らないので、**公開後の読者はこれを辿っても何も見つからない。**

README は `backlog/decisions/` と `backlog/docs/` を設計の根拠の置き場として読者に示しているので、読者はそこへ来る。

**公開阻害には当たらないと判断して m-3 へ回した** (TASK-102 の回)。理由: 参照されているのは測定スクリプトと対応表で、いずれも**出所の註**であって読者が行動の根拠にする記述ではない。根拠そのものは文書本文が持っている。差し戻し・データ損失・操作不能のいずれも招かない。

**選択肢は少なくとも 3 つあり、どれを採るかがこのタスクの成果物である。**
1. そのままにする — 出所を記録した事実は残る。読者は辿れないが、辿れないことは害ではない。
2. 註の書き方を変える — 「`_sandbox/csp-check/measure-csp.mjs` にある」を「セッションの作業領域で測った」に書き換え、パスを名乗らない。**約 140 箇所の書き換えになる。**
3. 参照されているものをリポジトリへ入れる — 測定スクリプトだけでも `scripts/` へ移す。対応表は別の性質 (先行確定の記録) なので同じ扱いにできない。

**種類ごとに答えが違う可能性がある** — 測定スクリプト・対応表・実装報告書・画像の 4 種が混ざっている。まず種類ごとに数え直す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 参照されている _sandbox/ のパスを種類ごとに数え上げ、種類ごとに 1・2・3 のどれを採るかを決めた
- [x] #2 決めた方針を実施し、公開リポジトリの読者が辿れない参照が残っていないか、または残す理由が文書に書かれている状態にした
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 数え上げ (2026-08-18)

起票時の「約 140 箇所・distinct 58」は `backlog/` 全体を数えた値で、いまは 175・71。
**README が読者を送る面（`backlog/decisions/`・`backlog/docs/`）は 28 箇所・21 パスだけである。**

| 面 | 出現 |
|---|---|
| `backlog/decisions/` | 25 |
| `backlog/docs/` | 3 |
| `backlog/tasks/` | 153（Done 137・To Do 10・In Progress 6） |
| `backlog/milestones/` | 0 |
| `backlog/` の外 | 7（`.gitignore` 1・`biome.jsonc` 1・`src/` のコード註 5） |

**種類は 6 つで、起票時に挙げた 4 つではなかった。** 対応表 13・測定スクリプトとハーネス 7・
実装報告書と品質評価 5・測定の記録 1・画像 1・ディレクトリ名そのもの 1。

**21 パスのうち 6 つは、オーナー自身のツリーでも既に辿れない**（対応表 5 つは畳み直した回に
一斉にずれ、画像 1 つは消えた）。**コード註 5 箇所のうち 2 箇所も同じ。** 検知する機構は無かった。

## 決めたこと

**6 種すべてについて案 2（パスを名乗らない）** をオーナーが 2026-08-18 に確定した。
案 3 は測定スクリプトとハーネスについて実際に検討し、7 箇所のうち 4 箇所がハーネスであること
（移すと維持対象の production 相当物が増え、依存ゲートにも触れる）を理由に退けた。

正本は decision-36。AGENTS 和英に「主張の出所の書き方」節を足した。

## 実施

- **28 箇所を書き換えた** — `_sandbox/` の 27 箇所（§3 に当たる 1 箇所は残す）と、素のファイル名 1 箇所。
  決定 14 件と doc-11。doc-11 は `backlog doc update --content` 経由。
- **範囲は AGENTS 和英・README 和英まで広げた**（いずれも現在 0 箇所なので既存の文は動かない）。
- **走査を足した** — `src/lib/sandbox-reference.test.ts`。2 パターン（`_sandbox/` 配下のパス、
  ファイル名で名乗る対応表）を 6 ファイルに当て、読む集合の下限と植え込みも主張する。
  **書き換えを外すと落ちることを実測で確かめた。**
- **残す理由を文書に書いた** — `backlog/tasks/` の 153 箇所とコード註の 5 箇所は decision-36 §4 が
  理由付きで範囲外にしてある（137 箇所は Done タスクの記録であり、書き換えは済んだ記録を変える）。

## 検証

`pnpm test` 996 passed / `pnpm run check` 0 errors / `pnpm run lint` clean。
**Rust 側は 1 行も触っていないので cargo は回していない。**
<!-- SECTION:NOTES:END -->
