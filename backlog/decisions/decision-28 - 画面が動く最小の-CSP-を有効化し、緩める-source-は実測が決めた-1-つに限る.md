---
id: decision-28
title: 画面が動く最小の CSP を有効化し、緩める source は実測が決めた 1 つに限る
date: '2026-08-12 20:21'
status: accepted
---
## Context

`src-tauri/tauri.conf.json` の `app.security.csp` が `null` のままである。起票の根拠は
`_sandbox/repository-implementation-findings-2026-08-01.md` のセキュリティ節で、そこは
「危険な HTML 挿入や外部 Web コンテンツを読み込む経路は確認していないので**単独の脆弱性とは判定
しない**が、そうした機能を足す前に有効化する必要がある」と述べている。**したがって本決定が閉じるのは
いま開いている穴ではなく、後から開く道である。**公開前が最後の安価な時点なのは、UI が固まった後なら
違反の原因が改修に混ざらないからである（TASK-98 の対応順の理由）。

**decision-25 は「後続への影響」で本タスクを名指しし、選択を 1 つ委譲していた** —
「`style-src` に `'unsafe-inline'` を入れる」か「作図結果 の色を捨てる」か。あちらは 整形表示 の PR で
測ったので、視野にあったのは mermaid だけだった。

2026-08-13 に出荷形（production ビルド・CSP は応答ヘッダ）で **6 画面 × 2 エンジン × 5 ポリシー**を
測り直した。playwright の WebKit（≒ WKWebView・WebKitGTK）と Chromium（≒ WebView2）、窓 1280×800。
まず doc-11 §14.5 の記録（`style-src 'self'` で違反 WebKit 111 件・Chromium 192 件、作図結果 の `fill` が
`rgb(236,236,255)` → `rgb(0,0,0)`）を同じ値で再現し、ハーネスの設定が正しいことを確かめてから測った。

**委譲された選択は成り立たない。編集部品 も同じ source を要求する。** `public/vendor/ace/ace.js` は
`importCssString` で `<style>` を 7 か所から作り、nonce を受け取る経路を持たない（`ace.js` に `nonce` は
0 件）。`style-src 'self'` で測ると違反が両エンジンとも 4 件、`.ace_editor` が `relative` から `static` へ
落ち、行高が 16px から WebKit 17px・Chromium 18px へずれる。**作図結果 の色を捨てても `'unsafe-inline'`
は 編集部品 のためになお要る**ので、decision-25 が並べた 2 つ目は選択肢ではない。**Ace は「将来足すもの」
ではなく decision-8 で既に入っている** — TASK-98 の AC #4 もその前提のまま書かれていた（AC を直し、
理由は Implementation Notes にある）。

**`'unsafe-inline'` が通す経路は 2 つあり、Atlas 自身はどちらも使っていない。** 同じ実測で、
`setAttribute("style", …)` は `style-src 'self'` の下で両エンジンとも止まり、
`style.cssText = …` と `style.setProperty(…)` は止まらなかった（CSSOM への書き込みは CSP の検査対象で
ないため）。画面の `style="--prose-max-width: …"`（doc-8 §2.1 の 48rem を運ぶ経路）が
`'unsafe-inline'` 無しでも効き続けるのはこのためで、**Svelte が属性ではなく CSSOM 経由で入れている**。
つまりこの 1 語は Atlas 自身のためではなく、mermaid と Ace の `<style>` 要素のために入る。

語と指示対象は `_sandbox/handoff/referent-table/referent-table-task-98.md` 第 1 版で先に固定した。
以下で使う **緩める source**（`default-src` の落ち先より広い側へ倒す source）・**経路の source**
（Tauri の IPC が通る宛先として framework 側の実装が要求する source）・**絞る宣言**（Atlas が持たない
能力を落ち先より狭く閉じる directive）・**書かない宣言**（書いても落ち先と同値になるため置かない
directive）・**黙って戻せる行**（消しても例外も空白も出ないため、消えたことが画面から分からない部分）は
その表の語である。

## Decision

### 1. 値

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
```

**この 9 行で、6 画面とも両エンジンで違反 0 件である。**外部 CSS・インライン style 属性・作図結果 の色・
編集部品 の昇格はすべて健全なまま（`document.styleSheets.length` は地の 1 本に対し、作図で +3、Ace で +4）。

### 2. 行は 4 種別で、種別ごとに動かす主体が違う

- **緩める source は `style-src` の `'unsafe-inline'` 1 つだけ。**根拠は上の実測で、動かすのも実測である
  （mermaid と Ace の両方が `<style>` を使わなくなったと測れた回にだけ消せる）。**片方を測っただけで
  消さない** — decision-25 がそうしていた。
- **経路の source は `connect-src` の `ipc:` と `http://ipc.localhost` の 2 つ。**根拠は framework 側の
  実装で、Atlas の実測ではない（ハーネスの偽 IPC は同じ束の中の関数なので `fetch` を通らない）。
  `tauri/scripts/ipc-protocol.js` が `fetch(convertFileSrc(cmd, 'ipc'))` を呼び、`scripts/core.js` が
  macOS・Linux で `ipc://localhost/<cmd>`、Windows で `http://ipc.localhost/<cmd>` を組む。
  `tauri-utils-2.9.3/src/config.rs:2741` が同じ 2 つを設定例に載せている。
