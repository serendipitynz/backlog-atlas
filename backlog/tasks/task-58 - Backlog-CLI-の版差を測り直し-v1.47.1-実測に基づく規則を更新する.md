---
id: TASK-58
title: Backlog CLI の版差を測り直し v1.47.1 実測に基づく規則を更新する
status: In Review
assignee: []
created_date: '2026-07-31 19:46'
updated_date: '2026-08-01 08:14'
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
- [x] #1 対象版を確定し、doc に「v1.47.1 実測」と書かれた挙動を一時プロジェクトで測り直す
- [x] #2 変化した挙動を doc-3・doc-4・doc-5・doc-8・doc-9・doc-10 の該当箇所へ反映する（doc-12 は「原文が『対応 CLI（v1.47.1）に無い』と述べる箇所の版番号も、原文のまま写している」と自ら宣言する転記文書なので対象外とし、その理由を記録する）
- [x] #3 新版で可能になった操作について、GUI 側の無効化と「提供しない操作区画」を見直す
- [x] #4 update::MIN_VERSION と decision-2・decision-7 のサポート範囲の表記を、測り直した版に合わせる
<!-- AC:END -->





## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-01 に v1.48.0 をスクラッチへ隔離導入し、使い捨ての Backlog ルートへ同じ操作列（30 節）を版ごとに流して、出力と管理ファイルを差分比較した。

## 変わった挙動（6 件）

- `task edit --acceptance-criteria` が追加動作から全置換へ変わった。繰り返し指定も v1.47.1 は最後の 1 個だけ、v1.48.0 は全部を採る。ただし `--ac`・`--remove-ac`・`--check-ac`・`--uncheck-ac` と併用できず（`Cannot combine …` で終了コード 1）、差し替え後の完了状態を同じ呼び出しで表せない。Atlas の複合操作は据え置きだが、doc-5 が書いていた「単体は追加動作だから使わない」という根拠は「併用できず完了状態を表せないから」へ替わる。
- `--clear-ac`・`--clear-labels` が増えた。どちらも既存手段（全 index の `--remove-ac`、全ラベルの `--remove-label`）で同じ結果になることを実測したので、操作写像は増やさない。
- `task create --type` / `task edit --type` が増え、frontmatter に `type:` を書く。decision-5 の Type 導出（`kind:` ラベル）と食い違うので TASK-110 を起票した。
- `-l`・`--add-label`・`--remove-label` のフラグ繰り返しが、v1.47.1 の最後の 1 個から v1.48.0 の全部累積へ変わった。カンマ区切り 1 値だけが両版で同じ意味になる。Atlas は元からカンマ連結なので影響なし。
- `--priority` の拒否メッセージが `high, medium, low` から `High, Medium, Low` へ。受理は両版とも大小文字非依存で、frontmatter へは渡した表記のまま入る。値域は不変。
- コマンド構成: `sequence` 削除、`doctor` 追加、`search` に `--task-type`/`--exclude-status`、`browser --non-interactive`、`doc view --plain`、`config` に priorities/types。Atlas はいずれも発行しない。

## 変わらなかったもの

**`milestone update`/`edit` は v1.48.0 にも無い**（list・add・rename・remove・archive のまま）。TASK-65 の契約変更は不要にならない。

沈黙無変更 3 件（`--ref ""`・`-a ""`・`--depends-on ""`）、`--ref`/`--depends-on` の非空全置換、assignee の 1 件化、`task edit --ac` の追加動作、複合 AC 差し替え、`task edit -t` がファイル名を追随させないこと（`task rename` は無い）、`task complete` が Done 限定で `task archive` は status を問わないこと、completed への `task edit` が not found になること、`archive/` のネスト、draft の promote/demote の id 付け替えと status 規則、draft 本文編集の不在、`milestone remove` がファイルを消さずアーカイブへ移すこと、doc-9 §4.2.1 の照合規則 3 点、`doc update --type ""` が拒否されること、config に版欄が無いこと、`init --defaults` の 3 status と小文字 task_prefix、`task create` が `-a`/`--plan`/`--notes`/`--ref`/`--depends-on` を受け取ること。

## 版差ではなく doc の記述が誤っていたもの

`doc update --tags ""` はタグを実際に消す（両版）。doc-10 §6 が非提供の根拠にしていた「効果が未確認で、同型の `--ref ""` は沈黙無変更」は成り立たない。理由を未決へ訂正し、提供可否は TASK-109 へ。

## 反映

MIN_VERSION を 1.48.0 へ。decision-2・decision-7 のサポート範囲、doc-3・4・5・8・9・10 の「v1.47.1 実測」を v1.48.0 基準へ。doc-5 に §3.4（版差の記録）を追加。doc-12 は原文の版番号をそのまま写す転記文書なので対象外。
<!-- SECTION:NOTES:END -->
