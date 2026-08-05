---
id: TASK-65
title: マイルストーン説明の直接編集を決定し、管理 Markdown 直接編集の例外を契約へ書く
status: In Review
assignee: []
created_date: '2026-07-31 23:30'
updated_date: '2026-08-05 22:40'
labels:
  - ui
  - project-detail
  - decision
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-58
  - TASK-64
documentation:
  - backlog/docs/doc-5 - Backlog-更新アダプター-設計.md
  - backlog/docs/doc-9 - 同一-Backlog-ルート更新時の競合検出と再読み込み-設計.md
priority: high
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI v1.47.1 の milestone は list/add/rename/remove/archive のみで update/edit が無く、説明は milestone add -d の作成時にしか設定できない（実測確認済み）。作成後に説明を直せないのは実運用で困るため、マイルストーンの Description 節に限って Atlas が管理 Markdown を直接書き換えることを認める。これは AGENTS.md §Updates と decision-2 の「更新は Backlog CLI へ委譲する」に対する契約変更であり、根拠を decision として残さずに実装してはならない。範囲は Description 節の本文のみとし、frontmatter（id・title）には触れない。書き込みは一時ファイル置換で原子的に行い、更新前に doc-9 の外部変更検出を通す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 例外の範囲・理由・書き込み方法・触らない範囲を定めた decision が backlog/decisions/ にある
- [x] #2 AGENTS.md と AGENTS.ja.md の §Updates が同じ内容で改訂され、両者が矛盾しない
- [x] #3 doc-5 と doc-10 の「作成後の説明の編集は提供しない」記述が改訂されている
- [x] #4 説明の更新が Description 節だけを置き換え、frontmatter と他の節が 1 バイトも変わらない試験がある
- [x] #5 更新前に外部変更を検出した場合は書き込まずバージョン不整合として返す試験がある
- [x] #6 書き込み途中に失敗しても旧ファイルが残る試験がある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-06 実施。**決定先行**として争点を提示し、ユーザーが (a) 直接変更の例外を認める・説明を空にできる を選択した。

## 決めたこと

**decision-21** を書いた（AGENTS.md §Updates / AGENTS.ja.md §更新 / decision-2 の「管理ファイルを直接変更しない」に対する例外）。反転したのは「Atlas は管理ファイルへ書かない」の 1 点だけで、読み取りを直接解析とすること・CLI に写像先がある更新を CLI へ委譲することは動かしていない。

例外が及ぶのは 3 条件をすべて満たす操作だけ:
1. CLI がその値を書く経路を現に持っている（＝新しい書式を発明しない）
2. frontmatter とファイル名に触れない
3. 書く範囲が読み取り層の読む範囲と同一である

「CLI に手段が無い」は単独では理由にならない。文書の削除・参照の全消し・assignee 解除・依存の全消しはいずれもこの 3 条件を満たさないので通らない（doc-5 §3.1 に明記）。

**説明を空にできる**（TASK-109 のタグ全消しと同じ判断）。**行頭 `##` を含む説明は入力検査で拒む**（こちらで決めた。理由は「CLI に手段が無い」ではなく、読み取りが次の `##` で切るので保存した文字列の一部が次の読み込みで画面から消えること）。

## 実測（2026-08-06、使い捨てルート・v1.48.0）

- `milestone --help` は `list`/`add`/`rename`/`remove`/`archive` の 5 つのみ。`update`/`edit` は無い（TASK-58 の測定が現在も成立）。`milestone add` のオプションは `-d` だけ。
- `milestone add -d` が書く形: `---\nid: m-N\ntitle: \"T\"\n---\n\n## Description\n\n<説明>\n`。SECTION コメント対ではなく素の `##` 見出し。複数行はそのまま保つ。
- `-d` 省略時は説明が `Milestone: <name>` になる（**説明の無いマイルストーンを CLI は作らない**）。
- `rename` 後は `title` とファイル名だけが変わり、説明の本文はバイト同一で残る。
- `-d` に `## Notes` を含む説明を渡すと CLI は検査せずそのまま書き、読み取り層は次の `##` で切る（入力検査の根拠）。
- `remove` → `add` で作り直すと id が `m-1` → `m-3` に変わり、`archive/milestones/` に旧ファイルが残る（「CLI だけで説明を直す」代替が成立しないことの根拠）。

## 実装

