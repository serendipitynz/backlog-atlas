---
id: TASK-108
title: ファイル監視の実 OS 通知を検証する経路を用意する
status: In Review
assignee: []
created_date: '2026-08-01 00:44'
updated_date: '2026-08-24 00:55'
labels:
  - test
  - rust
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: low
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sync::tests::the_watch_session_delivers_a_batch_for_an_external_change は OS のファイル通知が sandbox 内で配送されない場合があるため常時実行できず、2026-08-01 のレビューでも未実行だった。watcher の error や通知欠落を「変更なし」とせずルート再走査へ倒す設計は型で持っているが、実 OS 通知が実際に届くかは自動検査の外にある。

sandbox 外で走らせる手段（ignored テストの明示実行手順、または CI の 1 ジョブ）を用意し、どの環境で通したかを記録する。

_sandbox/repository-quality-assessment-2026-08-01.md の堅牢性節・今回実行していない検証。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 実 OS 通知を使う監視テストを実行する手順が記録されている
- [ ] #2 3 プラットフォームのうちどこで通したかが記録されている
- [x] #3 通知が届かない環境での扱い（skip か失敗か）が決まっている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 決めたこと

decision-43 が正本。**入口は `pnpm run os-notify` 1 つ（`scripts/os-notify/run.mjs`）で、CI の 3 か所も手作業もこれを呼ぶ。** **既定実行では skip（`#[ignore]` を保つ）、明示実行では失敗させる。** 束が来ないことも、来た束が `Rescan` であることも失敗である。**skip へ自動的に落ちる判定は持たない。**

CI の置き場は 3 か所で、どれもマージ要件ではない: `os-notify (macos-latest)`・`os-notify (windows-latest)` の新ジョブ 2 つと、`e2e (ubuntu-24.04)` の最後の 1 段。**Linux が `e2e` に乗るのは apt 一覧の 4 か所目を作らないためである（decision-33 §3・decision-40 が断っている）。**

## 着手前に測ったこと（2026-08-24）

- **作業機 macOS arm64（Darwin 25.6.0）、debug: 3 回とも届いた。** 束は `Changed(["…/tasks/task-1 - a.md"])` で、いずれも 0.8 秒台。**既存の註が理由に挙げていた「sandbox 内では FSEvents が届かない」状態ではなかった** — 註は sandbox の名で理由を書いていたが、届くかは profile 次第なので、理由を「環境の性質でありコードの欠陥ではない」の側へ書き直した。
- **その 1 本の合格条件が `Rescan` を含んでいた。** `Rescan` はストリームが欠けたことを述べるので、**緑が配送を述べていなかった** — 「0 件だった」と「0 件しか読めなかった」を区別しない形である。合格から外した。
- **libtest のフィルタが何にも当たらない実行は 0 で終わる（cargo 1.96.0 で実測。`0 passed` は緑）。** cargo にこれを失敗にするオプションは無いので、入口が「走ったテストが 1 本であること」を確かめる。
- **`cargo test` の ignored は 8 本である。** 内訳は 環境依存 4 本（監視 1・PATH 上の `backlog` 2・認証済み `gh` 1）と 規模計測 4 本で、**この総数は cargo の出力と一致する。** 範囲の数え上げは列挙ではなく機械が数えた。

## 変異で確かめたこと

- 監視ループの `record` を `record_rescan` に替えた版では新しい判定が落ち（`no delivery observed`）、戻した木で緑を見た。**戻したのは 1 通りずつで、戻した直後に流している。**
- 入口の定数を 1 文字変えた版は「検査が 1 本も走っていない」を出して 1 で終わり、戻して 0 になった。

## 起票したもの

**TASK-200（m-4）** — 環境依存 ignored の残る 3 本を回す経路。**問いが違うので同じ決定に載せなかった。** あちらは「そのプログラムを CI が用意できるか」で、測っていない。
<!-- SECTION:NOTES:END -->
