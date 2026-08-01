---
id: TASK-108
title: ファイル監視の実 OS 通知を検証する経路を用意する
status: To Do
assignee: []
created_date: '2026-08-01 00:44'
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
- [ ] #1 実 OS 通知を使う監視テストを実行する手順が記録されている
- [ ] #2 3 プラットフォームのうちどこで通したかが記録されている
- [ ] #3 通知が届かない環境での扱い（skip か失敗か）が決まっている
<!-- AC:END -->