- **`read/parse.rs` に `description_span`** を新設し、**読み取りと書き込みが同じ関数で範囲を求める**ようにした（条件 3 が構成上成り立つ）。`read.rs` の `section_or_heading` は撤去し `description_text` へ。
- **`update.rs`**: `UpdateOperation::MilestoneDescribe` を追加。`plan_operation` の戻りを `Vec<Invocation>` → **`Vec<Mapped>`**（`Invoke` / `WriteMilestoneDescription`）に広げ、写像先が CLI でないことを型で表した。各 match アームが自分の写像先の種別を名指すので、操作を足すときに「どちらか」が決定になる。`DirectWriter` trait・`WriteFailure`・`FailureKind::Write`・`MILESTONE_DESCRIBE` を追加。`milestone_text_with_description` が純関数で splice する。
- **`sync.rs`**: `MilestoneDescriptions` が `DirectWriter` を実装する。**書く先はモデルから引く** — 版を照合したのと同じ `find_milestone` なので「照合した先」と「書いた先」が離れない。`operation_target` に `MilestoneDescribe` を足した（書き換え対象集合はマイルストーンのファイル 1 件、参照追随書き換えなし）。`guarded_update`・`ProjectState::apply` は `files: &dyn store::Files` を取るようになった。
- **書き込みは `store::replace`**（decision-17 の一時ファイル置換）。新しい保存機構は作っていない。
- **範囲へ入れるバイト列**: 説明をそのまま置くと次の `## Notes` が最後の語と同じ行に来て、`##` が行頭でなくなり範囲を閉じなくなる。先頭に改行、末尾は元の空白の並び（無ければ改行 1 つ）を復元する。説明は trim して書く（読み取りが trim するので、しないと保存直後の値と読み戻す値が食い違う）。
- **フロントエンド**: `buildMilestoneDescribe`（空は発行・未変更は拒否・行頭 `##` は拒否）、`MILESTONE_DESCRIPTION_NOT_EDITABLE` と `WITHHELD_MILESTONE_OPERATIONS` の 1 件を撤去（マイルストーン側の提供しない操作区画は 0 件になり、`withheld` snippet が空リストで何も描かない）。`ProjectDetail.svelte` の操作ペインに説明の入力欄と「説明を保存」を置いた。
- **説明の下書きは `string | null` の上書き**にした。選択時に文字列を焼き付けると、外部変更で説明が変わったときに利用者が触っていない箱が未保存扱いになる（PR #65 1R [P2] の裏返し）。触っていない箱は常に現在の読み取りを映す。
- **破棄前確認の文言を「マイルストーンの操作に未保存入力があります」→「マイルストーンに未保存入力があります」へ改めた**（doc-10 §6 も同時に改訂）。守る対象が開いている操作の入力だけでなくなったため。

## 文書

decision-21 新設。AGENTS.md / AGENTS.ja.md §Updates／§更新 を同内容で改訂。decision-2 に追記。doc-5 §1（直接書き込み操作の定義）・§2・§3（表に 1 行）・§3.1・§3.2・§5・§6。doc-9 §4 手順 2・§4.1。doc-10 §1・§6・§9。doc-12 §9（**§8.4 の転記本文は直さない** — 転記は原文を写す文書で、原文から外れたことを記録するのは doc-10 §6 の側。§6 の逸脱 3 件目・画面全体で 5 件目）。

## 検証

- `cargo test` **369 件**（`--include-ignored` **373 件**）・`cargo fmt --check`・`cargo clippy --all-targets` すべて通過。
- `pnpm test` **597 件**・`pnpm run check` 288 ファイル 0 エラー・`pnpm run build` 通過。
- wire fixture は `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` で録り直してコミットした（`wire_tokens.json` の `FailureKind` に `write` が入る）。
- **借り物 playwright（WebKit・1280×800、`_sandbox/project-detail-check/?milestones=6`）で実測**: 提供しない操作区画は 0 個（区画ごと出ない）、操作ペイン 800px に対し textarea 760px で横スクロールなし（`scrollWidth === clientWidth`）、説明を編集すると一覧のカードに未保存チップが出る、行頭 `##` で「説明を保存」が `disabled` になり理由が隣に出る、未保存のまま別のカードを押すと破棄前確認が立つ。
- **測っていないもの**: 実機 webview での見え方、ダーク以外のテーマ、実際の Backlog ルートに対する保存の往復（ユーザーの目視へ回す）。
- **コンポーネントテストは足していない**。増えたのは未保存入力の出どころであって画面横断契約ではなく、離脱時の破棄前確認は既存の「プロジェクト詳細の離脱」が押さえている（AGENTS の「画面ごとのコンポーネントテストは作らない」）。
<!-- SECTION:NOTES:END -->
