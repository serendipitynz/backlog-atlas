---
id: TASK-25
title: Tauri + Rust プロジェクト雛形と検証基盤を作る
status: In Progress
assignee: []
created_date: '2026-07-22 12:06'
updated_date: '2026-07-23 00:28'
labels:
  - 'kind:maintenance'
milestone: m-1
dependencies: []
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-1（Tauri/Rust）に基づき、Atlas プロセス本体の骨格を作る。フロントエンド構成（フレームワーク・ビルドの有無）は decision に無いため本タスクで決定し、選定理由と範囲を Implementation Notes に記録する（別 decision は立てない）。doc-8 は Ace の vendored + textarea フォールバック（serenebach パターン）を前提にしている点を考慮する。ユーザー方針により Tailwind は導入せず、スコープドスタイル（scoped SCSS 等）を基本とする。ビルド・テスト・整形・静的解析を通せる状態にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tauri + Rust の最小アプリが起動し、空ウィンドウを表示できる
- [x] #2 フロントエンド構成（フレームワーク・ビルド有無）を決定し、選定理由と範囲を Implementation Notes に記録している
- [x] #3 cargo build / test / fmt / clippy 相当がエラーなく通る
- [x] #4 Tailwind を導入していない（スコープドスタイル方針を採る）
- [x] #5 AGENTS の依存追加ルールに従い、新規本番依存の選定理由を記録している
- [x] #6 新規本番依存（未決定のフロントエンド構成、後続の parser・Git・file watcher・editor 等）は、導入前に選定理由と導入範囲を確認することを明示的なゲートにする（事後記録だけでは満たさない、AGENTS）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## フロントエンド構成の決定（AC #2）

- 採用: Svelte 5 + Vite + TypeScript（ビルドあり）。スタイルはコンポーネントスコープド SCSS（Svelte `<style lang="scss">`）を基本、全体最小限のみ `src/app.scss`。
- 選定理由:
  - 本アプリはスイムレーン・タスク詳細・編集セッション・競合検出/再読込を持つ動的 SPA（doc-7/doc-8/doc-9）であり、静的サイト向け SSG（Astro 等）は不適。
  - ユーザー方針で Tailwind 不採用・スコープドスタイル基本。Svelte はコンポーネントスコープドスタイルが言語ネイティブで、追加ランタイム依存なしに scoped SCSS を満たす。
  - 依存最小方針に最も適合（コンパイル時にランタイムがほぼ消える）。React/Vue と比べ本番依存が最小。ユーザーと重さ比較のうえ Svelte を選択。
- SvelteKit は不採用: create-tauri-app の svelte テンプレートは SvelteKit（ルーティング/SSR 機構・adapter-static）だが、単一ウィンドウの Tauri SPA には過剰で依存最小方針とずれるため、素の Svelte + Vite に組み替えた（`src-tauri` は流用）。
- 範囲: 本タスクは骨格（空ウィンドウ + IPC スモークテスト画面 `App.svelte`）まで。実画面は後続タスク。
- Ace: doc-8 の vendored + `textarea` フォールバック前提を尊重し、Ace は npm 依存化しない（後続 editor タスクで vendored 導入）。

## 依存の選定理由（AC #5）

本番依存（導入済み）:
- Tauri（`tauri`, `tauri-build`）: decision-1 で確定済みのデスクトップ実装方式。
- `serde`（derive）: Tauri IPC の引数・戻り値の (de)serialize 基盤。全後続コマンドが依存するため骨格から導入。
- `@tauri-apps/api`: フロントから Rust コマンドを呼ぶ IPC ブリッジ。

dev 依存（ツール）: `vite`, `@sveltejs/vite-plugin-svelte`, `svelte`, `svelte-check`, `sass`（scoped SCSS 用）, `typescript`, `tslib`, `@tauri-apps/cli`。

scaffold から除外:
- `tauri-plugin-opener` / `serde_json`: 骨格に不要のため見送り。外部エディタ/URL オープン（doc-8）等を要する後続タスクで理由付きで導入する。

## 新規本番依存の導入ゲート（AC #6）

以下は未決定/未導入。導入前に選定理由と導入範囲を確認することを必須ゲートとする（事後記録だけでは満たさない、AGENTS「Dependencies」）:
- Markdown/frontmatter パーサ（読み取り層, doc-4 / TASK-27 以降）
- Git 連携（`gix`/`git2` か CLI 呼び出し, TASK-10 で決定, doc-6）
- ファイル監視（競合検出/再読込, doc-9）
- エディタ部品（Ace vendored, doc-8）
- URL/ファイルオープン（`tauri-plugin-opener` 等, doc-8 外部エディタ経路）

## 検証（AC #3, #4）

- `cargo fmt --check`: clean / `cargo clippy --all-targets -- -D warnings`: 0 警告 / `cargo build`: ok / `cargo test`: 1 passed。
- `npm run check`（svelte-check）: 0 errors / `npm run build`（vite）: ok（dist 生成）/ `npm run tauri dev`: ウィンドウ起動確認（`Running target/debug/backlog-atlas`、パニックなし）。
- Tailwind 不使用（AC #4）: 依存・`@tailwind` ディレクティブとも無し（grep 確認）。

## 主要ファイル

- `index.html`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `package.json`
- `src/main.ts`, `src/App.svelte`, `src/app.scss`, `src/vite-env.d.ts`
- `src-tauri/`（`Cargo.toml`, `tauri.conf.json`, `src/lib.rs`（`greet` スモークコマンド + 単体テスト）, `src/main.rs`, `capabilities/default.json`）
<!-- SECTION:NOTES:END -->