- **絞る宣言は 5 つ**（`object-src`・`frame-src`・`worker-src`・`base-uri`・`form-action` の `'none'`）。
  Atlas は plugin も iframe も worker も `<base>` も送信する form も 1 つも持たない。動かすのは
  **機能追加**であって実測ではない。**`base-uri` と `form-action` は `default-src` へ落ちない**ので、
  書かなければ無制限のまま残る — Atlas には `{@html}` が 1 か所ある（decision-25）ので、この 2 行は
  他の 3 行と違って落ち先の穴を塞いでいる。
- **書かない宣言は `img-src` と `font-src`。**`'self'` と書いても `default-src 'self'` の落ち先と同値で、
  実効が 1 つも変わらない。**網羅して見せるために書かない** — 変わらない行が混ざると、変わる行との
  区別が読めなくなる。整形表示 は画像を描かず代替文だけを出し（doc-8 §9.2）、`app.scss` に
  `@font-face` は 1 つも無い。

### 3. 緩めるときは、この表の行を書き換える

| 足す機能 | 書き換える行 | 備考 |
|---|---|---|
| 外部の画像・フォント・スタイルを読む | `img-src`・`font-src` を**新設**し、`style-src` に origin を足す | いまは 書かない宣言 なので、行を足すところから始まる |
| iframe を使う（mermaid の `securityLevel: 'sandbox'` を含む） | `frame-src` | decision-25 は `'strict'` を採っており、`'sandbox'` はテーマ追随を失うので現状は選ばない |
| Web Worker を使う（Ace の構文 worker を有効にする場合を含む） | `worker-src`。blob から起こすなら `blob:` | `Editor.svelte` はいま `setUseWorker(false)` を渡している |
| WebAssembly を読む | `script-src` に `'wasm-unsafe-eval'` | 現在どの依存も要求していない（実測で違反 0 件） |
| IPC 以外の通信をする | `connect-src` | いま `'self'` すら入っていない — 経路の source の 2 つだけである |

**緩めた回は、出荷形で測り直す。** `pnpm tauri dev` では CSP は当たらない（`build.devUrl` があると文書は
Vite が配り、`manager/mod.rs` の `get_asset`／`csp()` を通らない）ので、dev で動いたことは根拠にならない。
手順は `_sandbox/csp-check/measure-csp.mjs` にある。

### 4. 黙って戻せる行にだけ試験を置く

`src-tauri/src/csp.rs` は 3 つだけを検査する — 値が入っていること、`connect-src` が 経路の source を
2 つとも持つこと、`style-src` が `'unsafe-inline'` を持つこと。**残り 6 行を検査しないのは、消えれば
画面が自分で言うからである**（script や default が止まれば窓が空になる）。この 3 つは違う:
CSP に弾かれた IPC は `window.ipc.postMessage` へ自動で落ちて全コマンドが動き続け、作図結果 は色だけを
失い、編集部品 は文字を保ったまま配置を失う。**どれも例外を投げない。**

**値そのものは検査しない。**方針を丸ごと書いた試験は設定の写しであり、設定は既にそれ自身の記録である。

## Consequences

- 望ましい帰結
  - **外部オリジンを読む機能は、書き足す前に必ずこの 1 行を通る。**起票が求めていたのはこれで、
    「そうした機能を足す前に有効化する」がここで満たされる。
  - **AC #4 の答えが値そのものになる。**絞る宣言 の 5 行が、将来どの能力を足すときに何を緩めるかを
    directive 名で述べている。散文の一覧と違い、緩め忘れれば動かないので古くならない。
- 費用・制約
  - **`'unsafe-inline'` は `style-src` 全体に効く。**この 1 語は mermaid と Ace のために入るが、
    Atlas 自身のコードが `setAttribute("style", …)` や実行時の `<style>` を使ってよいことにもなる。
    **実測時点で Atlas はどちらも使っていない**（`'unsafe-inline'` 無しでも全画面 0 件だった）ので、
    この語が守っているのは vendored な 2 つだけである。
  - **経路の source は Atlas が測っていない。**間違っていても画面は動く（`postMessage` へ落ちる）ので、
    気づく機構は `csp.rs` の試験と、ビルドしたアプリの console しかない。
  - **測った作図は flowchart 1 種だけである。**sequence・gantt・architecture などが別の source を
    要求しないことは確かめていない。作図の種類が増えて描かれない報告が出たら、まずここを疑う。
  - `pnpm tauri dev` に CSP は当たらないので、**開発中に違反が出ないことは何の保証にもならない。**
- 後続への影響
  - **TASK-102（パブリック化と v0.1.0 公開）**は、CSP が入った状態のビルドを公開する。本決定は
    公開前に済ませる項目として起票されたものなので、ここで閉じる。
  - **TASK-105（GUI E2E。m-3）**は、通す経路に 整形表示 と 編集セッション を含む。**E2E を出荷形で
    走らせるなら CSP ごと通る**ので、上の実測が E2E に吸収できるかをそこで判断してよい。
  - **decision-25 の「TASK-98 の選択は 2 つ」は本決定が閉じる。**反転ではなく、片方が成り立たないと
    実測で分かったことによる確定である。doc-11 §14.5 の同じ記述も本 PR で直した。
