---
id: TASK-41
title: 横断タスクID の task_prefix 照合を大小文字非依存にする
status: In Progress
assignee: []
created_date: '2026-07-24 00:21'
updated_date: '2026-07-28 03:33'
labels:
  - 'kind:bug'
milestone: m-1
dependencies: []
references:
  - src-tauri/src/ledger.rs
  - src-tauri/src/read.rs
documentation:
  - doc-3
  - doc-4
priority: medium
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
台帳の横断タスクID 検査（doc-3 §5.2）が task_prefix を大小文字を区別して照合するため、Backlog CLI の既定初期化で作られたルートが自身のタスク ID を弾く。v1.47.1 実測で backlog init --defaults は config.yml に task_prefix: "task"（小文字）を書く一方、生成される ID は TASK-N（大文字）であり、parse_cross_task_id("<slug>:TASK-1", "task", None) が InvalidTaskId を返す。読み取り層（TASK-28）は同じ問題に当たり独自の大小文字非依存判定を持つが、台帳側は当該 PR の範囲外として据え置いた。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src-tauri/src/ledger.rs の task_prefix 照合を大小文字非依存にし、task_prefix: "task" のルートで TASK-N の横断タスクID が生成・解析できる
- [x] #2 task_prefix が小文字・ID が大文字のケースの回帰テストを追加する
- [x] #3 ledger.rs と read.rs の接頭辞判定ヘルパを共有するか別々に保つかを、doc-3 §5.2（横断タスクID 契約）と doc-4 §3.4（保存区分との整合）が別契約である点を踏まえて判断し、根拠を Implementation Notes に記録する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
台帳側の横断タスクID 照合（doc-3 §5.2）を大小文字非依存にした。変更は Rust の ledger.rs に閉じる（フロントエンドに接頭辞判定は無い）。

AC #1: ledger.rs の is_prefixed_number を、strip_prefix による完全一致から先頭 prefix.len() バイトの eq_ignore_ascii_case による比較へ変えた（read.rs と同じ形）。これで task_prefix が小文字 task のルートでも slug:TASK-N が生成・解析できる。大小文字非依存にするのは判定だけで、解析結果の task_id は入力の表記のまま返す（Atlas は正本側の ID 表記を書き換えないため）。DRAFT 接頭辞も同じ比較を通る。

AC #2: ledger.rs の tests に the_task_prefix_is_matched_case_insensitively を追加。task_prefix=task × ID=TASK-1 で解析と生成の往復が通ること、返る task_id が大文字のまま保たれること、draft-2 も受理すること、無関係な接頭辞 BUG-1 は従来どおり拒否されること（照合が緩みすぎていないこと）を検査する。

AC #3: ledger.rs と read.rs の接頭辞判定ヘルパは共有せず、別々に保つ。理由は 3 点。(a) 契約が別文書に属する。台帳側は doc-3 §5.2 の横断タスクID 解析・生成（利用者入力と表示用 ID の検査）で、読み取り側は doc-4 §3.4 の「保存区分と id 接頭辞の整合」検査であり、後者の同名関数は doc/decision/milestone の ID 判別にも使われていて doc-4 の走査事情に縛られている。(b) 共有すると一方の文書の改訂が他方の契約を黙って動かす。いま一致しているのは「接頭辞-数字 を大小文字無視で判定する」という構文述語だけで、この 10 行の重複コストより契約結合のコストの方が高い。(c) 共有すべきは実装ではなく根拠なので、大小文字非依存にする理由（CLI 既定 config の小文字 task_prefix と大文字 ID）を両ヘルパのコメントと doc-3 §5.2 に明記した。history.rs の message_mentions_task_id も同じ理由で大小文字非依存だが境界規則は doc-6 §3 固有であり、既に 3 箇所目の別契約になっている点も、共通ヘルパへ寄せない判断の裏づけになる。

文書: doc-3 §5.2 に「接頭辞の一致は大文字小文字を無視する」を v1.47.1 実測の根拠つきで明文化した。実装だけを直すと設計文書に無い独自例外になるため、契約の側を先に直す。

検証: cargo test 232 passed（新規 1 件を含む、失敗 0）、cargo clippy --all-targets 警告 0、cargo fmt 適用済み。
<!-- SECTION:NOTES:END -->
