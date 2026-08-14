---
id: decision-32
title: コーディング規約を AGENTS に明示し Biome をリンタとしてのみ採る
date: '2026-08-14 22:19'
status: accepted
---
## Context

**このリポジトリのコーディング規約は、リポジトリの外にしか無かった。** Comments・Control flow・
Functions・API documentation comments の 4 つの規則群は所有者個人の `~/.claude/CLAUDE.md` に在り、
`AGENTS.md` はそのどれも持っていない。持っていたのは「Code comments in English」の 1 行だけである。

**これは配り方の欠陥である。** `AGENTS.md` は自身を「Execution rules for agents (e.g. Codex)」と
名乗る。Codex は所有者個人の設定を読まないので、**同じリポジトリで、規約が効くエージェントと効かない
エージェントが混在していた。** 人が読む経路も同じで、規約はどこにも書かれていない。

**そのうえ `AGENTS.md` の Working conventions は、存在しない道具を走らせろと指示していた** —
「run the relevant tests, formatter, and static analysis」。フロントエンドに formatter は無く、
`pnpm run check` は `svelte-check` で型だけを見る。リンタも無い。

語と指示対象は `_sandbox/handoff/referent-table/referent-table-decision-32.md` で本文より先に固定した。
以下で使う **コーディング規約**（上の 4 規則群）・**Biome のリンタ**（規則違反を報告する側。`.svelte`
は `<script>` ブロックだけを読む）・**Biome のフォーマッタ**（整形して書き戻す側）・**波括弧の 3 行形**
（開き波括弧を条件行の末尾に置き、本体を次行へ 1 段下げ、閉じ波括弧を条件行と同じ桁に置く形）は
その表の語である。

### 実測基準版

実測は 2026-08-15 に macOS 上で行った。Biome 2.5.8、Node 24、pnpm 10.30.3、対象は `src/` と
`scripts/` の 93 ファイルである。Rust 側は測っていない — 下の該当項がその別を名乗る。

### 実測 (2026-08-15) — 木が規約に合っているか

**4 群のうち 3 群は既に合っていた。**

- **Comments は合っている。** コメントアウトされたコードが 0 件、TODO / FIXME / XXX / HACK が 0 件。
  次行のコードを語彙的に反復しているコメントは全ツリーで 13 件で、うち署名の言い換えに当たるのは 2 件
  （`subprocess.rs` の `/// The drained bytes as text.`、`read/parse.rs` の
  `/// Read an optional integer field (ordinal).`）。コメント行は全体の約 26% と多いが、**中身は
  why に寄っており、量ではなく種類で見れば規約の求める形である。**
- **Functions は合っている。** 60 行を超える関数は Rust 23,677 行に対して 21 個（大半が試験、非試験の
  最長は `read.rs` の `parse_task` 132 行）、TS・Svelte は試験を除いて 3 個。
- **API documentation comments も同じ 13 件の範囲に収まる。**
- **Control flow だけが全面的に外れていた。** 波括弧を省いた制御フロー本体が 372 箇所、うち試験を
  除いて 294 箇所、非試験 92 ファイル中 35 ファイルに散っている。次行に本体を置く形は 0 件で、
  すべて 1 行完結の早期 return か単文である。

**既存の波括弧の形に揺れは無い。** 単一行ブロック（`if (c) { 本体 }`）は 0 件、複数行は 384 件。
`else` は `} else` が 12 に対し独立行が 4 で、その 4 つはいずれも波括弧を省いた `if` に付いていた。

### 実測 (2026-08-15) — Biome が何を見るか

- **リンタは `.svelte` の `<script>` ブロックを読む。** `useBlockStatements` だけを有効にして 370 件を
  報告し、**ファイル単位で独自スキャナの計数と一致した**（App.svelte 53、ProjectDetail.svelte 37、
  TaskDetail.svelte 19）。93 ファイルを 50ms で走る。
- **リンタは Svelte のマークアップを読まない。** `Swimlane.svelte` のインライン
  `onanimationend` ハンドラの中にあった 1 件を取りこぼした。**`pnpm run lint` が 0 でも、規約に
  合っていることの保証にはならない。**
