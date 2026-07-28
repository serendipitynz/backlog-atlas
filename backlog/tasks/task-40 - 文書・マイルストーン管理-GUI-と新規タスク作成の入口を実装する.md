---
id: TASK-40
title: 文書・マイルストーン管理 GUI と新規タスク作成の入口を実装する
status: Done
assignee: []
created_date: '2026-07-22 12:29'
updated_date: '2026-07-28 03:27'
labels:
  - 'kind:feature'
milestone: m-1
dependencies:
  - TASK-31
  - TASK-33
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-5 §3.2 の文書・マイルストーン操作と task create に対応する利用者向け GUI の入口を実装する。すべて Backlog 更新アダプター（TASK-31）経由で発行し、管理対象 Markdown を GUI から直接書き換えない（doc-2）。公開は TASK-33 のコマンド境界を用いる。v1.47.1 CLI に無い操作は入口を設けない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新規タスク作成の入口を GUI に設け、doc-5 の task create 写像へ発行する（title/description/status/labels/priority/milestone/AC）
- [x] #2 文書の作成（title/type/path）と更新（title/本文全置換/type/path/tags）を GUI から発行し、本文は全置換のみで部分編集は全文を渡すことに帰着させる（doc-5 §3.2）
- [x] #3 作成後のマイルストーン説明編集は CLI 経路が無いため GUI に出さず、制約由来と分かる表示にする（doc-5 §3.1・§3.2）
- [x] #4 すべて更新アダプター（TASK-31）経由で、管理対象 Markdown を GUI から直接書き換えない（doc-2）
- [ ] #5 マイルストーンの作成（名称・作成時の説明）・改称・削除（--task-handling <clear|keep|reassign>、reassign 選択時は --reassign-to <milestone> を必須入力として渡す）・アーカイブを GUI から発行する（doc-5 §3.2）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
文書・マイルストーン管理 GUI と新規タスク作成の入口をフロントエンドに実装した。Rust 側は変更なし（TASK-31 の操作写像・TASK-33 の update_apply でこの画面が必要とする更新操作は既に揃っている）。規則は src/lib/manage.ts に純関数として置き（edit.ts と同じ対応表付きヘッダ・同じ 3 規則: 触った項目だけ送る／CLI の制約は先取りする／提供しない操作は理由を言う）、画面 src/components/ProjectManage.svelte はレイアウトとフォーム状態のみ。App.svelte に 3 つ目の画面 "manage" を追加し、画面遷移の破棄前確認を「タスク詳細の編集セッション」だけでなく「管理画面の文書編集セッション」にも効くよう pendingLeave を screen 単位へ一般化した。

AC #1: 新規タスク作成フォーム（title/description/status/labels/priority/milestone/AC）を buildTaskCreate が doc-5 §3 の create 写像へ写す。未入力の項目はキーごと省く（空の --status は「status を "" にする」要求になり、既定 status を効かせる「指定しない」とは別物のため）。status/priority/milestone は「—（未設定）」を選択中も残す（作成フォームでは未指定へ戻れる必要がある）。

AC #2: 文書は作成（title/type/path）と更新（title/本文全置換/type/path/tags）。本文欄は読み取った body 全文を種にし、発行時はその全文をそのまま --content へ渡す＝部分編集を全文渡しへ帰着させる。path だけは読み取りモデルに対応する値が無いため空＝変更しないとし、現在値を推測して書かない。--content は全置換なので照合後競合窓の上書き喪失が最も効く箇所であり、doc-9 §5 の事後通知（docDivergence）を文書にも入れた（タスク側は TASK-36 で実装済み）。tags の全消去は withhold した: doc-5 §3.1 が実測したのは --ref ""/--depends-on "" の沈黙無変更であって --tags "" ではなく、効果が未確認の消去を「できる」と提示しないため。ラベル・タグの「,」も同様に発行前に拒否する（v1.47.1 は 1 個のカンマ区切り値として受け取るため 2 件に割れる）。

