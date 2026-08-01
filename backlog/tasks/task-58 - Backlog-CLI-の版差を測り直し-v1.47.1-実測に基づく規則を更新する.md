---
id: TASK-58
title: Backlog CLI の版差を測り直し v1.47.1 実測に基づく規則を更新する
status: To Do
assignee: []
created_date: '2026-07-31 19:46'
updated_date: '2026-08-01 01:51'
labels:
  - 'kind:chore'
milestone: m-2
dependencies: []
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3・doc-4・doc-5・doc-8・doc-9・doc-10・doc-12 は Backlog CLI v1.47.1 の実測挙動を規則として持つ（v1.47.1 への言及 34 箇所、うち「実測」と明記されたもの 17 箇所）。GUI の無効化・doc-10 §1 の「提供しない操作区画」・doc-9 §4.2.1 の参照追随書き換えの照合規則は、いずれもその実測の上に建っている。

2026-08-01 時点で利用者環境の CLI は 1.48.0 であり、動作確認版を越えた。update::MIN_VERSION は下限のみで decision-7 が上限を固定していないため Atlas は縮退しない（1.48.0 は Supported）。しかし v1.47.1 で「CLI に手段が無い」と判定した操作が新版で可能になっていた場合、Atlas はできる操作を無効化し続けることになる。これは食い違いの向きが逆で、利用者からは機能欠落として見える。

とくに測り直しの対象になるのは doc-5 §3.1 が挙げる沈黙無変更の一群（--ref ""・-a ""・--depends-on "" が終了コード 0 のまま何も消さない）、--acceptance-criteria が set ではなく追加になる挙動、draft の内容編集手段の不在、doc-9 §4.2.1 のマイルストーン参照の照合規則（TASK-45 が「CLI 版が上がったら測り直す」と明記した分）、doc-4 §3.2 の archive/ のネスト構造である。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象版を確定し、doc に「v1.47.1 実測」と書かれた挙動を一時プロジェクトで測り直す
- [ ] #2 変化した挙動を doc-3・doc-4・doc-5・doc-8・doc-9・doc-10・doc-12 の該当箇所へ反映する
- [ ] #3 新版で可能になった操作について、GUI 側の無効化と「提供しない操作区画」を見直す
- [ ] #4 update::MIN_VERSION と decision-2・decision-7 のサポート範囲の表記を、測り直した版に合わせる
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
測定中に見つかった v1.47.1 の挙動（1.48.0 で変わったか確認する）:

- backlog task edit -t <新title> は frontmatter の title を書き換えるが、ファイル名は変えない。TASK-95 で title を「パッケージマネージャを npm から pnpm へ移す」から「パッケージマネージャを pnpm へ移し Node と pnpm の版を固定する」へ変えた結果、ファイル名だけ旧 title のまま残っている（2026-08-01）。v1.47.1 の help で確認した rename 相当のサブコマンドは milestone rename だけで、task には rename が無く、title を変える手段は task edit -t/--title に限られる（その title 更新がファイル名を追随させないことが、まさにこの項の観測である）。Atlas は frontmatter を正本として読むので機能影響は無いが、リポジトリを ls で見たときに title と食い違う。1.48.0 で task 側に rename が入ったか、task edit -t がファイル名を追随させるようになったかを確認し、いずれも無ければ「title 変更時にファイル名が追随しない」を doc-5 へ記録する。
- backlog task edit <id> --dep <N> は依存を追加ではなく置換する。TASK-65 に --dep 58 を単独で渡したところ、既にあった TASK-64 が消えた。複数の依存を保つには 1 回の呼び出しで --dep をすべて並べる必要がある（--ac が追加なのと挙動が逆）。この非対称は doc-5 の操作写像に影響するので 1.48.0 で確認する。
- backlog task edit <id> -l <labels> もラベルを置換する。kind:* を保ったまま他のラベルを変えるときは既存のラベルをすべて並べ直す。
<!-- SECTION:NOTES:END -->