- **リンタの修正は `--write` では効かず `--unsafe` を要する。** 修正後の形は
  `if (c) { 本体 }` の 1 行形で、**このリポジトリが 384 箇所で使っている形ではない。** 既存の
  インデントは保つ。
- **フォーマッタは使えない。** `.svelte` の `<script>` ブロック全体をインデント 0 に落とす —
  `Settings.svelte` の 391 行の script が 694 行の差分になった。Prettier の
  `svelteIndentScriptAndStyle` に当たる設定は無い。**`<style lang="scss">` とマークアップは読まない**
  ので、18 コンポーネントすべての SCSS はどのみち守備範囲の外にある。91 ファイル中 69 ファイルが
  再整形の対象になる。
- **`recommended` プリセットは壊れる。** 431 件を報告し、**そのうち 391 件が
  `noUnusedVariables` / `noUnusedImports`** で、18 の `.svelte` ファイルと 1 つの `.ts` ファイルに
  集中する。マークアップを読まないので、マークアップでだけ使う束縛が未使用に見える —
  `TaskCard.svelte` の `Icon` がその 1 つで、**「安全でない修正: import を削除する」まで提案する。**

### 実測しなかったもの

- **Prettier は差分を測っていない。** 実行の許可が下りなかったため、判断は既存の整形の計測から
  導いた（下記）。
- **ESLint は導入を試していない。** 依存の実数を数えていない。
- **Rust 側は測っていない。** `cargo fmt` と `cargo clippy` は在るが、規約に対して何を落とすかを
  数えていない。Rust は言語が波括弧を強制するので Control flow の違反は構文上あり得ない。

## Decision

1. **コーディング規約を `AGENTS.md` と `AGENTS.ja.md` の `## Coding style` 節に置く。**
   両方に置くのは、`AGENTS.md` の冒頭が二者の不一致を実装着手の停止条件と定めているためで、
   片方だけの追加はそれ自体が欠陥になる。**規則の本文は AGENTS が持ち、判断とその理由はこの
   decision が持つ** — 既存の分業（decision が「なぜ」、AGENTS が「どうする」）に合わせる。
2. **`AGENTS.md` の Working conventions の「run the relevant tests, formatter, and static analysis」を
   実態に合わせる。** フロントエンドに formatter は無く、置かないと決めた（下記）ので、名指しするのは
   `pnpm test`・`pnpm run check`・`pnpm run lint` と Rust 側の `cargo` 群である。
3. **Biome をリンタとしてのみ採る。** `@biomejs/biome` を devDependency に 1 つ加え、`biome.jsonc` で
   **フォーマッタを無効**にし、**プリセットを採らず**、`style/useBlockStatements` だけを有効にする。
   `pnpm run lint` を追加する。
4. **版は範囲ではなく厳密に留める。** 他の devDependency が `^5` などの範囲を持つのと違い、Biome は
   `2.5.8` で固定する。リンタのマイナーは規則を増やすので、範囲だと**誰もコードを変えていないのに
   新しい `pnpm install` が検査を落とす。**
5. **波括弧の 3 行形をこのリポジトリの形とする。** 単一行ブロックが 0 件、複数行が 384 件という
   既存の実態がそのまま形を決める。**`else` は `} else` に付ける。**
6. **`lint:fix` に当たるスクリプトを置かない。** Biome の `--unsafe` 修正が出すのは 1 行形で、
   3 行形ではない。**走らせやすい形で置くと、規約に合わない形が規約の名の下に入ってくる。**
   修正は手で 3 行形に書く。
7. **既存の 371 箇所は一括変換する。上の 372 との差 1 は取りこぼしではない。** 行単位で数える
   走査が `placement.test.ts` の 1 箇所を誤検出していた — 型アサーションで折り返した `for` で、
   波括弧は既に付いている。**変換の対象は 371 で、Biome も走査も変換後に 0 を返す。**
   その 371 の内訳は Biome が見つけた 370 件と、マークアップの中にあって
   Biome が見なかった 1 件である。