AC #3: マイルストーン一覧の説明の直下に MILESTONE_DESCRIPTION_NOT_EDITABLE を出し、編集欄を設けない。文面は「機能が無い」ではなく「v1.47.1 の milestone に update/edit が無く説明は add -d の作成時のみ／rename は名称だけ」と CLI 制約由来であることを述べる。

AC #4: この画面はファイル API もパスも一切持たず、出力は onissue へ渡す UpdateOperation[] だけ。管理対象 Markdown を直接書き換えない境界（doc-2）を規約ではなく構造で満たす。

AC #5: 未完（作成のみ実装）。理由は doc-9 §4.2 との衝突で、着手時に利用者へエスカレーションし「TASK-40 は GUI に閉じ、改称・削除・アーカイブは入口を無効化＋理由表示、doc-9 拡張は別タスク」との判断を得た（TASK-45 を起票）。境界の operation_target は MilestoneRename/Remove/Archive を CLI 起動前に必ず UncheckableTarget で拒否するため、有効な入口を出せば必ず失敗するボタンが 3 つ残る。拒否理由は 2 種類あり、解消経路が違うので画面でも分けて述べた: rename/remove は参照追随書き換えで書き換え対象集合が 1 ファイルに収まらず doc-9 §4 が照合方法を定めていない（doc-9 §7 が後続課題と明記）、archive は読み取り層がマイルストーンのファイルパスを持たない（Document に source_path を足した TASK-32 と同型の実装ギャップ）。提示は doc-9 §5 に従い、(a) 版ずれの検出ではなく照合手段の不在であること、(b) 照合を省いた実行を代替経路として案内しないこと、を全項目で満たす（テストで両文言の存在を検査）。操作写像自体は失わないよう mapping 文字列として残した（削除は --task-handling <clear|keep|reassign>、reassign では --reassign-to <milestone> も必須）。

検証: vitest 208 passed（うち manage.test.ts 35）・svelte-check 0 errors・vite build 成功・cargo test 231 passed（Rust 無変更の確認）。GUI の実機確認は未実施。

実機確認（後追い）: 管理画面から milestone add を発行し、m-2「v0 公開フェーズ」が名称・説明とも意図どおり作成されることを確認した（backlog/milestones/m-2 - v0-公開フェーズ.md の frontmatter と Description に反映）。あわせて、画面が対象プロジェクトの Backlog ルートへ発行していること、CLI probe が通って発行が能動化されること、説明が作成時に設定できること（AC #3 の前提そのもの）も裏が取れた。

クローズ判断: AC #5 は未チェックのまま Done とする。GUI から発行できるのは作成のみで、改称・削除・アーカイブは doc-9 §4.2 の照合不能により入口を無効化＋理由表示にとどめており、押して確かめる対象が無い。AC #5 の最終確認は TASK-45（doc-9 拡張と入口の有効化）へ委ねる。チェックを付けずに閉じるのは、実際には満たしていない範囲を満たしたと記録しないため。

PR #16 は外部レビュー 3 巡で approve・マージ済み。レビュー由来の修正は 2 件とも「未保存入力の扱い」で、設計判断として残す。(1) [P1] selectProject が確認前に requested を代入しており、project がそれから導出されるため、A の文書編集セッションを開いたまま発行先だけ B へ移り、A の文書 ID と本文を B のルートへ送れた。切替先 slug を pending に保持して確定まで requested を動かさない形に変え、select は requested が動くまで uncontrolled なので保留時点で有効なプロジェクトへ戻す。確定時は作成フォームもリセットする（status・milestone が別ルートに無い値を指すため）。(2) [P2] dirty 判定が文書セッションだけで、作成フォームと「追加」未確定の入力欄が画面切替で無確認消失した。画面全体の dirty へ広げ（述語は lib/manage.ts に置いてテスト）、さらにエディタ自身の離脱経路は docEditorDirty（docDirty＋確定前タグ）で判定する。作成フォームはエディタ側 guard から外す（両経路で unmount されないため）。
<!-- SECTION:NOTES:END -->
