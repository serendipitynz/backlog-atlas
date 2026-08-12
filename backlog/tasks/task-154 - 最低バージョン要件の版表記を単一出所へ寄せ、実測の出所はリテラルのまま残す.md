---
id: TASK-154
title: 最低バージョン要件の版表記を単一出所へ寄せ、実測の出所はリテラルのまま残す
status: In Review
assignee: []
created_date: '2026-08-12 02:52'
updated_date: '2026-08-12 07:18'
labels:
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 146200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
最低バージョン要件の引き上げが毎回大量のファイルを触る状態を、引き上げ前に減らす。2026-08-12 に TASK-99 のセッションでユーザーが確定した。v1.48.0 という文字列は、過去の記録である backlog/tasks を除いた契約と実装のソースに 184 箇所ある（この数は PR #102 をマージした後の main での値である。#102 の適用前は 179 で、同 PR が README へ 4 件・decision-26 へ 1 件を足した）。内訳は次の 4 つで、合計は 80＋40＋58＋6＝184 になる。①実測の出所を述べる註 80 箇所（Rust 49・フロントエンド 31）。②値の層 40 箇所（Rust 13・フロントエンド 27）。③doc の層 58 箇所（docs 41・decisions 17）。④AGENTS と README 6 箇所（AGENTS 2・README 4）。この 184 とは別に、src-tauri/wire-fixtures/ の記録に 2 箇所ある（cli_readiness.json の version と command_errors.json の minimum）。これらを 184 に数えないのは、記録が生成物だからである。AGENTS のテスト節が定めるとおり手で編集せず、ソース側の見本が変われば ATLAS_RECORD_WIRE_FIXTURES=1 cargo test の再記録でリテラルが追随する。したがって集約の対象でも、引き上げ時に手で書き換える対象でもない。184 のうち集約してよいのは②と③で、①は集約すると害になる。①を残す理由は、これらが「その事実をどの版で測ったか」の記録だからである。中央の定数を参照させると、定数を動かした瞬間に、誰も測っていない版で実測したという主張が 80 箇所ぶん自動生成され、このプロジェクトが保っている「不可能」と「未測定」の区別が機構の側から壊れる。加えてリテラルの書き換えが再実測を促す強制力になっており、外すと確認の契機が消える。②の中身は、update.rs の MIN_VERSION の定義と比較、利用者が画面で読む文字列、試験と fixture が supported な版を演じる入力値、および版を含む試験名である。版比較に使う値は MIN_VERSION 1 箇所で既に単一出所だが、フロントエンドと試験が独自にリテラルを持っているのが重複なので、そこを寄せる。wire.ts の CliReadiness は minimum を unsupported のときしか運んでいないので、ready にも載せる必要がある。②の正確な下位分類は着手時に数え直す（AC #5）。③は、doc-5 §3.4 が既に「本書の記述はすべて v1.48.0 の実測に基づく」と 1 回宣言しているとおり、doc ごとに実測基準版を 1 回宣言し、本文の繰り返しを落とす。画面文字列を組むときの注意として、参照するのは利用者の CLI の版ではなく Atlas が動作確認した版でなければならない。前者を出すと、1.50.1 の利用者へ「v1.50.1 の CLI に空集合化の手段がない」という偽の文を見せることになる。機構の追加なので、どの層を集約しどの層を残すかの根拠に doc か decision の居場所を与える。本タスクは TASK-152 の前に置く。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 版比較の値・試験の入力値・fixture の入力値が update.rs の MIN_VERSION を単一出所とし、フロントエンドの製品コードと試験の入力値からリテラルの版表記が消えている（実測註は decision-27 §4 のとおりリテラルのまま残る。screen-text.test.ts が検査のために植える見本と、src-tauri/wire-fixtures/ の記録も対象外 — 記録は生成物なので手で編集せず ATLAS_RECORD_WIRE_FIXTURES=1 cargo test の再記録で追随する）
- [x] #2 画面に出る文が版表記を持つのは、利用者の CLI の版と動作確認済み版の差そのものを述べる 1 文だけであり、その文は CliReadiness の項目を読む（利用者の CLI の版を動作確認済み版として出す経路が無い）
- [x] #3 doc ごとに実測基準版を 1 回宣言する形になり、本文の繰り返しが落ちている
- [x] #4 実測の出所を述べる註がリテラルのまま残っていること、および生成物の記録を対象外とすることの理由が doc か decision に書かれている
- [x] #5 引き上げ時に触る箇所が数え直され、TASK-152 の作業量として記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**決定は decision-27**（2026-08-12。doc-11 §8 と AGENTS の「動作確認済み版の書き方」節が受け皿）。語と指示対象は `_sandbox/handoff/referent-table/referent-table-task-154.md` 第 1 版で本文より先に固定した。

**数え直し（AC #5）**: 着手時 189 箇所・45 ファイル（起票時の 184 は行数と出現数を混ぜた値で、内訳も docs とコードで各 1 ずれていた）。作業後 122 箇所・39 ファイル。**引き上げで触るのは 170 → 100 箇所・39 → 30 ファイル。**TASK-152 の Description と AC へ内訳ごと記録した。

**AC #1・#2 は着手後に文言を直した。** 起票時は「画面文字列が MIN_VERSION を単一出所とする」（＝画面に版を残し、wire の ready に minimum を載せて運ぶ）前提で書かれていたが、着手して**フロントエンドが版を無条件に持てる出所は無い**ことが分かった — CliReadiness が null（probe 未応答）と unavailable（App.svelte が自前で組む）のとき版を載せられず、draft・completed/archive の読み取り専用理由とマイルストーンの 2 つの hint はその状態でも画面に出る。そこでユーザーに 2 案を提示し、**画面文字列から版表記を全部落とす**方を確定した（2026-08-12）。根拠は 2026-08-11 の目視（状態遷移の確認質問から版番号を落とした判断。版番号は「利用者がその瞬間に訊いていないことに答える」）と 2026-08-08 の TASK-123（項目別理由を ノイズ として落とした）で、新しい例外ではなく既存の 2 つの判断の一般化である。この結果 wire の変更は不要になり、CliReadiness の minimum は unsupported のままである。

**同じセッションで確定した 3 点**（いずれもユーザー確認済み）: ①decisions は集約対象にしない（日付つきの過去の測定であり、書き換えると過去の判断の根拠を改竄する。要件の写し 2 箇所だけ参照へ）②根拠の置き場は新しい decision（decision-7 は値を持ち、decision-27 は表記を持つ）③コードの実測註 89 相当はリテラル維持（ファイル単位の宣言へ畳めば触るファイルは 20 前後まで減るが、1 行の書き換えが 10 個の事実を再実測済みに見せるので採らない）。

**新しい仕掛け**: `src/lib/confirmed-version.ts`（記録から動作確認済み版を読む試験・fake 用モジュール。アプリは import しない — build 後の bundle に版文字列が 0 件であることを確認した）と、`screen-text.test.ts` の「画面に出る文が版を名乗らない」検査（doc-11 §8 の 2 つ目のテキストだけで判定できる種別）。前者の読みは `wire-fixture.test.ts` が command_errors.json のminimum と突き合わせて固定する。

**検証**: cargo test 394 passed / cargo fmt / cargo clippy 無警告 / pnpm test 847 passed / svelte-check 0 errors / pnpm run build 成功。TASK-150 の兆候が 4 例目（1 回目だけ markdown-figure.component.test.ts が timeout、environment 29.39 秒。再実行で 845/845）。
<!-- SECTION:NOTES:END -->