### 採らなかったもの

- **Prettier を採らない。** 理由は 3 つある。**第一に、見つかった問題を 1 件も直さない** — 整形は
  文の構造を変えないので、`if (c) return;` はそのまま残る。**第二に、Prettier が解決する揺れが
  この木には残っていない** — import の引用符は 169 件すべてダブルクォートで 0 件の揺れ、
  インデントもセミコロンも一貫している。**第三に、行幅が定まっていない** — 非コメントのコード行だけで
  100 桁超が 901 行、110 桁超が 1,864 行あり、どの幅を選んでも木の大半が差分になる。
- **Biome のフォーマッタを有効にしない。** 上の実測のとおり `.svelte` の script を潰す。
  **`biome.jsonc` の当該箇所にその実測を書いてある。**
- **ESLint を採らない。** `curly` を `.svelte` まで含めて持てる点は Biome と同じで、**Biome が
  同じ仕事を依存 1 個で果たすため、依存 4 個以上（`eslint`・`typescript-eslint`・
  `eslint-plugin-svelte`・`svelte-eslint-parser` と推移的依存）を積む理由が無い。**
  型付きリンティングは `svelte-check` と重なるので、どちらの道具でも採らない。
- **Stylelint を採らない。** SCSS の総量は大きいが、**コーディング規約に CSS の条項が 1 つも無い** ため、
  規約準拠という観点では対象が存在しない。doc-11 のデザインシステムの規則を機械化するかどうかは
  別の判断であり、この decision はそこに触れない。

## Consequences

- **4 群のうち機械が持つのは Control flow だけである。** Comments・Functions・API documentation
  comments は `pnpm run lint` では落ちず、レビューが持つ。**規約の文書がこの 3 群のために要る** —
  リンタを入れたから文書が要らなくなる、にはならない。
- **`pnpm run lint` が 0 でも規約準拠の証明にはならない。** Biome は Svelte のマークアップの中の
  制御フローを見ない。今回はそこに 1 件在った。**マークアップにロジックを書いた変更は、リンタが
  何も言わなくても目で見る。**
- **設定ファイルは `biome.jsonc` であって `biome.json` ではない。** Biome は後者を厳密な JSON として
  読むので、コメントを含む `biome.json` は**読み込みに失敗する。そして失敗は停止ではなく、既定値で
  全ツリーを走査する黙った縮退である** — 実際に一度そうなり、`_sandbox/` と `src-tauri/target/` を
  舐めて 49,056 件を報告した。`files.includes` は `src/**` と `scripts/**` を正の側で名指ししてある。
- **`recommended` を有効にすると壊れる。** 上の 391 件が出るうえ、その修正提案はマークアップで
  使っている import の削除である。`biome.jsonc` にその実測を書いてあるが、**プリセットを足す変更は
  この項を読んでから行う。**
- **走らせる場所は decision-33 が置いた。** この decision の時点ではリポジトリに CI が無く、
  `pnpm run lint` は手で走らせるしかなかった — **リンタを入れたことで守られるようになったわけでは
  なく、守れる手段が 1 つ増えただけだった。** その穴は decision-33 が埋めており、`pnpm run lint` は
  そこで PR ごとに走り、マージ要件の 1 つになっている。
- **`pnpm install` の未承認ビルドスクリプトは増えない。** `@parcel/watcher` と `esbuild` の 2 つの
  ままである（AGENTS.md Toolchain）。Biome は最適プラットフォームの実体を optional dependency で
  解決する。
- **371 箇所の変換は 50 ファイル・1,100 挿入・374 削除である。** 削除された 374 行がすべて波括弧を
  省いた制御フロー行であることを確認してあり、**それ以外の既存コードは変形していない。**
  `git blame` はこの 371 行について流れる。
- **README には何も足さない。** 規約は貢献者向けの実行規則であって、読者が行動する対象
  （何を入れるか、何で動くか、新版がどう届くか）ではない。Release 節の点検はそれらの主張に対する
  ものだと AGENTS.md が定めている。
