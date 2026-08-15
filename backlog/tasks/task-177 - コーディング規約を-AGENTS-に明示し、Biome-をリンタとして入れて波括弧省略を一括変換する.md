---
id: TASK-177
title: コーディング規約を AGENTS に明示し、Biome をリンタとして入れて波括弧省略を一括変換する
status: Done
assignee: []
created_date: '2026-08-14 22:22'
updated_date: '2026-08-15 00:18'
labels: []
dependencies: []
ordinal: 168700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-32 の実施。規約はこれまで所有者個人のグローバル設定にしかなく、AGENTS.md は持っていなかったため、Codex など他のエージェントには効いていなかった。規約の 4 群のうち Control flow だけが機械で検査でき、木には行単位の走査で 372 箇所の波括弧省略が見つかった (うち 1 件は placement.test.ts の誤検出で、実際の対象は 371 箇所。decision-32 §7)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 コーディング規約の 4 群が AGENTS.md と AGENTS.ja.md の双方にあり、見出しの構成と順序が対応している
- [x] #2 decision-32 が、規約をリポジトリへ置く判断・Biome をリンタとしてのみ採る判断・退けた道具 (Prettier / ESLint / Stylelint / Biome のフォーマッタ / recommended プリセット) とその実測根拠を持つ
- [x] #3 biome.jsonc がフォーマッタを無効・プリセット無し・style/useBlockStatements のみ有効にしており、pnpm run lint が実行できる
- [x] #4 波括弧を省いた制御フロー本体が src/ に 1 件も残っていない (Biome と、マークアップも読む行単位スキャナの双方で確認する)
- [x] #5 pnpm test と pnpm run check が通る
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実測は 2026-08-15、Biome 2.5.8 / Node 24 / pnpm 10.30.3、macOS。

変換は 371 箇所 (Biome が報告した 370 と、Svelte のマークアップ内にあって Biome が見なかった Swimlane.svelte の 1 件)。Biome の --unsafe 修正が出す 1 行形は house style ではないため、開き波括弧を条件行末・本体を次行 1 段下げ・閉じ波括弧を条件行と同じ桁に置く 3 行形へ展開したうえで入れた。削除された 374 行がすべて波括弧省略行であることを確認済みで、それ以外の既存コードは変形していない。

biome.json ではなく biome.jsonc なのは、前者が厳密な JSON として読まれ、コメント付きの設定が読み込みに失敗したうえで既定値の全ツリー走査へ黙って落ちるため (実際に一度 49,056 件を報告した)。

@biomejs/biome の追加で pnpm-lock.yaml が動いたので THIRD-PARTY-LICENSES.txt を再生成した。devDependency なので一覧の中身は変わらず、差分は lockfile のダイジェスト 1 行のみ。

CI は無いままなので pnpm run lint は手で走らせる必要がある。CI の新設は decision-32 の範囲外。
<!-- SECTION:NOTES:END -->
